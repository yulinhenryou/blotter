"""Situation keys, classifier version 1 (``docs/MATH.md`` §5.1).

The vocabulary of a situation key and the pure functions that pick a value: position labels,
depth and size buckets, board texture. Replaying a hand to find the inputs is the job of
:mod:`review.ledger.decisions`.

Ratios are compared exactly with :class:`fractions.Fraction`, so a value on a boundary (an SPR of
exactly 4, a bet of exactly 40% of the pot) always lands in the bucket the docs say: lower bounds
are inclusive.
"""

from dataclasses import dataclass
from enum import StrEnum
from fractions import Fraction

from review.domain.record import Street

CLASSIFIER_VERSION = 1
"""Bump when any definition in ``MATH.md`` §5.1 changes; stored keys are then recomputed."""


class Spot(StrEnum):
    """What hero faces on this street (``MATH.md`` §5.1, item 2)."""

    UNOPENED = "unopened"
    LIMPED = "limped"
    FACING_OPEN = "facing_open"
    FACING_3BET = "facing_3bet"
    FACING_4BET_PLUS = "facing_4bet_plus"
    NO_BET = "no_bet"
    FACING_BET = "facing_bet"
    FACING_RAISE = "facing_raise"


class PotType(StrEnum):
    """Voluntary raises in the preflop round (item 3)."""

    LIMPED = "limped"
    SINGLE_RAISED = "single_raised"
    THREE_BET = "3bet"
    FOUR_BET_PLUS = "4bet_plus"


class Players(StrEnum):
    """Seats in hand at the decision, hero included (item 4)."""

    HEADS_UP = "heads_up"
    THREE_WAY = "three_way"
    FOUR_PLUS = "four_plus"


class PositionGroup(StrEnum):
    """Coarse position, used for pooling (item 5)."""

    EARLY = "early"
    MIDDLE = "middle"
    LATE = "late"
    BLINDS = "blinds"


class InPosition(StrEnum):
    """Hero's place in the postflop order among the seats in hand (item 6)."""

    IP = "ip"
    OOP = "oop"
    MIDDLE = "middle"


class Initiative(StrEnum):
    """Who made the last voluntary bet or raise on the previous street (item 7)."""

    HERO = "hero"
    VILLAIN = "villain"
    NONE = "none"


class Depth(StrEnum):
    """Stack-to-pot ratio postflop, effective stack in big blinds preflop (item 8)."""

    SPR_LT_2 = "spr_lt_2"
    SPR_2_4 = "spr_2_4"
    SPR_4_8 = "spr_4_8"
    SPR_8_PLUS = "spr_8_plus"
    BB_LT_40 = "bb_lt_40"
    BB_40_100 = "bb_40_100"
    BB_100_200 = "bb_100_200"
    BB_200_PLUS = "bb_200_plus"
    UNKNOWN = "unknown"


class Size(StrEnum):
    """The bet hero faces: fraction of the pot postflop, multiple of the raised bet preflop."""

    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"
    OVERBET = "overbet"
    LT_2_5X = "lt_2_5x"
    X_2_5_TO_3_5 = "2_5x_3_5x"
    X_3_5_TO_5 = "3_5x_5x"
    X_5_PLUS = "5x_plus"


class BoardSuits(StrEnum):
    """How the board's suits repeat (item 10)."""

    RAINBOW = "rainbow"
    TWO_TONE = "two_tone"
    FLUSH_POSSIBLE = "flush_possible"


class Pairing(StrEnum):
    """How the board's ranks repeat."""

    UNPAIRED = "unpaired"
    PAIRED = "paired"
    HEAVILY_PAIRED = "heavily_paired"


class HighCard(StrEnum):
    """The board's highest rank."""

    ACE = "ace"
    BROADWAY = "broadway"
    TEN_OR_LOWER = "ten_or_lower"


