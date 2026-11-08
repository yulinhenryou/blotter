// Sync against a fake server that follows ADR-0026 (src/testing/fakeServer.ts), on an in-memory
// IndexedDB. The M4a plan's Task 5 cases: the revision rule across a lost response, every outcome
// of ADR-0026 as a per-item state, a batch that partly fails, and the JSON export.

import { describe, expect, it } from 'vitest'

import { getEntry, listEntries, putRecord, resolveKeepMine } from '../store/records.ts'
import type { Store } from '../store/db.ts'
import type { AnyEntry, SyncStatus } from '../store/types.ts'
import { FakeServer } from '../testing/fakeServer.ts'
import { at, freshStore, hand, idFor, player, session, venue } from '../testing/fixtures.ts'
import { exportBatch, LISTS, toSend } from './batch.ts'
import { autoSync, serialized, syncOnce } from './sync.ts'

async function states(db: Store): Promise<Record<string, [SyncStatus, number, number | null]>> {
  const entries = await listEntries(db)
  return Object.fromEntries(
    entries.map((e) => [e.id, [e.state.status, e.record.revision, e.serverRevision]]),
  )
}

/** A session with a venue, a known villain and two hands, all saved on the phone. */
async function sessionWithHands(db: Store) {
  const v = venue(1)
  const villain = player(2)
  const s = session(10, v.id)
  const h1 = hand(20, s.id, 1, villain.id)
  const h2 = hand(21, s.id, 2)
  await putRecord(db, 'venue', v, at(0))
  await putRecord(db, 'player', villain, at(0))
  await putRecord(db, 'session', s, at(0))
  await putRecord(db, 'hand', h1, at(1))
  await putRecord(db, 'hand', h2, at(2))
  return { v, villain, s, h1, h2 }
}

describe('a lost response', () => {
  it('is safe to retry: the same revision comes back unchanged and is stored once', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const { s, h1 } = await sessionWithHands(db)

    server.loseNextResponse = true
    const lost = await syncOnce(db, server)
    expect(lost).toMatchObject({ sent: 5, reached: false, error: 'Failed to fetch' })
    expect(server.stored.hand.size).toBe(2) // the server did apply it
    const afterLoss = await getEntry(db, h1.id)
    expect([afterLoss?.state.status, afterLoss?.sentRevision]).toEqual(['pending', 1])

    const retry = await syncOnce(db, server)
    expect(retry).toMatchObject({ sent: 5, reached: true, error: null })
    expect(retry.counts).toEqual({ pending: 0, synced: 5, conflict: 0, invalid: 0 })
    expect(server.posts[1]?.hands.map((h) => h.revision)).toEqual([1, 1])
    expect(server.stored.hand.size).toBe(2)
    expect((await states(db))[s.id]).toEqual(['synced', 1, 1])
  })

  it('then an edit: the edit goes out as revision 2 and replaces the stored one', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const { h1 } = await sessionWithHands(db)

    server.loseNextResponse = true
    await syncOnce(db, server)
    await putRecord(db, 'hand', { ...h1, record_reason: 'random_sample' }, at(5))
    expect((await states(db))[h1.id]).toEqual(['pending', 2, null])

    const report = await syncOnce(db, server)
    expect(report.counts.synced).toBe(5)
    expect(server.stored.hand.get(h1.id)).toMatchObject({
      revision: 2,
      record_reason: 'random_sample',
    })
    expect((await states(db))[h1.id]).toEqual(['synced', 2, 2])
  })
})

describe('an edit while the request is under way', () => {
  it('is not marked synced by the answer for the older revision, and goes out next', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const { h2 } = await sessionWithHands(db)
    server.beforeAnswer = async () => {
      server.beforeAnswer = null
      await putRecord(db, 'hand', { ...h2, record_reason: 'routine' }, at(3))
    }

    await syncOnce(db, server)
    // The server stored revision 1; the phone now holds revision 2, still to be sent.
    expect((await states(db))[h2.id]).toEqual(['pending', 2, 1])

    await syncOnce(db, server)
    expect(server.posts[1]?.hands.map((h) => [h.id, h.revision])).toEqual([[h2.id, 2]])
    expect((await states(db))[h2.id]).toEqual(['synced', 2, 2])
  })
})

