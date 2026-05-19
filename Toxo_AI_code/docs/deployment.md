# Deployment

## Infrastructure overview

| Layer | Technology | Role |
|---|---|---|
| DNS + CDN | Cloudflare | Domain resolution, edge caching, DDoS protection |
| SSL (browser→Cloudflare) | Cloudflare managed cert | HTTPS for end users |
| SSL (Cloudflare→VPS) | Let's Encrypt (certbot) | HTTPS on the origin server |
| Web server | Nginx 1.24 (Ubuntu) | Reverse proxy + static file serving |
| App server | uvicorn 0.30.6 | ASGI server, 2 workers |
| Process manager | systemd | Auto-start and restart on failure |
| Runtime | Python 3.12 (venv) | Backend application |
| Database | PostgreSQL 16 | User data |
| OS | Ubuntu 24.04 LTS | VPS operating system |

## Directory layout on the server

```
/srv/iatoxo/                 ← flat layout: everything here
├── main.py
├── auth.py
├── database.py
├── models.py
├── email.py
├── requirements.txt
├── .env                     ← secrets (chmod 600, owned by iatoxo)
├── .venv/                   ← Python virtual environment
│
├── index.html               ← frontend entry point (served by nginx)
├── verify.html              ← email verification page
├── app.js
└── style.css
```

All files are owned by the `iatoxo` system user (no login shell, no home directory).

## Nginx configuration

Config file: `/etc/nginx/sites-available/iatoxo.conf`

**HTTP server (port 80)** — redirects everything to HTTPS except the ACME challenge path.

**HTTPS server (port 443)**:

| Location | Behaviour |
|---|---|
| `/` | Serves `/srv/iatoxo/index.html` |
| `/verify.html` | Serves the email verification page |
| `*.css` / `*.js` | Static files, 7-day browser cache (`public, immutable`) |
| `/health` | Proxied to uvicorn, access log disabled |
| Everything else | Rate-limited, proxied to uvicorn on port 8000 |
| `/docs`, `/redoc`, `/openapi.json` | Returns 404 (Swagger hidden in production) |

**Security headers set by Nginx:**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

## systemd service

File: `/etc/systemd/system/iatoxo-backend.service`

```
WorkingDirectory=/srv/iatoxo
ExecStart=/srv/iatoxo/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2 ...
```

Useful commands:

```bash
journalctl -u iatoxo-backend -f        # live logs
systemctl restart iatoxo-backend       # restart after code change
systemctl status iatoxo-backend        # check status
```

## SSL certificate

Issued by **Let's Encrypt** via certbot. Covers `mychatbotproject.uk` and `www.mychatbotproject.uk`.

- Auto-renewed by a certbot systemd timer.
- Test renewal: `certbot renew --dry-run`

## Cloudflare configuration

- **SSL/TLS mode:** Full (Strict) — Cloudflare validates the origin certificate.

> **Important:** Never set SSL mode to "Flexible" — it causes an HTTP redirect loop.

## Deploying updates

```bash
# 1. Pull the latest code
cd /srv/iatoxo && sudo -u iatoxo git pull origin master2

# 2. Install any new Python dependencies
sudo -u iatoxo /srv/iatoxo/.venv/bin/pip install -r /srv/iatoxo/requirements.txt

# 3. Restart the backend
systemctl restart iatoxo-backend

# 4. Reload nginx if config changed
nginx -t && systemctl reload nginx
```

## Environment secrets

Secrets live in `/srv/iatoxo/.env` (permissions `600`, owned by `iatoxo`). Never commit this file.

To rotate the `SECRET_KEY` (invalidates all existing JWTs — users will be logged out):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
# Paste output as SECRET_KEY in /srv/iatoxo/.env
systemctl restart iatoxo-backend
```

## Initial setup (from scratch)

See the full step-by-step guide in `deploy/README.md`.
