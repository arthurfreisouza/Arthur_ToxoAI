<!--
Sync Impact Report
==================
Version change: 2.0.0 → 2.1.0 (MINOR — guidance added and a mechanism restated;
  no guardrail weakened)

Bump rationale: this amendment closes the five divergences opened by the second
  and third `/speckit-clarify` sessions of 2026-08-06, recorded in the feature
  spec's Constitution Impact section. Nothing is removed or reversed. Principle I
  restates the registration mechanism (the guarantee behind it is unchanged, and
  a new rate-limit rule strengthens it); Principle VII gains the held-out split
  and synthetic-data rules; the clinical regression gate gains a second
  measurement. Governance defines MAJOR as removing or redefining a principle
  backward-incompatibly, and reserves it for anything that *weakens* Principle III
  or VII — this amendment does neither, so MINOR is the correct bump. The v2.0.0
  rationale (the deliberate reversal of the no-diagnosis guardrail) lives in git
  history; its substance is now carried in Principle III's own text.

Modified principles:
  - I. Security & Privacy First — the invitation mechanism is replaced by
    request-then-approve. No account may exist without an explicit Administrator
    authorisation, which is the unchanged guarantee; the public request form is
    newly rate limited so it cannot be used as a spam relay.
  - V. Simplicity & Minimal Dependencies — records that the `rules/` decision
    engine is an offline labelling tool that is NOT deployed, so its presence in
    the tree is not mistaken for a second classifier in production.
  - VII. Training Data Integrity — extended to govern the fine-tuning corpus, not
    only captured rows: a held-out test portion that never reaches training, a
    split taken over distinct input tuples rather than rows, and honest reporting
    of outcome classes the data cannot test. Synthetic-example rules added for the
    day rule-engine augmentation is taken up.

Modified sections:
  - Technology & Operational Constraints — the model is now specific: Llama 3.2 1B
    Instruct, private Hugging Face repository, scale-to-zero Inference Endpoint,
    with a 1B → 3B → 8B escalation path.
  - Development Workflow & Quality Gates — the clinical regression gate now names
    the held-out evaluation alongside the historical replay, because a green
    replay on a corpus the model trained on no longer evidences generalisation.

Added sections: none. Removed sections: none.

Templates requiring updates: none — no template encodes these principles.

Follow-up TODOs:
  - TODO(INTENDED_USE): confirm whether this system is research/thesis evaluation
    or is supplied for use on real patients. This determines whether UK medical
    device obligations are live. Recorded in Principle III and the Regulatory
    Posture section; must be resolved before any clinical use. Still open.
  - Secrets currently inline in /etc/systemd/system/mychatbotproject.service are
    non-compliant with Principle I and should be rotated and moved to an
    EnvironmentFile. Still open.
-->

# ToxoAI Constitution

ToxoAI is a clinical decision-support application for congenital toxoplasmosis at
`mychatbotproject.uk`. Invited, authenticated doctors submit a patient's clinical and
serological findings and receive a maternal classification, a child classification, an
argumentation, and a recommendation, together with an explanation grounded in a curated
knowledge corpus. The same assistant also answers free-text educational questions about the
disease. It is a FastAPI backend with JWT authentication and email verification, a fine-tuned
language model performing classification and explanation via GraphRAG over a Neo4j knowledge
graph, and a vanilla-JavaScript single-page frontend served behind nginx.

The system both diagnoses and educates. That dual mandate is deliberate, and Principle III
exists to make it safe.

## Core Principles

### I. Security & Privacy First (NON-NEGOTIABLE)

ToxoAI handles sensitive health data; a leak is a harm to real people, not just a bug.

- Secrets (`SECRET_KEY`, `HF_API_TOKEN`, `RESEND_API_KEY`, Neo4j credentials) MUST be read
  from the environment. Hard-coding a secret, committing `.env`, logging a secret value, or
  writing one inline into a systemd unit file is grounds for immediate rejection of a change.
  Service units MUST use `EnvironmentFile=` pointing at a root-owned, mode-600 file.
