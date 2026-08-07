# Corpus Split Artefact Contract

Governed by FR-101 through FR-104 and Principle VII. The split is the reason any reported score
means something, so it is a committed artefact with a verification rule rather than a step inside
a training script.

**Path**: `eval/split.v1.json` · **Generator**: `eval/split.py` · **Version**: `split.v1`

---

## Shape

```jsonc
{
  "version": "split.v1",
  "generated_at": "2026-08-06",
  "source": "logs/request-logs.csv",
  "source_sha256": "…",                      // the exact corpus this split describes
  "rule": "per final_situation class, sort distinct input tuples by sha256 of joined finding values; take first k as test; k allocated by largest remainder to a 30% overall target; single-tuple classes ineligible",
  "input_fields": ["fundoscopic", "neuroimaging", "pcr_la", "first_igm", "first_igg",
                   "first_avidity", "first_weeks", "last_igm", "last_igg", "post_igm",
                   "post_igg", "child_igm", "child_iga", "child_igg"],
  "totals": { "distinct_tuples": 18, "train_tuples": 13, "test_tuples": 5,
              "train_rows": 19, "test_rows": 5, "test_fraction": 0.278 },
  "test": [
    { "tuple_sha256": "62bdcbb9…", "record_ids": ["17"], "final_situation": "0"  },
    { "tuple_sha256": "7cdd5e47…", "record_ids": ["5"],  "final_situation": "0"  },
    { "tuple_sha256": "018e3d8f…", "record_ids": ["13"], "final_situation": "13" },
    { "tuple_sha256": "43dd784c…", "record_ids": ["21"], "final_situation": "13" },
    { "tuple_sha256": "04f97e6f…", "record_ids": ["24"], "final_situation": "15" }
  ],
  "train": [ /* 13 entries, same shape — note the tuple carrying record_ids ["22","23"] */ ],
  "unmeasured_classes": ["1", "3", "7", "16", "18", "20"]
}
```

---

## Invariants — each one is a build failure, not a warning

1. **Disjoint.** No `tuple_sha256` appears in both `train` and `test`. This is the guarantee the
   whole artefact exists for.
2. **Complete.** `train ∪ test` covers all 18 distinct tuples, and every one of the 24 records
   appears in exactly one entry.
3. **Tuple-level, not row-level.** Records 22 and 23 are byte-identical in their findings and
   MUST appear as one entry with `record_ids: ["22","23"]`. Two separate entries mean the split
   was taken over rows and the test result is meaningless (FR-102).
4. **Stratified.** Every class with two or more distinct tuples appears on both sides (FR-103).
5. **Single-tuple classes are in `train`** and listed in `unmeasured_classes` (FR-103).
6. **Reproducible.** Re-running `eval/split.py` against the same `source_sha256` reproduces the
   file byte-for-byte. A mismatch fails the build (FR-104).
7. **Corpus-pinned.** If `logs/request-logs.csv` changes, `source_sha256` no longer matches; the
   split must be regenerated as `split.v2` and every prior score is labelled with the version it
   was measured under.

---

## Consumers

| Consumer | Obligation |
|---|---|
| `training_model/finetune_llama32_1b.ipynb` | Trains on `train` only, via the dataset emitted by `eval/dataset.py`. Loading any `test` tuple is a hard error, not a filtered warning (FR-101, FR-107). The notebook consumes this artefact and MUST NOT regenerate it |
| `eval/heldout.py` | Evaluates `test` only; reports `unmeasured_classes` with every score (SC-023) |
| `eval/replay.py` | Runs all 24 records for SC-015, and MUST label the result as covering trained material |
| `eval/benchmark.py` | Records `split_version` in every result so a score is traceable to what it was measured against |

---

## The reporting rule

Any surface that shows a held-out score — harness output, `GET /api/v1/admin/evaluations`, the
Administrator's UI, the thesis — MUST show `unmeasured_classes` alongside it.

Six of the nine outcome classes have exactly one input tuple. They cannot be tested, they sit
entirely in training, and a held-out score says nothing about them. Principle VII prohibits
letting a strong headline number imply coverage the data cannot support, and this is the field
that makes the prohibition enforceable rather than aspirational.
