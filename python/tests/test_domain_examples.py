"""The worked examples of docs/MATH.md §1.5 as exact fixtures, plus small rule cases."""

import uuid
from typing import Any

import pytest

from review.domain import HandRecord, check
from review.domain.record import Action, ActionKind, Ante, AnteKind, Board, Stakes, Street

A = ActionKind
P, F, T, R = Street.PREFLOP, Street.FLOP, Street.TURN, Street.RIVER
ID = uuid.UUID("01a1b3b0-1800-75a7-9d58-ba03ac1df3d1")
FULL_BOARD = Board(flop=("2c", "7d", "Ks"), turn="Th", river="3s")


def act(street: Street, seat: int, kind: ActionKind, to: int | None = None, **kw: Any) -> Action:
    return Action(street=street, seat=seat, kind=kind, amount_to_chips=to, **kw)


def hand(**fields: Any) -> HandRecord:
    base: dict[str, Any] = {
        "id": ID,
        "session_id": ID,
        "client_seq": 0,
        "record_reason": "notable",
        "stakes": Stakes(small_blind_chips=1, big_blind_chips=2),
    }
    return HandRecord.model_validate(base | fields)


def seat(n: int, stack: int | None, cards: tuple[str, str] | None = None) -> dict[str, Any]:
    return {"seat": n, "starting_stack_chips": stack, "hole_cards": cards}


# --- Example 1: three-way all-in, one side pot ------------------------------------------------


def example_1(won_a: int, won_c: int) -> HandRecord:
    # Seat 1 = A (button, 50), seat 2 = B (small blind, 120), seat 3 = C (big blind, 200).
    return hand(
        table_size=3,
        dealt_in_seats=(1, 2, 3),
        button_seat=1,
        hero_seat=3,
        seats=(seat(1, 50), seat(2, 120), seat(3, 200, ("Ah", "Ad"))),
        board=FULL_BOARD,
        actions=(
            act(P, 1, A.RAISE, 50, all_in=True),
            act(P, 2, A.RAISE, 120, all_in=True),
            act(P, 3, A.CALL, 120),
        ),
        results=({"seat": 1, "won_chips": won_a}, {"seat": 3, "won_chips": won_c}),
    )


def test_example_1_pots_rake_and_nets() -> None:
    result = check(example_1(150, 135))
    assert result.ok, result.issues
    assert [(p.chips, sorted(p.eligible)) for p in result.pots] == [(150, [1, 2, 3]), (140, [2, 3])]
    assert result.record is not None
    assert result.record.rake_chips == 5
    assert result.record.hero_net_chips == 15  # C: wins 135, committed 120


def test_example_1_results_that_overdraw_the_main_pot_are_rejected() -> None:
    result = check(example_1(160, 130))
    assert [(i.code, i.path) for i in result.issues] == [
        ("results_infeasible", ("results", 0, "won_chips"))
    ]


# --- Examples 2 and 3: short all-ins and raise rights -----------------------------------------
# MATH.md uses three players on the flop; the fixtures add a fourth (seat 4, the button) who
# calls along, so that a re-raise in Example 3 has someone left to call it.


def flop_spot(stack_3: int, flop_actions: tuple[Action, ...], won: int) -> HandRecord:
    later: tuple[Action, ...] = (
        act(T, 1, A.CHECK),
        act(T, 4, A.CHECK),
        act(R, 1, A.CHECK),
        act(R, 4, A.CHECK),
    )
    if stack_3 == 1000:  # Example 2: seat 3 is not all-in and keeps checking
        later = (
            act(T, 1, A.CHECK),
            act(T, 3, A.CHECK),
            act(T, 4, A.CHECK),
            act(R, 1, A.CHECK),
            act(R, 3, A.CHECK),
            act(R, 4, A.CHECK),
        )
    return hand(
        table_size=4,
        dealt_in_seats=(1, 2, 3, 4),
        button_seat=4,
        hero_seat=1,
        seats=(seat(1, 1000, ("Ah", "Ad")), seat(2, 152), seat(3, stack_3), seat(4, 1000)),
        board=FULL_BOARD,
        actions=(
            act(P, 3, A.CALL, 2),
            act(P, 4, A.CALL, 2),
            act(P, 1, A.CALL, 2),
            act(P, 2, A.CHECK),
            *flop_actions,
            *later,
        ),
        results=({"seat": 1, "won_chips": won},),
    )


