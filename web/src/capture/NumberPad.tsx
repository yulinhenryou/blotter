// The number pad for chip amounts (docs/CAPTURE.md §1.4–§1.6). A prefilled amount is confirmed with
// "✓" or replaced by typing (the first digit starts a new number). "≈" marks the amount
// approximate. The amount is checked as it is typed: while it is not allowed, "✓" is disabled and
// the line under the amount says why.

import { useState } from 'react'

import styles from './NumberPad.module.css'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export function NumberPad({
  label,
  initial = null,
  approx: initialApprox = false,
  allowApprox = true,
  check,
  describe,
  onConfirm,
}: {
  /** What is being entered, e.g. "Hero's stack" (also the group's accessible name). */
  label: string
  initial?: number | null
  approx?: boolean
  allowApprox?: boolean
  /** Why the amount is not allowed, or `null`. */
  check?: (chips: number) => string | null
  /** A second line for an allowed amount, e.g. the amount in big blinds. */
  describe?: (chips: number) => string
  onConfirm: (chips: number, approx: boolean) => void
}) {
  const [text, setText] = useState(initial === null ? '' : String(initial))
  const [fresh, setFresh] = useState(initial !== null)
  const [approx, setApprox] = useState(initialApprox)

  const chips = text === '' ? null : Number(text)
  const problem = chips === null ? null : (check?.(chips) ?? null)

  const type = (digit: string) => {
    const next = fresh ? digit : text + digit
    // Leading zeros and absurd lengths are ignored rather than shown.
    if (next.length > 9 || next === '0') return
    setText(next)
    setFresh(false)
  }

  return (
    <div className={styles.pad} role="group" aria-label={label}>
      <div className={styles.display}>
        <span className={styles.label}>{label}</span>
        <output className={styles.amount} aria-label={`${label} amount`}>
          {approx && chips !== null ? '≈ ' : ''}
          {chips ?? '—'}
        </output>
        <span className={problem === null ? styles.hint : styles.problem} aria-live="polite">
          {problem ?? (chips === null ? '' : (describe?.(chips) ?? ''))}
        </span>
      </div>
      <div className={styles.keys}>
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            className={styles.key}
            onClick={() => {
              type(d)
            }}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className={styles.key}
          aria-label="Approximate"
          aria-pressed={approx}
          disabled={!allowApprox}
          onClick={() => {
            setApprox((a) => !a)
          }}
        >
          ≈
        </button>
        <button
          type="button"
          className={styles.key}
          onClick={() => {
            type('0')
          }}
        >
          0
        </button>
        <button
          type="button"
          className={styles.key}
          aria-label="Delete"
          onClick={() => {
            setText(fresh ? '' : text.slice(0, -1))
            setFresh(false)
          }}
        >
          ⌫
        </button>
        <button
          type="button"
          className={[styles.key, styles.confirm].join(' ')}
          aria-label="OK"
          disabled={chips === null || chips <= 0 || problem !== null}
          onClick={() => {
            if (chips !== null) onConfirm(chips, approx)
          }}
        >
          ✓
        </button>
      </div>
    </div>
  )
}
