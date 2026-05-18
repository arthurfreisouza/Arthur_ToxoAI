# IA-Toxo

Clinical decision-support assistant for **congenital toxoplasmosis**, developed at UFMG. This repo contains the application code, Azure infrastructure templates, and project documentation supporting Arthur Reis' TCC ("Desenvolvimento de um Assistente Virtual Baseado em GraphRAG para Auxílio no Diagnóstico de Toxoplasmose Congênita").

The current code ships the **auth foundation** — email/password registration with real email verification, JWT-based sessions, a hardened backend and modular frontend. The GraphRAG + Neo4j + LLM orchestration layer is the next phase.

## Repository layout

```
.
├── backend/                FastAPI app (modular, PostgreSQL + Alembic)
│   ├── app/
│   │   ├── api/v1/         versioned API routers
│   │   ├── core/           config (Pydantic Settings), security (JWT, bcrypt)
│   │   ├── db/             SQLAlchemy base + session
│   │   ├── models/         ORM models
│   │   ├── schemas/        Pydantic request/response models
│   │   ├── services/       business logic (auth, email via Resend)
│   │   └── main.py         FastAPI app factory
│   ├── alembic/            migrations
│   ├── requirements.txt
│   └── .env.example
├── frontend/               static SPA (vanilla JS, ES modules, no build step)
│   ├── index.html          sign in / register / dashboard
│   ├── verify.html         email verification landing
│   └── assets/{css,js}/
├── deploy/                 nginx + systemd templates, full deploy recipe
├── infra/                  Azure ML workspace Bicep + ADO pipelines
├── infra_AI_Foundry/       Azure AI Foundry Hub Bicep + ADO pipelines
└── files/                  project docs (TCC, monograph, project summary)
```

## Architecture (current)

```
Browser ──── HTTPS ────► nginx ──── /api/ ────► uvicorn (FastAPI)
                          │                        │
                          │                        ├─► PostgreSQL (users)
                          │                        └─► Resend API (verification emails)
                          └── static assets (frontend/)
```

- **Backend**: FastAPI, SQLAlchemy 2.0 (sync, psycopg 3), Alembic, Pydantic Settings for env config, bcrypt + JWT (HS256), Resend for transactional email.
- **Frontend**: vanilla ES modules — `api.js` (fetch wrapper + typed errors), `ui.js` (message + loading helpers), `views/{auth,dashboard}.js`, `verify-app.js`. No build step, served directly by nginx.
- **Email verification flow**: registration creates an unverified user → backend issues a signed JWT with `type=verify` → Resend sends the link to `FRONTEND_URL/verify.html?token=…` → the page POSTs the token to `/api/v1/auth/verify` → user is marked verified. Login is blocked while `is_verified=false`.

## Quick start (local dev)

Requires Python 3.11+, PostgreSQL 14+, a Resend API key.

```bash
# 1. Postgres
createuser -P iatoxo                       # or via psql
createdb -O iatoxo iatoxo

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                       # edit SECRET_KEY, DATABASE_URL, RESEND_API_KEY, FRONTEND_URL
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. Frontend (separate terminal)
cd ../frontend
python -m http.server 8080
# Open http://localhost:8080
# Set FRONTEND_URL=http://localhost:8080 and CORS_ORIGINS=["http://localhost:8080"] in backend .env
```

## API surface

| Method | Path                              | Auth | Purpose                                   |
| -----: | --------------------------------- | :--: | ----------------------------------------- |
|    GET | `/health`                         |   –  | Liveness probe                            |
|   POST | `/api/v1/auth/register`           |   –  | Create account, send verification email   |
|   POST | `/api/v1/auth/login`              |   –  | Exchange credentials for an access token  |
|   POST | `/api/v1/auth/verify`             |   –  | Confirm an email via a verification token |
|   POST | `/api/v1/auth/resend-verification`|   –  | Re-send the verification email            |
|    GET | `/api/v1/users/me`                |  ✓   | Current user                              |

Interactive docs at `/docs` (Swagger) and `/redoc`, disabled when `ENVIRONMENT=production`.

## Deployment

Full step-by-step recipe for the Hostinger VPS in [`deploy/README.md`](deploy/README.md). Highlights:
- `deploy/nginx.conf.example` — TLS termination, HSTS, security headers, static frontend + `/api/` proxy.
- `deploy/iatoxo-backend.service.example` — hardened systemd unit (NoNewPrivileges, ProtectSystem, ProtectHome).
- Resend domain verification (SPF/DKIM) is required before emails will land outside spam.

## Security notes

- `SECRET_KEY` is loaded from `.env` and validated to be at least 32 chars. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- `CORS_ORIGINS` defaults to `[]` (no cross-origin requests) since frontend and API share an origin behind nginx.
- Verification tokens are short-lived signed JWTs (`type=verify`, 24 h default).
- Access tokens are 60 min by default. Refresh tokens, password reset, and rate limiting are deliberately deferred — see follow-ups below.

## Roadmap (next phases)

1. Refresh tokens via httpOnly cookies + token rotation.
2. Password reset flow (same Resend + signed-token pattern).
3. Rate limiting on auth endpoints (nginx `limit_req` or `slowapi`).
4. Audit log table.
5. **The actual IA-Toxo work**: Neo4j ontology, GraphRAG retrieval, fine-tuned LLM client, chatbot UI, hospital-network isolation.

## License

Educational / academic use — UFMG TCC project. See `files/` for the formal project documentation.
