// The offline store: the revision rule, what survives closing and reopening the database, and
// the phone-only stores (drafts, entry timings, random-sample log, settings).

import { describe, expect, it } from 'vitest'

import { at, freshStore, hand, idFor, session, venue } from '../testing/fixtures.ts'
import { openStore } from './db.ts'
import { deleteDraft, getDraft, listDrafts, putDraft } from './drafts.ts'
import { newId } from './ids.ts'
import {
  edited,
  getEntry,
  keepMine,
  listEntries,
  markSent,
  needsAttention,
  putRecord,
  resolveKeepMine,
  revisionForEdit,
} from './records.ts'
import { closeSample, drawSample, listSamples, nextDueAt } from './samples.ts'
import { getSetting, putSetting } from './settings.ts'
import {
  finishTiming,
  listTimings,
  markInterrupted,
  median,
  startTiming,
  summarize,
} from './timings.ts'
import type { Entry } from './types.ts'

describe('the revision rule (ADR-0026)', () => {
  const v = venue(1)

  it('creates at revision 1, whatever the record says', () => {
    const entry = edited(undefined, 'venue', { ...v, revision: 7 }, at(0))
    expect(entry.record.revision).toBe(1)
    expect(entry.state).toEqual({ status: 'pending' })
    expect([entry.sentRevision, entry.serverRevision]).toEqual([null, null])
  })

  it('keeps the revision for edits before the first send', () => {
    const first = edited(undefined, 'venue', v, at(0))
    const second = edited(first, 'venue', { ...v, name: 'Renamed' }, at(1))
    expect(second.record).toEqual({ ...v, name: 'Renamed', revision: 1 })
  })

  it('increments once a revision was sent, response or not, and only once per send', () => {
    const sent = markSent(edited(undefined, 'venue', v, at(0)))
    const edit1 = edited(sent, 'venue', { ...v, name: 'A' }, at(1))
    const edit2 = edited(edit1, 'venue', { ...v, name: 'B' }, at(2))
    expect([edit1.record.revision, edit2.record.revision]).toEqual([2, 2])
    const edit3 = edited(markSent(edit2), 'venue', { ...v, name: 'C' }, at(3))
    expect(edit3.record.revision).toBe(3)
    expect(revisionForEdit(markSent(edit3))).toBe(4)
  })

  it('refuses to edit a record as another kind or under another id', () => {
    const entry = edited(undefined, 'venue', v, at(0))
    expect(() => edited(entry, 'venue', venue(2), at(1))).toThrow()
    expect(() =>
      edited(entry as unknown as Entry<'player'>, 'player', { ...v } as never, at(1)),
    ).toThrow()
  })

  it('keeps my version of a conflict by going above the server revision', () => {
    const conflict: Entry<'venue'> = {
      ...markSent(edited(undefined, 'venue', v, at(0))),
      serverRevision: 3,
      state: { status: 'conflict' },
    }
    const kept = keepMine(conflict, at(1))
    expect(kept.record.revision).toBe(4)
    expect(kept.state).toEqual({ status: 'pending' })
    expect(() => keepMine(kept, at(2))).toThrow('not in conflict')
  })

  it('lists conflicts and refused records as needing attention', () => {
    const base = edited(undefined, 'venue', v, at(0))
    const entries = [
      base,
      { ...base, id: 'b', state: { status: 'synced' } as const },
      { ...base, id: 'c', state: { status: 'conflict' } as const },
      { ...base, id: 'd', state: { status: 'invalid', issues: [] } as const },
    ]
    expect(needsAttention(entries).map((e) => e.id)).toEqual(['c', 'd'])
  })
})

describe('records in IndexedDB', () => {
  it('survive closing and reopening the database, with their bookkeeping', async () => {
    const db = await freshStore()
    const s = session(10)
    await putRecord(db, 'session', s, at(0))
    await putRecord(db, 'hand', hand(20, s.id, 1), at(1))
    db.close()

    const again = await openStore() // same in-memory IndexedDB: a reload of the app
    const entries = await listEntries(again)
    expect(entries.map((e) => [e.kind, e.id, e.record.revision, e.state.status])).toEqual([
      ['session', s.id, 1, 'pending'],
      ['hand', idFor(20), 1, 'pending'],
    ])
    expect((await listEntries(again, 'hand')).map((e) => e.id)).toEqual([idFor(20)])
    expect((await getEntry(again, s.id))?.updatedAt).toBe(at(0).toISOString())
  })

  it('apply the revision rule on save', async () => {
    const db = await freshStore()
    const s = session(10)
    await putRecord(db, 'session', s, at(0))
    const stored = await getEntry(db, s.id)
    if (stored === undefined) throw new Error('not stored')
    await db.put('records', markSent(stored))
    const edited = await putRecord(db, 'session', { ...s, notes: 'tight table' }, at(1))
    expect(edited.record.revision).toBe(2)
    expect(edited.sentRevision).toBe(1)
  })

  it('refuse an id that belongs to another kind', async () => {
    const db = await freshStore()
    await putRecord(db, 'venue', venue(1))
    await expect(putRecord(db, 'session', session(1))).rejects.toThrow('belongs to a venue')
  })

  it('resolve a conflict by keeping the phone version', async () => {
    const db = await freshStore()
    const entry = await putRecord(db, 'venue', venue(1))
    await db.put('records', {
      ...markSent(entry),
      serverRevision: 2,
      state: { status: 'conflict' },
    })
    const kept = await resolveKeepMine(db, entry.id, at(5))
    expect([kept.record.revision, kept.state.status]).toEqual([3, 'pending'])
    expect((await getEntry(db, entry.id))?.record.revision).toBe(3)
    await expect(resolveKeepMine(db, idFor(99))).rejects.toThrow('no record')
  })
})

