// Buttons and button-styled links. Every one is at least --touch-target (44 px) in both
// directions, so it can be hit reliably with a thumb (docs/CAPTURE.md §2).

import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'

import styles from './Button.module.css'

export type Variant = 'primary' | 'secondary' | 'quiet'

function className(variant: Variant, extra?: string): string {
  return [styles.button, styles[variant], extra].filter(Boolean).join(' ')
}

export function Button({
  variant = 'secondary',
  className: extra,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={className(variant, extra)} {...props} />
}

export function ButtonLink({
  variant = 'secondary',
  className: extra,
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link className={className(variant, extra)} {...props} />
}