describe('outcomes of ADR-0026 as per-item states', () => {
  it('created, replaced and unchanged leave the record synced at the stored revision', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const a = venue(1)
    const b = venue(2)
    server.stored.venue.set(b.id, b) // already on the server, same content
    await putRecord(db, 'venue', a, at(0))
    await putRecord(db, 'venue', b, at(0))
    await syncOnce(db, server)
    expect(server.posts[0]?.venues.map((v) => v.id)).toEqual([a.id, b.id])
    expect(await states(db)).toEqual({ [a.id]: ['synced', 1, 1], [b.id]: ['synced', 1, 1] })

    await putRecord(db, 'venue', { ...a, name: 'Renamed' }, at(1))
    await syncOnce(db, server)
    expect((await states(db))[a.id]).toEqual(['synced', 2, 2])
  })

  it('conflict keeps the server version until the phone keeps its own', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const mine = venue(1, 'Mine')
    const theirs = { ...venue(1, 'Theirs'), revision: 3 }
    server.stored.venue.set(theirs.id, theirs)
    await putRecord(db, 'venue', mine, at(0))

    const report = await syncOnce(db, server)
    expect(report.counts.conflict).toBe(1)
    expect((await states(db))[mine.id]).toEqual(['conflict', 1, 3])
    expect(server.stored.venue.get(mine.id)).toEqual(theirs)

    // Not sent again on its own...
    await syncOnce(db, server)
    expect(server.posts).toHaveLength(1)
    // ...until the phone keeps its version, which then replaces the server's.
    await resolveKeepMine(db, mine.id, at(1))
    await syncOnce(db, server)
    expect(server.stored.venue.get(mine.id)).toMatchObject({ name: 'Mine', revision: 4 })
    expect((await states(db))[mine.id]).toEqual(['synced', 4, 4])
  })

  it('same revision with other content is a conflict too', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    server.stored.venue.set(idFor(1), venue(1, 'Theirs'))
    await putRecord(db, 'venue', venue(1, 'Mine'), at(0))
    await syncOnce(db, server)
    expect((await states(db))[idFor(1)]).toEqual(['conflict', 1, 1])
  })

  it('invalid keeps the server issues and is not resent until edited', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const issue = { path: ['timezone'], code: 'value_error', message: 'unknown IANA time zone' }
    server.refuse = (kind, record) =>
      kind === 'venue' && (record as { timezone: string }).timezone === 'Mars/Olympus'
        ? [issue]
        : []
    const bad = { ...venue(1), timezone: 'Mars/Olympus' }
    await putRecord(db, 'venue', bad, at(0))

    await syncOnce(db, server)
    const entry = await getEntry(db, bad.id)
    expect(entry?.state).toEqual({ status: 'invalid', issues: [issue] })
    await syncOnce(db, server)
    expect(server.posts).toHaveLength(1)

    await putRecord(db, 'venue', { ...bad, timezone: 'Europe/Vienna' }, at(1))
    await syncOnce(db, server)
    expect((await states(db))[bad.id]).toEqual(['synced', 2, 2])
  })
})

