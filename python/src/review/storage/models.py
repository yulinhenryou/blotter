"""Relational tables for venues, sessions, players and hand records (``docs/ARCHITECTURE.md`` §7.2).

A stored hand is the canonical hand record (``review.domain``) as rows: one ``hands`` row, one
``hand_seats`` row per dealt-in seat, one ``actions`` row per action. The rows are the only copy;
there is no JSON copy of the record (M3a plan §1.2).

Portability (``ARCHITECTURE.md`` §7.1): UUID keys use SQLAlchemy's ``Uuid`` (native ``uuid`` on
PostgreSQL, 32 hex characters on SQLite); enumerations are stored as text with a check
constraint rather than as PostgreSQL enum types, so migrations need no type management;
timestamps go through :class:`~review.storage.types.UTCDateTime`.
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any, ClassVar

from sqlalchemy import (
    JSON,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from review.domain.entities import VenueKind
from review.domain.record import ActionKind, AnteKind, RecordReason, Street
from review.storage.types import UTCDateTime

# Deterministic constraint names, so that migrations can refer to (and drop) them on any backend.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base with the naming convention and the project's column types."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map: ClassVar[dict[Any, Any]] = {uuid.UUID: Uuid(), datetime: UTCDateTime()}


def _text_enum[E: StrEnum](enum: type[E], name: str) -> Enum:
    """Store an enumeration as its values in a text column with a check constraint."""
    return Enum(
        enum,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=max(len(m.value) for m in enum),
        values_callable=lambda members: [m.value for m in members],
    )


class HandSource(StrEnum):
    """How a hand reached the database. ``import`` is reserved for a later milestone."""

    MANUAL = "manual"
    IMPORT = "import"


class Venue(Base):
    """A card room or an online site."""

    __tablename__ = "venues"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    revision: Mapped[int] = mapped_column(default=1)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[VenueKind] = mapped_column(_text_enum(VenueKind, "venue_kind"))
    timezone: Mapped[str] = mapped_column(String(64))  # IANA name, e.g. "Europe/Vienna"


class Player(Base):
    """Hero or a known opponent. Anonymous seats have no player."""

    __tablename__ = "players"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    revision: Mapped[int] = mapped_column(default=1)
    display_name: Mapped[str] = mapped_column(String(200))
    is_hero: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[str | None] = mapped_column(Text)


class Session(Base):
    """A playing session. Results come from buy-in and cash-out (``MATH.md`` §4.5)."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    revision: Mapped[int] = mapped_column(default=1)
    venue_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("venues.id"))
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime | None]
    small_blind_chips: Mapped[int]
    big_blind_chips: Mapped[int]
    currency: Mapped[str | None] = mapped_column(String(3))  # ISO 4217, e.g. "EUR"
    chip_unit_minor: Mapped[int | None]  # value of one chip in the currency's minor unit
    buy_in_chips: Mapped[int | None]
    cash_out_chips: Mapped[int | None]
    notes: Mapped[str | None] = mapped_column(Text)


