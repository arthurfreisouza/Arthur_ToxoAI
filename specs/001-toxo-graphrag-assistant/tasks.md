# Tasks: Congenital Toxoplasmosis Clinical Knowledge Assistant

**Input**: Design documents from `/specs/001-toxo-graphrag-assistant/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md,
`.specify/memory/constitution.md` v2.1.0

**Tests**: **INCLUDED.** Not optional here — the constitution's Development Workflow & Quality
Gates requires new backend features to arrive with tests for success and failure paths, and
requires the clinical regression gate (SC-015 replay + SC-023 held-out) before merge. Test tasks
are therefore first-class tasks, not an optional appendix.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and
delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task belongs to (US1–US5). Setup, Foundational, and Polish
  tasks carry no story label.
- Every task names an exact file path.

## Path Conventions

The application is **not** at the repository root. It lives under `Toxo_AI_code/`, with backend
code in `Toxo_AI_code/backend_files/` and the frontend in `Toxo_AI_code/frontend_files/`. The
offline model and evaluation work lives in a sibling `eval/` directory at the repository root and
is **never installed on the production host** (FR-094). Paths below are repository-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, package skeletons, configuration, and deployment artefacts. Nothing
here changes behaviour.

- [ ] T001 Delete the dead duplicate module `Toxo_AI_code/models.py` (superseded by `Toxo_AI_code/backend_files/models.py`) and remove any import of it from `Toxo_AI_code/main.py`
- [ ] T002 Add pinned runtime dependencies `neo4j`, `alembic`, and the multilingual embedding requirement to `Toxo_AI_code/requirements.txt`, with a one-line justification comment per Principle V
- [ ] T003 [P] Create `Toxo_AI_code/requirements-dev.txt` pinning `pytest`, `pytest-asyncio`, and `httpx` (development host only, never installed in production)
- [ ] T004 [P] Extend `Toxo_AI_code/.env.example` with `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `HF_ENDPOINT_URL`, `HF_API_TOKEN`, `EMBEDDING_MODEL`, `ADMIN_NOTIFICATION_EMAIL`, `EMAIL_DRY_RUN`, `CONVERSATION_RETENTION_DAYS`, and `TRAINING_RETENTION_DAYS`
- [ ] T005 [P] Create a centralised settings module `Toxo_AI_code/backend_files/config.py` that reads every secret and tunable from the environment and fails loudly at import if a required one is absent (Principle I — no hard-coded secrets, no silent defaults for credentials)
- [ ] T006 [P] Create the new backend package skeletons with `__init__.py` files: `Toxo_AI_code/backend_files/routers/`, `schemas/`, `services/`, `knowledge/`, `data/`, and `tests/`
- [ ] T007 [P] Create `Toxo_AI_code/pytest.ini` configuring the test paths and a temp-file SQLite database per test session
- [ ] T008 Initialise Alembic in `Toxo_AI_code/backend_files/migrations/` with `alembic.ini` pointed at the CWD-relative SQLite URL used by `backend_files/database.py`
- [ ] T009 [P] Create the offline evaluation package skeleton `eval/__init__.py` and `eval/requirements.txt` pinning `transformers`, `peft`, `trl`, `datasets`, `accelerate`, and `huggingface_hub` (offline only — these MUST NOT appear in `Toxo_AI_code/requirements.txt`)
- [ ] T010 [P] Create `Toxo_AI_code/deploy/mychatbotproject.service` as a systemd unit using `EnvironmentFile=/etc/mychatbotproject/env` with **no inline secrets** (Principle I; replaces the live unit that carries `SECRET_KEY`, `HF_API_TOKEN`, and `RESEND_API_KEY` inline)
- [ ] T011 [P] Create `Toxo_AI_code/deploy/neo4j.md` documenting the Neo4j Community install, the 512 MB heap / 512 MB page-cache tuning from research.md R5, and the memory budget the VM must hold
- [ ] T012 [P] Add `.env`, `backend_files/data/new_outputs.csv`, `backend_files/vector_stores/`, and `backend_files/users.db` to `.gitignore`

**Checkpoint**: Dependencies and skeletons in place; no runtime behaviour has changed yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, the retirement of the per-user upload path, the shared services, and the
knowledge build pipeline. Both P1 stories read a built corpus, so the build pipeline is
foundational rather than part of US3 — US3 is what makes the corpus *maintainable*, and the first
corpus can be loaded by an operator running a command (spec, US3 rationale).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema (data-model.md §1)

- [ ] T013 Extend the `User` model in `Toxo_AI_code/backend_files/models.py` with `role` (enum administrator/doctor), `revoked_at`, `acknowledged_at`, `acknowledged_version`, and `request_id` FK (FR-001, FR-009, FR-047, FR-004)
- [ ] T014 Add the `RegistrationRequest` model to `Toxo_AI_code/backend_files/models.py` with `email` (indexed, **not** unique), `username`, `submitted_details`, `state`, `created_at`, `decided_at`, `decided_by`, `notification_sent` (FR-004, FR-005, FR-085)
- [ ] T015 [P] Add the `Conversation` and `Message` models to `Toxo_AI_code/backend_files/models.py` per data-model.md §1 (FR-052, FR-054, FR-057)
- [ ] T016 [P] Add the `Attribution` model with `snapshot_text` to `Toxo_AI_code/backend_files/models.py` — the snapshot is what makes FR-054 survive a rebuild (FR-032, FR-037)
- [ ] T017 [P] Add the `Build` model with `generation`, `is_active`, and the five statistics counters to `Toxo_AI_code/backend_files/models.py` (FR-020, FR-024, FR-025)
- [ ] T018 [P] Add the append-only `AuditEvent` model to `Toxo_AI_code/backend_files/models.py` with no update or delete path (FR-012)
- [ ] T019 [P] Add the `ClassificationEvent` model with `findings_hash`, `model_version`, `prompt_version`, `lookup_version`, `marked_incorrect`, and `capture_status` to `Toxo_AI_code/backend_files/models.py` (FR-062, FR-069, FR-070, FR-071)
- [ ] T020 [P] Add the `EvaluationRun` and `OperationalMetric` models to `Toxo_AI_code/backend_files/models.py` (FR-095, FR-061)
- [ ] T021 Delete the `Document` model from `Toxo_AI_code/backend_files/models.py` (FR-082 — a deletion, not a deprecation)
- [ ] T022 Create the Alembic baseline migration in `Toxo_AI_code/backend_files/migrations/versions/` that stamps the **currently deployed** schema, so the live `users.db` can be brought under migration control without recreation (research.md R6)
- [ ] T023 Create the Alembic migration in `Toxo_AI_code/backend_files/migrations/versions/` that adds every new table and column from T013–T020 and drops the `documents` table, with a working `downgrade()`

