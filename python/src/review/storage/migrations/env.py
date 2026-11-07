"""Alembic environment: runs migrations against the URL given by :mod:`review.storage.migrate`.

From the command line (``uv run alembic …`` in ``python/``), the URL comes from
``DATABASE_URL`` instead.
"""

from alembic import context

from review.storage.db import database_url, make_engine
from review.storage.models import Base

config = context.config
url = config.attributes.get("url") or database_url()


def run_migrations_online() -> None:
    """Run the migrations in one transaction per migration on a live connection."""
    engine = make_engine(url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            # SQLite cannot alter most constraints in place; batch mode copies the table.
            render_as_batch=connection.dialect.name == "sqlite",
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("offline (SQL script) migrations are not supported; run them online")
run_migrations_online()
