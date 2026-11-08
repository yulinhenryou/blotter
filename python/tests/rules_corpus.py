"""The rules corpus: hands and the Python rules' answers, for the TypeScript rules (M4a Task 4).

The phone reimplements ``docs/MATH.md`` §1.5 in TypeScript (``web/src/rules/``, ADR-0028). This
module writes what the Python implementation says about a fixed set of hands, so a Vitest test
can replay the same hands through the TypeScript code and compare.
``scripts/export_rules_corpus.py`` writes the file; ``test_rules_corpus.py`` fails if the
committed file is stale.

The hands come from the independent dealer (``dealer.py``) with a fixed seed, plus the worked
examples of ``MATH.md`` §1.5 (``test_domain_examples.py``). Each hand goes through
:func:`review.domain.check` first; the corpus holds its canonical actions (every forced bet and
fold explicit). For each action it records the state before it, as the Python
:class:`~review.domain.rules.Betting` sees it: the street, the seat to act, the current bet and
full-raise size, the legal actions with their minimum and maximum amounts, and a few probe
actions with the violation code Python gives them (``None`` if legal). At the end: the streets
reached, every seat's chips, the uncalled bet, the pots, hero's net, the rake, and probe results
with the first infeasible prefix of the pots.

The legal actions are read off ``Betting.violation`` by trying amounts, not computed by a second
formula here, so they are the checker's answers. A third of the dealer's hands have some villain
stacks removed (unknown), as on the phone; hero's stack is always known (``docs/CAPTURE.md``).
"""

import json
import random
from typing import Any

from dealer import deal_any
from test_domain_examples import example_1, example_2, example_3, example_4

from review.domain import HandRecord, check
from review.domain.pots import first_infeasible_prefix, return_uncalled, side_pots
from review.domain.record import POSTS, Action, ActionKind, Street
from review.domain.rules import Betting, forced_bets, seat_order

SEED = 20261108
DEALT_HANDS = 200
PROBES_PER_STEP = 4

K = ActionKind
type Json = dict[str, Any]


def build() -> list[Json]:
    """Every corpus case, in a fixed order."""
    rng = random.Random(SEED)
    cases = [_case(name, hand, rng) for name, hand in _examples()]
    for n in range(DEALT_HANDS):
        hand, _ = deal_any(rng)
        if rng.random() < 1 / 3:
            hand = _forget_stacks(hand, rng)
        cases.append(_case(f"dealer-{n:03d}", hand, rng))
    return cases


def dumps(cases: list[Json]) -> str:
    """One case per line: stable, and a change shows up as a readable diff."""
    lines = [json.dumps(case, separators=(",", ":")) for case in cases]
    return "[\n" + ",\n".join(lines) + "\n]\n"


def _examples() -> list[tuple[str, HandRecord]]:
    f = Street.FLOP
    cut_4 = example_4(None, 203).model_copy(update={"results": (), "ends_at_hero_fold": True})
    return [
        ("math-1.5-example-1", example_1(150, 135)),
        (
            "math-1.5-example-2",
            example_2(Action(street=f, seat=1, kind=K.CALL, amount_to_chips=150)),
        ),
        ("math-1.5-example-3", example_3(310)),
        ("math-1.5-example-4", example_4(None, 203)),
        ("math-1.5-example-4-cut-at-hero-fold", cut_4),
    ]


def _forget_stacks(hand: HandRecord, rng: random.Random) -> HandRecord:
    """Make some villain stacks unknown, except where a forced bet put the seat all-in."""
    posted_all_in = {a.seat for a in hand.actions if a.kind in POSTS and a.all_in}
    seats = tuple(
        e.model_copy(update={"starting_stack_chips": None})
        if e.seat != hand.hero_seat and e.seat not in posted_all_in and rng.random() < 0.5
        else e
        for e in hand.seats
    )
    return hand.model_copy(update={"seats": seats})


def _case(name: str, hand: HandRecord, rng: random.Random) -> Json:
    result = check(hand)
    assert result.ok and result.record is not None, (name, result.issues)
    record = result.record
    given = {e.seat: e.starting_stack_chips for e in hand.seats}
    stacks = {s: given.get(s) for s in record.dealt_in_seats}

    order = seat_order(record.dealt_in_seats, record.button_seat)
    betting = Betting.start(order, record.stakes.big_blind_chips, stacks)
    forced = forced_bets(record.stakes, record.dealt_in_seats, record.button_seat)
    for bet in forced:
        assert betting.post(bet) is None, name

    steps: list[Json] = []
    played = [a for a in record.actions if a.kind not in POSTS]
    for action in played:
        seat = _advance(betting)
        assert seat == action.seat and betting.street is action.street, name
        steps.append(_step(betting, seat, rng))
        amount, all_in = action.amount_to_chips, action.all_in
        assert betting.violation(seat, action.kind, amount, all_in) is None, name
        betting.apply(seat, action.kind, amount, all_in)

    if not record.ends_at_hero_fold:
        while not betting.hand_over() and _advance(betting) is not None:
            raise AssertionError(f"{name}: a seat has no action")

    return {
        "name": name,
        "setup": {
            "stakes": record.stakes.model_dump(mode="json"),
            "dealt_in_seats": list(record.dealt_in_seats),
            "button_seat": record.button_seat,
            "hero_seat": record.hero_seat,
            "stacks": [{"seat": s, "chips": stacks[s]} for s in record.dealt_in_seats],
            "ends_at_hero_fold": record.ends_at_hero_fold,
        },
        "forced": [{"seat": b.seat, "kind": b.kind.value, "chips": b.chips} for b in forced],
        "actions": [a.model_dump(mode="json", exclude_defaults=True) for a in played],
        "steps": steps,
        "end": _end(record, betting, result.pots, rng),
    }


