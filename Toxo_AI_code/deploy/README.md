# Deployment — Hostinger VPS

One-time recipe for the FastAPI + PostgreSQL + nginx + Let's Encrypt stack.
Replace `yourdomain.com` with your actual domain throughout.

The app lives in a **flat directory** (`/srv/iatoxo/`) — Python files, static files, and the virtual environment all sit side by side.

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

Test the connection:
```bash
psql "postgresql://iatoxo:CHANGE_ME_STRONG_PASSWORD@localhost/iatoxo" -c '\l'
```

## 3. App user and directory

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin iatoxo
sudo mkdir -p /srv/iatoxo
sudo chown iatoxo:iatoxo /srv/iatoxo

# Copy repo files to /srv/iatoxo (all files from the repo root go here)
sudo rsync -a --exclude='.git' --exclude='.venv' --exclude='toxoenv' \
     --exclude='__pycache__' --exclude='users.db' \
     /root/Arthur_ToxoAI/Toxo_AI_code/ /srv/iatoxo/
sudo chown -R iatoxo:iatoxo /srv/iatoxo
```

## 4. Virtual environment + dependencies

```bash
sudo -u iatoxo bash <<'EOS'
cd /srv/iatoxo
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
EOS
```

## 5. Environment file

```bash
sudo -u iatoxo cp /srv/iatoxo/.env.example /srv/iatoxo/.env
sudo chmod 600 /srv/iatoxo/.env
sudo -u iatoxo nano /srv/iatoxo/.env
```

Fill in:
- `SECRET_KEY` — `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- `DATABASE_URL` — `postgresql+psycopg://iatoxo:CHANGE_ME_STRONG_PASSWORD@localhost:5432/iatoxo`
- `ENVIRONMENT=production`
- `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL=https://yourdomain.com`
- Leave `CORS_ORIGINS=` empty (same-origin setup behind nginx)

## 6. Initialize the database

SQLAlchemy creates the tables automatically on first startup via `init_db()`. No migration tool needed.

```bash
sudo systemctl start iatoxo-backend   # after step 7 below
# Or run once manually to verify:
sudo -u iatoxo bash -c 'cd /srv/iatoxo && set -a && source .env && set +a && .venv/bin/python -c "from database import init_db; init_db(); print(\"DB OK\")"'
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

## 9. Resend setup (one-time, out-of-band)

1. Create an account at https://resend.com.
2. Add and verify your sending domain (DNS: SPF + DKIM records).
3. Create an API key and put it in `/srv/iatoxo/.env` (`RESEND_API_KEY=`).
4. Set `EMAIL_FROM=noreply@yourdomain.com` (sender domain **must** be verified in Resend).

Smoke test from the VPS:
```bash
curl -X POST https://yourdomain.com/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","email":"you@example.com","password":"longenoughpw"}'
```
You should receive the verification email within seconds.

## 10. Upgrading

```bash
cd /srv/iatoxo
sudo -u iatoxo git pull origin master2
sudo systemctl restart iatoxo-backend
sudo systemctl reload nginx   # only if static files or nginx config changed
```

## 11. Backups (PostgreSQL)

Add to root crontab (`crontab -e`):
```cron
30 3 * * * sudo -u postgres pg_dump iatoxo | gzip > /var/backups/iatoxo-$(date +\%F).sql.gz && find /var/backups -name 'iatoxo-*.sql.gz' -mtime +14 -delete
```
