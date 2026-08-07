# Quickstart — Validation Guide

How to stand this up locally and prove it works. Ten scenarios, each tied to the success criteria
it demonstrates. This is a validation guide, not an implementation guide — the code lives in
`tasks.md` and the implementation phase.

---

## Prerequisites

- Python 3.11+, ~4 GB free RAM locally (Neo4j and the embedding model are the consumers)
- Docker, for Neo4j
- A Hugging Face account with a token that can read the private fine-tuned repository
- A Resend API key (or `EMAIL_DRY_RUN=1`, which logs emails instead of sending them)
- The fine-tuned model already in the private repository. It is produced beforehand by running
  the notebook `training_model/finetune_llama32_1b.ipynb` on the owner's laptop GPU (RTX 2070
  Mobile, 8 GB — FR-105); the notebook saves the model under `training_model/` (git-ignored) and
  pushes it to the private repository these scenarios read from.

```bash
# Neo4j
docker run -d --name toxo-neo4j -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/localdevpassword \
  -e NEO4J_server_memory_heap_max__size=512m \
  -e NEO4J_server_memory_pagecache_size=512m \
  neo4j:5-community

# Application
cd Toxo_AI_code
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env        # fill in HF_API_TOKEN, SECRET_KEY, NEO4J_*, ADMIN_NOTIFICATION_EMAIL

cd backend_files            # REQUIRED — the SQLite path and data dirs are CWD-relative
alembic upgrade head
uvicorn main:app --reload --port 8000
```

Serve the frontend from `Toxo_AI_code/frontend_files` on port 8080 (`python -m http.server 8080`).

---

## Scenario 1 — Build the knowledge base

**Proves**: FR-021 to FR-025, SC-008 (unattended rebuild under 60 minutes)

```bash
cd Toxo_AI_code/backend_files
python -m knowledge.build --sources ../../text/monografia.pdf --cases ../../logs/request-logs.csv
```

Expect: a build id, then counts for sources processed, entities, relationships, case records
indexed, and units skipped. 24 case records indexed, 0 skipped. `GET /health` reports
`knowledge_base: ready`.

**Also check**: `GET /api/v1/admin/builds` shows the same statistics. A build that reports success
while the graph is empty is the failure this scenario exists to catch — verify in the Neo4j
browser that `MATCH (c:CaseRecord) RETURN count(c)` returns 24.

---

## Scenario 2 — A failed build leaves the previous one serving

**Proves**: FR-023, SC-009

```bash
python -m knowledge.build --sources ./tests/fixtures/malformed.pdf --fail-at extraction
```

Expect: the build fails with a specific reason, the active generation pointer does **not** move,
and `POST /api/v1/chat` still answers from the previous build. Repeat with `--fail-at` set to each
stage — SC-009 requires a failure injected at *every* stage, not just one.

---

## Scenario 3 — Registration is closed and requires approval

**Proves**: FR-004 to FR-006, FR-085, FR-086, SC-006

```bash
curl -X POST localhost:8000/api/v1/auth/register-request \
  -H 'Content-Type: application/json' \
  -d '{"username":"dr-test","email":"test@example.org","details":"Paediatrician"}'
```

Expect `202`. Then verify, in order:

1. No `User` row exists yet — `sqlite3 users.db "select count(*) from users where email='test@example.org'"` returns 0.
2. Sign-in with that address fails.
3. The Administrator notification appears (in the Resend dashboard, or the log under `EMAIL_DRY_RUN`).
4. Approve via `POST /api/v1/admin/registration-requests/{id}/approve` → the `User` is created and
   the verification email is sent.
5. Sign-in still fails until the link is followed. Then it succeeds.
6. Submit the same request 20 times rapidly → `429`, and **no further Administrator emails**.
7. Repeat step 1 with an address that already has an account — the response body is byte-identical
   to the new-address case. Any difference is an enumeration oracle.

---

## Scenario 4 — Classify a case

**Proves**: FR-043 to FR-045, FR-063, FR-064, SC-011, SC-020

```bash
curl -X POST localhost:8000/api/v1/classify -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "findings": {"fundoscopic":"Normal","neuroimaging":"Normal","pcr_la":"None",
      "first_igm":"Positive","first_igg":"Positive","first_avidity":"Low","first_weeks":12,
      "last_igm":"Positive","last_igg":"Positive","post_igm":"Positive","post_igg":"Positive",
      "child_igm":"Positive","child_iga":"Negative","child_igg":"Positive"}}'
```

Expect a maternal classification, a child classification, canonical Portuguese argumentation and
recommendation, `driving_findings`, an explanation citing at least one thesis passage or historical
case, `safety_notice`, and all four `versions` fields.