def example_2(last: Action) -> HandRecord:
    return flop_spot(
        1000,
        (
            act(F, 1, A.BET, 100),
            act(F, 2, A.RAISE, 150, all_in=True),  # 50 < 100: not a full raise
            act(F, 3, A.CALL, 150),
            act(F, 4, A.CALL, 150),
            last,
        ),
        won=608,
    )


def test_example_2_calling_the_short_all_in_is_legal() -> None:
    result = check(example_2(act(F, 1, A.CALL, 150)))
    assert result.ok, result.issues
    assert [(p.chips, sorted(p.eligible)) for p in result.pots] == [(608, [1, 2, 3, 4])]


def test_example_2_raising_is_not_reopened() -> None:
    result = check(example_2(act(F, 1, A.RAISE, 400)))
    assert [(i.code, i.path) for i in result.issues] == [("no_raise_rights", ("actions", 8))]


def example_3(raise_to: int) -> HandRecord:
    return flop_spot(
        212,
        (
            act(F, 1, A.BET, 100),
            act(F, 2, A.RAISE, 150, all_in=True),
            act(F, 3, A.RAISE, 210, all_in=True),  # 60 < 100: not full either
            act(F, 4, A.CALL, 210),
            act(F, 1, A.RAISE, raise_to),  # faces 110 >= 100: reopened
            act(F, 4, A.CALL, raise_to),
        ),
        won=988,
    )


def test_example_3_two_short_all_ins_reopen_the_betting() -> None:
    result = check(example_3(310))
    assert result.ok, result.issues
    assert [(p.chips, sorted(p.eligible)) for p in result.pots] == [
        (608, [1, 2, 3, 4]),
        (180, [1, 3, 4]),
        (200, [1, 4]),
    ]


def test_example_3_minimum_reraise_is_the_last_full_raise() -> None:
    result = check(example_3(300))
    assert [(i.code, i.path) for i in result.issues] == [
        ("below_min_raise", ("actions", 8, "amount_to_chips"))
    ]


# --- Example 4: uncalled bet ------------------------------------------------------------------


def example_4(ante: Ante | None, won: int) -> HandRecord:
    # Seats 1 (small blind), 2 (big blind), 3 = F, 4 = G (button, 500).
    return hand(
        stakes=Stakes(small_blind_chips=1, big_blind_chips=2, ante=ante),
        table_size=4,
        dealt_in_seats=(1, 2, 3, 4),
        button_seat=4,
        hero_seat=3,
        seats=(seat(3, 1000, ("Qs", "Qh")), seat(4, 500)),
        actions=(
            act(P, 3, A.RAISE, 100),
            act(P, 4, A.RAISE, 500, all_in=True),
            act(P, 1, A.FOLD),
            act(P, 2, A.FOLD),
            act(P, 3, A.FOLD),
        ),
        results=({"seat": 4, "won_chips": won},),
    )


def test_example_4_uncalled_bet_is_returned() -> None:
    result = check(example_4(None, 203))
    assert result.ok, result.issues
    assert [(p.chips, sorted(p.eligible)) for p in result.pots] == [(203, [4])]
    assert result.record is not None
    assert result.record.rake_chips == 0
    assert result.record.hero_net_chips == -100


def test_example_4_big_blind_ante_goes_into_the_main_pot() -> None:
    result = check(example_4(Ante(kind=AnteKind.BIG_BLIND, chips=2), 205))
    assert result.ok, result.issues
    assert [p.chips for p in result.pots] == [205]


# --- Hands that end at hero's fold (record version 2, MATH.md §1.5) ---------------------------


def test_example_4_cut_at_hero_fold_keeps_hero_net_and_drops_the_rake() -> None:
    cut = example_4(None, 203).model_copy(update={"results": (), "ends_at_hero_fold": True})
    result = check(cut)
    assert result.ok, result.issues
    assert result.record is not None
    assert result.record.hero_net_chips == -100  # as in the complete hand
    assert result.record.rake_chips is None
    assert result.pots == ()