class TextureClass(StrEnum):
    """The pooled texture: the first of these that applies."""

    PAIRED = "paired"
    FLUSH_POSSIBLE = "flush_possible"
    CONNECTED = "connected"
    TWO_TONE = "two_tone"
    DRY = "dry"


class NewCard(StrEnum):
    """What the turn or river card did: the first of these that applies."""

    PAIRS_BOARD = "pairs_board"
    COMPLETES_FLUSH = "completes_flush"
    COMPLETES_STRAIGHT = "completes_straight"
    OVERCARD = "overcard"
    BLANK = "blank"


@dataclass(frozen=True)
class Texture:
    """The board at the decision; ``new_card`` is ``None`` on the flop."""

    suits: BoardSuits
    pairing: Pairing
    high_card: HighCard
    connected: bool
    texture_class: TextureClass
    new_card: NewCard | None


@dataclass(frozen=True)
class Situation:
    """The situation key of one decision point. ``None`` marks a column that does not apply."""

    street: Street
    spot: Spot
    pot_type: PotType | None
    players: Players
    position_label: str
    position_group: PositionGroup
    in_position: InPosition | None
    initiative: Initiative | None
    depth: Depth
    size: Size | None
    facing_all_in: bool
    texture: Texture | None
    line: str
    straddled: bool


# --- Positions ---------------------------------------------------------------------------------

_FROM_END = ("LJ", "HJ", "CO")
_FROM_START = ("UTG", "UTG+1", "UTG+2", "UTG+3")
_GROUP = {
    "LJ": PositionGroup.MIDDLE,
    "HJ": PositionGroup.MIDDLE,
    "CO": PositionGroup.LATE,
    "BTN": PositionGroup.LATE,
    "SB": PositionGroup.BLINDS,
    "BB": PositionGroup.BLINDS,
}


def position_labels(order: tuple[int, ...]) -> dict[int, str]:
    """Label the dealt-in seats, given clockwise from the first seat after the button.

    ``order`` is :func:`review.domain.rules.seat_order`, so the button is its last seat.
    """
    *before, button = order
    if not before:
        raise ValueError("a hand needs at least two dealt-in seats")
    if len(before) == 1:  # heads-up: the button posts the small blind
        return {button: "BTN", before[0]: "BB"}
    small, big, *others = before
    k = len(others)
    tail = _FROM_END[len(_FROM_END) - min(k, len(_FROM_END)) :]
    head = _FROM_START[: k - len(tail)]
    labels = dict(zip(others, (*head, *tail), strict=True))
    return labels | {small: "SB", big: "BB", button: "BTN"}


def position_group(label: str) -> PositionGroup:
    """Return the pooled group of a position label (``UTG``… are early)."""
    return _GROUP.get(label, PositionGroup.EARLY)


# --- Buckets -----------------------------------------------------------------------------------


def effective_stack(hero: int | None, others: list[int | None]) -> int | None:
    r"""Return $E = \min(\text{hero}, \max \text{others})$, or ``None`` when it is unknown.

    With some stacks unknown, $E$ is still hero's stack when hero's is known and no larger than a
    known stack among the others: the unknown ones can only raise the maximum.
    """
    known = [s for s in others if s is not None]
    if hero is not None and known and hero <= max(known):
        return hero
    if hero is None or len(known) < len(others) or not known:
        return None
    return min(hero, max(known))


def depth_postflop(effective: int | None, pot_at_start: int) -> Depth:
    """Bucket the stack-to-pot ratio $E / P_0$."""
    if effective is None:
        return Depth.UNKNOWN
    spr = Fraction(effective, pot_at_start)
    if spr < 2:
        return Depth.SPR_LT_2
    if spr < 4:
        return Depth.SPR_2_4
    if spr < 8:
        return Depth.SPR_4_8
    return Depth.SPR_8_PLUS


