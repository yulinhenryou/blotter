"""A random dealer of legal no-limit hold'em hands, for property tests of ``review.domain``.

It is written separately from ``review.domain.rules`` and ``review.domain.pots`` and does not
import them, so that a property test compares two implementations of ``docs/MATH.md`` §1.5
rather than the checker with itself. Its style differs on purpose:

- who still has to act is a set of pending seats, refilled after every bet or raise, instead of
  the checker's per-seat test;
- raise rights follow the wording of TDA rule 49-A (a full raise since the seat acted, or short
  all-ins adding up to one), instead of the single inequality derived in ``MATH.md``;
- pots are peeled off the smallest all-in, instead of being built from sorted levels.

The dealer produces records that are fully explicit (every forced bet, fold, seat, stack and
card), plus notes the tests need to mutate them. They are complete, except that
:func:`end_at_hero_fold` cuts a hand in which hero folded at hero's fold (record version 2,
ADR-0030), the way a player who stops watching would record it.
"""

import random
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field, replace

from review.domain.record import (
    Action,
    ActionKind,
    Ante,
    AnteKind,
    Board,
    HandRecord,
    RecordReason,
    Result,
    SeatEntry,
    Stakes,
    Street,
)

RANKS = "23456789TJQKA"
SUITS = "shdc"
DECK = [r + s for r in RANKS for s in SUITS]
STREETS = [Street.PREFLOP, Street.FLOP, Street.TURN, Street.RIVER]

type Emit = Callable[[Street, int, ActionKind, int | None, bool], None]


def uuid7(rng: random.Random) -> uuid.UUID:
    """A version-7 UUID drawn from ``rng`` (deterministic, unlike ``uuid.uuid7``)."""
    value = rng.getrandbits(128)
    value &= ~(0xF << 76)
    value |= 0x7 << 76  # version 7
    value &= ~(0x3 << 62)
    value |= 0x2 << 62  # RFC 9562 variant
    return uuid.UUID(int=value)


@dataclass
class Notes:
    """What the dealer knows about the hand it dealt."""

    rake: int | None  # None when the record ends at hero's fold
    hero_net: int
    pot_chips: int = 0  # everything committed, minus the uncalled bet
    min_raise_to: dict[int, int] = field(default_factory=dict)  # action index -> minimum
    bet_before: dict[int, int] = field(default_factory=dict)  # action index -> current bet
    implicit_folders: set[int] = field(default_factory=set)
    folded: set[int] = field(default_factory=set)


@dataclass
class _Seat:
    stack: int
    ante: int = 0
    live: int = 0
    street: int = 0
    folded: bool = False
    all_in: bool = False
    acted: bool = False
    faced: int = 0  # current bet the last time the seat acted
    full_raises_seen: int = 0  # full raises on this street when the seat last acted
    folded_facing_bet: bool = False


