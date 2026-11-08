"""Situation keys (docs/MATH.md §5.1) on hand-classified fixtures, one or more per key value.

Every expected value below was worked out by hand from the definitions in MATH.md §5.1; the
arithmetic is in the comments.
"""

from typing import Any

import pytest
from test_domain_examples import A, F, P, R, T, act, example_1, example_3, example_4
from test_domain_examples import hand as base_hand
from test_domain_examples import seat as entry

from review.domain import HandRecord, check
from review.domain.record import Board, Stakes
from review.ledger import decision_points
from review.ledger.situations import (
    Depth,
    NewCard,
    PositionGroup,
    Size,
    depth_postflop,
    depth_preflop,
    effective_stack,
    position_group,
    position_labels,
    size_postflop,
    size_preflop,
    texture,
)

# --- Positions ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("n", "labels"),
    [
        (2, "BB BTN"),  # order starts after the button: the big blind, then the button
        (3, "SB BB BTN"),
        (4, "SB BB CO BTN"),
        (6, "SB BB LJ HJ CO BTN"),
        (9, "SB BB UTG UTG+1 UTG+2 LJ HJ CO BTN"),
        (10, "SB BB UTG UTG+1 UTG+2 UTG+3 LJ HJ CO BTN"),
    ],
)
def test_position_labels(n: int, labels: str) -> None:
    order = tuple(range(1, n + 1))  # seat n is the button
    assert [position_labels(order)[s] for s in order] == labels.split()


@pytest.mark.parametrize(
    ("label", "group"),
    [
        ("UTG", PositionGroup.EARLY),
        ("UTG+3", PositionGroup.EARLY),
        ("LJ", PositionGroup.MIDDLE),
        ("HJ", PositionGroup.MIDDLE),
        ("CO", PositionGroup.LATE),
        ("BTN", PositionGroup.LATE),
        ("SB", PositionGroup.BLINDS),
        ("BB", PositionGroup.BLINDS),
    ],
)
def test_position_groups(label: str, group: PositionGroup) -> None:
    assert position_group(label) is group


# --- Buckets: values on and next to every boundary ---------------------------------------------


@pytest.mark.parametrize(
    ("hero", "others", "expected"),
    [
        (100, [300, 50], 100),
        (400, [300, 50], 300),
        (100, [None, 300], 100),  # hero's 100 <= a known 300: unknowns cannot lower E
        (400, [None, 300], None),  # the unknown stack could be anything from 0 up
        (None, [300], None),
    ],
)
def test_effective_stack(hero: int | None, others: list[int | None], expected: int | None) -> None:
    assert effective_stack(hero, others) == expected


@pytest.mark.parametrize(
    ("effective", "pot", "depth"),
    [
        (199, 100, Depth.SPR_LT_2),
        (200, 100, Depth.SPR_2_4),  # lower bounds are inclusive
        (399, 100, Depth.SPR_2_4),
        (400, 100, Depth.SPR_4_8),
        (800, 100, Depth.SPR_8_PLUS),
        (None, 100, Depth.UNKNOWN),
    ],
)
def test_depth_postflop(effective: int | None, pot: int, depth: Depth) -> None:
    assert depth_postflop(effective, pot) is depth


@pytest.mark.parametrize(
    ("effective", "depth"),
    [
        (79, Depth.BB_LT_40),  # big blind 2: 39.5 bb
        (80, Depth.BB_40_100),
        (200, Depth.BB_100_200),
        (400, Depth.BB_200_PLUS),
        (None, Depth.UNKNOWN),
    ],
)
def test_depth_preflop(effective: int | None, depth: Depth) -> None:
    assert depth_preflop(effective, 2) is depth


@pytest.mark.parametrize(
    ("to_call", "pot", "size"),
    [
        (39, 139, Size.SMALL),  # f = 39 / 100
        (40, 140, Size.MEDIUM),  # f = 0.4
        (80, 180, Size.LARGE),  # f = 0.8
        (125, 225, Size.OVERBET),  # f = 1.25
        (110, 678, Size.SMALL),  # facing a raise: f = 110 / 568 (Example 3 below)
    ],
)
def test_size_postflop(to_call: int, pot: int, size: Size) -> None:
    assert size_postflop(to_call, pot) is size


