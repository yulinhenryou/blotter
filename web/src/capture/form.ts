// A hand being entered (docs/CAPTURE.md §1.4–§1.6), as plain data, and the pure functions that
// change it and turn it into a hand record.
//
// The form stores only what Henry entered: hero's position, cards and stack, the moves of the
// seats that acted, the board, and the answers at the end. Everything else — whose turn it is,
// which street, the pots — is computed again by replaying the moves through the betting rules
// (`replay`). So the form cannot disagree with the rules, undo is "drop the last move", and a
// draft opened again resumes at the right step without storing the step.

import {
  applyMove,
  firstInfeasiblePrefix,
  forcedBets,
  handOver,
  legalActions,
  moveViolation,
  nextStreet,
  seatOrder,
  seatState,
  settle,
  startHand,
  streetOver,
  toAct,
  type BettingState,
  type LegalActions,
  type Move,
  type Pot,
  type Result,
  type Stakes,
  type Street,
  type Violation,
} from '../rules/index.ts'
import type { RecordTypes } from '../store/types.ts'
import { buttonFor, labelsBySeat, preflopLabels } from './positions.ts'

export type HandRecord = RecordTypes['hand']
export type RecordReason = HandRecord['record_reason']
type ActionRecord = HandRecord['actions'][number]
type SeatRecord = HandRecord['seats'][number]

/** A session's rake: a percentage of the pot up to a cap, or none. Kept on the phone only. */
export interface RakeRule {
  readonly percent: number
  /** `null`: no cap. */
  readonly capChips: number | null
  /** No rake when no flop is dealt. */
  readonly noFlopNoDrop: boolean
}

/** One entered action of a seat. The street is not stored: the replay knows it. */
export interface FormMove {
  readonly seat: number
  readonly move: Move
  readonly approximate: boolean
}

/** What is known about a villain at the end of the hand (docs/CAPTURE.md §1.6). */
export interface VillainEntry {
  readonly seat: number
  /** Shown cards; `null` if not shown. */
  readonly cards: readonly string[] | null
  /** Why there are no cards, once answered; `null` while unanswered (also means unknown). */
  readonly noCards: 'unknown' | 'mucked' | null
  readonly stack: number | null
  readonly stackApprox: boolean
}

export interface HandForm {
  readonly formVersion: 1
  readonly id: string
  readonly sessionId: string
  readonly clientSeq: number
  readonly tableSize: number
  readonly heroSeat: number
  /** The session's stakes with all its straddles; `straddled` says whether they are on. */
  readonly sessionStakes: Stakes
  readonly straddled: boolean
  readonly rake: RakeRule | null
  readonly dealtIn: readonly number[]
  readonly heroPosition: string | null
  readonly heroCards: readonly string[]
  readonly heroStack: number | null
  readonly heroStackApprox: boolean
  readonly heroStackConfirmed: boolean
  readonly playedAt: string | null
  readonly players: readonly { readonly seat: number; readonly playerId: string }[]
  readonly moves: readonly FormMove[]
  readonly board: readonly string[]
  /** After hero's fold with the hand still going: "Keep entering" was chosen. */
  readonly keepEntering: boolean
  /** "End here" was chosen: the record stops at hero's fold (ADR-0030). */
  readonly endsAtHeroFold: boolean
  readonly villains: readonly VillainEntry[]
  /** The winners of each pot, main pot first, at a showdown. */
  readonly winners: readonly (readonly number[])[]
  /** Amounts edited by hand; `null` while the proposed amounts stand. */
  readonly won: readonly { readonly seat: number; readonly chips: number }[] | null
  /** `null`: the default (`notable`, or `random_sample` while a sample is due). */
  readonly reason: RecordReason | null
}

/** Board cards dealt by the start of each street. */
export const BOARD_CARDS: Readonly<Record<Street, number>> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
}

const fail = <T>(code: string, message: string): Result<T> => ({
  ok: false,
  violation: { code, message },
})

const ok = <T>(value: T): Result<T> => ({ ok: true, value })

