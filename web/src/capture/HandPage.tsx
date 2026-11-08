// A hand being entered or edited (docs/CAPTURE.md §1.4–§1.7). The form lives in React state and
// every change is also written to the phone's store as a draft, so leaving the screen (or the app
// being closed) loses nothing; a draft opened again resumes at the step it was left at, because
// the step is computed from the form (`phaseOf`).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'

import { Button } from '../design/Button.tsx'
import { getEntry, resolveKeepMine } from '../store/records.ts'
import type { Entry } from '../store/types.ts'
import { ActStep, BoardStep, HeroFoldedStep } from './ActStep.tsx'
import styles from './capture.module.css'
import { useCapture, useLoad, useNow } from './context.ts'
import {
  addPlayer,
  discardDraft,
  knownPlayers,
  loadForm,
  openSample,
  resumed,
  sampleDue,
  saveHand,
  writeDraft,
} from './data.ts'
import { EndStep } from './EndStep.tsx'
import { issuePlace } from './format.ts'
import { phaseOf, undo, type HandForm, type RecordReason } from './form.ts'
import { SetupStep } from './SetupStep.tsx'

interface Loaded {
  readonly form: HandForm
  readonly draft: boolean
  readonly entry: Entry<'hand'> | null
}

export function HandPage() {
  const { handId = '' } = useParams()
  const { db } = useCapture()
  const location = useLocation()
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined)
  // Read once: the state is cleared below, and a later render must not count as a resumption.
  const [fresh] = useState(() => (location.state as { fresh?: boolean } | null)?.fresh === true)

  useEffect(() => {
    // An object, not a `let`: TypeScript cannot see the cleanup's assignment inside the async body.
    const live = { current: true }
    void (async () => {
      const found = await loadForm(db, handId)
      const entry = await getEntry(db, handId)
      // Opening a draft that was left counts as an interruption of its entry time (§3).
      if (found?.draft === true && !fresh) await resumed(db, handId)
      if (live.current) {
        setLoaded(
          found === null ? null : { ...found, entry: entry?.kind === 'hand' ? entry : null },
        )
      }
    })()
    return () => {
      live.current = false
    }
  }, [db, handId, fresh])

  useEffect(() => {
    // "fresh" belongs to the "New hand" tap only: a reload of this page is a resumption.
    if (fresh) void navigate(location.pathname, { replace: true, state: null })
  }, [fresh, navigate, location.pathname])

  if (loaded === undefined) return <p aria-busy="true">Loading…</p>
  if (loaded === null) return <p role="alert">This hand is not on this phone.</p>
  return <HandEditor key={handId} loaded={loaded} />
}

function HandEditor({ loaded }: { loaded: Loaded }) {
  const { db, deps, changed, sync } = useCapture()
  const navigate = useNavigate()
  const [form, setForm] = useState(loaded.form)
  const [saving, setSaving] = useState(false)
  const writes = useRef<Promise<void>>(Promise.resolve())
  const now = useNow(deps.now)

  const loadSide = useCallback(
    async () => ({
      players: await knownPlayers(db, loaded.form.sessionId),
      sample: await openSample(db, loaded.form.sessionId),
    }),
    [db, loaded.form.sessionId],
  )
  const side = useLoad(loadSide)
  const names = useMemo(
    () => new Map((side?.players ?? []).map((p) => [p.id, p.display_name])),
    [side?.players],
  )

  const update = useCallback(
    (next: HandForm) => {
      setForm(next)
      // Writes are chained so they reach the store in the order the changes were made.
      writes.current = writes.current.then(() => writeDraft(db, next, deps.now()))
    },
    [db, deps],
  )

  const phase = useMemo(() => phaseOf(form), [form])
  const entry = loaded.entry
  const issues = entry?.state.status === 'invalid' ? entry.state.issues : []
  const toSession = `/capture/session/${form.sessionId}`

  const save = async (reason: RecordReason) => {
    setSaving(true)
    await writes.current
    await saveHand(db, form, reason, deps.now(), deps.uniform)
    changed()
    void sync()
    void navigate(toSession, { state: { saved: form.clientSeq } })
  }

  const discard = async () => {
    await writes.current
    await discardDraft(db, form.id)
    changed()
    void navigate(toSession)
  }

  const canUndo = form.moves.length > 0 || form.heroStackConfirmed

  return (
    <>
      <div className={styles.spread}>
        <h1 className={styles.heading}>Hand #{form.clientSeq}</h1>
        <span className={styles.row}>
          {canUndo && phase.kind !== 'setup' && (
            <Button
              onClick={() => {
                update(undo(form))
              }}
            >
              Undo
            </Button>
          )}
          <Button
            variant="quiet"
            onClick={() => {
              void writes.current.then(() => navigate(toSession))
            }}
          >
            Close
          </Button>
        </span>
      </div>

      {entry?.state.status === 'conflict' && (
        <div className={styles.status} role="alert">
          <p>The server holds another version of this hand.</p>
          <Button
            onClick={() => {
              void resolveKeepMine(db, form.id, deps.now()).then(() => {
                changed()
                void sync()
              })
            }}
          >
            Keep mine
          </Button>
        </div>
      )}
      {issues.length > 0 && (
        <ul className={styles.status} role="alert" aria-label="Refused by the server">
          {issues.map((issue, i) => (
            <li key={i}>
              {issuePlace(issue.path)}: {issue.message}
            </li>
          ))}
        </ul>
      )}

      {phase.kind === 'setup' && (
        <SetupStep
          form={form}
          update={update}
          problem={phase.problem}
          names={names}
          players={side?.players ?? []}
          addPlayer={async (name) => {
            const player = await addPlayer(db, name, deps.now())
            changed()
            return player
          }}
        />
      )}
      {phase.kind === 'act' && (
        <ActStep
          key={form.moves.length}
          form={form}
          state={phase.state}
          legal={phase.legal}
          update={update}
          names={names}
        />
      )}
      {phase.kind === 'board' && phase.street !== 'preflop' && (
        <BoardStep
          form={form}
          state={phase.state}
          street={phase.street}
          update={update}
          names={names}
        />
      )}
      {phase.kind === 'heroFolded' && (
        <HeroFoldedStep form={form} state={phase.state} update={update} names={names} />
      )}
      {phase.kind === 'end' && (
        <EndStep
          form={form}
          state={phase.state}
          showdown={phase.showdown}
          update={update}
          defaultReason={sampleDue(side?.sample ?? null, now) ? 'random_sample' : 'notable'}
          saving={saving}
          onSave={(reason) => {
            void save(reason)
          }}
        />
      )}

      {(loaded.draft || entry === null) && (
        <div className={styles.bar}>
          <Button
            variant="quiet"
            onClick={() => {
              void discard()
            }}
          >
            {entry === null ? 'Discard draft' : 'Discard changes'}
          </Button>
        </div>
      )}
    </>
  )
}
