// Hand — Actions and Board (docs/CAPTURE.md §1.5–§1.6): the action pad offers only the legal
// actions of the seat to act; bet and raise open the size row and the number pad; tapping another
// seat on the map folds everyone up to it ("fold to"). When a street closes, the board picker asks
// for its cards. After hero's fold the pad offers "End here".

import { useState } from 'react'

import {
  seatState,
  type BettingState,
  type LegalActions,
  type Move,
  type Result,
} from '../rules/index.ts'
import { Button } from '../design/Button.tsx'
import { CardPicker } from './CardPicker.tsx'
import styles from './capture.module.css'
import {
  act,
  addBoardCard,
  BOARD_CARDS,
  endHere,
  foldTo,
  keepEntering,
  removeBoardCard,
  replay,
  usedCards,
  type HandForm,
} from './form.ts'
import { HandFacts } from './HandFacts.tsx'
import { seatViews, type Names } from './handView.ts'
import { NumberPad } from './NumberPad.tsx'
import { inBB, presets, sizeMove, topOf, type SizeKind } from './sizes.ts'
import { TableMap } from './TableMap.tsx'

interface StepProps {
  form: HandForm
  state: BettingState
  update: (next: HandForm) => void
  names: Names
}

/** Bets and raises already made on the current street (forced bets are not moves). */
function raisesOnStreet(form: HandForm, state: BettingState): number {
  const replayed = replay(form)
  if (!replayed.ok) return 0
  return form.moves.filter(
    (m, i) =>
      replayed.value.streets[i] === state.street &&
      (m.move.kind === 'bet' || m.move.kind === 'raise'),
  ).length
}

export function ActStep({
  form,
  state,
  legal,
  update,
  names,
}: StepProps & { legal: LegalActions }) {
  const [sizing, setSizing] = useState<SizeKind | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const bb = state.bigBlind

  const apply = (result: Result<HandForm>) => {
    if (result.ok) {
      update(result.value)
      setSizing(null)
      setMessage(null)
    } else {
      setMessage(result.violation.message)
    }
  }
  const move = (m: Move, approximate = false) => {
    apply(act(form, m, approximate))
  }
  const call = legal.call

  return (
    <>
      <HandFacts form={form} state={state} />
      <TableMap
        seats={seatViews(form, names, state)}
        onTap={(seat) => {
          if (seat !== legal.seat) apply(foldTo(form, seat))
        }}
        disabled={(view) => !view.dealtIn || view.folded === true || view.allIn === true}
      />
      {message !== null && (
        <p className={styles.problem} role="alert">
          {message}
        </p>
      )}
      {sizing === null ? (
        <div className={styles.pad} role="group" aria-label="Actions">
          {call !== null && (
            <Button
              onClick={() => {
                move({ kind: 'fold' })
              }}
            >
              Fold
            </Button>
          )}
          {legal.check && (
            <Button
              onClick={() => {
                move({ kind: 'check' })
              }}
            >
              Check
            </Button>
          )}
          {call !== null && (
            <Button
              onClick={() => {
                move({ kind: 'call', amount_to_chips: call.to, all_in: call.allIn ?? false })
              }}
            >
              {call.allIn === true ? 'Call all-in' : 'Call'} {call.to}
            </Button>
          )}
          {legal.bet !== null && (
            <Button
              onClick={() => {
                setSizing('bet')
              }}
            >
              Bet
            </Button>
          )}
          {legal.raise !== null && (
            <Button
              onClick={() => {
                setSizing('raise')
              }}
            >
              Raise
            </Button>
          )}
        </div>
      ) : (
        <SizePanel
          kind={sizing}
          state={state}
          legal={legal}
          raises={raisesOnStreet(form, state)}
          onMove={move}
          onCancel={() => {
            setSizing(null)
          }}
          bigBlind={bb}
        />
      )}
    </>
  )
}

function SizePanel({
  kind,
  state,
  legal,
  raises,
  onMove,
  onCancel,
  bigBlind,
}: {
  kind: SizeKind
  state: BettingState
  legal: LegalActions
  raises: number
  onMove: (move: Move, approximate?: boolean) => void
  onCancel: () => void
  bigBlind: number
}) {
  const [allIn, setAllIn] = useState(false)
  const top = topOf(state, legal)
  const use = (to: number, all: boolean, approximate = false) => {
    const { move } = sizeMove(state, legal, kind, to, all)
    if (move !== null) onMove(move, approximate)
  }
  const verb = kind === 'bet' ? 'Bet' : 'Raise to'
  return (
    <section aria-label={kind === 'bet' ? 'Bet size' : 'Raise size'}>
      <div className={styles.row} role="group" aria-label="Sizes">
        {presets(state, legal, kind, raises).map((p) => (
          <button
            key={p.label}
            type="button"
            className={styles.chip}
            disabled={p.problem !== null}
            title={p.problem ?? `${verb} ${String(p.to)}`}
            onClick={() => {
              use(p.to, false)
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.chip}
          aria-pressed={allIn}
          onClick={() => {
            if (top !== null) use(top, true)
            else setAllIn((a) => !a)
          }}
        >
          All-in{top === null ? '' : ` ${String(top)}`}
        </button>
      </div>
      <NumberPad
        label={allIn ? 'All-in to' : verb}
        check={(to) => sizeMove(state, legal, kind, to, allIn).problem}
        describe={(to) => inBB(to, bigBlind)}
        onConfirm={(to, approximate) => {
          use(to, allIn, approximate)
        }}
      />
      <Button variant="quiet" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  )
}

export function BoardStep({
  form,
  state,
  street,
  update,
}: StepProps & { street: 'flop' | 'turn' | 'river' }) {
  const first = street === 'flop' ? 0 : BOARD_CARDS[street] - 1
  const name = street === 'flop' ? 'Flop' : street === 'turn' ? 'Turn' : 'River'
  return (
    <>
      <HandFacts form={form} state={state} />
      <CardPicker
        title={name}
        picked={form.board.slice(first)}
        used={usedCards(form)}
        onPick={(card) => {
          update(addBoardCard(form, card))
        }}
        onUnpick={(card) => {
          update(removeBoardCard(form, card))
        }}
      />
    </>
  )
}

export function HeroFoldedStep({ form, state, update }: StepProps) {
  const hero = seatState(state, form.heroSeat)
  return (
    <>
      <HandFacts form={form} state={state} />
      <p>
        Hero folded{hero === undefined ? '' : ` after putting in ${String(hero.ante + hero.live)}`}.
        The hand goes on without hero.
      </p>
      <div className={styles.bar}>
        <Button
          variant="primary"
          onClick={() => {
            update(endHere(form))
          }}
        >
          End here
        </Button>
        <Button
          onClick={() => {
            update(keepEntering(form))
          }}
        >
          Keep entering
        </Button>
      </div>
    </>
  )
}