### Retiring the per-user upload path (FR-082, Principle II)

- [ ] T024 Delete the `docs_router` and its three endpoints from `Toxo_AI_code/backend_files/main.py`, and delete the per-user FAISS stores under `Toxo_AI_code/backend_files/vector_stores/` — no `410 Gone` shim, the routes must not exist
- [ ] T025 Remove the upload UI, the document list, and the delete-document controls from `Toxo_AI_code/frontend_files/index.html` and `Toxo_AI_code/frontend_files/app.js`
- [ ] T026 Rewrite `Toxo_AI_code/backend_files/rag.py` to read one shared corpus index rather than a per-user store, removing every `user_id`-keyed vector-store path (Principle II, FR-013, FR-083)

### Shared services and app structure

- [ ] T027 Decompose `Toxo_AI_code/backend_files/main.py` into app assembly plus router registration only, moving the auth endpoints to `Toxo_AI_code/backend_files/routers/auth.py` and the chat endpoint to `Toxo_AI_code/backend_files/routers/chat.py`
- [ ] T028 Remove the system prompt line "Do not provide personal medical diagnoses" from `Toxo_AI_code/backend_files/main.py` and replace it with the decision-support framing required by Principle III and FR-042
- [ ] T029 Extend `get_current_user` in `Toxo_AI_code/backend_files/auth.py` to refuse revoked accounts (`revoked_at` non-null) and accounts with no `acknowledged_at`, each with a distinct 403 `detail`, and add `get_current_doctor` and `get_current_admin` dependencies (FR-002, FR-003, FR-009, FR-047)
- [ ] T030 [P] Create the in-process sliding-window rate limiter in `Toxo_AI_code/backend_files/services/ratelimit.py` supporting per-user and per-source-IP keys, returning 429 (Principle I, FR-011, FR-086)
- [ ] T031 [P] Create `Toxo_AI_code/backend_files/services/audit.py` writing append-only audit events for the nine actions listed in data-model.md §1 (FR-012)
- [ ] T032 [P] Create `Toxo_AI_code/backend_files/services/deident.py` with pattern detection for honorific-prefixed names, dates of birth, NHS and hospital numbers, phone numbers, email addresses, and postcodes, exposing `detect()` for the warning path and `strip()` for the write path (FR-049, FR-050, research.md R10)
- [ ] T033 [P] Create `Toxo_AI_code/backend_files/services/metrics.py` writing hourly `operational_metrics` counters and **no question or answer content** (FR-051, FR-061)
- [ ] T034 Replace `sentence-transformers/all-MiniLM-L6-v2` with `intfloat/multilingual-e5-small` as a module-level singleton in `Toxo_AI_code/backend_files/rag.py` (Principle VI, research.md R5, FR-080)
- [ ] T035 Create the Neo4j driver singleton and Cypher query helpers in `Toxo_AI_code/backend_files/services/graph.py`, including uniqueness constraints and indexes on `generation` and `normalised_name` (Principle VI, data-model.md §2)
- [ ] T036 Standardise the error-response conventions in `Toxo_AI_code/backend_files/schemas/errors.py` so every `HTTPException` carries a user-readable `detail` and the status codes in Principle IV (401/403/404/409/422/429/502/503)

### Knowledge build pipeline (FR-015 to FR-024)

- [ ] T037 Create the deterministic CSV ingester `Toxo_AI_code/backend_files/knowledge/ingest_cases.py` reading `logs/request-logs.csv`, writing one `CaseRecord` node per record with its `EXHIBITS`, `CLASSIFIED_AS`, and `RECOMMENDS` edges, treating each record as atomic (FR-016, FR-018)
- [ ] T038 Add per-record validation and skip reporting to `Toxo_AI_code/backend_files/knowledge/ingest_cases.py` — a record with missing or unparseable fields is ingested with those fields marked absent or skipped with a reported reason, never silently dropped (FR-019)
- [ ] T039 Create the controlled-vocabulary normaliser in `Toxo_AI_code/backend_files/knowledge/vocabulary.py`, built from the CSV's own distinct finding values, and join thesis-extracted concepts to it on `normalised_name` with **exact match only** — an unmatched concept becomes a new node, never a fuzzy merge (data-model.md §2)
- [ ] T040 Create the thesis ingester `Toxo_AI_code/backend_files/knowledge/ingest_thesis.py` reading `text/monografia.pdf`, splitting into passages with page and section references, and extracting `Concept` nodes and `MENTIONS` edges by LLM extraction (FR-015, FR-017, FR-026, FR-027)
- [ ] T041 Add concept clustering and cluster summarisation to `Toxo_AI_code/backend_files/knowledge/groups.py`, writing `ConceptGroup` nodes and `IN_GROUP` edges so broad questions are answered from an overview (FR-030)
- [ ] T042 Create the build orchestrator `Toxo_AI_code/backend_files/knowledge/build.py` writing generation *n+1* while queries read *n*, flipping the active pointer only on success, recording the five statistics and the `dataset_revision`, and supporting `--sources`, `--cases`, and `--fail-at <stage>` (FR-020 to FR-025, SC-008)
- [ ] T043 Build the shared FAISS index over thesis passages and case records inside `Toxo_AI_code/backend_files/knowledge/build.py`, written to a generation-tagged path so a failed build cannot overwrite the serving index (FR-023)
- [ ] T044 Create the hybrid retrieval service `Toxo_AI_code/backend_files/services/retrieval.py` combining vector similarity with graph traversal, ranking results, enforcing a bounded context budget, and returning the contributing units for attribution (FR-029, FR-031, FR-032)
- [ ] T045 Replace the `/health` handler in `Toxo_AI_code/backend_files/main.py` to report `knowledge_base` as `ready`, `not_ready`, or `building`, distinct from application reachability (FR-059, FR-060)
- [ ] T046 [P] Create the shared test fixtures in `Toxo_AI_code/backend_files/tests/conftest.py` — a FastAPI test client, a temp SQLite database, an admin account, a verified doctor account, and a stubbed model endpoint
- [ ] T047 [P] Write unit tests for the identifier detector and stripper in `Toxo_AI_code/backend_files/tests/unit/test_deident.py`, covering each pattern class and asserting stripping happens before persistence
- [ ] T048 [P] Write integration tests for the build lifecycle in `Toxo_AI_code/backend_files/tests/integration/test_build.py` — a successful build reports its statistics, and a build failed with `--fail-at` at **each** stage leaves the previous generation active (FR-023, SC-009)

