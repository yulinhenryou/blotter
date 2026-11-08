// No-limit hold'em betting rules and pots for the phone (docs/MATH.md §1.5, ADR-0028).
// The server checks every record again and is the authority; these rules let the capture screens
// offer only legal actions and catch mistakes offline, at the moment of entry.

export {
  advance,
  applyMove,
  behind,
  handOver,
  hasRaiseRights,
  isActive,
  legalActions,
  moveViolation,
  nextStreet,
  play,
  seatState,
  startHand,
  streetOver,
  toAct,
  type BettingState,
  type LegalActions,
  type SeatState,
  type SizeRange,
} from './betting.ts'
export { firstInfeasiblePrefix, settle, type Pot, type Settlement } from './pots.ts'
export { forcedBets, seatOrder } from './seats.ts'
export * from './types.ts'