/** The stakes of this hand: the session's, with its straddles only if they are on. */
export function stakesOf(form: HandForm): Stakes {
  return form.straddled ? form.sessionStakes : { ...form.sessionStakes, straddles_chips: [] }
}

/** The button seat, once hero's position is chosen. */
export function buttonOf(form: HandForm): number | null {
  return form.heroPosition === null
    ? null
    : buttonFor(form.dealtIn, form.heroSeat, form.heroPosition)
}

export function setupComplete(form: HandForm): boolean {
  return (
    buttonOf(form) !== null &&
    form.heroCards.length === 2 &&
    form.heroStack !== null &&
    form.heroStackConfirmed
  )
}

// --- Replay --------------------------------------------------------------------------------------

export interface Replayed {
  readonly state: BettingState
  /** The street of each move, in order. */
  readonly streets: readonly Street[]
}

/** The forced bets posted, before any move. */
export function startOf(form: HandForm): Result<BettingState> {
  const button = buttonOf(form)
  if (button === null) return fail('no_position', "choose hero's position")
  return startHand({
    stakes: stakesOf(form),
    dealt_in_seats: form.dealtIn,
    button_seat: button,
    stacks: [{ seat: form.heroSeat, chips: form.heroStack }],
  })
}

/** Start later streets while their board cards are entered. */
function dealt(state: BettingState, board: number): BettingState {
  let s = state
  while (streetOver(s) && board >= BOARD_CARDS[nextStreetName(s)]) s = nextStreet(s)
  return s
}

function nextStreetName(state: BettingState): Street {
  return state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river'
}

/**
 * Replay the moves through the betting rules. The moves were checked when they were entered, so
 * this fails only if the setup no longer allows them (it cannot change once there are moves).
 */
export function replay(form: HandForm): Result<Replayed> {
  const start = startOf(form)
  if (!start.ok) return start
  let state = start.value
  const streets: Street[] = []
  for (const [i, { seat, move }] of form.moves.entries()) {
    state = dealt(state, form.board.length)
    if (toAct(state) !== seat) return fail('out_of_turn', `move ${String(i + 1)} is out of turn`)
    const problem = moveViolation(state, seat, move)
    if (problem !== null) return { ok: false, violation: problem }
    streets.push(state.street)
    state = applyMove(state, seat, move)
  }
  return ok({ state: dealt(state, form.board.length), streets })
}

/** Where the entry stands: which part of the hand screen to show. */
export type Phase =
  | { readonly kind: 'setup'; readonly problem: Violation | null }
  | { readonly kind: 'act'; readonly state: BettingState; readonly legal: LegalActions }
  | {
      readonly kind: 'board'
      readonly state: BettingState
      readonly street: Street
      /** Cards still to enter for that street. */
      readonly missing: number
    }
  | { readonly kind: 'heroFolded'; readonly state: BettingState }
  | { readonly kind: 'end'; readonly state: BettingState; readonly showdown: boolean }

function heroFolded(form: HandForm, state: BettingState): boolean {
  return seatState(state, form.heroSeat)?.folded ?? false
}

export function phaseOf(form: HandForm): Phase {
  const start = startOf(form)
  if (!setupComplete(form) || !start.ok) {
    // A missing position is not a problem to report: the position row is right there.
    const problem = start.ok || buttonOf(form) === null ? null : start.violation
    return { kind: 'setup', problem }
  }
  const replayed = replay(form)
  if (!replayed.ok) return { kind: 'setup', problem: replayed.violation }
  const { state } = replayed.value
  if (form.endsAtHeroFold) return { kind: 'end', state, showdown: false }
  if (handOver(state)) return { kind: 'end', state, showdown: false }
  if (heroFolded(form, state) && !form.keepEntering) return { kind: 'heroFolded', state }
  const legal = legalActions(state)
  if (legal !== null) return { kind: 'act', state, legal }
  if (streetOver(state)) {
    const street = nextStreetName(state)
    return { kind: 'board', state, street, missing: BOARD_CARDS[street] - form.board.length }
  }
  return { kind: 'end', state, showdown: true }
}

