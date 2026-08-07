# Implementation Plan: Congenital Toxoplasmosis Clinical Knowledge Assistant

**Branch**: `001-toxo-graphrag-assistant` | **Date**: 2026-08-06 (updated 2026-08-07) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-toxo-graphrag-assistant/spec.md`

**Constitution**: v2.1.0 — [.specify/memory/constitution.md](../../.specify/memory/constitution.md)

---

## Summary

Turn the existing educational chatbot at `mychatbotproject.uk` into a closed clinical
decision-support classifier. An authorised doctor submits a patient's de-identified serological
and clinical findings and receives a maternal classification, a child classification, an
argumentation, and a recommendation — produced by a fine-tuned Llama 3.2 1B model, grounded and
explained by GraphRAG over a Neo4j knowledge graph built from the project thesis and 24
historical case records.

The technical approach has four strands that can proceed largely in parallel:

1. **Application rework** — retire per-user uploads and the documents router, add roles,
   replace self-service registration with request-then-approve, and add conversations,
   attributions, audit, and admin surfaces. This is the largest strand by volume and touches a
   live system.
2. **Knowledge pipeline** — a build that ingests the thesis by LLM extraction and the CSV
   deterministically into one joined Neo4j graph plus a FAISS index, generation-tagged so a
   failed build never disturbs the one currently serving.
3. **Model strand (offline)** — LoRA fine-tune of Llama 3.2 1B Instruct on 13 of the 18 distinct
   input tuples, run **locally on the owner's laptop GPU** (RTX 2070 Mobile, 8 GB) in a Jupyter
   notebook kept with the saved model in `training_model/` (FR-105–FR-107), then published to a
   private Hugging Face repository and served from a scale-to-zero Inference Endpoint.
4. **Evaluation harness (offline)** — the fixed benchmark, the 24-case replay, and the held-out
   comparison against vanilla Llama, GPT, and Gemini, whose results are stored and surfaced to
   the Administrator but which never runs on the production host.

The design decision that carries the most weight is in **research.md R1**: the model chooses the
*classification*, and the canonical Portuguese argumentation and recommendation are then rendered
from a checked-in lookup keyed by that classification pair. This is what lets FR-084 (the model
alone classifies) and SC-019 (100% of output inside the permitted value sets) both hold, without
asking a 1-billion-parameter model to compose clinical prose freely.

---

## Technical Context

**Language/Version**: Python 3.11+ (backend and offline pipelines); ES2020 vanilla JavaScript
(frontend, no build step)

**Primary Dependencies**: Existing — FastAPI 0.109, SQLAlchemy 2.0, python-jose, passlib/bcrypt,
FAISS-cpu, sentence-transformers, LangChain (loaders/splitters only), pypdf, Resend, OpenAI SDK
(used as the HTTP client for the Hugging Face router). Added — `neo4j` (official driver),
`alembic` (schema migrations), `pytest` + `httpx` (tests). Offline only, not installed on the
production host — `transformers`, `peft`, `trl`, `datasets`, `accelerate`, `huggingface_hub`,
and `jupyter` for the training notebook. Training runs on the owner's laptop (RTX 2070 Mobile,
8 GB VRAM, fp16 LoRA — research.md R3); no cloud training service.

**Storage**: SQLite via SQLAlchemy ORM as the system of record (accounts, registration requests,
conversations, messages, attributions, builds, audit, evaluation runs). Neo4j Community as the
knowledge graph. FAISS flat index on disk for vector retrieval. Append-only CSV for captured
training data (`new_outputs.csv`), schema-compatible with `logs/request-logs.csv`.

**Testing**: pytest with httpx against a FastAPI test client; SQLite temp file per test session.
Three suites — unit (validators, split, identifier stripping), integration (auth flows, RBAC,
build lifecycle), and the clinical regression gate (24-case replay + held-out evaluation), which
runs offline against a live endpoint rather than in unit CI.

**Target Platform**: Single Linux VM (Azure B2s class, 2 vCPU / 4 GB) behind nginx terminating
TLS at `mychatbotproject.uk`. Production serves from `/var/www/mychatbotproject/`, a manual copy
that is **not** a git checkout.

**Project Type**: Web service (FastAPI) + static SPA + two offline pipelines (knowledge build,
model training/evaluation).

**Performance Goals**: SC-003 — 95% of questions answered within 20 s against a warm model
endpoint, visible progress within 2 s; a cold start is exempt from the 20 s target but must show
progress within 2 s and complete or fail within 3 minutes. SC-008 — full corpus rebuild
unattended within 60 minutes.

**Constraints**: SC-014 — under £40/month recurring, counting VM, Neo4j, and the scale-to-zero
endpoint. **4 GB of RAM must hold Neo4j, the embedding model, and the application at once** —
this is the tightest constraint in the plan and is addressed in research.md R5. SC-015/SC-016 —
100% historical replay and bit-identical output for identical input, both hard release gates.

**Scale/Scope**: Tens of doctors. Corpus of one thesis (~100 pages) plus 24 case records holding
18 distinct input tuples. Expected graph size in the low thousands of nodes and edges.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| # | Principle | Gate | Verdict |
|---|---|---|---|
| I | Security & Privacy First | Secrets from environment; bcrypt; shared `get_current_user`; admin-authorised registration; CORS scoped; no direct patient identifiers, stripped on the write path; content out of logs; rate limits | **PASS with two pre-existing violations to fix** — see below |
| II | Shared Corpus, Isolated Patient Records | One Administrator-curated corpus; no Doctor upload path; every user-owned query filtered by authenticated user id | **PASS** — the design retires uploads entirely (FR-082) |
| III | Clinical Decision Support Safety | Reproducibility, fidelity to ground truth, constrained output, explicit non-classification, explainability, clinician responsibility, auditability, no fabrication | **PASS by design, unproven until measured** — R1/R2 provide the mechanism; SC-015/SC-016/SC-023 provide the evidence, and none of it exists until the model strand runs |
| IV | Explicit API Contracts & Validation | Pydantic on every body; findings validated against permitted value sets; missing findings requested not inferred; `/api/v1` prefix; meaningful `detail` and correct status codes | **PASS** — contracts in `contracts/`; the `documents` router is deleted, not deprecated |
| V | Simplicity & Minimal Dependencies | No new machinery without measured need; new dependencies pinned and justified | **CONDITIONAL PASS** — four additions justified in Complexity Tracking |
| VI | Performance Through Deliberate Caching | Embedding model a singleton; graph/retrieval clients from shared module functions; rebuilds invalidate caches; embedding model MUST be multilingual | **PASS** — R5 replaces the English-centric MiniLM; the existing singleton pattern is preserved and extended to the Neo4j driver |
| VII | Training Data Integrity | Held-out portion never reaches training; split over distinct tuples; fixed versioned split; single-tuple classes named as unmeasured; captured-row rules | **PASS** — the split is fixed in data-model.md and generated by a deterministic, re-runnable rule |

### Two pre-existing Principle I violations this plan must clear

Both predate the feature and neither is created by it, but Principle I is NON-NEGOTIABLE and the
plan owns them:

1. **Secrets are inline in `/etc/systemd/system/mychatbotproject.service`** — `SECRET_KEY`,
   `HF_API_TOKEN`, and `RESEND_API_KEY` sit in a world-readable unit file. Principle I requires
   `EnvironmentFile=` pointing at a root-owned mode-600 file. These must be **rotated**, not just
   moved: they have been readable by any local user for the life of the deployment.
2. **The default system prompt in `backend_files/main.py` states "Do not provide personal medical
   diagnoses"** — a direct contradiction of Principle III as amended. Shipping the classifier
   while that prompt is live would be incoherent.

### Gate failures deliberately accepted

None. The two items above are scheduled work, not accepted deviations.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-toxo-graphrag-assistant/
├── plan.md                  # This file
├── research.md              # Phase 0 — 10 resolved decisions
├── data-model.md            # Phase 1 — entities, graph schema, corpus split
├── quickstart.md            # Phase 1 — runnable validation scenarios
├── contracts/               # Phase 1 — API and interface contracts
│   ├── README.md
│   ├── api-v1.md            # HTTP contract for every endpoint
│   ├── classification.md    # The classification input/output contract
│   └── corpus-split.md      # The fixed train/test split artefact contract
├── architecture-notes.md    # Pre-existing input to planning (not binding)
├── checklists/requirements.md
├── spec.md
└── tasks.md                 # Phase 2 — created by /speckit-tasks, NOT here
```

