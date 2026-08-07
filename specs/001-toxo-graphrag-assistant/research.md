# Phase 0 — Research

**Feature**: Congenital Toxoplasmosis Clinical Knowledge Assistant
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)
**Date**: 2026-08-06

Ten decisions. Each states what was chosen, why, and what was rejected. No NEEDS CLARIFICATION
markers remain in the Technical Context.

---

## R1 — How constrained output and "the model classifies" can both be true

**Decision**: The model emits **only the classification labels**, under constrained decoding. The
canonical Portuguese argumentation and recommendation are then rendered from a checked-in lookup
table keyed by the `(mother_classification, child_classification)` pair.

**Rationale**: FR-084 requires the fine-tuned model to produce the classification with no
deterministic classifier deciding ahead of it. SC-019 requires 100% of returned classifications,
argumentations, and recommendations to fall inside the permitted value sets, validated on every
response. Asking a 1B model to compose free clinical prose and then validating that prose against
a value set is a contradiction — the value set for argumentation *is* a fixed set of texts.

The historical data settles it: across all 24 records, every distinct
`(mother_classification, child_classification)` pair maps to exactly one argumentation and one
recommendation text. The argumentation is not generated content in the source system either; it
is canonical text attached to an outcome. Rendering it from a lookup is therefore faithful to the
data, not a shortcut around the model.

The model still decides the outcome, which is what FR-084 protects. The lookup only decides how
that outcome is *worded*, and FR-079 already requires the stored wording to match the historical
dataset exactly — which a generated paraphrase could not do.

**Alternatives considered**:
- *Model generates everything, validated after*: rejected. Any free-text argumentation fails
  exact-match validation against the canonical set, so either SC-019 or FR-079 breaks.
- *Model generates the argumentation, validated by similarity*: rejected. A similarity threshold
  is a judgement call inside a clinical safety gate, and Principle III requires validation on
  every response rather than by tolerance.
- *Rules engine picks the class, model writes prose*: rejected — FR-084 forbids it explicitly,
  and the owner reaffirmed this on 2026-08-06.

**Where GraphRAG earns its place**: the *explanation* — why these findings support this
classification, which thesis passages bear on it, which historical cases resemble it. That is
free-text, genuinely generated, genuinely grounded, and is not part of the constrained clinical
conclusion. It is also what makes the diagnose-and-educate mandate coherent.

---

## R2 — Making SC-016 (identical input → identical output) actually hold

**Decision**: Two layers. (a) Greedy decoding — `temperature=0`, `top_p=1`, `do_sample=false`,
fixed seed. (b) A **response cache** keyed by `sha256(normalised findings) + model version +
prompt version + lookup version`; a cache hit returns the stored classification verbatim.

**Rationale**: Greedy decoding is necessary but not sufficient. On a hosted endpoint, identical
prompts can still produce different tokens across replicas, batch compositions, or a silent
runtime upgrade — floating-point non-associativity in batched attention is enough. SC-016 asks
for 20 identical submissions to yield an identical result, and Principle III calls variation a
defect rather than acceptable model behaviour. A keyed cache makes it true structurally.

**The trap, recorded so it is not walked into**: the cache makes SC-016 pass whether or not the
model is deterministic. Measuring determinism therefore requires bypassing it. The evaluation
harness sets `X-Bypass-Classification-Cache` (admin-only, see contracts/api-v1.md) and
quickstart.md scenario 6 asserts both — determinism with the cache bypassed, and identity with it
active. Reporting only the cached result as evidence would be self-deception.

**Alternatives considered**:
- *Greedy decoding alone*: rejected as unprovable against a hosted endpoint that may change under
  you.
- *Cache alone with sampling*: rejected. The first response of any new input would still be
  arbitrary, and that is the response a doctor sees.

---

## R3 — Fine-tuning method for 13 training examples

**Decision**: LoRA (via `peft` + `trl`) on `meta-llama/Llama-3.2-1B-Instruct`. Low rank
(r=8–16), small learning rate, few epochs with early stopping evaluated on the held-out portion,
adapter merged into the base weights and pushed to a **private** Hugging Face repository.

**Rationale**: The training portion is 13 distinct input tuples (19 rows). Full-parameter
fine-tuning on that would not adapt the model, it would damage it — catastrophic forgetting of
instruction-following is the realistic outcome, and the model still needs to write coherent
grounded explanations. LoRA changes a small number of parameters, is recoverable, is cheap enough
to re-run whenever the split or prompt changes, and keeps the base model's general competence
intact for the explanation path.

Training targets the **classification labels only**, consistent with R1. The model is not trained
to emit argumentation or recommendation text.

**Alternatives considered**:
- *Full fine-tune*: rejected — the dataset is three orders of magnitude below what that needs.
- *Few-shot prompting with no fine-tune at all*: technically the stronger engineering choice at
  this data volume, and `architecture-notes.md` argues it well. Rejected because fine-tuning is an
  owner requirement and a thesis contribution. FR-087 keeps few-shot prompting alongside it, so
  the retrieval-and-exemplar path exists regardless of what fine-tuning achieves.