// --- Changes -------------------------------------------------------------------------------------
// Each returns a new form; the argument is never changed (React compares by reference).

export function choosePosition(form: HandForm, label: string): HandForm {
  return { ...form, heroPosition: label }
}

/** Dealt-in seats changed: keep hero's label if it still exists for that many seats. */
export function toggleDealtIn(form: HandForm, seat: number): HandForm {
  if (seat === form.heroSeat || form.moves.length > 0) return form
  const dealtIn = form.dealtIn.includes(seat)
    ? form.dealtIn.filter((s) => s !== seat)
    : [...form.dealtIn, seat].sort((a, b) => a - b)
  if (dealtIn.length < 2) return form
  const keep =
    form.heroPosition !== null && preflopLabels(dealtIn.length).includes(form.heroPosition)
  return { ...form, dealtIn, heroPosition: keep ? form.heroPosition : null }
}

/** Every card in use in the hand: hero's, the board's and shown villain cards. */
export function usedCards(form: HandForm): Set<string> {
  return new Set([...form.heroCards, ...form.board, ...form.villains.flatMap((v) => v.cards ?? [])])
}

/**
 * Apply a move for the seat to act. Returns the reason if the rules forbid it (the screens offer
 * only legal moves, so this is a second line of defence).
 */
export function act(form: HandForm, move: Move, approximate = false): Result<HandForm> {
  const phase = phaseOf(form)
  if (phase.kind !== 'act') return fail('not_acting', 'no seat is to act')
  const seat = phase.legal.seat
  const problem = moveViolation(phase.state, seat, move)
  if (problem !== null) return { ok: false, violation: problem }
  return ok({ ...form, moves: [...form.moves, { seat, move, approximate }] })
}

/**
 * "Fold to" (docs/CAPTURE.md §1.5): fold every seat from the one to act up to `target`, which then
 * acts. Refused if hero would be folded on the way or the street would end before `target`.
 */
export function foldTo(form: HandForm, target: number): Result<HandForm> {
  const phase = phaseOf(form)
  if (phase.kind !== 'act') return fail('not_acting', 'no seat is to act')
  let state = phase.state
  const moves = [...form.moves]
  for (;;) {
    const seat = toAct(state)
    if (seat === target) break
    if (seat === null) return fail('not_reached', `the betting ends before seat ${String(target)}`)
    if (seat === form.heroSeat) return fail('hero_in_between', 'hero acts before that seat')
    const fold: Move = { kind: 'fold' }
    state = applyMove(state, seat, fold)
    moves.push({ seat, move: fold, approximate: false })
  }
  return moves.length === form.moves.length
    ? fail('no_change', 'that seat is to act')
    : ok({ ...form, moves })
}

/**
 * Undo the last move, the board cards entered after it, and any answer that depended on it.
 * Before the first move, undo reopens the setup.
 */
export function undo(form: HandForm): HandForm {
  const replayed = replay(form)
  const last = form.moves.length - 1
  if (last < 0 || !replayed.ok) return { ...form, heroStackConfirmed: false }
  const street = replayed.value.streets[last] ?? 'preflop'
  return {
    ...form,
    moves: form.moves.slice(0, last),
    board: form.board.slice(0, BOARD_CARDS[street]),
    keepEntering: false,
    endsAtHeroFold: false,
    winners: [],
    won: null,
  }
}

export function addBoardCard(form: HandForm, card: string): HandForm {
  const phase = phaseOf(form)
  if (phase.kind !== 'board' || usedCards(form).has(card)) return form
  return { ...form, board: [...form.board, card] }
}

/** Remove a board card of the street being entered (a mis-tap in the picker). */
export function removeBoardCard(form: HandForm, card: string): HandForm {
  const phase = phaseOf(form)
  const first =
    phase.kind === 'board' ? BOARD_CARDS[phase.street] - (phase.street === 'flop' ? 3 : 1) : 0
  const index = form.board.indexOf(card)
  if (phase.kind !== 'board' || index < first) return form
  return { ...form, board: form.board.filter((c) => c !== card) }
}

