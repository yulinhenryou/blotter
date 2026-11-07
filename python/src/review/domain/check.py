"""Check a hand record against the rules and produce its canonical form.

``check`` replays the record through :class:`review.domain.rules.Betting`, computes the pots
(:mod:`review.domain.pots`) and either returns the canonical record (``docs/ARCHITECTURE.md``
§7.3: every seat, forced bet and fold explicit, derived fields filled) or the issues that make
the record invalid, each with the path of the offending field.

Paths refer to the record as it was given, so ``("actions", 7, "amount_to_chips")`` is the
eighth action the client sent, even if canonicalization inserts folds before it.
"""

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from typing import Never

from review.domain.pots import Pot, first_infeasible_prefix, return_uncalled, side_pots
from review.domain.record import (
    POSTS,
    STREETS,
    Action,
    ActionKind,
    Completeness,
    HandRecord,
    SeatEntry,
    Street,
)
from review.domain.rules import Betting, ForcedBet, forced_bets, seat_order

type Path = tuple[str | int, ...]
type _Add = Callable[[Path, str, str], None]

# Rule violations about an amount point at the amount field; all others at the action.
_FIELD_OF = {
    "missing_amount": "amount_to_chips",
    "wrong_call_amount": "amount_to_chips",
    "below_min_bet": "amount_to_chips",
    "below_min_raise": "amount_to_chips",
    "raise_not_above_bet": "amount_to_chips",
    "exceeds_stack": "amount_to_chips",
    "all_in_mismatch": "all_in",
}


@dataclass(frozen=True)
class Issue:
    """One reason a record is invalid."""

    path: Path
    code: str
    message: str

    @property
    def location(self) -> str:
        """The path as text, e.g. ``actions[7].amount_to_chips``."""
        text = ""
        for part in self.path:
            text += f"[{part}]" if isinstance(part, int) else (f".{part}" if text else part)
        return text


@dataclass(frozen=True)
class CheckResult:
    """The outcome of :func:`check`: a canonical record, or the issues (never both)."""

    record: HandRecord | None
    issues: tuple[Issue, ...]
    pots: tuple[Pot, ...] = ()

    @property
    def ok(self) -> bool:
        """Whether the record is valid."""
        return not self.issues


class _StopError(Exception):
    """Raised inside the replay at the first rule violation; the replay cannot continue."""

    def __init__(self, issue: Issue) -> None:
        super().__init__(issue.message)
        self.issue = issue


def check(record: HandRecord) -> CheckResult:
    """Check ``record`` and return its canonical form or the issues found.

    Structural issues (seats, cards, field combinations) are all reported together. The replay
    of the betting stops at the first violation, since what follows it has no defined meaning.
    """
    issues = _structure(record)
    if issues:
        return CheckResult(None, tuple(issues))
    try:
        return _replay(record)
    except _StopError as stop:
        return CheckResult(None, (stop.issue,))


# --- Structure -------------------------------------------------------------------------------


