# Specification Quality Checklist: Congenital Toxoplasmosis Clinical Knowledge Assistant

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-06
**Last re-validated**: 2026-08-06 (after `/speckit-clarify` session — 5 questions answered)
**Feature**: [spec.md](../spec.md)
**Validation iterations**: 2

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs) — *regressed, deliberately; see Note 1*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
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

**Note 3 — Constitution conflict is now severe and blocks implementation.**
Constitution v1.1.0 Principle III states "the assistant educates; it does not diagnose" and requires the system prompt to "never provide personal medical diagnoses". The clarified feature does exactly the opposite by design. This is a deliberate reversal of a stated guardrail, not a wording mismatch, and amending it is a MAJOR version change. Principle II (per-user isolation) and Principle VI (per-user vector store caching) also need updating now that uploads are retired and a shared Neo4j graph replaces per-user FAISS indexes. **Run `/speckit-constitution` before `/speckit-plan`.**

**Note 4 — Determinism finding constrains the implementation.**
Analysis of `logs/request-logs.csv` shows the historical classification is a deterministic function of its inputs (18 distinct input tuples, zero conflicting outputs; all 11 classification pairs mapping to exactly one argumentation and recommendation text; constant `config_hash`). The rules-engine route was considered and not taken. The consequence is that SC-015 (all 24 historical cases replay exactly) and SC-016 (identical inputs, identical output) are hard release gates that the LLM route must be engineered to meet through constrained decoding and output validation — not through prompt tuning. See `architecture-notes.md`.

**Note 5 — Source data correction carried into the spec.**
`logs/` contains a single structured dataset (`request-logs.csv`: 24 records, 29 columns), not loose text documents, and `monografia.pdf` is at `text/`. The spec reflects the actual data.

---

**Result**: 14/16 items passing (was 16/16). Both regressions are deliberate and documented above. The blocking item before `/speckit-plan` is the constitution amendment in Note 3.