@pytest.mark.parametrize(
    ("raise_to", "raised", "size"),
    [
        (4, 2, Size.LT_2_5X),
        (5, 2, Size.X_2_5_TO_3_5),  # 2.5x
        (7, 2, Size.X_3_5_TO_5),  # 3.5x
        (10, 2, Size.X_5_PLUS),  # 5x
    ],
)
def test_size_preflop(raise_to: int, raised: int, size: Size) -> None:
    assert size_preflop(raise_to, raised) is size


# --- Texture -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("board", "expected"),
    [
        ("Ks 7d 2c", "rainbow unpaired broadway - dry"),
        ("Ks 7s 2c", "two_tone unpaired broadway - two_tone"),
        ("9s 8s 7d", "two_tone unpaired ten_or_lower connected connected"),
        ("Ah Kh 2h", "flush_possible unpaired ace - flush_possible"),
        ("As 4d 2c", "rainbow unpaired ace connected connected"),  # the wheel: A-2-4
        ("Ks Qd Tc", "rainbow unpaired broadway connected connected"),
        ("8s 8d 3c", "rainbow paired ten_or_lower - paired"),
        ("8s 8d 8c", "rainbow heavily_paired ten_or_lower - paired"),
        ("8s 8d 3c 3h", "rainbow heavily_paired ten_or_lower - paired"),
        ("Js 9s 5s", "flush_possible unpaired broadway - flush_possible"),
        # Two classes apply: the order of priority decides.
        ("9h 8h 7h", "flush_possible unpaired ten_or_lower connected flush_possible"),
        ("8h 8d 3h 5h", "flush_possible paired ten_or_lower - paired"),
    ],
)
def test_board_texture(board: str, expected: str) -> None:
    # Expected: suits, pairing, high card, connected or "-", texture class.
    t = texture(board.split())
    connected = "connected" if t.connected else "-"
    got = f"{t.suits} {t.pairing} {t.high_card} {connected} {t.texture_class}"
    assert got == expected


@pytest.mark.parametrize(
    ("board", "new"),
    [
        ("Ks 7d 2c", None),  # the flop has no new card
        ("Ks 7d 2c 7h", NewCard.PAIRS_BOARD),
        ("Ks 7d 2d 5d", NewCard.COMPLETES_FLUSH),
        ("Ks 7d 2d 7d", NewCard.PAIRS_BOARD),  # pairing comes first
        ("9d 7c 2s 8h", NewCard.COMPLETES_STRAIGHT),  # 7-8-9 now fit in the window 5..9
        ("Ks 7d 2c Ah", NewCard.OVERCARD),
        ("Ks 7d 2c Th", NewCard.BLANK),
        ("Ks 7d 2c Th 3s", NewCard.BLANK),
    ],
)
def test_new_card(board: str, new: NewCard | None) -> None:
    assert texture(board.split()).new_card is new


# --- Whole hands -------------------------------------------------------------------------------
# Each decision is summarised as: street, spot, pot type, players, position label, in position,
# initiative, depth, size, facing all-in, texture class, new card, line.

Row = tuple[Any, ...]


def summary(record: HandRecord) -> list[Row]:
    result = check(record)
    assert result.ok and result.record is not None, result.issues
    rows = []
    for point in decision_points(result.record):
        s = point.situation
        t = s.texture
        rows.append(
            (
                s.street.value,
                s.spot.value,
                s.pot_type and s.pot_type.value,
                s.players.value,
                s.position_label,
                s.in_position and s.in_position.value,
                s.initiative and s.initiative.value,
                s.depth.value,
                s.size and s.size.value,
                s.facing_all_in,
                t and t.texture_class.value,
                t and t.new_card and t.new_card.value,
                s.line,
            )
        )
    return rows