def _structure(r: HandRecord) -> list[Issue]:
    issues: list[Issue] = []

    def add(path: Path, code: str, message: str) -> None:
        issues.append(Issue(path, code, message))

    dealt = set(r.dealt_in_seats)
    for i, seat in enumerate(r.dealt_in_seats):
        if seat > r.table_size:
            add(("dealt_in_seats", i), "seat_out_of_range", f"seat {seat} > {r.table_size}")
    for seat, n in Counter(r.dealt_in_seats).items():
        if n > 1:
            add(("dealt_in_seats",), "duplicate_seat", f"seat {seat} is listed {n} times")
    if len(dealt) < 2:
        add(("dealt_in_seats",), "too_few_seats", "at least two seats must be dealt in")
    if r.button_seat not in dealt:
        add(("button_seat",), "seat_not_dealt_in", "the button must be dealt in")

    entries: dict[int, SeatEntry] = {}
    for i, entry in enumerate(r.seats):
        if entry.seat not in dealt:
            add(("seats", i, "seat"), "seat_not_dealt_in", f"seat {entry.seat} is not dealt in")
        if entry.seat in entries:
            add(("seats", i, "seat"), "duplicate_seat", f"seat {entry.seat} appears twice")
        entries[entry.seat] = entry
    hero = entries.get(r.hero_seat)
    if r.hero_seat not in dealt:
        add(("hero_seat",), "seat_not_dealt_in", "hero's seat must be dealt in")
    elif hero is None or hero.hole_cards is None:
        add(("hero_seat",), "hero_cards_unknown", "hero's seat needs an entry with hole cards")

    stakes = r.stakes
    if stakes.small_blind_chips > stakes.big_blind_chips:
        add(("stakes", "small_blind_chips"), "blinds_out_of_order", "small blind > big blind")
    previous = stakes.big_blind_chips
    for i, chips in enumerate(stakes.straddles_chips):
        if chips < 2 * previous:
            add(
                ("stakes", "straddles_chips", i),
                "straddle_too_small",
                f"a straddle is at least twice the previous forced bet ({2 * previous})",
            )
        previous = chips
    if stakes.straddles_chips and len(stakes.straddles_chips) > len(dealt) - 2:
        add(("stakes", "straddles_chips"), "too_many_straddles", "more straddles than seats")

    if r.board.turn is not None and r.board.flop is None:
        add(("board", "turn"), "board_out_of_order", "a turn card needs a flop")
    if r.board.river is not None and r.board.turn is None:
        add(("board", "river"), "board_out_of_order", "a river card needs a turn")
    _cards(r, add)

    for i, action in enumerate(r.actions):
        if action.seat not in dealt:
            add(("actions", i, "seat"), "seat_not_dealt_in", f"seat {action.seat} is not dealt in")
        _action_fields(i, action, add)
        if i and STREETS.index(action.street) < STREETS.index(r.actions[i - 1].street):
            add(("actions", i, "street"), "street_out_of_order", "actions must be in street order")

    seen: set[int] = set()
    for i, result in enumerate(r.results):
        if result.seat not in dealt:
            add(("results", i, "seat"), "seat_not_dealt_in", f"seat {result.seat} is not dealt in")
        if result.seat in seen:
            add(("results", i, "seat"), "duplicate_seat", f"seat {result.seat} appears twice")
        seen.add(result.seat)
    if not r.results:
        add(("results",), "no_results", "every hand has a winner")
    return issues


def _cards(r: HandRecord, add: _Add) -> None:
    places: list[tuple[Path, str]] = []
    for i, entry in enumerate(r.seats):
        for j, card in enumerate(entry.hole_cards or ()):
            places.append((("seats", i, "hole_cards", j), card))
    for j, card in enumerate(r.board.flop or ()):
        places.append((("board", "flop", j), card))
    for name, single in (("turn", r.board.turn), ("river", r.board.river)):
        if single is not None:
            places.append((("board", name), single))
    first: dict[str, Path] = {}
    for path, card in places:
        if card in first:
            used = Issue(first[card], "", "").location
            add(path, "duplicate_card", f"{card} is already used at {used}")
        else:
            first[card] = path


def _action_fields(i: int, action: Action, add: _Add) -> None:
    kind = action.kind
    if kind is ActionKind.POST_ANTE:
        if action.ante_chips is None:
            add(("actions", i, "ante_chips"), "missing_amount", "an ante post needs ante_chips")
        if action.amount_to_chips is not None:
            add(("actions", i, "amount_to_chips"), "unexpected_amount", "antes use ante_chips")
        return
    if action.ante_chips is not None:
        add(("actions", i, "ante_chips"), "unexpected_amount", "only ante posts have ante_chips")
    if kind in (ActionKind.FOLD, ActionKind.CHECK) and action.amount_to_chips is not None:
        add(("actions", i, "amount_to_chips"), "unexpected_amount", f"a {kind} has no amount")
    needs_amount = kind in POSTS or kind in (ActionKind.BET, ActionKind.RAISE)
    if needs_amount and action.amount_to_chips is None:
        add(("actions", i, "amount_to_chips"), "missing_amount", f"a {kind} needs amount_to_chips")


# --- Replay ----------------------------------------------------------------------------------


