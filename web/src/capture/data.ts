// The capture screens' reads and writes of the phone's store: sessions, hands, drafts, timings and
// random samples, combined the way the screens need them. The rules of each piece (revisions,
// sync states, the sample draw) live in `store/`; this module only puts them together.

import type { Ante } from '../rules/index.ts'
import type { Store } from '../store/db.ts'
import { deleteDraft, getDraft, listDrafts, putDraft } from '../store/drafts.ts'
import { newId } from '../store/ids.ts'
import { getEntry, listEntries, putRecord } from '../store/records.ts'
import { closeSample, drawSample, listSamples } from '../store/samples.ts'
import { getSetting, putSetting } from '../store/settings.ts'
import { finishTiming, markInterrupted, startTiming } from '../store/timings.ts'
import type { Entry, RecordTypes, Sample, SyncStatus } from '../store/types.ts'
import { exportBatch, type SyncBatch } from '../sync/batch.ts'
import {
  heroStackAfter,
  positionLabel,
  toRecord,
  type HandForm,
  type RakeRule,
  type RecordReason,
} from './form.ts'
import {
  asDefaults,
  asSessionSetup,
  defaultDealtIn,
  DEFAULTS_KEY,
  FIRST_DEFAULTS,
  formKey,
  setupKey,
  type Defaults,
  type SessionSetup,
} from './session.ts'

type SessionRecord = RecordTypes['session']
type VenueRecord = RecordTypes['venue']
type PlayerRecord = RecordTypes['player']

// --- Sessions ------------------------------------------------------------------------------------

export async function loadDefaults(db: Store): Promise<Defaults> {
  return asDefaults(await getSetting(db, DEFAULTS_KEY)) ?? FIRST_DEFAULTS
}

export async function loadSetup(db: Store, sessionId: string): Promise<SessionSetup | null> {
  return asSessionSetup(await getSetting(db, setupKey(sessionId)))
}

export async function saveSetup(db: Store, setup: SessionSetup): Promise<void> {
  await putSetting(db, setupKey(setup.sessionId), setup)
}

/** Sessions on this phone, the most recent start first. */
export async function listSessions(db: Store): Promise<SessionRecord[]> {
  const entries = await listEntries(db, 'session')
  return entries
    .flatMap((e) => (e.kind === 'session' ? [e.record] : []))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
}

/** The session not ended yet, if any (the most recent one). */
export async function openSession(db: Store): Promise<SessionRecord | null> {
  return (await listSessions(db)).find((s) => s.ended_at == null) ?? null
}

