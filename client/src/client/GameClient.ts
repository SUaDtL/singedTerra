import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';

/**
 * Everything needed to start the SUCCESSOR game after a rematch: the new room's
 * id/code/seed/options plus the (order-preserved) roster. Emitted by the network
 * client to both players so they migrate to the fresh room together.
 */
export interface RematchInfo {
  roomId: string;
  code: string;
  seed: number;
  options: { maxPlayers: number; maxWind: number; gravity: number };
  players: Array<{ id: string; name: string; color: string }>;
}

/**
 * Liveness of the networked client's Realtime link. 'connecting' before the first
 * subscribe, 'connected' while the channel is live, 'reconnecting' after the socket
 * drops (Supabase auto-retries; on recovery the client re-fetches any missed
 * actions). Hot-seat has no link and never reports this.
 */
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

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

  /** True when a fire action has been submitted but not yet echoed back (network only). */
  readonly isFiring?: boolean;

  /**
   * Request a rematch (network only). Triggers the server to allocate a fresh
   * successor room; migration is driven uniformly through onRematch for BOTH
   * players, so callers don't act on the resolved value beyond surfacing errors.
   */
  requestRematch?(): Promise<{ ok: boolean; error?: string }>;

  /**
   * Subscribe to rematch readiness (network only). Fires once when a successor
   * room has been allocated (by either player), with everything needed to start
   * it. Returns an unsubscribe function.
   */
  onRematch?(listener: (info: RematchInfo) => void): () => void;

  /**
   * Subscribe to Realtime connection-state changes (network only). Called
   * immediately with the current state, then on every transition. Returns an
   * unsubscribe function. Lets the UI surface a "reconnecting…" overlay instead of
   * silently freezing on a dropped socket.
   */
  onConnectionChange?(listener: (state: ConnectionState) => void): () => void;

  /**
   * Subscribe to fire/shield submission failures (network only): a rejected submit
   * or a fire that never echoes back within the timeout. Lets the UI clear the
   * stuck "Sending…" lock and tell the player to try again. Returns an unsubscribe.
   */
  onFireFailed?(listener: (message: string) => void): () => void;
}
