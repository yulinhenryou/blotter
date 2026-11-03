"""Tests for scripts/check_project_name.py. Run: python3 -m unittest discover -s scripts/tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from check_project_name import find_mismatches, find_violations  # noqa: E402


class FindViolationsTest(unittest.TestCase):
    def test_allowed_file_is_ignored(self) -> None:
        files = {"README.md": "# Acme\n"}
        self.assertEqual(find_violations(files, "Acme", {"README.md"}), [])

    def test_occurrence_elsewhere_is_reported_case_insensitively(self) -> None:
        files = {"src/x.py": "ok\nACME_DB = 1\n"}
        self.assertEqual(
            find_violations(files, "Acme", set()),
            ["src/x.py:2: ACME_DB = 1"],
        )

    def test_name_inside_a_word_still_counts(self) -> None:
        files = {"a.ts": "const acmeClient = 1\n"}
        self.assertEqual(len(find_violations(files, "Acme", set())), 1)


class FindMismatchesTest(unittest.TestCase):
    def test_consistent_names_pass(self) -> None:
        declared = {"pyproject name": "acme", "_project.py DISPLAY_NAME": "Acme"}
        self.assertEqual(find_mismatches("Acme", declared), [])

    def test_stale_name_is_reported(self) -> None:
        declared = {"pyproject name": "oldname", "_project.py DISPLAY_NAME": None}
        self.assertEqual(len(find_mismatches("Acme", declared)), 2)


if __name__ == "__main__":
    unittest.main()