def _advance(betting: Betting) -> int | None:
    """The seat to act, starting later streets as ``check`` does; ``None`` when the hand ends."""
    while not betting.hand_over():
        seat = betting.next_to_act()
        if seat is not None:
            return seat
        if betting.street is Street.RIVER:
            return None
        betting.next_street()
    return None


def _step(betting: Betting, seat: int, rng: random.Random) -> Json:
    state = betting.seats[seat]
    behind = state.behind
    top = None if behind is None else state.street + behind
    bet, full = betting.bet, betting.full_raise

    def ok(kind: ActionKind, amount: int | None, all_in: bool) -> bool:
        return betting.violation(seat, kind, amount, all_in) is None

    assert ok(K.FOLD, None, False)
    call: Json | None = None
    if ok(K.CALL, bet, False):
        call = {"to": bet, "all_in": False if behind is not None else None}
    elif top is not None and ok(K.CALL, top, True):
        call = {"to": top, "all_in": True}

    sizes: dict[str, Json | None] = {}
    for kind, least in ((K.BET, full), (K.RAISE, bet + full)):
        size: Json | None = None
        if top is None:
            if ok(kind, least, False):
                assert not ok(kind, least - 1, False)
                size = {"min": least, "max": None}
        elif ok(kind, top, True):
            if top > least:
                assert ok(kind, least, False) and not ok(kind, least - 1, False)
                assert not ok(kind, top, False)  # the whole stack is an all-in
                size = {"min": least, "max": top}
            else:
                size = {"min": top, "max": top}  # all-in only
        sizes[kind.value] = size

    return {
        "street": betting.street.value,
        "to_act": seat,
        "bet": bet,
        "full_raise": full,
        "legal": {"check": ok(K.CHECK, None, False), "call": call, **sizes},
        "probes": _probes(betting, seat, top, rng),
    }


def _probes(betting: Betting, seat: int, top: int | None, rng: random.Random) -> list[Json]:
    bet, full = betting.bet, betting.full_raise
    near = {bet, bet + full, full} | ({top} if top is not None else set())
    amounts = sorted({a + d for a in near for d in (-1, 0, 1) if a + d >= 1})
    grid: list[tuple[ActionKind, int | None, bool]] = [
        (kind, None, all_in) for kind in (K.FOLD, K.CHECK) for all_in in (False, True)
    ]
    grid += [
        (kind, a, all_in)
        for kind in (K.CALL, K.BET, K.RAISE)
        for a in amounts
        for all_in in (False, True)
    ]
    probes = []
    for kind, amount, all_in in rng.sample(grid, PROBES_PER_STEP):
        violation = betting.violation(seat, kind, amount, all_in)
        probes.append(
            {
                "kind": kind.value,
                "amount_to_chips": amount,
                "all_in": all_in,
                "code": None if violation is None else violation.code,
            }
        )
    return probes


def _end(record: HandRecord, betting: Betting, pots: Any, rng: random.Random) -> Json:
    seats = betting.seats
    end: Json = {
        "street": betting.street.value,
        "reached": [s.value for s in betting.reached],
        "hand_over": betting.hand_over(),
        "seats": [
            {
                "seat": s,
                "ante": seats[s].ante,
                "live": seats[s].live,
                "folded": seats[s].folded,
                "all_in": seats[s].all_in,
            }
            for s in record.dealt_in_seats
        ],
        "hero_net": record.hero_net_chips,
        "rake": record.rake_chips,
    }
    if record.ends_at_hero_fold:
        return end

    folded = {s for s, st in seats.items() if st.folded}
    live, back_to, back = return_uncalled({s: st.live for s, st in seats.items()})
    computed = side_pots({s: st.ante for s, st in seats.items()}, live, folded)
    assert computed == list(pots)
    won = {r.seat: r.won_chips for r in record.results}
    variants = [won]
    some = rng.choice(sorted(won))
    variants.append(won | {some: won[some] + 1})
    others = [s for s in sorted(seats) if s not in folded and s != some]
    if others:
        other = rng.choice(others)
        variants.append(won | {some: won[some] - 1, other: won.get(other, 0) + 1})
    end |= {
        "uncalled": None if back_to is None else {"seat": back_to, "chips": back},
        "pots": [{"chips": p.chips, "eligible": sorted(p.eligible)} for p in pots],
        "results": [{"seat": r.seat, "won_chips": r.won_chips} for r in record.results],
        "result_probes": [
            {
                "won": [{"seat": s, "chips": w} for s, w in sorted(v.items())],
                "first_infeasible_prefix": first_infeasible_prefix(list(pots), v),
            }
            for v in variants
        ],
    }
    return end