**Checkpoint**: Schema migrated, uploads retired, a corpus can be built from the command line, and
retrieval works. User story implementation can now begin.

---

## Phase 3: User Story 1 - Doctor submits a case and receives a classification (Priority: P1) 🎯 MVP

**Goal**: A signed-in doctor submits a patient's 14 de-identified findings and receives a maternal
classification, a child classification, canonical Portuguese argumentation and recommendation, the
findings that drove the result, and an explanation citing thesis passages and comparable historical
cases — or an explicit "no classification could be determined".

**Independent Test**: Replay all 24 historical cases (quickstart scenario 5) and compare the
returned maternal and child classifications against the recorded outputs; then run the held-out 5
tuples (scenario 7) and the determinism check with the cache bypassed (scenario 6b). The story
passes when the replay is 24/24, the held-out score is reported alongside `unmeasured_classes`,
and every explanation cites material that genuinely supports it.

### Offline model strand (eval/ — never installed on the production host)

- [ ] T049 [US1] Implement the split generator `eval/split.py` applying the rule from contracts/corpus-split.md — per `final_situation` class, sort distinct input tuples by `sha256` of joined finding values, take the first *k* as test, allocate *k* by largest remainder to a 30% target, single-tuple classes ineligible — with a `--verify` mode that regenerates and diffs
- [ ] T050 [US1] Generate and commit `eval/split.v1.json` with `source_sha256`, `totals`, `train`, `test`, and `unmeasured_classes`, asserting all seven invariants in contracts/corpus-split.md (13 train tuples / 5 test tuples; records 22 and 23 as **one** entry)
- [ ] T051 [P] [US1] Write the split invariant tests in `eval/tests/test_split.py` — disjoint, complete, tuple-level not row-level, stratified, single-tuple classes in train and listed as unmeasured, byte-reproducible (FR-101 to FR-104, SC-021)
- [ ] T052 [US1] Build the training dataset writer in `eval/dataset.py` that emits only the 19 training rows from the 13 training tuples, verbatim with no paraphrase or synthetic expansion, targeting the classification labels only (FR-087, SC-021, research.md R3)
- [ ] T053 [US1] Implement the LoRA fine-tune in `eval/finetune.py` on `meta-llama/Llama-3.2-1B-Instruct` (r=8–16, small learning rate, early stopping on the held-out portion), merging the adapter and pushing to a **private** Hugging Face repository (FR-097, research.md R3)
- [ ] T054 [US1] Document the Hugging Face Inference Endpoint configuration in `eval/ENDPOINT.md` — dedicated endpoint on the private repository, scale to zero after 15 minutes idle, greedy decoding parameters (FR-098, research.md R8)

### Classification contract and canonical text

- [ ] T055 [P] [US1] Create the canonical text lookup `Toxo_AI_code/backend_files/data/canonical_texts.v1.json` keyed by `(mother_classification, child_classification)`, extracted verbatim from `logs/request-logs.csv`, holding the Portuguese argumentation and recommendation (research.md R1, FR-079)
- [ ] T056 [P] [US1] Define the findings request schema in `Toxo_AI_code/backend_files/schemas/classification.py` with a Pydantic validator per finding enforcing the permitted value sets in data-model.md §3, rejecting an out-of-set value with the permitted values stated and never coercing (Principle IV, FR-064)
- [ ] T057 [US1] Add the missing-findings validator to `Toxo_AI_code/backend_files/schemas/classification.py` that returns 422 naming the **specific** absent findings rather than inferring or defaulting them (FR-067)
- [ ] T058 [US1] Add internal-contradiction detection to `Toxo_AI_code/backend_files/schemas/classification.py` returning 409 naming the contradiction rather than silently resolving it
- [ ] T059 [P] [US1] Define the classification response schema in `Toxo_AI_code/backend_files/schemas/classification.py` matching contracts/classification.md — `classification`, `translation`, `basis`, `explanation`, `safety_notice`, and the mandatory `versions` block

### Classifier service

- [ ] T060 [US1] Implement the prompt builder in `Toxo_AI_code/backend_files/services/classifier.py` that assembles the findings plus retrieved exemplars into the fine-tuned model's prompt format, versioned as `prompt_version` (FR-087)
- [ ] T061 [US1] Implement the endpoint call in `Toxo_AI_code/backend_files/services/classifier.py` with greedy decoding (`temperature=0`, `top_p=1`, `do_sample=false`, fixed seed) and constrained decoding to the 5 maternal and 4 child labels (research.md R1, R2, FR-084)
- [ ] T062 [US1] Implement the response cache in `Toxo_AI_code/backend_files/services/classifier.py` keyed by `sha256(normalised findings) + model_version + prompt_version + lookup_version`, with any version change invalidating it (FR-066, SC-016, research.md R2)
- [ ] T063 [US1] Honour `X-Bypass-Classification-Cache` for **admin tokens only** in `Toxo_AI_code/backend_files/routers/classify.py`, so determinism can be measured rather than assumed (research.md R2)
- [ ] T064 [US1] Implement cold-start handling in `Toxo_AI_code/backend_files/services/classifier.py` — on `scaledToZero` or `initializing`, persist the submitted findings against a job id and return `202 {"job_id", "state": "model_starting"}` within 2 seconds, bounded at 180 s (FR-099, SC-003, research.md R8)
- [ ] T065 [US1] Implement the four-step output validation in `Toxo_AI_code/backend_files/services/classifier.py` — label in set, pair resolves in the lookup, rendered text byte-identical to the lookup entry, and every attribution id resolving to a unit actually retrieved — raising 502 on failure and **never** showing invalid output to the doctor (FR-068, SC-019, SC-002)
- [ ] T066 [US1] Render `Situação não parametrizada` as `outcome: "no_classification_determined"` with the display string "No classification could be determined for these findings" and `child: null`, returned as `200` and never as a clinical conclusion (FR-044, SC-018)
- [ ] T067 [US1] Implement `driving_findings` derivation in `Toxo_AI_code/backend_files/services/classifier.py` so the doctor can see which inputs drove the result (FR-063)
- [ ] T068 [US1] Implement the grounded explanation generator in `Toxo_AI_code/backend_files/services/classifier.py` that produces free-text reasoning from retrieved thesis passages and comparable cases, with an attribution per substantive claim (FR-037, SC-020, research.md R1)
- [ ] T069 [US1] Implement language handling in `Toxo_AI_code/backend_files/services/classifier.py` — reply in the doctor's language, always return the canonical Portuguese verbatim, and label any translation (FR-077, FR-078, FR-081)

