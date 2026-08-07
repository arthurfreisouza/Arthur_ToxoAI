# Specification Quality Checklist: Congenital Toxoplasmosis Clinical Knowledge Assistant

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-06
**Last re-validated**: 2026-08-06 (after the third `/speckit-clarify` session — augmentation deferred, 70/30 split adopted)
**Feature**: [spec.md](../spec.md)
**Validation iterations**: 4

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs) — *regressed, deliberately; see Note 1*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [ ] Success criteria are technology-agnostic (no implementation details) — *regressed, deliberately; see Note 6*
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [ ] No implementation details leak into specification — *regressed, deliberately; see Note 1*

## Notes

**Note 1 — Two items regressed on purpose, and the reason should not be lost.**
The 2026-08-06 clarification session fixed three concrete technology decisions as owner-mandated constraints: the classification is produced by a **fine-tuned LLM using GraphRAG** rather than a rules engine, the graph is stored in **Neo4j**, and captured training data is written to **`new_outputs.csv`**. These are named directly in the spec's *Fixed architectural constraints* subsection.

At iteration 1 these two checklist items passed, because the only architectural commitment was "graph-based retrieval", expressible as an observable capability. Naming a specific database product is different in kind, so the honest re-evaluation is that the spec is no longer implementation-neutral. Both items are therefore unchecked.

This is recorded as a **known, accepted deviation, not a defect to fix**. Where a stakeholder fixes an approach, the spec's job is to record it as a constraint rather than pretend the decision is open. Removing the names would hide a decision that planning must honour. The requirements and success criteria themselves remain technology-agnostic and behaviourally verifiable — the mandates are quarantined to the constraints subsection.

**Note 2 — All four originally flagged decisions are now resolved.**
Each is recorded in the Clarifications section and integrated into the requirements:

1. **Decision-support vs. classification** → the system classifies the patient (FR-042–FR-047, FR-064–FR-068).
2. **Patient-identifying information** → de-identified findings only, stripped on the write path (FR-048–FR-051, FR-074–FR-076).
3. **Answer language** → reply in the doctor's language, canonical Portuguese always shown verbatim (FR-077–FR-081).
4. **Shared corpus / doctor uploads** → one curated corpus, Administrator-only; existing upload feature retired (FR-014, FR-082–FR-083).

**Note 3 — The constitution conflict recorded here was resolved, and smaller ones have replaced it.**
The blocking conflict this note originally described — v1.1.0's "the assistant educates; it does not diagnose" against a feature that classifies by design — was settled by amending the constitution to **v2.0.0** on 2026-08-06. Principle II was redefined, Principle III replaced, and Principle VII added. That item is closed.

The second clarification session opened four smaller divergences, listed in the spec's *Constitution Impact* section: the retirement of the invitation mechanism (Principle I names it), synthetic training data (Principle VII does not cover it), the now-specific model and hosting choice (Technology Constraints), and the need to record that the `rules/` engine is an offline labelling oracle and not a deployed classifier (Principle V). None reverses a guardrail, so these are MINOR and PATCH amendments rather than MAJOR. **Run `/speckit-constitution` before `/speckit-plan`.**

**Note 4 — Determinism finding constrains the implementation.**
Analysis of `logs/request-logs.csv` shows the historical classification is a deterministic function of its inputs (18 distinct input tuples, zero conflicting outputs; all 11 classification pairs mapping to exactly one argumentation and recommendation text; constant `config_hash`). The rules-engine route was considered and not taken. The consequence is that SC-015 (all 24 historical cases replay exactly) and SC-016 (identical inputs, identical output) are hard release gates that the LLM route must be engineered to meet through constrained decoding and output validation — not through prompt tuning. See `architecture-notes.md`.

**Note 5 — Source data correction carried into the spec.**
`logs/` contains a single structured dataset (`request-logs.csv`: 24 records, 29 columns), not loose text documents, and `monografia.pdf` is at `text/`. The spec reflects the actual data.

**Note 6 — A third item regressed in the second clarification session, and for the same reason as the first two.**
Fixing the hosting arrangement made two success criteria name implementation. SC-003 now distinguishes a warm endpoint from a cold start, and SC-014 counts the host, Neo4j, and a scale-to-zero model endpoint against the cost ceiling. Neither can be stated honestly without naming the arrangement: a cold start is a real, user-visible wait that a technology-agnostic criterion would quietly hide, and a cost ceiling that does not say what it counts cannot be checked. As with Note 1, this is an **accepted deviation rather than a defect** — the alternative is a criterion that reads cleanly and cannot be verified.

**Note 7 — The augmentation dependency was removed rather than satisfied, by owner decision.**
This note previously recorded a hard prerequisite: rule-engine augmentation needs the validated `decision_config.yaml`, and only the self-declared fictitious example config exists. A filesystem-wide search on 2026-08-06 confirmed no validated configuration is present anywhere. Rather than block, the owner directed that fine-tuning proceed on the 24 recorded rows as they stand. FR-088 is now explicitly optional, deferred, and off the delivery path; FR-092 forbids ever labelling from the example configuration. **No prerequisite task is needed at `/speckit-plan`** — the strand is descoped, not pending.

**Note 8 — The corpus is thin enough that the split has to be built carefully, and part of it cannot be tested at all.**
The 24 rows collapse to **18 distinct input tuples** across **9 recorded outcomes**. Two consequences are now written into the spec rather than left to be discovered during implementation:

1. Records 22 and 23 are identical in their findings. A 70/30 split taken over rows would put one in training and its twin in test, and the test score would be measuring memorisation. FR-102 therefore defines the split over distinct tuples.
2. **Six of the nine outcomes are represented by a single input tuple.** They cannot appear on both sides of any split. FR-103 assigns them to training, which means SC-023's generalisation figure covers only three outcome classes. The spec requires the evaluation report to name the unmeasured classes, so a strong headline number cannot imply coverage the data does not support.

Fine-tuning a 1B model on roughly a dozen distinct examples will tend to memorise. That is an accepted, owner-directed trade-off made to avoid blocking; SC-023 exists to measure it rather than assume it, and the 1B → 3B → 8B escalation in FR-084 remains the response if the gates fail.

---

**Result**: 13/16 items passing (unchanged this iteration; was 14/16, originally 16/16). All three regressions are deliberate and documented above. The one remaining action before `/speckit-plan` is `/speckit-constitution`, for the five divergences in Note 3. The augmentation prerequisite that previously blocked is descoped — see Note 7.
