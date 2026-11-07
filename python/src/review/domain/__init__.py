"""The hand record and the rules it is checked against (``docs/MATH.md`` §1.5).

Pure: imports nothing else from the project (``docs/ARCHITECTURE.md`` §5.1).
"""

from review.domain.check import CheckResult, Issue, check
from review.domain.record import SCHEMA_VERSION, HandRecord

__all__ = ["SCHEMA_VERSION", "CheckResult", "HandRecord", "Issue", "check"]
