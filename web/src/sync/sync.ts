// Sync with the server (docs/plans/M4a.md §1.4): send every pending record in one batch, record
// each item's outcome, then merge the server's venues and players into the pick lists.
//
// Order matters for safety. Entries are marked as sent in IndexedDB *before* the request goes out,
// so if the response is lost (the phone goes offline, the Mac sleeps), the next edit still gets a
// new revision. The answer is applied to the entries as they are *when it arrives*, which may have
// been edited meanwhile (`applyResult`).

import { fetchPlayers, fetchVenues, postSync } from '../api/client.ts'
import type { Store } from '../store/db.ts'
import type { AnyEntry, RecordTypes, SyncStatus } from '../store/types.ts'
import {
  applyResponse,
  fromServer,
  prepare,
  requeueWaiting,
  toSend,
  type SyncBatch,
  type SyncResponse,
} from './batch.ts'

/** How sync reaches the server. The real one is `httpTransport`; tests pass a fake server. */
export interface Transport {
  postSync(batch: SyncBatch): Promise<SyncResponse>
  fetchVenues(): Promise<RecordTypes['venue'][]>
  fetchPlayers(): Promise<RecordTypes['player'][]>
}

export const httpTransport: Transport = { postSync, fetchVenues, fetchPlayers }

export interface SyncReport {
  /** Records put into the batch; 0 when nothing was pending (no request was made). */
  readonly sent: number
  /** The server answered the batch (or, with nothing to send, the pick-list requests). */
  readonly reached: boolean
  /** What went wrong, if the server could not be reached or refused the request. */
  readonly error: string | null
  /** Entries per state after the run. */
  readonly counts: Readonly<Record<SyncStatus, number>>
}

function count(entries: readonly AnyEntry[]): Record<SyncStatus, number> {
  const counts = { pending: 0, synced: 0, conflict: 0, invalid: 0 }
  for (const entry of entries) counts[entry.state.status] += 1
  return counts
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Choose what to send and mark it as sent, in one transaction (no edit can slip in between). */
async function takeBatch(db: Store): Promise<ReturnType<typeof prepare>> {
  const tx = db.transaction('records', 'readwrite')
  const prepared = prepare(toSend(await tx.store.getAll()))
  await Promise.all([...prepared.sent.map((e) => tx.store.put(e)), tx.done])
  return prepared
}

async function applyAnswer(db: Store, sent: AnyEntry[], response: SyncResponse): Promise<void> {
  const tx = db.transaction('records', 'readwrite')
  const current = new Map((await tx.store.getAll()).map((e) => [e.id, e]))
  const changed = new Map(applyResponse(sent, current, response).map((e) => [e.id, e]))
  for (const [id, entry] of changed) current.set(id, entry)
  for (const entry of requeueWaiting([...current.values()])) changed.set(entry.id, entry)
  await Promise.all([...[...changed.values()].map((e) => tx.store.put(e)), tx.done])
}

async function mergePickLists(
  db: Store,
  venues: readonly RecordTypes['venue'][],
  players: readonly RecordTypes['player'][],
  now: Date,
): Promise<void> {
  const tx = db.transaction('records', 'readwrite')
  const changed: AnyEntry[] = []
  for (const venue of venues) {
    const entry = fromServer(await tx.store.get(venue.id), 'venue', venue, now)
    if (entry !== null) changed.push(entry)
  }
  for (const player of players) {
    const entry = fromServer(await tx.store.get(player.id), 'player', player, now)
    if (entry !== null) changed.push(entry)
  }
  await Promise.all([...changed.map((e) => tx.store.put(e)), tx.done])
}

/** One sync run. Never rejects: what went wrong is in the report. */
export async function syncOnce(
  db: Store,
  transport: Transport = httpTransport,
  now: () => Date = () => new Date(),
): Promise<SyncReport> {
  let reached = false
  let error: string | null = null
  const { sent, batch } = await takeBatch(db)
  if (sent.length > 0) {
    try {
      const response = await transport.postSync(batch)
      reached = true
      await applyAnswer(db, sent, response)
    } catch (e) {
      error = message(e)
    }
  }
  if (error === null) {
    try {
      const [venues, players] = await Promise.all([
        transport.fetchVenues(),
        transport.fetchPlayers(),
      ])
      reached = true
      await mergePickLists(db, venues, players, now())
    } catch (e) {
      error = message(e)
    }
  }
  return { sent: sent.length, reached, error, counts: count(await db.getAll('records')) }
}

/**
 * Wrap a task so that runs never overlap: a call while a run is under way returns one shared
 * follow-up run, which starts when the current one ends. So a record saved during a sync is sent
 * by the next run, and a burst of triggers costs at most one extra run.
 */
export function serialized<T>(task: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null
  let queued: Promise<T> | null = null
  const run = (): Promise<T> => {
    if (running === null) {
      running = task().finally(() => {
        running = null
      })
      return running
    }
    queued ??= running
      .catch(() => undefined)
      .then(() => {
        queued = null
        return run()
      })
    return queued
  }
  return run
}

/**
 * Run `sync` now and whenever the browser comes back online; returns a function that stops
 * listening. (Sync after a save and on "Sync now" is triggered by the capture screens.)
 */
export function autoSync(sync: () => Promise<unknown>, target: EventTarget = window): () => void {
  const run = (): void => {
    void sync()
  }
  run()
  target.addEventListener('online', run)
  return () => {
    target.removeEventListener('online', run)
  }
}
