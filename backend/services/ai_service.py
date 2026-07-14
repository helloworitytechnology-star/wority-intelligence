import os
import json
import random
from dotenv import load_dotenv

load_dotenv()

# Attempt to import and configure LLM APIs
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

has_gemini = False
has_openai = False

if GEMINI_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_KEY)
        has_gemini = True
    except Exception as e:
        print(f"Failed to configure Gemini: {e}")

if OPENAI_KEY:
    try:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_KEY)
        has_openai = True
    except Exception as e:
        print(f"Failed to configure OpenAI: {e}")


def _call_llm(system_prompt: str, prompt: str, json_mode: bool = False, preferred_provider: str = None) -> str:
    """Helper to call Gemini, OpenAI, or return mock data depending on availability and preference."""
    if json_mode:
        prompt = prompt + "\n\nCRITICAL: Respond ONLY with a valid JSON block. Do not include markdown code fence wrappers or backticks."

    # Route to Gemini if preferred or if it's the only one available
    if (preferred_provider == "gemini" or not preferred_provider) and has_gemini:
        try:
            import google.generativeai as genai
            # Use gemini-1.5-pro for complex tasks like email copywriting if requested, else flash
            model_name = "gemini-1.5-pro" if preferred_provider == "gemini" else "gemini-1.5-flash"
            try:
                model = genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_prompt
                )
                response = model.generate_content(prompt)
                return response.text.strip()
            except Exception as inner_e:
                # Fallback to flash if pro fails
                if model_name == "gemini-1.5-pro":
                    print(f"Gemini Pro failed, falling back to Flash: {inner_e}")
                    model = genai.GenerativeModel(
                        model_name="gemini-1.5-flash",
                        system_instruction=system_prompt
                    )
                    response = model.generate_content(prompt)
                    return response.text.strip()
                raise inner_e
        except Exception as e:
            print(f"Gemini call failed, falling back: {e}")

    # Route to OpenAI if preferred or as fallback
    if has_openai:
        try:
            model_name = "gpt-4o" if preferred_provider == "gemini" else "gpt-4o-mini"
            response = openai_client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"} if json_mode else {"type": "text"}
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI call failed, falling back: {e}")

    # Fallback to Gemini if OpenAI was preferred but unavailable
    if preferred_provider == "openai" and has_gemini:
        try:
            import google.generativeai as genai
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=system_prompt
            )
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            print(f"Gemini fallback call failed: {e}")

    return ""


def clean_and_format_raw_text(raw_text: str) -> str:
    """Uses LLM to clean and structure messy copy-pasted text before parsing."""
    system_prompt = "You are a Sales Intelligence Assistant. Your job is to take raw, messy, unstructured copy-pasted requirements text and format it into clean, readable requirement segments separated by '---'."
    prompt = f"""
Format and clean the following raw pasted text.
Identify separate opportunities and list them with:
- Title: [descriptive title]
- Company: [name of company]
- Website: [url if any]
- Email: [contact email if any]
- Description: [detailed requirement text]

Divide separate opportunities with a line containing only '---'.
Remove any advertising, web navigation artifacts, or redundant lines.

Raw text to clean:
{raw_text}
"""
    formatted = _call_llm(system_prompt, prompt)
    if formatted:
        return formatted.strip()
    return raw_text


