// Cards as the hand record writes them: rank then suit, e.g. "Ah", "Td", "2c".

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export const SUITS = ['s', 'h', 'd', 'c'] as const

export type Suit = (typeof SUITS)[number]

// U+FE0E asks for the text form of each symbol: without it iOS may draw ♥ and ♦ as red emoji,
// which would ignore the suit colors.
export const SUIT_SYMBOL: Readonly<Record<Suit, string>> = {
  s: '♠\uFE0E',
  h: '♥\uFE0E',
  d: '♦\uFE0E',
  c: '♣\uFE0E',
}
const SUIT_NAME: Readonly<Record<Suit, string>> = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
}
const RANK_NAME: Readonly<Record<string, string>> = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  T: 'Ten',
}

function suitOf(card: string): Suit {
  const suit = card.slice(1)
  return (SUITS as readonly string[]).includes(suit) ? (suit as Suit) : 's'
}

/** "A♥": the rank (10 shown as "10") and the suit symbol. */
export function cardText(card: string): string {
  const rank = card.slice(0, 1)
  return `${rank === 'T' ? '10' : rank}${SUIT_SYMBOL[suitOf(card)]}`
}

/** "Ace of hearts", for screen readers. */
export function cardName(card: string): string {
  const rank = card.slice(0, 1)
  return `${RANK_NAME[rank] ?? rank} of ${SUIT_NAME[suitOf(card)]}`
}

export function isRed(card: string): boolean {
  const suit = suitOf(card)
  return suit === 'h' || suit === 'd'
}
