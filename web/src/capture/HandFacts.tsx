// What the hand screen shows above the pad: the street, the pot, the board and the seat to act
// (docs/CAPTURE.md §1.5). Facts of the hand only (ADR-0010).

import { toAct, type BettingState } from '../rules/index.ts'
import { Cards } from './CardPicker.tsx'
import styles from './capture.module.css'
import type { HandForm } from './form.ts'
import { seatName } from './handView.ts'
import { inBB, potOf } from './sizes.ts'

const STREET_NAME = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' } as const

export function HandFacts({ form, state }: { form: HandForm; state: BettingState }) {
  const pot = potOf(state)
  const seat = toAct(state)
  return (
    <dl className={styles.facts} aria-label="Hand so far">
      <div className={styles.fact}>
        <dt>Street</dt>
        <dd>{STREET_NAME[state.street]}</dd>
      </div>
      <div className={styles.fact}>
        <dt>Pot</dt>
        <dd>
          {pot} ({inBB(pot, state.bigBlind)})
        </dd>
      </div>
      <div className={styles.fact}>
        <dt>Board</dt>
        <dd>
          <Cards cards={form.board} />
        </dd>
      </div>
      {seat !== null && (
        <div className={styles.fact}>
          <dt>To act</dt>
          <dd>{seatName(form, seat)}</dd>
        </div>
      )}
    </dl>
  )
}
