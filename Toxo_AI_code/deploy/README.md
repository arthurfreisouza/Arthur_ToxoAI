# Deployment — Hostinger VPS

This is the one-time deployment recipe for the FastAPI + Postgres + nginx + Let's Encrypt stack.
Replace `yourdomain.com` with your actual domain throughout.

## 1. System packages

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip postgresql nginx certbot python3-certbot-nginx
```

## 2. PostgreSQL — user and database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER iatoxo WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE iatoxo OWNER iatoxo;
SQL
```

Test the connection from the app user:
```bash
psql "postgresql://iatoxo:CHANGE_ME_STRONG_PASSWORD@localhost/iatoxo" -c '\l'
```

## 3. App user and code layout

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin iatoxo
sudo mkdir -p /srv/iatoxo
sudo chown iatoxo:iatoxo /srv/iatoxo

# Clone (or rsync) the repo so that:
#   /srv/iatoxo/backend  ← contents of the repo's backend/ folder
#   /srv/iatoxo/frontend ← contents of the repo's frontend/ folder
```

## 4. Backend virtualenv + dependencies

```bash
sudo -u iatoxo bash <<'EOS'
cd /srv/iatoxo/backend
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
EOS
```

## 5. Environment file

```bash
sudo -u iatoxo cp /srv/iatoxo/backend/.env.example /srv/iatoxo/backend/.env
sudo chmod 600 /srv/iatoxo/backend/.env
sudo -u iatoxo nano /srv/iatoxo/backend/.env
```

Fill in:
- `SECRET_KEY` — `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- `DATABASE_URL` — `postgresql+psycopg://iatoxo:CHANGE_ME_STRONG_PASSWORD@localhost:5432/iatoxo`
- `ENVIRONMENT=production`
- `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL=https://yourdomain.com`
- Leave `CORS_ORIGINS=[]` since the frontend is same-origin behind nginx.

## 6. Run migrations

```bash
sudo -u iatoxo bash -c 'cd /srv/iatoxo/backend && set -a && source .env && set +a && .venv/bin/alembic upgrade head'
```

## 7. systemd service

```bash
sudo cp deploy/iatoxo-backend.service.example /etc/systemd/system/iatoxo-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now iatoxo-backend
sudo systemctl status iatoxo-backend
curl -sf http://127.0.0.1:8000/health
```

## 8. nginx + TLS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/iatoxo.conf
sudo nano /etc/nginx/sites-available/iatoxo.conf   # set your real server_name
sudo ln -sf /etc/nginx/sites-available/iatoxo.conf /etc/nginx/sites-enabled/iatoxo.conf
sudo nginx -t && sudo systemctl reload nginx

# Issue Let's Encrypt cert
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo systemctl reload nginx
```

## 9. Resend setup (out-of-band, one-time)

1. Create an account at https://resend.com.
2. Add and verify your sending domain (DNS records: SPF + DKIM, optional DMARC).
3. Create an API key and put it in `.env` (`RESEND_API_KEY=`).
4. Set `EMAIL_FROM` to something like `noreply@yourdomain.com`. The sender domain **must** be a verified Resend domain.

Smoke test from the VPS:
```bash
curl -X POST https://yourdomain.com/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","username":"you","password":"longenoughpw"}'
```
You should receive the verification email within seconds. Clicking the link lands on `/verify.html?token=...` and activates the account.

## 10. Upgrades

For code-only changes:
```bash
cd /srv/iatoxo && sudo -u iatoxo git pull
sudo systemctl restart iatoxo-backend
sudo systemctl reload nginx   # only if frontend or nginx config changed
```

For changes that include new migrations:
```bash
sudo -u iatoxo bash -c 'cd /srv/iatoxo/backend && set -a && source .env && set +a && .venv/bin/alembic upgrade head'
sudo systemctl restart iatoxo-backend
```

## 11. Backups

PostgreSQL nightly dump (root crontab):
```cron
30 3 * * * sudo -u postgres pg_dump iatoxo | gzip > /var/backups/iatoxo-$(date +\%F).sql.gz && find /var/backups -name 'iatoxo-*.sql.gz' -mtime +14 -delete
```