def _replay(r: HandRecord) -> CheckResult:
    order = seat_order(r.dealt_in_seats, r.button_seat)
    entries = {e.seat: e for e in r.seats}
    stacks = {s: (entries[s].starting_stack_chips if s in entries else None) for s in order}
    betting = Betting.start(order, r.stakes.big_blind_chips, stacks)
    out: list[Action] = []

    # Forced bets: either all omitted (derived from the stakes) or all given, first, in order.
    n_given = 0
    while n_given < len(r.actions) and r.actions[n_given].kind in POSTS:
        n_given += 1
    given = r.actions[:n_given]
    for i, action in enumerate(r.actions[n_given:], start=n_given):
        if action.kind in POSTS:
            _stop(("actions", i), "post_out_of_place", "forced bets come before all other actions")
    expected = forced_bets(r.stakes, r.dealt_in_seats, r.button_seat)
    if given and len(given) != len(expected):
        _stop(("actions",), "posts_mismatch", f"expected {len(expected)} forced bets")
    seat_index = {e.seat: i for i, e in enumerate(r.seats)}
    for i, forced in enumerate(expected):
        if given and _describe(given[i]) != (forced.seat, forced.kind, forced.chips):
            _stop(
                ("actions", i),
                "posts_mismatch",
                f"expected {forced.kind} of {forced.chips} by seat {forced.seat}",
            )
        violation = betting.post(forced, given[i].all_in if given else None)
        if violation is not None:
            stack: Path = ("seats", seat_index.get(forced.seat, 0), "starting_stack_chips")
            _stop(("actions", i) if given else stack, violation.code, violation.message)
        out.append(_post_action(forced, betting, given[i] if given else None))

    # Seats that may be folded implicitly: no action of their own in the input, not hero.
    entered = {a.seat for a in r.actions if a.kind not in POSTS}

    def implicit(seat: int) -> bool:
        state = betting.seats[seat]
        return (
            seat not in entered
            and seat != r.hero_seat
            and betting.street is Street.PREFLOP
            and state.street < betting.bet
        )

    def fold(seat: int) -> None:
        betting.apply(seat, ActionKind.FOLD, None, False)
        out.append(Action(street=betting.street, seat=seat, kind=ActionKind.FOLD))

    for i, action in enumerate(r.actions[n_given:], start=n_given):
        while True:
            if betting.hand_over():
                _stop(("actions", i), "hand_over", "the hand was already over")
            seat = betting.next_to_act()
            if seat is None:
                if betting.street is Street.RIVER:
                    _stop(("actions", i), "hand_over", "the river betting was already over")
                betting.next_street()
                continue
            if STREETS.index(action.street) < STREETS.index(betting.street):
                _stop(("actions", i, "street"), "street_closed", f"the {action.street} is over")
            if seat == action.seat and action.street is betting.street:
                break
            if implicit(seat):
                fold(seat)
                continue
            if action.street is not betting.street:
                _stop(
                    ("actions", i),
                    "missing_action",
                    f"seat {seat} has no action on the {betting.street}",
                )
            state = betting.seats[action.seat]
            if state.folded:
                _stop(("actions", i, "seat"), "seat_folded", f"seat {action.seat} has folded")
            if state.all_in:
                _stop(("actions", i, "seat"), "seat_all_in", f"seat {action.seat} is all-in")
            _stop(("actions", i, "seat"), "out_of_turn", f"it is seat {seat}'s turn")
        out.append(_play(i, action, betting))

    while not betting.hand_over():
        seat = betting.next_to_act()
        if seat is None:
            if betting.street is Street.RIVER:
                break
            betting.next_street()
        elif implicit(seat):
            fold(seat)
        else:
            _stop(
                ("actions",), "missing_action", f"seat {seat} has no action on the {betting.street}"
            )

    _check_board(r, betting)
    return _settle(r, betting, out)


def _describe(action: Action) -> tuple[int, ActionKind, int | None]:
    chips = action.ante_chips if action.kind is ActionKind.POST_ANTE else action.amount_to_chips
    return action.seat, action.kind, chips


def _post_action(forced: ForcedBet, betting: Betting, given: Action | None) -> Action:
    ante = forced.kind is ActionKind.POST_ANTE
    return Action(
        street=Street.PREFLOP,
        seat=forced.seat,
        kind=forced.kind,
        amount_to_chips=None if ante else forced.chips,
        ante_chips=forced.chips if ante else None,
        all_in=False if ante else betting.seats[forced.seat].all_in,
        amount_approximate=given.amount_approximate if given else False,
    )


