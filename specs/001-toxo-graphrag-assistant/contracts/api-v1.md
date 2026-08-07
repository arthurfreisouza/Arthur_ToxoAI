# HTTP API Contract — `/api/v1`

Authorisation column: **public** = no token · **doctor** = valid token, verified, not revoked,
acknowledgement recorded · **admin** = role `administrator`.

---

## Authentication and registration

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register-request` | public | Submit a registration request (FR-004) |
| GET | `/api/v1/auth/verify-email?token=` | public | Follow the verification link (FR-006) |
| POST | `/api/v1/auth/login` | public | Sign in (FR-007) |
| GET | `/api/v1/auth/me` | doctor | Current account |
| POST | `/api/v1/auth/password-reset/request` | public | Request a reset link (FR-010) |
| POST | `/api/v1/auth/password-reset/confirm` | public | Complete a reset |
| POST | `/api/v1/auth/acknowledge` | doctor | Record the FR-047 acknowledgement |

### `POST /auth/register-request`

```jsonc
// request
{ "username": "dr-silva", "email": "silva@hospital.example", "details": "Paediatrician, HC-UFMG" }
// 202 — always this shape, whatever the outcome
{ "message": "Your request has been submitted for review." }
```

**The response is uniform** whether the address is new, already requested, or already an account.
Anything else turns this endpoint into an account-enumeration oracle.

- `429` when the per-IP or per-address rate limit is exceeded. **No Administrator notification is
  sent for a refused request** (FR-086).
- If the Administrator notification fails to send, the request is still persisted as `pending`
  with `notification_sent = false` and the caller still receives `202`. The request must not be
  lost with the email.
- No `User` row is created here (FR-004).

### `POST /auth/login`

`401` bad credentials — without revealing which element was wrong (FR-007).
`403` unverified, revoked, or acknowledgement not recorded, each with a distinct `detail`.
`429` rate limited (FR-011).

---

## Classification — the primary path

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/classify` | doctor | Submit findings, receive a classification (FR-043) |
| GET | `/api/v1/classify/{job_id}` | doctor | Poll while the model endpoint starts (FR-099) |
| POST | `/api/v1/classify/{event_id}/mark-incorrect` | doctor | Flag a result as clinically incorrect (FR-071) |

Full request and response shapes: [classification.md](./classification.md).

**Cold-start behaviour** (R8, FR-099): when the model endpoint is scaled to zero, `POST /classify`
returns `202` with `{"job_id": "...", "state": "model_starting"}` and holds the submitted
findings. The client polls `GET /classify/{job_id}`, which returns `state` of `model_starting`,
`complete`, or `failed`. Bounded at 180 s, then `502` under FR-040 — never a fallback answer.

**Cache bypass**: `X-Bypass-Classification-Cache: true` is honoured for **admin only** and is how
the evaluation harness measures real determinism rather than cache identity (R2).

---

## Free-text educational questions

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/chat` | doctor | Ask a grounded question (FR-033) |

```jsonc
// request
{ "conversation_id": 12, "message": "How is congenital toxoplasmosis excluded in an asymptomatic newborn?" }
// 200
{
  "answer": "…",
  "language": "en",
  "attributions": [
    { "id": "thesis:p42:§3.2", "source_type": "thesis_passage", "ref": "p. 42, §3.2", "snippet": "…" },
    { "id": "case:14", "source_type": "case_record", "ref": "record 14", "snippet": "…" }
  ],
  "evidence_strength": "thin",       // FR-039 — set when few records match
  "build_id": 7
}
```

- `422` over the length bound, with the limit stated (FR-033).
- Out-of-scope questions return `200` with a scope restatement, not an error — a decline is a
  valid answer (FR-035).
- When the corpus cannot support an answer, `answer` says so plainly and `attributions` is empty
  (FR-036). The endpoint never fills the gap from general knowledge.
- `503` when no successful build exists (FR-060).
- `502` on model failure or timeout — never a fabricated answer (FR-040).
- Every substantive claim carries an attribution the client can expand (FR-037).

---

## Conversations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/conversations` | doctor | List, most recent first (FR-052) |
| POST | `/api/v1/conversations` | doctor | Create |
| GET | `/api/v1/conversations/{id}` | doctor | Read with attributions intact (FR-054) |
| PATCH | `/api/v1/conversations/{id}` | doctor | Rename (FR-055) |
| DELETE | `/api/v1/conversations/{id}` | doctor | Delete content (FR-055) |
| GET | `/api/v1/conversations/{id}/export` | doctor | Self-contained export (FR-056) |
| POST | `/api/v1/messages/{id}/feedback` | doctor | Mark helpful or not (FR-057) |