def depth_preflop(effective: int | None, big_blind: int) -> Depth:
    """Bucket the effective stack in big blinds."""
    if effective is None:
        return Depth.UNKNOWN
    bbs = Fraction(effective, big_blind)
    if bbs < 40:
        return Depth.BB_LT_40
    if bbs < 100:
        return Depth.BB_40_100
    if bbs < 200:
        return Depth.BB_100_200
    return Depth.BB_200_PLUS


def size_postflop(to_call: int, pot: int) -> Size:
    """Bucket $f = c / (P - c)$: the bet as a fraction of the pot before it."""
    f = Fraction(to_call, pot - to_call)
    if f < Fraction(2, 5):
        return Size.SMALL
    if f < Fraction(4, 5):
        return Size.MEDIUM
    if f < Fraction(5, 4):
        return Size.LARGE
    return Size.OVERBET


def size_preflop(raise_to: int, raised_bet: int) -> Size:
    r"""Bucket $m = B / B_{\text{prev}}$: the last raise as a multiple of the bet it raised."""
    m = Fraction(raise_to, raised_bet)
    if m < Fraction(5, 2):
        return Size.LT_2_5X
    if m < Fraction(7, 2):
        return Size.X_2_5_TO_3_5
    if m < 5:
        return Size.X_3_5_TO_5
    return Size.X_5_PLUS


# --- Texture -----------------------------------------------------------------------------------

_RANKS = "23456789TJQKA"


def _rank(card: str) -> int:
    return _RANKS.index(card[0]) + 2  # 2..14, ace high


def connected(cards: list[str]) -> bool:
    """Tell whether five consecutive ranks (ace low or high) hold three or more board ranks."""
    ranks = {_rank(c) for c in cards}
    if 14 in ranks:
        ranks.add(1)
    return any(sum(low <= r <= low + 4 for r in ranks) >= 3 for low in range(1, 11))


def texture(board: list[str]) -> Texture:
    """Classify a board of three to five cards; the last card is the new one past the flop."""
    suit_counts = sorted((sum(c[1] == s for c in board) for s in "shdc"), reverse=True)
    if suit_counts[0] >= 3:
        suits = BoardSuits.FLUSH_POSSIBLE
    elif suit_counts[0] == 2:
        suits = BoardSuits.TWO_TONE
    else:
        suits = BoardSuits.RAINBOW

    rank_counts = sorted(
        (sum(_rank(c) == r for c in board) for r in {_rank(c) for c in board}), reverse=True
    )
    if rank_counts[0] == 1:
        pairing = Pairing.UNPAIRED
    elif rank_counts[0] == 2 and (len(rank_counts) < 2 or rank_counts[1] == 1):
        pairing = Pairing.PAIRED
    else:
        pairing = Pairing.HEAVILY_PAIRED

    top = max(_rank(c) for c in board)
    high = HighCard.ACE if top == 14 else HighCard.BROADWAY if top >= 11 else HighCard.TEN_OR_LOWER

    is_connected = connected(board)
    if pairing is not Pairing.UNPAIRED:
        cls = TextureClass.PAIRED
    elif suits is BoardSuits.FLUSH_POSSIBLE:
        cls = TextureClass.FLUSH_POSSIBLE
    elif is_connected:
        cls = TextureClass.CONNECTED
    elif suits is BoardSuits.TWO_TONE:
        cls = TextureClass.TWO_TONE
    else:
        cls = TextureClass.DRY

    return Texture(suits, pairing, high, is_connected, cls, _new_card(board))


def _new_card(board: list[str]) -> NewCard | None:
    if len(board) == 3:
        return None
    *before, new = board
    if _rank(new) in {_rank(c) for c in before}:
        return NewCard.PAIRS_BOARD
    if sum(c[1] == new[1] for c in board) == 3:
        return NewCard.COMPLETES_FLUSH
    if connected(board) and not connected(before):
        return NewCard.COMPLETES_STRAIGHT
    if _rank(new) > max(_rank(c) for c in before):
        return NewCard.OVERCARD
    return NewCard.BLANK
