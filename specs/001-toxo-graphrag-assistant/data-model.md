# Phase 1 — Data Model

**Feature**: Congenital Toxoplasmosis Clinical Knowledge Assistant
**Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)
**Date**: 2026-08-06

Three stores, each with a distinct job. **SQLite** is the system of record for accounts,
conversations, and operational history. **Neo4j** holds the knowledge graph that retrieval
traverses. **Flat files** hold the training corpus, the split, and the captured dataset, because
they must stay loadable by the offline pipeline without a database.

---

## 1. Relational schema (SQLite via SQLAlchemy)

### Existing tables, changed

#### `users` — extended

| Field | Type | Notes |
|---|---|---|
| `id` | int PK | unchanged |
| `username` | str unique | unchanged |
| `email` | str unique | unchanged |
| `hashed_password` | str | unchanged, bcrypt |
| `is_active` | bool | unchanged |
| `is_verified` | bool | unchanged — now set only after an *approved* request's link is followed |
| `verification_token` | str unique null | unchanged |
| `verification_token_expires` | datetime null | expiry extended to 14 days (FR-006) |
| `role` | enum(`administrator`,`doctor`) | **NEW** — FR-001. Exactly one administrator exists |
| `revoked_at` | datetime null | **NEW** — FR-009. Non-null means refuse all requests |
| `acknowledged_at` | datetime null | **NEW** — FR-047. Null blocks first use |
| `acknowledged_version` | str null | **NEW** — which disclosure text was acknowledged |
| `request_id` | int FK → `registration_requests.id` | **NEW** — every account traces to an approved request (FR-004) |

**Rule**: a `User` row is created *only* when a request is approved. A pending or rejected request
has no `User`, so "refuse sign-in to a pending address" is a property of the schema rather than a
check that could be forgotten.

#### `documents` — deleted

Dropped entirely, with its router, its endpoints, its UI, and the per-user FAISS stores under
`backend_files/vector_stores/` (FR-082). This is a deletion, not a deprecation.

### New tables

#### `registration_requests` — FR-004, FR-005, FR-085, FR-086

| Field | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `email` | str indexed | requested address; **not** unique — a rejected address may request again |
| `username` | str | requested display name |
| `submitted_details` | text | free text supporting the request; the Administrator's vetting evidence |
| `state` | enum(`pending`,`approved`,`rejected`) | |
| `created_at` / `decided_at` | datetime | |
| `decided_by` | int FK → users.id null | |
| `notification_sent` | bool | false if the Administrator email failed — request still visible in the admin view |

**Transitions**: `pending → approved` (creates the `User` and sends the verification link) and
`pending → rejected` (creates nothing). Both are terminal. No transition out of a terminal state;
a further attempt creates a new request.

#### `conversations` — FR-052 through FR-056

`id`, `user_id` FK, `title`, `created_at`, `updated_at`, `deleted_at` (null).
Every query filters by the authenticated `user_id` (Principle II).

#### `messages` — FR-052, FR-054

`id`, `conversation_id` FK, `role` (`user`/`assistant`), `content`, `created_at`,
`build_id` FK null (which knowledge build produced an answer), `kind`
(`question`/`answer`/`classification`), `helpful` (bool null, FR-057).

#### `attributions` — FR-032, FR-037, FR-054

`id`, `message_id` FK, `knowledge_unit_id` (the graph/vector unit key), `source_type`
(`thesis_passage`/`case_record`), `source_ref` (page/section, or record id), `snapshot_text`.

**`snapshot_text` is the point of this table.** FR-054 requires a stored answer's attributions to
survive a rebuild. Holding only a pointer into the graph would break the moment the graph is
rebuilt with new node ids, so the supporting text is copied at answer time.

#### `builds` — FR-020, FR-024, FR-025, FR-054

`id`, `started_at`, `finished_at`, `status` (`running`/`succeeded`/`failed`), `generation`
(monotonic int, used for the atomic swap), `sources_processed`, `entities_extracted`,
`relationships_extracted`, `case_records_indexed`, `units_skipped`, `dataset_revision`,
`failure_reason`.

Only one build has `is_active`. A build writes into its own generation and flips the pointer on
success, which is what makes FR-023 (a failed build leaves the previous one serving) structural.

#### `audit_events` — FR-012

