# Email Verification with Resend

This document describes how the email verification feature works and how to configure the [Resend](https://resend.com) integration from scratch.

---

## Overview

When a user registers, the backend:

1. Creates the user record in the database (`is_verified = false`).
2. Generates a signed JWT verification token (expires in `VERIFICATION_TOKEN_EXPIRE_HOURS`).
3. Calls the Resend API to send an HTML email containing a verification link.

The link points to `FRONTEND_URL/verify.html?token=<token>`. When the user clicks it, `verify.html` calls `POST /verify` with the token, the backend decodes it, and sets `is_verified = true` on the user.

Users who never clicked the link can request a new one via `POST /resend-verification`.

---

## Relevant files

| File | Role |
|---|---|
| `mail.py` | Calls `resend.Emails.send()`, builds the HTML template |
| `main.py` | `_dispatch_verification()` creates the token and calls the email service; exposes `/register`, `/verify`, `/resend-verification` |
| `auth.py` | `create_verification_token()` and `decode_verification_token()` |
| `.env.example` | Template for all required environment variables |

---

## Step-by-step configuration

### 1. Create a Resend account and get an API key

1. Go to [https://resend.com](https://resend.com) and sign up.
2. In the dashboard, navigate to **API Keys → Create API Key**.
3. Give it a name (e.g. `iatoxo-production`), set permission to **Sending access**, and click **Create**.
4. Copy the key — it starts with `re_`. You will only see it once.

### 2. Add and verify a sending domain

1. In the Resend dashboard go to **Domains → Add Domain**.
2. Enter your domain (e.g. `mychatbotproject.uk`).
3. Resend shows DNS records (SPF, DKIM). Add them at your DNS provider.
4. Click **Verify** once the records propagate (minutes to hours).
5. Only emails sent **from** a verified domain will be delivered reliably.

> For testing only, you can use Resend's sandbox address `onboarding@resend.dev` as `EMAIL_FROM`. Emails will only be delivered to the account's registered address in sandbox mode.

### 3. Set the environment variables

Edit `.env` (copy from `.env.example` if it does not exist yet):

```dotenv
# Resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx   # key from step 1
EMAIL_FROM=noreply@yourdomain.com              # must use the verified domain
EMAIL_FROM_NAME=IA-Toxo                        # display name in the "From" header

# Frontend — used to build the verification link inside the email
FRONTEND_URL=https://yourdomain.com
```

`VERIFICATION_TOKEN_EXPIRE_HOURS` (default `24`) controls how long the link stays valid.

### 4. Install the Python dependency

`resend` is already listed in `requirements.txt`:

```
resend==2.4.0
```

If setting up a fresh environment:

```bash
pip install -r requirements.txt
```

### 5. Restart the backend

```bash
uvicorn main:app --reload
```

The first call to `send_verification_email` will authenticate against the Resend API using the key from `.env`.

---

## API endpoints

### Register — triggers the first verification email

```
POST /register
Content-Type: application/json

{
  "username": "alice",
  "email": "user@example.com",
  "password": "strongpassword"
}
```

### Resend verification email

```
POST /resend-verification
Content-Type: application/json

{
  "email": "user@example.com"
}
```

Always returns `202 Accepted` with a generic message regardless of whether the email exists or is already verified — prevents user enumeration.

### Consume the verification token

```
POST /verify
Content-Type: application/json

{
  "token": "<jwt from the email link>"
}
```

Returns the updated user object with `is_verified: true` on success.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `resend.exceptions.AuthenticationError` | Invalid or missing API key | Check `RESEND_API_KEY` in `.env` |
| Email not received, no error | Sender domain not verified | Verify the domain in the Resend dashboard |
| Verification link returns "Invalid or expired token" | Token expired or `SECRET_KEY` changed | User must request a new link via `/resend-verification` |
| Verification link points to wrong host | `FRONTEND_URL` misconfigured | Set `FRONTEND_URL` to the public URL of the site |
| Email dispatch failed but user was created | Exception caught in `send_verification_email` | Check backend logs; fix config and use `/resend-verification` |

---

## How the token works internally

The verification token is a standard JWT signed with `SECRET_KEY` and `HS256`:

```json
{
  "sub": "user@example.com",
  "type": "verify",
  "iat": <unix timestamp>,
  "exp": <unix timestamp + VERIFICATION_TOKEN_EXPIRE_HOURS × 3600>
}
```

`decode_verification_token()` in `auth.py` validates the signature, checks expiry, and asserts `type == "verify"` before trusting the `sub` claim.
