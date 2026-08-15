import type { GameOptions } from '@shared/types/GameOptions'

export type QuickOperationId = 'standard' | 'crosswind-range' | 'caldera-run' | 'last-light-siege'

export interface QuickOperation {
  readonly id: QuickOperationId
  readonly title: string
  readonly briefing: string
  readonly settings: Readonly<Pick<GameOptions,
    'walls' | 'battlefieldWorld' | 'hazards' | 'rounds' | 'suddenDeathTurn'>>
}

function operation(
  id: QuickOperationId,
  title: string,
  briefing: string,
  settings: QuickOperation['settings'],
): QuickOperation {
  return Object.freeze({ id, title, briefing, settings: Object.freeze({ ...settings }) })
}

export const QUICK_OPERATIONS: readonly QuickOperation[] = Object.freeze([
  operation('standard', 'Standard Duel', 'A balanced three-round duel.', {}),
  operation('crosswind-range', 'Crosswind Range', 'Wraparound walls turn shifting wind into a ranging test.', {
    walls: 'wrap', battlefieldWorld: 'glassstorm-expanse',
  }),
  operation('caldera-run', 'Caldera Run', 'Lava terrain turns every crater into a positional risk.', {
    hazards: 'lava', battlefieldWorld: 'obsidian-caldera',
  }),
  operation('last-light-siege', 'Last Light Siege', 'A best-of-three duel that tightens into sudden death.', {
    rounds: 3, suddenDeathTurn: 12, battlefieldWorld: 'ember-dusk',
  }),
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