`id`, `actor_user_id` null, `action`, `target`, `created_at`, `ip`. Append-only; no update or
delete path. Actions: sign-in, sign-in failure, registration request, request approved, request
rejected, revocation, source added/replaced/removed, build triggered, training row deleted.

#### `classification_events` — FR-062, FR-069, FR-070, FR-071

`id`, `user_id` FK, `message_id` FK, `findings_hash` (the cache key from R2), `model_version`,
`prompt_version`, `lookup_version`, `mother_classification`, `child_classification`,
`created_at`, `marked_incorrect` (bool), `marked_by` null, `capture_status`
(`written`/`failed`).

This is the database mirror of the `new_outputs.csv` row. It exists separately because FR-071
needs a mutable "clinically incorrect" flag and FR-076 needs a deletion path, neither of which an
append-only CSV supports. The CSV remains the training artefact; this table is how it is governed.

#### `evaluation_runs` — FR-095

`id`, `run_at`, `benchmark_version`, `split_version`, `results_json`, `imported_by`.
`results_json` carries per-model scores and the required `unmeasured_classes` list.

#### `operational_metrics` — FR-061

`id`, `bucket_start` (hourly), `question_count`, `failure_count`, `classification_count`.
Counts only — no question or answer content ever (FR-051, FR-061).

---

## 2. Knowledge graph (Neo4j)

### Node labels

| Label | Key properties | Source |
|---|---|---|
| `CaseRecord` | `record_id`, `dataset_revision`, `argumentation`, `recommendation`, `generation` | CSV, deterministic |
| `Concept` | `type`, `name`, `normalised_name`, `generation` | Both sources, joined on `normalised_name` |
| `MaternalClassification` | `label`, `generation` | CSV — 5 distinct values |
| `ChildClassification` | `label`, `generation` | CSV — 4 distinct values |
| `Recommendation` | `text`, `generation` | CSV |
| `ThesisPassage` | `passage_id`, `text`, `page`, `section`, `generation` | PDF |
| `SourceDocument` | `title`, `revision`, `ingested_at`, `generation` | Both |
| `ConceptGroup` | `group_id`, `summary`, `generation` | Build-time clustering (FR-030) |

`Concept.type` covers the FR-027 set: serological marker and result, gestational timing, maternal
classification, child classification, clinical finding, diagnostic investigation, recommendation,
source document.

### Relationships

`(:CaseRecord)-[:EXHIBITS]->(:Concept)` · `(:CaseRecord)-[:CLASSIFIED_AS]->(:MaternalClassification|:ChildClassification)` ·
`(:CaseRecord)-[:RECOMMENDS]->(:Recommendation)` · `(:Concept)-[:CO_OCCURS_WITH {weight}]->(:Concept)` ·
`(:ThesisPassage)-[:MENTIONS]->(:Concept)` · `(:ThesisPassage)-[:FROM_DOCUMENT]->(:SourceDocument)` ·
`(:Concept)-[:IN_GROUP]->(:ConceptGroup)`

**The join is the whole point.** A concept extracted from the thesis and the same concept derived
from the CSV must resolve to one node, matched on `normalised_name` against a controlled
vocabulary built from the CSV's own distinct values. Anything the thesis surfaces that does not
match becomes a new node — never a fuzzy merge, because a wrong merge silently attributes a
thesis claim to a clinical finding it does not describe.

### Generation tagging

Every node and relationship carries `generation`. A build writes generation *n+1* while queries
read *n*; on success the active pointer moves and the old generation is retained for rollback.
This gives FR-022, FR-023, and FR-025 without mutating a live graph.

### Synthetic data

**No node in this graph may carry a synthetic marker** (FR-090). Derived examples, if FR-088 is
ever taken up, are training-only and never enter the graph or an attribution.

---

## 3. Classification contract data

### The 14 input findings and their permitted values (FR-064)

Taken from `logs/request-logs.csv`. `None` and `-` are meaningful — "not performed" and "not
recorded" respectively — and are permitted values, not nulls.

| Finding | Permitted values |
|---|---|
| `fundoscopic` | Normal, Abnormal, Inconclusive |
| `neuroimaging` | Normal, Abnormal |
| `pcr_la` | None, Positive |
| `first_igm` | Negative, Positive, High, Indeterminate |
| `first_igg` | Negative, Positive |
| `first_avidity` | None, Low, High |
| `first_weeks` | integer, gestational week of the first sample |
| `last_igm` | -, Negative, Positive |
| `last_igg` | -, Negative, Positive |
| `post_igm` | -, Negative, Positive |
| `post_igg` | -, Negative, Positive |
| `child_igm` | Negative, Positive |
| `child_iga` | None, Negative, Positive |
| `child_igg` | Negative, Positive |

