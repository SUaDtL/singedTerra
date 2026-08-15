import type { GamePhase } from '@shared/types/GameState'

const FIRST_STRIKE_SALVO_LIMIT = 3
const FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT = 2

export type FieldOrderId = 'first-strike' | 'fire-for-effect' | 'hold-the-field'

export interface FieldOrderObservation {
  readonly humanSalvos: number
  /** Damage caused during each settled human salvo, in transcript order. */
  readonly settledHumanDamage: readonly number[]
  readonly phase: GamePhase
  readonly activeSeat: 'human' | 'cpu'
  /** Terminal winner fact expressed without a player identifier. */
  readonly winner: 'human' | 'cpu' | null
}

type FirstStrikeProgress = { readonly salvosRemaining: number }
type FireForEffectProgress = {
  readonly damagedSalvos: number
  readonly requiredDamagedSalvos: typeof FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT
}
type HoldTheFieldProgress = { readonly awaitingWinner: true }

export type FieldOrderProgress = FirstStrikeProgress | FireForEffectProgress | HoldTheFieldProgress

export type FieldOrderResult =
  | { readonly status: 'achieved'; readonly achievedOnSalvo: number }
  | { readonly status: 'achieved'; readonly damagedSalvos: typeof FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT }
  | { readonly status: 'achieved' }
  | { readonly status: 'missed'; readonly damagedSalvos?: number }

/** Receipt-safe presentation state for one field order. */
export interface FieldOrder {
  readonly id: FieldOrderId
  readonly title: string
  readonly instruction: string
  readonly progress: FieldOrderProgress
  readonly result: FieldOrderResult | null
}

interface FieldOrderDefinition {
  readonly id: FieldOrderId
  readonly title: string
  readonly instruction: string
}

export const FIELD_ORDER_CATALOG: readonly FieldOrderDefinition[] = Object.freeze([
  Object.freeze({
    id: 'first-strike' as const,
    title: 'First Strike',
    instruction: 'Damage the CPU within your first three salvos.',
  }),
  Object.freeze({
    id: 'fire-for-effect' as const,
    title: 'Fire for Effect',
    instruction: 'Damage the CPU on two separate human salvos.',
  }),
  Object.freeze({
    id: 'hold-the-field' as const,
    title: 'Hold the Field',
    instruction: 'Win the duel.',
  }),
])

function validMatchesPlayed(summary: unknown): number | null {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null
  const matchesPlayed = (summary as { matchesPlayed?: unknown }).matchesPlayed
  return typeof matchesPlayed === 'number'
    && Number.isSafeInteger(matchesPlayed)
    && matchesPlayed >= 0
    ? matchesPlayed
    : null
}

function freshFieldOrder(definition: FieldOrderDefinition): FieldOrder {
  const progress: FieldOrderProgress = definition.id === 'first-strike'
    ? { salvosRemaining: FIRST_STRIKE_SALVO_LIMIT }
    : definition.id === 'fire-for-effect'
      ? { damagedSalvos: 0, requiredDamagedSalvos: FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT }
      : { awaitingWinner: true }
  return Object.freeze({ ...definition, progress: Object.freeze(progress), result: null })
}

function withState(order: FieldOrder, progress: FieldOrderProgress, result: FieldOrderResult | null): FieldOrder {
  return Object.freeze({
    id: order.id,
    title: order.title,
    instruction: order.instruction,
    progress: Object.freeze(progress),
    result: result === null ? null : Object.freeze(result),
  })
}

/** Selects the deterministic public order from a validated account-summary count. */
export function createFieldOrder(summary: unknown): FieldOrder | null {
  const matchesPlayed = validMatchesPlayed(summary)
  if (matchesPlayed === null) return null
  return freshFieldOrder(FIELD_ORDER_CATALOG[matchesPlayed % FIELD_ORDER_CATALOG.length]!)
}

function observeFirstStrike(order: FieldOrder, observation: FieldOrderObservation): FieldOrder {
  const achievedOnSalvo = observation.settledHumanDamage
    .slice(0, FIRST_STRIKE_SALVO_LIMIT)
    .findIndex((damage) => damage > 0) + 1
  if (achievedOnSalvo > 0) {
    return withState(order, order.progress, { status: 'achieved', achievedOnSalvo })
  }
  if (observation.phase === 'GAME_OVER'
    || (observation.humanSalvos >= FIRST_STRIKE_SALVO_LIMIT
      && observation.phase === 'PLAYER_TURN'
      && observation.activeSeat === 'cpu')) return withState(order, order.progress, { status: 'missed' })
  return withState(order, {
    salvosRemaining: Math.max(0, FIRST_STRIKE_SALVO_LIMIT - observation.humanSalvos),
  }, null)
}

function observeFireForEffect(order: FieldOrder, observation: FieldOrderObservation): FieldOrder {
  const damagedSalvos = observation.settledHumanDamage.filter((damage) => damage > 0).length
  if (damagedSalvos >= FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT) {
    return withState(order, { damagedSalvos, requiredDamagedSalvos: FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT }, {
      status: 'achieved',
      damagedSalvos: FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT,
    })
  }
  if (observation.phase === 'GAME_OVER') {
    return withState(order, { damagedSalvos, requiredDamagedSalvos: FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT }, {
      status: 'missed',
      damagedSalvos,
    })
  }
  return withState(order, { damagedSalvos, requiredDamagedSalvos: FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT }, null)
}

function observeHoldTheField(order: FieldOrder, observation: FieldOrderObservation): FieldOrder {
  if (observation.phase !== 'GAME_OVER') return withState(order, { awaitingWinner: true }, null)
  return withState(order, { awaitingWinner: true }, observation.winner === 'human'
    ? { status: 'achieved' }
    : { status: 'missed' })
}

/** Reduces replay-derived facts into public field-order presentation without side effects. */
export function observeFieldOrder(order: FieldOrder, observation: FieldOrderObservation): FieldOrder {
  if (order.result !== null) return order
  switch (order.id) {
    case 'first-strike': return observeFirstStrike(order, observation)
    case 'fire-for-effect': return observeFireForEffect(order, observation)
    case 'hold-the-field': return observeHoldTheField(order, observation)
  }
}
