import type { PlayerAction } from '@shared/types/PlayerAction';
import type { GamePhase } from '@shared/types/GameState';

/** The versioned browser preference key for the local-only First Salvo coach. */
export const FIRST_SALVO_PREFERENCE_KEY = 'singedterra:first-salvo:v1';

const PREFERENCE_VERSION = 'v1';

export type FirstSalvoPreference = 'completed' | 'skipped';
export type FirstSalvoStep = 'aim' | 'power-and-wind' | 'fire';

/**
 * The minimal information the local UI needs to decide whether this browser may
 * show or advance the coach. It intentionally contains no engine state.
 */
export interface FirstSalvoEligibility {
  phase: GamePhase;
  activeIsAi: boolean;
  activeIsLocal: boolean;
  activeTankAlive: boolean;
}

/** A small localStorage-compatible boundary, so tests and unavailable storage stay harmless. */
export interface FirstSalvoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type FirstSalvoCoach =
  | { status: 'active'; step: FirstSalvoStep }
  | { status: 'completed' }
  | { status: 'skipped' };

/** True only for the living human seat this browser controls during its aiming turn. */
export function isFirstSalvoEligible(eligibility: FirstSalvoEligibility): boolean {
  return eligibility.phase === 'PLAYER_TURN'
    && !eligibility.activeIsAi
    && eligibility.activeIsLocal
    && eligibility.activeTankAlive;
}

/** Starts a session at Aim unless this browser has already dismissed the coach. */
export function createFirstSalvoCoach(preference: FirstSalvoPreference | null): FirstSalvoCoach {
  if (preference === 'completed') return { status: 'completed' };
  if (preference === 'skipped') return { status: 'skipped' };
  return { status: 'active', step: 'aim' };
}

/** Returns the visible target for this frame; an ineligible frame never reveals the coach. */
export function firstSalvoStepFor(
  coach: FirstSalvoCoach,
  eligibility: FirstSalvoEligibility,
): FirstSalvoStep | null {
  if (coach.status !== 'active' || !isFirstSalvoEligible(eligibility)) return null;
  return coach.step;
}

/** Returns the terminal preference a caller should persist, if this session has one. */
export function firstSalvoPreferenceFor(coach: FirstSalvoCoach): FirstSalvoPreference | null {
  if (coach.status === 'completed') return 'completed';
  if (coach.status === 'skipped') return 'skipped';
  return null;
}

/**
 * Observes the action the UI is already about to send. Only local, eligible
 * actions advance the coach; the action itself is neither changed nor sent here.
 */
export function applyFirstSalvoAction(
  coach: FirstSalvoCoach,
  eligibility: FirstSalvoEligibility,
  action: PlayerAction,
): FirstSalvoCoach {
  if (coach.status !== 'active' || !isFirstSalvoEligible(eligibility)) return coach;

  if (action.type === 'fire' || action.type === 'use_shield') return { status: 'completed' };
  if (coach.step === 'aim' && action.type === 'set_angle') {
    return { status: 'active', step: 'power-and-wind' };
  }
  if (coach.step === 'power-and-wind' && action.type === 'set_power') {
    return { status: 'active', step: 'fire' };
  }
  return coach;
}

/** Hides this session immediately; callers may persist the resulting status best-effort. */
export function skipFirstSalvoCoach(_coach: FirstSalvoCoach): FirstSalvoCoach {
  return { status: 'skipped' };
}

/** Resets local session progression only. Persisted skip/completion remains untouched. */
export function replayFirstSalvoCoach(_coach: FirstSalvoCoach): FirstSalvoCoach {
  return { status: 'active', step: 'aim' };
}

/** Reads a recognized versioned preference and treats malformed or unavailable storage as absent. */
export function loadFirstSalvoPreference(storage: FirstSalvoStorage): FirstSalvoPreference | null {
  try {
    const value = storage.getItem(FIRST_SALVO_PREFERENCE_KEY);
    if (value === `${PREFERENCE_VERSION}:completed`) return 'completed';
    if (value === `${PREFERENCE_VERSION}:skipped`) return 'skipped';
  } catch {
    // Private-mode and disabled storage must not disrupt a match.
  }
  return null;
}

/** Best-effort local persistence; failure leaves the current match untouched. */
export function persistFirstSalvoPreference(
  storage: FirstSalvoStorage,
  preference: FirstSalvoPreference,
): void {
  try {
    storage.setItem(FIRST_SALVO_PREFERENCE_KEY, `${PREFERENCE_VERSION}:${preference}`);
  } catch {
    // Private-mode and disabled storage must not disrupt a match.
  }
}
