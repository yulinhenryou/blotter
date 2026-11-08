// Types shared by the betting rules (docs/MATH.md §1.5). Field names that also appear in the hand
// record (stakes, actions) keep the record's spelling, so a record's parts can be passed in as
// they are; the rules' own state uses camelCase.
//
// This module imports nothing from the rest of the app (M4a plan §1.1): the rules are pure
// functions of plain data.

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river']

export interface Ante {
  /** `per_player`: every dealt-in seat posts it; `big_blind`: the big blind posts it once. */
  readonly kind: 'per_player' | 'big_blind'
  readonly chips: number
}

export interface Stakes {
  readonly small_blind_chips: number
  readonly big_blind_chips: number
  readonly straddles_chips: readonly number[]
  readonly ante: Ante | null
}

export type ForcedKind = 'post_ante' | 'post_small_blind' | 'post_big_blind' | 'post_straddle'

/** One forced bet, in posting order. */
export interface ForcedBet {
  readonly seat: number
  readonly kind: ForcedKind
  readonly chips: number
}

/**
 * What a seat does when it is its turn. A discriminated union on `kind`: TypeScript knows that
 * `amount_to_chips` exists exactly when `kind` is `call`, `bet` or `raise`. `amount_to_chips` is
 * the seat's total on this street after the action ("raise to"), as in the hand record.
 */
export type Move =
  // Fold and check are separate members: `move.kind !== 'fold'` then rules out exactly one of them.
  | { readonly kind: 'fold'; readonly all_in?: boolean }
  | { readonly kind: 'check'; readonly all_in?: boolean }
  | {
      readonly kind: 'call' | 'bet' | 'raise'
      readonly amount_to_chips: number
      readonly all_in?: boolean
    }

/** A move with the seat and street it was made on: an action of the hand record. */
export type Play = Move & { readonly street: Street; readonly seat: number }

/** Why something is not allowed: a stable code (the server's codes) and a sentence. */
export interface Violation {
  readonly code: string
  readonly message: string
}

/** Either a value or the reason there is none. */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly violation: Violation }

/** What the rules need to know about a hand before its first action. */
export interface HandSetup {
  readonly stakes: Stakes
  readonly dealt_in_seats: readonly number[]
  readonly button_seat: number
  /** Starting stacks; `null` (or a missing seat) when unknown. */
  readonly stacks: readonly { readonly seat: number; readonly chips: number | null }[]
}
