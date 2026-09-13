import type { GameOptions } from '@shared/types/GameOptions'
import type { PracticeFieldOrderId } from './fieldOrder'

export type QuickOperationId = 'standard' | 'first-salvo' | 'crosswind-range' | 'caldera-run' | 'last-light-siege' | 'lean-arsenal'

export const QUICK_OPERATION_CONTENT_VERSION = 1 as const
/** P04-only content version; P03's persisted presentation identity stays v1. */
export const P04_TACTICAL_CHALLENGE_CONTENT_VERSION = 2 as const

export interface P03PracticeObjectiveDescriptor {
  readonly contentVersion: typeof QUICK_OPERATION_CONTENT_VERSION
  readonly fieldOrderId: 'hold-the-field'
}

export interface P04PracticeObjectiveDescriptor {
  readonly contentVersion: typeof P04_TACTICAL_CHALLENGE_CONTENT_VERSION
  readonly fieldOrderId: Extract<PracticeFieldOrderId, 'first-strike' | 'set-the-position' | 'make-it-count'>
  /** Every P04 objective is declared only for this finite, solver-proven seed. */
  readonly seed: 42
}

export type PracticeObjectiveDescriptor = P03PracticeObjectiveDescriptor | P04PracticeObjectiveDescriptor

export interface QuickOperation {
  readonly id: QuickOperationId
  readonly title: string
  readonly briefing: string
  readonly settings: Readonly<Pick<GameOptions,
    'walls' | 'battlefieldWorld' | 'hazards' | 'rounds' | 'suddenDeathTurn' | 'armsLevel' | 'seed'>>
  readonly practiceObjective?: PracticeObjectiveDescriptor
}

function operation(
  id: QuickOperationId,
  title: string,
  briefing: string,
  settings: QuickOperation['settings'],
  practiceObjective?: PracticeObjectiveDescriptor,
): QuickOperation {
  return Object.freeze({
    id,
    title,
    briefing,
    settings: Object.freeze({ ...settings }),
    ...(practiceObjective ? { practiceObjective: Object.freeze({ ...practiceObjective }) } : {}),
  })
}

export const QUICK_OPERATIONS: readonly QuickOperation[] = Object.freeze([
  operation('standard', 'Standard Duel', 'A balanced three-round duel.', {}),
  operation('first-salvo', 'First Salvo', 'A one-round duel that starts with the essentials.', {
    rounds: 1,
  }),
  operation('crosswind-range', 'Crosswind Range', 'Wraparound walls turn shifting wind into a ranging test.', {
    walls: 'wrap', battlefieldWorld: 'glassstorm-expanse', seed: 42,
  }, { contentVersion: P04_TACTICAL_CHALLENGE_CONTENT_VERSION, fieldOrderId: 'first-strike', seed: 42 }),
  operation('caldera-run', 'Caldera Run', 'Lava terrain turns every crater into a positional risk.', {
    hazards: 'lava', battlefieldWorld: 'obsidian-caldera', seed: 42,
  }, { contentVersion: P04_TACTICAL_CHALLENGE_CONTENT_VERSION, fieldOrderId: 'set-the-position', seed: 42 }),
  operation('last-light-siege', 'Last Light Siege', 'A best-of-three duel that tightens into sudden death.', {
    rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk',
  }, { contentVersion: QUICK_OPERATION_CONTENT_VERSION, fieldOrderId: 'hold-the-field' }),
  operation('lean-arsenal', 'Lean Arsenal', 'Level 0 restocks only. Preserve your opening kit.', {
    armsLevel: 0, seed: 42,
  }, { contentVersion: P04_TACTICAL_CHALLENGE_CONTENT_VERSION, fieldOrderId: 'make-it-count', seed: 42 }),
])

export function quickOperationById(value: unknown): QuickOperation {
  return QUICK_OPERATIONS.find((candidate) => candidate.id === value) ?? QUICK_OPERATIONS[0]!
}

/**
 * Apply the selected operation's immutable projection without mutating the
 * caller-owned launch configuration. Every Quick Duel engine receives options
 * from this one composition seam rather than reimplementing profile merges.
 */
export function quickOperationOptions(value: unknown, base: GameOptions): GameOptions {
  return { ...base, ...quickOperationById(value).settings }
}
