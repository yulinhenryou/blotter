"""Write the API's OpenAPI schema to web/openapi.json.

Usage (from the repository root):
    uv run --project python python scripts/export_openapi.py
"""

from pathlib import Path

from review.api.schema import openapi_json

TARGET = Path(__file__).resolve().parent.parent / "web" / "openapi.json"


def main() -> None:
    """Regenerate the committed schema file."""
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(openapi_json(), encoding="utf-8")
    print(f"wrote {TARGET}")


if __name__ == "__main__":
    main()