Every one of these filters by the authenticated `user_id`. Another doctor's conversation returns
`404`, not `403` — existence is not disclosed (FR-053).

---

## Administration

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/registration-requests` | admin | List, filterable by state |
| POST | `/api/v1/admin/registration-requests/{id}/approve` | admin | Create the account, send the link (FR-004) |
| POST | `/api/v1/admin/registration-requests/{id}/reject` | admin | Close, create nothing (FR-085) |
| GET | `/api/v1/admin/accounts` | admin | List accounts |
| POST | `/api/v1/admin/accounts/{id}/revoke` | admin | Revoke; effective within 5 min (FR-009) |
| GET | `/api/v1/admin/sources` | admin | Indexed sources and their state (FR-025) |
| POST | `/api/v1/admin/sources` | admin | Add or replace a source (FR-021) |
| DELETE | `/api/v1/admin/sources/{id}` | admin | Remove a source |
| POST | `/api/v1/admin/builds` | admin | Trigger a full rebuild (FR-021) |
| GET | `/api/v1/admin/builds` | admin | Build history and statistics (FR-024) |
| GET | `/api/v1/admin/metrics` | admin | Volume and failure rates, no content (FR-061) |
| GET | `/api/v1/admin/feedback` | admin | Aggregate answer feedback (FR-057) |
| GET | `/api/v1/admin/training-rows` | admin | Captured rows, review state (FR-071) |
| DELETE | `/api/v1/admin/training-rows/{id}` | admin | Honour an erasure request (FR-076) |
| GET | `/api/v1/admin/evaluations` | admin | Stored evaluation results (FR-095) |
| POST | `/api/v1/admin/evaluations` | admin | Import a harness result file |

Every admin route returns `403` for a Doctor token, verified by exercising each one against a
Doctor account (SC-007).

### `GET /admin/evaluations`

```jsonc
{
  "runs": [{
    "run_at": "2026-08-06T12:00:00Z",
    "benchmark_version": "questions.v1",
    "split_version": "split.v1",
    "models": [
      { "id": "toxoai-llama32-1b-ft", "replay_24": 1.0, "heldout_5": 0.6,
        "benchmark_consistency": 0.88, "fabricated_citations": 0 },
      { "id": "meta-llama/Llama-3.2-1B-Instruct", "replay_24": 0.29, "heldout_5": 0.2,
        "benchmark_consistency": 0.51, "fabricated_citations": 3 }
    ],
    "unmeasured_classes": ["1", "3", "7", "16", "18", "20"]
  }]
}
```

`unmeasured_classes` is **required**, and the UI must render it beside the score. Principle VII
forbids a headline number implying coverage the data cannot support, and six of the nine outcome
classes are untested (data-model.md §4).

---

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | `{"status":"ok","knowledge_base":"ready"\|"not_ready"\|"building"}` (FR-059) |
| GET | `/` | public | Name and version |

The two signals are distinct: the application can be reachable while the knowledge base is not
ready to answer.

---

## Removed in this feature

| Method | Path | Why |
|---|---|---|
| POST | `/api/v1/documents/upload` | FR-082 — doctors do not curate the corpus |
| GET | `/api/v1/documents` | FR-082 |
| DELETE | `/api/v1/documents/{id}` | FR-082 |

Deleted along with the router, the frontend upload UI, the `documents` table, and the per-user
FAISS stores. A `410 Gone` shim is **not** provided — Principle II is better served by the route
not existing.