### Capture and persistence

- [ ] T070 [US1] Implement `Toxo_AI_code/backend_files/services/capture.py` appending each classification to `Toxo_AI_code/backend_files/data/new_outputs.csv` with a header schema-compatible with `logs/request-logs.csv`, canonical Portuguese only, identifiers stripped (FR-069, FR-072, FR-073, FR-079)
- [ ] T071 [US1] Add capture-failure escalation to `Toxo_AI_code/backend_files/services/capture.py` — the doctor still receives their classification, `capture_status` is set to `failed`, and the failure is raised to the Administrator rather than dropped (Principle VII, spec Edge Cases)
- [ ] T072 [US1] Write the `classification_events`, `messages`, and `attributions` rows with `snapshot_text` on the classification path in `Toxo_AI_code/backend_files/routers/classify.py`, before the response returns (FR-054, FR-062, FR-070)

### Endpoints

- [ ] T073 [US1] Implement `POST /api/v1/classify` in `Toxo_AI_code/backend_files/routers/classify.py` wiring validation → deident warn/strip → cache → model → output validation → canonical render → capture, guarded by `get_current_doctor` and the rate limiter (FR-043, contracts/classification.md)
- [ ] T074 [US1] Implement `GET /api/v1/classify/{job_id}` in `Toxo_AI_code/backend_files/routers/classify.py` returning `model_starting`, `complete`, or `failed`, and `502` after the 180 s bound with no fallback answer (FR-099, FR-100, FR-040)
- [ ] T075 [US1] Implement `POST /api/v1/classify/{event_id}/mark-incorrect` in `Toxo_AI_code/backend_files/routers/classify.py` setting `marked_incorrect` so the row is excluded from future training (FR-071, Principle VII)
- [ ] T076 [US1] Implement `POST /api/v1/auth/acknowledge` in `Toxo_AI_code/backend_files/routers/auth.py` recording `acknowledged_at` and `acknowledged_version` against the disclosure text (FR-047)
- [ ] T077 [US1] Return `503` from `POST /api/v1/classify` when no successful build exists, stating plainly that the knowledge base is not ready (FR-060)

### Frontend

- [ ] T078 [P] [US1] Add the 14-field guided findings form to `Toxo_AI_code/frontend_files/index.html` with a select bound to each finding's permitted values and **no patient identifier field** (FR-048, FR-064)
- [ ] T079 [US1] Render the classification result in `Toxo_AI_code/frontend_files/app.js` — maternal and child labels, canonical Portuguese argumentation and recommendation, the translation labelled as a translation, `driving_findings`, and the mandatory `safety_notice` (FR-045, FR-063, FR-078, FR-081, SC-011)
- [ ] T080 [US1] Add the expandable citations panel to `Toxo_AI_code/frontend_files/app.js` so each attribution opens to the supporting thesis passage or case record (FR-037, SC-020)
- [ ] T081 [US1] Add the cold-start state and polling loop to `Toxo_AI_code/frontend_files/app.js` — visible progress within 2 seconds, a "the model is starting" message, and the submitted findings retained (FR-099, SC-003)
- [ ] T082 [US1] Add the first-use disclosure modal to `Toxo_AI_code/frontend_files/index.html` and `app.js` stating what the tool is, what it was built from, its limitations, and its regulatory status, posting to `/auth/acknowledge` (FR-047)
- [ ] T083 [US1] Add the de-identification warnings to `Toxo_AI_code/frontend_files/app.js` on entry to the tool and at the point of submission, stating that submissions are retained as training data (FR-074)
- [ ] T084 [US1] Add the "mark clinically incorrect" control to the result view in `Toxo_AI_code/frontend_files/app.js` (FR-071)

### Tests and release gates for User Story 1

- [ ] T085 [P] [US1] Write findings-validation unit tests in `Toxo_AI_code/backend_files/tests/unit/test_findings_validation.py` — every permitted value accepted, out-of-set values rejected with the permitted values named, missing findings named specifically, no coercion (FR-064, FR-067)
- [ ] T086 [P] [US1] Write output-validation unit tests in `Toxo_AI_code/backend_files/tests/unit/test_output_validation.py` asserting each of the four checks raises 502 and that invalid model output never reaches the response body (SC-019)
- [ ] T087 [P] [US1] Write integration tests for the classification path in `Toxo_AI_code/backend_files/tests/integration/test_classify.py` covering 200 classified, 200 not-parameterised, 422 invalid, 422 missing, 409 contradictory, 202 cold start, 502 model failure, and 503 no build
- [ ] T088 [P] [US1] Write the capture test in `Toxo_AI_code/backend_files/tests/integration/test_capture.py` asserting every classification appends a row loadable alongside `logs/request-logs.csv` without transformation, and that a write failure still returns the classification (SC-017)
- [ ] T089 [US1] Implement the 24-case replay harness `eval/replay.py` writing a JSON result to `eval/results/`, requiring 24/24 maternal and child matches (SC-015, quickstart scenario 5)
- [ ] T090 [US1] Implement the held-out evaluation `eval/heldout.py` over the 5 unseen tuples (records 17, 5, 13, 21, 24), refusing to emit a result that does not carry `unmeasured_classes: ["1","3","7","16","18","20"]` (SC-023, FR-103, Principle VII)
- [ ] T091 [US1] Implement the determinism check `eval/determinism.py` submitting identical findings 20 times with the cache active and 20 times with `X-Bypass-Classification-Cache`, asserting identical output in both runs and reporting them separately (SC-016, quickstart scenario 6)
- [ ] T092 [US1] Run the SC-015 replay and, on any mismatch, escalate the base model along the 1B → 3B → 8B ladder in `eval/finetune.py` — the gate is not to be lowered and no rules engine may be introduced (FR-084)

