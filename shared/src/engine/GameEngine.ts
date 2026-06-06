import type { GameState } from '../types/GameState';
import type { PlayerAction } from '../types/PlayerAction';
import type { GameOptions } from '../types/Events';

/**
 * Master game state machine (SPEC §4.3). Owns the authoritative `GameState` and
 * drives the turn loop: LOBBY → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN →
 * GAME_OVER. Runs identically in the browser (hot-seat) and on the server
 * (networked) — physics is fixed-timestep and deterministic.
 */
export class GameEngine {
  private state: GameState;

  constructor(options?: GameOptions) {
    void options;
    throw new Error('not implemented');
  }

  /** Current immutable-ish snapshot of game state for rendering / broadcast. */
  getState(): GameState {
    return this.state;
  }

  /**
   * Apply a player input. Honored only during PLAYER_TURN; firing transitions
   * the machine into FIRING.
   */
  applyAction(action: PlayerAction): void {
    void action;
    throw new Error('not implemented');
  }

  /**
   * Advance the simulation one fixed timestep. During FIRING this steps the
   * projectile; on impact it moves to RESOLVING, then NEXT_TURN/GAME_OVER.
   */
  tick(): void {
    throw new Error('not implemented');
  }
}
