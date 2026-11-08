// Session settings and "End session" (docs/CAPTURE.md §1.3): hero's seat, empty seats, the
// straddle default, the rake rule and the players at this table, all kept on the phone; ending the
// session edits its record (cash-out and end time), which is synced.

import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { Button } from '../design/Button.tsx'
import { getEntry } from '../store/records.ts'
import type { RecordTypes } from '../store/types.ts'
import styles from './capture.module.css'
import { useCapture, useLoad } from './context.ts'
import { knownPlayers, loadSetup, saveSetup, updateSession } from './data.ts'
import { toLocalInput, wholeNumber } from './format.ts'
import type { SessionSetup } from './session.ts'

export function SessionSettings() {
  const { sessionId = '' } = useParams()
  const { db } = useCapture()
  const load = useCallback(async () => {
    const entry = await getEntry(db, sessionId)
    return {
      session: entry?.kind === 'session' ? entry.record : null,
      setup: await loadSetup(db, sessionId),
      players: await knownPlayers(db, sessionId),
    }
  }, [db, sessionId])
  const data = useLoad(load)
  if (data === undefined) return <p aria-busy="true">Loading…</p>
  if (data.session === null || data.setup === null) {
    return <p role="alert">This session is not on this phone.</p>
  }
  return <SettingsForm session={data.session} setup={data.setup} players={data.players} />
}

function SettingsForm({
  session,
  setup: initial,
  players,
}: {
  session: RecordTypes['session']
  setup: SessionSetup
  players: readonly RecordTypes['player'][]
}) {
  const { db, deps, changed, sync } = useCapture()
  const navigate = useNavigate()
  const [setup, setSetup] = useState(initial)
  const [cashOut, setCashOut] = useState(
    session.cash_out_chips == null ? '' : String(session.cash_out_chips),
  )
  const [endedAt, setEndedAt] = useState(() => toLocalInput(deps.now()))
  const [problem, setProblem] = useState<string | null>(null)
  const names = new Map(players.map((p) => [p.id, p.display_name]))
  const seats = Array.from({ length: setup.tableSize }, (_, i) => i + 1)
  const toSession = `/capture/session/${session.id}`

  const change = (next: SessionSetup) => {
    setSetup(next)
    void saveSetup(db, next).then(changed)
  }

  const end = async () => {
    const chips = cashOut.trim() === '' ? null : wholeNumber(cashOut)
    if (cashOut.trim() !== '' && chips === null) {
      setProblem('Cash-out: a whole number of chips, or empty')
      return
    }
    const time = new Date(endedAt)
    if (Number.isNaN(time.getTime())) {
      setProblem('End time is not a valid time')
      return
    }
    await updateSession(
      db,
      { ...session, cash_out_chips: chips, ended_at: time.toISOString() },
      deps.now(),
    )
    changed()
    void sync()
    void navigate('/capture')
  }

  return (
    <>
      <h1 className={styles.heading}>Session settings</h1>
      <p className={styles.muted}>Kept on this phone; used for the next hands.</p>

      <label className={styles.field}>
        <span>Hero&apos;s seat</span>
        <select
          className={styles.input}
          value={setup.heroSeat}
          onChange={(e) => {
            const heroSeat = Number(e.target.value)
            change({
              ...setup,
              heroSeat,
              emptySeats: setup.emptySeats.filter((s) => s !== heroSeat),
            })
          }}
        >
          {seats.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.field}>
        <span>Empty seats</span>
        <div className={styles.row} role="group" aria-label="Empty seats">
          {seats.map((n) => (
            <button
              key={n}
              type="button"
              className={styles.chip}
              aria-pressed={setup.emptySeats.includes(n)}
              disabled={n === setup.heroSeat}
              onClick={() => {
                const empty = setup.emptySeats.includes(n)
                  ? setup.emptySeats.filter((s) => s !== n)
                  : [...setup.emptySeats, n]
                change({ ...setup, emptySeats: empty })
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {setup.straddles.length > 0 && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={setup.straddleOn}
            onChange={(e) => {
              change({ ...setup, straddleOn: e.target.checked })
            }}
          />
          New hands start straddled ({setup.straddles.join(', ')})
        </label>
      )}

      <section className={styles.section} aria-labelledby="rake">
        <h2 id="rake" className={styles.sectionTitle}>
          Rake rule
        </h2>
        <p>
          {setup.rake === null
            ? 'No rake'
            : `${String(setup.rake.percent)}%${setup.rake.capChips === null ? '' : `, cap ${String(setup.rake.capChips)}`}${setup.rake.noFlopNoDrop ? ', no flop no drop' : ''}`}
        </p>
        {setup.rake !== null && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={setup.rake.noFlopNoDrop}
              onChange={(e) => {
                if (setup.rake !== null) {
                  change({ ...setup, rake: { ...setup.rake, noFlopNoDrop: e.target.checked } })
                }
              }}
            />
            No flop, no drop
          </label>
        )}
      </section>

      <section className={styles.section} aria-labelledby="players">
        <h2 id="players" className={styles.sectionTitle}>
          Players at this table
        </h2>
        {setup.seatPlayers.length === 0 ? (
          <p className={styles.muted}>None named. Name players from a hand&apos;s table map.</p>
        ) : (
          <ul className={styles.list}>
            {[...setup.seatPlayers]
              .sort((a, b) => a.seat - b.seat)
              .map((p) => (
                <li key={p.seat} className={styles.item}>
                  <span>
                    Seat {p.seat}: {names.get(p.playerId) ?? 'unknown player'}
                  </span>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      change({
                        ...setup,
                        seatPlayers: setup.seatPlayers.filter((q) => q.seat !== p.seat),
                      })
                    }}
                  >
                    Left
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </section>

      {session.ended_at == null && (
        <section className={styles.section} aria-labelledby="end">
          <h2 id="end" className={styles.sectionTitle}>
            End session
          </h2>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Cash-out in chips (optional)</span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={cashOut}
                onChange={(e) => {
                  setCashOut(e.target.value)
                }}
              />
            </label>
            <label className={styles.field}>
              <span>End</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={endedAt}
                onChange={(e) => {
                  setEndedAt(e.target.value)
                }}
              />
            </label>
          </div>
          {problem !== null && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          <Button
            onClick={() => {
              void end()
            }}
          >
            End session
          </Button>
        </section>
      )}

      <div className={styles.bar}>
        <Button
          variant="quiet"
          onClick={() => {
            void navigate(toSession)
          }}
        >
          Back to the session
        </Button>
      </div>
    </>
  )
}
