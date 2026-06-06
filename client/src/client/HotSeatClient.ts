import type { GameClient } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import { GameEngine } from '@shared/engine/GameEngine';

/**
 * HotSeatClient runs the shared GameEngine directly in the browser. All players
 * share one tab; the engine owns turn order and ticks on requestAnimationFrame.
 *
 * DETERMINISM: the simulation is fixed-step. We call engine.tick() once per rAF
 * frame (it self-no-ops unless FIRING). We never scale physics by real elapsed
 * time — no wall-clock dt is fed into the shared physics math.
 */
export class HotSeatClient implements GameClient {
  private readonly engine: GameEngine;
  private readonly listeners = new Set<(state: GameState) => void>();
  private rafId: number | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  start(): void {
    if (this.rafId !== null) return; // already running
    const loop = (): void => {
      this.engine.tick();
      this.emit(this.engine.getState());
      this.rafId = requestAnimationFrame(loop);
    };
    // Emit an initial frame immediately so the first render happens before the
    // first tick, then begin the rAF loop.
    this.emit(this.engine.getState());
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  sendAction(action: PlayerAction): void {
    this.engine.applyAction(action);
  }

  getState(): GameState | null {
    return this.engine.getState();
  }

  onStateChange(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(state: GameState): void {
    for (const listener of this.listeners) listener(state);
  }
}