- Passwords MUST be hashed with bcrypt via passlib; plaintext passwords MUST never be stored,
  logged, or returned in any response.
- Authentication MUST use short-lived JWTs (60-minute expiry) verified by the shared
  `get_current_user` dependency. New authenticated endpoints MUST use this dependency — no
  hand-rolled token checks.
- Every account MUST originate in a registration request that the Administrator has explicitly
  authorised. Authorisation is manual and is the vetting step; no address may become an account
  without it. Only after authorisation is an email verification link issued, and the account
  MUST complete that verification before it can sign in. (This replaces the earlier
  invitation-first mechanism. The guarantee is identical — no account exists without an
  Administrator decision — but the decision now follows the request instead of preceding it.)
- The registration request endpoint is unauthenticated and publicly reachable, so it MUST be
  rate limited by source address and by requested email address, and a request refused by that
  limit MUST NOT generate an Administrator notification. Without this, the Administrator's
  inbox is a spam relay.
- Registration responses MUST NOT reveal whether an address already has an account.
- CORS MUST remain scoped to `mychatbotproject.uk` (and localhost for dev). Opening CORS to
  `"*"` is prohibited.
- The system MUST NOT request, require, or provide a field for any direct patient identifier.
  Identifiers detected in free text MUST be stripped on the write path, before anything is
  persisted — never as a later cleanup pass.
- Clinical findings remain health data even when de-identified. They MUST carry a documented
  retention period, and the Administrator MUST be able to delete any stored row on request.
- Submitted findings and returned classifications MUST NOT be written to operational logs.
  Diagnostic logging is limited to non-content metadata.
- Abuse-prone endpoints (chat and classification) MUST be rate limited (30 requests / 60 s per
  user, HTTP 429 on excess).

### II. Shared Corpus, Isolated Patient Records

The knowledge corpus is shared; user records are not.

- The curated corpus — the thesis, the historical case dataset, and the derived knowledge
  graph — is a single shared resource, curated by the Administrator alone and read identically
  by every doctor.
- Doctors MUST NOT be able to upload, alter, or remove source material, and no upload
  capability may be exposed to the Doctor role. The per-user document upload feature of
  earlier versions is retired.
- A classification MUST depend only on the submitted findings and the shared corpus, never on
  who submitted it.
- Each doctor's conversations, submitted cases, and returned classifications remain private to
  that doctor. Every database query for user-owned rows MUST filter by the authenticated
  user's id. Cross-user reads of user records are prohibited.

Rationale: a shared corpus is what makes a classification reproducible — two doctors
submitting identical findings must get identical results, which is impossible if retrieval
depends on private per-user documents. Isolation still applies absolutely to what each doctor
submits and receives.

### III. Clinical Decision Support Safety (NON-NEGOTIABLE)

The assistant classifies an individual patient and explains its reasoning. It is decision
support: it informs the treating clinician's judgement and does not replace it. Because the
previous prohibition on personal diagnosis has been deliberately removed, the following
safeguards take its place and MUST NOT be weakened without an explicit MAJOR amendment.

- **Reproducibility**: identical findings MUST produce an identical classification. Variation
  across identical inputs is a defect, not acceptable model behaviour.
- **Fidelity to ground truth**: the system MUST reproduce the recorded classifications for all
  historical cases in the reference dataset. Any mismatch blocks release until it is fixed or
  signed off in writing after clinical review.
- **Constrained output**: every returned classification, argumentation, and recommendation
  MUST fall within the defined permitted value sets, validated on every response rather than
  by sampling. Output outside those sets MUST be rejected and surfaced as an explicit failure,
  never shown to a doctor.
- **Explicit non-classification**: where findings fall outside the parameterised rules, the
  system MUST report that no classification could be determined. That outcome MUST NEVER be
  rendered as a clinical conclusion.
- **Explained, not asserted**: every classification MUST be accompanied by an explanation
  citing the corpus material supporting it, and the doctor MUST be able to see which input
  findings drove the result. An unexplainable classification is not shippable.
