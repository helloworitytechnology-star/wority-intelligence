from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Float, JSON, func
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(String, default="User")  # Admin, User
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    website = Column(String)
    industry = Column(String)
    headquarters = Column(String)
    country = Column(String)
    revenue = Column(String)
    employees = Column(String)
    funding = Column(String)
    tech_stack = Column(JSON, default=list)
    current_vendors = Column(JSON, default=list)
    latest_news = Column(JSON, default=list)
    ai_adoption = Column(Text)
    automation_maturity = Column(Text)
    digital_initiatives = Column(Text)
    linkedin_url = Column(String)
    description = Column(Text)
    products = Column(JSON, default=list)
    services = Column(JSON, default=list)
    competitors = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contacts = relationship("Contact", back_populates="company", cascade="all, delete-orphan")
    opportunities = relationship("Opportunity", back_populates="company", cascade="all, delete-orphan")

class Contact(Base):
    __tablename__ = "contacts"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    full_name = Column(String, index=True)
    designation = Column(String)
    linkedin_url = Column(String)
    email = Column(String)
    phone = Column(String)
    location = Column(String)
    department = Column(String)
    confidence_score = Column(Float, default=0.0)
    source = Column(String)
    is_cxo = Column(Boolean, default=False)
    priority_score = Column(Integer, default=0)
    relationship_score = Column(Integer, default=0)
    buying_authority = Column(String)  # High, Medium, Low
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="contacts")
    emails = relationship("Email", back_populates="contact", cascade="all, delete-orphan")

class Requirement(Base):
    __tablename__ = "requirements"
    id = Column(Integer, primary_key=True, index=True)
    raw_content = Column(Text, nullable=False)
    source_format = Column(String)  # Plain text, PDF, Web URL, LinkedIn URL
    source_url = Column(String)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    opportunities = relationship("Opportunity", back_populates="requirement")
    duplicate_logs = relationship("DuplicateLog", back_populates="requirement")

class Opportunity(Base):
    __tablename__ = "opportunities"
    id = Column(Integer, primary_key=True, index=True)
    requirement_id = Column(Integer, ForeignKey("requirements.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String, index=True)
    requirement_id_str = Column(String, unique=True, index=True, nullable=True)  # Tender no., Job ID
    project_name = Column(String)
    url = Column(String)
    posting_date = Column(String)
    classification = Column(String)  # RFP, RFI, Hiring, Tender, etc.
    description = Column(Text)
    can_deliver = Column(String)  # YES, NO, PARTIAL
    delivery_confidence = Column(Float, default=0.0)
    delivery_explanation = Column(Text)
    recommended_partner = Column(String)
    service_mapping = Column(JSON, default=list)  # AI Automation, etc.
    fit_score = Column(Float, default=0.0)
    revenue_score = Column(Float, default=0.0)
    urgency_score = Column(Float, default=0.0)
    probability = Column(Float, default=0.0)
    competition_score = Column(Float, default=0.0)
    decision_maker_availability = Column(Float, default=0.0)
    overall_score = Column(Float, default=0.0)
    rank = Column(String)  # A+, A, B, C, D
    status = Column(String, default="New")  # Won, Lost, Proposal Sent, Meeting Scheduled, No Response, New, Researching, Completed
    last_contact = Column(DateTime, nullable=True)
    next_follow_up = Column(DateTime, nullable=True)
    notes = Column(Text)
    embedding = Column(Vector(1536), nullable=True)  # For semantic similarity searches (pgvector)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    requirement = relationship("Requirement", back_populates="opportunities")
    company = relationship("Company", back_populates="opportunities")
    emails = relationship("Email", back_populates="opportunity", cascade="all, delete-orphan")
    proposals = relationship("ProposalHistory", back_populates="opportunity", cascade="all, delete-orphan")
    logs = relationship("ResearchLog", back_populates="opportunity", cascade="all, delete-orphan")

class Email(Base):
    __tablename__ = "emails"
    id = Column(Integer, primary_key=True, index=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=False)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True)
    subject = Column(String)
    body = Column(Text)
    follow_up_1 = Column(Text)
    follow_up_2 = Column(Text)
    linkedin_message = Column(Text)
    cold_call_script = Column(Text)
    whatsapp_message = Column(Text)
    tone = Column(String)  # Professional, Consultative, Executive, Human
    status = Column(String, default="Draft")  # Draft, Approved, Sent, Failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    opportunity = relationship("Opportunity", back_populates="emails")
    contact = relationship("Contact", back_populates="emails")
    history = relationship("EmailHistory", back_populates="email", cascade="all, delete-orphan")

class ProposalHistory(Base):
    __tablename__ = "proposal_history"
    id = Column(Integer, primary_key=True, index=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=False)
    executive_summary = Column(Text)
    company_understanding = Column(Text)
    problem_statement = Column(Text)
    recommended_solution = Column(Text)
    architecture = Column(Text)
    timeline = Column(Text)
    technology_stack = Column(JSON, default=list)
    team_structure = Column(Text)
    estimated_cost_range = Column(String)
    why_wority = Column(Text)
    call_to_action = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    opportunity = relationship("Opportunity", back_populates="proposals")

class EmailHistory(Base):
    __tablename__ = "email_history"
    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"), nullable=False)
    sent_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    recipient_email = Column(String)
    response_received = Column(Boolean, default=False)
    response_content = Column(Text)
    response_sentiment = Column(String, nullable=True)
    response_at = Column(DateTime(timezone=True), nullable=True)

    email = relationship("Email", back_populates="history")

class DuplicateLog(Base):
    __tablename__ = "duplicate_logs"
    id = Column(Integer, primary_key=True, index=True)
    requirement_id = Column(Integer, ForeignKey("requirements.id"), nullable=False)
    duplicate_reason = Column(String)
    duplicate_of_opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    requirement = relationship("Requirement", back_populates="duplicate_logs")

class ResearchLog(Base):
    __tablename__ = "research_logs"
    id = Column(Integer, primary_key=True, index=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=True)
    action = Column(String)
    status = Column(String)
    details = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    opportunity = relationship("Opportunity", back_populates="logs")

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(JSON, default=dict)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

