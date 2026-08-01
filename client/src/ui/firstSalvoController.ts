import type { PlayerAction } from '@shared/types/PlayerAction';
import type { TankState } from '@shared/types/GameState';
import {
  applyFirstSalvoAction,
  createFirstSalvoCoach,
  firstSalvoPreferenceFor,
  firstSalvoStepFor,
  loadFirstSalvoPreference,
  persistFirstSalvoPreference,
  replayFirstSalvoCoach,
  skipFirstSalvoCoach,
  type FirstSalvoCoach,
  type FirstSalvoEligibility,
  type FirstSalvoPreference,
  type FirstSalvoStep,
  type FirstSalvoStorage,
} from './firstSalvoCoach';

export interface FirstSalvoControllerOptions {
  storage: FirstSalvoStorage;
  force?: boolean;
}

/** A local-only integration boundary: it observes actions but never sends or mutates them. */
export class FirstSalvoController {
  private coach: FirstSalvoCoach;
  private retainedPreference: FirstSalvoPreference | null;

  constructor(private readonly options: FirstSalvoControllerOptions) {
    this.retainedPreference = options.force ? null : loadFirstSalvoPreference(options.storage);
    this.coach = createFirstSalvoCoach(options.force ? null : this.retainedPreference);
  }

  /** Returns the original action after applying local-only progress and best-effort persistence. */
  observe(
    action: PlayerAction,
    eligibility: FirstSalvoEligibility,
    canCommitTerminalAction = true,
  ): PlayerAction {
    if (
      !canCommitTerminalAction
      && (action.type === 'fire' || action.type === 'use_shield')
    ) return action;
    const before = this.coach;
    this.coach = applyFirstSalvoAction(this.coach, eligibility, action);
    if (this.coach !== before) this.persistTerminalPreference();
    return action;
  }

  stepFor(eligibility: FirstSalvoEligibility): FirstSalvoStep | null {
    return firstSalvoStepFor(this.coach, eligibility);
  }

  skip(): void {
    this.coach = skipFirstSalvoCoach(this.coach);
    this.persistTerminalPreference();
  }

  /** Replays in memory only; the durable preference and live match remain untouched. */
  replay(): void {
    this.coach = replayFirstSalvoCoach(this.coach);
  }

  /** A replacement match in the same tab reuses the saved preference unless E2E explicitly forces it. */
  startNewGame(): void {
    this.coach = this.createSession();
  }

  private createSession(): FirstSalvoCoach {
    if (this.options.force) return createFirstSalvoCoach(null);
    const stored = loadFirstSalvoPreference(this.options.storage);
    if (stored) this.retainedPreference = stored;
    return createFirstSalvoCoach(this.retainedPreference);
  }

  private persistTerminalPreference(): void {
    const preference = firstSalvoPreferenceFor(this.coach);
    if (preference) {
      this.retainedPreference = preference;
      persistFirstSalvoPreference(this.options.storage, preference);
    }
  }
}

/** Mirror the engine's finite-ammo gate without applying or predicting game state. */
export function canCommitFirstSalvoAction(
  tank: Pick<TankState, 'selectedWeapon' | 'inventory'>,
  action: PlayerAction,
): boolean {
  if (action.type !== 'fire' && action.type !== 'use_shield') return true;
  const weapon = action.type === 'use_shield' ? 'shield' : tank.selectedWeapon;
  const ammo = tank.inventory[weapon];
  return ammo.unlimited || ammo.count > 0;
}

/**
 * The sole local-input seam: observe the original action, then forward that same
 * object once. It deliberately knows nothing about GameClient or the network.
 */
export function observeAndForwardFirstSalvoAction(
  controller: FirstSalvoController,
  action: PlayerAction,
  eligibility: FirstSalvoEligibility | null,
  canCommitTerminalAction: boolean,
  forward: (action: PlayerAction) => void,
): void {
  if (eligibility) controller.observe(action, eligibility, canCommitTerminalAction);
  forward(action);
}

/** Deliberately narrow, opt-in browser hook for deterministic tutorial coverage. */
export function isFirstSalvoForced(search: string): boolean {
  return new URLSearchParams(search).get('tutorial') === 'first-salvo';
}
