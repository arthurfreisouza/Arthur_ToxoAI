"""Generate the fixed train/test split over the 24 historical case records.

Governed by contracts/corpus-split.md and FR-101 through FR-104. The rule: within each
`final_situation` class, sort the class's distinct input tuples by the sha256 of their joined
finding values, take the first *k* as test, where *k* is allocated across classes holding two or
more distinct tuples by the largest-remainder method against a 30% overall target. Classes with
exactly one distinct tuple cannot appear on both sides of any split, so they are ineligible and go
to training — and are named in `unmeasured_classes` (FR-103).

The split is over distinct input tuples, not rows (FR-102): records 22 and 23 are byte-identical
in their 14 findings and must resolve to a single entry.

Usage:
    python split.py [--source ../logs/request-logs.csv] [--out split.v1.json]
    python split.py --verify   # regenerate and diff against the committed split.v1.json
"""

import argparse
import csv
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

VERSION = "split.v1"
TEST_TARGET_FRACTION = 0.30

INPUT_FIELDS = [
    "fundoscopic", "neuroimaging", "pcr_la", "first_igm", "first_igg",
    "first_avidity", "first_weeks", "last_igm", "last_igg", "post_igm",
    "post_igg", "child_igm", "child_iga", "child_igg",
]

DEFAULT_SOURCE = Path(__file__).resolve().parent.parent / "logs" / "request-logs.csv"
DEFAULT_OUT = Path(__file__).resolve().parent / "split.v1.json"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256_hex(path.read_bytes())


def tuple_key(row: dict) -> tuple:
    return tuple(row[field] for field in INPUT_FIELDS)


def tuple_sha256(key: tuple) -> str:
    joined = "|".join(str(v) for v in key)
    return sha256_hex(joined.encode("utf-8"))


def load_records(source: Path) -> list[dict]:
    # utf-8-sig: logs/request-logs.csv carries a UTF-8 BOM before the "id" header.
    with source.open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def group_distinct_tuples(records: list[dict]) -> dict:
    """Group records into distinct input tuples, keyed by tuple_sha256.

    Returns {tuple_sha256: {"record_ids": [...], "final_situation": "...", "key": tuple}}.
    Raises if a tuple's rows disagree on final_situation — the split rule assumes they don't.
    """
    tuples: dict[str, dict] = {}
    for row in records:
        key = tuple_key(row)
        digest = tuple_sha256(key)
        entry = tuples.setdefault(
            digest,
            {"record_ids": [], "final_situation": row["final_situation"], "key": key},
        )
        if entry["final_situation"] != row["final_situation"]:
            raise ValueError(
                f"Tuple {digest} maps to conflicting final_situation values: "
                f"{entry['final_situation']!r} vs {row['final_situation']!r} (record {row['id']})"
            )
        entry["record_ids"].append(row["id"])
    for entry in tuples.values():
        entry["record_ids"].sort(key=int)
    return tuples


def largest_remainder_quota(class_sizes: dict, target_total: int) -> dict:
    """Allocate `target_total` test slots across classes proportional to their tuple count,
    using the largest-remainder (Hare quota) method: floor each share, then hand out the
    remaining slots to the classes with the largest fractional remainder."""
    shares = {cls: size * TEST_TARGET_FRACTION for cls, size in class_sizes.items()}
    floors = {cls: int(share) for cls, share in shares.items()}
    remainders = {cls: share - floors[cls] for cls, share in shares.items()}
    allocated = sum(floors.values())
    remaining = target_total - allocated

    # Largest remainder first; tie-break on class name for determinism.
    order = sorted(remainders, key=lambda c: (-remainders[c], c))
    quotas = dict(floors)
    for cls in order[:remaining]:
        quotas[cls] += 1
    return quotas


def build_split(source: Path) -> dict:
    records = load_records(source)
    tuples = group_distinct_tuples(records)

    by_class: dict[str, list[str]] = defaultdict(list)
    for digest, entry in tuples.items():
        by_class[entry["final_situation"]].append(digest)

    eligible_classes = {cls: digests for cls, digests in by_class.items() if len(digests) >= 2}
    ineligible_classes = sorted(
        (cls for cls, digests in by_class.items() if len(digests) < 2), key=int
    )

    total_tuples = len(tuples)
    target_total = round(total_tuples * TEST_TARGET_FRACTION)

    class_sizes = {cls: len(digests) for cls, digests in eligible_classes.items()}
    quotas = largest_remainder_quota(class_sizes, target_total)

    test_digests: set[str] = set()
    for cls, digests in eligible_classes.items():
        ordered = sorted(digests)  # ascending sha256 hex
        k = quotas[cls]
        test_digests.update(ordered[:k])

    def entry_for(digest: str) -> dict:
        e = tuples[digest]
        return {
            "tuple_sha256": digest,
            "record_ids": e["record_ids"],
            "final_situation": e["final_situation"],
        }

    def sort_key(digest: str):
        return (int(tuples[digest]["final_situation"]), digest)

    test_list = [entry_for(d) for d in sorted(test_digests, key=sort_key)]
    train_digests = [d for d in tuples if d not in test_digests]
    train_list = [entry_for(d) for d in sorted(train_digests, key=sort_key)]

    train_rows = sum(len(e["record_ids"]) for e in train_list)
    test_rows = sum(len(e["record_ids"]) for e in test_list)

    split = {
        "version": VERSION,
        "generated_at": "2026-08-07",
        "source": "logs/request-logs.csv",
        "source_sha256": file_sha256(source),
        "rule": (
            "per final_situation class, sort distinct input tuples by sha256 of joined "
            "finding values; take the first k as test; k allocated by largest remainder to "
            "a 30% overall target; single-tuple classes ineligible"
        ),
        "input_fields": INPUT_FIELDS,
        "totals": {
            "distinct_tuples": total_tuples,
            "train_tuples": len(train_list),
            "test_tuples": len(test_list),
            "train_rows": train_rows,
            "test_rows": test_rows,
            "test_fraction": round(len(test_list) / total_tuples, 3),
        },
        "test": test_list,
        "train": train_list,
        "unmeasured_classes": ineligible_classes,
    }
    return split


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--verify", action="store_true",
        help="Regenerate the split and diff it against the committed artefact instead of writing",
    )
    args = parser.parse_args()

    split = build_split(args.source)

    if args.verify:
        if not args.out.exists():
            print(f"FAIL: {args.out} does not exist — nothing to verify against", file=sys.stderr)
            return 1
        committed = json.loads(args.out.read_text(encoding="utf-8"))
        # generated_at is metadata, not part of the reproducibility guarantee.
        regenerated = dict(split)
        committed_compare = dict(committed)
        regenerated.pop("generated_at", None)
        committed_compare.pop("generated_at", None)
        if regenerated == committed_compare:
            print(f"OK: {args.out} is byte-reproducible from {args.source}")
            return 0
        print(f"FAIL: regenerated split does not match {args.out}", file=sys.stderr)
        print(json.dumps(regenerated, indent=2), file=sys.stderr)
        return 1

    args.out.write_text(json.dumps(split, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")
    print(json.dumps(split["totals"], indent=2))
    print(f"unmeasured_classes: {split['unmeasured_classes']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