- **Clinician responsibility**: every classified result MUST state that clinical judgement and
  responsibility rest with the treating clinician.
- **Auditability**: every classification MUST record the configuration version that produced
  it, so any past result can be reproduced and reviewed.
- **No fabrication**: failures of the model or retrieval MUST surface as explicit errors
  (HTTP 502), never as invented output.
- **Educational answers**: free-text educational responses MUST be grounded in the corpus and
  MUST state plainly when the corpus does not cover a question.

Rationale: the prior guardrail achieved safety by refusing to classify. Having chosen to
classify, safety must now come from reproducibility, constraint, transparency, and the
honesty to say "not parameterised" instead of guessing.

### IV. Explicit API Contracts & Validation

- Every request and response body MUST be modeled with Pydantic schemas; input rules live in
  validators, not in endpoint bodies.
- Clinical findings MUST be validated against their permitted value sets on input. A value
  outside its set MUST be rejected with the permitted values stated — never coerced to the
  nearest match.
- Missing required findings MUST be requested from the doctor. The system MUST NOT infer,
  default, or guess a finding.
- All user-facing routes MUST live under the `/api/v1` prefix on the appropriate router; only
  `/` and `/health` are exempt. The `documents` router is retired with the upload feature.
- Every `HTTPException` MUST carry a meaningful, user-readable `detail` string and a
  semantically correct status code (401 bad credentials, 403 unverified or unauthorised,
  422 invalid findings, 429 rate limited, 502 upstream AI failure, 503 unconfigured).
- Breaking API changes require a new version prefix (`/api/v2`); documented `/api/v1`
  contracts MUST NOT change shape silently.

### V. Simplicity & Minimal Dependencies

Start simple; add machinery only when a measured need exists. The frontend is vanilla
HTML/CSS/JavaScript — no framework, build step, or bundler without a documented justification.
The rate limiter is an in-process sliding window — no Redis until multi-process deployment
demands it. SQLite remains the relational store; migration to PostgreSQL is the sanctioned
path when concurrent writes require it, and MUST go through SQLAlchemy ORM either way. Every
new dependency MUST be pinned or lower-bounded and justified in the PR description.

Recorded exception: **Neo4j and GraphRAG are owner-mandated** as of 2026-08-06. They were
adopted by decision rather than by demonstrated need — the reference corpus is one thesis and
24 case records, a scale this principle would otherwise not justify. The exception is logged
here so it is visible as a decision rather than mistaken for precedent. It does not license
further unjustified infrastructure.

Recorded clarification: the `rules/` directory holds **Toxoexpert**, a complete deterministic
rule engine that classifies the same findings this system classifies. It is a development-time
tool only. It MUST NOT be deployed, MUST NOT be reachable from the application, and MUST NOT
decide any classification a doctor receives — Principle III places that accountability on the
fine-tuned model alone. Its sole sanctioned use is offline labelling of synthetic training
data under Principle VII, and that use is currently deferred.

### VI. Performance Through Deliberate Caching

Expensive resources are loaded once and cached, never re-created per request. The embedding
model is a singleton; graph and retrieval clients are obtained through shared module functions
rather than instantiated ad hoc. Any operation that rebuilds the knowledge graph MUST
invalidate the corresponding cached state. This pattern exists because re-creating the
embedding model per request was a real, critical performance bug; regressions here are treated
as correctness bugs.

The embedding model MUST be multilingual. The corpus is predominantly Brazilian Portuguese
while questions may arrive in any language, and an English-centric model degrades every
retrieval and therefore every classification downstream.

### VII. Training Data Integrity

This principle governs both bodies of training data: the fine-tuning corpus the model learns
from, and the append-only dataset captured from live classifications for future model work.
Both are useful and dangerous in equal measure.

**The fine-tuning corpus and its split.** The reference corpus is 24 recorded cases holding 18
distinct input tuples across 9 recorded outcomes. At that size, how the data is divided decides
whether the project's primary safety test means anything.

