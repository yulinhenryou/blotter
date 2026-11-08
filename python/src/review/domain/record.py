"""The hand record, version 2 (``docs/ARCHITECTURE.md`` §7.3).

These models describe the *shape* of a record: types, enumerations, card syntax, ranges of
numbers. Whether a record is consistent with the rules of the game is checked separately by
:func:`review.domain.check.check`, which also produces the canonical form.

Models are frozen (immutable) and use tuples for sequences, so a record can be shared, compared
with ``==`` and hashed without defensive copies. They forbid unknown fields, so a misspelled field
is an error rather than silently dropped.

Version 2 adds ``ends_at_hero_fold`` (ADR-0030): a record may stop at hero's fold. A version 1
record is a version 2 record with that flag ``False``; the canonical form is always version 2.
"""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import UUID7, AwareDatetime, BaseModel, ConfigDict, Field

SCHEMA_VERSION: Literal[2] = 2

Card = Annotated[str, Field(pattern=r"^[2-9TJQKA][shdc]$", examples=["Ks", "Td", "2c"])]
"""A card as canonical text: rank (``2`` to ``9``, ``T``, ``J``, ``Q``, ``K``, ``A``) then suit."""

Seat = Annotated[int, Field(ge=1, le=10)]
Chips = Annotated[int, Field(ge=0)]
PositiveChips = Annotated[int, Field(ge=1)]


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Street(StrEnum):
    """Betting rounds, in order."""

    PREFLOP = "preflop"
    FLOP = "flop"
    TURN = "turn"
    RIVER = "river"


STREETS: tuple[Street, ...] = tuple(Street)


class ActionKind(StrEnum):
    """What a seat did. The ``post_*`` kinds are forced bets (``docs/MATH.md`` §1.5)."""

    POST_ANTE = "post_ante"
    POST_SMALL_BLIND = "post_small_blind"
    POST_BIG_BLIND = "post_big_blind"
    POST_STRADDLE = "post_straddle"
    FOLD = "fold"
    CHECK = "check"
    CALL = "call"
    BET = "bet"
    RAISE = "raise"


POSTS = frozenset(
    {
        ActionKind.POST_ANTE,
        ActionKind.POST_SMALL_BLIND,
        ActionKind.POST_BIG_BLIND,
        ActionKind.POST_STRADDLE,
    }
)


class RecordReason(StrEnum):
    """Why the hand was logged (``docs/MATH.md`` §4.5)."""

    NOTABLE = "notable"
    ROUTINE = "routine"
    RANDOM_SAMPLE = "random_sample"


class AnteKind(StrEnum):
    """Who posts the ante."""

    PER_PLAYER = "per_player"
    BIG_BLIND = "big_blind"


class Ante(_Model):
    """An ante: every dealt-in seat posts ``chips``, or the big blind posts it once."""

    kind: AnteKind
    chips: PositiveChips


class Stakes(_Model):
    """Forced bets of the hand, in chips."""

    small_blind_chips: PositiveChips
    big_blind_chips: PositiveChips
    straddles_chips: tuple[PositiveChips, ...] = ()
    ante: Ante | None = None


class SeatEntry(_Model):
    """What is known about one dealt-in seat."""

    seat: Seat
    player_id: UUID7 | None = None
    starting_stack_chips: PositiveChips | None = None
    stack_approximate: bool = False
    hole_cards: tuple[Card, Card] | None = None
    showed: bool = False


class Board(_Model):
    """Community cards; ``None`` for a street that was not dealt."""

    flop: tuple[Card, Card, Card] | None = None
    turn: Card | None = None
    river: Card | None = None


class Action(_Model):
    """One action. ``amount_to_chips`` is the seat's total on this street after the action."""

    street: Street
    seat: Seat
    kind: ActionKind
    amount_to_chips: PositiveChips | None = None
    ante_chips: PositiveChips | None = None
    all_in: bool = False
    amount_approximate: bool = False


class Result(_Model):
    """Chips won by one seat. Seats without an entry won nothing."""

    seat: Seat
    won_chips: PositiveChips


class Completeness(_Model):
    """What the record does not know exactly. Derived; see ``docs/ARCHITECTURE.md`` §7.3."""

    villain_cards_unknown: bool
    stacks_approximate: bool
    amounts_approximate: bool


class HandRecord(_Model):
    """One hand, as captured or as stored.

    The fields ``completeness``, ``rake_chips`` and ``hero_net_chips`` are derived: they are
    ignored on input and filled in by :func:`review.domain.check.check`. ``rake_chips`` stays
    ``None`` for a hand that ends at hero's fold, where the rake is not known.
    """

    schema_version: Literal[1, 2] = SCHEMA_VERSION
    id: UUID7
    revision: Annotated[int, Field(ge=1)] = 1
    session_id: UUID7
    client_seq: Annotated[int, Field(ge=0)]
    played_at: AwareDatetime | None = None
    record_reason: RecordReason
    source: Literal["manual"] = "manual"
    stakes: Stakes
    table_size: Annotated[int, Field(ge=2, le=10)]
    dealt_in_seats: tuple[Seat, ...]
    button_seat: Seat
    hero_seat: Seat
    seats: tuple[SeatEntry, ...] = ()
    board: Board = Board()
    actions: tuple[Action, ...] = ()
    ends_at_hero_fold: bool = False
    """The record stops at hero's fold: no later action, board card or results (version 2)."""
    results: tuple[Result, ...] = ()
    completeness: Completeness | None = None
    rake_chips: Chips | None = None
    hero_net_chips: int | None = None
