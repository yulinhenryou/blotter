// The table map's tiles and seat names for the hand screen. Facts of the hand only (ADR-0010).

import { seatState, toAct, type BettingState } from '../rules/index.ts'
import { buttonOf, type HandForm } from './form.ts'
import { labelsBySeat } from './positions.ts'
import type { SeatView } from './TableMap.tsx'

export type Names = ReadonlyMap<string, string>

/** Every seat of the table as a tile; `state` adds who is to act, folded, all-in. */
export function seatViews(
  form: HandForm,
  names: Names,
  state: BettingState | null = null,
): SeatView[] {
  const button = buttonOf(form)
  const labels = button === null ? new Map<number, string>() : labelsBySeat(form.dealtIn, button)
  const players = new Map(form.players.map((p) => [p.seat, names.get(p.playerId) ?? null]))
  const next = state === null ? null : toAct(state)
  const views: SeatView[] = []
  for (let seat = 1; seat <= form.tableSize; seat++) {
    const s = state === null ? undefined : seatState(state, seat)
    views.push({
      seat,
      dealtIn: form.dealtIn.includes(seat),
      label: labels.get(seat) ?? null,
      hero: seat === form.heroSeat,
      name: players.get(seat) ?? null,
      toAct: next === seat,
      folded: s?.folded ?? false,
      allIn: s?.allIn ?? false,
      street: s?.street ?? 0,
    })
  }
  return views
}

/** "Seat 5 · UTG". */
export function seatName(form: HandForm, seat: number): string {
  const button = buttonOf(form)
  const label = button === null ? undefined : labelsBySeat(form.dealtIn, button).get(seat)
  return label === undefined ? `Seat ${String(seat)}` : `Seat ${String(seat)} · ${label}`
}
