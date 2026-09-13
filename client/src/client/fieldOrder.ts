import type { GamePhase } from '@shared/types/GameState'
import { MAX_MOVE_DELTA } from '@shared/engine/Movement'

const FIRST_STRIKE_SALVO_LIMIT = 3
const FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT = 2
/** Two legal engine movement commands establish the positional practice target. */
export const PRACTICE_POSITION_DELTA = MAX_MOVE_DELTA * 2

export type FieldOrderId = 'first-strike' | 'fire-for-effect' | 'hold-the-field'
/** Local Quick Operation identifiers; never participate in verified rotation. */
export type PracticeFieldOrderId = FieldOrderId | 'set-the-position' | 'make-it-count'

export interface FieldOrderObservation {
  readonly humanSalvos: number
  /** Damage caused during each settled human salvo, in transcript order. */
  readonly settledHumanDamage: readonly number[]
  readonly phase: GamePhase
  readonly activeSeat: 'human' | 'cpu'
  /** Terminal winner fact expressed without a player identifier. */
  readonly winner: 'human' | 'cpu' | null
  /** Net horizontal displacement captured when the first accepted human fire began. */
  readonly openingPositionDelta?: number
}

type FirstStrikeProgress = { readonly salvosRemaining: number }
type FireForEffectProgress = {
  readonly damagedSalvos: number
  readonly requiredDamagedSalvos: typeof FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT
}
type HoldTheFieldProgress = { readonly awaitingWinner: true }
type SetThePositionProgress = { readonly firingPositionChanged: boolean }
type MakeItCountProgress = { readonly awaitingWinner: true }

export type FieldOrderProgress = FirstStrikeProgress | FireForEffectProgress | HoldTheFieldProgress | SetThePositionProgress | MakeItCountProgress

export type FieldOrderResult =
  | { readonly status: 'achieved'; readonly achievedOnSalvo: number }
  | { readonly status: 'achieved'; readonly damagedSalvos: typeof FIRE_FOR_EFFECT_DAMAGED_SALVO_LIMIT }
  | { readonly status: 'achieved' }
  | { readonly status: 'missed'; readonly damagedSalvos?: number }

/** Receipt-safe presentation state for one field order. */
export interface FieldOrder {
  readonly id: PracticeFieldOrderId
  readonly title: string
  readonly instruction: string
  readonly progress: FieldOrderProgress
  readonly result: FieldOrderResult | null
}

/** Complete public copy projection shared by every Field Order surface. */
export interface FieldOrderCopy {
  readonly brief: string
  readonly status: string
  readonly report: string
}

interface FieldOrderDefinition<Id extends PracticeFieldOrderId = PracticeFieldOrderId> {
  readonly id: Id
  readonly title: string
  readonly instruction: string
}

