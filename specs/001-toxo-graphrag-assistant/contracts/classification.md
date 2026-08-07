# Classification Contract

The primary path: findings in, classification out. Governed by FR-043, FR-044, FR-064 through
FR-068, FR-084, and Principle III.

---

## Request

`POST /api/v1/classify`

```jsonc
{
  "conversation_id": 12,
  "findings": {
    "fundoscopic": "Normal", "neuroimaging": "Normal", "pcr_la": "None",
    "first_igm": "Positive", "first_igg": "Positive", "first_avidity": "Low", "first_weeks": 12,
    "last_igm": "Positive", "last_igg": "Positive",
    "post_igm": "Positive", "post_igg": "Positive",
    "child_igm": "Negative", "child_iga": "None", "child_igg": "Positive"
  },
  "free_text": "optional narrative context"
}
```

**There is no patient identifier field, and adding one is a breaking change** (FR-048). `free_text`
is the only unstructured route in, and it passes through identifier detection (FR-049) and
write-path stripping (FR-050) before anything is persisted.

Permitted values for each finding: [data-model.md §3](../data-model.md#3-classification-contract-data).

---

## Response — classified

`200 OK`

```jsonc
{
  "event_id": 481,
  "classification": {
    "mother": "Infecção aguda na gestação possível",
    "child": "COMPATÍVEIS",
    "argumentation": "As sorologias maternas para toxoplasmose e os achados da criança são …",
    "recommendation": "…",
    "canonical_language": "pt-BR"
  },
  "translation": {                     // present only when the doctor did not write in Portuguese
    "language": "en",
    "argumentation": "…", "recommendation": "…",
    "label": "Translated — the Portuguese text above is the clinical record"
  },
  "basis": {
    "coverage": "parameterised",
    "driving_findings": ["first_avidity=Low", "first_weeks=12", "child_igg=Positive"],
    "comparable_cases": ["case:21", "case:13"]
  },
  "explanation": {
    "text": "…why these findings support this classification…",
    "attributions": [
      { "id": "thesis:p18:§2.4", "source_type": "thesis_passage", "ref": "p. 18, §2.4", "snippet": "…" },
      { "id": "case:21", "source_type": "case_record", "ref": "record 21", "snippet": "…" }
    ]
  },
  "safety_notice": "Decision support. Clinical judgement and responsibility rest with the treating clinician.",
  "versions": { "model": "toxoai-llama32-1b-ft@3", "prompt": "v1", "lookup": "v1", "build": 7 }
}
```

Field-by-field obligations:

- `classification.mother` and `.child` come from the **model**, under constrained decoding
  (FR-084). Nothing decides them ahead of it.
- `argumentation` and `recommendation` are rendered from the canonical lookup keyed by the
  classification pair (research.md R1). They are verbatim Portuguese, which is what gets stored
  (FR-079).
- `translation` never replaces the Portuguese text; both are shown, and the translation is
  labelled (FR-078, FR-081).
- `driving_findings` satisfies FR-063 — the doctor can see what drove the result.
- `safety_notice` is mandatory on every classified result (FR-045, SC-011).
- `versions` is mandatory — it is what makes a past result reproducible and auditable (FR-062).

---

## Response — no classification could be determined

`200 OK`, and this is **not** an error state.

```jsonc
{
  "event_id": 482,
  "classification": {
    "mother": "Situação não parametrizada",
    "child": null,
    "outcome": "no_classification_determined",
    "display": "No classification could be determined for these findings."
  },
  "basis": { "coverage": "outside_parameterised_rules" },
  "safety_notice": "…"
}
```

`Situação não parametrizada` MUST be presented as "no classification could be determined" and
**never** rendered as a clinical conclusion (FR-044, SC-018). Seven of the 24 historical records
carry this outcome — it is a common, correct answer, not an edge case.

---

## Error responses

| Status | When | Body |
|---|---|---|
| `422` | A finding is outside its permitted set | `detail` states the field **and its permitted values**. Never coerced to the nearest match (Principle IV) |
| `422` | A required finding is missing | `detail` names the specific missing findings. Never inferred or defaulted (FR-067) |
| `409` | Findings are internally contradictory | The contradiction is named, not silently resolved |
| `202` | The model endpoint is cold | `{"job_id":"…","state":"model_starting"}`; poll `GET /classify/{job_id}` (FR-099) |
| `429` | Rate limited | Clear, temporary message (FR-011) |
| `502` | Model unavailable, timed out, or returned output outside the permitted value sets | Explicit failure. **The invalid output is never shown to the doctor** (FR-040, FR-068, SC-019) |
| `503` | No successful build exists | The knowledge base is not ready (FR-060) |

---

## Output validation — on every response, never by sampling

Before anything reaches the doctor:

1. `mother` is in the 5-value maternal set; `child` is in the 4-value child set.
2. The `(mother, child)` pair resolves in the canonical lookup.
3. The rendered argumentation and recommendation are byte-identical to the lookup entries.
4. Every attribution id resolves to a unit that was actually retrieved for this request — any
   citation that does not resolve is dropped and the drop is recorded.

A failure at 1, 2, or 3 raises `502`. This is what converts SC-019 from an aspiration into a
mechanism, and step 4 is what makes SC-002's "no fabricated citations" enforceable.

---

## Persistence, per classification

Written on the same path, before the response returns:

- `classification_events` row with `findings_hash`, all three version fields, and the outcome.
- A `new_outputs.csv` append — schema-compatible with `logs/request-logs.csv` (FR-072),
  canonical Portuguese only (FR-079), identifiers stripped (FR-073).
- `messages` and `attributions` rows with `snapshot_text`, so the result survives a rebuild
  (FR-054).

**If the CSV append fails, the doctor still receives their classification** and the failure is
raised to the Administrator rather than dropped (Principle VII, FR-069). `capture_status` records
which happened.

---

## Determinism

Identical findings return an identical classification (FR-066, SC-016), enforced by greedy
decoding plus a response cache keyed by
`sha256(normalised findings) + model_version + prompt_version + lookup_version` (research.md R2).

Any version change invalidates the cache — a new model must not inherit the previous model's
answers.

**Measuring determinism requires `X-Bypass-Classification-Cache` (admin only).** With the cache
active, SC-016 passes by construction; only a bypassed run says anything about the model itself.
