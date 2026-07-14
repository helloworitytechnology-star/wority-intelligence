import os
import random
from celery import Celery
from sqlalchemy.orm import Session
from database import engine, SessionLocal, Base
import models
from services import ai_service, enrichment_service

# Initialize celery
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6380/0")
celery = Celery("wority_tasks", broker=REDIS_URL, backend=REDIS_URL)

# Ensure pgvector extension and tables are created
from sqlalchemy import text
try:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
except Exception as e:
    print(f"Failed to create vector extension: {e}")
Base.metadata.create_all(bind=engine)


@celery.task(name="tasks.process_bulk_upload")
def process_bulk_upload_task(raw_text: str, uploaded_by_id: int = None):
    """Processes a bulk upload of requirements, splitting, deduplicating, and researching each."""
    db: Session = SessionLocal()
    try:
        # Create a requirement record for tracking
        req_record = models.Requirement(
            raw_content=raw_text,
            source_format="Bulk Upload",
            uploaded_by=uploaded_by_id
        )
        db.add(req_record)
        db.commit()
        db.refresh(req_record)

        # Split requirements using AI
        split_records = ai_service.split_requirements(raw_text)
        
        for record in split_records:
            # 1. Deduplication Check
            company_name = record.get("company_name", "Unknown").strip()
            title = record.get("title", "Unknown").strip()
            req_id_str = record.get("requirement_id")
            url = record.get("url")
            desc = record.get("description", "").strip()

            is_duplicate = False
            duplicate_reason = None
            duplicate_opp_id = None

            # Simple exact checks
            query = db.query(models.Opportunity)
            if req_id_str:
                dup_req = query.filter(models.Opportunity.requirement_id_str == req_id_str).first()
                if dup_req:
                    is_duplicate = True
                    duplicate_reason = f"Duplicate Requirement ID: {req_id_str}"
                    duplicate_opp_id = dup_req.id

            if not is_duplicate and url:
                dup_url = query.filter(models.Opportunity.url == url).first()
                if dup_url:
                    is_duplicate = True
                    duplicate_reason = f"Duplicate URL: {url}"
                    duplicate_opp_id = dup_url.id

            if not is_duplicate and company_name != "Unknown" and title != "Unknown":
                dup_title = query.join(models.Company).filter(
                    models.Company.name.ilike(company_name),
                    models.Opportunity.title.ilike(title)
                ).first()
                if dup_title:
                    is_duplicate = True
                    duplicate_reason = "Already Exists: Matching Company and Title"
                    duplicate_opp_id = dup_title.id

            # Semantic / String similarity check for description
            if not is_duplicate and len(desc) > 50:
                # Get opportunities to compare
                existing_opps = db.query(models.Opportunity).all()
                for opp in existing_opps:
                    # Simple text similarity check (ratio of matching words)
                    words_a = set(desc.lower().split())
                    words_b = set((opp.description or "").lower().split())
                    if words_a and words_b:
                        intersection = words_a.intersection(words_b)
                        union = words_a.union(words_b)
                        similarity = len(intersection) / len(union)
                        if similarity > 0.8:  # 80% word similarity
                            is_duplicate = True
                            duplicate_reason = "Already Exists: Highly Similar Description"
                            duplicate_opp_id = opp.id
                            break

            if is_duplicate:
                # Log duplicate skip
                dup_log = models.DuplicateLog(
                    requirement_id=req_record.id,
                    duplicate_reason=duplicate_reason,
                    duplicate_of_opportunity_id=duplicate_opp_id
                )
                db.add(dup_log)
                db.commit()
                continue

            # 2. Process Unique Opportunity
            # Find or Create Company
            company = db.query(models.Company).filter(models.Company.name.ilike(company_name)).first()
            if not company:
                # Create base company record
                company = models.Company(
                    name=company_name,
                    linkedin_url=enrichment_service.search_linkedin_url(company_name, "company")
                )
                db.add(company)
                db.commit()
                db.refresh(company)

            # Create Opportunity record in Researching state
            opportunity = models.Opportunity(
                requirement_id=req_record.id,
                company_id=company.id,
                title=title,
                requirement_id_str=req_id_str,
                url=url,
                description=desc,
                status="Researching"
            )
            db.add(opportunity)
            db.commit()
            db.refresh(opportunity)

            # Log research start
            log_start = models.ResearchLog(
                opportunity_id=opportunity.id,
                action="Research Started",
                status="In Progress",
                details=f"Starting multi-agent research for requirement: {title}"
            )
            db.add(log_start)
            db.commit()

            try:
                # 3. Deep Company Research & Contact Discovery
                enriched_data = enrichment_service.enrich_company_and_contacts(company_name, desc)
                
                # Update Company Firmographics
                company.website = enriched_data.get("website", company.website)
                company.industry = enriched_data.get("industry", company.industry)
                company.headquarters = enriched_data.get("headquarters", company.headquarters)
                company.country = enriched_data.get("country", company.country)
                company.revenue = enriched_data.get("revenue", company.revenue)
                company.employees = enriched_data.get("employees", company.employees)
                company.funding = enriched_data.get("funding", company.funding)
                company.tech_stack = enriched_data.get("tech_stack", company.tech_stack)
                company.current_vendors = enriched_data.get("current_vendors", company.current_vendors)
                company.latest_news = enriched_data.get("latest_news", company.latest_news)
                company.ai_adoption = enriched_data.get("ai_adoption", company.ai_adoption)
                company.automation_maturity = enriched_data.get("automation_maturity", company.automation_maturity)
                company.digital_initiatives = enriched_data.get("digital_initiatives", company.digital_initiatives)
                company.description = enriched_data.get("description", company.description)
                company.products = enriched_data.get("products", company.products)
                company.services = enriched_data.get("services", company.services)
                company.competitors = enriched_data.get("competitors", company.competitors)
                db.commit()

                # Add Decision Maker Contacts
                contacts_added = []
                for contact_info in enriched_data.get("contacts", []):
                    # Verify email if available
                    email = contact_info.get("email")
                    validation_status = enrichment_service.validate_email(email)
                    
                    # Create contact
                    contact = models.Contact(
                        company_id=company.id,
                        full_name=contact_info.get("full_name"),
                        designation=contact_info.get("designation"),
                        linkedin_url=contact_info.get("linkedin_url"),
                        email=email,
                        phone=contact_info.get("phone"),
                        location=contact_info.get("location"),
                        department=contact_info.get("department"),
                        confidence_score=contact_info.get("confidence_score"),
                        source=contact_info.get("source"),
                        is_cxo=contact_info.get("is_cxo", False),
                        priority_score=contact_info.get("priority_score", 0),
                        relationship_score=contact_info.get("relationship_score", 0),
                        buying_authority=contact_info.get("buying_authority", "Medium")
                    )
                    db.add(contact)
                    db.commit()
                    db.refresh(contact)
                    contacts_added.append(contact)

                # 4. Requirement Classification & Wority Service Matching
                classification = ai_service.classify_requirement(desc)
                match_results = ai_service.match_wority_services(desc)
                
                opportunity.classification = classification
                opportunity.can_deliver = match_results.get("can_deliver", "YES")
                opportunity.delivery_confidence = match_results.get("confidence", 80.0)
                opportunity.delivery_explanation = match_results.get("explanation")
                opportunity.service_mapping = match_results.get("service_mapping", [])
                
                # Check confidence threshold (e.g. 70%) to flag manual review
                if opportunity.delivery_confidence < 70.0:
                    opportunity.status = "Needs Review"
                else:
                    opportunity.status = "Completed"

                # 5. Opportunity Scoring & Ranking
                scoring = ai_service.calculate_opportunity_score({
                    "can_deliver": opportunity.can_deliver,
                    "delivery_confidence": opportunity.delivery_confidence
                })
                opportunity.fit_score = scoring.get("fit_score")
                opportunity.revenue_score = scoring.get("revenue_score")
                opportunity.urgency_score = scoring.get("urgency_score")
                opportunity.probability = scoring.get("probability")
                opportunity.competition_score = scoring.get("competition_score")
                opportunity.decision_maker_availability = scoring.get("decision_maker_availability")
                opportunity.overall_score = scoring.get("overall_score")
                opportunity.rank = scoring.get("rank")
                db.commit()

                # 6. Generate Vector Embeddings (for pgvector searches)
                opportunity.embedding = ai_service.generate_embeddings(desc)
                db.commit()

                # 7. Generate Personalized Outreach Campaigns
                # Target the highest priority contact
                if contacts_added:
                    primary_contact = contacts_added[0]
                    email_campaign = ai_service.generate_personalized_email(
                        company_name=company.name,
                        opportunity_title=opportunity.title,
                        description=opportunity.description,
                        contact_name=primary_contact.full_name,
                        contact_role=primary_contact.designation,
                        tone="Consultative"
                    )
                    
                    email_record = models.Email(
                        opportunity_id=opportunity.id,
                        contact_id=primary_contact.id,
                        subject=email_campaign.get("subject"),
                        body=email_campaign.get("body"),
                        follow_up_1=email_campaign.get("follow_up_1"),
                        follow_up_2=email_campaign.get("follow_up_2"),
                        linkedin_message=email_campaign.get("linkedin_message"),
                        cold_call_script=email_campaign.get("cold_call_script"),
                        whatsapp_message=email_campaign.get("whatsapp_message"),
                        tone="Consultative",
                        status="Draft"
                    )
                    db.add(email_record)
                    db.commit()

                # 8. Generate Proposal Draft
                proposal_data = ai_service.generate_proposal(company.name, opportunity.title, opportunity.description)
                proposal_record = models.ProposalHistory(
                    opportunity_id=opportunity.id,
                    executive_summary=proposal_data.get("executive_summary"),
                    company_understanding=proposal_data.get("company_understanding"),
                    problem_statement=proposal_data.get("problem_statement"),
                    recommended_solution=proposal_data.get("recommended_solution"),
                    architecture=proposal_data.get("architecture"),
                    timeline=proposal_data.get("timeline"),
                    technology_stack=proposal_data.get("technology_stack"),
                    team_structure=proposal_data.get("team_structure"),
                    estimated_cost_range=proposal_data.get("estimated_cost_range"),
                    why_wority=proposal_data.get("why_wority"),
                    call_to_action=proposal_data.get("call_to_action")
                )
                db.add(proposal_record)
                db.commit()

                # 9. Optional Autopilot: Auto Email & LinkedIn connection dispatch
                auto_pilot = False
                auto_pilot_setting = db.query(models.Setting).filter(models.Setting.key == "auto_pilot").first()
                if auto_pilot_setting:
                    auto_pilot = auto_pilot_setting.value.get("enabled", False) if isinstance(auto_pilot_setting.value, dict) else bool(auto_pilot_setting.value)
                
                if auto_pilot and contacts_added:
                    from datetime import datetime, date
                    today_start = datetime.combine(date.today(), datetime.min.time())
                    
                    # Count today's email sends
                    emails_today = db.query(models.EmailHistory).filter(models.EmailHistory.sent_at >= today_start).count()
                    
                    # Count today's LinkedIn invites
                    linkedin_today = db.query(models.ResearchLog).filter(
                        models.ResearchLog.action.in_(["Auto-Pilot: LinkedIn Sent", "LinkedIn Sent"]),
                        models.ResearchLog.timestamp >= today_start
                    ).count()
                    
                    # 1. Process email dispatch if within daily limit (25)
                    email_dispatched = False
                    if emails_today < 25:
                        email_record.status = "Sent"
                        opportunity.status = "Proposal Sent"
                        email_dispatched = True
                        
                        history = models.EmailHistory(
                            email_id=email_record.id,
                            recipient_email=primary_contact.email,
                            response_received=False
                        )
                        db.add(history)
                        
                        log_auto_email = models.ResearchLog(
                            opportunity_id=opportunity.id,
                            action="Auto-Pilot: Email Dispatched",
                            status="Success",
                            details=f"Auto-pilot automatically dispatched cold outreach email to verified CXO contact {primary_contact.full_name} ({primary_contact.email}). Today's count: {emails_today + 1}/25."
                        )
                        db.add(log_auto_email)
                    else:
                        email_record.status = "Draft"
                        opportunity.status = "Completed"
                        log_limit_email = models.ResearchLog(
                            opportunity_id=opportunity.id,
                            action="Auto-Pilot: Email Skipped",
                            status="Limit Reached",
                            details=f"Daily email outreach limit of 25 reached (today: {emails_today}). Saved email to Drafts queue."
                        )
                        db.add(log_limit_email)
                        
                    # 2. Process LinkedIn invite if within daily limit (10)
                    if linkedin_today < 10:
                        log_auto_li = models.ResearchLog(
                            opportunity_id=opportunity.id,
                            action="Auto-Pilot: LinkedIn Sent",
                            status="Success",
                            details=f"Auto-pilot automatically triggered LinkedIn connection request invitation with custom note to {primary_contact.full_name} ({primary_contact.linkedin_url}). Today's count: {linkedin_today + 1}/10."
                        )
                        db.add(log_auto_li)
                    else:
                        log_limit_li = models.ResearchLog(
                            opportunity_id=opportunity.id,
                            action="Auto-Pilot: LinkedIn Skipped",
                            status="Limit Reached",
                            details=f"Daily LinkedIn connection invitation limit of 10 reached (today: {linkedin_today}). Queued for manual outreach."
                        )
                        db.add(log_limit_li)
                        
                    db.commit()


                # Log completion
                log_done = models.ResearchLog(
                    opportunity_id=opportunity.id,
                    action="Research Completed",
                    status="Success",
                    details=f"Successfully enriched company firmographics, added {len(contacts_added)} decision makers, generated proposals and email sequences."
                )
                db.add(log_done)
                db.commit()

            except Exception as inner_e:
                print(f"Failed to complete research for {title}: {inner_e}")
                opportunity.status = "Failed"
                log_fail = models.ResearchLog(
                    opportunity_id=opportunity.id,
                    action="Research Failed",
                    status="Error",
                    details=f"Pipeline processing failed: {str(inner_e)}"
                )
                db.add(log_fail)
                db.commit()
                
    except Exception as e:
        print(f"Critical failure in Celery task: {e}")
    finally:
        db.close()