def split_requirements(raw_text: str) -> list[dict]:
    """Splits a bulk requirements string into individual records."""
    # Pre-format messy raw text first
    raw_text = clean_and_format_raw_text(raw_text)

    system_prompt = "You are an AI Sales Intelligence Agent. Your job is to split a bulk input containing multiple separate business requirements/RFPs/jobs into individual records."
    prompt = f"""
Split the following text into individual requirements.
Extract for each requirement:
- title: Brief descriptive title of the opportunity
- company_name: Name of the company, or 'Unknown' if not present
- description: Full detail of this specific requirement
- email: Any email address explicitly written in the requirement text, or null
- url: Any website or job post URL explicitly written in the requirement text, or null
- requirement_id: Any tender ID, job ID, or reference number, or null

Input text:
{raw_text}

Respond as a JSON list of objects:
[{{
  "title": "string",
  "company_name": "string",
  "description": "string",
  "email": "string or null",
  "url": "string or null",
  "requirement_id": "string or null"
}}]
"""
    response_text = _call_llm(system_prompt, prompt, json_mode=True)
    
    if response_text:
        try:
            # Clean possible markdown wrapping
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "", 1)
            if response_text.endswith("```"):
                response_text = response_text.rsplit("```", 1)[0]
            data = json.loads(response_text.strip())
            if isinstance(data, list):
                return data
        except Exception as e:
            print(f"Failed to parse LLM split response: {e}")

    # Pure Python fallback parsing
    records = []
    # Try separating by common line dividers
    chunks = []
    if "---" in raw_text:
        chunks = [c.strip() for c in raw_text.split("---") if c.strip()]
    elif "\n\n\n" in raw_text:
        chunks = [c.strip() for c in raw_text.split("\n\n\n") if c.strip()]
    else:
        # Fallback to double newline split
        chunks = [c.strip() for c in raw_text.split("\n\n") if c.strip()]
        
    for i, chunk in enumerate(chunks):
        lines = chunk.split("\n")
        title = lines[0].replace("#", "").strip() if lines else f"Requirement {i+1}"
        if len(title) > 80:
            title = title[:77] + "..."
            
        # Quick email regex extract
        extracted_email = None
        import re
        emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', chunk)
        if emails:
            extracted_email = emails[0]
            
        # Quick URL extract
        extracted_url = None
        urls = re.findall(r'https?://[^\s\)]+', chunk)
        if urls:
            extracted_url = urls[0]

        # Inferred company name
        company_name = "Unknown"
        company_matches = re.findall(r'(?:at|for|from|Company:)\s+([A-Z][a-zA-Z0-9\s\.\,\-\&]+)', chunk)
        if company_matches:
            company_name = company_matches[0].split(" wants ")[0].split(" needs ")[0].strip()

        records.append({
            "title": title,
            "company_name": company_name,
            "description": chunk,
            "email": extracted_email,
            "url": extracted_url,
            "requirement_id": f"REQ-{random.randint(1000, 9999)}"
        })
    return records


def classify_requirement(description: str) -> str:
    """Classifies the requirement type."""
    system_prompt = "You are an AI Business Analyst. Classify the requirement into one of the following: RFP, RFI, RFQ, Tender, Hiring, Contract Staffing, AI Requirement, Automation Requirement, Software Development, Consulting Requirement, Digital Transformation, Other."
    prompt = f"Classify this requirement:\n\n{description}\n\nReturn ONLY the classification name."
    
    response = _call_llm(system_prompt, prompt)
    if response:
        return response
        
    # Python fallback classification
    desc_lower = description.lower()
    if "rfp" in desc_lower or "request for proposal" in desc_lower:
        return "RFP"
    elif "rfi" in desc_lower:
        return "RFI"
    elif "rfq" in desc_lower:
        return "RFQ"
    elif "tender" in desc_lower or "government" in desc_lower:
        return "Tender"
    elif "hiring" in desc_lower or "recruit" in desc_lower or "staff augmentation" in desc_lower:
        return "Contract Staffing" if "contract" in desc_lower else "Hiring"
    elif "ai" in desc_lower or "chatbot" in desc_lower or "voice agent" in desc_lower or "llm" in desc_lower:
        return "AI Requirement"
    elif "automation" in desc_lower or "workflow" in desc_lower:
        return "Automation Requirement"
    elif "digital transformation" in desc_lower:
        return "Digital Transformation"
    return "Software Development"


