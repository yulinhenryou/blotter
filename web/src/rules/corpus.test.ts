// The TypeScript rules agree with the Python checker on every hand of the corpus (ADR-0028).
//
// fixtures/corpus.json is written by `uv run --project python python scripts/export_rules_corpus.py`
// from the Python test dealer and the worked examples of docs/MATH.md §1.5; a Python test fails if
// it is stale. For each hand: the forced bets; before every action the street, the seat to act,
// B and F, the legal actions with their amounts and a few probe moves with the server's verdict;
// at the end the streets reached, every seat's chips, the uncalled bet, the pots, hero's net, the
// rake, and whether some results can be paid.

import { describe, expect, it } from 'vitest'

import raw from './fixtures/corpus.json?raw'
import {
  advance,
  firstInfeasiblePrefix,
  forcedBets,
  legalActions,
  moveViolation,
  play,
  seatState,
  settle,
  startHand,
  toAct,
  type BettingState,
  type ForcedBet,
  type HandSetup,
  type Move,
  type Play,
  type Street,
} from './index.ts'

interface Probe {
  kind: Move['kind']
  amount_to_chips: number | null
  all_in: boolean
  code: string | null
}

interface Step {
  street: Street
  to_act: number
  bet: number
  full_raise: number
  legal: {
    check: boolean
    call: { to: number; all_in: boolean | null } | null
    bet: { min: number; max: number | null } | null
    raise: { min: number; max: number | null } | null
  }
  probes: Probe[]
}

interface End {
  street: Street
  reached: Street[]
  hand_over: boolean
  seats: { seat: number; ante: number; live: number; folded: boolean; all_in: boolean }[]
  hero_net: number
  rake: number | null
  uncalled?: { seat: number; chips: number } | null
  pots?: { chips: number; eligible: number[] }[]
  results?: { seat: number; won_chips: number }[]
  result_probes?: {
    won: { seat: number; chips: number }[]
    first_infeasible_prefix: number | null
  }[]
}

interface Case {
  name: string
  setup: HandSetup & { hero_seat: number; ends_at_hero_fold: boolean }
  forced: ForcedBet[]
  actions: (Play & { amount_to_chips?: number })[]
  steps: Step[]
  end: End
}

const corpus = JSON.parse(raw) as Case[]

function toMove(probe: Probe): Move {
  const all_in = probe.all_in
  if (probe.kind === 'fold' || probe.kind === 'check') return { kind: probe.kind, all_in }
  return { kind: probe.kind, amount_to_chips: probe.amount_to_chips ?? 0, all_in }
}

function start(c: Case): BettingState {
  const started = startHand(c.setup)
  if (!started.ok) throw new Error(`${c.name}: ${started.violation.code}`)
  return started.value
}

describe('rules corpus', () => {
  it('has the worked examples and the dealer hands', () => {
    expect(corpus.filter((c) => c.name.startsWith('math-1.5-'))).toHaveLength(5)
    expect(corpus.length).toBeGreaterThan(200)
  })

  it.each(corpus.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(forcedBets(c.setup.stakes, c.setup.dealt_in_seats, c.setup.button_seat)).toEqual(
      c.forced,
    )

    let state = start(c)
    c.actions.forEach((action, i) => {
      const step = c.steps[i]
      if (step === undefined) throw new Error('a step per action')
      const { probes, ...expected } = step
      state = advance(state)
      const legal = legalActions(state)
      expect({
        street: state.street,
        to_act: toAct(state),
        bet: state.bet,
        full_raise: state.fullRaise,
        legal: legal && {
          check: legal.check,
          call: legal.call && { to: legal.call.to, all_in: legal.call.allIn },
          bet: legal.bet,
          raise: legal.raise,
        },
      }).toEqual(expected)

      for (const probe of probes) {
        const verdict = moveViolation(state, step.to_act, toMove(probe))
        expect(verdict?.code ?? null, JSON.stringify(probe)).toBe(probe.code)
      }

      const next = play(state, action)
      if (!next.ok) throw new Error(`action ${String(i)}: ${next.violation.code}`)
      state = next.value
    })

    if (!c.setup.ends_at_hero_fold) {
      state = advance(state)
      expect(toAct(state)).toBeNull()
    }
    const end = c.end
    expect({ street: state.street, reached: state.reached }).toEqual({
      street: end.street,
      reached: end.reached,
    })
    const seats = [...state.seats]
      .sort((a, b) => a.seat - b.seat)
      .map((s) => ({ seat: s.seat, ante: s.ante, live: s.live, folded: s.folded, all_in: s.allIn }))
    expect(seats).toEqual(end.seats)

    const hero = seatState(state, c.setup.hero_seat)
    if (hero === undefined) throw new Error('hero is dealt in')
    if (c.setup.ends_at_hero_fold) {
      // MATH.md §1.5: a folded seat never gets chips back, so hero's net is minus hero's total.
      expect(0 - (hero.ante + hero.live)).toBe(end.hero_net) // 0 - x, not -x: no -0
      expect(end.rake).toBeNull()
      return
    }

    const settlement = settle(state)
    expect(settlement.uncalled).toEqual(end.uncalled)
    expect(settlement.pots).toEqual(end.pots)
    const results = end.results ?? []
    const wonByHero = results.find((r) => r.seat === c.setup.hero_seat)?.won_chips ?? 0
    const heroLive = settlement.live.get(hero.seat) ?? 0
    expect(wonByHero - hero.ante - heroLive).toBe(end.hero_net)
    const inPots = settlement.pots.reduce((sum, p) => sum + p.chips, 0)
    expect(inPots - results.reduce((sum, r) => sum + r.won_chips, 0)).toBe(end.rake)
    for (const probe of end.result_probes ?? []) {
      const won = new Map(probe.won.map((w) => [w.seat, w.chips]))
      expect(firstInfeasiblePrefix(settlement.pots, won)).toBe(probe.first_infeasible_prefix)
    }
  })
})
