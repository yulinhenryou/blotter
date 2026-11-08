"""The committed rules corpus for the TypeScript rules is current (M4a Task 4, ADR-0028)."""

from pathlib import Path

from rules_corpus import build, dumps

COMMITTED = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "rules" / "fixtures" / "corpus.json"
)
COMMAND = "uv run --project python python scripts/export_rules_corpus.py"


def test_committed_rules_corpus_is_current() -> None:
    assert COMMITTED.exists(), f"run: {COMMAND}"
    assert COMMITTED.read_text(encoding="utf-8") == dumps(build()), (
        f"web/src/rules/fixtures/corpus.json is stale; run: {COMMAND}"
    )


def test_corpus_covers_the_cases_the_phone_meets() -> None:
    cases = build()
    steps = [step for case in cases for step in case["steps"]]
    legal = [step["legal"] for step in steps]
    # Each kind of situation appears, so agreement on the corpus means something for each.
    assert any(case["setup"]["ends_at_hero_fold"] for case in cases)
    assert any(s["chips"] is None for case in cases for s in case["setup"]["stacks"])
    assert any(case["setup"]["stakes"]["straddles_chips"] for case in cases)
    assert any(case["setup"]["stakes"]["ante"] for case in cases)
    assert any(len(case["end"].get("pots", [])) >= 2 for case in cases)
    assert any(case["end"].get("uncalled") for case in cases)
    assert any(x["raise"] is None and x["call"] is not None for x in legal)  # no raise rights
    assert any(x["raise"] and x["raise"]["min"] == x["raise"]["max"] for x in legal)  # all-in only
    assert any(x["raise"] and x["raise"]["max"] is None for x in legal)  # unknown stack
    assert any(x["call"] and x["call"]["all_in"] for x in legal)  # short call
    assert any(p["code"] is None for step in steps for p in step["probes"])
    assert any(p["code"] is not None for step in steps for p in step["probes"])
    prefixes = [
        p["first_infeasible_prefix"] for c in cases for p in c["end"].get("result_probes", [])
    ]
    assert None in prefixes and any(j is not None and j < 2 for j in prefixes)
