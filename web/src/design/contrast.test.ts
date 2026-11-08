// WCAG AA for every text color on every surface, in light and dark mode (M4a, acceptance
// criterion 5). The colors are read from tokens.css itself, so the test checks what ships.
//
// Contrast ratio (WCAG 2.2, "contrast ratio" and "relative luminance"):
//   L = 0.2126 R + 0.7152 G + 0.0722 B, each channel c linearized as
//       c / 12.92 if c <= 0.04045, else ((c + 0.055) / 1.055) ^ 2.4   (c = 8-bit value / 255)
//   ratio = (L_lighter + 0.05) / (L_darker + 0.05), from 1 to 21.
// AA asks for 4.5 for normal text and 3 for large text and for graphics; every text token here is
// held to 4.5, since any of them may be used at body size.

import { describe, expect, it } from 'vitest'

import css from './tokens.css?raw'

type Palette = Record<string, string>

function colors(block: string): Palette {
  const palette: Palette = {}
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\b/gi)) {
    const [, name, hex] = match
    if (name !== undefined && hex !== undefined) palette[name] = hex.toLowerCase()
  }
  return palette
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const darkStart = css.indexOf('@media (prefers-color-scheme: dark)')
const light = colors(css.slice(0, darkStart))
const dark = { ...light, ...colors(css.slice(darkStart)) }

const TEXT = ['text', 'text-muted', 'accent', 'danger', 'suit-red']
const SURFACES = ['bg', 'surface', 'surface-sunken']
const MARKS = ['ev-gain', 'ev-loss']

describe('contrast formula', () => {
  // Anchors from the definition: black on white is 21, a color on itself is 1.
  it('gives 21 for black on white and 1 for equal colors', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 10)
    expect(contrast('#777777', '#777777')).toBe(1)
  })
})

describe.each([
  ['light', light],
  ['dark', dark],
])('%s mode', (_mode, palette) => {
  it('defines every token it is checked on', () => {
    for (const name of [...TEXT, ...SURFACES, ...MARKS, 'on-accent']) {
      expect(palette[name], name).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface])))(
    '%s on %s is at least 4.5:1',
    (text, surface) => {
      expect(contrast(palette[text] ?? '', palette[surface] ?? '')).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('text on the accent is at least 4.5:1', () => {
    expect(contrast(palette['on-accent'] ?? '', palette.accent ?? '')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(MARKS.flatMap((mark) => SURFACES.map((surface) => [mark, surface])))(
    'mark %s on %s is at least 3:1',
    (mark, surface) => {
      expect(contrast(palette[mark] ?? '', palette[surface] ?? '')).toBeGreaterThanOrEqual(3)
    },
  )
})
