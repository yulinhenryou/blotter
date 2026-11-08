// A row of toggle buttons for a choice (positions, why logged, ...). Each is a button with
// `aria-pressed`, at least 44 px in both directions.

import styles from './capture.module.css'

export interface ChipOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly disabled?: boolean
}

export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly ChipOption<T>[]
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.row} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.chip}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => {
            onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
