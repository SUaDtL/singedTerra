import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';

/**
 * GameClient abstracts the difference between hot-seat and networked play
 * behind a single interface. The renderer/input layers talk only to this,
 * never knowing whether physics runs locally (HotSeat) or on a server (Network).
 */
export interface GameClient {
  /** Start the client (begin local loop or open the socket connection). */
  start(): void;

  /** Tear down the client (stop the loop or close the socket). */
  stop(): void;

  /** Submit a player input. Validated/applied locally or sent to the server. */
  sendAction(action: PlayerAction): void;

  /** Latest known game state, or null before the first snapshot. */
  getState(): GameState | null;

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: GameState) => void): () => void;
}