class Hand(Base):
    """One hand record; its seats and actions are in ``hand_seats`` and ``actions``."""

    __tablename__ = "hands"
    __table_args__ = (UniqueConstraint("session_id", "client_seq"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    revision: Mapped[int] = mapped_column(default=1)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"))
    client_seq: Mapped[int]
    schema_version: Mapped[int]
    played_at: Mapped[datetime | None]
    record_reason: Mapped[RecordReason] = mapped_column(_text_enum(RecordReason, "record_reason"))
    source: Mapped[HandSource] = mapped_column(_text_enum(HandSource, "hand_source"))
    table_size: Mapped[int]
    button_seat: Mapped[int]
    hero_seat: Mapped[int]
    small_blind_chips: Mapped[int]
    big_blind_chips: Mapped[int]
    straddles_chips: Mapped[list[int]] = mapped_column(JSON)
    ante_kind: Mapped[AnteKind | None] = mapped_column(_text_enum(AnteKind, "ante_kind"))
    ante_chips: Mapped[int | None]
    board_flop: Mapped[str | None] = mapped_column(String(6))  # e.g. "Ks7d2c"
    board_turn: Mapped[str | None] = mapped_column(String(2))
    board_river: Mapped[str | None] = mapped_column(String(2))
    # Record version 2 (ADR-0030): the hand stops at hero's fold; no results, rake unknown.
    ends_at_hero_fold: Mapped[bool] = mapped_column(server_default=false())
    # Derived by review.domain.check; stored because analysis filters on them.
    rake_chips: Mapped[int | None]  # None when ends_at_hero_fold
    hero_net_chips: Mapped[int]
    villain_cards_unknown: Mapped[bool]
    stacks_approximate: Mapped[bool]
    amounts_approximate: Mapped[bool]


class HandSeat(Base):
    """One dealt-in seat of a hand, with what it won."""

    __tablename__ = "hand_seats"

    hand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hands.id", ondelete="CASCADE"), primary_key=True
    )
    seat: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("players.id"))
    starting_stack_chips: Mapped[int | None]
    stack_approximate: Mapped[bool]
    hole_cards: Mapped[str | None] = mapped_column(String(4))  # e.g. "AsKd"
    showed: Mapped[bool]
    # None when the hand ends at hero's fold and this seat is not hero: what it won is unknown.
    won_chips: Mapped[int | None]


class HandAction(Base):
    """One action of a hand, in order."""

    __tablename__ = "actions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["hand_id", "seat"],
            ["hand_seats.hand_id", "hand_seats.seat"],
            ondelete="CASCADE",
        ),
    )

    hand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hands.id", ondelete="CASCADE"), primary_key=True
    )
    seq: Mapped[int] = mapped_column(primary_key=True)
    street: Mapped[Street] = mapped_column(_text_enum(Street, "street"))
    seat: Mapped[int]
    kind: Mapped[ActionKind] = mapped_column(_text_enum(ActionKind, "action_kind"))
    amount_to_chips: Mapped[int | None]
    ante_chips: Mapped[int | None]
    all_in: Mapped[bool]
    amount_approximate: Mapped[bool]


class DecisionPointRow(Base):
    """One hero decision and its situation key (``docs/MATH.md`` §5.1).

    Derived from the hand by ``review.ledger``; rewritten whenever the hand is. The key columns
    are plain text without a check constraint, so a new classifier version needs no migration.
    """

    __tablename__ = "decision_points"
    __table_args__ = (
        ForeignKeyConstraint(
            ["hand_id", "action_seq"],
            ["actions.hand_id", "actions.seq"],
            ondelete="CASCADE",
        ),
    )

    hand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hands.id", ondelete="CASCADE"), primary_key=True
    )
    action_seq: Mapped[int] = mapped_column(primary_key=True)
    classifier_version: Mapped[int]
    street: Mapped[str] = mapped_column(String(16))
    spot: Mapped[str] = mapped_column(String(32))
    pot_type: Mapped[str | None] = mapped_column(String(32))
    players: Mapped[str] = mapped_column(String(32))
    position_label: Mapped[str] = mapped_column(String(8))
    position_group: Mapped[str] = mapped_column(String(16))
    in_position: Mapped[str | None] = mapped_column(String(16))
    initiative: Mapped[str | None] = mapped_column(String(16))
    depth: Mapped[str] = mapped_column(String(32))
    size: Mapped[str | None] = mapped_column(String(32))
    facing_all_in: Mapped[bool]
    board_suits: Mapped[str | None] = mapped_column(String(32))
    board_pairing: Mapped[str | None] = mapped_column(String(32))
    board_high_card: Mapped[str | None] = mapped_column(String(32))
    board_connected: Mapped[bool | None]
    texture_class: Mapped[str | None] = mapped_column(String(32))
    new_card: Mapped[str | None] = mapped_column(String(32))
    line: Mapped[str] = mapped_column(Text)
    straddled: Mapped[bool]
    # Filled in by the evaluator (M3b); until then every decision is unscored.
    scorable: Mapped[bool]
    unscored_reason: Mapped[str | None] = mapped_column(String(64))
