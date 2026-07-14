import os
import sys
from sqlalchemy.orm import Session
from database import engine, SessionLocal, Base
import models
from celery_worker import process_bulk_upload_task

def run_verification():
    print("=== Wority Intelligence System Verification ===")
    
    # 1. Ensure database tables exist
    print("Initializing Database tables...")
    Base.metadata.drop_all(bind=engine)  # Reset for testing
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")
    
    db: Session = SessionLocal()
    try:
        # Check users
        print("Creating mock admin user...")
        admin = models.User(email="admin@woritytechnology.com", hashed_password="hashed_pw_here", role="Admin", full_name="Admin Wority")
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"Admin created with ID: {admin.id}")

        # Seed settings
        print("Seeding default settings...")
        auto_pilot_setting = models.Setting(key="auto_pilot", value=True)
        db.add(auto_pilot_setting)
        db.commit()

        # 2. Trigger bulk processing flow manually (bypassing celery daemon queue to run synchronously)
        print("\nIngesting mock bulk requirements text...")
        bulk_text = """
RFP: AI-Powered Customer Agent for Logistics Corp
Company: Logistics Corp
Website: logisticscorp.com
Email: procurement@logisticscorp.com
Looking for a vendor to build an Agentic AI Voice agent and chatbot for shipment dispatch automation. Budget: $50k.

---
Job ID: React-Dev-999
Company: Retail Brands
Hiring a Frontend Engineer specializing in React and Tailwind CSS for a 3-month contract. Apply at hiring@retailbrands.com

---
RFP: AI-Powered Customer Agent for Logistics Corp
Company: Logistics Corp
Website: logisticscorp.com
Email: procurement@logisticscorp.com
Looking for a vendor to build an Agentic AI Voice agent and chatbot for shipment dispatch automation. Budget: $50k.
"""
        # Run bulk upload task directly (synchronously)
        print("Running pipeline parser task...")
        process_bulk_upload_task(bulk_text, uploaded_by_id=admin.id)
        
        # 3. Verify results
        print("\nVerifying database records...")
        
        # Check requirements
        reqs = db.query(models.Requirement).all()
        print(f"Total uploaded requirements: {len(reqs)}")
        assert len(reqs) == 1, "Requirement should be saved"

        # Check companies
        comps = db.query(models.Company).all()
        print(f"Enriched companies in CRM: {len(comps)}")
        for c in comps:
            print(f"  - Company: {c.name}, Industry: {c.industry}, Employees: {c.employees}, AI Maturity: {c.ai_adoption}")
            
        # Check contacts
        conts = db.query(models.Contact).all()
        print(f"Enriched decision maker contacts in CRM: {len(conts)}")
        for c in conts:
            print(f"  - Contact: {c.full_name}, Role: {c.designation}, Email: {c.email}, Priority: {c.priority_score}")

        # Check duplicate logs
        dups = db.query(models.DuplicateLog).all()
        print(f"Duplicate checks triggered: {len(dups)}")
        for d in dups:
            print(f"  - Duplicate skipped reason: '{d.duplicate_reason}'")
        assert len(dups) == 1, "The third item should be caught as a duplicate"

        # Check opportunities
        opps = db.query(models.Opportunity).all()
        print(f"Qualified Opportunities in Pipeline: {len(opps)}")
        for opp in opps:
            print(f"  - Title: {opp.title}")
            print(f"    Classification: {opp.classification}")
            print(f"    Can Deliver: {opp.can_deliver} ({opp.delivery_confidence}% Confidence)")
            print(f"    Service Mappings: {opp.service_mapping}")
            print(f"    Match Score: {opp.overall_score}%, Rank: {opp.rank}")
            print(f"    Status: {opp.status}")
        
        assert len(opps) == 2, "There should be exactly 2 unique opportunities processed"
        
        # Check outreach emails
        emails = db.query(models.Email).all()
        print(f"Generated Personalized outreach emails: {len(emails)}")
        for e in emails:
            print(f"  - Recipient: {e.contact.full_name} ({e.contact.email})")
            print(f"    Subject: {e.subject}")
            print(f"    Preview: {e.body[:150]}...")

        # Check proposals
        props = db.query(models.ProposalHistory).all()
        print(f"Generated Proposal drafts: {len(props)}")
        for p in props:
            print(f"  - Solution: {p.recommended_solution[:100]}...")
            print(f"    Timeline: {p.timeline[:100]}...")
            print(f"    Estimate: {p.estimated_cost_range}")
            
        # Check audit logs
        logs = db.query(models.ResearchLog).all()
        print(f"System Audit logs generated: {len(logs)}")
        
        print("\n=== SYSTEM VERIFICATION SUCCESSFUL ===")
        return True
        
    except Exception as e:
        print(f"\nVerification Failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