def deal(rng: random.Random, *, hero_folds: bool = False) -> tuple[HandRecord, Notes]:
    """Deal one random legal hand and return it with the dealer's notes.

    With ``hero_folds``, hero is one of the seats that folded (dealing again until one did).
    """
    n = rng.randint(2, 9)
    table_size = rng.randint(n, 10)
    dealt = sorted(rng.sample(range(1, table_size + 1), n))
    button = rng.choice(dealt)
    clockwise = [s for s in dealt if s > button] + [s for s in dealt if s <= button]

    big = rng.choice([2, 3, 5, 10])
    small = rng.choice([1, max(1, big // 2), big])
    straddles: list[int] = []
    if n >= 3 and rng.random() < 0.25:
        for _ in range(rng.randint(1, min(2, n - 2))):
            straddles.append(rng.choice([2, 3]) * (straddles[-1] if straddles else big))
    ante = None
    if rng.random() < 0.25:
        ante = Ante(kind=rng.choice(list(AnteKind)), chips=rng.randint(1, big))
    stakes = Stakes(
        small_blind_chips=small, big_blind_chips=big, straddles_chips=tuple(straddles), ante=ante
    )

    if n == 2:
        sb_seat, bb_seat, straddlers = button, clockwise[0], []
    else:
        sb_seat, bb_seat = clockwise[0], clockwise[1]
        straddlers = clockwise[2 : 2 + len(straddles)]

    forced = {sb_seat: small, bb_seat: big} | dict(zip(straddlers, straddles, strict=True))
    seats: dict[int, _Seat] = {}
    for s in dealt:
        need = forced.get(s, 0) + (ante.chips if ante else 0) + 1
        top = rng.choice([need + 5 * big, 40 * big, 150 * big])
        seats[s] = _Seat(stack=rng.randint(need, max(need, top)))

    actions: list[Action] = []
    notes = Notes(rake=0, hero_net=0)

    def record(street: Street, seat: int, kind: ActionKind, to: int | None, all_in: bool) -> None:
        actions.append(
            Action(street=street, seat=seat, kind=kind, amount_to_chips=to, all_in=all_in)
        )

    # Forced bets.
    if ante is not None:
        for s in clockwise if ante.kind is AnteKind.PER_PLAYER else [bb_seat]:
            seats[s].ante = ante.chips
            actions.append(
                Action(
                    street=Street.PREFLOP, seat=s, kind=ActionKind.POST_ANTE, ante_chips=ante.chips
                )
            )
    posts = [
        (sb_seat, ActionKind.POST_SMALL_BLIND, small),
        (bb_seat, ActionKind.POST_BIG_BLIND, big),
    ]
    posts += [(s, ActionKind.POST_STRADDLE, c) for s, c in zip(straddlers, straddles, strict=True)]
    for s, kind, chips in posts:
        seat = seats[s]
        seat.street = seat.live = chips
        seat.all_in = seat.ante + seat.live == seat.stack
        record(Street.PREFLOP, s, kind, chips, seat.all_in)

    last_forced = posts[-1][0]
    reached = [Street.PREFLOP]
    for street in STREETS:
        if street is not Street.PREFLOP:
            if sum(not x.folded for x in seats.values()) < 2:
                break
            reached.append(street)
        _betting_round(rng, street, clockwise, seats, last_forced, big, notes, record, actions)

    deck = DECK.copy()
    rng.shuffle(deck)
    in_hand = [s for s in dealt if not seats[s].folded]
    showdown = len(in_hand) >= 2
    board_cards = deck[2 * n : 2 * n + 5]
    flop = (board_cards[0], board_cards[1], board_cards[2])
    board = Board(
        flop=flop if showdown or Street.FLOP in reached else None,
        turn=board_cards[3] if showdown or Street.TURN in reached else None,
        river=board_cards[4] if showdown or Street.RIVER in reached else None,
    )

    won, rake = _award(rng, seats)
    folders = [s for s in dealt if seats[s].folded]
    if hero_folds and not folders:
        return deal(rng, hero_folds=True)
    hero = rng.choice(folders if hero_folds else dealt)
    entries = tuple(
        SeatEntry(
            seat=s,
            player_id=uuid7(rng) if rng.random() < 0.5 else None,
            starting_stack_chips=seats[s].stack,
            hole_cards=(deck[2 * i], deck[2 * i + 1]),
            showed=showdown and not seats[s].folded,
        )
        for i, s in enumerate(dealt)
    )
    uncalled_back = _uncalled(seats)
    hero_cost = seats[hero].ante + seats[hero].live - uncalled_back.get(hero, 0)
    notes.rake = rake
    notes.pot_chips = sum(x.ante + x.live for x in seats.values()) - sum(uncalled_back.values())
    notes.hero_net = won.get(hero, 0) - hero_cost
    notes.folded = {s for s in dealt if seats[s].folded}
    # Seats a client may leave out: their only own action is a preflop fold facing a bet.
    own = {s: [a for a in actions if a.seat == s and not a.kind.startswith("post")] for s in dealt}
    notes.implicit_folders = {
        s
        for s in dealt
        if s != hero
        and seats[s].folded_facing_bet
        and [(a.street, a.kind) for a in own[s]] == [(Street.PREFLOP, ActionKind.FOLD)]
    }
    hand = HandRecord(
        id=uuid7(rng),
        session_id=uuid7(rng),
        client_seq=rng.randint(0, 200),
        record_reason=rng.choice(list(RecordReason)),
        stakes=stakes,
        table_size=table_size,
        dealt_in_seats=tuple(dealt),
        button_seat=button,
        hero_seat=hero,
        seats=entries,
        board=board,
        actions=tuple(actions),
        results=tuple(Result(seat=s, won_chips=w) for s, w in sorted(won.items()) if w > 0),
    )
    return hand, notes


def _betting_round(
    rng: random.Random,
    street: Street,
    clockwise: list[int],
    seats: dict[int, _Seat],
    last_forced: int,
    big: int,
    notes: Notes,
    emit: Emit,
    actions: list[Action],
) -> None:
    if street is Street.PREFLOP:
        bet = max(x.street for x in seats.values())
        full = bet
        start = (clockwise.index(last_forced) + 1) % len(clockwise)
    else:
        for x in seats.values():
            x.street = 0
        bet, full, start = 0, big, 0
    for x in seats.values():
        x.acted = False
        x.full_raises_seen = 0
    full_raises = 0

    def active() -> list[int]:
        return [s for s in clockwise if not seats[s].folded and not seats[s].all_in]

    pending = set(active()) if len(active()) >= 2 else set()
    i = start
    while pending and sum(not x.folded for x in seats.values()) >= 2:
        s = clockwise[i % len(clockwise)]
        i += 1
        if s not in pending:
            continue
        pending.discard(s)
        me = seats[s]
        behind = me.stack - me.ante - me.live
        can_raise = (
            not me.acted or full_raises > me.full_raises_seen or bet - me.faced >= full
        ) and me.street + behind > bet
        min_to = bet + full if bet > 0 else full
        index = len(actions)
        notes.bet_before[index] = bet

        options = ["fold"] if me.street < bet else ["check"]
        if me.street < bet:
            options.append("call")
        if can_raise:
            options.append("raise")
        if me.street == bet and rng.random() < 0.05:
            options.append("fold")
        choice = rng.choice(options)

        me.acted = True
        me.faced = bet
        me.full_raises_seen = full_raises
        if choice == "fold":
            me.folded = True
            me.folded_facing_bet = me.street < bet
            emit(street, s, ActionKind.FOLD, None, False)
        elif choice == "check":
            emit(street, s, ActionKind.CHECK, None, False)
        elif choice == "call":
            to = min(bet, me.street + behind)
            me.live += to - me.street
            me.street = to
            me.all_in = me.ante + me.live == me.stack
            emit(street, s, ActionKind.CALL, to, me.all_in)
        else:
            top = me.street + behind
            if top < min_to or rng.random() < 0.15:
                to = top
            else:
                to = rng.choice([min_to, rng.randint(min_to, top), top])
            kind = ActionKind.BET if bet == 0 else ActionKind.RAISE
            if kind is ActionKind.RAISE:
                notes.min_raise_to[index] = min_to
            me.live += to - me.street
            me.street = to
            me.all_in = me.ante + me.live == me.stack
            me.faced = to
            if to - bet >= full:
                full = to - bet
                full_raises += 1
                me.full_raises_seen = full_raises
            bet = to
            pending = {x for x in active() if x != s}
            emit(street, s, kind, to, me.all_in)
        if len(active()) <= 1:
            pending = {x for x in pending if seats[x].street < bet}


def _uncalled(seats: dict[int, _Seat]) -> dict[int, int]:
    """Chips returned: the top live total's excess over the next one."""
    ranked = sorted(seats, key=lambda s: seats[s].live, reverse=True)
    excess = seats[ranked[0]].live - seats[ranked[1]].live
    return {ranked[0]: excess} if excess else {}


def _award(rng: random.Random, seats: dict[int, _Seat]) -> tuple[dict[int, int], int]:
    """Peel pots off the smallest remaining contribution and award each to random winners."""
    back = _uncalled(seats)
    remaining = {s: x.live - back.get(s, 0) for s, x in seats.items()}
    dead = sum(x.ante for x in seats.values())
    contenders = {s for s, x in seats.items() if not x.folded}
    won: dict[int, int] = {}
    rake = 0
    first = True
    while contenders:
        level = min(remaining[s] for s in contenders)
        pot = sum(min(v, level) for v in remaining.values())
        remaining = {s: v - min(v, level) for s, v in remaining.items()}
        if first:
            pot += dead
            take = rng.randint(0, min(pot - 1, 5)) if rng.random() < 0.5 else 0
            rake += take
            pot -= take
            first = False
        winners = sorted(rng.sample(sorted(contenders), rng.randint(1, len(contenders))))
        share, odd = divmod(pot, len(winners))
        for k, w in enumerate(winners):
            won[w] = won.get(w, 0) + share + (odd if k == 0 else 0)
        contenders = {s for s in contenders if remaining[s] > 0}
    # MATH.md §1.5, lemma: once the uncalled bet is back, no folded seat has chips left over.
    assert not any(remaining.values()), remaining
    return won, rake


def end_at_hero_fold(hand: HandRecord, notes: Notes) -> tuple[HandRecord, Notes]:
    """Cut a complete hand in which hero folded at hero's fold (record version 2).

    Kept: the actions up to and including hero's fold, the board cards dealt by then, every seat
    entry (villain cards may still be known). Dropped: later actions, later board cards, the
    results. Hero's net is the complete hand's: a folded seat wins nothing and gets nothing back.
    """
    cut = next(
        i
        for i, a in enumerate(hand.actions)
        if a.seat == hand.hero_seat and a.kind is ActionKind.FOLD
    )
    actions = hand.actions[: cut + 1]
    street = STREETS.index(actions[-1].street)
    board = Board(
        flop=hand.board.flop if street >= 1 else None,
        turn=hand.board.turn if street >= 2 else None,
        river=hand.board.river if street >= 3 else None,
    )
    folded = {a.seat for a in actions if a.kind is ActionKind.FOLD}
    record = hand.model_copy(
        update={"actions": actions, "board": board, "results": (), "ends_at_hero_fold": True}
    )
    return record, replace(
        notes,
        rake=None,
        pot_chips=0,
        folded=folded,
        implicit_folders=notes.implicit_folders & folded,
        min_raise_to={i: m for i, m in notes.min_raise_to.items() if i <= cut},
        bet_before={i: b for i, b in notes.bet_before.items() if i <= cut},
    )


def deal_any(rng: random.Random) -> tuple[HandRecord, Notes]:
    """A complete hand, or (three times in ten) one that ends at hero's fold."""
    if rng.random() < 0.3:
        return end_at_hero_fold(*deal(rng, hero_folds=True))
    return deal(rng)