def test_math_worked_example() -> None:
    # MATH.md §5.1: live 1/3, nine dealt in, stacks 300. Seat 9 is the button (hero), 1 the
    # small blind, 2 the big blind, 3 UTG. UTG opens to 15, seats 4-8 fold (left implicit), hero
    # calls, the small blind folds, the big blind calls. Flop Ks 7d 2c: BB checks, UTG bets 30;
    # hero folds, BB folds.
    record = base_hand(
        stakes=Stakes(small_blind_chips=1, big_blind_chips=3),
        table_size=9,
        dealt_in_seats=tuple(range(1, 10)),
        button_seat=9,
        hero_seat=9,
        seats=(entry(1, 300), entry(2, 300), entry(3, 300), entry(9, 300, ("Qs", "Qh"))),
        board=Board(flop=("Ks", "7d", "2c")),
        actions=(
            act(P, 3, A.RAISE, 15),
            act(P, 9, A.CALL, 15),
            act(P, 1, A.FOLD),
            act(P, 2, A.CALL, 15),
            act(F, 2, A.CHECK),
            act(F, 3, A.BET, 30),
            act(F, 9, A.FOLD),
            act(F, 2, A.FOLD),
        ),
        # Pot 46 (15 x 3 and the small blind's 1); UTG's 30 is uncalled and comes back.
        results=({"seat": 3, "won_chips": 46},),
    )
    assert summary(record) == [
        # Preflop: one raise; E = 300 = 100 bb (inclusive); 15 / 3 = 5x; seats 4-8 left out.
        ("preflop", "facing_open", None, "four_plus", "BTN", None, None, "bb_100_200",
         "5x_plus", False, None, None, "R"),
        # Flop: P0 = 46, E = 285, SPR 6.2; f = 30 / 46 = 0.65; the SB's fold is left out.
        ("flop", "facing_bet", "single_raised", "three_way", "BTN", "ip", "villain", "spr_4_8",
         "medium", False, "dry", None, "RcC/XB"),
    ]  # fmt: skip


def test_mathematics_examples_1_3_4() -> None:
    # MATH.md §1.5 Example 1: hero is the big blind (200) facing 50 all-in and 120 all-in.
    # E = min(200, 120) = 120 = 60 bb; 120 / 50 = 2.4x.
    assert summary(example_1(150, 135)) == [
        ("preflop", "facing_3bet", None, "three_way", "BB", None, None, "bb_40_100",
         "lt_2_5x", True, None, None, "RR"),
    ]  # fmt: skip
    # Example 3 (fixture variant): hero is seat 1, the small blind of four, stacks 1000, 152,
    # 212, 1000; blinds 1/2, everyone limps.
    assert summary(example_3(310)) == [
        # E = min(1000, 1000) = 500 bb.
        ("preflop", "limped", None, "four_plus", "SB", None, None, "bb_200_plus",
         None, False, None, None, "CC"),
        # P0 = 8, E = 998, SPR 124.75.
        ("flop", "no_bet", "limped", "four_plus", "SB", "oop", "none", "spr_8_plus",
         None, False, "dry", None, "CCcX/"),
        # Hero bet 100, raises to 150 and 210 (both all-in), a call: c = 110, P = 678,
        # f = 110 / 568 = 0.19.
        ("flop", "facing_raise", "limped", "four_plus", "SB", "oop", "none", "spr_8_plus",
         "small", True, "dry", None, "CCcX/bRRC"),
        # Hero's raise to 310 was the last on the flop. E = 688, P0 = 988, SPR 0.70. Th: blank.
        ("turn", "no_bet", "limped", "four_plus", "SB", "oop", "hero", "spr_lt_2",
         None, False, "dry", "blank", "CCcX/bRRCrC/"),
        # 3s makes a second spade: two-tone; checked through on the turn.
        ("river", "no_bet", "limped", "four_plus", "SB", "oop", "none", "spr_lt_2",
         None, False, "two_tone", "blank", "CCcX/bRRCrC/xX/"),
    ]  # fmt: skip
    # Example 4: hero (seat 3, CO, 1000) opens; the blinds' stacks are unknown and could be
    # deeper, so E is unknown. Then G (500) shoves: E = 500 = 250 bb, 500 / 100 = 5x.
    assert summary(example_4(None, 203)) == [
        ("preflop", "unopened", None, "four_plus", "CO", None, None, "unknown",
         None, False, None, None, ""),
        ("preflop", "facing_3bet", None, "heads_up", "CO", None, None, "bb_200_plus",
         "5x_plus", True, None, None, "rR"),
    ]  # fmt: skip