export function endHere(form: HandForm): HandForm {
  return { ...form, endsAtHeroFold: true, keepEntering: false }
}

export function keepEntering(form: HandForm): HandForm {
  return { ...form, keepEntering: true }
}

export function villainOf(form: HandForm, seat: number): VillainEntry {
  return (
    form.villains.find((v) => v.seat === seat) ?? {
      seat,
      cards: null,
      noCards: null,
      stack: null,
      stackApprox: true,
    }
  )
}

export function setVillain(form: HandForm, entry: VillainEntry): HandForm {
  return {
    ...form,
    villains: [...form.villains.filter((v) => v.seat !== entry.seat), entry].sort(
      (a, b) => a.seat - b.seat,
    ),
  }
}

/** Tap a winner of pot `index`: toggles it (several winners split the pot). */
export function toggleWinner(form: HandForm, index: number, seat: number): HandForm {
  const winners = [...form.winners]
  while (winners.length <= index) winners.push([])
  const current = winners[index] ?? []
  winners[index] = current.includes(seat) ? current.filter((s) => s !== seat) : [...current, seat]
  return { ...form, winners, won: null }
}

// --- End of the hand -----------------------------------------------------------------------------

/** Villains still in at the end (or at hero's fold), whose cards may be entered. */
export function villainsInAtEnd(form: HandForm, state: BettingState): number[] {
  return state.seats.filter((s) => !s.folded && s.seat !== form.heroSeat).map((s) => s.seat)
}

/**
 * Villains whose stack is asked at the end: they called, bet or raised, did not go all-in (an
 * all-in stack is derived by the server: s = c, MATH.md §1.5).
 */
export function villainsForStacks(form: HandForm, state: BettingState): number[] {
  const acted = new Set(
    form.moves
      .filter((m) => m.seat !== form.heroSeat && m.move.kind !== 'fold' && m.move.kind !== 'check')
      .map((m) => m.seat),
  )
  return state.seats
    .filter((s) => acted.has(s.seat) && !s.allIn)
    .map((s) => s.seat)
    .sort((a, b) => a - b)
}

/** Why a villain's entered stack cannot be right, or `null`. A seat not all-in had chips left. */
export function stackProblem(state: BettingState, seat: number, chips: number): string | null {
  const s = seatState(state, seat)
  if (s === undefined) return null
  const total = s.ante + s.live
  return chips > total
    ? null
    : `Seat ${String(seat)} put in ${String(total)} and was not all-in: the stack must be more`
}

/** The rake the session's rule takes from a pot (MATH.md §1.5): rounded down, capped. */
export function rakeFor(total: number, rule: RakeRule | null, flopDealt: boolean): number {
  if (rule === null || (rule.noFlopNoDrop && !flopDealt)) return 0
  const rake = Math.floor((total * rule.percent) / 100)
  return rule.capChips === null ? rake : Math.min(rake, rule.capChips)
}

/**
 * Split the pots among their winners after the rake (docs/CAPTURE.md §1.6): the rake comes out of
 * the main pot first; each pot is divided equally in whole chips, and the odd chips go one each
 * to the winners nearest the button's left (`order` is the seat order from the button's left).
 */
export function proposeWon(
  pots: readonly Pot[],
  winners: readonly (readonly number[])[],
  rake: number,
  order: readonly number[],
): Map<number, number> {
  const won = new Map<number, number>()
  let rakeLeft = rake
  pots.forEach((pot, i) => {
    const take = Math.min(rakeLeft, pot.chips)
    rakeLeft -= take
    const chips = pot.chips - take
    const seats = [...(winners[i] ?? [])].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    if (seats.length === 0) return
    const share = Math.floor(chips / seats.length)
    const odd = chips - share * seats.length
    seats.forEach((seat, k) => {
      won.set(seat, (won.get(seat) ?? 0) + share + (k < odd ? 1 : 0))
    })
  })
  return won
}