**Checkpoint**: User Story 1 is fully functional. A doctor can classify a case and check the
reasoning; the replay, held-out, and determinism gates have been measured and reported.

---

## Phase 4: User Story 2 - Doctor asks a grounded clinical question (Priority: P1)

**Goal**: A signed-in doctor asks a free-text question about congenital toxoplasmosis and receives
an accurate, attributed answer in the language they wrote in — or a plain statement that the corpus
does not cover it.

**Independent Test**: With a corpus built, sign in as a doctor and submit questions whose answers
are known to be present in the thesis and the case records. The story passes when the answers are
accurate, every substantive claim carries an attribution, and each attribution resolves to the
correct source material.

- [ ] T093 [P] [US2] Define the chat request and response schemas in `Toxo_AI_code/backend_files/schemas/chat.py` per contracts/api-v1.md, including `attributions`, `evidence_strength`, `language`, and `build_id`
- [ ] T094 [US2] Implement scope detection in `Toxo_AI_code/backend_files/services/chat.py` so out-of-scope questions return `200` with a restatement of scope rather than an answer (FR-035, SC-004)
- [ ] T095 [US2] Implement conversation-context assembly in `Toxo_AI_code/backend_files/services/chat.py` so a follow-up referring to an earlier turn resolves against that conversation's history (FR-034)
- [ ] T096 [US2] Implement grounded answer generation in `Toxo_AI_code/backend_files/services/chat.py` drawing only on retrieved corpus material, and returning an explicit "the corpus does not cover this" with an empty `attributions` list when it cannot (FR-036, SC-005)
- [ ] T097 [US2] Attach an attribution to every substantive claim in `Toxo_AI_code/backend_files/services/chat.py`, recording the contributing units and dropping any citation that does not resolve to a retrieved unit (FR-037, FR-032, SC-001)
- [ ] T098 [US2] Implement source-disagreement surfacing in `Toxo_AI_code/backend_files/services/chat.py` so conflicting positions are both attributed rather than one being silently chosen (FR-038)
- [ ] T099 [US2] Set `evidence_strength: "thin"` in `Toxo_AI_code/backend_files/services/chat.py` when very few records match the described pattern (FR-039)
- [ ] T100 [US2] Implement cross-language retrieval and reply in `Toxo_AI_code/backend_files/services/chat.py` — retrieve Portuguese material for a question asked in any language, reply in the doctor's language, and show canonical clinical text verbatim in Portuguese where it appears (FR-077, FR-080, FR-081)
- [ ] T101 [US2] Treat question content strictly as data in `Toxo_AI_code/backend_files/services/chat.py` so an embedded instruction cannot alter the operating instructions or safety framing (FR-041, FR-046)
- [ ] T102 [US2] Implement `POST /api/v1/chat` in `Toxo_AI_code/backend_files/routers/chat.py` with the length bound returning `422` with the limit stated, `503` when no build exists, and `502` on model failure with no fabricated answer (FR-033, FR-040, FR-060)
- [ ] T103 [US2] Add the answer and attribution rendering to `Toxo_AI_code/frontend_files/app.js`, reusing the citations panel from T080 and showing the thin-evidence notice
- [ ] T104 [P] [US2] Write integration tests in `Toxo_AI_code/backend_files/tests/integration/test_chat.py` for in-scope answered, out-of-scope declined, uncovered-topic declined, over-length 422, no-build 503, model-failure 502, and prompt-injection resistance
- [ ] T105 [P] [US2] Write the attribution-resolution test in `Toxo_AI_code/backend_files/tests/integration/test_attributions.py` asserting every returned attribution id resolves to a unit retrieved for that request (SC-001, no fabricated citations)

**Checkpoint**: User Stories 1 and 2 both work independently. The assistant diagnoses and educates.

---

## Phase 5: User Story 3 - Administrator curates the knowledge base (Priority: P2)

**Goal**: The Administrator can add, replace, and remove sources, trigger a rebuild, and see what
is indexed, when it was built, whether it succeeded, and what it extracted — with a failed build
leaving doctors served by the last good one.

**Independent Test**: As administrator, ingest the thesis and the case dataset, inspect the
reported build statistics, replace one source with an updated version, rebuild, and confirm
doctors' answers reflect and attribute to the new material.

- [ ] T106 [P] [US3] Define the admin source and build schemas in `Toxo_AI_code/backend_files/schemas/admin.py` per contracts/api-v1.md
- [ ] T107 [US3] Implement `GET /api/v1/admin/sources`, `POST /api/v1/admin/sources`, and `DELETE /api/v1/admin/sources/{id}` in `Toxo_AI_code/backend_files/routers/admin.py`, guarded by `get_current_admin` (FR-021, FR-025)
- [ ] T108 [US3] Implement `POST /api/v1/admin/builds` in `Toxo_AI_code/backend_files/routers/admin.py` triggering `knowledge/build.py` as a background task and returning the build id immediately (FR-021, FR-022)
- [ ] T109 [US3] Implement `GET /api/v1/admin/builds` in `Toxo_AI_code/backend_files/routers/admin.py` returning build history with outcome, timing, the five statistics, and a specific actionable `failure_reason` on failure (FR-024, FR-025)
- [ ] T110 [US3] Confirm a removed source stops being retrieved and attributed by rebuilding and asserting no attribution resolves to it, in `Toxo_AI_code/backend_files/knowledge/build.py` (FR-013 removal path, US3 AC4)
- [ ] T111 [US3] Implement `GET /api/v1/admin/metrics` in `Toxo_AI_code/backend_files/routers/admin.py` returning question volume and failure rates over time with **no question or answer content** (FR-061)
- [ ] T112 [US3] Implement `GET /api/v1/admin/training-rows` and `DELETE /api/v1/admin/training-rows/{id}` in `Toxo_AI_code/backend_files/routers/admin.py` for review state and erasure requests (FR-071, FR-076)
- [ ] T113 [US3] Add the admin console to `Toxo_AI_code/frontend_files/index.html` and `app.js` — sources list, build trigger, build history with statistics, and the metrics view, visible only to the administrator role
- [ ] T114 [US3] Write audit events for source added, source replaced, source removed, build triggered, and training row deleted via `Toxo_AI_code/backend_files/services/audit.py` (FR-012)
- [ ] T115 [P] [US3] Write integration tests in `Toxo_AI_code/backend_files/tests/integration/test_admin_builds.py` asserting build statistics are reported, a mid-build question is answered from the last good build, and every admin route returns 403 for a doctor token
- [ ] T116 [P] [US3] Extend `Toxo_AI_code/backend_files/tests/integration/test_build.py` with a failure injected at **each** build stage, asserting doctors can still ask questions throughout (SC-009)

