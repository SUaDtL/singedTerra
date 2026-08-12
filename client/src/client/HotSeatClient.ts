import type { GameClient } from './GameClient';
import type { GameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import { GameEngine } from '@shared/engine/GameEngine';
import { fastForwardTicks } from './fastForward';
import type { VerifiedDeploymentRecorder } from './verifiedDeployment';
import { VerifiedDuelController } from '@shared/net/verifiedDuel';

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
  private readonly initialTerrain: Uint8Array;
  private readonly listeners = new Set<(state: GameState) => void>();
  private readonly verifiedMode?: VerifiedDeploymentRecorder | VerifiedDuelController;
  private rafId: number | null = null;
  private fastForward = false;

  constructor(controller: VerifiedDuelController);
  constructor(engine: GameEngine, verifiedMode?: VerifiedDeploymentRecorder | VerifiedDuelController);
  constructor(
    engineOrController: GameEngine | VerifiedDuelController,
    verifiedMode?: VerifiedDeploymentRecorder | VerifiedDuelController,
  ) {
    if (engineOrController instanceof VerifiedDuelController) {
      if (verifiedMode !== undefined) throw new Error('verified_duel_engine_mismatch');
      this.engine = engineOrController.engine;
      this.verifiedMode = engineOrController;
    } else {
      if (verifiedMode instanceof VerifiedDuelController && verifiedMode.engine !== engineOrController) {
        throw new Error('verified_duel_engine_mismatch');
      }
      this.engine = verifiedMode instanceof VerifiedDuelController ? verifiedMode.engine : engineOrController;
      this.verifiedMode = verifiedMode;
    }
    this.initialTerrain = this.engine.getState().terrain.slice();
  }

  setFastForward(on: boolean): void {
    this.fastForward = on;
  }

  start(): void {
    if (this.rafId !== null) return; // already running
    const loop = (): void => {
      // Fast-forward (review #7): run several fixed-step ticks this frame while a shot
      // is live, breaking the moment it settles. Same tick count + outcome as 1/frame
      // (deterministic), just fewer frames drawn.
      const maxTicks = fastForwardTicks(this.fastForward, this.engine.getState().phase);
      for (let i = 0; i < maxTicks; i++) {
        if (this.verifiedMode instanceof VerifiedDuelController) this.verifiedMode.tick();
        else this.engine.tick();
        const phase = this.engine.getState().phase;
        if (phase !== 'FIRING' && phase !== 'RESOLVING') break; // settled — stop spinning
      }
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
    if (this.verifiedMode instanceof VerifiedDuelController) {
      this.verifiedMode.applyHumanAction(action);
      return;
    }
    const state = this.engine.getState();
    const active = state.tanks.find((tank) => tank.id === state.activePlayerId);
    const before = this.verifiedMode && active
      ? { ...state, tanks: state.tanks.map((tank) => tank === active ? { ...tank } : tank) }
      : state;
    const accepted = this.engine.applyAction(action);
    this.verifiedMode?.observe(action, before, accepted);
  }

  getState(): GameState | null {
    return this.engine.getState();
  }

  getInitialTerrain(): Uint8Array {
    return this.initialTerrain;
  }

  getEffectiveGravity(): number {
    return this.engine.getEffectiveGravity();
  }

  onStateChange(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(state: GameState): void {
    for (const listener of this.listeners) listener(state);
  }
}
