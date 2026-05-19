# Backend

## Technology stack

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.12 | Runtime |
| **FastAPI** | 0.115.0 | Web framework — async, automatic OpenAPI docs |
| **uvicorn** | 0.30.6 | ASGI server |
| **SQLAlchemy** | 2.0.35 | ORM and query builder |
| **psycopg** | 3.3.4 | PostgreSQL driver (psycopg3 binary build) |
| **python-dotenv** | 1.0.1 | Load `.env` file into environment |
| **Pydantic** | (via FastAPI) | Request/response validation |
| **passlib + bcrypt** | 1.7.4 / 4.1.2 | Password hashing |
| **python-jose** | 3.3.0 | JWT creation and verification |
| **resend** | 2.4.0 | Transactional email SDK |

## Project structure

The backend uses a **flat layout** — all Python files live at the repository root:

```
Toxo_AI_code/
├── main.py        # FastAPI app factory, routes, startup
├── auth.py        # JWT encode/decode, bcrypt, Pydantic schemas
├── database.py    # SQLAlchemy engine, SessionLocal, get_db, init_db
├── models.py      # User ORM model
├── mail.py        # send_verification_email via Resend SDK
├── requirements.txt
└── .env.example
```

## Configuration

All settings are loaded from environment variables (or `.env` in the working directory) via `python-dotenv`. No secrets are ever committed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENVIRONMENT` | No | `development` | Set to `production` to disable Swagger/ReDoc |
| `SECRET_KEY` | Yes | dev fallback | Signs all JWTs — must be ≥32 random chars in production |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | Access token TTL |
| `VERIFICATION_TOKEN_EXPIRE_HOURS` | No | `24` | Email verification token TTL |
| `DATABASE_URL` | No | `sqlite:///./users.db` | SQLAlchemy URL — use `postgresql+psycopg://...` in production |
| `CORS_ORIGINS` | No | `*` (all) | Comma-separated allowed origins. Leave empty when behind nginx same-origin. |
| `RESEND_API_KEY` | Yes (for email) | — | Resend transactional email API key |
| `EMAIL_FROM` | Yes (for email) | — | Sender address, e.g. `noreply@mychatbotproject.uk` |
| `EMAIL_FROM_NAME` | No | `IA-Toxo` | Display name for outgoing emails |
| `FRONTEND_URL` | Yes (for email) | `http://localhost:8080` | Base URL for email verification links |

## API reference

### `POST /register`
Register a new user. Sends a verification email.

**Request body:**
```json
{ "username": "johndoe", "email": "user@example.com", "password": "securepass123" }
```

**Response `201`:** `UserResponse` with `is_verified: false`.

**Errors:** `409` username or email already taken.

---

### `POST /login`
Authenticate and receive a JWT.

**Request body:**
```json
{ "username": "johndoe", "password": "securepass123" }
```

**Response `200`:**
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

**Errors:** `401` wrong credentials, `400` inactive user, `403` email not verified.

---

### `POST /verify`
Verify an email address using the token from the verification email.

**Request body:**
```json
{ "token": "<jwt from email link>" }
```

**Response `200`:** `UserResponse` with `is_verified: true`.

**Errors:** `400` invalid or expired token.

---

### `POST /resend-verification`
Resend the verification email. Always returns `202` to prevent email enumeration.

**Request body:**
```json
{ "email": "user@example.com" }
```

---

### `GET /me`
Return the currently authenticated user's profile. Requires `Authorization: Bearer <token>`.

**Response `200`:** `UserResponse`

**Errors:** `401` missing or invalid token.

---

### `GET /health`
Liveness check. No authentication required.

**Response `200`:**
```json
{ "status": "ok", "service": "IA-Toxo" }
```

## Security design

- **Passwords** are hashed with bcrypt via passlib.
- **JWTs** are signed with HS256. Two token types exist — `access` and `verify` — and the `type` claim is checked on decode to prevent cross-purpose token reuse.
- **Email enumeration** is prevented on `/resend-verification` — always returns `202` regardless.
- **Swagger / ReDoc** are disabled in production (`ENVIRONMENT=production`).
- **Rate limiting** is enforced at the Nginx layer (see `deploy/nginx.conf.example`).

## Running locally

```bash
# Install dependencies
pip install -r requirements.txt

# Copy env template and fill in values
cp .env.example .env

# Start the backend (auto-creates the DB on first run)
uvicorn main:app --reload --port 8000
```