describe('a batch that partly fails', () => {
  it('applies the valid items and reports the refused one alone', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const s = session(10)
    await putRecord(db, 'session', s, at(0))
    for (const [n, seq] of [
      [20, 1],
      [21, 2],
      [22, 3],
    ] as const) {
      await putRecord(db, 'hand', hand(n, s.id, seq), at(seq))
    }
    const issue = { path: ['actions', 3, 'amount_to_chips'], code: 'below_min_raise', message: '' }
    server.refuse = (kind, record) => (kind === 'hand' && record.id === idFor(21) ? [issue] : [])

    const report = await syncOnce(db, server)
    expect(report.counts).toEqual({ pending: 0, synced: 3, conflict: 0, invalid: 1 })
    expect([...server.stored.hand.keys()]).toEqual([idFor(20), idFor(22)])
    expect((await getEntry(db, idFor(21)))?.state).toEqual({ status: 'invalid', issues: [issue] })
  })

  it('holds hands back while their session is refused, then sends them with it', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const { s, h1, h2 } = await sessionWithHands(db)
    server.refuse = (kind, record) =>
      kind === 'session' && (record as { currency: string | null }).currency === 'EUR'
        ? [{ path: ['currency'], code: 'string_pattern_mismatch', message: '' }]
        : []

    await syncOnce(db, server)
    // The hands came back unknown_session; they wait for the session instead of needing an edit.
    const after = await states(db)
    expect(after[s.id]?.[0]).toBe('invalid')
    expect([after[h1.id], after[h2.id]]).toEqual([
      ['pending', 1, null],
      ['pending', 1, null],
    ])
    await syncOnce(db, server)
    expect(server.posts).toHaveLength(1) // nothing was ready to send

    server.refuse = () => []
    await putRecord(db, 'session', { ...s, currency: 'USD' }, at(9))
    const report = await syncOnce(db, server)
    expect(server.posts[1]?.sessions).toHaveLength(1)
    expect(server.posts[1]?.hands).toHaveLength(2)
    expect(report.counts).toEqual({ pending: 0, synced: 5, conflict: 0, invalid: 0 })
  })

  it('keeps a hand invalid when what it refers to is not on the phone either', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    await putRecord(db, 'hand', hand(20, idFor(99), 1), at(0))
    await syncOnce(db, server)
    const entry = await getEntry(db, idFor(20))
    expect(entry?.state.status).toBe('invalid')
  })
})

describe('reaching the server', () => {
  it('when it is down, changes nothing but the sent marks and says why', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    server.down = true
    const { h1 } = await sessionWithHands(db)
    const report = await syncOnce(db, server)
    expect(report).toMatchObject({ sent: 5, reached: false, error: 'Failed to fetch' })
    expect(report.counts.pending).toBe(5)
    expect((await getEntry(db, h1.id))?.sentRevision).toBe(1)
  })

  it('makes no sync request with nothing pending, but refreshes the pick lists', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    server.stored.venue.set(idFor(1), venue(1))
    server.stored.player.set(idFor(2), { ...player(2), revision: 3 })
    const report = await syncOnce(db, server)
    expect(report).toMatchObject({ sent: 0, reached: true, error: null })
    expect(server.posts).toHaveLength(0)
    // A reinstalled phone gets its venues and players back, as synced.
    expect(await states(db)).toEqual({
      [idFor(1)]: ['synced', 1, 1],
      [idFor(2)]: ['synced', 3, 3],
    })
  })

  it('never overwrites a local edit with the server pick list', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    await putRecord(db, 'player', player(2, 'Old name'), at(0))
    await syncOnce(db, server)
    server.down = true
    await putRecord(db, 'player', player(2, 'Edited offline'), at(1))
    await syncOnce(db, server)
    server.down = false
    server.stored.player.set(idFor(2), { ...player(2, 'Elsewhere'), revision: 5 })
    server.loseNextResponse = true
    await syncOnce(db, server)
    // The batch was lost, the pick list not fetched: nothing changed locally.
    expect((await getEntry(db, idFor(2)))?.record).toMatchObject({ display_name: 'Edited offline' })
    await syncOnce(db, server)
    // Revision 2 against the server's 5: a conflict, with the server's revision noted.
    expect((await states(db))[idFor(2)]).toEqual(['conflict', 2, 5])
    expect((await getEntry(db, idFor(2)))?.record).toMatchObject({ display_name: 'Edited offline' })
  })

  it('replaces a synced pick-list record that the server holds a newer revision of', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    await putRecord(db, 'venue', venue(1, 'Old'), at(0))
    await syncOnce(db, server)
    server.stored.venue.set(idFor(1), { ...venue(1, 'New'), revision: 2 })
    await syncOnce(db, server)
    expect((await getEntry(db, idFor(1)))?.record).toMatchObject({ name: 'New', revision: 2 })
  })

  it('ignores a result that matches nothing sent, so its record goes out again', async () => {
    const db = await freshStore()
    const v = venue(1)
    await putRecord(db, 'venue', v, at(0))
    const wrong = new FakeServer()
    const real = wrong.postSync
    wrong.postSync = async (batch) => {
      const response = await real(batch)
      return { items: response.items.map((i) => ({ ...i, index: i.index + 1 })) }
    }
    await syncOnce(db, wrong)
    // Still pending; the pick-list refresh after the batch noted that the server holds revision 1.
    expect((await states(db))[v.id]).toEqual(['pending', 1, 1])
    wrong.postSync = real
    await syncOnce(db, wrong)
    expect((await states(db))[v.id]).toEqual(['synced', 1, 1])
    expect(wrong.posts).toHaveLength(2)
  })

  it('ignores a result at the right position that names another record', async () => {
    const db = await freshStore()
    const s = session(10)
    await putRecord(db, 'session', s, at(0))
    const wrong = new FakeServer()
    const real = wrong.postSync
    wrong.postSync = async (batch) => {
      const response = await real(batch)
      return { items: response.items.map((i) => ({ ...i, id: idFor(99) })) }
    }
    await syncOnce(db, wrong)
    expect((await states(db))[s.id]).toEqual(['pending', 1, null])
  })
})