### Source code (repository root)

The application does not live at the repository root. It lives under `Toxo_AI_code/`, and the
constitution's Layout note (`backend code in backend_files/`) is relative to that directory.

```text
Toxo_AI_code/
├── main.py                       # Root entrypoint shim (re-exports backend_files/main.py)
├── models.py                     # DEAD — duplicate of backend_files/models.py; delete
├── requirements.txt              # Runtime deps (production host)
├── requirements-dev.txt          # NEW — pytest, httpx, alembic
├── .env.example                  # Extended with Neo4j, endpoint, and admin-address vars
├── backend_files/
│   ├── main.py                   # App assembly + routers (currently 396 lines, monolithic)
│   ├── auth.py                   # JWT, hashing, token helpers
│   ├── database.py               # Engine, session, init_db
│   ├── models.py                 # SQLAlchemy models — heavily extended
│   ├── emails.py                 # Resend integration — gains admin + approval templates
│   ├── rag.py                    # REWRITTEN — per-user FAISS retired, shared corpus retrieval
│   ├── routers/                  # NEW — main.py decomposed
│   │   ├── auth.py               # register-request, verify, login, me, password reset
│   │   ├── admin.py              # requests, accounts, sources, builds, evaluation results
│   │   ├── classify.py           # the classification endpoint
│   │   ├── chat.py               # free-text educational questions
│   │   └── conversations.py      # history, rename, delete, export, feedback
│   ├── schemas/                  # NEW — Pydantic request/response models + validators
│   ├── services/                 # NEW
│   │   ├── graph.py              # Neo4j driver singleton, Cypher queries
│   │   ├── retrieval.py          # hybrid vector + graph retrieval, ranking, budget
│   │   ├── classifier.py         # endpoint call, constrained decoding, canonical rendering
│   │   ├── deident.py            # identifier detection and write-path stripping
│   │   ├── capture.py            # new_outputs.csv append + failure escalation
│   │   └── audit.py              # audit event writer
│   ├── knowledge/                # NEW — offline build pipeline
│   │   ├── build.py              # generation-tagged build orchestration + atomic swap
│   │   ├── ingest_cases.py       # deterministic CSV → graph + vectors
│   │   └── ingest_thesis.py      # PDF → passages → LLM concept extraction
│   ├── migrations/               # NEW — Alembic
│   └── tests/                    # NEW — unit + integration
├── frontend_files/
│   ├── index.html                # Gains: findings form, citations panel, admin console
│   ├── app.js                    # Upload UI removed; classification + attribution UI added
│   └── style.css
└── deploy/
    ├── creating_VM.yaml          # Provisioning only — does not deploy code
    ├── mychatbotproject.service  # NEW — unit with EnvironmentFile=, no inline secrets
    └── neo4j.md                  # NEW — Neo4j install and memory tuning notes

eval/                             # NEW — offline, never installed on the production host
├── requirements.txt              # Harness deps only (huggingface_hub, benchmark model clients)
├── split.py                      # Regenerates the fixed corpus split from the CSV
├── split.v1.json                 # The committed, versioned split artefact (FR-104)
├── dataset.py                    # Emits the training dataset (19 rows / 13 tuples) for the notebook
├── replay.py                     # SC-015 24-case replay
├── heldout.py                    # SC-023 held-out evaluation
├── determinism.py                # SC-016 check, cache-active and cache-bypassed runs
├── benchmark.py                  # SC-002 benchmark across all baselines
├── benchmark/questions.v1.json   # The fixed, versioned question set
├── ENDPOINT.md                   # Inference Endpoint configuration (FR-098)
├── tests/test_split.py           # Split invariant tests (FR-101–FR-104)
└── results/                      # Run outputs, imported into the app for display

training_model/                   # NEW — local fine-tuning on the owner's laptop (FR-105–FR-107)
├── finetune_llama32_1b.ipynb     # Jupyter notebook: fp16 LoRA on the RTX 2070 Mobile (8 GB),
│                                 #   consumes eval/split.v1.json + eval/dataset.py output,
│                                 #   saves the merged model here, pushes it to the private HF repo
├── requirements.txt              # transformers, peft, trl, datasets, accelerate, jupyter
├── .gitignore                    # Excludes the saved weights — only the notebook is committed
└── llama32-1b-toxo/              # Saved fine-tuned model (git-ignored; derives from clinical data)
```

