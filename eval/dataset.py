"""Emit the fine-tuning dataset: the 19 training rows from the 13 training tuples in
eval/split.v1.json, verbatim, targeting the classification labels only.

Governed by FR-087 (train on the classification labels, not on argumentation/recommendation
prose — that is rendered from the canonical lookup at serving time, research.md R1) and SC-021
(no paraphrase, no synthetic expansion of the 24 historical records).

This module **loads** the committed split; it does not regenerate it. `training_model/
finetune_llama32_1b.ipynb` imports `build_training_examples()` directly rather than reading an
intermediate file, so the split and the source CSV stay the single source of truth (no second
artefact that could drift from them). A CLI entry point is provided for inspection.

Prompt format (`PROMPT_VERSION = "v1"`): a fixed instruction template listing the 14 findings,
paired with a JSON completion carrying only `mother_classification` and `child_classification` —
the same two fields, verbatim, that `argumentation` and `recommendation` are rendered from via the
canonical lookup at serving time (research.md R1, contracts/classification.md). Any future change
to this template must bump PROMPT_VERSION, and `backend_files/services/classifier.py`'s prompt
builder (T060) must mirror it exactly — a served prompt that disagrees with the trained prompt
silently degrades the model.
"""

import argparse
import csv
import json
import sys
from pathlib import Path

PROMPT_VERSION = "v1"

INPUT_FIELDS = [
    "fundoscopic", "neuroimaging", "pcr_la", "first_igm", "first_igg",
    "first_avidity", "first_weeks", "last_igm", "last_igg", "post_igm",
    "post_igg", "child_igm", "child_iga", "child_igg",
]

FIELD_LABELS = {
    "fundoscopic": "Fundoscopic exam",
    "neuroimaging": "Neuroimaging",
    "pcr_la": "PCR (amniotic fluid)",
    "first_igm": "First sample IgM",
    "first_igg": "First sample IgG",
    "first_avidity": "First sample IgG avidity",
    "first_weeks": "Gestational week of first sample",
    "last_igm": "Last maternal sample IgM",
    "last_igg": "Last maternal sample IgG",
    "post_igm": "Postnatal maternal IgM",
    "post_igg": "Postnatal maternal IgG",
    "child_igm": "Child IgM",
    "child_iga": "Child IgA",
    "child_igg": "Child IgG",
}

SYSTEM_PROMPT = (
    "You are a clinical classifier for congenital toxoplasmosis. Given a patient's "
    "de-identified serological and clinical findings, respond with ONLY a JSON object "
    "containing \"mother_classification\" and \"child_classification\". Choose "
    "mother_classification from: Infecção anterior à gestação | Infecção aguda provável | "
    "Infecção aguda na gestação possível | Infecção aguda na gestação confirmada | "
    "Situação não parametrizada. Choose child_classification from: AUSENTES | COMPATÍVEIS | "
    "FUNDOSCOPIA DUVIDOSA | Apenas IgM reagente e/ou IgA (se realizado) e criança assintomática. "
    "Do not include any other text."
)

EVAL_DIR = Path(__file__).resolve().parent
DEFAULT_SPLIT = EVAL_DIR / "split.v1.json"
DEFAULT_SOURCE = EVAL_DIR.parent / "logs" / "request-logs.csv"


def format_prompt(findings: dict) -> str:
    lines = [f"{FIELD_LABELS[f]}: {findings[f]}" for f in INPUT_FIELDS]
    return "\n".join(lines)


def format_completion(mother_classification: str, child_classification: str) -> str:
    return json.dumps(
        {
            "mother_classification": mother_classification,
            "child_classification": child_classification,
        },
        ensure_ascii=False,
    )


def load_records(source: Path) -> dict:
    with source.open(newline="", encoding="utf-8-sig") as fh:
        return {row["id"]: row for row in csv.DictReader(fh)}


def build_training_examples(split_path: Path = DEFAULT_SPLIT, source_path: Path = DEFAULT_SOURCE) -> list[dict]:
    """Return one example per training row (19 rows / 13 tuples), verbatim from the CSV.

    Hard-errors if a held-out tuple leaks into the result — FR-101 and Principle VII bar the
    test tuples from influencing training in any form.
    """
    split = json.loads(split_path.read_text(encoding="utf-8"))
    records = load_records(source_path)

    test_record_ids = {rid for e in split["test"] for rid in e["record_ids"]}

    examples = []
    for entry in split["train"]:
        for record_id in entry["record_ids"]:
            if record_id in test_record_ids:
                raise RuntimeError(
                    f"record {record_id} is in both split['train'] and the held-out test set — "
                    "refusing to build a dataset that would leak test data into training"
                )
            row = records[record_id]
            findings = {f: row[f] for f in INPUT_FIELDS}
            examples.append({
                "record_id": record_id,
                "tuple_sha256": entry["tuple_sha256"],
                "final_situation": entry["final_situation"],
                "findings": findings,
                "mother_classification": row["mother_classification"],
                "child_classification": row["child_classification"],
                "prompt_version": PROMPT_VERSION,
                "system": SYSTEM_PROMPT,
                "prompt": format_prompt(findings),
                "completion": format_completion(
                    row["mother_classification"], row["child_classification"]
                ),
            })

    expected_rows = split["totals"]["train_rows"]
    if len(examples) != expected_rows:
        raise RuntimeError(
            f"built {len(examples)} training examples but split.v1.json declares "
            f"totals.train_rows={expected_rows} — the split and the dataset writer disagree"
        )

    # Deterministic order: no run-to-run reshuffling before the notebook does its own shuffling.
    examples.sort(key=lambda e: int(e["record_id"]))
    return examples


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", type=Path, default=DEFAULT_SPLIT)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument(
        "--out", type=Path, default=None,
        help="Write JSONL here instead of stdout (not a committed artefact — regenerate on demand)",
    )
    args = parser.parse_args()

    examples = build_training_examples(args.split, args.source)
    lines = [json.dumps(e, ensure_ascii=False) for e in examples]

    if args.out:
        args.out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Wrote {len(examples)} examples to {args.out}", file=sys.stderr)
    else:
        print("\n".join(lines))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
