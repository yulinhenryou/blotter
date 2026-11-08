"""Decision points of a hand and their situation keys (``docs/MATH.md`` §5.1).

A decision point is every hero action other than a forced post. :func:`decision_points` replays
a canonical record through :class:`review.domain.rules.Betting` and, just before each such
action, reads what hero faced. The record must be canonical (the output of
:func:`review.domain.check.check`): posts and folds are explicit and every amount is filled in.
"""

from dataclasses import dataclass, field

from review.domain import HandRecord
from review.domain.record import POSTS, Action, ActionKind, Street
from review.domain.rules import Betting, ForcedBet, seat_order
from review.ledger.situations import (
    Initiative,
    InPosition,
    Players,
    PotType,
    Situation,
    Spot,
    depth_postflop,
    depth_preflop,
    effective_stack,
    position_group,
    position_labels,
    size_postflop,
    size_preflop,
    texture,
)

_LETTER = {
    ActionKind.FOLD: "F",
    ActionKind.CHECK: "X",
    ActionKind.CALL: "C",
    ActionKind.BET: "B",
    ActionKind.RAISE: "R",
}
_AGGRESSIVE = (ActionKind.BET, ActionKind.RAISE)


@dataclass(frozen=True)
class DecisionPoint:
    """One hero decision: the index of its action in ``record.actions`` and what hero faced."""

    action_seq: int
    situation: Situation


@dataclass(frozen=True)
class _Aggression:
    seat: int
    bet_before: int  # the bet B it raised (0 for a postflop bet)
    amount_to: int
    all_in: bool


@dataclass
class _Street:
    """What happened on one street so far."""

    letters: list[str] = field(default_factory=list)
    aggression: list[_Aggression] = field(default_factory=list)


def decision_points(record: HandRecord) -> tuple[DecisionPoint, ...]:
    """List hero's decision points in order, each with its situation key.

    Raises
    ------
    ValueError
        If the record is not canonical (its derived fields are missing).
    """
    if record.completeness is None:
        raise ValueError("decision points need a canonical record: run check() first")
    hero = record.hero_seat
    order = seat_order(record.dealt_in_seats, record.button_seat)
    labels = position_labels(order)
    stacks = {e.seat: e.starting_stack_chips for e in record.seats}
    big_blind = record.stakes.big_blind_chips
    betting = Betting.start(order, big_blind, stacks)

    streets: dict[Street, _Street] = {Street.PREFLOP: _Street()}
    voluntary: set[int] = set()  # seats that have put chips in voluntarily
    behind_at_start: dict[int, int | None] = dict(stacks)  # preflop: start of the hand
    pot_at_start = 0
    board = [*(record.board.flop or ()), record.board.turn, record.board.river]
    points: list[DecisionPoint] = []

    for seq, action in enumerate(record.actions):
        if action.kind in POSTS:
            chips = (
                action.ante_chips if action.kind is ActionKind.POST_ANTE else action.amount_to_chips
            )
            if chips is None:
                raise ValueError(f"actions[{seq}]: a canonical post carries its amount")
            betting.post(ForcedBet(action.seat, action.kind, chips), all_in=action.all_in)
            continue
        while action.street is not betting.street:
            betting.next_street()
            streets[betting.street] = _Street()
            behind_at_start = {s: st.behind for s, st in betting.seats.items()}
            pot_at_start = sum(st.ante + st.live for st in betting.seats.values())

        if action.seat == hero:
            in_hand = betting.non_folded()
            now = streets[betting.street]
            preflop = streets[Street.PREFLOP]
            raises = len(preflop.aggression)
            to_call = betting.bet - betting.seats[hero].street
            last = now.aggression[-1] if now.aggression else None
            effective = effective_stack(
                behind_at_start[hero], [behind_at_start[s] for s in in_hand if s != hero]
            )
            street = betting.street
            if street is Street.PREFLOP:
                spot = (
                    (Spot.LIMPED if voluntary else Spot.UNOPENED)
                    if raises == 0
                    else (Spot.FACING_OPEN, Spot.FACING_3BET)[raises - 1]
                    if raises <= 2
                    else Spot.FACING_4BET_PLUS
                )
                pot_type = None
                in_position = None
                initiative = None
                depth = depth_preflop(effective, big_blind)
                size = size_preflop(last.amount_to, last.bet_before) if last else None
                board_texture = None
            else:
                n_aggressive = len(now.aggression)
                spot = (Spot.NO_BET, Spot.FACING_BET, Spot.FACING_RAISE)[min(n_aggressive, 2)]
                pot_type = (
                    PotType.LIMPED,
                    PotType.SINGLE_RAISED,
                    PotType.THREE_BET,
                    PotType.FOUR_BET_PLUS,
                )[min(raises, 3)]
                position = in_hand.index(hero)
                in_position = (
                    InPosition.IP
                    if position == len(in_hand) - 1
                    else InPosition.OOP
                    if position == 0
                    else InPosition.MIDDLE
                )
                previous = streets[_previous(street)].aggression
                initiative = (
                    Initiative.NONE
                    if not previous
                    else Initiative.HERO
                    if previous[-1].seat == hero
                    else Initiative.VILLAIN
                )
                depth = depth_postflop(effective, pot_at_start)
                pot = sum(st.ante + st.live for st in betting.seats.values())
                size = size_postflop(to_call, pot) if to_call > 0 else None
                cards = [c for c in board[: 3 + _STREETS_AFTER_FLOP[street]] if c is not None]
                board_texture = texture(cards)

            situation = Situation(
                street=street,
                spot=spot,
                pot_type=pot_type,
                players=(Players.HEADS_UP, Players.THREE_WAY, Players.FOUR_PLUS)[
                    min(len(in_hand), 4) - 2
                ],
                position_label=labels[hero],
                position_group=position_group(labels[hero]),
                in_position=in_position,
                initiative=initiative,
                depth=depth,
                size=size,
                facing_all_in=last is not None and last.all_in and to_call > 0,
                texture=board_texture,
                line="/".join("".join(s.letters) for s in streets.values()),
                straddled=bool(record.stakes.straddles_chips),
            )
            points.append(DecisionPoint(seq, situation))

        _note(streets[betting.street], betting, voluntary, hero, action)
        betting.apply(action.seat, action.kind, action.amount_to_chips, action.all_in)

    return tuple(points)


_STREETS_AFTER_FLOP = {Street.FLOP: 0, Street.TURN: 1, Street.RIVER: 2}


def _previous(street: Street) -> Street:
    return {Street.FLOP: Street.PREFLOP, Street.TURN: Street.FLOP, Street.RIVER: Street.TURN}[
        street
    ]


def _note(now: _Street, betting: Betting, voluntary: set[int], hero: int, action: Action) -> None:
    """Record an action in the street's line and aggression, before it is applied."""
    kind, seat = action.kind, action.seat
    # Preflop folds by seats that never put chips in voluntarily are left out of the line.
    skip = kind is ActionKind.FOLD and betting.street is Street.PREFLOP and seat not in voluntary
    if not skip:
        letter = _LETTER[kind]
        now.letters.append(letter.lower() if seat == hero else letter)
    if kind in _AGGRESSIVE and action.amount_to_chips is not None:
        now.aggression.append(_Aggression(seat, betting.bet, action.amount_to_chips, action.all_in))
    if kind in (ActionKind.CALL, *_AGGRESSIVE):
        voluntary.add(seat)