**Checkpoint**: The corpus is maintainable over time without an operator at a shell.

---

## Phase 6: User Story 4 - Administrator controls who gets access (Priority: P2)

**Goal**: Registration is request-then-approve. A clinician requests access, the Administrator is
notified and decides, only an approved request produces a verification link, and revocation takes
effect within 5 minutes.

**Independent Test**: Submit a request, confirm the Administrator is notified and no sign-in is
possible while pending. Approve, confirm the verification email arrives, confirm the address, sign
in, then revoke and confirm access stops. Separately submit and reject a request, confirming no
account becomes usable.

- [ ] T117 [P] [US4] Define the registration request and admin decision schemas in `Toxo_AI_code/backend_files/schemas/auth.py` per contracts/api-v1.md
- [ ] T118 [US4] Implement `POST /api/v1/auth/register-request` in `Toxo_AI_code/backend_files/routers/auth.py` creating a `pending` request and **no** `User` row, always returning the byte-identical `202` body whatever the outcome (FR-004, research.md R7)
- [ ] T119 [US4] Apply the per-source-IP and per-requested-address rate limit **before** the notification is dispatched in `Toxo_AI_code/backend_files/routers/auth.py`, returning 429 and sending no Administrator email for a refused request (FR-086, Principle I)
- [ ] T120 [US4] Add the Administrator notification template to `Toxo_AI_code/backend_files/emails.py` carrying the requester's details and the means to approve or reject, addressed to `ADMIN_NOTIFICATION_EMAIL` from configuration rather than a constant (FR-005)
- [ ] T121 [US4] Persist the request as `pending` with `notification_sent = false` when the Administrator email fails, so the request is never lost with the email (research.md R7, spec Edge Cases)
- [ ] T122 [US4] Implement `POST /api/v1/admin/registration-requests/{id}/approve` in `Toxo_AI_code/backend_files/routers/admin.py` creating the unverified Doctor `User` linked to the request and sending the single-use verification link (FR-004, FR-006)
- [ ] T123 [US4] Implement `POST /api/v1/admin/registration-requests/{id}/reject` in `Toxo_AI_code/backend_files/routers/admin.py` closing the request, creating nothing, and leaving the address free to request again (FR-085)
- [ ] T124 [US4] Implement `GET /api/v1/admin/registration-requests` in `Toxo_AI_code/backend_files/routers/admin.py`, filterable by state, including requests whose notification failed
- [ ] T125 [US4] Extend the verification flow in `Toxo_AI_code/backend_files/routers/auth.py` to a 14-day single-use expiry, refusing a reused link as already used and an expired one with instructions for obtaining a new one (FR-006)
- [ ] T126 [US4] Add reissue of a verification link for an already-approved request in `Toxo_AI_code/backend_files/routers/admin.py` (FR-006)
- [ ] T127 [US4] Retire the invitation mechanism and the old `POST /auth/register` endpoint from `Toxo_AI_code/backend_files/routers/auth.py` (FR-004, constitution Principle I as amended)
- [ ] T128 [US4] Implement `GET /api/v1/admin/accounts` and `POST /api/v1/admin/accounts/{id}/revoke` in `Toxo_AI_code/backend_files/routers/admin.py`, setting `revoked_at` so the next request is refused within 5 minutes (FR-009, SC-012)
- [ ] T129 [US4] Implement `POST /api/v1/auth/password-reset/request` and `/confirm` in `Toxo_AI_code/backend_files/routers/auth.py` with single-use links expiring in 1 hour (FR-010)
- [ ] T130 [US4] Enforce the 12-character minimum password and the non-revealing 401 on `POST /api/v1/auth/login` in `Toxo_AI_code/backend_files/routers/auth.py`, with distinct 403 `detail` strings for unverified, revoked, and unacknowledged (FR-007, contracts/api-v1.md)
- [ ] T131 [US4] Apply the authentication rate limit to login in `Toxo_AI_code/backend_files/routers/auth.py`, returning 429 with a clear temporary message (FR-011)
- [ ] T132 [US4] Confirm the 60-minute idle session expiry in `Toxo_AI_code/backend_files/auth.py` and require re-authentication, preserving the doctor's submitted question in the frontend across a re-login (FR-008, spec Edge Cases)
- [ ] T133 [US4] Write audit events for sign-in, sign-in failure, registration request, request approved, request rejected, and revocation via `Toxo_AI_code/backend_files/services/audit.py` (FR-012)
- [ ] T134 [US4] Replace the self-service registration form in `Toxo_AI_code/frontend_files/index.html` and `app.js` with the request form collecting username, email, and supporting details
- [ ] T135 [US4] Add the accounts and registration-requests console to `Toxo_AI_code/frontend_files/app.js` with approve, reject, and revoke controls, visible only to the administrator role
- [ ] T136 [P] [US4] Write integration tests in `Toxo_AI_code/backend_files/tests/integration/test_registration.py` covering the full quickstart scenario 3 sequence, including the byte-identical response for an existing address and no Administrator email on a rate-limited request
- [ ] T137 [P] [US4] Write the RBAC sweep test in `Toxo_AI_code/backend_files/tests/integration/test_rbac.py` exercising **every** admin route with a doctor token and asserting 403 on each, and asserting `POST /api/v1/documents/upload` returns 404 rather than 403 (SC-007, FR-082)
- [ ] T138 [P] [US4] Write the revocation test in `Toxo_AI_code/backend_files/tests/integration/test_revocation.py` asserting a revoked account is refused on its next request (FR-009, SC-012)

