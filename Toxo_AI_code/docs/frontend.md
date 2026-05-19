# Frontend

## Technology stack

| Technology | Purpose |
|---|---|
| **Vanilla HTML5** | Entry point (`index.html`) and email verification page (`verify.html`) |
| **Vanilla CSS3** | All styling in `style.css` |
| **Vanilla JavaScript (ES5+)** | `app.js` — no build step, no bundler, no framework |

No npm packages, no build pipeline, no transpilation. The browser loads the files directly. This keeps the frontend trivially deployable as static files alongside the Python backend.

## File structure

```
Toxo_AI_code/          ← all frontend files at the root
├── index.html         # Single-page app — login / register / dashboard
├── verify.html        # Email verification landing page (reads ?token= from URL)
├── app.js             # All frontend logic
└── style.css          # All styles
```

## How the single-page app works

`index.html` contains three sections in the same file:

- `#auth-section` — login and register tabs (visible by default)
- `#resend-section` — appears inside the login form when backend returns 403 "Email not verified"
- `#dashboard-section` — user dashboard (hidden by default)

JavaScript shows and hides these sections without any routing or page reload:

1. **Page load** → `app.js` checks `localStorage` for a saved JWT.
2. **No token** → the auth section is shown.
3. **Token found** → `GET /me` is called to validate the token against the server.
   - Success → dashboard is populated and shown.
   - Failure (expired / invalid) → token is cleared, auth section is shown.

## Email verification flow (frontend side)

1. User registers → backend sends email with link to `verify.html?token=<jwt>`.
2. `verify.html` reads the token and calls `POST /verify`.
3. On success, shows a "Go to login" link.
4. If the user tries to log in before verifying, the backend returns 403 → the resend section appears in the login form, letting the user enter their email and call `POST /resend-verification`.

## API base URL

```js
// app.js
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
```

In production the API is on the same origin (nginx routes non-static requests to uvicorn), so the base URL is empty and all calls are relative — no CORS needed.

In local development the backend runs on port 8000, so the override applies.

## Local development

No build step required. Serve the repo root with any static file server while the backend runs separately:

```bash
# Option 1 — Python built-in
python3 -m http.server 8080

# Then in another terminal
uvicorn main:app --reload --port 8000
```

Open `http://localhost:8080` in your browser. The API calls automatically go to `http://localhost:8000`.
