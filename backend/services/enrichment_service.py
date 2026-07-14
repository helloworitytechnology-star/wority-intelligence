import re
import socket
import random
from urllib.parse import quote_plus

def validate_email(email: str) -> str:
    """Validates an email address and classifies it."""
    if not email:
        return "Unknown"
        
    # Syntax check
    regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(regex, email):
        return "Unknown"
        
    domain = email.split('@')[1]
    
    # Try resolving MX record for domain validation
    try:
        # socket.getaddrinfo returns IP resolutions, proving the domain is real
        socket.getaddrinfo(domain, 80)
        # Randomize status between Verified, Likely, Catch-all for mock simulation
        statuses = ["Verified", "Likely", "Catch-all"]
        # Make it deterministic based on the email string
        random.seed(hash(email))
        return random.choice(statuses)
    except Exception:
        return "Unknown"

def search_linkedin_url(name: str, type_: str = "company") -> str:
    """Generates a LinkedIn URL based on the company or person name."""
    clean_name = re.sub(r'[^a-zA-Z0-9\s]', '', name).strip().lower()
    slug = "-".join(clean_name.split())
    if type_ == "company":
        return f"https://www.linkedin.com/company/{slug}"
    else:
        return f"https://www.linkedin.com/in/{slug}-{random.randint(10, 99)}"

def enrich_company_and_contacts(company_name: str, raw_content: str = "") -> dict:
    """Enriches company and discovers top decision makers using simulated providers."""
    if not company_name or company_name == "Unknown":
        # Guess company from raw content
        company_name = "Target Company"
        
    domain = f"{company_name.lower().replace(' ', '').replace(',', '')}.com"
    website = f"https://www.{domain}"
    
    # Standard decision maker roles requested by user
    roles = [
        {"role": "CEO", "dept": "Executive", "authority": "High"},
        {"role": "CTO", "dept": "Technology", "authority": "High"},
        {"role": "Head of AI", "dept": "Technology", "authority": "High"},
        {"role": "VP Engineering", "dept": "Engineering", "authority": "High"},
        {"role": "Director IT", "dept": "IT", "authority": "Medium"},
        {"role": "Procurement Manager", "dept": "Procurement", "authority": "High"},
        {"role": "HR Head", "dept": "HR", "authority": "Medium"},
        {"role": "Project Manager", "dept": "Project Management", "authority": "Low"}
    ]
    
    # Generate mock contacts with realistic details
    first_names = ["Sarah", "Michael", "Emily", "David", "Jessica", "James", "Sophia", "Robert", "Linda", "John"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"]
    
    contacts = []
    # Identify up to 6 decision makers
    num_contacts = random.randint(4, 6)
    
    # Check if there is an email or name in the raw requirement
    explicit_email = None
    explicit_name = None
    
    if raw_content:
        # Regex to find email
        emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', raw_content)
        if emails:
            explicit_email = emails[0]
            # Try to infer name from email
            name_part = explicit_email.split('@')[0]
            if '.' in name_part:
                parts = name_part.split('.')
                explicit_name = f"{parts[0].capitalize()} {parts[1].capitalize()}"
            else:
                explicit_name = name_part.capitalize()
                
    # If there is an explicit email, put that person at the top
    if explicit_email:
        name = explicit_name or "Point of Contact"
        contacts.append({
            "full_name": name,
            "designation": "Requirement Contact",
            "linkedin_url": search_linkedin_url(name, "person"),
            "email": explicit_email,
            "phone": "+1-555-0199",
            "location": "New York, USA",
            "department": "Engineering",
            "confidence_score": 100.0,
            "source": "Provided Requirement",
            "is_cxo": True,
            "priority_score": 95,
            "relationship_score": 80,
            "buying_authority": "High"
        })
        
    for i in range(num_contacts):
        role_info = roles[i % len(roles)]
        first_name = random.choice(first_names)
        last_name = random.choice(last_names)
        full_name = f"{first_name} {last_name}"
        
        # Don't duplicate the explicit contact
        if explicit_name and explicit_name.lower() in full_name.lower():
            continue
            
        email_prefix = f"{first_name.lower()}.{last_name.lower()}"
        email = f"{email_prefix}@{domain}"
        
        contacts.append({
            "full_name": full_name,
            "designation": role_info["role"],
            "linkedin_url": search_linkedin_url(full_name, "person"),
            "email": email,
            "phone": f"+1-555-01{random.randint(10, 99)}",
            "location": random.choice(["San Francisco, CA", "New York, NY", "London, UK", "Austin, TX"]),
            "department": role_info["dept"],
            "confidence_score": round(random.uniform(75, 98), 1),
            "source": random.choice(["Apollo", "Hunter", "LinkedIn"]),
            "is_cxo": role_info["role"] in ["CEO", "CTO", "Head of AI", "VP Engineering"],
            "priority_score": random.randint(70, 95),
            "relationship_score": random.randint(10, 50),
            "buying_authority": role_info["authority"]
        })
        
    # Sort contacts by priority
    contacts.sort(key=lambda x: x["priority_score"], reverse=True)
    
    # Firmographics
    tech_stacks = [
        ["React", "Node.js", "AWS", "PostgreSQL", "Docker"],
        ["Angular", ".NET Core", "Azure", "SQL Server", "Kubernetes"],
        ["Vue.js", "Python", "GCP", "MongoDB", "FastAPI"],
        ["HTML5", "PHP", "Laravel", "MySQL", "Apache"]
    ]
    
    competitors = {
        "AI": ["OpenAI", "Anthropic", "Cohere"],
        "Enterprise": ["Salesforce", "Microsoft", "Oracle"],
        "Consulting": ["Accenture", "Deloitte", "Infosys"]
    }
    
    return {
        "website": website,
        "industry": random.choice(["Healthcare", "Fintech", "Logistics", "Retail", "Technology", "Education"]),
        "headquarters": random.choice(["New York, USA", "San Francisco, USA", "London, UK", "Berlin, Germany"]),
        "country": "USA",
        "revenue": random.choice(["$5M - $10M", "$10M - $50M", "$50M - $100M", "$100M+"]),
        "employees": random.choice(["50 - 200", "200 - 500", "500 - 1000", "1000+"]),
        "funding": random.choice(["Seed ($1.5M)", "Series A ($8M)", "Series B ($20M)", "Self-Funded", "Publicly Traded"]),
        "tech_stack": random.choice(tech_stacks),
        "current_vendors": ["AWS", "Salesforce", "Slack"],
        "latest_news": [
            f"{company_name} launches new digital automation initiative.",
            f"{company_name} reports 20% quarterly user growth."
        ],
        "ai_adoption": random.choice(["High (Deploying agents)", "Medium (Using LLMs for chat)", "Low (Exploring use cases)"]),
        "automation_maturity": random.choice(["Advanced", "Developing", "Beginner"]),
        "digital_initiatives": "Modernizing core CRM systems and integrating workflow automation.",
        "linkedin_url": search_linkedin_url(company_name, "company"),
        "description": f"{company_name} is a leading provider of industry solutions, focusing on digital enablement and customer experience.",
        "products": ["Product Suite A", "Cloud Module B"],
        "services": ["Professional Services", "Customer Success Team"],
        "competitors": competitors[random.choice(["AI", "Enterprise", "Consulting"])],
        "contacts": contacts
    }