def match_wority_services(description: str) -> dict:
    """Determines delivery viability for Wority services."""
    wority_services = """
Primary Services:
- AI Automation (Agentic AI, Voice Agents, AI Chatbots, Process Automation)
- Custom Software Development (Web, Mobile Apps, Enterprise CRM/ERP)
- Data Analytics & BI (Business Intelligence, Data Pipelines)
- Cloud Solutions & DevOps
- Staff Augmentation (Dedicated dev teams)
- IT Consulting, Digital Transformation, Cybersecurity, QA Testing
"""
    system_prompt = "You are a Sales Engineering Director at Wority Technology. Analyze the requirement and match it to Wority's services."
    prompt = f"""
Wority Services:
{wority_services}

Requirement:
{description}

Evaluate if Wority can deliver. Respond in JSON:
{{
  "can_deliver": "YES" | "NO" | "PARTIAL",
  "confidence": 0-100,
  "explanation": "Brief explanation why",
  "service_mapping": ["Mapped Service 1", "Mapped Service 2"]
}}
"""
    response_text = _call_llm(system_prompt, prompt, json_mode=True)
    if response_text:
        try:
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "", 1)
            if response_text.endswith("```"):
                response_text = response_text.rsplit("```", 1)[0]
            return json.loads(response_text.strip())
        except Exception:
            pass

    # Python fallback matching logic
    desc_lower = description.lower()
    mapping = []
    can_deliver = "PARTIAL"
    confidence = 80.0
    
    if any(k in desc_lower for k in ["ai", "bot", "voice", "agent", "llm", "gpt", "rag"]):
        mapping.append("AI Automation")
        can_deliver = "YES"
    if any(k in desc_lower for k in ["software", "develop", "react", "node", "python", "custom", "web", "mobile", "app"]):
        mapping.append("Custom Software Development")
        can_deliver = "YES"
    if any(k in desc_lower for k in ["data", "analytics", "dashboard", "bi", "report", "pipeline"]):
        mapping.append("Data Analytics")
        can_deliver = "YES"
    if any(k in desc_lower for k in ["staff", "hiring", "recruit", "engineer", "resource", "developer", "hire"]):
        mapping.append("Staff Augmentation")
        can_deliver = "YES"
    if any(k in desc_lower for k in ["security", "cyber", "penetration"]):
        mapping.append("Cybersecurity")
        can_deliver = "YES"
        
    if not mapping:
        mapping = ["IT Consulting"]
        can_deliver = "PARTIAL"
        confidence = 60.0
        
    return {
        "can_deliver": can_deliver,
        "confidence": confidence,
        "explanation": f"Matched due to keywords indicating requests for {', '.join(mapping)}.",
        "service_mapping": mapping
    }


def calculate_opportunity_score(data: dict) -> dict:
    """Computes scores and ranks opportunities."""
    can_deliver = data.get("can_deliver", "YES")
    confidence = data.get("delivery_confidence", 80)
    
    # Calculate components
    fit_score = 90.0 if can_deliver == "YES" else (60.0 if can_deliver == "PARTIAL" else 10.0)
    
    # Random realistic scores for demo/research enrichment
    revenue_score = random.randint(50, 95)
    urgency_score = random.randint(40, 90)
    probability = float(confidence) * 0.8
    competition_score = random.randint(30, 80)
    decision_maker_availability = random.randint(50, 95)
    
    overall_score = (fit_score * 0.3) + (revenue_score * 0.2) + (urgency_score * 0.15) + (probability * 0.15) + (decision_maker_availability * 0.2)
    
    if overall_score >= 85:
        rank = "A+"
    elif overall_score >= 75:
        rank = "A"
    elif overall_score >= 60:
        rank = "B"
    elif overall_score >= 45:
        rank = "C"
    else:
        rank = "D"
        
    return {
        "fit_score": fit_score,
        "revenue_score": float(revenue_score),
        "urgency_score": float(urgency_score),
        "probability": float(probability),
        "competition_score": float(competition_score),
        "decision_maker_availability": float(decision_maker_availability),
        "overall_score": round(overall_score, 1),
        "rank": rank
    }