**Checkpoint**: Access is closed and administered. Stories 1–4 all work independently.

---

## Phase 7: User Story 5 - Doctor revisits and exports prior work (Priority: P3)

**Goal**: Conversations persist across sessions, are readable only by their owner, keep their
attributions after a rebuild, and can be renamed, deleted, exported, and rated.

**Independent Test**: Hold a conversation, sign out, sign back in, reopen it, verify the content
and attributions survived a rebuild, and export it.

- [ ] T139 [P] [US5] Define the conversation and message schemas in `Toxo_AI_code/backend_files/schemas/conversations.py` per contracts/api-v1.md
- [ ] T140 [US5] Implement `GET /api/v1/conversations` and `POST /api/v1/conversations` in `Toxo_AI_code/backend_files/routers/conversations.py`, listing most-recent-first and filtering by the authenticated `user_id` (FR-052, Principle II)
- [ ] T141 [US5] Implement `GET /api/v1/conversations/{id}` in `Toxo_AI_code/backend_files/routers/conversations.py` returning the exchange with attributions rendered from `snapshot_text` so a rebuild cannot change them, and returning `404` — not `403` — for another doctor's conversation (FR-053, FR-054)
- [ ] T142 [US5] Implement `PATCH` and `DELETE /api/v1/conversations/{id}` in `Toxo_AI_code/backend_files/routers/conversations.py`, with deletion removing the content (FR-055)
- [ ] T143 [US5] Implement `GET /api/v1/conversations/{id}/export` in `Toxo_AI_code/backend_files/routers/conversations.py` producing a self-contained document with the exchange, its attributions, and the date the answers were produced (FR-056)
- [ ] T144 [US5] Implement `POST /api/v1/messages/{id}/feedback` in `Toxo_AI_code/backend_files/routers/conversations.py` setting `helpful` on the message (FR-057)
- [ ] T145 [US5] Implement `GET /api/v1/admin/feedback` in `Toxo_AI_code/backend_files/routers/admin.py` returning aggregate answer feedback (FR-057)
- [ ] T146 [US5] Add automatic conversation titling and the conversation sidebar to `Toxo_AI_code/frontend_files/app.js` with rename, delete, and export controls
- [ ] T147 [US5] Add the helpful / not-helpful control to each answer in `Toxo_AI_code/frontend_files/app.js` (FR-057)
- [ ] T148 [US5] Make concurrent edits from two browser tabs on the same conversation non-corrupting in `Toxo_AI_code/backend_files/routers/conversations.py` by keying appends on message id rather than on client-held position (spec Edge Cases)
- [ ] T149 [P] [US5] Write integration tests in `Toxo_AI_code/backend_files/tests/integration/test_conversations.py` covering persistence across sessions, cross-user 404, attributions surviving a rebuild, rename, delete, export, and feedback
- [ ] T150 [US5] Apply the documented retention period to conversation history and captured training rows in `Toxo_AI_code/backend_files/services/retention.py`, driven by `CONVERSATION_RETENTION_DAYS` and `TRAINING_RETENTION_DAYS` (FR-075)

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The comparative evaluation harness, the security debts the plan owns, deployment, and
the release gates.

### Comparative evaluation (FR-093 to FR-096)

- [ ] T151 [P] Build the fixed benchmark question set `eval/benchmark/questions.v1.json` with at least 30 questions whose answers are present in the corpus, versioned so scores across runs are comparable (FR-096, SC-002)
- [ ] T152 Implement `eval/benchmark.py` running the SC-002 benchmark and the SC-015 replay against the fine-tuned model, vanilla Llama 3.2 1B Instruct, and the legacy GPT and Gemini models, reporting scores side by side and recording baseline API spend separately (FR-093, SC-022)
- [ ] T153 Emit `unmeasured_classes` on every result written by `eval/benchmark.py` and `eval/heldout.py`, refusing to write a result file without it (Principle VII, research.md R9)
- [ ] T154 Implement `POST /api/v1/admin/evaluations` and `GET /api/v1/admin/evaluations` in `Toxo_AI_code/backend_files/routers/admin.py` importing a harness result file and returning stored runs with `benchmark_version`, `split_version`, per-model scores, and the required `unmeasured_classes` (FR-095)
- [ ] T155 Render the evaluation results view in `Toxo_AI_code/frontend_files/app.js` with `unmeasured_classes` displayed **beside** the score, not in a footnote (Principle VII, contracts/api-v1.md)
- [ ] T156 Verify `Toxo_AI_code/requirements.txt` contains no GPT or Gemini client and that no third-party model credential is present in the production environment file (FR-094)

### Security debts this plan owns (Principle I)

- [ ] T157 Rotate `SECRET_KEY`, `HF_API_TOKEN`, and `RESEND_API_KEY` — they have been world-readable in `/etc/systemd/system/mychatbotproject.service` for the life of the deployment, so moving them is not sufficient
- [ ] T158 Install the rotated secrets into a root-owned mode-600 `/etc/mychatbotproject/env` and replace the live systemd unit with `Toxo_AI_code/deploy/mychatbotproject.service`, then `systemctl daemon-reload` and restart
- [ ] T159 [P] Confirm CORS in `Toxo_AI_code/backend_files/main.py` remains scoped to `mychatbotproject.uk` and localhost, with no wildcard (Principle I)
- [ ] T160 [P] Audit every log statement in `Toxo_AI_code/backend_files/` to confirm no submitted findings, question text, answer text, or secret value is written (FR-051, Principle I)

### Deployment and validation

