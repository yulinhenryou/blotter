"""Decision points on generated hands (M3a acceptance criterion 5, docs/MATH.md §5.1).

For every hand the dealer deals: one decision point per hero action other than a post, each
pointing at that action; the columns that apply only preflop or only postflop are filled in
exactly there; and making the record incomplete changes nothing but the depth bucket.
"""

import random

import pytest
from dealer import Notes, deal, deal_any
from hypothesis import given
from hypothesis import strategies as st

from review.domain import HandRecord, check
from review.domain.record import POSTS, Street
from review.ledger import decision_points
from review.ledger.situations import Depth, Spot

hands = st.randoms(use_true_random=False).map(deal_any)


def canonical(hand: HandRecord) -> HandRecord:
    result = check(hand)
    assert result.ok and result.record is not None, result.issues
    return result.record


@given(hands)
def test_one_decision_point_per_hero_action(dealt: tuple[HandRecord, Notes]) -> None:
    record = canonical(dealt[0])
    points = decision_points(record)
    hero_actions = [
        i
        for i, a in enumerate(record.actions)
        if a.seat == record.hero_seat and a.kind not in POSTS
    ]
    assert [p.action_seq for p in points] == hero_actions
    for p in points:
        assert p.situation.street is record.actions[p.action_seq].street


@given(hands)
def test_columns_apply_where_they_should(dealt: tuple[HandRecord, Notes]) -> None:
    record = canonical(dealt[0])
    for n, p in enumerate(decision_points(record)):
        s = p.situation
        preflop = s.street is Street.PREFLOP
        assert (s.pot_type is None) is preflop
        assert (s.in_position is None) is preflop
        assert (s.initiative is None) is preflop
        assert (s.texture is None) is preflop
        assert s.depth.value.startswith("bb_" if preflop else "spr_") or s.depth is Depth.UNKNOWN
        if not preflop:
            # Postflop, a size exactly when there is a bet to face.
            assert (s.size is None) is (s.spot is Spot.NO_BET)
            assert s.texture is not None
            assert (s.texture.new_card is None) is (s.street is Street.FLOP)
        # The line has one lower-case letter per earlier hero decision.
        assert sum(c.islower() for c in s.line) == n
        assert s.line.count("/") == list(Street).index(s.street)


@given(hands, st.randoms(use_true_random=False))
def test_incomplete_records_change_only_the_depth(
    dealt: tuple[HandRecord, Notes], rng: random.Random
) -> None:
    hand, notes = dealt
    gone = {s for s in notes.implicit_folders if rng.random() < 0.5}
    seats = tuple(
        e
        if e.seat == hand.hero_seat
        else e.model_copy(
            update={
                "hole_cards": None if rng.random() < 0.5 else e.hole_cards,
                "starting_stack_chips": None if rng.random() < 0.3 else e.starting_stack_chips,
                "stack_approximate": rng.random() < 0.2,
            }
        )
        for e in hand.seats
        if e.seat not in gone
    )
    actions = tuple(
        a.model_copy(update={"amount_approximate": rng.random() < 0.1})
        for a in hand.actions
        if a.kind not in POSTS and a.seat not in gone
    )
    vague = canonical(hand.model_copy(update={"seats": seats, "actions": actions}))
    full = decision_points(canonical(hand))
    for p, q in zip(decision_points(vague), full, strict=True):
        assert p.action_seq == q.action_seq
        if p.situation.depth is not q.situation.depth:
            assert p.situation.depth is Depth.UNKNOWN
        assert p.situation.__class__(**{**vars(p.situation), "depth": q.situation.depth}) == (
            q.situation
        )


def test_a_record_that_is_not_canonical_is_refused() -> None:
    hand, _ = deal(random.Random(0))
    with pytest.raises(ValueError, match="canonical"):
        decision_points(hand)