def generate_personalized_email(company_name: str, opportunity_title: str, description: str, contact_name: str, contact_role: str, tone: str = "Consultative") -> dict:
    """Generates a highly personalized sales email outreach sequence targeting Gemini for premium copywriting."""
    system_prompt = f"""You are a Lead Business Development Director at Wority Technology (https://woritytechnology.com).
Your tone is {tone}, professional, consultative, and executive-level.
CRITICAL COPYWRITING RULES:
1. NEVER sound like a generic AI assistant. Do NOT use typical LLM buzzwords such as "revolutionize", "seamless", "cutting-edge", "streamline", "synergy", "delighted", "testament", "game-changing".
2. Write like a busy, expert sales engineer who gets straight to the point.
3. Hook the reader immediately in the first sentence by referencing their specific requirement: "{opportunity_title}".
4. In 2-3 sentences, briefly explain how Wority Technology solves this (e.g., custom AI Voice Agents, full-stack React/Node squads, dedicated development pods).
5. The Call-to-Action must be extremely low-friction (e.g. "Would you like me to send over a 2-page tech brief on how we'd structure the architecture?" or "Would you be open to a 2-minute demo of a similar system we built?").
6. Never write placeholders like '[Insert Name]'. Use the exact parameters provided: Prospect Name is '{contact_name}', Prospect Role is '{contact_role}', Company Name is '{company_name}'.
"""

    prompt = f"""
Write a complete outreach sequence for:
- Prospect: {contact_name} ({contact_role})
- Target Company: {company_name}
- Requirement: {opportunity_title}
- Detailed Specification: {description}

Produce a response in JSON format containing:
- subject: A short, lowercase, highly conversational subject line (e.g., "dispatch voice agents for {company_name}" or "react dev squad for {company_name}") - never capitalize every word or look like spam.
- body: The personalized outreach email (keep it under 150 words, clean spacing).
- follow_up_1: A value-added follow-up sent 3 days later, sharing a quick tip or asking a specific question about their tech stack context.
- follow_up_2: A brief, polite final check sent 7 days later offering to connect them with a solutions architect.
- linkedin_message: A friendly LinkedIn connection note (strict maximum of 280 characters).
- cold_call_script: A short 30-second phone script.
- whatsapp_message: A brief, direct, polite WhatsApp message.
"""
    response_text = _call_llm(system_prompt, prompt, json_mode=True, preferred_provider="gemini")
    if response_text:
        try:
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "", 1)
            if response_text.endswith("```"):
                response_text = response_text.rsplit("```", 1)[0]
            return json.loads(response_text.strip())
        except Exception:
            pass

    # Fallback template generator
    subject = f"Supporting {company_name} on {opportunity_title}"
    body = f"Hi {contact_name},\n\nI noticed that {company_name} is currently looking into {opportunity_title}. I wanted to reach out because at Wority Technology, we specialize in helping businesses implement similar solutions, particularly in AI Automation and Custom Software.\n\nWould you be open to a brief chat to see how we could support your team?\n\nBest,\nSales Team\nWority Technology"
    follow_up_1 = f"Hi {contact_name},\n\nFollowing up on my previous message. I thought you might find our case studies on AI-driven process optimization interesting as you scale {opportunity_title}. Let me know if you'd like me to send them over.\n\nBest,\nWority Technology"
    follow_up_2 = f"Hi {contact_name},\n\nJust checking if you had a chance to look at my previous note. We'd love to help you deliver {opportunity_title} on time and within budget. Do you have 10 minutes next Tuesday?\n\nBest,\nWority Technology"
    linkedin = f"Hi {contact_name}, I saw your focus on {opportunity_title} at {company_name}. Let's connect! I work with Wority Technology on custom development."
    cold_call = f"Hi {contact_name}, this is Wority Technology. I saw your requirement for {opportunity_title}. We have a dedicated team that can implement this. Do you have 2 minutes to discuss?"
    whatsapp = f"Hi {contact_name}, saw your {opportunity_title} requirement. We build custom platforms at Wority. Let me know if you want to see our portfolio!"

    return {
        "subject": subject,
        "body": body,
        "follow_up_1": follow_up_1,
        "follow_up_2": follow_up_2,
        "linkedin_message": linkedin,
        "cold_call_script": cold_call,
        "whatsapp_message": whatsapp
    }


def retrieve_relevant_documents(query_text: str) -> str:
    """Queries pgvector for relevant case studies and capability docs from the database."""
    from database import SessionLocal
    import models
    
    db = SessionLocal()
    try:
        query_emb = generate_embeddings(query_text)
        # Cosine distance operator (<->) in pgvector
        docs = db.query(models.Document).order_by(
            models.Document.embedding.cosine_distance(query_emb)
        ).limit(2).all()
        
        if docs:
            context = "\n\n".join([f"Source ({doc.filename}):\n{doc.content}" for doc in docs])
            return f"\n=== RELEVANT WORITY CASE STUDIES & CAPABILITIES CONTEXT ===\n{context}\n==========================================================\n"
    except Exception as e:
        print(f"RAG Retrieval failed: {e}")
    finally:
        db.close()
    return ""


