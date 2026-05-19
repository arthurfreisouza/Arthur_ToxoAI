# System Architecture

## High-level overview

```
Browser
  │
  │  HTTPS (TLS 1.2/1.3)
  ▼
Cloudflare  ──────────────────────────────────────────────────
  │  (CDN, DDoS protection, SSL termination from browser)
  │  Full (Strict) SSL mode → forwards HTTPS to origin
  ▼
VPS  (Ubuntu 24.04 — mychatbotproject.uk)
  │
  ├─ Nginx 1.24  (port 443 / 80)
  │    │
  │    ├── /              → serves /srv/iatoxo/index.html   (static)
  │    ├── /verify.html   → serves /srv/iatoxo/verify.html  (static)
  │    ├── *.css / *.js   → serves static files, 7d cache
  │    ├── /health        → proxy_pass http://127.0.0.1:8000
  │    └── everything else → proxy_pass http://127.0.0.1:8000
  │
  └─ uvicorn (127.0.0.1:8000, 2 workers)
       │
       └─ FastAPI app (IA-Toxo backend)
            │
            ├── Auth service  ──► Resend API  (transactional email)
            │
            └── SQLAlchemy ──► PostgreSQL 16  (local, port 5432)
```

## Request flow — static asset

1. Browser requests `https://mychatbotproject.uk/style.css`
2. Cloudflare checks edge cache → cache miss → forwards to VPS:443
3. Nginx matches `*.css` → reads file from `/srv/iatoxo/style.css`
4. Nginx responds with `Cache-Control: public, immutable, max-age=604800`
5. Cloudflare caches and returns to browser

## Request flow — API call

1. Browser sends `POST https://mychatbotproject.uk/login` with JSON body
2. Cloudflare forwards (no caching on POST) to VPS:443
3. Nginx matches the catch-all `/` location → rate-limits → proxies to uvicorn:8000
4. FastAPI validates Pydantic schema, runs business logic, queries PostgreSQL
5. Response JSON travels back through Nginx → Cloudflare → Browser

## Component responsibilities

| Component | Role |
|---|---|
| Cloudflare | SSL termination (browser side), CDN edge caching, DDoS protection |
| Nginx | Reverse proxy, static file serving, HTTPS (origin cert), HTTP→HTTPS redirect, rate limiting |
| uvicorn | ASGI server, runs 2 worker processes |
| FastAPI | API routing, request validation, dependency injection |
| PostgreSQL | Persistent user data storage |
| Resend | Transactional email delivery (verification emails) |

## Ports

| Port | Listener | Accessible from |
|---|---|---|
| 80 | Nginx | Public — immediately redirects to 443 |
| 443 | Nginx | Public — serves app |
| 8000 | uvicorn | Localhost only (127.0.0.1) |
| 5432 | PostgreSQL | Localhost only |

## Infrastructure code (cloud — not deployed)

The `infra/` and `infra_AI_Foundry/` directories contain Azure Bicep templates for deploying the AI/RAG workload to Azure:

- **Azure ML / AI Foundry** — model hosting
- **KEDA** — event-driven autoscaling for the inference pods
- **RBAC assignments** — least-privilege service principal permissions
