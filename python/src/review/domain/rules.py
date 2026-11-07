"""No-limit hold'em betting rules (``docs/MATH.md`` §1.5).

:class:`Betting` is the state machine the checker replays a record through: whose turn it is,
which actions are legal, and what each action changes. It knows nothing about records or field
paths; the checker translates its answers into issues.

Notation follows ``MATH.md`` §1.5: ``bet`` is the current bet $B$, ``full_raise`` the full-raise
size $F$, ``SeatState.street`` the seat's chips on this street $x_i$, ``SeatState.live`` its live
chips in the hand $v_i$.
"""

from dataclasses import dataclass, field

from review.domain.record import STREETS, ActionKind, AnteKind, Stakes, Street


@dataclass(frozen=True)
class ForcedBet:
    """One forced bet, in posting order."""

    seat: int
    kind: ActionKind
    chips: int


def seat_order(dealt_in: tuple[int, ...], button: int) -> tuple[int, ...]:
    """Dealt-in seats clockwise, starting with the first seat after the button."""
    seats = sorted(dealt_in)
    after = [s for s in seats if s > button]
    return tuple(after + [s for s in seats if s <= button])


def forced_bets(stakes: Stakes, dealt_in: tuple[int, ...], button: int) -> tuple[ForcedBet, ...]:
    """List the forced bets: antes, small blind, big blind, straddles (``MATH.md`` §1.5).

    Heads-up, the button posts the small blind (TDA 36-C). Straddles are posted by the seats
    after the big blind, in order. The caller checks that there are enough seats for them.
    """
    order = seat_order(dealt_in, button)
    if len(order) == 2:
        small, big = button, order[0]
        straddlers: tuple[int, ...] = ()
    else:
        small, big = order[0], order[1]
        straddlers = order[2 : 2 + len(stakes.straddles_chips)]
    bets: list[ForcedBet] = []
    ante = stakes.ante
    if ante is not None:
        posters = order if ante.kind is AnteKind.PER_PLAYER else (big,)
        bets += [ForcedBet(s, ActionKind.POST_ANTE, ante.chips) for s in posters]
    bets.append(ForcedBet(small, ActionKind.POST_SMALL_BLIND, stakes.small_blind_chips))
    bets.append(ForcedBet(big, ActionKind.POST_BIG_BLIND, stakes.big_blind_chips))
    bets += [
        ForcedBet(s, ActionKind.POST_STRADDLE, chips)
        for s, chips in zip(straddlers, stakes.straddles_chips, strict=True)
    ]
    return tuple(bets)


@dataclass
class SeatState:
    """A seat during the replay. ``stack`` is ``None`` when the record does not know it."""

    seat: int
    stack: int | None
    ante: int = 0
    live: int = 0
    street: int = 0
    folded: bool = False
    all_in: bool = False
    acted: bool = False

    @property
    def active(self) -> bool:
        """Neither folded nor all-in."""
        return not (self.folded or self.all_in)

    @property
    def behind(self) -> int | None:
        """Chips not yet committed, if the stack is known."""
        return None if self.stack is None else self.stack - self.ante - self.live


@dataclass(frozen=True)
class RuleViolation:
    """Why an action is not legal: a stable ``code`` and a sentence for people."""

    code: str
    message: str


