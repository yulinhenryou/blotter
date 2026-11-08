"""Write the rules corpus for the TypeScript rules to web/src/rules/fixtures/corpus.json.

The corpus is built by python/tests/rules_corpus.py from the test dealer and the worked examples
of docs/MATH.md §1.5 (M4a Task 4, ADR-0028). A Python test fails if the committed file is stale.

Usage (from the repository root):
    uv run --project python python scripts/export_rules_corpus.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python" / "tests"))

from rules_corpus import build, dumps  # noqa: E402  (the test helpers are not a package)

TARGET = ROOT / "web" / "src" / "rules" / "fixtures" / "corpus.json"


def main() -> None:
    """Regenerate the committed corpus."""
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(dumps(build()), encoding="utf-8")
    print(f"wrote {TARGET}")


if __name__ == "__main__":
    main()