- *QLoRA*: available if training hardware is constrained; no benefit at 1B if a 16 GB GPU is
  available, so not the default.

**Honest expectation to carry into the plan**: with 13 training tuples, the likeliest outcome is
strong memorisation of those tuples and weak generalisation to the 5 held out. SC-023 exists to
measure that rather than assume it, and FR-084's 1B → 3B → 8B ladder is the sanctioned response.

---

## R4 — The corpus split

**Decision**: Split over the **18 distinct input tuples**, stratified by `final_situation`,
producing **13 training tuples (19 rows) and 5 held-out tuples (5 rows)** — 72%/28%. Generated by
a deterministic rule and committed as a versioned artefact.

**Rationale**: FR-101 asks for approximately 70/30, FR-102 requires the split to be taken over
distinct tuples (records 22 and 23 are byte-identical in their findings), FR-103 requires
stratification, and FR-104 requires the split to be fixed rather than regenerated per run.

Only three of the nine `final_situation` classes hold two or more distinct tuples (5, 4, and 3
tuples respectively — 12 in total). The remaining six classes hold exactly one tuple each and
therefore cannot appear on both sides of any split; they are assigned to training and are
**untested**. Held-out quota is allocated across the three eligible classes by largest remainder:
2, 2, 1.

The generating rule — sort each class's tuples by `sha256` of the joined finding values, take the
first *k* as test — is stable, order-independent, and re-runnable. `eval/split.py` regenerates it;
the committed artefact is the authority, and a mismatch between the two is a build failure.

The concrete assignment is in [data-model.md](./data-model.md#corpus-split-fixed).

**Alternatives considered**:
- *Split by row*: rejected — puts record 22 in training and its twin 23 in test.
- *Leave-one-out cross-validation*: statistically better at this size, and was offered. The owner
  chose a single fixed 70/30 split, which is simpler to report in a thesis and cheaper to run.
- *Random split per run*: rejected by FR-104 — two runs would not be comparable.

---

## R5 — Embedding model, and the 4 GB memory budget

**Decision**: Replace `sentence-transformers/all-MiniLM-L6-v2` with
`intfloat/multilingual-e5-small` (~470 MB resident, 384-dim). Neo4j is configured with a 512 MB
heap and 512 MB page cache. Both are pinned in `.env.example` and the deploy notes.

**Rationale**: This is the tightest constraint in the plan and it is a memory problem before it is
a quality problem. The VM is 2 vCPU / 4 GB and must simultaneously hold Neo4j (JVM heap + page
cache + ~350 MB overhead), the embedding model, the FastAPI process, FAISS, and the OS. A rough
budget:

| Component | Budget |
|---|---|
| OS + nginx | ~400 MB |
| Neo4j (512 heap + 512 page cache + JVM overhead) | ~1.4 GB |
| Embedding model (multilingual-e5-small) | ~470 MB |
| FastAPI + FAISS + Python runtime | ~600 MB |
| Headroom | ~1.1 GB |

`LaBSE` (~1.8 GB) and `multilingual-e5-large` (~2.2 GB) are both better retrievers and both
break this budget outright. `paraphrase-multilingual-MiniLM-L12-v2` (~470 MB) is the fallback if
e5-small underperforms on the benchmark.

Principle VI requires the embedding model to be multilingual — the corpus is Brazilian Portuguese
and questions may arrive in any language. The current MiniLM is English-centric and degrades every
retrieval and therefore every grounded explanation.

**Alternatives considered**:
- *Keep MiniLM*: rejected by Principle VI and by FR-080.
- *A larger multilingual model with a bigger VM*: viable, but the VM upgrade lands against
  SC-014's £40 ceiling. Revisit only if e5-small measurably fails the SC-002 benchmark — measure
  first, spend second.
- *Hosted embedding API*: rejected. It adds a per-query external dependency and cost to a path
  that currently has neither.

**Action for planning**: measure actual resident memory on the VM with Neo4j running before the
first production deploy. If the budget above proves optimistic, the VM must be resized and SC-014
revisited — which the spec already anticipates.

---

## R6 — Schema migration against a live SQLite database

**Decision**: Introduce Alembic. Every schema change ships as a reviewed migration with a
downgrade path. `init_db()` is retained only for a fresh local database.

**Rationale**: The account table gains a role, a revocation state, an acknowledgement record, and
a link to a registration request; five tables are added. `init_db()` uses
`Base.metadata.create_all`, which creates missing tables and **silently ignores changed columns** —
so today, adding a column to `User` would appear to work locally and do nothing to the deployed
database. Discovering that on a clinical system after a deploy is the failure mode the
constitution's error-path honesty rule exists to prevent.

**Deployment consequence worth stating plainly**: production runs from `/var/www/mychatbotproject/`,
a manual copy, and its `users.db` holds real accounts. Migrations must be run against that copy
explicitly as a deploy step; copying files and restarting the unit will not run them.

**Alternatives considered**:
- *Hand-written ALTER scripts*: rejected — no ordering, no downgrade, no record of what ran.
- *Recreate the database*: rejected — it holds real registered users.

---

## R7 — Registration request, approval, and notification

**Decision**: `POST /api/v1/auth/register-request` creates a `RegistrationRequest` in `pending`
and emails the Administrator. No `User` row is created at this point. Administrator approval
creates the `User` (unverified, role Doctor) and sends the single-use verification link;
rejection closes the request and creates nothing. Rate limiting is per source IP and per requested
address, applied **before** the notification is sent.

**Rationale**: FR-004 through FR-006, FR-085, and FR-086. Creating no `User` until approval keeps
the account table meaning "approved accounts" and makes "refuse sign-in to a pending address"
fall out of the schema rather than depend on a flag check that could be forgotten.

The Administrator's address is configuration (`ADMIN_NOTIFICATION_EMAIL`,
`arthurfelipereis11022018@gmail.com`), not a constant in code.

