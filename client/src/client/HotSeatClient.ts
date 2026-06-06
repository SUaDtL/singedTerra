import type { GameClient } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import { GameEngine } from '@shared/engine/GameEngine';

/**
 * HotSeatClient runs the shared GameEngine directly in the browser.
 * All players share one tab; the engine owns turn order and ticks on rAF.
 */
export class HotSeatClient implements GameClient {
  private readonly engine: GameEngine;
  private readonly listeners = new Set<(state: GameState) => void>();
  private rafId: number | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  start(): void {
    throw new Error('HotSeatClient.start not implemented');
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  sendAction(_action: PlayerAction): void {
    throw new Error('HotSeatClient.sendAction not implemented');
  }

  getState(): GameState | null {
    throw new Error('HotSeatClient.getState not implemented');
  }

  onStateChange(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