- A held-out test portion MUST be reserved and MUST NOT reach fine-tuning in any form —
  not as a row, not as a paraphrase, not as a retrieval example.
- The division MUST be taken over **distinct input tuples, not rows**. The corpus contains
  records identical in their findings; splitting by row places a case in the test set that the
  model already trained on, and the resulting score measures memorisation while appearing to
  measure generalisation.
- The split MUST be a fixed, versioned artefact, not regenerated per run, so that two reported
  scores are comparable and any score can be reproduced.
- Outcome classes represented by a single input tuple cannot appear on both sides of a split.
  They MUST be assigned to training, and every evaluation report MUST name them as unmeasured.
  A headline score MUST NOT be allowed to imply coverage the data cannot support.
- Replaying the full historical corpus is a regression floor, not evidence of generalisation.
  Reporting it as the latter is a violation of this principle.

**Synthetic examples.** Rule-engine augmentation is deferred, not forbidden. If it is taken up:

- Examples MUST be labelled only from a *validated* rule configuration. The example
  configuration in `rules/` declares its own values fictitious and clinically invalid and MUST
  NEVER be used as a labelling source — plausible-looking wrong clinical labels are worse than
  no synthetic data.
- Each example MUST be marked synthetic, held separately from the recorded cases, and carry the
  configuration version that produced it.
- Synthetic examples MUST NOT enter the knowledge graph, MUST NOT be cited to a doctor as
  supporting material, and MUST NOT appear in any evaluation or benchmark set.

**Captured live classifications.**

- Captured rows MUST record the timestamp, the configuration version, and the submitting
  account, and MUST be schema-compatible with the historical reference dataset.
- Captured rows MUST carry the canonical Portuguese clinical text, never a translation, so the
  captured data does not drift away from the dataset it extends.
- A doctor or the Administrator MUST be able to mark a captured row as clinically incorrect,
  and marked rows MUST be excluded from training. Without this, the model's own errors become
  tomorrow's training labels and compound silently.
- Patient-identifier protections apply in full: this is a durable corpus, not transient
  history.
- A failure to capture MUST NOT deny the doctor their classification, and MUST be raised to
  the Administrator rather than silently dropped.

## Regulatory Posture

Software intended to inform the diagnosis of an individual patient generally meets the UK
definition of a medical device, bringing it within the UK Medical Devices Regulations and
requiring UKCA marking and a registered manufacturer before it may be supplied for clinical
use. This constitution records that as a fact about the product category, not as a judgement
about whether to build it.

- Until intended use is confirmed and any obligation assessed, the application MUST display an
  explicit statement of what it is, what it was built from, its limitations, and its
  regulatory status, and MUST record each doctor's acknowledgement before first use.
- TODO(INTENDED_USE): the project owner MUST confirm whether this system is research and
  thesis evaluation or is supplied for use on real patients. This single fact determines
  whether the obligation above is live. It MUST be resolved before any clinical use.

## Technology & Operational Constraints

- **Stack**: Python 3 / FastAPI / Uvicorn; SQLAlchemy ORM over SQLite; python-jose (JWT) +
  passlib (bcrypt); Neo4j for the knowledge graph, queried with Cypher; a multilingual
  sentence-transformer for embeddings; a fine-tuned Llama model served over HTTP; Resend for
  email; vanilla JS/HTML/CSS frontend.
- **Model and serving**: the base model is Llama 3.2 1B Instruct. Fine-tuned weights MUST live
  in a **private** Hugging Face repository — they derive from clinical records and MUST NOT be
  published — and MUST be served from an endpoint that releases compute when idle, so recurring
  cost tracks use. The resulting cold start MUST be surfaced to the doctor as an explicit
  "model starting" state with the submitted question preserved, never as an unexplained wait.
  Where the fine-tuned model fails the reproducibility or fidelity gates of Principle III, the
  sanctioned remedy is escalation of the base model (1B → 3B → 8B), never relaxation of a gate
  and never handing classification to a rules engine.
