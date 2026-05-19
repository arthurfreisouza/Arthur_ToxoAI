# Authentication

## Overview

IA-Toxo uses a **JWT-based authentication** flow with mandatory email verification before a user can log in.

## Registration flow

```
Browser                    Backend                     Resend (email)
   │                          │                              │
   │  POST /register           │                              │
   │  {username, email, pwd}  │                              │
   │─────────────────────────►│                              │
   │                          │  1. Check username + email uniqueness (→ 409 if taken)
   │                          │  2. Hash password with bcrypt
   │                          │  3. INSERT user (is_verified=false)
   │                          │  4. Create verification JWT (type="verify", 24h TTL)
   │                          │─────────────────────────────►│
   │                          │                              │  Send HTML email
   │                          │                              │  with verify link
   │◄─────────────────────────│                              │
   │  201 UserResponse        │                              │
   │  (is_verified: false)    │                              │
```

## Email verification flow

The verification link in the email points to:
```
https://mychatbotproject.uk/verify.html?token=<jwt>
```

`verify.html` reads the `token` query parameter and calls `POST /verify`:

```
Browser                    Backend
   │                          │
   │  POST /verify             │
   │  {token: "<jwt>"}        │
   │─────────────────────────►│
   │                          │  1. Decode JWT, check type="verify"
   │                          │  2. Extract email from "sub" claim
   │                          │  3. Look up user by email
   │                          │  4. Set is_verified=true, verified_at=now()
   │◄─────────────────────────│
   │  200 UserResponse        │
   │  (is_verified: true)     │
```

If the token is expired or tampered, the backend returns `400 Bad Request`.

## Login flow

```
Browser                    Backend
   │                          │
   │  POST /login              │
   │  {username, password}    │
   │─────────────────────────►│
   │                          │  1. Look up user by username
   │                          │  2. verify_password(plain, hashed)  → 401 if wrong
   │                          │  3. Check is_active                 → 400 if disabled
   │                          │  4. Check is_verified               → 403 if not verified
   │                          │  5. Create access JWT (type="access", 30min TTL)
   │◄─────────────────────────│
   │  200 Token               │
   │  {access_token, ...}     │
```

If login fails with **403 "Email not verified"**, the frontend shows a resend-verification form.

## Resend verification

```
POST /resend-verification
{"email": "user@example.com"}
```

Always returns `202` — even if the email is not registered or already verified. This prevents email enumeration.

## Authenticated requests

The frontend attaches the access token as a Bearer token on every authenticated request:

```
Authorization: Bearer <access_jwt>
```

The `GET /me` endpoint:
1. Extracts the token from the `Authorization` header.
2. Decodes and validates the JWT (signature + expiry + `type="access"`).
3. Parses the `sub` claim as the username.
4. Loads the user from the database and returns it.

## JWT structure

Both token types share the same shape:

```json
{
  "sub": "<username or email>",
  "type": "access" | "verify",
  "iat": 1716120000,
  "exp": 1716123600
}
```

- **Access tokens**: `sub` = username, `type = "access"`
- **Verification tokens**: `sub` = email address, `type = "verify"`

The `type` claim prevents a verification token from being used as an access token and vice versa.

## Token storage

The access token is stored in `localStorage` under the key `token`. On each page load, `app.js` reads it and calls `GET /me` to validate it server-side before showing the dashboard.

## Password security

- Passwords are hashed with **bcrypt** via `passlib`.
- The raw password is never stored or logged.
- `hashed_password` is never included in any API response (`UserResponse` deliberately omits it).
