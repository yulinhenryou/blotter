"""Record tables: venues, players, sessions, hands, hand_seats, actions.

Revision ID: 0001
Revises: (none)
Create Date: 2026-11-07 21:32:39.905957
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Generated with `alembic revision --autogenerate`, then reviewed. Timestamps are plain
# timestamptz here; review.storage.types.UTCDateTime adds the UTC handling in Python only.


def upgrade() -> None:
    """Apply this migration."""
    op.create_table(
        "players",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("is_hero", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_players")),
    )
    op.create_table(
        "venues",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("live", "online", name="venue_kind", native_enum=False, create_constraint=True),
            nullable=False,
        ),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_venues")),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("venue_id", sa.Uuid(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("small_blind_chips", sa.Integer(), nullable=False),
        sa.Column("big_blind_chips", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("chip_unit_minor", sa.Integer(), nullable=True),
        sa.Column("buy_in_chips", sa.Integer(), nullable=True),
        sa.Column("cash_out_chips", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["venue_id"], ["venues.id"], name=op.f("fk_sessions_venue_id_venues")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
    )
    op.create_table(
        "hands",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("client_seq", sa.Integer(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("played_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "record_reason",
            sa.Enum(
                "notable",
                "routine",
                "random_sample",
                name="record_reason",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "source",
            sa.Enum(
                "manual", "import", name="hand_source", native_enum=False, create_constraint=True
            ),
            nullable=False,
        ),
        sa.Column("table_size", sa.Integer(), nullable=False),
        sa.Column("button_seat", sa.Integer(), nullable=False),
        sa.Column("hero_seat", sa.Integer(), nullable=False),
        sa.Column("small_blind_chips", sa.Integer(), nullable=False),
        sa.Column("big_blind_chips", sa.Integer(), nullable=False),
        sa.Column("straddles_chips", sa.JSON(), nullable=False),
        sa.Column(
            "ante_kind",
            sa.Enum(
                "per_player",
                "big_blind",
                name="ante_kind",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
        sa.Column("ante_chips", sa.Integer(), nullable=True),
        sa.Column("board_flop", sa.String(length=6), nullable=True),
        sa.Column("board_turn", sa.String(length=2), nullable=True),
        sa.Column("board_river", sa.String(length=2), nullable=True),
        sa.Column("rake_chips", sa.Integer(), nullable=False),
        sa.Column("hero_net_chips", sa.Integer(), nullable=False),
        sa.Column("villain_cards_unknown", sa.Boolean(), nullable=False),
        sa.Column("stacks_approximate", sa.Boolean(), nullable=False),
        sa.Column("amounts_approximate", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name=op.f("fk_hands_session_id_sessions")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hands")),
        sa.UniqueConstraint("session_id", "client_seq", name=op.f("uq_hands_session_id")),
    )
    op.create_table(
        "hand_seats",
        sa.Column("hand_id", sa.Uuid(), nullable=False),
        sa.Column("seat", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Uuid(), nullable=True),
        sa.Column("starting_stack_chips", sa.Integer(), nullable=True),
        sa.Column("stack_approximate", sa.Boolean(), nullable=False),
        sa.Column("hole_cards", sa.String(length=4), nullable=True),
        sa.Column("showed", sa.Boolean(), nullable=False),
        sa.Column("won_chips", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["hand_id"], ["hands.id"], name=op.f("fk_hand_seats_hand_id_hands"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name=op.f("fk_hand_seats_player_id_players")
        ),
        sa.PrimaryKeyConstraint("hand_id", "seat", name=op.f("pk_hand_seats")),
    )
    op.create_table(
        "actions",
        sa.Column("hand_id", sa.Uuid(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column(
            "street",
            sa.Enum(
                "preflop",
                "flop",
                "turn",
                "river",
                name="street",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("seat", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "post_ante",
                "post_small_blind",
                "post_big_blind",
                "post_straddle",
                "fold",
                "check",
                "call",
                "bet",
                "raise",
                name="action_kind",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("amount_to_chips", sa.Integer(), nullable=True),
        sa.Column("ante_chips", sa.Integer(), nullable=True),
        sa.Column("all_in", sa.Boolean(), nullable=False),
        sa.Column("amount_approximate", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["hand_id", "seat"],
            ["hand_seats.hand_id", "hand_seats.seat"],
            name=op.f("fk_actions_hand_id_hand_seats"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["hand_id"], ["hands.id"], name=op.f("fk_actions_hand_id_hands"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("hand_id", "seq", name=op.f("pk_actions")),
    )


def downgrade() -> None:
    """Revert this migration."""
    op.drop_table("actions")
    op.drop_table("hand_seats")
    op.drop_table("hands")
    op.drop_table("sessions")
    op.drop_table("venues")
    op.drop_table("players")