**Two failure modes designed for explicitly**: if the notification email fails to send, the
request still persists as pending and appears in the admin view — the request must not be lost
with the email. And registration responses are uniform whether or not the address already exists,
so the endpoint cannot be used to enumerate accounts.

**Alternatives considered**:
- *Create the User immediately with a `pending` status*: rejected — it puts unapproved addresses
  in the accounts table, and every future query has to remember to exclude them.

---

## R8 — Serving the model, and the cold start

**Decision**: A dedicated Hugging Face Inference Endpoint on the private fine-tuned repository,
configured to scale to zero after 15 minutes idle. The application treats a cold endpoint as a
first-class state, not an error: the request is accepted, the submitted findings are held, and the
client is told the model is starting.

**Rationale**: FR-097 through FR-100 and SC-003. Serverless inference does not reliably serve
arbitrary private fine-tuned repositories, and an always-on endpoint breaches SC-014 on its own
once Neo4j and the VM are counted.

**Mechanics**: the classification endpoint returns `202 Accepted` with a job id when the endpoint
reports `scaledToZero` or `initializing`; the client polls a status route and renders a
"model starting" state. Total wait is bounded at 180 s, after which it fails explicitly under
FR-040/FR-100 — never a fallback answer from an ungrounded path.

**Alternatives considered**:
- *Always-on endpoint*: cleanest latency, breaks the cost ceiling.
- *Self-host the 1B model on the VM*: no per-hour cost, but 4 GB is already fully committed (R5),
  and it contradicts the owner's stated intent to host on Hugging Face.
- *Block the HTTP request through the cold start*: rejected — a 60–90 s hanging request trips
  proxy timeouts and gives the doctor no feedback, breaching SC-003's 2-second progress rule.

---

## R9 — The evaluation harness

**Decision**: A standalone `eval/` package, run from a developer machine, never installed on the
production host. It writes JSON results that are imported into the application through an
admin-only endpoint for display.

**Rationale**: FR-093 through FR-096. FR-094 forbids the production host from holding credentials
for GPT or Gemini. Physical separation makes that auditable — the packages are not in
`requirements.txt` and the keys are not in the production environment file.

The harness runs four things against every model: the SC-002 benchmark (fixed, versioned question
set), the SC-015 replay over all 24 records, the SC-023 held-out evaluation over the 5 unseen
tuples, and a cost record. Baselines: the same Llama 3.2 1B without fine-tuning, and the legacy
GPT and Gemini models the site previously used.

**Required reporting rule**: every result carries `unmeasured_classes` — the six
single-tuple outcome classes SC-023 cannot speak to. Principle VII forbids letting a headline
score imply coverage the data cannot support, and a field the UI must render is a stronger
guarantee than a convention.

---

## R10 — Detecting and stripping patient identifiers

**Decision**: A `deident` service applied on the **write path** in front of every persistence
call — conversation history, captured training rows, and exports. Detection is pattern-based
(names against a title/honorific pattern, dates of birth, NHS and hospital number formats, phone
numbers, email addresses, postcodes). Detection warns the doctor before processing (FR-049);
stripping happens before any write (FR-050).

**Rationale**: FR-048 through FR-051 and FR-073. Placing it on the write path rather than as a
cleanup pass is a constitutional requirement, and it is also the only version that works — a
cleanup pass leaves a window during which the identifier is on disk.

**Known limit, stated rather than hidden**: pattern matching will not catch every identifier in
free text. SC-010 therefore requires verification against a set of deliberate
identifier-injection submissions, checking every stored row rather than sampling. The mitigation
that matters more is structural: the findings form has no identifier field at all (FR-048), so
free text is the only route in, and doctors are warned at entry and at submission (FR-074).

**Alternatives considered**:
- *An NER model for identifier detection*: better recall, but adds a second model to a 4 GB budget
  that R5 has already committed. Revisit if SC-010's injection tests show pattern matching failing.