describe('UUIDv7 ids', () => {
  const v7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('have the version and variant bits and the time in the first 48 bits', () => {
    // 2026-11-08T20:00:00Z is 1794168000000 ms = 0x01a1bcbf0e00. With every random bit set (then
    // cleared), only the version and variant bits differ from all-f (all-0).
    const id = newId(at(0), (bytes) => bytes.fill(0xff))
    expect(id).toBe('01a1bcbf-0e00-7fff-bfff-ffffffffffff')
    const zeros = newId(at(0), (bytes) => bytes.fill(0))
    expect(zeros).toBe('01a1bcbf-0e00-7000-8000-000000000000')
    expect(newId()).toMatch(v7)
  })

  it('sort by time and differ within the same millisecond', () => {
    const early = newId(at(0))
    const late = newId(at(1))
    expect(early < late).toBe(true)
    expect(newId(at(0))).not.toBe(newId(at(0)))
  })

  it('refuse times outside 48 bits', () => {
    expect(() => newId(new Date(-1))).toThrow(RangeError)
    expect(() => newId(new Date(2 ** 48))).toThrow(RangeError)
  })
})

describe('drafts', () => {
  it('are kept, listed most recent first, and deleted', async () => {
    const db = await freshStore()
    await putDraft(db, { id: 'a', sessionId: 's', updatedAt: at(0).toISOString(), body: { n: 1 } })
    await putDraft(db, { id: 'b', sessionId: 's', updatedAt: at(2).toISOString(), body: null })
    await putDraft(db, { id: 'a', sessionId: 's', updatedAt: at(1).toISOString(), body: { n: 2 } })
    expect((await listDrafts(db)).map((d) => d.id)).toEqual(['b', 'a'])
    expect((await getDraft(db, 'a'))?.body).toEqual({ n: 2 })
    await deleteDraft(db, 'a')
    expect(await getDraft(db, 'a')).toBeUndefined()
  })
})

describe('entry timings', () => {
  it('record start, interruption and save, and summarize uninterrupted entries apart', async () => {
    const db = await freshStore()
    // Hand a: 50 s. Hand b: 70 s, interrupted. Hand c: 40 s. Hand d: still a draft.
    const second = (s: number) => new Date(at(0).getTime() + s * 1000)
    await startTiming(db, 'a', second(0))
    await finishTiming(db, 'a', second(50))
    await startTiming(db, 'b', second(100))
    await markInterrupted(db, 'b')
    await finishTiming(db, 'b', second(170))
    await startTiming(db, 'c', second(200))
    await finishTiming(db, 'c', second(240))
    await startTiming(db, 'd', second(300))
    await markInterrupted(db, 'missing') // no such timing: nothing happens
    const timings = await listTimings(db)
    expect(timings.map((t) => t.handId)).toEqual(['a', 'b', 'c', 'd'])
    expect(summarize(timings)).toEqual({ uninterrupted: 2, medianSeconds: 45, interrupted: 1 })
  })

  it('take the median of an odd count, an even count and nothing', () => {
    expect(median([30, 10, 20])).toBe(20)
    expect(median([40, 10, 30, 20])).toBe(25)
    expect(median([])).toBeNull()
  })
})

describe('random-sample times (MATH.md §4.5)', () => {
  it('fall between 20 and 40 minutes ahead', () => {
    expect(nextDueAt(at(0), () => 0)).toEqual(at(20))
    expect(nextDueAt(at(0), () => 0.5)).toEqual(at(30))
    expect(nextDueAt(at(0), () => 0.999)).toEqual(new Date(at(0).getTime() + 39.98 * 60_000))
    expect(() => nextDueAt(at(0), () => 1)).toThrow(RangeError)
    for (let i = 0; i < 100; i++) {
      const due = nextDueAt(at(0)).getTime() - at(0).getTime()
      expect(due).toBeGreaterThanOrEqual(20 * 60_000)
      expect(due).toBeLessThan(40 * 60_000)
    }
  })

  it('are logged with their outcome, once', async () => {
    const db = await freshStore()
    const first = await drawSample(db, 's1', at(0), () => 0.25)
    expect(first.dueAt).toBe(at(25).toISOString())
    const logged = await closeSample(db, first.id, { kind: 'logged', handId: 'h1' }, at(30))
    expect([logged.outcome, logged.handId, logged.closedAt]).toEqual([
      'logged',
      'h1',
      at(30).toISOString(),
    ])
    await expect(closeSample(db, first.id, { kind: 'missed' })).rejects.toThrow('already logged')
    const second = await drawSample(db, 's1', at(30), () => 0.75)
    await closeSample(db, second.id, { kind: 'missed' }, at(70))
    await drawSample(db, 's2', at(0), () => 0)
    expect((await listSamples(db, 's1')).map((s) => [s.dueAt, s.outcome])).toEqual([
      [at(25).toISOString(), 'logged'],
      [at(65).toISOString(), 'missed'],
    ])
  })
})

describe('settings', () => {
  it('keep JSON values by key', async () => {
    const db = await freshStore()
    expect(await getSetting(db, 'rake')).toBeUndefined()
    await putSetting(db, 'rake', { pct: 5, cap_chips: 10 })
    expect(await getSetting(db, 'rake')).toEqual({ pct: 5, cap_chips: 10 })
  })
})
