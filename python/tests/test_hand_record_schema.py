from pathlib import Path

from review.domain.schema import hand_record_schema_json

COMMITTED = Path(__file__).resolve().parents[2] / "web" / "hand-record.schema.json"
COMMAND = "uv run --project python python scripts/export_hand_record_schema.py"


def test_committed_hand_record_schema_is_current() -> None:
    assert COMMITTED.exists(), f"run: {COMMAND}"
    assert COMMITTED.read_text(encoding="utf-8") == hand_record_schema_json(), (
        f"web/hand-record.schema.json is stale; run: {COMMAND}"
    )