**Then check the negative paths:**

```bash
# invalid value → 422 naming the permitted values, NOT coerced
... -d '{"findings": {... "first_igm":"Maybe" ...}}'
# missing finding → 422 naming the specific missing field, NOT defaulted
... -d '{"findings": {"fundoscopic":"Normal"}}'
```

---

## Scenario 5 — Replay all 24 historical cases

**Proves**: SC-015 — the primary clinical safety gate

```bash
cd eval && python replay.py --endpoint $ENDPOINT_URL --out results/replay-$(date +%F).json
```

Expect **24/24** matching the recorded maternal and child classifications. Any mismatch blocks
release until fixed or signed off in writing after clinical review.

**Read the result honestly**: 19 of these 24 rows are training material. A perfect score here
proves the absence of regression, not that the model generalises. Scenario 7 is the one that
speaks to generalisation.

---

## Scenario 6 — Determinism, measured two ways

**Proves**: FR-066, SC-016

```bash
# (a) with the cache active — proves the doctor-facing guarantee
python -c "…submit identical findings 20 times…"

# (b) with the cache bypassed — proves the MODEL is deterministic
curl -X POST … -H "X-Bypass-Classification-Cache: true"   # ×20, admin token
```

Both must return 20 identical classifications. **Run (b) is the one that matters.** Run (a) passes
whether or not the model is deterministic, because the cache makes it pass by construction — so
reporting only (a) would be self-deception (research.md R2).

---

## Scenario 7 — Held-out evaluation

**Proves**: SC-023 — the only evidence of generalisation

```bash
cd eval && python heldout.py --split split.v1.json --endpoint $ENDPOINT_URL
```

Runs the 5 tuples the model never saw: records 17, 5, 13, 21, and 24.

Expect the output to report the score **and** `unmeasured_classes: ["1","3","7","16","18","20"]`.
A run that reports a score without that list is non-compliant with Principle VII and the harness
should refuse to emit it.

**Verify the split is honest before trusting the score:**

```bash
python split.py --verify    # regenerates and diffs against split.v1.json; must be byte-identical
```

---

## Scenario 8 — Doctors cannot reach the corpus or each other

**Proves**: FR-014, FR-053, FR-082, SC-007

```bash
curl -X POST localhost:8000/api/v1/documents/upload -H "Authorization: Bearer $DOCTOR_TOKEN" -F file=@x.pdf
# expect 404 — the route does not exist, not 403
```

Then exercise **every** admin route with a Doctor token and expect `403` on each — SC-007 requires
all of them, not a sample. Read another doctor's conversation by id and expect `404`, not `403`.

---

## Scenario 9 — No patient identifiers reach storage

**Proves**: FR-048 to FR-051, FR-073, SC-010

```bash
cd Toxo_AI_code/backend_files && python -m tests.identifier_injection
```

Submits deliberate identifier-laden free text — names with honorifics, dates of birth, NHS
numbers, phone numbers, emails, postcodes — then inspects **every** stored row in conversation
history and `new_outputs.csv`, plus every line of the operational log.

Expect: zero identifiers in storage, zero submitted or returned content in logs, and a warning
surfaced to the doctor before processing. SC-010 requires checking every row, not sampling — the
test asserts on the full table.

---

## Scenario 10 — Cold start and explicit failure

**Proves**: FR-099, FR-100, FR-040, SC-003

Leave the endpoint idle until it scales to zero, then submit a classification.

Expect `202` with `state: model_starting` within 2 seconds, the question preserved, a "model
starting" state in the UI, and completion within 180 seconds. Then force a failure
(`HF_ENDPOINT_URL` pointed at an unreachable host) and expect `502` with an explicit message —
**never** a fabricated answer or an ungrounded fallback.

---

## Before calling any of this done

- [ ] `pytest` green — unit and integration suites
- [ ] Scenarios 5, 6(b), 7, and 9 pass: the four that are release gates rather than smoke tests
- [ ] Secrets rotated and moved out of the systemd unit into a root-owned mode-600
      `EnvironmentFile` (Principle I — the current inline secrets have been world-readable)
- [ ] The old system prompt line "Do not provide personal medical diagnoses" is gone; it
      contradicts Principle III as amended
- [ ] Resident memory measured on the VM with Neo4j running — if the 4 GB budget in research.md R5
      does not hold, resize before deploying and revisit SC-014
- [ ] **Deployment parity**: diff `/var/www/mychatbotproject/` against the repository and exercise
      the running service. The repository is not the deploy target, and `alembic upgrade head`
      must be run against the production database explicitly — copying files and restarting the
      unit will not run migrations
