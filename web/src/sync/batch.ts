// The pure half of sync (docs/plans/M4a.md §1.4, ADR-0026): which entries go into a batch, how the
// server's answer changes each entry, how the server's venues and players fill a fresh phone, and
// the JSON export. No IndexedDB and no HTTP here; `sync.ts` does those around these functions.

import type { components } from '../api/schema'
import { markSent } from '../store/records.ts'
import { KINDS, type AnyEntry, type RecordKind, type RecordTypes } from '../store/types.ts'

export type SyncBatch = components['schemas']['SyncBatch']
export type SyncResponse = components['schemas']['SyncResponse']
export type SyncItemResult = components['schemas']['SyncItemResult']

/** The batch's list for each kind. */
export const LISTS = {
  venue: 'venues',
  player: 'players',
  session: 'sessions',
  hand: 'hands',
} as const satisfies Record<RecordKind, keyof SyncBatch>

/** The server's codes for "refers to a record the server does not hold" (`storage/repository.py`). */
const REFERENCE_CODES: ReadonlySet<string> = new Set([
  'unknown_venue',
  'unknown_player',
  'unknown_session',
])

/** The ids of the records an entry refers to. */
export function references(entry: AnyEntry): string[] {
  switch (entry.kind) {
    case 'venue':
    case 'player':
      return []
    case 'session':
      return entry.record.venue_id == null ? [] : [entry.record.venue_id]
    case 'hand':
      return [
        entry.record.session_id,
        ...entry.record.seats.flatMap((s) => (s.player_id == null ? [] : [s.player_id])),
      ]
  }
}

