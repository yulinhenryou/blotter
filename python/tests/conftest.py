from collections.abc import Iterator
from pathlib import Path

import pytest
from hypothesis import settings
from storage_backends import BACKENDS, backend_url

# Fixed seeds for every property test (CLAUDE.md §8): derandomized generation, no example
# database, so a run is the same on every machine.
settings.register_profile("fixed", derandomize=True, database=None, deadline=None)
settings.load_profile("fixed")


@pytest.fixture(params=BACKENDS)
def database_url(request: pytest.FixtureRequest, tmp_path: Path) -> Iterator[str]:
    """An empty database on each backend (SQLite, and PostgreSQL when available)."""
    yield from backend_url(request.param, tmp_path)
