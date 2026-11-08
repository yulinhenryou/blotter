// The card picker (docs/CAPTURE.md §2): four columns (♠ ♥ ♦ ♣) and thirteen rows (A to 2), one tap
// per card. Cards used elsewhere in the hand are disabled; cards picked in this round can be tapped
// again to take them back. Suits differ by symbol as well as by color.

import type { ReactNode } from 'react'

import { cardName, cardText, isRed, RANKS, SUITS } from './cards.ts'
import styles from './CardPicker.module.css'

export function CardPicker({
  title,
  picked,
  used,
  onPick,
  onUnpick,
  children,
}: {
  title: string
  /** Cards picked in this round, shown selected. */
  picked: readonly string[]
  /** Cards used elsewhere in the hand. */
  used: ReadonlySet<string>
  onPick: (card: string) => void
  onUnpick?: (card: string) => void
  /** Extra buttons under the grid ("Unknown", "Mucked", ...). */
  children?: ReactNode
}) {
  return (
    <section className={styles.picker} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.grid} role="group" aria-label="Cards">
        {RANKS.flatMap((rank) =>
          SUITS.map((suit) => {
            const card = `${rank}${suit}`
            const selected = picked.includes(card)
            const disabled = !selected && used.has(card)
            return (
              <button
                key={card}
                type="button"
                className={[styles.card, isRed(card) ? styles.red : ''].join(' ')}
                aria-label={cardName(card)}
                aria-pressed={selected}
                disabled={disabled || (selected && onUnpick === undefined)}
                onClick={() => {
                  if (selected) onUnpick?.(card)
                  else onPick(card)
                }}
              >
                {cardText(card)}
              </button>
            )
          }),
        )}
      </div>
      {children !== undefined && <div className={styles.extra}>{children}</div>}
    </section>
  )
}

/** Cards as text with suit colors, for summaries. */
export function Cards({ cards }: { cards: readonly string[] }) {
  if (cards.length === 0) return <span className={styles.none}>—</span>
  return (
    <span className={styles.cards} aria-label={cards.map(cardName).join(', ')}>
      {cards.map((card) => (
        <span key={card} className={isRed(card) ? styles.red : undefined} aria-hidden="true">
          {cardText(card)}
        </span>
      ))}
    </span>
  )
}
