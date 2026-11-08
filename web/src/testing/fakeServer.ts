// An in-memory stand-in for the server's sync endpoint, following ADR-0026 item by item: unknown
// id -> created; higher revision -> replaced; same revision and same content -> unchanged; same
// revision with other content, or a lower one -> conflict (the stored record stays). It checks
// references like `storage/repository.py` and can be told to refuse items, to be unreachable, or
// to lose a response after applying the batch. It does not check hands against the betting rules:
// the real server does, and the end-to-end tests (M4a Task 7) run against it.

import type { SyncBatch, SyncItemResult, SyncResponse } from '../sync/batch.ts'
import { LISTS } from '../sync/batch.ts'
import type { Transport } from '../sync/sync.ts'
import { KINDS, type Issue, type RecordKind, type RecordTypes } from '../store/types.ts'

type AnyRecord = RecordTypes[RecordKind]

/** JSON with object keys sorted, so equal content gives equal text whatever the key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

export class FakeServer implements Transport {
  readonly stored: Record<RecordKind, Map<string, AnyRecord>> = {
    venue: new Map(),
    player: new Map(),
    session: new Map(),
    hand: new Map(),
  }
  /** Every batch received, as received. */
  readonly posts: SyncBatch[] = []
  /** No answer at all: requests fail as if the Mac were asleep. */
  down = false
  /** Apply the next batch, then fail as if the response were lost on the way back. */
  loseNextResponse = false
  /** Issues for an item the server should refuse (as if its validation failed). */
  refuse: (kind: RecordKind, record: AnyRecord) => Issue[] = () => []
  /** Runs after a batch is applied and before its answer is returned. */
  beforeAnswer: (() => Promise<void>) | null = null

  postSync = async (batch: SyncBatch): Promise<SyncResponse> => {
    const received = structuredClone(batch)
    this.posts.push(received)
    if (this.down) throw new TypeError('Failed to fetch')
    const items: SyncItemResult[] = []
    for (const kind of KINDS) {
      const list: AnyRecord[] = received[LISTS[kind]]
      list.forEach((record, index) => items.push(this.apply(kind, index, record)))
    }
    if (this.beforeAnswer !== null) await this.beforeAnswer()
    if (this.loseNextResponse) {
      this.loseNextResponse = false
      throw new TypeError('Failed to fetch')
    }
    return { items }
  }

  fetchVenues = (): Promise<RecordTypes['venue'][]> => this.list('venue')
  fetchPlayers = (): Promise<RecordTypes['player'][]> => this.list('player')

  private list<K extends 'venue' | 'player'>(kind: K): Promise<RecordTypes[K][]> {
    if (this.down) return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve(structuredClone([...this.stored[kind].values()]) as RecordTypes[K][])
  }

  private apply(kind: RecordKind, index: number, record: AnyRecord): SyncItemResult {
    const result = { kind, index, id: record.id, issues: [] }
    const issues = [...this.refuse(kind, record), ...this.missingReferences(kind, record)]
    if (issues.length > 0) return { ...result, outcome: 'invalid', stored_revision: null, issues }
    const stored = this.stored[kind].get(record.id)
    if (stored === undefined || record.revision > stored.revision) {
      this.stored[kind].set(record.id, record)
      const outcome = stored === undefined ? 'created' : 'replaced'
      return { ...result, outcome, stored_revision: record.revision }
    }
    const same = record.revision === stored.revision && canonical(record) === canonical(stored)
    return { ...result, outcome: same ? 'unchanged' : 'conflict', stored_revision: stored.revision }
  }

  private missingReferences(kind: RecordKind, record: AnyRecord): Issue[] {
    const issues: Issue[] = []
    if (kind === 'session') {
      const venueId = (record as RecordTypes['session']).venue_id
      if (venueId != null && !this.stored.venue.has(venueId)) {
        issues.push({ path: ['venue_id'], code: 'unknown_venue', message: 'no venue with this id' })
      }
    }
    if (kind === 'hand') {
      const h = record as RecordTypes['hand']
      if (!this.stored.session.has(h.session_id)) {
        issues.push({
          path: ['session_id'],
          code: 'unknown_session',
          message: 'no session with this id',
        })
      }
      h.seats.forEach((s, i) => {
        if (s.player_id != null && !this.stored.player.has(s.player_id)) {
          issues.push({
            path: ['seats', i, 'player_id'],
            code: 'unknown_player',
            message: 'no player with this id',
          })
        }
      })
    }
    return issues
  }
}
