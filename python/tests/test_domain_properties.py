"""Property tests of review.domain against the independent dealer in tests/dealer.py.

M3a acceptance criterion 1: legal hands pass and conserve chips; impossible hands are rejected
with field-level errors; incomplete hands are accepted and flagged. Record version 2 (ADR-0030):
hands that end at hero's fold pass with hero's net and no rake, and the ways such a record can be
wrong are rejected with field-level errors.
"""

import random

from dealer import DECK, Notes, deal, deal_any, end_at_hero_fold
from hypothesis import given
from hypothesis import strategies as st

from review.domain import HandRecord, check
from review.domain.record import POSTS, ActionKind, SeatEntry, Street

randoms = st.randoms(use_true_random=False)
hands = randoms.map(deal)  # complete
cut_hands = randoms.map(lambda rng: end_at_hero_fold(*deal(rng, hero_folds=True)))
any_hands = randoms.map(deal_any)  # either


def canonical(hand: HandRecord) -> HandRecord:
    result = check(hand)
    assert result.ok, (result.issues, hand)
    assert result.record is not None
    return result.record


@given(hands)
def test_dealt_hands_are_valid_and_add_up(dealt: tuple[HandRecord, Notes]) -> None:
    hand, notes = dealt
    result = check(hand)
    assert result.ok, result.issues
    record = result.record
    assert record is not None
    # The dealer's hand is already explicit: canonicalization only adds the derived fields.
    derived = {"completeness": None, "rake_chips": None, "hero_net_chips": None}
    assert record.model_copy(update=derived) == hand
    # Conservation: every committed chip, less the uncalled bet, is in exactly one pot, and what
    # is not won is rake — computed here by the dealer's own pot peeling.
    assert sum(p.chips for p in result.pots) == notes.pot_chips
    assert record.rake_chips == notes.rake
    assert record.hero_net_chips == notes.hero_net
    assert record.completeness is not None
    assert not any(record.completeness.model_dump().values())


@given(cut_hands)
def test_hands_that_end_at_hero_fold_are_valid(dealt: tuple[HandRecord, Notes]) -> None:
    hand, notes = dealt
    result = check(hand)
    assert result.ok, result.issues
    record = result.record
    assert record is not None
    derived = {"completeness": None, "rake_chips": None, "hero_net_chips": None}
    assert record.model_copy(update=derived) == hand
    # Hero's net from the dealer's accounting of the whole hand; nothing else is known.
    assert record.hero_net_chips == notes.hero_net
    assert record.rake_chips is None
    assert record.results == ()
    assert result.pots == ()
    assert record.completeness is not None
    assert not any(record.completeness.model_dump().values())


@given(any_hands)
def test_dealt_hands_use_every_card_once(dealt: tuple[HandRecord, Notes]) -> None:
    hand, _ = dealt
    cards: list[str | None] = [c for e in hand.seats for c in e.hole_cards or ()]
    cards += [*(hand.board.flop or ()), hand.board.turn, hand.board.river]
    known = [c for c in cards if c is not None]
    assert len(known) == len(set(known))


@given(any_hands)
def test_canonical_form_is_a_fixed_point(dealt: tuple[HandRecord, Notes]) -> None:
    once = canonical(dealt[0])
    assert canonical(once) == once


@given(any_hands)
def test_omitted_posts_and_folds_give_the_same_canonical_record(
    dealt: tuple[HandRecord, Notes],
) -> None:
    hand, notes = dealt
    gone = notes.implicit_folders
    short = hand.model_copy(
        update={
            "seats": tuple(e for e in hand.seats if e.seat not in gone),
            "actions": tuple(a for a in hand.actions if a.kind not in POSTS and a.seat not in gone),
        }
    )
    expected = canonical(hand).model_copy(
        update={"seats": tuple(SeatEntry(seat=e.seat) if e.seat in gone else e for e in hand.seats)}
    )
    assert canonical(short) == expected


