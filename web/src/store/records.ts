// Venues, players, sessions and hands on the phone, with the revision rule of ADR-0026
// (docs/plans/M4a.md §1.4):
//
//   A record is created with revision 1. Once a revision has been put into a sync request —
//   whether or not the response arrived — the next edit increments the revision.
//
// So sending the same revision twice is always safe (the server answers `unchanged`), and an edit
// made after a send always reaches the server as a higher revision (`replaced`).
//
// The pure functions decide; the async ones read and write IndexedDB around them.

import type { Store } from './db.ts'
import type { AnyEntry, Entry, RecordKind, RecordTypes } from './types.ts'

/** The revision an edit gets: 1 for a new record, the next one once the current one was sent. */
export function revisionForEdit(entry: AnyEntry | undefined): number {
  if (entry === undefined) return 1
  const current = entry.record.revision
  return entry.sentRevision !== null && entry.sentRevision >= current ? current + 1 : current
}

/**
 * The entry after the record is created or edited on the phone: the revision set by the rule
 * above, and pending. Whatever revision `record` carries is replaced.
 */
export function edited<K extends RecordKind>(
  entry: Entry<K> | undefined,
  kind: K,
  record: RecordTypes[K],
  now: Date,
): Entry<K> {
  if (entry !== undefined && (entry.kind !== kind || entry.id !== record.id)) {
    throw new Error(`entry ${entry.id} is a ${entry.kind}, not this ${kind}`)
  }
  return {
    kind,
    id: record.id,
    // `entry` is an Entry<K>, but the rule reads only fields every kind has.
    record: { ...record, revision: revisionForEdit(entry as AnyEntry | undefined) },
    sentRevision: entry?.sentRevision ?? null,
    serverRevision: entry?.serverRevision ?? null,
    state: { status: 'pending' },
    updatedAt: now.toISOString(),
  }
}

/** The entry once its current revision has been put into a sync request. */
export function markSent<E extends AnyEntry>(entry: E): E {
  return { ...entry, sentRevision: entry.record.revision }
}

/**
 * Keep the phone's version of a record in conflict: give it a revision above the server's, so the
 * next sync replaces the server's version (ADR-0026: resolving conflicts is the phone's job).
 */
export function keepMine<E extends AnyEntry>(entry: E, now: Date): E {
  if (entry.state.status !== 'conflict') throw new Error(`entry ${entry.id} is not in conflict`)
  const revision = Math.max(entry.record.revision, entry.serverRevision ?? 0) + 1
  return {
    ...entry,
    record: { ...entry.record, revision },
    state: { status: 'pending' },
    updatedAt: now.toISOString(),
  }
}

/** Entries the user must look at: conflicts and refused records (the "Needs attention" list). */
export function needsAttention(entries: readonly AnyEntry[]): AnyEntry[] {
  return entries.filter((e) => e.state.status === 'conflict' || e.state.status === 'invalid')
}

// --- IndexedDB -----------------------------------------------------------------------------------

/**
 * Create or edit a record and return its new entry. Reading the old entry and writing the new one
 * happen in one transaction, so a sync running at the same time cannot slip in between.
 */
export async function putRecord<K extends RecordKind>(
  db: Store,
  kind: K,
  record: RecordTypes[K],
  now: Date = new Date(),
): Promise<Entry<K>> {
  const tx = db.transaction('records', 'readwrite')
  const old = await tx.store.get(record.id)
  if (old !== undefined && old.kind !== kind) {
    throw new Error(`id ${record.id} already belongs to a ${old.kind}`)
  }
  // `old.kind === kind` was checked above; TypeScript cannot carry that over to the generic K.
  const entry = edited(old as Entry<K> | undefined, kind, record, now)
  await Promise.all([tx.store.put(entry as AnyEntry), tx.done])
  return entry
}

export function getEntry(db: Store, id: string): Promise<AnyEntry | undefined> {
  return db.get('records', id)
}

export function listEntries(db: Store, kind?: RecordKind): Promise<AnyEntry[]> {
  return kind === undefined ? db.getAll('records') : db.getAllFromIndex('records', 'kind', kind)
}

/** Keep the phone's version of a conflicting record; see `keepMine`. */
export async function resolveKeepMine(
  db: Store,
  id: string,
  now: Date = new Date(),
): Promise<AnyEntry> {
  const tx = db.transaction('records', 'readwrite')
  const entry = await tx.store.get(id)
  if (entry === undefined) throw new Error(`no record ${id}`)
  const kept = keepMine(entry, now)
  await Promise.all([tx.store.put(kept), tx.done])
  return kept
}