def test_section_5_1_example_cut_at_a_flop_fold() -> None:
    # MATH.md §5.1 worked example (live 1/3, nine dealt in, hero on the button), but hero folds
    # to UTG's flop bet and stops recording. Seats: UTG 1 ... CO 6, BTN 7 (hero), SB 8, BB 9.
    cut = hand(
        stakes=Stakes(small_blind_chips=1, big_blind_chips=3),
        table_size=9,
        dealt_in_seats=tuple(range(1, 10)),
        button_seat=7,
        hero_seat=7,
        seats=(seat(1, 300), seat(7, 300, ("Qh", "Jh")), seat(9, 300)),
        board=Board(flop=("Ks", "7d", "2c")),
        actions=(
            act(P, 1, A.RAISE, 15),
            act(P, 7, A.CALL, 15),
            act(P, 8, A.FOLD),
            act(P, 9, A.CALL, 15),
            act(F, 9, A.CHECK),
            act(F, 1, A.BET, 30),
            act(F, 7, A.FOLD),
        ),
        ends_at_hero_fold=True,
    )
    result = check(cut)
    assert result.ok, result.issues
    record = result.record
    assert record is not None
    assert record.hero_net_chips == -15
    assert record.rake_chips is None
    assert record.results == ()
    # Posts and the folds of seats 2-6 are made explicit; nothing after hero's fold is added.
    assert [(a.seat, a.kind) for a in record.actions[-3:]] == [
        (9, A.CHECK),
        (1, A.BET),
        (7, A.FOLD),
    ]
    assert len(record.actions) == 2 + 5 + 4 + 3  # posts, implicit folds, preflop, flop
    assert record.completeness is not None
    assert record.completeness.villain_cards_unknown  # UTG and BB are still in, cards unseen


# --- Smaller rule cases -----------------------------------------------------------------------


def test_heads_up_button_posts_small_blind_and_acts_first_preflop_last_after() -> None:
    record = hand(
        table_size=2,
        dealt_in_seats=(1, 2),
        button_seat=1,
        hero_seat=1,
        seats=(seat(1, 100, ("As", "Kd")), seat(2, 100)),
        board=FULL_BOARD,
        actions=(
            act(P, 1, A.CALL, 2),  # button = small blind, first preflop
            act(P, 2, A.CHECK),
            act(F, 2, A.CHECK),  # big blind first after the flop
            act(F, 1, A.CHECK),
            act(T, 2, A.CHECK),
            act(T, 1, A.CHECK),
            act(R, 2, A.CHECK),
            act(R, 1, A.CHECK),
        ),
        results=({"seat": 1, "won_chips": 4},),
    )
    result = check(record)
    assert result.ok, result.issues
    assert result.record is not None
    posts = [(a.seat, a.kind) for a in result.record.actions[:2]]
    assert posts == [(1, A.POST_SMALL_BLIND), (2, A.POST_BIG_BLIND)]


@pytest.mark.parametrize(("raise_to", "ok"), [(7, False), (8, True)])
def test_minimum_raise_over_a_straddle_is_twice_the_straddle(raise_to: int, ok: bool) -> None:
    # Blinds 1/2 and a straddle of 4 by seat 3; seat 4 acts first and raises.
    record = hand(
        stakes=Stakes(small_blind_chips=1, big_blind_chips=2, straddles_chips=(4,)),
        table_size=4,
        dealt_in_seats=(1, 2, 3, 4),
        button_seat=4,
        hero_seat=4,
        seats=(seat(4, 100, ("As", "Kd")),),
        actions=(act(P, 4, A.RAISE, raise_to),),
        # Everyone folds; 4 of the 8 are uncalled, so the pot is 1 + 2 + 4 + 4.
        results=({"seat": 4, "won_chips": 11},),
    )
    result = check(record)
    assert result.ok is ok, result.issues
    if ok:
        assert result.record is not None
        folds = [a.seat for a in result.record.actions if a.kind is A.FOLD]
        assert folds == [1, 2, 3]  # implicit folds, in turn order
    else:
        assert result.issues[0].code == "below_min_raise"


def test_issue_location_reads_like_a_field_path() -> None:
    result = check(example_3(300))
    assert result.issues[0].location == "actions[8].amount_to_chips"


def test_a_seat_that_could_check_is_never_folded_implicitly() -> None:
    # A limped pot with the big blind's option left out: the big blind could check, so its
    # action must be entered (ARCHITECTURE.md §7.3, implicit seats and folds).
    record = hand(
        table_size=3,
        dealt_in_seats=(1, 2, 3),
        button_seat=1,
        hero_seat=1,
        seats=(seat(1, 100, ("As", "Kd")),),
        board=FULL_BOARD,
        actions=(
            act(P, 1, A.CALL, 2),
            act(P, 2, A.CALL, 2),
            *(act(street, s, A.CHECK) for street in (F, T, R) for s in (2, 1)),
        ),
        results=({"seat": 1, "won_chips": 6},),
    )
    result = check(record)
    # Folding the big blind here would make this a valid two-player hand.
    assert [(i.code, i.path) for i in result.issues] == [("missing_action", ("actions", 2))]