function byKind(entries: readonly AnyEntry[]): AnyEntry[] {
  return [...entries].sort(
    (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.id.localeCompare(b.id),
  )
}

/**
 * The pending entries to send now, in dependency order.
 *
 * A pending entry waits while it refers to a record that is on the phone but that the server does
 * not hold and that is not going in this batch (a session the server refused, say): sending it
 * would only come back `invalid`. A reference to a record the phone does not have is left to the
 * server to judge.
 */
export function toSend(entries: readonly AnyEntry[]): AnyEntry[] {
  const local = new Map(entries.map((e) => [e.id, e]))
  const going = new Set<string>()
  const chosen: AnyEntry[] = []
  // Kinds only refer to earlier kinds, so one pass in kind order sees every reference decided.
  for (const entry of byKind(entries)) {
    if (entry.state.status !== 'pending') continue
    // Not on the phone (`undefined !== null`), held by the server, or going now.
    const ready = references(entry).every(
      (id) => local.get(id)?.serverRevision !== null || going.has(id),
    )
    if (ready) {
      going.add(entry.id)
      chosen.push(entry)
    }
  }
  return chosen
}

/** The records of these entries as a sync batch, each list in the given order. */
export function batchOf(entries: readonly AnyEntry[]): SyncBatch {
  const batch: SyncBatch = { venues: [], players: [], sessions: [], hands: [] }
  for (const entry of entries) {
    // A switch, so TypeScript knows which list each record type goes into.
    switch (entry.kind) {
      case 'venue':
        batch.venues.push(entry.record)
        break
      case 'player':
        batch.players.push(entry.record)
        break
      case 'session':
        batch.sessions.push(entry.record)
        break
      case 'hand':
        batch.hands.push(entry.record)
        break
    }
  }
  return batch
}

/** Mark the entries as sent and build their batch. */
export function prepare(entries: readonly AnyEntry[]): { sent: AnyEntry[]; batch: SyncBatch } {
  const sent = entries.map(markSent)
  return { sent, batch: batchOf(sent) }
}

/**
 * The entry after the server answered for the revision `sentRevision` of it.
 *
 * If the record was edited while the request was under way, the answer is about an older revision:
 * the entry stays pending (its new revision is still to be sent), and only what the server holds
 * is noted.
 */
export function applyResult(
  entry: AnyEntry,
  sentRevision: number,
  result: SyncItemResult,
): AnyEntry {
  const serverRevision = result.stored_revision ?? entry.serverRevision
  if (entry.record.revision !== sentRevision) return { ...entry, serverRevision }
  switch (result.outcome) {
    case 'created':
    case 'replaced':
    case 'unchanged':
      return { ...entry, serverRevision, state: { status: 'synced' } }
    case 'conflict':
      return { ...entry, serverRevision, state: { status: 'conflict' } }
    case 'invalid':
      return { ...entry, serverRevision, state: { status: 'invalid', issues: result.issues } }
  }
}

/**
 * Match the server's results to the entries sent, by kind and position in the batch, and return
 * the entries that change. A result that matches nothing sent (wrong position or id) is ignored,
 * so its entry stays pending and goes out again.
 *
 * @param sent     The entries as sent, in batch order.
 * @param current  The entries as they are now (they may have been edited meanwhile).
 */
export function applyResponse(
  sent: readonly AnyEntry[],
  current: ReadonlyMap<string, AnyEntry>,
  response: SyncResponse,
): AnyEntry[] {
  const positions = new Map<RecordKind, AnyEntry[]>(KINDS.map((k) => [k, []]))
  for (const entry of sent) positions.get(entry.kind)?.push(entry)
  const changed: AnyEntry[] = []
  for (const result of response.items) {
    const was = positions.get(result.kind)?.[result.index]
    if (was?.id !== result.id) continue // no such position, or another record there
    const now = current.get(was.id)
    if (now === undefined) continue // deleted on the phone meanwhile
    changed.push(applyResult(now, was.record.revision, result))
  }
  return changed
}

/**
 * Entries refused only because a record they refer to was refused too go back to pending: they
 * wait (`toSend`) until that record reaches the server, then go out with no edit needed. Returns
 * the entries that change.
 */
export function requeueWaiting(entries: readonly AnyEntry[]): AnyEntry[] {
  const local = new Map(entries.map((e) => [e.id, e]))
  const changed: AnyEntry[] = []
  for (const entry of entries) {
    if (entry.state.status !== 'invalid') continue
    const issues = entry.state.issues
    if (issues.length === 0 || !issues.every((i) => REFERENCE_CODES.has(i.code))) continue
    // On the phone and not held by the server (a missing record gives `undefined`, not `null`).
    const blocked = references(entry).some((id) => local.get(id)?.serverRevision === null)
    if (blocked) changed.push({ ...entry, state: { status: 'pending' } })
  }
  return changed
}

/**
 * A venue or player from the server's list (`GET /venues`, `GET /players`), merged into the phone:
 * a record the phone lacks is added as synced (a reinstalled phone gets its pick lists back); a
 * synced record the server holds a newer revision of is replaced; a record with local changes is
 * left alone apart from noting the server's revision. Returns `null` when nothing changes.
 */
export function fromServer<K extends 'venue' | 'player'>(
  local: AnyEntry | undefined,
  kind: K,
  record: RecordTypes[K],
  now: Date,
): AnyEntry | null {
  const fresh = {
    kind,
    id: record.id,
    record,
    sentRevision: record.revision,
    serverRevision: record.revision,
    state: { status: 'synced' },
    updatedAt: now.toISOString(),
  } as const
  // `fresh` is an Entry<K> with K one of two kinds; the cast tells TypeScript it is one of the
  // union's members.
  if (local === undefined) return fresh as AnyEntry
  if (local.kind !== kind) return null
  if (local.state.status === 'synced' && record.revision > local.record.revision) {
    return fresh as AnyEntry
  }
  if (local.serverRevision === null || record.revision > local.serverRevision) {
    return { ...local, serverRevision: record.revision }
  }
  return null
}

/**
 * The JSON export (M4a plan §1.4): every record not yet synced, plus every record those refer to,
 * as one sync batch. The file stands alone — it can be posted to `/api/v1/sync` as it is, even to
 * a server that has lost the records it refers to — and it holds nothing that is not in a record.
 */
export function exportBatch(entries: readonly AnyEntry[]): SyncBatch {
  const local = new Map(entries.map((e) => [e.id, e]))
  const chosen = new Map<string, AnyEntry>()
  const add = (entry: AnyEntry): void => {
    if (chosen.has(entry.id)) return
    chosen.set(entry.id, entry)
    for (const id of references(entry)) {
      const ref = local.get(id)
      if (ref !== undefined) add(ref)
    }
  }
  for (const entry of entries) if (entry.state.status !== 'synced') add(entry)
  return batchOf(byKind([...chosen.values()]))
}
