// Hand — Setup (docs/CAPTURE.md §1.4): hero's position (one tap), hero's cards (two taps in the
// picker, which opens by itself), hero's stack (confirm the prefilled amount or type it), the
// straddle toggle, the time played, and the table map for dealt-in seats and known players.

import { useState } from 'react'

import type { Violation } from '../rules/index.ts'
import { Button } from '../design/Button.tsx'
import type { RecordTypes } from '../store/types.ts'
import { CardPicker, Cards } from './CardPicker.tsx'
import styles from './capture.module.css'
import { Chips } from './Chips.tsx'
import { toLocalInput } from './format.ts'
import { choosePosition, toggleDealtIn, usedCards, type HandForm } from './form.ts'
import { seatViews, type Names } from './handView.ts'
import { NumberPad } from './NumberPad.tsx'
import { preflopLabels } from './positions.ts'
import { inBB } from './sizes.ts'
import { TableMap } from './TableMap.tsx'

type Player = RecordTypes['player']

export function SetupStep({
  form,
  update,
  problem,
  names,
  players,
  addPlayer,
}: {
  form: HandForm
  update: (next: HandForm) => void
  problem: Violation | null
  names: Names
  players: readonly Player[]
  addPlayer: (name: string) => Promise<Player>
}) {
  const [picking, setPicking] = useState(form.heroPosition !== null && form.heroCards.length < 2)
  const [mode, setMode] = useState<'dealt' | 'players'>('dealt')
  const [naming, setNaming] = useState<number | null>(null)
  const bigBlind = form.sessionStakes.big_blind_chips
  const heroCards = new Set(form.heroCards)
  const usedElsewhere = new Set([...usedCards(form)].filter((c) => !heroCards.has(c)))

  return (
    <>
      <Chips
        label="Hero's position"
        options={preflopLabels(form.dealtIn.length).map((l) => ({ value: l, label: l }))}
        value={form.heroPosition}
        onChange={(label) => {
          update(choosePosition(form, label))
          if (form.heroCards.length < 2) setPicking(true)
        }}
      />

      <div className={styles.spread}>
        <span>
          Hero&apos;s cards <Cards cards={form.heroCards} />
        </span>
        <Button
          onClick={() => {
            if (form.heroCards.length === 2) update({ ...form, heroCards: [] })
            setPicking(true)
          }}
        >
          {form.heroCards.length === 2 ? 'Change' : 'Pick'}
        </Button>
      </div>
      {picking && (
        <CardPicker
          title="Hero's cards"
          picked={form.heroCards}
          used={usedElsewhere}
          onPick={(card) => {
            const cards = [...form.heroCards, card]
            update({ ...form, heroCards: cards })
            if (cards.length === 2) setPicking(false)
          }}
          onUnpick={(card) => {
            update({ ...form, heroCards: form.heroCards.filter((c) => c !== card) })
          }}
        />
      )}

      <NumberPad
        label="Hero's stack"
        initial={form.heroStack}
        approx={form.heroStackApprox}
        describe={(chips) =>
          form.heroStackConfirmed && chips === form.heroStack
            ? `${inBB(chips, bigBlind)} · confirmed`
            : inBB(chips, bigBlind)
        }
        onConfirm={(chips, approx) => {
          update({ ...form, heroStack: chips, heroStackApprox: approx, heroStackConfirmed: true })
        }}
      />
      {problem !== null && (
        <p className={styles.problem} role="alert">
          {problem.message}
        </p>
      )}

      {form.sessionStakes.straddles_chips.length > 0 && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.straddled}
            onChange={(e) => {
              update({ ...form, straddled: e.target.checked })
            }}
          />
          Straddle {form.sessionStakes.straddles_chips.join(', ')}
        </label>
      )}

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Played at</span>
          <input
            className={styles.input}
            type="datetime-local"
            value={form.playedAt === null ? '' : toLocalInput(new Date(form.playedAt))}
            onChange={(e) => {
              const time = new Date(e.target.value)
              update({
                ...form,
                playedAt: Number.isNaN(time.getTime()) ? null : time.toISOString(),
              })
            }}
          />
        </label>
        <Button
          variant="quiet"
          onClick={() => {
            update({ ...form, playedAt: null })
          }}
        >
          Unknown
        </Button>
      </div>

      <section className={styles.section}>
        <Chips
          label="Tap a seat to"
          options={[
            { value: 'dealt', label: 'Deal in / out' },
            { value: 'players', label: 'Name a player' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m)
            setNaming(null)
          }}
        />
        <TableMap
          seats={seatViews(form, names)}
          onTap={(seat) => {
            if (mode === 'dealt') update(toggleDealtIn(form, seat))
            else setNaming(seat)
          }}
          disabled={(view) => (mode === 'dealt' ? view.hero : !view.dealtIn || view.hero)}
        />
        {naming !== null && (
          <PlayerPicker
            seat={naming}
            players={players}
            current={form.players.find((p) => p.seat === naming)?.playerId ?? null}
            onPick={(playerId) => {
              const others = form.players.filter((p) => p.seat !== naming)
              update({
                ...form,
                players: playerId === null ? others : [...others, { seat: naming, playerId }],
              })
              setNaming(null)
            }}
            addPlayer={addPlayer}
          />
        )}
      </section>
    </>
  )
}

/** Known players for a seat (those seen at this venue first), a new nickname, or anonymous. */
function PlayerPicker({
  seat,
  players,
  current,
  onPick,
  addPlayer,
}: {
  seat: number
  players: readonly Player[]
  current: string | null
  onPick: (playerId: string | null) => void
  addPlayer: (name: string) => Promise<Player>
}) {
  const [name, setName] = useState('')
  return (
    <section className={styles.status} aria-label={`Player in seat ${String(seat)}`}>
      <p>Seat {seat}</p>
      <div className={styles.row}>
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.chip}
            aria-pressed={p.id === current}
            onClick={() => {
              onPick(p.id)
            }}
          >
            {p.display_name}
          </button>
        ))}
        <button
          type="button"
          className={styles.chip}
          aria-pressed={current === null}
          onClick={() => {
            onPick(null)
          }}
        >
          Anonymous
        </button>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>New nickname</span>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
            }}
          />
        </label>
        <Button
          disabled={name.trim() === ''}
          onClick={() => {
            void addPlayer(name.trim()).then((p) => {
              onPick(p.id)
            })
          }}
        >
          Add
        </Button>
      </div>
    </section>
  )
}