A value outside its set is rejected with the permitted values stated — never coerced (Principle
IV). A missing finding is requested from the doctor — never inferred (FR-067).

### Output value sets (FR-065)

**Maternal** (5): `Infecção anterior à gestação` · `Infecção aguda provável` ·
`Infecção aguda na gestação possível` · `Infecção aguda na gestação confirmada` ·
`Situação não parametrizada`

**Child** (4): `AUSENTES` · `COMPATÍVEIS` · `FUNDOSCOPIA DUVIDOSA` ·
`Apenas IgM reagente e/ou IgA (se realizado) e criança assintomática`

`Situação não parametrizada` MUST be surfaced as "no classification could be determined" and
never as a clinical conclusion (FR-044, SC-018).

### Canonical text lookup (R1)

`backend_files/data/canonical_texts.v1.json` — keyed by
`(mother_classification, child_classification)`, holding the verbatim Portuguese `argumentation`
and `recommendation`. Derived from the historical dataset, where each pair maps to exactly one of
each. Versioned; `lookup_version` is recorded on every classification event (FR-062).

---

## 4. Corpus split (fixed)

**Version**: `split.v1` · **Rule**: within each `final_situation` class, sort distinct input
tuples by `sha256` of their joined finding values; take the first *k* as held-out, where *k* is
allocated across eligible classes by largest remainder to a 30% overall target. Classes with one
distinct tuple are ineligible and go to training.

**Result**: 13 training tuples (19 rows) / 5 held-out tuples (5 rows) — **72% / 28%**.

### Held-out test set — never seen in training (FR-101)

| `final_situation` | Record id | Tuple hash |
|---|---|---|
| 0 | 17 | `62bdcbb9` |
| 0 | 5 | `7cdd5e47` |
| 13 | 13 | `018e3d8f` |
| 13 | 21 | `43dd784c` |
| 15 | 24 | `04f97e6f` |

### Training portion by class

| `final_situation` | Training tuples | Eligible for held-out? |
|---|---|---|
| 13 | 3 | yes (2 held out) |
| 0 | 2 | yes (2 held out) |
| 15 | 2 | yes (1 held out) |
| 1, 3, 7, 16, 18, 20 | 1 each | **no — single tuple, untested** |

### The limitation, stated where it cannot be missed

**Six of the nine outcome classes are represented by a single input tuple and are therefore
never tested.** SC-023's generalisation figure speaks only to classes 13, 0, and 15. Every
evaluation result carries these six in an `unmeasured_classes` field, and the Administrator's
evaluation view renders it beside the score (FR-103, Principle VII).

Records 22 and 23 are byte-identical in their findings and resolve to one tuple, which is why the
split is taken over tuples rather than rows (FR-102).

---

## 5. Flat-file artefacts

| Path | Purpose | Rules |
|---|---|---|
| `logs/request-logs.csv` | The 24 historical records — authoritative corpus | Read-only. Never written by the application |
| `eval/split.v1.json` | The fixed split (FR-104) | Committed. `eval/split.py` regenerates it; a mismatch fails the build |
| `backend_files/data/new_outputs.csv` | Captured classifications (FR-069, FR-072) | Append-only, schema-compatible with the historical CSV, canonical Portuguese text only (FR-079), never committed to git |
| `backend_files/data/canonical_texts.v1.json` | The R1 lookup | Versioned; changes bump `lookup_version` |
| `eval/benchmark/questions.v1.json` | The SC-002 question set (FR-096) | Fixed across runs; versioned when changed |

---

## 6. What is deliberately absent

- **No patient identifier field anywhere.** Not in the findings form, not in any schema, not in
  any export (FR-048). Free text is the only route in, which is why R10 strips on the write path.
- **No `documents` table, no per-user vector store, no upload path** (FR-082).
- **No synthetic training rows** in this delivery (FR-087). The `Synthetic Training Case` entity
  is defined in the spec for the deferred FR-088 enhancement and has no storage here.
- **No question or answer content in `operational_metrics` or in any log line** (FR-051, FR-061).
