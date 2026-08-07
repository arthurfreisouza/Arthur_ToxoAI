"""Invariant tests for the corpus split artefact (contracts/corpus-split.md, FR-101–FR-104).

Each invariant here is a build failure if violated, not a warning — that is what the contract
says, so these tests are the enforcement of that sentence.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

EVAL_DIR = Path(__file__).resolve().parent.parent
SPLIT_PATH = EVAL_DIR / "split.v1.json"
SOURCE_PATH = EVAL_DIR.parent / "logs" / "request-logs.csv"

sys.path.insert(0, str(EVAL_DIR))
import split as split_module  # noqa: E402


@pytest.fixture(scope="module")
def split() -> dict:
    assert SPLIT_PATH.exists(), f"{SPLIT_PATH} must be generated before running these tests"
    return json.loads(SPLIT_PATH.read_text(encoding="utf-8"))


def all_digests(split: dict, key: str) -> set:
    return {e["tuple_sha256"] for e in split[key]}


def test_disjoint(split):
    assert all_digests(split, "test") & all_digests(split, "train") == set()


def test_complete_covers_all_distinct_tuples(split):
    combined = all_digests(split, "test") | all_digests(split, "train")
    assert len(combined) == split["totals"]["distinct_tuples"]
    assert len(combined) == len(split["test"]) + len(split["train"])


def test_complete_every_record_appears_exactly_once(split):
    records = load_records()
    all_record_ids = {row["id"] for row in records}

    seen = []
    for entry in split["test"] + split["train"]:
        seen.extend(entry["record_ids"])

    assert len(seen) == len(all_record_ids), "every historical record must appear exactly once"
    assert set(seen) == all_record_ids
    assert len(seen) == len(set(seen)), "no record id may appear in more than one entry"


def test_tuple_level_not_row_level(split):
    """Records 22 and 23 are byte-identical in their findings (FR-102) and must be one entry."""
    twin_entries = [
        e for e in split["test"] + split["train"]
        if {"22", "23"} <= set(e["record_ids"])
    ]
    assert len(twin_entries) == 1, "records 22 and 23 must collapse into a single tuple entry"
    assert twin_entries[0]["record_ids"] == ["22", "23"]


def test_stratified_multi_tuple_classes_appear_on_both_sides(split):
    test_classes = {e["final_situation"] for e in split["test"]}
    train_classes_by_situation: dict = {}
    for e in split["train"]:
        train_classes_by_situation.setdefault(e["final_situation"], 0)
        train_classes_by_situation[e["final_situation"]] += 1

    for cls in test_classes:
        assert cls in train_classes_by_situation, (
            f"final_situation {cls} appears in test but not train — every class with 2+ "
            "distinct tuples must appear on both sides (FR-103)"
        )


def test_single_tuple_classes_are_in_train_and_unmeasured(split):
    counts: dict = {}
    for e in split["test"] + split["train"]:
        counts.setdefault(e["final_situation"], 0)
        counts[e["final_situation"]] += 1

    single_tuple_classes = {cls for cls, n in counts.items() if n == 1}
    assert single_tuple_classes == set(split["unmeasured_classes"])

    test_classes = {e["final_situation"] for e in split["test"]}
    assert single_tuple_classes & test_classes == set(), (
        "a single-tuple class must never be held out — it has to sit entirely in training"
    )


def test_reproducible_byte_identical(tmp_path):
    """Re-running eval/split.py against the same source reproduces the committed file."""
    result = subprocess.run(
        [sys.executable, str(EVAL_DIR / "split.py"), "--verify"],
        cwd=EVAL_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_source_sha256_matches_current_corpus(split):
    assert split["source_sha256"] == split_module.file_sha256(SOURCE_PATH), (
        "split.v1.json's source_sha256 no longer matches logs/request-logs.csv — "
        "the corpus changed and the split must be regenerated as split.v2 (invariant 7)"
    )


def load_records() -> list[dict]:
    with SOURCE_PATH.open(newline="", encoding="utf-8-sig") as fh:
        import csv
        return list(csv.DictReader(fh))
