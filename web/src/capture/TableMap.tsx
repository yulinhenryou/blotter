// The table map: one tile per seat, with its position label, its player's nickname and, during the
// actions, whether it is to act, has folded or is all-in and what it has put in on this street.
// What a tap does depends on the screen (toggle "dealt in", pick a player, "fold to").

import styles from './TableMap.module.css'

export interface SeatView {
  readonly seat: number
  readonly dealtIn: boolean
  readonly label: string | null
  readonly hero: boolean
  readonly name: string | null
  readonly toAct?: boolean
  readonly folded?: boolean
  readonly allIn?: boolean
  /** Chips put in on this street, shown when above zero. */
  readonly street?: number
}

function describe(view: SeatView): string {
  const parts = [`Seat ${String(view.seat)}`]
  if (view.label !== null) parts.push(view.label)
  if (view.hero) parts.push('hero')
  if (view.name !== null) parts.push(view.name)
  if (!view.dealtIn) parts.push('not dealt in')
  if (view.toAct === true) parts.push('to act')
  if (view.folded === true) parts.push('folded')
  if (view.allIn === true) parts.push('all-in')
  return parts.join(', ')
}

export function TableMap({
  seats,
  onTap,
  disabled,
}: {
  seats: readonly SeatView[]
  onTap?: (seat: number) => void
  /** Seats that cannot be tapped right now. */
  disabled?: (view: SeatView) => boolean
}) {
  return (
    <div className={styles.map} role="group" aria-label="Table">
      {seats.map((view) => {
        const classes = [
          styles.seat,
          view.dealtIn ? '' : styles.out,
          view.hero ? styles.hero : '',
          view.toAct === true ? styles.toAct : '',
          view.folded === true ? styles.folded : '',
        ]
        return (
          <button
            key={view.seat}
            type="button"
            className={classes.join(' ')}
            aria-label={describe(view)}
            disabled={onTap === undefined || (disabled?.(view) ?? false)}
            onClick={() => onTap?.(view.seat)}
          >
            <span className={styles.number}>{view.seat}</span>
            <span className={styles.label}>{view.label ?? ''}</span>
            <span className={styles.bottom}>
              {view.hero
                ? 'Hero'
                : view.allIn === true
                  ? 'All-in'
                  : view.folded === true
                    ? 'Folded'
                    : (view.name ?? '')}
            </span>
            {(view.street ?? 0) > 0 && <span className={styles.chips}>{view.street}</span>}
          </button>
        )
      })}
    </div>
  )
}
