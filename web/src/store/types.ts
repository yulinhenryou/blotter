// What the phone keeps in IndexedDB (docs/plans/M4a.md §1.4). Records (venues, players,
// sessions, hands) use the API's generated types, so what is stored is exactly what is sent; the
// phone's own bookkeeping around them (revisions sent, sync state) uses camelCase.

import type { components } from '../api/schema'

type Schemas = components['schemas']

/** The four kinds of record the phone syncs, and the type of each. */
export interface RecordTypes {
  venue: Schemas['VenueRecord']
  player: Schemas['PlayerRecord']
  session: Schemas['SessionRecord']
  hand: Schemas['HandRecord']
}

export type RecordKind = keyof RecordTypes

/** In dependency order: a record refers only to kinds before it (ADR-0026). */
export const KINDS: readonly RecordKind[] = ['venue', 'player', 'session', 'hand']

/** Why the server refused an item: a field path, a stable code and a sentence. */
export type Issue = Schemas['IssueOut']

/**
 * Where a record stands with the server.
 *
 * - `pending`: to be sent (new, edited, or waiting for a record it refers to).
 * - `synced`: the server holds this revision.
 * - `conflict`: the server holds another version and kept it (ADR-0026); needs a decision.
 * - `invalid`: the server refused this revision; `issues` say why.
 */
export type SyncState =
  | { readonly status: 'pending' }
  | { readonly status: 'synced' }
  | { readonly status: 'conflict' }
  | { readonly status: 'invalid'; readonly issues: readonly Issue[] }

export type SyncStatus = SyncState['status']

/** One record with the phone's bookkeeping around it. */
export interface Entry<K extends RecordKind = RecordKind> {
  readonly kind: K
  /** The record's id (a UUIDv7), also the key in the store. */
  readonly id: string
  readonly record: RecordTypes[K]
  /**
   * The highest revision put into a sync request, whether or not its response arrived; `null`
   * if never sent. Once the current revision has been sent, the next edit increments it.
   */
  readonly sentRevision: number | null
  /** The revision the server last reported holding; `null` if it holds none (as far as known). */
  readonly serverRevision: number | null
  readonly state: SyncState
  /** When the phone last changed this entry (ISO 8601). */
  readonly updatedAt: string
}

/**
 * Any entry, as a union over the kinds: `{ kind: 'venue', record: VenueRecord, ... } | ...`.
 * Checking `entry.kind` then narrows `entry.record` to the right type.
 */
export type AnyEntry = { [K in RecordKind]: Entry<K> }[RecordKind]

/** A hand being entered. Never synced (M3a plan §1.2); its shape belongs to the capture screens. */
export interface Draft {
  /** The id the hand will have when saved. */
  readonly id: string
  readonly sessionId: string
  readonly updatedAt: string
  readonly body: unknown
}

/** How long one hand took to enter (M4a plan §1.5). Stays on the phone. */
export interface Timing {
  readonly handId: string
  /** When "New hand" was tapped. */
  readonly startedAt: string
  /** When "Save" was tapped; `null` while the hand is a draft. */
  readonly savedAt: string | null
  /** The draft was left and resumed. */
  readonly interrupted: boolean
}

/** One random-sample time of the protocol in docs/MATH.md §4.5, and what came of it. */
export interface Sample {
  readonly id: string
  readonly sessionId: string
  /** The drawn time; the next hand dealt after it is the sample hand. */
  readonly dueAt: string
  readonly outcome: 'open' | 'logged' | 'missed'
  /** The hand logged as the sample, when `outcome` is `logged`. */
  readonly handId: string | null
  readonly closedAt: string | null
}

/** A setting of the phone (a session's rake rule, its seat map, ...): a key and a JSON value. */
export interface Setting {
  readonly key: string
  readonly value: unknown
}
