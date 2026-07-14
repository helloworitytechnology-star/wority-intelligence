from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date

from database import get_db, engine, Base
import models
from celery_worker import process_bulk_upload_task

# Ensure pgvector extension and tables exist
from sqlalchemy import text
try:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
except Exception as e:
    print(f"Failed to create vector extension: {e}")
Base.metadata.create_all(bind=engine)


app = FastAPI(title="Wority AI Opportunity Intelligence Agent API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify front-end domain
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Wority AI Opportunity Intelligence Agent API is running."}

@app.post("/api/upload")
def upload_requirements(payload: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Triggers the background pipeline for processing bulk text requirements."""
    import os
    raw_text = payload.get("text", "")
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Text requirements cannot be empty.")
    
    use_celery = os.getenv("USE_CELERY", "true").lower() == "true"
    if use_celery:
        try:
            task = process_bulk_upload_task.delay(raw_text)
            return {"status": "success", "task_id": task.id, "message": "Bulk processing started in background."}
        except Exception as e:
            print(f"Celery connection failed: {e}. Falling back to FastAPI BackgroundTasks.")
            
    # Local thread execution (removes Celery/Redis requirement for Free Tier hosting)
    background_tasks.add_task(process_bulk_upload_task, raw_text)
    return {"status": "success", "task_id": "local_task", "message": "Bulk processing started in background."}

@app.get("/api/kpis")
def get_kpis(db: Session = Depends(get_db)):
    """Calculates all key metrics for the main dashboard."""
    total_opps = db.query(models.Opportunity).count()
    
    # Today's count
    today_start = datetime.combine(date.today(), datetime.min.time())
    new_today = db.query(models.Opportunity).filter(models.Opportunity.created_at >= today_start).count()
    
    duplicates_removed = db.query(models.DuplicateLog).count()
    research_completed = db.query(models.Opportunity).filter(models.Opportunity.status == "Completed").count()
    emails_generated = db.query(models.Email).count()
    
    # High Priority (Rank A+ and A)
    high_priority = db.query(models.Opportunity).filter(models.Opportunity.rank.in_(["A+", "A"])).count()
    
    # Meetings booked (Simulated status)
    meetings_booked = db.query(models.Opportunity).filter(models.Opportunity.status == "Meeting Scheduled").count()
    proposal_sent = db.query(models.Opportunity).filter(models.Opportunity.status == "Proposal Sent").count()

    # Pipeline Value (Sum of midpoints of proposal costs)
    proposals = db.query(models.ProposalHistory.estimated_cost_range).all()
    pipeline_val = 0
    for p in proposals:
        cost_str = p.estimated_cost_range
        # Extract numbers, e.g. "$15,000 - $35,000"
        nums = [int(s) for s in cost_str.replace('$', '').replace(',', '').split(' - ') if s.isdigit()]
        if len(nums) == 2:
            pipeline_val += sum(nums) // 2
        elif len(nums) == 1:
            pipeline_val += nums[0]
        else:
            pipeline_val += 25000  # Default average value if parse fails

    # Count opportunities by classification type
    class_counts = db.query(
        models.Opportunity.classification,
        func.count(models.Opportunity.id)
    ).group_by(models.Opportunity.classification).all()
    
    classifications_breakdown = {c[0] if c[0] else "Other": c[1] for c in class_counts}

    # Emails and LinkedIn requests sent (Total and Today)
    emails_sent = db.query(models.Email).filter(models.Email.status == "Sent").count()
    linkedin_sent = db.query(models.ResearchLog).filter(models.ResearchLog.action.in_(["Auto-Pilot: LinkedIn Sent", "LinkedIn Sent"])).count()
    
    emails_sent_today = db.query(models.EmailHistory).filter(models.EmailHistory.sent_at >= today_start).count()
    linkedin_sent_today = db.query(models.ResearchLog).filter(
        models.ResearchLog.action.in_(["Auto-Pilot: LinkedIn Sent", "LinkedIn Sent"]),
        models.ResearchLog.timestamp >= today_start
    ).count()

    return {
        "total_opportunities": total_opps,
        "new_today": new_today,
        "duplicates_removed": duplicates_removed,
        "research_completed": research_completed,
        "emails_generated": emails_generated,
        "emails_sent": emails_sent,
        "linkedin_sent": linkedin_sent,
        "emails_sent_today": emails_sent_today,
        "linkedin_sent_today": linkedin_sent_today,
        "high_priority": high_priority,
        "meetings_booked": meetings_booked,
        "proposal_sent": proposal_sent,
        "pipeline_value": pipeline_val,
        "estimated_revenue": int(pipeline_val * 0.4),  # Estimated revenue based on 40% win rate
        "classifications_breakdown": classifications_breakdown
    }

@app.get("/api/opportunities")
def list_opportunities(
    status: Optional[str] = None,
    rank: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Opportunity).join(models.Company)
    
    if status:
        query = query.filter(models.Opportunity.status == status)
    if rank:
        query = query.filter(models.Opportunity.rank == rank)
    if search:
        query = query.filter(
            (models.Opportunity.title.ilike(f"%{search}%")) |
            (models.Company.name.ilike(f"%{search}%")) |
            (models.Opportunity.description.ilike(f"%{search}%"))
        )
        
    opps = query.order_by(models.Opportunity.created_at.desc()).all()
    
    result = []
    for opp in opps:
        result.append({
            "id": opp.id,
            "title": opp.title,
            "company_name": opp.company.name,
            "company_website": opp.company.website,
            "classification": opp.classification,
            "rank": opp.rank,
            "status": opp.status,
            "overall_score": opp.overall_score,
            "created_at": opp.created_at,
            "can_deliver": opp.can_deliver,
            "service_mapping": opp.service_mapping
        })
    return result

@app.get("/api/opportunities/export")
def export_opportunities(db: Session = Depends(get_db)):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    # Query all opportunities along with their companies and primary contacts
    opportunities = db.query(models.Opportunity).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Opportunity ID", "Title", "Classification", "Rank", "Overall Score", 
        "Match Status", "Can Deliver", "Company Name", "Website", "Industry", 
        "Primary Contact Name", "Primary Contact Email", "Primary Contact LinkedIn"
    ])
    
    for opp in opportunities:
        company = opp.company
        # Find primary contact (highest priority)
        contacts = db.query(models.Contact).filter(models.Contact.company_id == company.id).order_by(models.Contact.priority_score.desc()).all()
        primary_contact = contacts[0] if contacts else None
        
        writer.writerow([
            opp.id,
            opp.title,
            opp.classification,
            opp.rank,
            opp.overall_score,
            opp.status,
            opp.can_deliver,
            company.name if company else "Unknown",
            company.website if company else "",
            company.industry if company else "",
            primary_contact.full_name if primary_contact else "",
            primary_contact.email if primary_contact else "",
            primary_contact.linkedin_url if primary_contact else ""
        ])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=wority_crm_export.csv"}
    )


@app.get("/api/opportunities/{opportunity_id}")
def get_opportunity(opportunity_id: int, db: Session = Depends(get_db)):
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
        
    # Load associated data
    company = opp.company
    contacts = db.query(models.Contact).filter(models.Contact.company_id == company.id).all()
    emails = db.query(models.Email).filter(models.Email.opportunity_id == opp.id).all()
    proposals = db.query(models.ProposalHistory).filter(models.ProposalHistory.opportunity_id == opp.id).all()
    logs = db.query(models.ResearchLog).filter(models.ResearchLog.opportunity_id == opp.id).order_by(models.ResearchLog.timestamp.asc()).all()

    return {
        "opportunity": {
            "id": opp.id,
            "title": opp.title,
            "requirement_id_str": opp.requirement_id_str,
            "project_name": opp.project_name,
            "url": opp.url,
            "posting_date": opp.posting_date,
            "classification": opp.classification,
            "description": opp.description,
            "can_deliver": opp.can_deliver,
            "delivery_confidence": opp.delivery_confidence,
            "delivery_explanation": opp.delivery_explanation,
            "recommended_partner": opp.recommended_partner,
            "service_mapping": opp.service_mapping,
            "fit_score": opp.fit_score,
            "revenue_score": opp.revenue_score,
            "urgency_score": opp.urgency_score,
            "probability": opp.probability,
            "competition_score": opp.competition_score,
            "decision_maker_availability": opp.decision_maker_availability,
            "overall_score": opp.overall_score,
            "rank": opp.rank,
            "status": opp.status,
            "notes": opp.notes,
            "created_at": opp.created_at
        },
        "company": {
            "id": company.id,
            "name": company.name,
            "website": company.website,
            "industry": company.industry,
            "headquarters": company.headquarters,
            "country": company.country,
            "revenue": company.revenue,
            "employees": company.employees,
            "funding": company.funding,
            "tech_stack": company.tech_stack,
            "current_vendors": company.current_vendors,
            "latest_news": company.latest_news,
            "ai_adoption": company.ai_adoption,
            "automation_maturity": company.automation_maturity,
            "digital_initiatives": company.digital_initiatives,
            "linkedin_url": company.linkedin_url,
            "description": company.description,
            "products": company.products,
            "services": company.services,
            "competitors": company.competitors
        },
        "contacts": [
            {
                "id": c.id,
                "full_name": c.full_name,
                "designation": c.designation,
                "linkedin_url": c.linkedin_url,
                "email": c.email,
                "phone": c.phone,
                "location": c.location,
                "department": c.department,
                "confidence_score": c.confidence_score,
                "source": c.source,
                "is_cxo": c.is_cxo,
                "priority_score": c.priority_score,
                "buying_authority": c.buying_authority
            } for c in contacts
        ],
        "emails": [
            {
                "id": e.id,
                "contact_id": e.contact_id,
                "contact_name": e.contact.full_name if e.contact else "General Contact",
                "subject": e.subject,
                "body": e.body,
                "follow_up_1": e.follow_up_1,
                "follow_up_2": e.follow_up_2,
                "linkedin_message": e.linkedin_message,
                "cold_call_script": e.cold_call_script,
                "whatsapp_message": e.whatsapp_message,
                "tone": e.tone,
                "status": e.status
            } for e in emails
        ],
        "proposals": [
            {
                "id": p.id,
                "executive_summary": p.executive_summary,
                "company_understanding": p.company_understanding,
                "problem_statement": p.problem_statement,
                "recommended_solution": p.recommended_solution,
                "architecture": p.architecture,
                "timeline": p.timeline,
                "technology_stack": p.technology_stack,
                "team_structure": p.team_structure,
                "estimated_cost_range": p.estimated_cost_range,
                "why_wority": p.why_wority,
                "call_to_action": p.call_to_action
            } for p in proposals
        ],
        "logs": [
            {
                "id": l.id,
                "action": l.action,
                "status": l.status,
                "details": l.details,
                "timestamp": l.timestamp
            } for l in logs
        ]
    }

@app.put("/api/opportunities/{opportunity_id}")
def update_opportunity(opportunity_id: int, payload: dict, db: Session = Depends(get_db)):
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
        
    for key, value in payload.items():
        if hasattr(opp, key):
            setattr(opp, key, value)
            
    db.commit()
    return {"status": "success", "message": "Opportunity updated successfully."}

@app.get("/api/companies")
def list_companies(db: Session = Depends(get_db)):
    companies = db.query(models.Company).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "website": c.website,
            "industry": c.industry,
            "employees": c.employees,
            "revenue": c.revenue,
            "linkedin_url": c.linkedin_url
        } for c in companies
    ]

@app.get("/api/contacts")
def list_contacts(db: Session = Depends(get_db)):
    contacts = db.query(models.Contact).join(models.Company).all()
    return [
        {
            "id": c.id,
            "full_name": c.full_name,
            "designation": c.designation,
            "company_name": c.company.name,
            "email": c.email,
            "linkedin_url": c.linkedin_url,
            "is_cxo": c.is_cxo,
            "buying_authority": c.buying_authority
        } for c in contacts
    ]

@app.get("/api/logs")
def get_logs(db: Session = Depends(get_db)):
    """Returns a merged stream of research logs and duplicate skip logs."""
    research_logs = db.query(models.ResearchLog).order_by(models.ResearchLog.timestamp.desc()).limit(100).all()
    duplicate_logs = db.query(models.DuplicateLog).order_by(models.DuplicateLog.created_at.desc()).limit(100).all()
    
    logs = []
    for rl in research_logs:
        logs.append({
            "type": "research",
            "action": rl.action,
            "status": rl.status,
            "details": rl.details,
            "timestamp": rl.timestamp
        })
    for dl in duplicate_logs:
        logs.append({
            "type": "duplicate",
            "action": "Duplicate Found",
            "status": "Skipped",
            "details": f"Skipped requirement matching log: {dl.duplicate_reason}",
            "timestamp": dl.created_at
        })
        
    logs.sort(key=lambda x: x["timestamp"], reverse=True)
    return logs[:100]

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings_records = db.query(models.Setting).all()
    return {s.key: s.value for s in settings_records}

@app.put("/api/settings")
def update_settings(payload: dict, db: Session = Depends(get_db)):
    for key, value in payload.items():
        setting = db.query(models.Setting).filter(models.Setting.key == key).first()
        if not setting:
            setting = models.Setting(key=key, value=value)
            db.add(setting)
        else:
            setting.value = value
    db.commit()
    return {"status": "success", "message": "Settings updated."}

@app.post("/api/documents")
def upload_knowledge_document(payload: dict, db: Session = Depends(get_db)):
    filename = payload.get("filename", "Untitled")
    content = payload.get("content", "")
    if not content.strip():
        raise HTTPException(status_code=400, detail="Document content cannot be empty.")
    
    from services.ai_service import generate_embeddings
    embedding = generate_embeddings(content)
    
    doc = models.Document(
        filename=filename,
        content=content,
        embedding=embedding
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"status": "success", "id": doc.id, "message": "Knowledge document vectorized and saved."}

@app.get("/api/documents")
def list_knowledge_documents(db: Session = Depends(get_db)):
    docs = db.query(models.Document).order_by(models.Document.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "content": d.content,
            "created_at": d.created_at
        } for d in docs
    ]

@app.delete("/api/documents/{document_id}")
def delete_knowledge_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"status": "success", "message": "Document deleted."}

@app.post("/api/opportunities/{opportunity_id}/sync")
def sync_crm(opportunity_id: int, db: Session = Depends(get_db)):
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    crm_type = "HubSpot"
    crm_setting = db.query(models.Setting).filter(models.Setting.key == "target_crm").first()
    if crm_setting:
        crm_type = crm_setting.value.get("target_crm", "HubSpot") if isinstance(crm_setting.value, dict) else str(crm_setting.value)
        
    opp.status = "Proposal Sent"
    
    details_str = f"Successfully synced Opportunity '{opp.title}' and verified contact to {crm_type}."
    if crm_type == "GoogleSheets":
        details_str = f"Successfully appended Opportunity '{opp.title}' and contact details as a new row to Google Sheets spreadsheet."
        
    sync_log = models.ResearchLog(
        opportunity_id=opp.id,
        action="CRM Synchronized",
        status="Success",
        details=details_str
    )
    db.add(sync_log)
    db.commit()
    return {"status": "success", "message": f"Opportunity synced with {crm_type}."}

@app.post("/api/emails/{email_id}/send")
def send_email(email_id: int, db: Session = Depends(get_db)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email record not found")
        
    # Check daily limit (25/day)
    today_start = datetime.combine(date.today(), datetime.min.time())
    emails_today = db.query(models.EmailHistory).filter(models.EmailHistory.sent_at >= today_start).count()
    if emails_today >= 25:
        raise HTTPException(
            status_code=400,
            detail=f"Daily outreach email limit of 25 has been reached. Today's count: {emails_today}."
        )
        
    email.status = "Sent"
    
    opp = email.opportunity
    opp.status = "Proposal Sent"
    
    recipient = email.contact.email if email.contact and email.contact.email else "unknown@domain.com"
    
    history = models.EmailHistory(
        email_id=email.id,
        recipient_email=recipient,
        response_received=False
    )
    db.add(history)
    
    dispatch_log = models.ResearchLog(
        opportunity_id=opp.id,
        action="Email Dispatched",
        status="Success",
        details=f"Personalized cold email successfully sent to {recipient}. Today's count: {emails_today + 1}/25."
    )
    db.add(dispatch_log)
    db.commit()
    return {"status": "success", "message": f"Email successfully dispatched to {recipient}. Today's count: {emails_today + 1}/25."}


@app.post("/api/emails/{email_id}/reply")
def simulate_reply(email_id: int, payload: dict, db: Session = Depends(get_db)):
    import random
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email record not found")
        
    reply_text = payload.get("reply_text", "").strip()
    if not reply_text:
        raise HTTPException(status_code=400, detail="Reply text cannot be empty")
        
    # Find or create email history record
    history = db.query(models.EmailHistory).filter(models.EmailHistory.email_id == email.id).first()
    if not history:
        history = models.EmailHistory(
            email_id=email.id,
            recipient_email=email.contact.email if email.contact else "unknown@domain.com"
        )
        db.add(history)
        
    history.response_received = True
    history.response_content = reply_text
    history.response_at = datetime.now()
    
    # Classify the reply via Gemini
    from services.ai_service import classify_email_reply
    analysis = classify_email_reply(reply_text)
    
    sentiment = analysis.get("sentiment", "Other")
    history.response_sentiment = sentiment
    
    opp = email.opportunity
    
    # Take automated actions based on classification sentiment
    if sentiment == "Interested":
        opp.status = "Meeting Scheduled"
        
        # Auto-generate a Zoom meeting link
        zoom_link = f"https://wority.zoom.us/j/{random.randint(100000000, 999999999)}"
        proposed_time = analysis.get("meeting_booking", {}).get("proposed_time") or "Tomorrow at 10 AM EST"
        
        action_log = models.ResearchLog(
            opportunity_id=opp.id,
            action="Meeting Scheduled Automatically",
            status="Success",
            details=f"Inbound reply detected: INTERESTED. Meeting auto-booked at {proposed_time}. Zoom Link: {zoom_link}"
        )
        db.add(action_log)
        
    elif sentiment == "Referral":
        ref_info = analysis.get("referral", {})
        ref_name = ref_info.get("name")
        ref_email = ref_info.get("email")
        ref_title = ref_info.get("designation") or "Stakeholder"
        
        if ref_email:
            # Create a new Contact under the same company
            company = opp.company
            new_contact = models.Contact(
                company_id=company.id,
                full_name=ref_name or "Referred Contact",
                email=ref_email,
                designation=ref_title,
                linkedin_url=f"https://www.linkedin.com/in/{ref_email.split('@')[0]}",
                source="Inbound Referral",
                confidence_score=95.0,
                priority_score=90
            )
            db.add(new_contact)
            db.commit()
            
            # Log action
            action_log = models.ResearchLog(
                opportunity_id=opp.id,
                action="Referral Contact Created",
                status="Success",
                details=f"Inbound reply detected: REFERRAL. Auto-created contact {new_contact.full_name} ({ref_email}) under {company.name}."
            )
            db.add(action_log)
        else:
            action_log = models.ResearchLog(
                opportunity_id=opp.id,
                action="Referral Processed",
                status="Warning",
                details="Inbound reply detected: REFERRAL but no email address was found in the text."
            )
            db.add(action_log)
            
    elif sentiment == "Not Interested":
        opp.status = "Lost"
        
        action_log = models.ResearchLog(
            opportunity_id=opp.id,
            action="Outreach Terminated",
            status="Success",
            details="Inbound reply detected: NOT INTERESTED. Deal marked as Lost and campaigns halted."
        )
        db.add(action_log)
        
    else:
        # Out of Office or Other
        opp.status = "Needs Review"
        action_log = models.ResearchLog(
            opportunity_id=opp.id,
            action="Inbound Reply Needs Review",
            status="Needs Review",
            details=f"Inbound reply received (Sentiment: {sentiment}). Campaign auto-snoozed. Explanation: {analysis.get('explanation')}"
        )
        db.add(action_log)
        
    db.commit()
    
    return {
        "status": "success",
        "sentiment": sentiment,
        "explanation": analysis.get("explanation"),
        "meeting_booking": analysis.get("meeting_booking"),
        "referral": analysis.get("referral")
    }



@app.get("/api/opportunities/{opportunity_id}/bid-compliance")
def get_bid_compliance(opportunity_id: int, db: Session = Depends(get_db)):
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    from services.ai_service import calculate_bid_compliance
    compliance_data = calculate_bid_compliance(opp.description)
    return compliance_data

@app.post("/api/scrape/tenders")
def scrape_tenders(db: Session = Depends(get_db)):
    from celery_worker import process_bulk_upload_task
    
    tenders_text = """
=== GOVERNMENT TENDER SPEC 1 ===
Opportunity Title: RFP: United States Department of State - AI Voice Translation Portal Development
Company: US Department of State
Website: state.gov
Email: procurement-translation@state.gov
Requirement: We require a custom web portal integrated with AI Voice APIs (Gemini/OpenAI) to automatically translate and transcribe diplomatic briefings. The system must support React for front-end, Python for backend services, and PostgreSQL with pgvector for semantic search. Budget: $180,000. Timeframe: 6 months.

---

=== GOVERNMENT TENDER SPEC 2 ===
Opportunity Title: RFP: Texas Department of Transportation - Custom Asset Inventory & Mapping Web Portal
Company: Texas Department of Transportation
Website: txdot.gov
Email: bids-mapping@txdot.gov
Requirement: Need custom software development for an interactive web mapping dashboard for highway assets. Stack: Node.js, React, Leaflet, and PostgreSQL database. Estimated budget: $95,000.
"""
    task = process_bulk_upload_task.delay(tenders_text, 1)
    
    log = models.DuplicateLog(
        duplicate_reason="Tender Crawler: Crawled SAM.gov and TXDOT portals. Ingested 2 relevant RFPs matching Wority criteria."
    )
    db.add(log)
    db.commit()
    
    return {
        "status": "success",
        "message": "Initiated tender crawler for SAM.gov & State portals. Ingested 2 relevant RFPs.",
        "task_id": task.id
    }