@given(any_hands, randoms)
def test_incomplete_hands_are_accepted_and_flagged(
    dealt: tuple[HandRecord, Notes], rng: random.Random
) -> None:
    hand, notes = dealt
    villains = [e.seat for e in hand.seats if e.seat != hand.hero_seat]
    hide_cards = {s for s in villains if rng.random() < 0.5}
    hide_stack = {s for s in villains if rng.random() < 0.3}
    rough_stack = {s for s in villains if rng.random() < 0.2}
    rough_amount = {i for i, a in enumerate(hand.actions) if rng.random() < 0.1}
    seats = tuple(
        e.model_copy(
            update={
                "hole_cards": None if e.seat in hide_cards else e.hole_cards,
                "starting_stack_chips": None if e.seat in hide_stack else e.starting_stack_chips,
                "stack_approximate": e.seat in rough_stack,
            }
        )
        for e in hand.seats
    )
    actions = tuple(
        a.model_copy(update={"amount_approximate": i in rough_amount})
        for i, a in enumerate(hand.actions)
    )
    vague = hand.model_copy(update={"seats": seats, "actions": actions})
    record = canonical(vague)

    all_in = {a.seat for a in hand.actions if a.all_in}
    involved = {hand.hero_seat} | {
        a.seat
        for a in hand.actions
        if a.kind in (ActionKind.CALL, ActionKind.BET, ActionKind.RAISE)
        or a.street is not Street.PREFLOP
    }
    assert record.completeness is not None
    assert record.completeness.villain_cards_unknown == bool(hide_cards - notes.folded)
    assert record.completeness.stacks_approximate == bool(
        ((hide_stack - all_in) | rough_stack) & involved
    )
    assert record.completeness.amounts_approximate == bool(rough_amount)
    # An all-in seat's unknown stack is derived, and it is the true one.
    for entry, original in zip(record.seats, hand.seats, strict=True):
        if original.seat in all_in:
            assert entry.starting_stack_chips == original.starting_stack_chips


# --- Impossible hands: each mutation is rejected, with the error where the mutation is ---------


@given(hands)
def test_a_card_used_twice_is_rejected(dealt: tuple[HandRecord, Notes]) -> None:
    hand, _ = dealt
    hero = next(i for i, e in enumerate(hand.seats) if e.seat == hand.hero_seat)
    other = (hero + 1) % len(hand.seats)
    hero_cards = hand.seats[hero].hole_cards
    other_cards = hand.seats[other].hole_cards
    assert hero_cards is not None and other_cards is not None
    seats = list(hand.seats)
    seats[other] = seats[other].model_copy(update={"hole_cards": (hero_cards[0], other_cards[1])})
    result = check(hand.model_copy(update={"seats": tuple(seats)}))
    assert [(i.code, i.path) for i in result.issues] == [
        ("duplicate_card", ("seats", max(hero, other), "hole_cards", 0))
    ]


@given(hands)
def test_one_chip_too_many_is_rejected(dealt: tuple[HandRecord, Notes]) -> None:
    hand, notes = dealt
    first = hand.results[0]
    assert notes.rake is not None  # a complete hand
    bigger = first.model_copy(update={"won_chips": first.won_chips + notes.rake + 1})
    result = check(hand.model_copy(update={"results": (bigger, *hand.results[1:])}))
    assert [i.code for i in result.issues] in (["results_exceed_pot"], ["results_infeasible"])
    assert result.issues[0].path[0] == "results"


@given(hands, st.randoms(use_true_random=False))
def test_an_action_out_of_turn_is_rejected(
    dealt: tuple[HandRecord, Notes], rng: random.Random
) -> None:
    hand, _ = dealt
    actions = hand.actions
    swappable = [
        i
        for i in range(len(actions) - 1)
        if actions[i].kind not in POSTS
        and actions[i].street is actions[i + 1].street
        and actions[i].seat != actions[i + 1].seat
    ]
    if not swappable:
        return
    i = rng.choice(swappable)
    swapped = (*actions[:i], actions[i + 1], actions[i], *actions[i + 2 :])
    result = check(hand.model_copy(update={"actions": swapped}))
    assert [(x.code, x.path) for x in result.issues] == [("out_of_turn", ("actions", i, "seat"))]


@given(hands, st.randoms(use_true_random=False))
def test_an_action_after_folding_is_rejected(
    dealt: tuple[HandRecord, Notes], rng: random.Random
) -> None:
    hand, _ = dealt
    actions = hand.actions
    folds = [
        i
        for i in range(len(actions) - 1)
        if actions[i].kind is ActionKind.FOLD and actions[i + 1].seat != actions[i].seat
    ]
    if not folds:
        return
    i = rng.choice(folds)
    # Insert, not replace: replacing the next seat's only action would make that seat an
    # implicit folder, which is a different (and legal) record.
    ghost = actions[i + 1].model_copy(update={"seat": actions[i].seat})
    result = check(
        hand.model_copy(update={"actions": (*actions[: i + 1], ghost, *actions[i + 1 :])})
    )
    assert [(x.code, x.path) for x in result.issues] == [
        ("seat_folded", ("actions", i + 1, "seat"))
    ]


