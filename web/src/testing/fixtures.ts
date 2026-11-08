// Records and a fresh database for the store and sync tests.

import { IDBFactory } from 'fake-indexeddb'

import { openStore, type Store } from '../store/db.ts'
import type { RecordTypes } from '../store/types.ts'

/** A fixed UUIDv7, distinct for each n. */
export function idFor(n: number): string {
  return `019a5f00-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

/** A fresh, empty database: each call gets its own in-memory IndexedDB. */
export function freshStore(): Promise<Store> {
  globalThis.indexedDB = new IDBFactory()
  return openStore()
}

export const T0 = new Date('2026-11-08T20:00:00Z')

export function at(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000)
}

export function venue(n: number, name = `Venue ${String(n)}`): RecordTypes['venue'] {
  return { id: idFor(n), revision: 1, name, kind: 'live', timezone: 'Europe/Vienna' }
}

export function player(n: number, name = `Player ${String(n)}`): RecordTypes['player'] {
  return { id: idFor(n), revision: 1, display_name: name, is_hero: false, notes: null }
}

export function session(n: number, venueId: string | null = null): RecordTypes['session'] {
  return {
    id: idFor(n),
    revision: 1,
    venue_id: venueId,
    started_at: '2026-11-08T19:00:00Z',
    ended_at: null,
    small_blind_chips: 1,
    big_blind_chips: 2,
    currency: 'EUR',
    chip_unit_minor: 100,
    buy_in_chips: 200,
    cash_out_chips: null,
    notes: null,
  }
}

/**
 * A three-handed hand: seat 3 (the button) folds, hero (seat 1, small blind, Ah Kd) raises to 6,
 * the big blind folds. The uncalled 4 goes back to hero, who wins the pot of 2 + 2 = 4.
 */
export function hand(
  n: number,
  sessionId: string,
  clientSeq: number,
  villainId: string | null = null,
): RecordTypes['hand'] {
  const seat = (s: number, playerId: string | null = null) => ({
    seat: s,
    player_id: playerId,
    hole_cards: s === 1 ? (['Ah', 'Kd'] as [string, string]) : null,
    showed: false,
    starting_stack_chips: 200,
    stack_approximate: false,
  })
  type Kind = RecordTypes['hand']['actions'][number]['kind']
  const act = (s: number, kind: Kind, to: number | null = null) => ({
    street: 'preflop' as const,
    seat: s,
    kind,
    amount_to_chips: to,
    ante_chips: null,
    all_in: false,
    amount_approximate: false,
  })
  return {
    id: idFor(n),
    revision: 1,
    schema_version: 2,
    source: 'manual',
    session_id: sessionId,
    client_seq: clientSeq,
    played_at: null,
    table_size: 6,
    button_seat: 3,
    hero_seat: 1,
    dealt_in_seats: [1, 2, 3],
    stakes: { small_blind_chips: 1, big_blind_chips: 2, straddles_chips: [], ante: null },
    seats: [seat(1), seat(2, villainId), seat(3)],
    actions: [
      act(1, 'post_small_blind', 1),
      act(2, 'post_big_blind', 2),
      act(3, 'fold'),
      act(1, 'raise', 6),
      act(2, 'fold'),
    ],
    board: { flop: null, turn: null, river: null },
    results: [{ seat: 1, won_chips: 4 }],
    record_reason: 'notable',
    ends_at_hero_fold: false,
  }
}
