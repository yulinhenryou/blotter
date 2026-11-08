// New session (docs/CAPTURE.md §1.2): once per session; every field defaults to the last session's
// choice, so usually only "Start" is tapped. Plain form fields: this screen is not on the clock.

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'

import type { Ante } from '../rules/index.ts'
import { Button } from '../design/Button.tsx'
import styles from './capture.module.css'
import { useCapture, useLoad } from './context.ts'
import { listVenues, loadDefaults, startSession, type NewSession as Input } from './data.ts'
import { parseStraddles, toLocalInput, wholeNumber } from './format.ts'
import type { RakeRule } from './form.ts'
import type { Defaults } from './session.ts'

export function NewSession() {
  const { db } = useCapture()
  const load = useCallback(
    async () => ({ defaults: await loadDefaults(db), venues: await listVenues(db) }),
    [db],
  )
  const data = useLoad(load)
  if (data === undefined) return <p aria-busy="true">Loading…</p>
  return <NewSessionForm defaults={data.defaults} venues={data.venues} />
}

const NEW_VENUE = 'new'

function NewSessionForm({
  defaults,
  venues,
}: {
  defaults: Defaults
  venues: readonly { id: string; name: string }[]
}) {
  const { db, deps, changed } = useCapture()
  const navigate = useNavigate()
  const known = venues.some((v) => v.id === defaults.venueId)
  const [venue, setVenue] = useState(known ? (defaults.venueId ?? NEW_VENUE) : NEW_VENUE)
  const [venueName, setVenueName] = useState('')
  const [venueKind, setVenueKind] = useState<'live' | 'online'>('live')
  const [sb, setSb] = useState(String(defaults.smallBlind))
  const [bb, setBb] = useState(String(defaults.bigBlind))
  const [straddles, setStraddles] = useState(defaults.straddles.join(' '))
  const [anteKind, setAnteKind] = useState<'none' | Ante['kind']>(defaults.ante?.kind ?? 'none')
  const [anteChips, setAnteChips] = useState(
    defaults.ante === null ? '' : String(defaults.ante.chips),
  )
  const [noRake, setNoRake] = useState(defaults.rake === null)
  const [percent, setPercent] = useState(String(defaults.rake?.percent ?? 5))
  const [cap, setCap] = useState(
    defaults.rake?.capChips == null ? '' : String(defaults.rake.capChips),
  )
  const [noFlopNoDrop, setNoFlopNoDrop] = useState(defaults.rake?.noFlopNoDrop ?? true)
  const [tableSize, setTableSize] = useState(defaults.tableSize)
  const [heroSeat, setHeroSeat] = useState(defaults.heroSeat)
  const [empty, setEmpty] = useState<number[]>([])
  const [buyIn, setBuyIn] = useState('')
  const [startedAt, setStartedAt] = useState(() => toLocalInput(deps.now()))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const read = (): Input | string => {
    const small = wholeNumber(sb)
    const big = wholeNumber(bb)
    if (small === null || big === null) return 'Blinds are whole numbers of chips'
    if (small > big) return 'The small blind is larger than the big blind'
    const straddleList = parseStraddles(straddles)
    if (straddleList === null) return 'Straddles: whole numbers, e.g. "6" or "6 12"'
    let previous = big
    for (const s of straddleList) {
      if (s < 2 * previous)
        return `A straddle is at least twice the previous forced bet (${String(2 * previous)})`
      previous = s
    }
    let ante: Ante | null = null
    if (anteKind !== 'none') {
      const chips = wholeNumber(anteChips)
      if (chips === null) return 'The ante is a whole number of chips'
      ante = { kind: anteKind, chips }
    }
    let rake: RakeRule | null = null
    if (!noRake) {
      const pct = Number(percent)
      const capChips = cap.trim() === '' ? null : wholeNumber(cap)
      if (!(pct >= 0 && pct <= 100)) return 'Rake: a percentage from 0 to 100'
      if (cap.trim() !== '' && capChips === null)
        return 'Rake cap: a whole number of chips, or empty'
      rake = { percent: pct, capChips, noFlopNoDrop }
    }
    const buy = buyIn.trim() === '' ? null : wholeNumber(buyIn)
    if (buyIn.trim() !== '' && buy === null) return 'Buy-in: a whole number of chips, or empty'
    if (venue === NEW_VENUE && venueName.trim() === '') return 'Name the venue'
    const start = new Date(startedAt)
    if (Number.isNaN(start.getTime())) return 'Start time is not a valid time'
    return {
      venue: venue === NEW_VENUE ? { name: venueName.trim(), kind: venueKind } : { id: venue },
      smallBlind: small,
      bigBlind: big,
      straddles: straddleList,
      ante,
      rake,
      tableSize,
      heroSeat,
      emptySeats: empty.filter((s) => s <= tableSize && s !== heroSeat),
      buyIn: buy,
      startedAt: start,
    }
  }

  const start = async () => {
    const input = read()
    if (typeof input === 'string') {
      setProblem(input)
      return
    }
    setBusy(true)
    const session = await startSession(db, input, deps.now(), deps.uniform)
    changed()
    void navigate(`/capture/session/${session.id}`, { replace: true })
  }

  const seats = Array.from({ length: tableSize }, (_, i) => i + 1)

  return (
    <>
      <h1 className={styles.heading}>New session</h1>

      <label className={styles.field}>
        <span>Venue</span>
        <select
          className={styles.input}
          value={venue}
          onChange={(e) => {
            setVenue(e.target.value)
          }}
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <option value={NEW_VENUE}>New venue…</option>
        </select>
      </label>
      {venue === NEW_VENUE && (
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Venue name</span>
            <input
              className={styles.input}
              value={venueName}
              onChange={(e) => {
                setVenueName(e.target.value)
              }}
            />
          </label>
          <label className={styles.field}>
            <span>Kind</span>
            <select
              className={styles.input}
              value={venueKind}
              onChange={(e) => {
                setVenueKind(e.target.value === 'online' ? 'online' : 'live')
              }}
            >
              <option value="live">Live</option>
              <option value="online">Online</option>
            </select>
          </label>
        </div>
      )}

      <div className={styles.row}>
        <NumberField label="Small blind" value={sb} onChange={setSb} />
        <NumberField label="Big blind" value={bb} onChange={setBb} />
      </div>
      <label className={styles.field}>
        <span>Straddles, in posting order (empty: none)</span>
        <input
          className={styles.input}
          inputMode="numeric"
          value={straddles}
          placeholder="none"
          onChange={(e) => {
            setStraddles(e.target.value)
          }}
        />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Ante</span>
          <select
            className={styles.input}
            value={anteKind}
            onChange={(e) => {
              const v = e.target.value
              setAnteKind(v === 'per_player' || v === 'big_blind' ? v : 'none')
            }}
          >
            <option value="none">None</option>
            <option value="per_player">Every player</option>
            <option value="big_blind">Big-blind ante</option>
          </select>
        </label>
        {anteKind !== 'none' && (
          <NumberField label="Ante chips" value={anteChips} onChange={setAnteChips} />
        )}
      </div>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Rake (only to propose amounts won)</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={noRake}
            onChange={(e) => {
              setNoRake(e.target.checked)
            }}
          />
          No rake
        </label>
        {!noRake && (
          <>
            <div className={styles.row}>
              <NumberField label="Percent" value={percent} onChange={setPercent} decimal />
              <NumberField label="Cap in chips (empty: none)" value={cap} onChange={setCap} />
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={noFlopNoDrop}
                onChange={(e) => {
                  setNoFlopNoDrop(e.target.checked)
                }}
              />
              No flop, no drop
            </label>
          </>
        )}
      </fieldset>

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Table size</span>
          <select
            className={styles.input}
            value={tableSize}
            onChange={(e) => {
              const size = Number(e.target.value)
              setTableSize(size)
              if (heroSeat > size) setHeroSeat(1)
            }}
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Hero&apos;s seat</span>
          <select
            className={styles.input}
            value={heroSeat}
            onChange={(e) => {
              setHeroSeat(Number(e.target.value))
            }}
          >
            {seats.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.field}>
        <span>Empty seats</span>
        <div className={styles.row} role="group" aria-label="Empty seats">
          {seats.map((n) => (
            <button
              key={n}
              type="button"
              className={styles.chip}
              aria-pressed={empty.includes(n)}
              disabled={n === heroSeat}
              onClick={() => {
                setEmpty((e) => (e.includes(n) ? e.filter((s) => s !== n) : [...e, n]))
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <NumberField label="Buy-in (optional)" value={buyIn} onChange={setBuyIn} />
        <label className={styles.field}>
          <span>Start</span>
          <input
            className={styles.input}
            type="datetime-local"
            value={startedAt}
            onChange={(e) => {
              setStartedAt(e.target.value)
            }}
          />
        </label>
      </div>

      {problem !== null && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.bar}>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            void start()
          }}
        >
          Start
        </Button>
      </div>
    </>
  )
}

function NumberField({
  label,
  value,
  onChange,
  decimal = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  decimal?: boolean
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        className={styles.input}
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
      />
    </label>
  )
}
