"""Decision points: one row per hero decision, with its situation key (MATH.md §5.1).

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-08 11:49:44.316298
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Generated with `alembic revision --autogenerate`, then reviewed. The key columns are plain
# strings: a new classifier version changes values, not the schema.


def upgrade() -> None:
    """Apply this migration."""
    op.create_table(
        "decision_points",
        sa.Column("hand_id", sa.Uuid(), nullable=False),
        sa.Column("action_seq", sa.Integer(), nullable=False),
        sa.Column("classifier_version", sa.Integer(), nullable=False),
        sa.Column("street", sa.String(length=16), nullable=False),
        sa.Column("spot", sa.String(length=32), nullable=False),
        sa.Column("pot_type", sa.String(length=32), nullable=True),
        sa.Column("players", sa.String(length=32), nullable=False),
        sa.Column("position_label", sa.String(length=8), nullable=False),
        sa.Column("position_group", sa.String(length=16), nullable=False),
        sa.Column("in_position", sa.String(length=16), nullable=True),
        sa.Column("initiative", sa.String(length=16), nullable=True),
        sa.Column("depth", sa.String(length=32), nullable=False),
        sa.Column("size", sa.String(length=32), nullable=True),
        sa.Column("facing_all_in", sa.Boolean(), nullable=False),
        sa.Column("board_suits", sa.String(length=32), nullable=True),
        sa.Column("board_pairing", sa.String(length=32), nullable=True),
        sa.Column("board_high_card", sa.String(length=32), nullable=True),
        sa.Column("board_connected", sa.Boolean(), nullable=True),
        sa.Column("texture_class", sa.String(length=32), nullable=True),
        sa.Column("new_card", sa.String(length=32), nullable=True),
        sa.Column("line", sa.Text(), nullable=False),
        sa.Column("straddled", sa.Boolean(), nullable=False),
        sa.Column("scorable", sa.Boolean(), nullable=False),
        sa.Column("unscored_reason", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["hand_id", "action_seq"],
            ["actions.hand_id", "actions.seq"],
            name=op.f("fk_decision_points_hand_id_actions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["hand_id"],
            ["hands.id"],
            name=op.f("fk_decision_points_hand_id_hands"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("hand_id", "action_seq", name=op.f("pk_decision_points")),
    )


def downgrade() -> None:
    """Revert this migration."""
    op.drop_table("decision_points")