export interface Payout {
  readonly pots: readonly Pot[]
  /** Winners of each pot: the last seat in for every pot, or the seats tapped at a showdown. */
  readonly winners: readonly (readonly number[])[]
  readonly rake: number
  readonly won: ReadonlyMap<number, number>
  /** Why the results cannot be saved yet, or `null`. */
  readonly problem: string | null
}

export function payoutOf(form: HandForm, state: BettingState): Payout {
  const { pots } = settle(state)
  const left = state.seats.filter((s) => !s.folded).map((s) => s.seat)
  const lastOne = left.length === 1 ? (left[0] ?? null) : null
  // A pot with one eligible seat (or a hand with one seat left) needs no tap.
  const winners = pots.map((pot, i) =>
    lastOne !== null
      ? [lastOne]
      : pot.eligible.length === 1
        ? pot.eligible
        : (form.winners[i] ?? []),
  )
  const total = pots.reduce((sum, p) => sum + p.chips, 0)
  const rake = rakeFor(total, form.rake, form.board.length >= 3)
  const button = buttonOf(form) ?? form.heroSeat
  const order = seatOrder(form.dealtIn, button)
  const won =
    form.won === null
      ? proposeWon(pots, winners, rake, order)
      : new Map(form.won.map((w) => [w.seat, w.chips]))

  let problem: string | null = null
  const unclaimed = winners.findIndex((w) => w.length === 0)
  if (unclaimed >= 0) {
    problem = `Tap the winner of the ${unclaimed === 0 ? 'main pot' : `side pot ${String(unclaimed)}`}`
  } else {
    const prefix = firstInfeasible(pots, won)
    if (prefix !== null) problem = prefix
  }
  // With proposed amounts the rake is the session rule's; with amounts typed in, it is whatever
  // they leave of the pot. (Before every pot has a winner, "the pot minus what is won" would
  // count the unclaimed chips as rake.)
  const taken = form.won === null ? rake : total - [...won.values()].reduce((a, b) => a + b, 0)
  return { pots, winners, rake: taken, won, problem }
}

function firstInfeasible(pots: readonly Pot[], won: ReadonlyMap<number, number>): string | null {
  const eligible = new Set(pots.flatMap((p) => p.eligible))
  for (const [seat, chips] of won) {
    if (chips > 0 && !eligible.has(seat)) return `Seat ${String(seat)} folded and cannot win`
  }
  const j = firstInfeasiblePrefix(pots, won)
  if (j === null) return null
  if (j === pots.length) return 'More chips won than in the pot'
  const held = pots.slice(0, j).reduce((sum, p) => sum + p.chips, 0)
  return j === 1
    ? `Seats in the main pot only are given more than it holds (${String(held)})`
    : `Seats in pots 1 to ${String(j)} only are given more than they hold (${String(held)})`
}

/** Hero's stack after the hand, for the next hand's prefill; `null` if not known. */
export function heroStackAfter(form: HandForm): number | null {
  if (form.heroStack === null) return null
  const phase = phaseOf(form)
  if (phase.kind !== 'end') return null
  const hero = seatState(phase.state, form.heroSeat)
  if (hero === undefined) return null
  if (!form.endsAtHeroFold) {
    const payout = payoutOf(form, phase.state)
    const live = settle(phase.state).live.get(form.heroSeat) ?? 0
    return form.heroStack - hero.ante - live + (payout.won.get(form.heroSeat) ?? 0)
  }
  return form.heroStack - hero.ante - hero.live
}

// --- The record ----------------------------------------------------------------------------------

/** Why the hand cannot be saved yet, or `null`. */
export function saveProblem(form: HandForm): string | null {
  const phase = phaseOf(form)
  if (phase.kind !== 'end') return 'The hand is not finished'
  for (const seat of villainsForStacks(form, phase.state)) {
    const stack = villainOf(form, seat).stack
    if (stack !== null) {
      const problem = stackProblem(phase.state, seat, stack)
      if (problem !== null) return problem
    }
  }
  return form.endsAtHeroFold ? null : payoutOf(form, phase.state).problem
}