def _play(i: int, action: Action, betting: Betting) -> Action:
    state = betting.seats[action.seat]
    amount = action.amount_to_chips
    if action.kind is ActionKind.CALL and amount is None:
        # A call's amount may be omitted: it is the current bet, or everything if all-in.
        behind = state.behind
        if not action.all_in:
            amount = betting.bet
        elif behind is not None:
            amount = state.street + behind
        else:
            _stop(
                ("actions", i, "amount_to_chips"),
                "missing_amount",
                "an all-in call with an unknown stack needs amount_to_chips",
            )
    violation = betting.violation(action.seat, action.kind, amount, action.all_in)
    if violation is not None:
        field = _FIELD_OF.get(violation.code)
        _stop(("actions", i, field) if field else ("actions", i), violation.code, violation.message)
    betting.apply(action.seat, action.kind, amount, action.all_in)
    return action.model_copy(update={"amount_to_chips": amount})


def _check_board(r: HandRecord, betting: Betting) -> None:
    shown_down = len(betting.non_folded()) >= 2
    reached = set(betting.reached) | (set(STREETS) if shown_down else set())
    cards = {Street.FLOP: r.board.flop, Street.TURN: r.board.turn, Street.RIVER: r.board.river}
    for street, card in cards.items():
        if street in reached and card is None:
            _stop(("board", street.value), "missing_board_card", f"the {street} was dealt")
        if street not in reached and card is not None:
            _stop(("board", street.value), "board_card_not_reached", f"the {street} was not dealt")


def _settle(r: HandRecord, betting: Betting, actions: list[Action]) -> CheckResult:
    seats = betting.seats
    folded = {s for s, state in seats.items() if state.folded}
    live, _, _ = return_uncalled({s: state.live for s, state in seats.items()})
    antes = {s: state.ante for s, state in seats.items()}
    pots = side_pots(antes, live, folded)
    won = {res.seat: res.won_chips for res in r.results}
    for i, res in enumerate(r.results):
        if res.seat in folded:
            _stop(("results", i, "won_chips"), "folded_seat_won", f"seat {res.seat} folded")
    j = first_infeasible_prefix(pots, won)
    if j is not None:
        last_pot = {s: k for k, pot in enumerate(pots, start=1) for s in pot.eligible}
        i = next(i for i, res in enumerate(r.results) if last_pot[res.seat] <= j)
        if j == len(pots):
            _stop(
                ("results", i, "won_chips"), "results_exceed_pot", "more chips won than in the pot"
            )
        _stop(
            ("results", i, "won_chips"),
            "results_infeasible",
            f"seats eligible only for pots 1..{j} win more than those pots hold",
        )

    entries = {e.seat: e for e in r.seats}
    canonical_seats = []
    for s in sorted(r.dealt_in_seats):
        entry = entries.get(s, SeatEntry(seat=s))
        if entry.starting_stack_chips is None and seats[s].all_in:
            # All-in with an unknown stack: the stack is what it committed (MATH.md §1.5).
            entry = entry.model_copy(update={"starting_stack_chips": seats[s].ante + seats[s].live})
        canonical_seats.append(entry)

    rake = sum(p.chips for p in pots) - sum(won.values())
    hero_net = won.get(r.hero_seat, 0) - antes[r.hero_seat] - live[r.hero_seat]
    involved = {r.hero_seat} | {
        a.seat for a in actions if a.kind in (ActionKind.CALL, ActionKind.BET, ActionKind.RAISE)
    }
    involved |= {a.seat for a in actions if a.street is not Street.PREFLOP}
    completeness = Completeness(
        villain_cards_unknown=any(
            entries.get(s, SeatEntry(seat=s)).hole_cards is None
            for s in betting.non_folded()
            if s != r.hero_seat
        ),
        stacks_approximate=any(
            e.starting_stack_chips is None or e.stack_approximate
            for e in canonical_seats
            if e.seat in involved
        ),
        amounts_approximate=any(a.amount_approximate for a in actions),
    )
    canonical = r.model_copy(
        update={
            "dealt_in_seats": tuple(sorted(r.dealt_in_seats)),
            "seats": tuple(canonical_seats),
            "actions": tuple(actions),
            "results": tuple(sorted(r.results, key=lambda res: res.seat)),
            "completeness": completeness,
            "rake_chips": rake,
            "hero_net_chips": hero_net,
        }
    )
    return CheckResult(canonical, (), tuple(pots))


def _stop(path: Path, code: str, message: str) -> Never:
    raise _StopError(Issue(path, code, message))