describe('running sync', () => {
  it('never overlaps runs, and a save during a run is sent by one follow-up run', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    await putRecord(db, 'venue', venue(1), at(0))
    let release = (): void => undefined
    server.beforeAnswer = () =>
      new Promise((resolve) => {
        release = resolve
      })
    const sync = serialized(() => syncOnce(db, server))

    const first = sync()
    await new Promise((r) => setTimeout(r, 10)) // the first request is now waiting for its answer
    await putRecord(db, 'venue', venue(2), at(1))
    const second = sync()
    const third = sync()
    expect(second).toBe(third)
    server.beforeAnswer = null
    release()
    await Promise.all([first, second])
    expect(server.posts.map((b) => b.venues.map((v) => v.id))).toEqual([[idFor(1)], [idFor(2)]])
  })

  it('runs at once and again whenever the browser comes back online', () => {
    const target = new EventTarget()
    let runs = 0
    const stop = autoSync(() => {
      runs += 1
      return Promise.resolve()
    }, target)
    expect(runs).toBe(1)
    target.dispatchEvent(new Event('online'))
    expect(runs).toBe(2)
    stop()
    target.dispatchEvent(new Event('online'))
    expect(runs).toBe(2)
  })
})

describe('the JSON export', () => {
  it('holds every unsynced record and what it refers to, as a sync batch', async () => {
    const db = await freshStore()
    const server = new FakeServer()
    const { v, villain, s, h1 } = await sessionWithHands(db)
    await syncOnce(db, server)
    const h3 = hand(22, s.id, 3, villain.id)
    await putRecord(db, 'hand', h3, at(10))

    const file = JSON.stringify(exportBatch(await listEntries(db)))
    const batch = JSON.parse(file) as ReturnType<typeof exportBatch>
    expect(Object.keys(batch).sort()).toEqual(['hands', 'players', 'sessions', 'venues'])
    // The new hand, plus the session, venue and player it refers to (already synced) so the file
    // stands alone. The synced hands are not in it.
    expect(batch.hands).toEqual([{ ...h3, revision: 1 }])
    expect(batch.sessions).toEqual([s])
    expect(batch.venues).toEqual([v])
    expect(batch.players).toEqual([villain])
    expect(batch.hands.map((h) => h.id)).not.toContain(h1.id)
  })

  it('round-trips into a batch a fresh server accepts whole', async () => {
    const db = await freshStore()
    await sessionWithHands(db)
    const batch = JSON.parse(JSON.stringify(exportBatch(await listEntries(db)))) as Parameters<
      FakeServer['postSync']
    >[0]
    const fresh = new FakeServer()
    const response = await fresh.postSync(batch)
    expect(response.items.map((i) => i.outcome)).toEqual(Array(5).fill('created'))
    // And it is what sync itself would have sent.
    const sent = toSend(await listEntries(db))
    expect(Object.values(LISTS).map((k) => batch[k].length)).toEqual([1, 1, 1, 2])
    expect(sent).toHaveLength(5)
  })

  it('is empty once everything is synced', async () => {
    const db = await freshStore()
    await sessionWithHands(db)
    await syncOnce(db, new FakeServer())
    const entries: AnyEntry[] = await listEntries(db)
    expect(exportBatch(entries)).toEqual({ venues: [], players: [], sessions: [], hands: [] })
  })
})