/**
 * The hand record (schema version 2) for a finished form. Forced bets and every entered action
 * are explicit; the server derives completeness, rake and hero's net and checks everything again.
 */
export function toRecord(form: HandForm, reason: RecordReason): Result<HandRecord> {
  const problem = saveProblem(form)
  if (problem !== null) return fail('not_ready', problem)
  const start = startOf(form)
  const replayed = replay(form)
  const button = buttonOf(form)
  if (!start.ok || !replayed.ok || button === null) return fail('not_ready', 'setup incomplete')
  const { state, streets } = replayed.value
  const stakes = stakesOf(form)
  const dealtIn = [...form.dealtIn].sort((a, b) => a - b)

  const posts: ActionRecord[] = (forcedBets(stakes, dealtIn, button) ?? []).map((forced) => {
    const ante = forced.kind === 'post_ante'
    return {
      street: 'preflop',
      seat: forced.seat,
      kind: forced.kind,
      amount_to_chips: ante ? null : forced.chips,
      ante_chips: ante ? forced.chips : null,
      all_in: !ante && (seatState(start.value, forced.seat)?.allIn ?? false),
      amount_approximate: false,
    }
  })
  const actions: ActionRecord[] = form.moves.map(({ seat, move, approximate }, i) => ({
    street: streets[i] ?? 'preflop',
    seat,
    kind: move.kind,
    amount_to_chips: move.kind === 'fold' || move.kind === 'check' ? null : move.amount_to_chips,
    ante_chips: null,
    all_in: move.all_in ?? false,
    amount_approximate: approximate,
  }))

  const players = new Map(form.players.map((p) => [p.seat, p.playerId]))
  const seats: SeatRecord[] = dealtIn.map((seat) => {
    const playerId = players.get(seat) ?? null
    if (seat === form.heroSeat) {
      return {
        seat,
        player_id: playerId,
        hole_cards: [form.heroCards[0] ?? '', form.heroCards[1] ?? ''],
        showed: false,
        starting_stack_chips: form.heroStack,
        stack_approximate: form.heroStackApprox,
      }
    }
    const villain = villainOf(form, seat)
    const cards = villain.cards?.length === 2 ? villain.cards : null
    return {
      seat,
      player_id: playerId,
      hole_cards: cards === null ? null : [cards[0] ?? '', cards[1] ?? ''],
      showed: cards !== null,
      starting_stack_chips: villain.stack,
      stack_approximate: villain.stack !== null && villain.stackApprox,
    }
  })

  const board = form.board
  const results = form.endsAtHeroFold
    ? []
    : [...payoutOf(form, state).won]
        .filter(([, chips]) => chips > 0)
        .sort((a, b) => a[0] - b[0])
        .map(([seat, won_chips]) => ({ seat, won_chips }))

  return ok<HandRecord>({
    id: form.id,
    revision: 1,
    schema_version: 2,
    source: 'manual',
    session_id: form.sessionId,
    client_seq: form.clientSeq,
    played_at: form.playedAt,
    table_size: form.tableSize,
    button_seat: button,
    hero_seat: form.heroSeat,
    dealt_in_seats: dealtIn,
    // The record's type has mutable arrays; the rules' types are read-only.
    stakes: { ...stakes, straddles_chips: [...stakes.straddles_chips] },
    seats,
    actions: [...posts, ...actions],
    board: {
      flop: board.length >= 3 ? [board[0] ?? '', board[1] ?? '', board[2] ?? ''] : null,
      turn: board[3] ?? null,
      river: board[4] ?? null,
    },
    results,
    record_reason: reason,
    ends_at_hero_fold: form.endsAtHeroFold,
  })
}

/** Hero's position label for a form whose setup is done, for lists. */
export function positionLabel(form: HandForm): string | null {
  const button = buttonOf(form)
  return button === null ? null : (labelsBySeat(form.dealtIn, button).get(form.heroSeat) ?? null)
}