def generate_proposal(company_name: str, opportunity_title: str, description: str) -> dict:
    """Generates a structured proposal draft injecting RAG context."""
    rag_context = retrieve_relevant_documents(description)
    
    system_prompt = "You are a Lead Solutions Architect at Wority Technology. Write a structured proposal."
    prompt = f"""
Create a proposal draft for {company_name}'s project: "{opportunity_title}".
Requirement: {description}

{rag_context}

Produce a response in JSON format containing:
- executive_summary: High level pitch
- company_understanding: Analysis of their situation
- problem_statement: Summary of their problem
- recommended_solution: Proposal technical solution
- architecture: Description of the software/AI architecture
- timeline: Timeline breakdown
- technology_stack: Array of tech tools (e.g. React, Python, PostgreSQL)
- team_structure: Staffing structure (e.g. 1 PM, 2 Developers)
- estimated_cost_range: Estimated cost range
- why_wority: Why they should choose Wority (refer to any relevant case studies provided in the context)
- call_to_action: Next steps
"""
    response_text = _call_llm(system_prompt, prompt, json_mode=True)
    if response_text:
        try:
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "", 1)
            if response_text.endswith("```"):
                response_text = response_text.rsplit("```", 1)[0]
            return json.loads(response_text.strip())
        except Exception:
            pass

    return {
        "executive_summary": f"Wority Technology is pleased to submit this proposal to support {company_name} with {opportunity_title}.",
        "company_understanding": f"We understand {company_name} is seeking capability to execute on: {opportunity_title}.",
        "problem_statement": "The project requires rapid deployment of experienced engineers and robust architecture to ensure stability and scale.",
        "recommended_solution": "We recommend a custom solution matching the requirements, backed by Wority's agile implementation framework.",
        "architecture": "A modern microservices architecture with a React-based frontend and FastAPI Python backend, using Redis for caching and PostgreSQL for persistent data storage.",
        "timeline": "Phase 1: Discovery & Design (2 weeks), Phase 2: Core Development (6 weeks), Phase 3: Integration & Testing (2 weeks), Phase 4: Launch & Handover (2 weeks).",
        "technology_stack": ["React", "FastAPI", "PostgreSQL", "Tailwind CSS", "Docker"],
        "team_structure": "1 Solutions Architect (Part-time), 1 Project Manager, 2 Full-Stack Developers, 1 QA Engineer.",
        "estimated_cost_range": "$15,000 - $35,000",
        "why_wority": "Wority Technology is a premier AI and software engineering firm with a proven track record of on-time delivery, premium aesthetics, and robust backend engineering.",
        "call_to_action": "Let's schedule a 30-minute scoping call to finalize details."
    }


def generate_embeddings(text: str) -> list[float]:
    """Generates a mock or real vector embedding."""
    if has_openai:
        try:
            response = openai_client.embeddings.create(
                input=[text.replace("\n", " ")],
                model="text-embedding-3-small"
            )
            return response.data[0].embedding
        except Exception:
            pass
            
    # Mock embedding
    random.seed(hash(text))
    return [random.uniform(-0.1, 0.1) for _ in range(1536)]


def calculate_bid_compliance(description: str) -> dict:
    """Calculates compliance score and checks bid/no-bid criteria for Wority."""
    desc_lower = description.lower()
    
    checklist = [
      {
        "criterion": "Technology Stack Fit",
        "description": "Requires React, Node, Python, .NET, or AI/ML automation capabilities.",
        "passed": any(t in desc_lower for t in ["react", "node", "python", "javascript", "typescript", "c#", ".net", "ai", "bot", "voice", "agent", "llm", "software", "development", "crm", "salesforce"]),
        "importance": "High"
      },
      {
        "criterion": "Budget / Project Scale Fit",
        "description": "Budget aligns with mid-market projects ($10K - $200K) or contractor staffing.",
        "passed": not any(kw in desc_lower for kw in ["$1k", "$2k", "$3k", "$5k", "under $5000", "500 million", "billion"]),
        "importance": "Medium"
      },
      {
        "criterion": "Security & Corporate Clearance",
        "description": "No strict military TS/SCI or federal security clearance constraints mentioned.",
        "passed": not any(kw in desc_lower for kw in ["ts/sci", "top secret", "security clearance required", "active clearance"]),
        "importance": "High"
      },
      {
        "criterion": "Delivery & Operational Alignment",
        "description": "Requirement is within Custom Software, AI Automation, or Staff Augmentation.",
        "passed": any(t in desc_lower for t in ["custom", "staff", "hiring", "rfp", "rfi", "tender", "develop", "contract", "automation", "consulting", "integration", "crm"]),
        "importance": "High"
      }
    ]
    
    passed_count = sum(1 for item in checklist if item["passed"])
    score = int((passed_count / len(checklist)) * 100)
    
    if score >= 75:
        recommendation = "RECOMMENDED (BID)"
        explanation = "Strong capabilities alignment across technology stack and operational scope."
    elif score >= 50:
        recommendation = "NEEDS MANUAL REVIEW"
        explanation = "Partial alignment. Review timeline constraints and clearance requirements."
    else:
        recommendation = "NOT RECOMMENDED (NO-BID)"
        explanation = "Mismatched technology requirements or security clearance constraints."
        
    return {
        "score": score,
        "recommendation": recommendation,
        "explanation": explanation,
        "checklist": checklist
    }