export async function listVenues(db: Store): Promise<VenueRecord[]> {
  const entries = await listEntries(db, 'venue')
  return entries
    .flatMap((e) => (e.kind === 'venue' ? [e.record] : []))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listPlayers(db: Store): Promise<PlayerRecord[]> {
  const entries = await listEntries(db, 'player')
  return entries
    .flatMap((e) => (e.kind === 'player' ? [e.record] : []))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
}

export interface NewSession {
  /** An existing venue's id, or a new venue's name and kind. */
  readonly venue:
    { readonly id: string } | { readonly name: string; readonly kind: VenueRecord['kind'] } | null
  readonly smallBlind: number
  readonly bigBlind: number
  readonly straddles: readonly number[]
  readonly ante: Ante | null
  readonly rake: RakeRule | null
  readonly tableSize: number
  readonly heroSeat: number
  readonly emptySeats: readonly number[]
  readonly buyIn: number | null
  readonly startedAt: Date
}

/** The phone's time zone (IANA name), for a new venue. */
export function phoneTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Create a session (and its venue, if new), remember its choices as the next session's defaults,
 * and draw its first random-sample time (MATH.md §4.5).
 */
export async function startSession(
  db: Store,
  input: NewSession,
  now: Date,
  uniform: () => number,
): Promise<SessionRecord> {
  let venueId: string | null = null
  if (input.venue !== null && 'id' in input.venue) venueId = input.venue.id
  else if (input.venue !== null) {
    const venue: VenueRecord = {
      id: newId(now),
      revision: 1,
      name: input.venue.name,
      kind: input.venue.kind,
      timezone: phoneTimeZone(),
    }
    await putRecord(db, 'venue', venue, now)
    venueId = venue.id
  }
  const session: SessionRecord = {
    id: newId(now),
    revision: 1,
    venue_id: venueId,
    started_at: input.startedAt.toISOString(),
    ended_at: null,
    small_blind_chips: input.smallBlind,
    big_blind_chips: input.bigBlind,
    currency: null,
    chip_unit_minor: null,
    buy_in_chips: input.buyIn,
    cash_out_chips: null,
    notes: null,
  }
  await putRecord(db, 'session', session, now)
  await saveSetup(db, {
    setupVersion: 1,
    sessionId: session.id,
    tableSize: input.tableSize,
    heroSeat: input.heroSeat,
    emptySeats: input.emptySeats,
    straddles: input.straddles,
    straddleOn: input.straddles.length > 0,
    ante: input.ante,
    rake: input.rake,
    seatPlayers: [],
  })
  const defaults: Defaults = {
    defaultsVersion: 1,
    venueId,
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    straddles: input.straddles,
    ante: input.ante,
    rake: input.rake,
    tableSize: input.tableSize,
    heroSeat: input.heroSeat,
  }
  await putSetting(db, DEFAULTS_KEY, defaults)
  await drawSample(db, session.id, now, uniform)
  return session
}

/** Edit a session's record (end time, cash-out, ...). The revision rule applies (ADR-0026). */
export async function updateSession(
  db: Store,
  session: SessionRecord,
  now: Date,
): Promise<SessionRecord> {
  return (await putRecord(db, 'session', session, now)).record
}

export async function addPlayer(db: Store, name: string, now: Date): Promise<PlayerRecord> {
  const player: PlayerRecord = {
    id: newId(now),
    revision: 1,
    display_name: name,
    is_hero: false,
    notes: null,
  }
  return (await putRecord(db, 'player', player, now)).record
}

// --- Hands ---------------------------------------------------------------------------------------

function isForm(value: unknown): value is HandForm {
  return (
    typeof value === 'object' && value !== null && 'formVersion' in value && value.formVersion === 1
  )
}

/** A hand of a session as the session screen lists it. */
export interface HandItem {
  readonly id: string
  readonly clientSeq: number
  readonly cards: readonly string[]
  readonly position: string | null
  /** The sync state of the saved hand, or `draft` if it was never saved. */
  readonly status: SyncStatus | 'draft'
  /** A saved hand with unsaved edits. */
  readonly editing: boolean
}

export async function sessionHands(db: Store, sessionId: string): Promise<HandItem[]> {
  const [entries, drafts] = await Promise.all([listEntries(db, 'hand'), listDrafts(db)])
  const draftForms = new Map(
    drafts.flatMap((d) => (d.sessionId === sessionId && isForm(d.body) ? [[d.id, d.body]] : [])),
  )
  const items: HandItem[] = []
  for (const entry of entries) {
    if (entry.kind !== 'hand' || entry.record.session_id !== sessionId) continue
    const record = entry.record
    const hero = record.seats.find((s) => s.seat === record.hero_seat)
    const form = draftForms.get(entry.id) ?? (await loadSavedForm(db, entry.id))
    items.push({
      id: entry.id,
      clientSeq: record.client_seq,
      cards: hero?.hole_cards ?? [],
      position: form === null ? null : positionLabel(form),
      status: entry.state.status,
      editing: draftForms.has(entry.id),
    })
    draftForms.delete(entry.id)
  }
  for (const form of draftForms.values()) {
    items.push({
      id: form.id,
      clientSeq: form.clientSeq,
      cards: form.heroCards,
      position: positionLabel(form),
      status: 'draft',
      editing: false,
    })
  }
  return items.sort((a, b) => b.clientSeq - a.clientSeq)
}

async function loadSavedForm(db: Store, handId: string): Promise<HandForm | null> {
  const value = await getSetting(db, formKey(handId))
  return isForm(value) ? value : null
}

/** The form of a hand: its draft if one is open, else the form it was saved from. */
export async function loadForm(
  db: Store,
  handId: string,
): Promise<{ form: HandForm; draft: boolean } | null> {
  const draft = await getDraft(db, handId)
  if (draft !== undefined && isForm(draft.body)) return { form: draft.body, draft: true }
  const saved = await loadSavedForm(db, handId)
  return saved === null ? null : { form: saved, draft: false }
}

/**
 * "New hand" (docs/CAPTURE.md §1.3–§1.4): a draft with the session's seats and stakes, hero's
 * stack prefilled from the last hand of the session (or the buy-in), and the entry timer started.
 */
export async function newHand(db: Store, sessionId: string, now: Date): Promise<HandForm> {
  const [setup, entry, items] = await Promise.all([
    loadSetup(db, sessionId),
    getEntry(db, sessionId),
    sessionHands(db, sessionId),
  ])
  if (setup === null || entry?.kind !== 'session') throw new Error(`no session ${sessionId}`)
  const session = entry.record
  let stack = session.buy_in_chips ?? null
  const last = items[0] // the highest client_seq: items are sorted newest first
  const lastSaved = items.find((item) => item.status !== 'draft')
  if (lastSaved !== undefined) {
    const lastForm = await loadSavedForm(db, lastSaved.id)
    stack = (lastForm === null ? null : heroStackAfter(lastForm)) ?? stack
  }
  const form: HandForm = {
    formVersion: 1,
    id: newId(now),
    sessionId,
    clientSeq: (last?.clientSeq ?? 0) + 1,
    tableSize: setup.tableSize,
    heroSeat: setup.heroSeat,
    sessionStakes: {
      small_blind_chips: session.small_blind_chips,
      big_blind_chips: session.big_blind_chips,
      straddles_chips: setup.straddles,
      ante: setup.ante,
    },
    straddled: setup.straddles.length > 0 && setup.straddleOn,
    rake: setup.rake,
    dealtIn: defaultDealtIn(setup),
    heroPosition: null,
    heroCards: [],
    heroStack: stack,
    heroStackApprox: false,
    heroStackConfirmed: false,
    playedAt: now.toISOString(),
    players: setup.seatPlayers.filter((p) => defaultDealtIn(setup).includes(p.seat)),
    moves: [],
    board: [],
    keepEntering: false,
    endsAtHeroFold: false,
    villains: [],
    winners: [],
    won: null,
    reason: null,
  }
  await writeDraft(db, form, now)
  await startTiming(db, form.id, now)
  return form
}

export async function writeDraft(db: Store, form: HandForm, now: Date): Promise<void> {
  await putDraft(db, {
    id: form.id,
    sessionId: form.sessionId,
    updatedAt: now.toISOString(),
    body: form,
  })
}

/** A draft was opened again after being left: its entry time no longer counts as uninterrupted. */
export async function resumed(db: Store, handId: string): Promise<void> {
  const timing = await db.get('timings', handId)
  if (timing?.savedAt === null) await markInterrupted(db, handId)
}

export async function discardDraft(db: Store, handId: string): Promise<void> {
  await deleteDraft(db, handId)
}

/** The session's open random-sample time, if any. */
export async function openSample(db: Store, sessionId: string): Promise<Sample | null> {
  return (await listSamples(db, sessionId)).find((s) => s.outcome === 'open') ?? null
}

export function sampleDue(sample: Sample | null, now: Date): boolean {
  return sample !== null && Date.parse(sample.dueAt) <= now.getTime()
}

/** "Missed it": close the due sample and draw the next time. */
export async function missSample(
  db: Store,
  sample: Sample,
  now: Date,
  uniform: () => number,
): Promise<void> {
  await closeSample(db, sample.id, { kind: 'missed' }, now)
  await drawSample(db, sample.sessionId, now, uniform)
}

/**
 * Save the hand: the record goes to the outbox (`putRecord`, which applies the revision rule),
 * the form is kept for later edits, the draft is deleted and the entry timer stops. A hand saved as
 * the random sample closes the due sample time and draws the next one.
 */
export async function saveHand(
  db: Store,
  form: HandForm,
  reason: RecordReason,
  now: Date,
  uniform: () => number,
): Promise<Entry<'hand'>> {
  const record = toRecord(form, reason)
  if (!record.ok) throw new Error(record.violation.message)
  const entry = await putRecord(db, 'hand', record.value, now)
  await putSetting(db, formKey(form.id), { ...form, reason })
  await deleteDraft(db, form.id)
  const timing = await db.get('timings', form.id)
  if (timing?.savedAt === null) await finishTiming(db, form.id, now)

  const setup = await loadSetup(db, form.sessionId)
  if (setup !== null) {
    // A seat's player carries over to the session's later hands (docs/CAPTURE.md §1.4).
    const others = setup.seatPlayers.filter((p) => !form.dealtIn.includes(p.seat))
    await saveSetup(db, { ...setup, seatPlayers: [...others, ...form.players] })
  }
  const sample = await openSample(db, form.sessionId)
  if (reason === 'random_sample' && sample !== null && sampleDue(sample, now)) {
    await closeSample(db, sample.id, { kind: 'logged', handId: form.id }, now)
    await drawSample(db, form.sessionId, now, uniform)
  }
  return entry
}

// --- Sync state and export -----------------------------------------------------------------------

export type Counts = Readonly<Record<SyncStatus, number>>

export async function syncCounts(db: Store): Promise<Counts> {
  const counts = { pending: 0, synced: 0, conflict: 0, invalid: 0 }
  for (const entry of await listEntries(db)) counts[entry.state.status] += 1
  return counts
}

/** "3 waiting to sync, 1 needs attention", or "All synced". */
export function describeCounts(counts: Counts): string {
  const attention = counts.conflict + counts.invalid
  const parts: string[] = []
  if (counts.pending > 0) parts.push(`${String(counts.pending)} waiting to sync`)
  if (attention > 0) parts.push(`${String(attention)} need${attention === 1 ? 's' : ''} attention`)
  return parts.length === 0 ? 'All synced' : parts.join(', ')
}

/** Every unsynced record and what it refers to, as a sync batch (docs/plans/M4a.md §1.4). */
export async function unsyncedBatch(db: Store): Promise<SyncBatch> {
  return exportBatch(await listEntries(db))
}

/**
 * Players for the seat picker: those seen in hands at this session's venue first, then the rest,
 * each group by name (docs/CAPTURE.md §1.4).
 */
export async function knownPlayers(db: Store, sessionId: string): Promise<PlayerRecord[]> {
  const [players, entries] = await Promise.all([listPlayers(db), listEntries(db)])
  const sessions = new Map(
    entries.flatMap((e) => (e.kind === 'session' ? [[e.id, e.record.venue_id ?? null]] : [])),
  )
  const venue = sessions.get(sessionId) ?? null
  const seen = new Set<string>()
  if (venue !== null) {
    for (const e of entries) {
      if (e.kind !== 'hand' || sessions.get(e.record.session_id) !== venue) continue
      for (const seat of e.record.seats) if (seat.player_id != null) seen.add(seat.player_id)
    }
  }
  return [...players.filter((p) => seen.has(p.id)), ...players.filter((p) => !seen.has(p.id))]
}