**Structure Decision**: Keep the existing single-project web-application layout under
`Toxo_AI_code/` and decompose the 396-line `backend_files/main.py` into routers, schemas, and
services as it grows. The offline work goes in sibling `eval/` and `training_model/` directories
rather than inside `backend_files/`, because FR-094 requires the production host to hold no
third-party model credentials — physical separation makes that auditable rather than merely
intended. Training and evaluation are split deliberately (clarified 2026-08-07): `training_model/`
holds only the fine-tuning notebook and the locally saved model, so the release gates (replay,
held-out, benchmark) stay reproducible command-line scripts in `eval/` rather than manually
executed notebook cells. No frontend framework is introduced; the new surfaces (findings form,
citations panel, admin console) are incremental additions to the existing vanilla-JS app,
consistent with Principle V.

---

## Complexity Tracking

Four additions exceed what Principle V grants by default. Each is recorded here so it is visible
as a decision.

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Neo4j** (a persistent graph server for a ~2k-edge graph) | Owner-mandated, decision closed 2026-08-06 and recorded in the constitution as an exception | SQLite + NetworkX in memory would serve this corpus and cost nothing. Overruled by the owner; retained here only so the exception stays visible and is not mistaken for precedent |
| **Alembic** (schema migrations) | The account table gains roles, revocation, acknowledgement, and a registration-request relationship, and five tables are added, against a live SQLite database holding real accounts. Today there is no migration path at all — `init_db()` only creates missing tables and silently ignores changed columns | Hand-written `ALTER TABLE` scripts were considered. Rejected because the deployed database is a manual copy with no backup discipline, and a silent partial migration on a clinical system is exactly the failure the constitution's error-path honesty rule exists to prevent |
| **pytest + httpx** (test infrastructure) | The constitution requires new backend features to arrive with tests for success and failure paths, and requires a clinical regression gate before merge. Neither is possible today — the repository contains no tests and no test runner | There is no simpler alternative; the gate is mandatory and currently unenforceable |
| **`eval/` and `training_model/` as separate offline packages** with `transformers`/`peft`/`trl`/`jupyter` | FR-093 through FR-096 require a comparative harness, FR-094 forbids the production host from holding GPT or Gemini credentials, and FR-105 puts training on the owner's laptop GPU in a notebook | Running the harness inside the application would satisfy the functional requirement while breaking the security one. Separation is the cheaper of the two ways to satisfy both. Training and evaluation are further separated so the release gates stay scriptable (see Structure Decision) |

