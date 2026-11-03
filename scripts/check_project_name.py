"""Check that the provisional project name appears only where it is allowed.

The name is defined in ``project.json`` and may appear only in the files listed in
``ALLOWED`` (the rename checklist in ``CLAUDE.md`` §4). The script also checks that every
place that repeats the name agrees with ``project.json``.

Usage (from the repository root, standard library only):
    python3 scripts/check_project_name.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tomllib
from collections.abc import Iterable, Mapping
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Keep in sync with the rename checklist in CLAUDE.md §4.
ALLOWED = frozenset(
    {
        "CLAUDE.md",
        "README.md",
        "docs/VISION.md",
        "docs/DECISIONS.md",
        "project.json",
        "python/pyproject.toml",
        "python/uv.lock",
        "python/src/review/_project.py",
        "web/package.json",
        "web/package-lock.json",
        "web/openapi.json",
    }
)


def find_violations(files: Mapping[str, str], name: str, allowed: Iterable[str]) -> list[str]:
    """Return ``path:line`` locations of the name outside the allowed files (case-insensitive)."""
    allowed_set = set(allowed)
    pattern = re.compile(re.escape(name), re.IGNORECASE)
    violations = []
    for path in sorted(files):
        if path in allowed_set:
            continue
        for lineno, line in enumerate(files[path].splitlines(), start=1):
            if pattern.search(line):
                violations.append(f"{path}:{lineno}: {line.strip()}")
    return violations


def find_mismatches(name: str, declared: Mapping[str, str | None]) -> list[str]:
    """Return a message for every declared name that disagrees with the canonical one.

    Package names (Python distribution, npm) are compared in lower case.
    """
    mismatches = []
    for where, value in declared.items():
        expected = name if where.endswith("DISPLAY_NAME") else name.lower()
        if value != expected:
            mismatches.append(f"{where}: expected {expected!r}, found {value!r}")
    return mismatches


def _repo_files() -> dict[str, str]:
    """Tracked and untracked-but-not-ignored text files, keyed by repo-relative path."""
    listing = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    ).stdout.decode()
    files = {}
    for rel in filter(None, listing.split("\0")):
        path = ROOT / rel
        if not path.is_file():
            continue
        try:
            files[rel] = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # binary file
    return files


def _declared_names() -> dict[str, str | None]:
    pyproject = tomllib.loads((ROOT / "python/pyproject.toml").read_text(encoding="utf-8"))
    package = json.loads((ROOT / "web/package.json").read_text(encoding="utf-8"))
    project_py = (ROOT / "python/src/review/_project.py").read_text(encoding="utf-8")
    match = re.search(r'^DISPLAY_NAME = "([^"]*)"$', project_py, re.MULTILINE)
    return {
        "python/pyproject.toml [project].name": pyproject.get("project", {}).get("name"),
        "web/package.json name": package.get("name"),
        "python/src/review/_project.py DISPLAY_NAME": match.group(1) if match else None,
    }


def main() -> int:
    """Run both checks and print every problem found."""
    name = json.loads((ROOT / "project.json").read_text(encoding="utf-8"))["displayName"]
    problems = find_mismatches(name, _declared_names())
    violations = find_violations(_repo_files(), name, ALLOWED)
    if violations:
        problems.append(
            f"the project name {name!r} appears outside the allowed files "
            "(CLAUDE.md §4); use a functional name instead:"
        )
        problems.extend(f"  {v}" for v in violations)
    for problem in problems:
        print(problem, file=sys.stderr)
    if not problems:
        print(f"project name {name!r}: ok")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
