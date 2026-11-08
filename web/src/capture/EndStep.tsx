// Hand — End (docs/CAPTURE.md §1.6): villain cards (the picker opens by itself at a showdown),
// villain stacks (optional, approximate by default), who won each pot with the amounts proposed
// from the pots and the session's rake rule, why the hand was logged, and Save.

import { useState } from 'react'

import type { BettingState } from '../rules/index.ts'
import { Button } from '../design/Button.tsx'
import { CardPicker, Cards } from './CardPicker.tsx'
import styles from './capture.module.css'
import { Chips } from './Chips.tsx'
import {
  payoutOf,
  saveProblem,
  setVillain,
  stackProblem,
  toggleWinner,
  usedCards,
  villainOf,
  villainsForStacks,
  villainsInAtEnd,
  type HandForm,
  type RecordReason,
} from './form.ts'
import { HandFacts } from './HandFacts.tsx'
import { seatName } from './handView.ts'
import { NumberPad } from './NumberPad.tsx'
import { inBB } from './sizes.ts'

const REASONS: readonly { value: RecordReason; label: string }[] = [
  { value: 'notable', label: 'Notable' },
  { value: 'routine', label: 'Routine' },
  { value: 'random_sample', label: 'Random sample' },
]

type Editing =
  | { readonly kind: 'cards'; readonly seat: number; readonly picked: readonly string[] }
  | { readonly kind: 'stack'; readonly seat: number }
  | { readonly kind: 'won'; readonly seat: number }
  | null

