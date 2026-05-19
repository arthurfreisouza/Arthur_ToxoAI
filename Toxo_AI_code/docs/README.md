# IA-Toxo — Documentation

**IA-Toxo** is a clinical assistant web application for congenital toxoplasmosis, built for research at UFMG. It provides a secure authentication layer and user management foundation on top of which the AI/RAG chatbot features sit.

## Live site

**https://mychatbotproject.uk**

## Documentation index

| Document | What it covers |
|---|---|
| [Architecture](architecture.md) | Full system diagram — how every component connects |
| [Backend](backend.md) | Python/FastAPI stack, project structure, API reference |
| [Frontend](frontend.md) | Vanilla JS/HTML/CSS stack |
| [Authentication](authentication.md) | Registration, email verification, JWT login flow |
| [Database](database.md) | Schema, how tables are created, connecting manually |
| [Deployment](deployment.md) | VPS setup, nginx, systemd, SSL, Cloudflare |
| [Email / Resend](email-resend.md) | How to configure the Resend email integration |

## Project layout

```
Toxo_AI_code/          ← everything lives at the root
├── main.py            # FastAPI app — routes, startup
├── auth.py            # JWT logic, Pydantic schemas, password hashing
├── database.py        # SQLAlchemy engine and session factory
├── models.py          # ORM models (User)
├── mail.py            # Resend email service
├── requirements.txt
├── .env.example       # Template for environment variables
│
├── index.html         # Single-page app — login / register / dashboard
├── verify.html        # Email verification landing page
├── app.js             # Frontend JavaScript
├── style.css          # Frontend styles
│
├── deploy/            # nginx config, systemd service, deployment guide
├── infra/             # Azure Bicep templates (ML workload)
├── infra_AI_Foundry/  # Azure AI Foundry Bicep templates
└── docs/              # This documentation
```