- **Third-party models**: the production host MUST NOT hold credentials for, or call, any model
  service other than the one serving the fine-tuned model. Comparative benchmarking against
  other models runs offline; only its stored results are surfaced in the application.
- **Layout**: backend code in `backend_files/`, frontend in `frontend_files/`, infrastructure
  in `deploy/`. The backend MUST be run from inside `backend_files/` — the SQLite path and
  data directories are CWD- and module-relative.
- **Configuration**: every new configuration value MUST have an entry in `.env.example` with a
  comment explaining it; defaults in code MUST be safe for local development only.
- **Deployment**: production serves from `/var/www/mychatbotproject/`, which is a **manual
  copy and not a checkout of this repository**. Editing the repository changes nothing in
  production. A backend change MUST be copied to `/var/www/mychatbotproject/backend_files/`
  and the `mychatbotproject.service` unit restarted. nginx terminates HTTPS and proxies
  `/api/` and `/health` to `127.0.0.1:8000`. `deploy/creating_VM.yaml` provisions
  infrastructure only and does not deploy code.
- **Runtime data** (`users.db`, `vector_stores/`, graph data, captured training data, `.env`)
  MUST never be committed to git.

## Development Workflow & Quality Gates

- **Documentation parity**: the README and `.github/copilot-instructions.md` describe the
  system's contracts. Any change to endpoints, validation rules, environment variables, or
  project layout MUST update them in the same change set.
- **Deployment parity**: a user-visible fix MUST NOT be reported as live until the deployed
  copy has been verified. Diff `/var/www/mychatbotproject/` against the repository and exercise
  the running service — do not infer from the repository state.
- **Clinical regression gate**: any change touching classification, retrieval, prompts, or the
  model MUST replay the full historical case dataset and match the recorded classifications
  before merge. This is the project's primary safety test. It MUST be reported together with
  the held-out evaluation required by Principle VII: the replay covers cases the model trained
  on and so proves the absence of regression, while only the held-out result speaks to a case
  the model has not seen. Quoting the replay alone as evidence the model works is prohibited.
- **Verification before merge**: a change MUST be exercised locally — backend started from
  `backend_files/`, affected endpoints hit, and the frontend flow clicked through when UI is
  touched. New backend features MUST arrive with tests for their success and failure paths.
- **Review checklist**: every review verifies compliance with Principles I–VII, in that order
  of priority. Security and clinical-safety findings block merge unconditionally.
- **Error-path honesty**: partial failures MUST clean up after themselves — no orphaned state.
- **Commits**: small, focused commits with descriptive messages; work happens on branches off
  `master`, merged via PR.

## Governance

This constitution supersedes ad-hoc practice. Where code and constitution disagree, either the
code is fixed or the constitution is amended — silently diverging is not an option.

- **Amendments**: proposed as a PR against `.specify/memory/constitution.md` stating the
  change, its rationale, and its migration impact. The project owner (Arthur) approves
  amendments.
- **Versioning**: semantic versioning of this document. MAJOR for removing or redefining a
  principle in a backward-incompatible way; MINOR for adding a principle or materially
  expanding guidance; PATCH for clarifications and wording fixes. Every amendment updates the
  version line and the Sync Impact Report comment.
- **Clinical-safety amendments**: any change weakening a safeguard in Principle III or VII is
  MAJOR by definition and MUST state, in writing, what replaces the safeguard being removed.
- **Compliance review**: every PR review checks changes against the Core Principles;
  deviations MUST be justified in writing in the PR or the change MUST be reworked. Complexity
  beyond what Principle V sanctions requires a documented reason, and the Neo4j/GraphRAG
  exception is not precedent for further exceptions.
- **Runtime guidance**: day-to-day agent and contributor guidance lives in
  `.github/copilot-instructions.md`; it MUST stay consistent with this constitution and defers
  to it on conflict.

**Version**: 2.1.0 | **Ratified**: 2026-08-06 | **Last Amended**: 2026-08-06
