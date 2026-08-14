import type { GamePhase } from '@shared/types/GameState'

export const FIRST_STRIKE_SALVO_LIMIT = 3

export type FirstStrikeObjective =
  | { readonly status: 'active'; readonly salvosRemaining: number }
  | { readonly status: 'achieved'; readonly achievedOnSalvo: number }
  | { readonly status: 'missed' }

/** The public, deterministic state required to evaluate one active verified duel. */
export interface FirstStrikeObservation {
  readonly humanSalvos: number
  /** Damage caused during each settled human salvo, in transcript order. */
  readonly humanDamageBySalvo: readonly number[]
  readonly phase: GamePhase
  readonly activeSeat: 'human' | 'cpu'
}

export function createFirstStrikeObjective(): FirstStrikeObjective {
  return { status: 'active', salvosRemaining: FIRST_STRIKE_SALVO_LIMIT }
}

/**
 * Observes authoritative local replay state without mutating the controller or
 * transcript. A third fire remains live through its FIRING/RESOLVING state;
 * entry to the CPU turn (or GAME_OVER) proves an undamaged miss.
 */
export function observeFirstStrikeObjective(
  objective: FirstStrikeObjective,
  observation: FirstStrikeObservation,
): FirstStrikeObjective {
  if (objective.status !== 'active') return objective
  const achievedOnSalvo = observation.humanDamageBySalvo
    .slice(0, FIRST_STRIKE_SALVO_LIMIT)
    .findIndex((damage) => damage > 0) + 1
  if (achievedOnSalvo > 0) {
    return { status: 'achieved', achievedOnSalvo }
  }
  if (observation.phase === 'GAME_OVER'
    || (observation.humanSalvos >= FIRST_STRIKE_SALVO_LIMIT
      && observation.phase === 'PLAYER_TURN'
      && observation.activeSeat === 'cpu')) return { status: 'missed' }
  return {
    status: 'active',
    salvosRemaining: Math.max(0, FIRST_STRIKE_SALVO_LIMIT - observation.humanSalvos),
  }
}
