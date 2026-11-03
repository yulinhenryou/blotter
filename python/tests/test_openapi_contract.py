from pathlib import Path

from review.api.schema import openapi_json

COMMITTED = Path(__file__).resolve().parents[2] / "web" / "openapi.json"


def test_committed_openapi_schema_is_current() -> None:
    assert COMMITTED.exists(), "run: uv run --project python python scripts/export_openapi.py"
    assert COMMITTED.read_text(encoding="utf-8") == openapi_json(), (
        "web/openapi.json is stale; run: uv run --project python python scripts/export_openapi.py"
    )
