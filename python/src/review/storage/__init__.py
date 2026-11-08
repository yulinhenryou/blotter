"""Persistence: SQLAlchemy models, engine set-up and Alembic migrations (ADR-0006).

Imports ``domain`` and ``ledger`` but nothing imports ``storage`` except ``api``
(``docs/ARCHITECTURE.md`` §5.1).
"""