@dataclass
class Betting:
    """The betting state of one hand, street by street."""

    order: tuple[int, ...]
    big_blind: int
    seats: dict[int, SeatState]
    street: Street = Street.PREFLOP
    bet: int = 0
    full_raise: int = 0
    pointer: int = 0
    reached: list[Street] = field(default_factory=lambda: [Street.PREFLOP])

    @classmethod
    def start(
        cls, order: tuple[int, ...], big_blind: int, stacks: dict[int, int | None]
    ) -> Betting:
        """Set up a hand before any forced bet, preflop."""
        seats = {s: SeatState(seat=s, stack=stacks[s]) for s in order}
        return cls(order=order, big_blind=big_blind, seats=seats)

    def post(self, forced: ForcedBet, all_in: bool | None = None) -> RuleViolation | None:
        """Post a forced bet. Version 1 has no forced bet posted all-in for less.

        ``all_in`` is what the record says, if it lists the post; with an unknown stack it is the
        only source, with a known stack it must agree.
        """
        state = self.seats[forced.seat]
        behind = state.behind
        if forced.kind is ActionKind.POST_ANTE:
            if behind is not None and forced.chips >= behind:
                return RuleViolation("forced_bet_short", "all-in on the ante is not supported")
            state.ante += forced.chips
            return None
        if behind is not None and forced.chips > behind:
            return RuleViolation(
                "forced_bet_short", "a forced bet posted all-in for less is not supported"
            )
        exact = None if behind is None else behind == forced.chips
        if exact is not None and all_in is not None and all_in != exact:
            return RuleViolation(
                "all_in_mismatch", "all_in must be true exactly when the post commits the stack"
            )
        state.street = forced.chips
        state.live += forced.chips
        state.all_in = exact if exact is not None else bool(all_in)
        # The last live forced bet counts as a full bet (MATH.md §1.5, legal actions).
        self.bet = max(self.bet, forced.chips)
        self.full_raise = self.bet
        self.pointer = (self.order.index(forced.seat) + 1) % len(self.order)
        return None

    def non_folded(self) -> list[int]:
        """Seats still in the hand."""
        return [s for s in self.order if not self.seats[s].folded]

    def hand_over(self) -> bool:
        """At most one seat is left."""
        return len(self.non_folded()) <= 1

    def needs_to_act(self, seat: int) -> bool:
        """Tell whether a seat must act: it faces a bet, or has not acted and others can bet.

        A lone active seat that owes nothing does not act: no one is left to bet against.
        """
        state = self.seats[seat]
        if not state.active:
            return False
        if state.street < self.bet:
            return True
        return not state.acted and sum(self.seats[s].active for s in self.order) >= 2

    def next_to_act(self) -> int | None:
        """Return the seat whose turn it is, or ``None`` if the street is over."""
        if self.hand_over():
            return None
        n = len(self.order)
        for step in range(n):
            seat = self.order[(self.pointer + step) % n]
            if self.needs_to_act(seat):
                return seat
        return None

    def next_street(self) -> None:
        """Start the next street: nothing committed on it yet, first seat after the button."""
        self.street = STREETS[STREETS.index(self.street) + 1]
        self.reached.append(self.street)
        for state in self.seats.values():
            state.street = 0
            state.acted = False
        self.bet = 0
        self.full_raise = self.big_blind
        self.pointer = 0

    def has_raise_rights(self, seat: int) -> bool:
        """Not yet acted on this street, or facing at least a full raise since (TDA 49-A)."""
        state = self.seats[seat]
        return not state.acted or self.bet - state.street >= self.full_raise

    def violation(
        self, seat: int, kind: ActionKind, amount_to: int | None, all_in: bool
    ) -> RuleViolation | None:
        """Why the seat whose turn it is may not take this action, or ``None`` if it may.

        ``amount_to`` must already be filled in for calls (see the checker).
        """
        state = self.seats[seat]
        if kind is ActionKind.FOLD or kind is ActionKind.CHECK:
            if all_in:
                return RuleViolation("all_in_mismatch", f"a {kind} cannot put a seat all-in")
            if kind is ActionKind.CHECK and state.street < self.bet:
                return RuleViolation("check_facing_bet", f"cannot check facing a bet of {self.bet}")
            return None
        if amount_to is None:
            return RuleViolation("missing_amount", f"a {kind} needs amount_to_chips")
        if kind is ActionKind.CALL:
            if state.street >= self.bet:
                return RuleViolation("nothing_to_call", "there is no bet to call; check instead")
            if all_in and not state.street < amount_to <= self.bet:
                return RuleViolation(
                    "wrong_call_amount",
                    f"an all-in call must be above {state.street} and at most {self.bet}",
                )
            if not all_in and amount_to != self.bet:
                return RuleViolation("wrong_call_amount", f"a call is to {self.bet}")
        elif kind is ActionKind.BET:
            if self.bet > 0:
                return RuleViolation("bet_facing_bet", f"facing a bet of {self.bet}: raise instead")
            if amount_to < self.full_raise and not all_in:
                return RuleViolation(
                    "below_min_bet", f"the minimum bet is {self.full_raise} unless all-in"
                )
        elif kind is ActionKind.RAISE:
            if self.bet == 0:
                return RuleViolation("raise_without_bet", "there is no bet to raise: bet instead")
            if not self.has_raise_rights(seat):
                return RuleViolation(
                    "no_raise_rights",
                    "the betting was not reopened: the raises since this seat acted total less "
                    f"than a full raise of {self.full_raise}",
                )
            if amount_to <= self.bet:
                return RuleViolation("raise_not_above_bet", f"a raise must be above {self.bet}")
            if amount_to < self.bet + self.full_raise and not all_in:
                return RuleViolation(
                    "below_min_raise",
                    f"the minimum raise is to {self.bet + self.full_raise} unless all-in",
                )
        else:
            return RuleViolation("post_out_of_place", "forced bets come before all other actions")
        behind = state.behind
        if behind is not None:
            delta = amount_to - state.street
            if delta > behind:
                return RuleViolation(
                    "exceeds_stack", f"needs {delta} more chips but the seat has {behind}"
                )
            if all_in != (delta == behind):
                return RuleViolation(
                    "all_in_mismatch",
                    "all_in must be true exactly when the action commits the whole stack",
                )
        return None

    def apply(self, seat: int, kind: ActionKind, amount_to: int | None, all_in: bool) -> None:
        """Apply an action that :meth:`violation` accepted."""
        state = self.seats[seat]
        state.acted = True
        self.pointer = (self.order.index(seat) + 1) % len(self.order)
        if kind is ActionKind.FOLD:
            state.folded = True
            return
        if kind is ActionKind.CHECK or amount_to is None:
            return
        state.live += amount_to - state.street
        state.street = amount_to
        state.all_in = all_in
        if kind is ActionKind.BET or kind is ActionKind.RAISE:
            if amount_to - self.bet >= self.full_raise:
                self.full_raise = amount_to - self.bet
            self.bet = amount_to
