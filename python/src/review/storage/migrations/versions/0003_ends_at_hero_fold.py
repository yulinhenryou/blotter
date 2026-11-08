"""Record version 2: hands that end at hero's fold (ADR-0030).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-08 14:05:12.658474
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Generated with `alembic revision --autogenerate`, then reviewed: the default is `false()`
# rather than the generated text '0', which PostgreSQL refuses for a boolean column, and the
# data steps (schema version, refusing to downgrade hands that need version 2) are by hand.

_hands = sa.table(
    "hands",
    sa.column("schema_version", sa.Integer()),
    sa.column("ends_at_hero_fold", sa.Boolean()),
)


def upgrade() -> None:
    """Apply this migration."""
    with op.batch_alter_table("hand_seats", schema=None) as batch_op:
        batch_op.alter_column("won_chips", existing_type=sa.Integer(), nullable=True)

    with op.batch_alter_table("hands", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("ends_at_hero_fold", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch_op.alter_column("rake_chips", existing_type=sa.Integer(), nullable=True)

    # A version 1 record is a version 2 record without the flag; canonical records are version 2.
    op.execute(_hands.update().values(schema_version=2))


def downgrade() -> None:
    """Revert this migration; refused while a stored hand ends at hero's fold."""
    bind = op.get_bind()
    count = bind.execute(
        sa.select(sa.func.count()).select_from(_hands).where(_hands.c.ends_at_hero_fold)
    ).scalar_one()
    if count:
        raise RuntimeError(
            f"{count} stored hands end at hero's fold, which record version 1 cannot hold"
        )
    op.execute(_hands.update().values(schema_version=1))

    with op.batch_alter_table("hands", schema=None) as batch_op:
        batch_op.alter_column("rake_chips", existing_type=sa.Integer(), nullable=False)
        batch_op.drop_column("ends_at_hero_fold")

    with op.batch_alter_table("hand_seats", schema=None) as batch_op:
        batch_op.alter_column("won_chips", existing_type=sa.Integer(), nullable=False)