@given(hands, st.randoms(use_true_random=False))
def test_a_raise_below_the_minimum_is_rejected(
    dealt: tuple[HandRecord, Notes], rng: random.Random
) -> None:
    hand, notes = dealt
    candidates = [
        i
        for i, minimum in notes.min_raise_to.items()
        if not hand.actions[i].all_in and minimum - 1 > notes.bet_before[i]
    ]
    if not candidates:
        return
    i = rng.choice(candidates)
    low = hand.actions[i].model_copy(update={"amount_to_chips": notes.min_raise_to[i] - 1})
    actions = (*hand.actions[:i], low, *hand.actions[i + 1 :])
    result = check(hand.model_copy(update={"actions": actions}))
    assert [(x.code, x.path) for x in result.issues] == [
        ("below_min_raise", ("actions", i, "amount_to_chips"))
    ]


# --- Records that end at hero's fold, done wrong ------------------------------------------------


@given(randoms)
def test_an_action_after_hero_fold_is_rejected(rng: random.Random) -> None:
    full, notes = deal(rng, hero_folds=True)
    cut, _ = end_at_hero_fold(full, notes)
    k = len(cut.actions)
    if k == len(full.actions):
        return  # hero's fold was the last action of the hand
    longer = cut.model_copy(update={"actions": (*cut.actions, full.actions[k])})
    assert [(x.code, x.path) for x in check(longer).issues] == [
        ("action_after_hero_fold", ("actions", k))
    ]


@given(randoms)
def test_results_with_a_hand_that_ends_at_hero_fold_are_rejected(rng: random.Random) -> None:
    full, notes = deal(rng, hero_folds=True)
    cut, _ = end_at_hero_fold(full, notes)
    with_results = cut.model_copy(update={"results": full.results})
    assert [(x.code, x.path) for x in check(with_results).issues] == [
        ("results_after_hero_fold", ("results", 0))
    ]


@given(cut_hands)
def test_a_board_card_after_hero_fold_is_rejected(dealt: tuple[HandRecord, Notes]) -> None:
    hand, _ = dealt
    board = hand.board
    used = {c for e in hand.seats for c in e.hole_cards or ()}
    used |= {*(board.flop or ()), board.turn, board.river} - {None}
    free = [c for c in DECK if c not in used]
    if board.flop is None:
        later, street = board.model_copy(update={"flop": (free[0], free[1], free[2])}), "flop"
    elif board.turn is None:
        later, street = board.model_copy(update={"turn": free[0]}), "turn"
    elif board.river is None:
        later, street = board.model_copy(update={"river": free[0]}), "river"
    else:
        return  # hero folded on the river
    assert [(x.code, x.path) for x in check(hand.model_copy(update={"board": later})).issues] == [
        ("board_card_not_reached", ("board", street))
    ]


@given(hands)
def test_the_flag_needs_hero_to_have_folded(dealt: tuple[HandRecord, Notes]) -> None:
    hand, _ = dealt
    if any(a.seat == hand.hero_seat and a.kind is ActionKind.FOLD for a in hand.actions):
        return
    flagged = hand.model_copy(update={"ends_at_hero_fold": True, "results": ()})
    assert [(x.code, x.path) for x in check(flagged).issues] == [
        ("hero_did_not_fold", ("ends_at_hero_fold",))
    ]


@given(cut_hands)
def test_the_flag_needs_version_2(dealt: tuple[HandRecord, Notes]) -> None:
    hand, _ = dealt
    assert [
        (x.code, x.path) for x in check(hand.model_copy(update={"schema_version": 1})).issues
    ] == [("not_in_version", ("ends_at_hero_fold",))]


@given(hands)
def test_a_version_1_record_becomes_version_2(dealt: tuple[HandRecord, Notes]) -> None:
    hand, _ = dealt
    assert canonical(hand.model_copy(update={"schema_version": 1})) == canonical(hand)
