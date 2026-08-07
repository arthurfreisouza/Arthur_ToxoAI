# Contracts

Interface contracts for the Congenital Toxoplasmosis Clinical Knowledge Assistant.

| File | Covers |
|---|---|
| [api-v1.md](./api-v1.md) | Every HTTP endpoint — paths, bodies, status codes, authorisation |
| [classification.md](./classification.md) | The classification request/response contract and its validation rules |
| [corpus-split.md](./corpus-split.md) | The fixed train/test split artefact and its verification rule |

## Rules that apply to all of them

- Every request and response body is a Pydantic model. Input rules live in validators, not in
  endpoint bodies (Principle IV).
- All user-facing routes sit under `/api/v1`. Only `/` and `/health` are exempt.
- Every `HTTPException` carries a user-readable `detail` and a semantically correct status:
  401 bad credentials · 403 unverified, unacknowledged, or unauthorised · 404 not found ·
  409 conflicting state · 413 payload too large · 422 invalid findings ·
  429 rate limited · 502 upstream model failure · 503 unconfigured or knowledge base not ready.
- Breaking changes require `/api/v2`. Documented `/api/v1` shapes do not change silently.
- No endpoint accepts, returns, or stores a direct patient identifier (FR-048).