- [ ] T161 Install and tune Neo4j Community on the production VM per `Toxo_AI_code/deploy/neo4j.md`, then measure resident memory with Neo4j, the embedding model, and the application all running — if the 4 GB budget in research.md R5 does not hold, resize the VM and revisit SC-014
- [ ] T162 Run `alembic upgrade head` against the production database at `/var/www/mychatbotproject/backend_files/users.db` as an explicit deploy step — copying files and restarting the unit does not run migrations (research.md R6)
- [ ] T163 Copy the application to `/var/www/mychatbotproject/`, restart the service, and diff the deployed tree against the repository to confirm parity — the repository is not the deploy target
- [ ] T164 Implement the identifier-injection suite `Toxo_AI_code/backend_files/tests/identifier_injection.py` submitting deliberate identifier-laden free text and asserting on **every** stored row in conversation history and `new_outputs.csv` and every operational log line, not a sample (SC-010, quickstart scenario 9)
- [ ] T165 Run the full `pytest` suite from `Toxo_AI_code/` and confirm the unit and integration suites are green
- [ ] T166 Execute all ten quickstart.md scenarios against the deployed system and record the outcome, treating scenarios 5, 6(b), 7, and 9 as release gates rather than smoke tests
- [ ] T167 [P] Measure SC-003 latency against a warm endpoint — 95% of questions answered within 20 seconds, visible progress within 2 seconds — and record the cold-start path separately
- [ ] T168 [P] Update `Toxo_AI_code/README.md` with the new architecture, the retired upload feature, the Neo4j dependency, and the migration deploy step
- [ ] T169 Resolve `TODO(INTENDED_USE)` in `.specify/memory/constitution.md` — research and thesis evaluation versus supply for use on real patients — since it determines whether UK medical device obligations are live, and carry the answer into the FR-047 disclosure text

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks every user story.** Within it, the schema
  tasks (T013–T023) block everything else, and the build pipeline (T037–T044) blocks both P1
  stories because neither can retrieve from a corpus that has never been built.
- **User Story 1 (Phase 3)**: Depends on Foundational. The offline model strand (T049–T054) has no
  dependency on the application and can run in parallel with Phase 2 from the start of the project
  — it is the long pole, and starting it late is the main schedule risk.
- **User Story 2 (Phase 4)**: Depends on Foundational. Reuses the retrieval service and the
  citations panel from US1 but is independently testable without the classifier.
- **User Story 3 (Phase 5)**: Depends on Foundational (the build pipeline it exposes).
- **User Story 4 (Phase 6)**: Depends on Foundational (the schema and the auth dependencies).
  Independent of US1, US2, and US3 — a hand-provisioned account is enough to test those.
- **User Story 5 (Phase 7)**: Depends on Foundational, and needs US1 or US2 to have produced a
  conversation worth revisiting.
- **Polish (Phase 8)**: Depends on the stories being delivered, except T157–T160, which are
  security debts that should be cleared as early as the deployment window allows.

### Within Each User Story

- Schemas before services, services before endpoints, endpoints before frontend.
- Tests for a story are written against its contract and may be written before the implementation;
  the clinical gates (T089–T092) can only be run after the model strand and the classify endpoint
  are both complete.

### Parallel Opportunities

- **Setup**: T003–T012 are all `[P]` — different files, no shared state.
- **Foundational**: the model additions T015–T020 are `[P]` with each other; the shared services
  T030–T033 are `[P]`; the two test tasks T046–T048 are `[P]`.
- **Across strands**: the four strands in plan.md proceed largely in parallel. The offline model
  work (T049–T054) and the offline evaluation work (T151–T153) touch no application file and are
  the clearest candidates for a second worker.
- **Across stories**: once Phase 2 is complete, US1, US2, US3, and US4 can be worked simultaneously
  by different people. US4 in particular shares no file with US1 except `routers/auth.py`.
- Every test task marked `[P]` targets its own test file and can run alongside the others.

### Parallel Example: User Story 1

```bash
# The offline model strand, independent of the application:
Task: "Implement the split generator eval/split.py"
Task: "Build the fixed benchmark question set eval/benchmark/questions.v1.json"

# Schemas and data, different files:
Task: "Create canonical_texts.v1.json in Toxo_AI_code/backend_files/data/"
Task: "Define the findings request schema in backend_files/schemas/classification.py"
Task: "Add the findings form to frontend_files/index.html"

# Tests, one file each:
Task: "Write findings-validation unit tests in tests/unit/test_findings_validation.py"
Task: "Write output-validation unit tests in tests/unit/test_output_validation.py"
Task: "Write classification integration tests in tests/integration/test_classify.py"
```

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (User Story 1)** — 92 tasks. This is the product: a doctor submits
findings and receives a classification with its reasoning. It is also the only increment that
exercises the clinical safety gates, so it is the first point at which the system can honestly be
said to work.

Start the offline model strand (T049–T054) on day one regardless of where the application work is.
Fine-tuning, endpoint provisioning, and the replay gate are sequential and slow, and every
application task in Phase 3 that touches the classifier is blocked behind a served model.

### Incremental delivery

1. Setup + Foundational → a corpus can be built and retrieved from a command line.
2. **+ US1** → classification works end to end; run the SC-015, SC-016, and SC-023 gates. **MVP.**
3. **+ US2** → the assistant educates as well as diagnoses; both P1 stories complete.
4. **+ US4** → access is closed and administered; the system can be opened to real clinicians.
5. **+ US3** → the corpus becomes maintainable without an operator at a shell.
6. **+ US5** → conversations persist, export, and gather feedback.
7. **+ Polish** → comparative evaluation, security debts cleared, deployment validated.

US4 is placed before US3 in the delivery order despite equal priority, because until registration
is closed the tool cannot be shown to anyone outside the project — and the corpus can be rebuilt by
command in the meantime.

### Parallel team strategy

With three workers after Phase 2:

- **Worker A**: the offline strand from day one — split, fine-tune, endpoint, then the gates.
- **Worker B**: US1's application path — schemas, classifier service, endpoints, frontend.
- **Worker C**: US4 (access) then US3 (curation), neither of which touches the classifier.

US2 and US5 fold into whoever finishes first; both build on surfaces the others have already
created.

---

## Notes

- `[P]` means a different file and no dependency on an incomplete task.
- The two Principle I violations the plan owns (T157, T158) predate this feature but are scheduled
  work, not accepted deviations. The secrets must be **rotated**, not merely relocated.
- SC-016 passing with the response cache active is **not** evidence the model is deterministic.
  T091 measures both ways and reports them separately; reporting only the cached run would be
  self-deception (research.md R2).
- SC-015 measures the whole corpus including the 19 training rows. It is a regression floor. T090
  is the only evidence of generalisation, and it speaks to three of the nine outcome classes.
- No task may introduce a deterministic classifier ahead of the model (FR-084), load synthetic rows
  into the graph (FR-090), or place a held-out tuple in training (FR-101).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