def classify_email_reply(reply_text: str) -> dict:
    """Uses Gemini to classify a prospect's email reply, extract sentiment, meetings, and referrals."""
    import re
    system_prompt = (
        "You are an expert sales analyst SDR assistant. Your job is to classify inbound email replies from prospects "
        "and structure your analysis as a JSON object."
    )
    prompt = f"""
Analyze the following email reply from a business prospect:
"{reply_text}"

Classify it into one of these strict categories:
1. "Interested": The prospect wants to talk, book a meeting, schedule a call, ask for more details, or is interested in our services.
2. "Referral": The prospect is directing us to talk to someone else (e.g., "Not my area, contact the CTO, Sarah at sarah@company.com").
3. "Not Interested": The prospect wants to opt out, says they are not interested, asks to stop emailing, or rejects the proposal.
4. "Out of Office": Out of office auto-replies.
5. "Other": Any general query, confirmation, or generic response that does not fit the above.

You must respond ONLY with a JSON object containing:
- "sentiment": "Interested" | "Referral" | "Not Interested" | "Out of Office" | "Other"
- "explanation": "A one sentence summary of why you classified it this way."
- "meeting_booking": {{
    "requested": true,
    "proposed_time": "Extracted date/time or window, e.g. 'Thursday at 2 PM EST' if mentioned, else null"
  }} (set requested to true if they suggested a call or meeting, otherwise false)
- "referral": {{
    "discovered": true,
    "name": "Full name of referred contact or null",
    "email": "Referred email address or null",
    "designation": "Referred job title, e.g. CTO, or null"
  }} (set discovered to true if they refer us to someone else, otherwise false)
"""
    try:
        response_text = _call_llm(system_prompt, prompt, json_mode=True, preferred_provider="gemini")
        # Clean potential markdown JSON syntax
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        data = json.loads(response_text.strip())
        return data
    except Exception as e:
        print(f"Failed to classify reply via LLM: {e}")
        # Robust fallback parsing logic
        lower_reply = reply_text.lower()
        sentiment = "Other"
        meeting_req = False
        proposed_time = None
        referral_disc = False
        ref_name = None
        ref_email = None
        ref_title = None

        if "interested" in lower_reply or "call" in lower_reply or "talk" in lower_reply or "schedule" in lower_reply or "meet" in lower_reply or "zoom" in lower_reply:
            sentiment = "Interested"
            meeting_req = True
            if "tomorrow" in lower_reply:
                proposed_time = "Tomorrow"
            elif "thursday" in lower_reply:
                proposed_time = "Thursday"
        elif "unsubscribe" in lower_reply or "stop" in lower_reply or "remove" in lower_reply or "not interested" in lower_reply or "not looking" in lower_reply or "no need" in lower_reply:
            sentiment = "Not Interested"
        elif "reach out to" in lower_reply or "contact" in lower_reply or "email my" in lower_reply or "speak with" in lower_reply:
            # Check for emails in text
            emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', reply_text)
            if emails:
                sentiment = "Referral"
                referral_disc = True
                ref_email = emails[0]
                ref_name = ref_email.split('@')[0].replace('.', ' ').title()
                ref_title = "Stakeholder"
        elif "out of office" in lower_reply or "auto-reply" in lower_reply or "vacation" in lower_reply:
            sentiment = "Out of Office"

        return {
            "sentiment": sentiment,
            "explanation": "Extracted via rule-based keyword fallback matcher.",
            "meeting_booking": {
                "requested": meeting_req,
                "proposed_time": proposed_time
            },
            "referral": {
                "discovered": referral_disc,
                "name": ref_name,
                "email": ref_email,
                "designation": ref_title
            }
        }