def test_four_bet_pot_with_a_straddle() -> None:
    # 1/2 with a straddle of 4, six dealt in, button 6: 1 SB, 2 BB, 3 LJ (straddles), 4 HJ,
    # 5 CO (hero), 6 BTN. Stacks of 4 and 5 are 500; the others unknown.
    record = base_hand(
        stakes=Stakes(small_blind_chips=1, big_blind_chips=2, straddles_chips=(4,)),
        table_size=6,
        dealt_in_seats=(1, 2, 3, 4, 5, 6),
        button_seat=6,
        hero_seat=5,
        seats=(entry(4, 500), entry(5, 500, ("Qh", "Jh"))),
        board=Board(flop=("Ah", "Kh", "2h"), turn="7c", river="9d"),
        actions=(
            act(P, 4, A.RAISE, 12),
            act(P, 5, A.RAISE, 36),
            act(P, 4, A.RAISE, 100),
            act(P, 5, A.CALL, 100),
            act(F, 4, A.BET, 80),
            act(F, 5, A.RAISE, 400, all_in=True),
            act(F, 4, A.CALL, 400, all_in=True),
        ),
        # 1 + 2 + 4 dead, 400 + 400 live.
        results=({"seat": 5, "won_chips": 807},),
    )
    assert summary(record) == [
        # Open over the straddle: 12 / 4 = 3x. E = 500 (hero <= the known 500) = 250 bb.
        ("preflop", "facing_open", None, "four_plus", "CO", None, None, "bb_200_plus",
         "2_5x_3_5x", False, None, None, "R"),
        # Three raises: 12, 36, 100. 100 / 36 = 2.78x. Folds without voluntary chips left out.
        ("preflop", "facing_4bet_plus", None, "heads_up", "CO", None, None, "bb_200_plus",
         "2_5x_3_5x", False, None, None, "RrR"),
        # P = 7 + 200 + 80 = 287, c = 80, f = 80 / 207 = 0.39. E = 400, P0 = 207, SPR 1.93.
        ("flop", "facing_bet", "4bet_plus", "heads_up", "CO", "ip", "villain", "spr_lt_2",
         "small", False, "flush_possible", None, "RrRc/B"),
    ]  # fmt: skip
    result = check(record)
    assert result.record is not None
    assert all(p.situation.straddled for p in decision_points(result.record))


def test_three_bet_pot_hero_in_the_middle() -> None:
    # 1/2, six dealt in, button 6: hero is 3 (LJ). Stacks of 2, 3, 6 are 200.
    record = base_hand(
        table_size=6,
        dealt_in_seats=(1, 2, 3, 4, 5, 6),
        button_seat=6,
        hero_seat=3,
        seats=(entry(2, 200), entry(3, 200, ("As", "Ad")), entry(6, 200)),
        board=Board(flop=("9s", "8s", "7d"), turn="9d", river="6s"),
        actions=(
            act(P, 3, A.RAISE, 6),
            act(P, 6, A.RAISE, 20),
            act(P, 2, A.CALL, 20),
            act(P, 3, A.CALL, 20),
            act(F, 2, A.CHECK),
            act(F, 3, A.CHECK),
            act(F, 6, A.BET, 30),
            act(F, 2, A.FOLD),
            act(F, 3, A.CALL, 30),
            act(T, 3, A.CHECK),
            act(T, 6, A.CHECK),
            act(R, 3, A.BET, 50),
            act(R, 6, A.CALL, 50),
        ),
        # 1 dead + 3 x 20 + 2 x 30 + 2 x 50.
        results=({"seat": 3, "won_chips": 221},),
    )
    assert summary(record) == [
        # E = 200 (hero <= a known 200) = 100 bb: the inclusive lower bound.
        ("preflop", "unopened", None, "four_plus", "LJ", None, None, "bb_100_200",
         None, False, None, None, ""),
        # 20 / 6 = 3.33x. The small blind folded (left out), the big blind called.
        ("preflop", "facing_3bet", None, "three_way", "LJ", None, None, "bb_100_200",
         "2_5x_3_5x", False, None, None, "rRC"),
        # Postflop order 2, 3, 6: hero is in the middle. P0 = 61, E = 180, SPR 2.95.
        ("flop", "no_bet", "3bet", "three_way", "LJ", "middle", "villain", "spr_2_4",
         None, False, "connected", None, "rRCc/X"),
        # BB folded after the bet: heads-up, hero first. f = 30 / 61 = 0.49.
        ("flop", "facing_bet", "3bet", "heads_up", "LJ", "oop", "villain", "spr_2_4",
         "medium", False, "connected", None, "rRCc/XxBF"),
        # The 9d pairs the board. BTN made the last flop bet. E = 150, P0 = 121, SPR 1.24.
        ("turn", "no_bet", "3bet", "heads_up", "LJ", "oop", "villain", "spr_lt_2",
         None, False, "paired", "pairs_board", "rRCc/XxBFc/"),
        # 6s: third spade; the board stays paired, which comes first. Turn checked through.
        ("river", "no_bet", "3bet", "heads_up", "LJ", "oop", "none", "spr_lt_2",
         None, False, "paired", "completes_flush", "rRCc/XxBFc/xX/"),
    ]  # fmt: skip
