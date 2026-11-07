"""Column types that behave the same on SQLite and PostgreSQL (``docs/ARCHITECTURE.md`` §7.1)."""

from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[datetime]):
    """A timezone-aware timestamp, stored in UTC and always read back as aware UTC.

    PostgreSQL keeps the zone (``timestamptz``); SQLite stores text and drops it, so values are
    converted to UTC before they are written and get the UTC zone attached when they are read.
    Naive datetimes are rejected: a time without a zone is ambiguous.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Convert to UTC before writing."""
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime: a timestamp needs a time zone")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Attach UTC when the database returned a naive value (SQLite)."""
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