**Not added, deliberately**: no Redis (the in-process sliding-window limiter still fits a
single-process deployment), no PostgreSQL (writes remain single-writer), no frontend framework,
no vector database beyond the existing FAISS flat index, and no rules engine in the serving path
(FR-084 forbids it).

---

## Phase 0 — Research

Complete. Ten decisions resolved, no NEEDS CLARIFICATION remaining. See [research.md](./research.md).
R3 was extended on 2026-08-07 with the clarified training environment: fp16 LoRA on the owner's
RTX 2070 Mobile (8 GB), in the `training_model/` notebook, with cloud training explicitly rejected.

The three that most shape the build: **R1** classification output design (model picks the class,
canonical text is rendered from a lookup), **R2** determinism (greedy decoding plus a keyed
response cache, because greedy alone is not a guarantee across a hosted endpoint), and **R5**
memory budget (the multilingual embedding model must be chosen against a 4 GB ceiling shared
with Neo4j).

## Phase 1 — Design & Contracts

Complete. See [data-model.md](./data-model.md), [contracts/](./contracts/), and
[quickstart.md](./quickstart.md).

### Post-design Constitution re-check

No verdict changed. Two observations from designing against the gates:

- **Principle III's reproducibility requirement is satisfied structurally, not statistically.**
  The response cache in R2 makes SC-016 (20 identical submissions, identical output) true by
  construction rather than by hoping a hosted endpoint decodes deterministically. That is the
  right outcome, but it means SC-016 passing is *not* evidence the model is deterministic — the
  cache must be bypassed when measuring, and quickstart.md scenario 6 does exactly that.
- **Principle VII's honest-reporting rule needs a UI surface, not just a report field.** Six of
  the nine outcome classes are untested. The evaluation results view (contracts/api-v1.md,
  `GET /api/v1/admin/evaluations`) carries `unmeasured_classes` as a required field so the
  Administrator sees the gap next to the score rather than in a footnote.
