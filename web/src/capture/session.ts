// What the phone keeps about a session beyond its record (docs/CAPTURE.md §1.2): table size,
// hero's seat, empty seats, straddles, ante, rake rule and the players at the table. None of it
// is sent: the record has no fields for it, and every hand carries its own stakes and seats.

import type { Ante } from '../rules/index.ts'
import type { RakeRule } from './form.ts'

export interface SeatPlayer {
  readonly seat: number
  readonly playerId: string
}

export interface SessionSetup {
  readonly setupVersion: 1
  readonly sessionId: string
  readonly tableSize: number
  readonly heroSeat: number
  readonly emptySeats: readonly number[]
  /** Straddle amounts in posting order; empty if the game has none. */
  readonly straddles: readonly number[]
  /** Whether a new hand starts with the straddles on (the per-hand toggle's default). */
  readonly straddleOn: boolean
  readonly ante: Ante | null
  readonly rake: RakeRule | null
  readonly seatPlayers: readonly SeatPlayer[]
}

/** The last session's choices, the defaults of the next one (docs/CAPTURE.md §1.2). */
export interface Defaults {
  readonly defaultsVersion: 1
  readonly venueId: string | null
  readonly smallBlind: number
  readonly bigBlind: number
  readonly straddles: readonly number[]
  readonly ante: Ante | null
  readonly rake: RakeRule | null
  readonly tableSize: number
  readonly heroSeat: number
}

export const FIRST_DEFAULTS: Defaults = {
  defaultsVersion: 1,
  venueId: null,
  smallBlind: 1,
  bigBlind: 2,
  straddles: [],
  ante: null,
  rake: { percent: 5, capChips: null, noFlopNoDrop: true },
  tableSize: 9,
  heroSeat: 1,
}

// Settings come back from IndexedDB as `unknown`. They were written by this code, so a version
// field is checked rather than every property; a value of another version is ignored.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function asSessionSetup(value: unknown): SessionSetup | null {
  return isObject(value) && value.setupVersion === 1 ? (value as unknown as SessionSetup) : null
}

export function asDefaults(value: unknown): Defaults | null {
  return isObject(value) && value.defaultsVersion === 1 ? (value as unknown as Defaults) : null
}

export const setupKey = (sessionId: string): string => `session-setup:${sessionId}`
export const DEFAULTS_KEY = 'defaults'
export const formKey = (handId: string): string => `hand-form:${handId}`

/** The seats dealt in by default: every seat of the table that is not marked empty. */
export function defaultDealtIn(setup: SessionSetup): number[] {
  const seats: number[] = []
  for (let seat = 1; seat <= setup.tableSize; seat++) {
    if (seat === setup.heroSeat || !setup.emptySeats.includes(seat)) seats.push(seat)
  }
  return seats
}
