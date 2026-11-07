"""Write the hand record's JSON Schema to web/hand-record.schema.json.

Usage (from the repository root):
    uv run --project python python scripts/export_hand_record_schema.py
"""

from pathlib import Path

from review.domain.schema import hand_record_schema_json

TARGET = Path(__file__).resolve().parent.parent / "web" / "hand-record.schema.json"


def main() -> None:
    """Regenerate the committed schema file."""
    TARGET.write_text(hand_record_schema_json(), encoding="utf-8")
    print(f"wrote {TARGET}")


if __name__ == "__main__":
    main()