/** Account-count rotation. Its entries and order are an immutable verified contract. */
export const FIELD_ORDER_CATALOG: readonly FieldOrderDefinition<FieldOrderId>[] = Object.freeze([
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

/** Client-only content definitions resolved explicitly by Quick Operations. */
const PRACTICE_FIELD_ORDER_DEFINITIONS: readonly FieldOrderDefinition<Exclude<PracticeFieldOrderId, FieldOrderId>>[] = Object.freeze([
  Object.freeze({
    id: 'set-the-position' as const,
    title: 'Set the Position',
    instruction: 'Change firing position, then damage the CPU with your first salvo.',
  }),
  Object.freeze({
    id: 'make-it-count' as const,
    title: 'Make It Count',
    instruction: 'Win the best-of-three duel with Level 0 restocks only.',
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
      : definition.id === 'set-the-position'
        ? { firingPositionChanged: false }
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

/** Constructs a fresh order from the immutable verified rotation catalog only. */
export function createFieldOrderById(value: unknown): FieldOrder | null {
  const definition = FIELD_ORDER_CATALOG.find((candidate) => candidate.id === value)
  return definition ? freshFieldOrder(definition) : null
}

/** Constructs one fresh local-practice order without changing verified rotation. */
export function createPracticeFieldOrderById(value: unknown): FieldOrder | null {
  const definition = FIELD_ORDER_CATALOG.find((candidate) => candidate.id === value)
    ?? PRACTICE_FIELD_ORDER_DEFINITIONS.find((candidate) => candidate.id === value)
  return definition ? freshFieldOrder(definition) : null
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

function observeSetThePosition(order: FieldOrder, observation: FieldOrderObservation): FieldOrder {
  const firingPositionChanged = (observation.openingPositionDelta ?? 0) >= PRACTICE_POSITION_DELTA
  const firstDamage = observation.settledHumanDamage[0]
  if (firstDamage !== undefined) {
    return withState(order, { firingPositionChanged }, firstDamage > 0 && firingPositionChanged
      ? { status: 'achieved' }
      : { status: 'missed' })
  }
  if (observation.phase === 'GAME_OVER') return withState(order, { firingPositionChanged }, { status: 'missed' })
  return withState(order, { firingPositionChanged }, null)
}

function observeMakeItCount(order: FieldOrder, observation: FieldOrderObservation): FieldOrder {
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
    case 'set-the-position': return observeSetThePosition(order, observation)
    case 'make-it-count': return observeMakeItCount(order, observation)
  }
}

function activeStatus(order: FieldOrder): string {
  switch (order.id) {
    case 'first-strike': {
      const remaining = (order.progress as FirstStrikeProgress).salvosRemaining
      return `${remaining} salvo${remaining === 1 ? '' : 's'} remaining`
    }
    case 'fire-for-effect': {
      const progress = order.progress as FireForEffectProgress
      return `${progress.damagedSalvos} of ${progress.requiredDamagedSalvos} damaging salvos`
    }
    case 'hold-the-field':
      return 'Awaiting duel outcome'
    case 'set-the-position':
      return (order.progress as SetThePositionProgress).firingPositionChanged
        ? 'Opening shot resolving'
        : 'Change firing position before the opening shot'
    case 'make-it-count':
      return 'Awaiting best-of-three outcome'
  }
}

function terminalReport(order: FieldOrder): string {
  const achieved = order.result?.status === 'achieved'
  switch (order.id) {
    case 'first-strike':
      return achieved
        ? `First Strike achieved — CPU damaged on salvo ${(order.result as { achievedOnSalvo: number }).achievedOnSalvo}.`
        : 'First Strike not achieved — CPU was not damaged in the first 3 salvos.'
    case 'fire-for-effect': {
      const progress = order.progress as FireForEffectProgress
      return achieved
        ? 'Fire for Effect achieved — CPU damaged on 2 separate human salvos.'
        : `Fire for Effect not achieved — CPU was damaged on ${progress.damagedSalvos} of 2 required human salvos.`
    }
    case 'hold-the-field':
      return achieved
        ? 'Hold the Field achieved — duel won.'
        : 'Hold the Field not achieved — duel was not won.'
    case 'set-the-position':
      return achieved
        ? 'Set the Position achieved — opening shot landed after changing firing position.'
        : 'Set the Position not achieved — change firing position and land the opening shot.'
    case 'make-it-count':
      return achieved
        ? 'Make It Count achieved — Level 0 restock duel won.'
        : 'Make It Count not achieved — Level 0 restock duel was not won.'
  }
}

/** Renders only receipt-safe Field Order fields into shared briefing/status/report copy. */
export function renderFieldOrder(order: FieldOrder): FieldOrderCopy {
  const brief = `${order.title} · ${order.instruction}`
  const report = order.result === null ? '' : terminalReport(order)
  return Object.freeze({
    brief,
    status: order.result === null ? `${brief} · ${activeStatus(order)}` : report.slice(0, -1),
    report,
  })
}