export function EndStep({
  form,
  state,
  showdown,
  update,
  defaultReason,
  saving,
  onSave,
}: {
  form: HandForm
  state: BettingState
  showdown: boolean
  update: (next: HandForm) => void
  defaultReason: RecordReason
  saving: boolean
  onSave: (reason: RecordReason) => void
}) {
  const inAtEnd = villainsInAtEnd(form, state)
  // At a showdown the picker asks for each villain's cards in turn, until answered.
  const unanswered = (f: HandForm) =>
    showdown
      ? inAtEnd.find((seat) => {
          const v = villainOf(f, seat)
          return v.cards === null && v.noCards === null
        })
      : undefined
  const firstAsk = unanswered(form)
  const [editing, setEditing] = useState<Editing>(
    firstAsk === undefined ? null : { kind: 'cards', seat: firstAsk, picked: [] },
  )
  const bb = state.bigBlind
  const reason = form.reason ?? defaultReason
  const problem = saveProblem(form)
  const payout = form.endsAtHeroFold ? null : payoutOf(form, state)

  /** Store an answer for a villain's cards, then ask for the next one (at a showdown). */
  const answerCards = (next: HandForm) => {
    update(next)
    const ask = unanswered(next)
    setEditing(ask === undefined ? null : { kind: 'cards', seat: ask, picked: [] })
  }

  if (editing?.kind === 'cards') {
    const villain = villainOf(form, editing.seat)
    return (
      <CardPicker
        title={`${seatName(form, editing.seat)}: cards`}
        picked={editing.picked}
        used={usedCards(form)}
        onPick={(card) => {
          const picked = [...editing.picked, card]
          if (picked.length < 2) setEditing({ ...editing, picked })
          else answerCards(setVillain(form, { ...villain, cards: picked, noCards: null }))
        }}
        onUnpick={(card) => {
          setEditing({ ...editing, picked: editing.picked.filter((c) => c !== card) })
        }}
      >
        <Button
          onClick={() => {
            answerCards(setVillain(form, { ...villain, cards: null, noCards: 'unknown' }))
          }}
        >
          Unknown
        </Button>
        <Button
          onClick={() => {
            answerCards(setVillain(form, { ...villain, cards: null, noCards: 'mucked' }))
          }}
        >
          Mucked
        </Button>
      </CardPicker>
    )
  }

  if (editing?.kind === 'stack') {
    const villain = villainOf(form, editing.seat)
    return (
      <>
        <NumberPad
          label={`${seatName(form, editing.seat)}: stack`}
          initial={villain.stack}
          approx={villain.stack === null ? true : villain.stackApprox}
          check={(chips) => stackProblem(state, editing.seat, chips)}
          describe={(chips) => inBB(chips, bb)}
          onConfirm={(chips, approx) => {
            update(setVillain(form, { ...villain, stack: chips, stackApprox: approx }))
            setEditing(null)
          }}
        />
        <Button
          variant="quiet"
          onClick={() => {
            setEditing(null)
          }}
        >
          Cancel
        </Button>
      </>
    )
  }

  if (editing?.kind === 'won' && payout !== null) {
    return (
      <>
        <NumberPad
          label={`${seatName(form, editing.seat)}: won`}
          initial={payout.won.get(editing.seat) ?? null}
          allowApprox={false}
          describe={(chips) => inBB(chips, bb)}
          onConfirm={(chips) => {
            const won = new Map(payout.won)
            won.set(editing.seat, chips)
            update({ ...form, won: [...won].map(([seat, c]) => ({ seat, chips: c })) })
            setEditing(null)
          }}
        />
        <Button
          variant="quiet"
          onClick={() => {
            setEditing(null)
          }}
        >
          Cancel
        </Button>
      </>
    )
  }

  const hero = form.heroStack
  return (
    <>
      <HandFacts form={form} state={state} />
      {form.endsAtHeroFold && <p className={styles.muted}>The record ends at hero&apos;s fold.</p>}

      {inAtEnd.length > 0 && (
        <section className={styles.section} aria-labelledby="villain-cards">
          <h2 id="villain-cards" className={styles.sectionTitle}>
            Villain cards
          </h2>
          {inAtEnd.map((seat) => {
            const v = villainOf(form, seat)
            return (
              <div key={seat} className={styles.spread}>
                <span>
                  {seatName(form, seat)}:{' '}
                  {v.cards === null ? (
                    v.noCards === 'mucked' ? (
                      'mucked'
                    ) : (
                      'unknown'
                    )
                  ) : (
                    <Cards cards={v.cards} />
                  )}
                </span>
                <Button
                  aria-label={`${seatName(form, seat)}: cards`}
                  onClick={() => {
                    setEditing({ kind: 'cards', seat, picked: [] })
                  }}
                >
                  Cards
                </Button>
              </div>
            )
          })}
        </section>
      )}

      {villainsForStacks(form, state).length > 0 && (
        <section className={styles.section} aria-labelledby="villain-stacks">
          <h2 id="villain-stacks" className={styles.sectionTitle}>
            Villain stacks (optional)
          </h2>
          {villainsForStacks(form, state).map((seat) => {
            const v = villainOf(form, seat)
            const sameProblem = hero === null ? 'unknown' : stackProblem(state, seat, hero)
            return (
              <div key={seat} className={styles.spread}>
                <span>
                  {seatName(form, seat)}:{' '}
                  {v.stack === null ? 'unknown' : `${v.stackApprox ? '≈ ' : ''}${String(v.stack)}`}
                </span>
                <span className={styles.row}>
                  <Button
                    aria-label={`${seatName(form, seat)}: same as hero`}
                    disabled={sameProblem !== null}
                    onClick={() => {
                      update(setVillain(form, { ...v, stack: hero, stackApprox: true }))
                    }}
                  >
                    Same as hero
                  </Button>
                  <Button
                    aria-label={`${seatName(form, seat)}: enter stack`}
                    onClick={() => {
                      setEditing({ kind: 'stack', seat })
                    }}
                  >
                    Enter
                  </Button>
                </span>
              </div>
            )
          })}
        </section>
      )}

      {payout !== null && (
        <section className={styles.section} aria-labelledby="winners">
          <h2 id="winners" className={styles.sectionTitle}>
            Who won
          </h2>
          {payout.pots.map((pot, i) => {
            const name = i === 0 ? 'Main pot' : `Side pot ${String(i)}`
            const decided = !showdown || pot.eligible.length === 1
            return (
              <div key={name} className={styles.stack}>
                <span>
                  {name} {pot.chips}
                </span>
                {decided ? null : (
                  <div className={styles.row} role="group" aria-label={`${name} winner`}>
                    {pot.eligible.map((seat) => (
                      <button
                        key={seat}
                        type="button"
                        className={styles.chip}
                        aria-pressed={(payout.winners[i] ?? []).includes(seat)}
                        onClick={() => {
                          update(toggleWinner(form, i, seat))
                        }}
                      >
                        {seatName(form, seat)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {[...payout.won].map(([seat, chips]) => (
            <div key={seat} className={styles.spread}>
              <span>
                {seatName(form, seat)} wins {chips}
              </span>
              <Button
                variant="quiet"
                aria-label={`${seatName(form, seat)}: edit amount won`}
                onClick={() => {
                  setEditing({ kind: 'won', seat })
                }}
              >
                Edit
              </Button>
            </div>
          ))}
          <p className={styles.muted}>Rake {payout.rake}</p>
        </section>
      )}

      <section className={styles.section} aria-labelledby="reason">
        <h2 id="reason" className={styles.sectionTitle}>
          Why logged
        </h2>
        <Chips
          label="Why logged"
          options={REASONS}
          value={reason}
          onChange={(value) => {
            update({ ...form, reason: value })
          }}
        />
      </section>

      {problem !== null && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.bar}>
        <Button
          variant="primary"
          disabled={problem !== null || saving}
          onClick={() => {
            onSave(reason)
          }}
        >
          Save
        </Button>
      </div>
    </>
  )
}
