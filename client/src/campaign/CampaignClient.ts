import { createCampaignGameEngine } from '@shared/campaign/initialization';
import { computeCampaignTactic } from '@shared/campaign/tactics';
import type { GameEngine } from '@shared/engine/GameEngine';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import type { BorrowedGameState } from '@shared/types/GameState';
import type { PlayerAction } from '@shared/types/PlayerAction';
import type { GameClient, GameInputCapabilities } from '../client/GameClient';
import {
  FULL_GAME_INPUT_CAPABILITIES,
  inputAllowsWeapon,
} from '../client/inputCapabilities';
import type { CampaignDescriptor } from '../client/modeConfig';
import { fastForwardTicks } from '../client/fastForward';
import { FrameClock } from '../client/frameClock';
import {
  createCampaignResultReceipt,
  type CampaignResultReceipt,
  type CampaignRunState,
} from './runReducer';
import {
  createCampaignReplayPayload,
  type CampaignReplayPayload,
} from './replay';

export interface CampaignClientRestore {
  readonly engine: GameEngine;
  readonly acceptedCommands: readonly PlayerAction[];
}

const CPU_AIM_DELAY_MS = 600;
const CPU_FIRE_DELAY_MS = 1_150;

function committedReplayEntry(action: PlayerAction): PlayerAction {
  return Object.freeze({ ...action });
}

function hasFiniteCampaignNumbers(action: PlayerAction): boolean {
  if (action.type === 'set_angle') return Number.isFinite(action.angle);
  if (action.type === 'set_power') return Number.isFinite(action.power);
  if (action.type === 'move') return Number.isFinite(action.delta);
  return true;
}

function hasUsableAmmo(state: BorrowedGameState, actorId: string, weapon: WeaponType): boolean {
  const ammo = state.tanks.find(({ id }) => id === actorId)?.inventory[weapon];
  return ammo !== undefined && (ammo.unlimited || ammo.count > 0);
}

/** Local campaign authority: one engine, committed replay journal, CPU scheduler, and frame loop. */
export class CampaignClient implements GameClient {
  readonly ownsCpuExecution = true as const;
  readonly inputCapabilities: GameInputCapabilities;

  private readonly engine;
  private readonly initialTerrain: Uint8Array;
  private readonly listeners = new Set<(state: BorrowedGameState) => void>();
  private readonly frameClock = new FrameClock();
  private readonly committedReplayCommands: PlayerAction[] = [];
  private readonly cpuTimers = new Set<ReturnType<typeof setTimeout>>();
  private rafId: number | null = null;
  private running = false;
  private frameGeneration = 0;
  private fastForward = false;
  private interfacePaused = false;
  private pageSuspended = false;
  private cpuTurnKey: string | null = null;
  private cpuGeneration = 0;

  constructor(descriptor: CampaignDescriptor, restored?: CampaignClientRestore) {
    this.inputCapabilities = Object.freeze({
      ...FULL_GAME_INPUT_CAPABILITIES,
      weaponRoster: Object.freeze([...descriptor.combatProfile.choices]),
      buying: false,
    });
    this.engine = restored?.engine ?? createCampaignGameEngine(descriptor);
    if (restored) {
      this.committedReplayCommands.push(...restored.acceptedCommands.map(committedReplayEntry));
    }
    this.initialTerrain = this.engine.getState().terrain.slice();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.frameGeneration;
    this.frameClock.reset(performance.now());
    const isCurrent = (): boolean => this.running && this.frameGeneration === generation;
    const schedule = (loop: FrameRequestCallback): void => {
      if (isCurrent()) this.rafId = requestAnimationFrame(loop);
    };
    const loop: FrameRequestCallback = (timestamp): void => {
      if (!isCurrent()) return;
      this.rafId = null;
      const logicalBeats = this.frameClock.advance(timestamp);
      for (let beat = 0; beat < logicalBeats; beat += 1) {
        if (!isCurrent()) return;
        if (this.isPaused()) continue;
        const maxTicks = fastForwardTicks(this.fastForward, this.engine.getState().phase);
        for (let tick = 0; tick < maxTicks; tick += 1) {
          this.engine.tick();
          const phase = this.engine.getState().phase;
          if (phase !== 'FIRING' && phase !== 'RESOLVING') break;
        }
        if (!isCurrent()) return;
        this.emit(this.engine.getState());
        this.scheduleCpuTurn();
      }
      schedule(loop);
    };
    this.emit(this.engine.getState());
    this.scheduleCpuTurn();
    schedule(loop);
  }

  stop(): void {
    if (!this.running && this.rafId === null && this.cpuTimers.size === 0) return;
    this.running = false;
    this.frameGeneration += 1;
    this.clearCpuTimers();
    this.cpuTurnKey = null;
    this.cpuGeneration += 1;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setFastForward(on: boolean): void {
    this.fastForward = on;
  }

  setPaused(paused: boolean): void {
    if (this.interfacePaused === paused) return;
    this.interfacePaused = paused;
    if (paused) {
      this.clearCpuTimers();
      this.cpuTurnKey = null;
      this.cpuGeneration += 1;
    } else {
      this.scheduleCpuTurn();
    }
  }

  suspendForPageCache(): void {
    if (this.pageSuspended) return;
    this.pageSuspended = true;
    this.clearCpuTimers();
    this.cpuTurnKey = null;
    this.cpuGeneration += 1;
  }

  async recoverAfterPageRestore(): Promise<boolean> {
    this.pageSuspended = false;
    this.scheduleCpuTurn();
    return true;
  }

  sendAction(action: PlayerAction): void {
    if (!hasFiniteCampaignNumbers(action)) return;
    if (action.type === 'select_weapon') {
      if (!inputAllowsWeapon(this.inputCapabilities, action.weapon)) return;
      const state = this.engine.getState();
      const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId);
      const ammunition = tank?.inventory[action.weapon];
      if (!ammunition || (!ammunition.unlimited && ammunition.count <= 0)) return;
    }
    const stateBefore = this.engine.getState();
    const activeBefore = stateBefore.tanks.find(
      (candidate) => candidate.id === stateBefore.activePlayerId,
    );
    const commitmentState = action.type === 'fire' || action.type === 'use_shield'
      ? activeBefore && {
          weapon: activeBefore.selectedWeapon,
          angle: activeBefore.angle,
          power: activeBefore.power,
          shieldWeapon: action.type === 'use_shield'
            ? action.weapon ?? (activeBefore.selectedWeapon === 'heavy_shield'
              ? 'heavy_shield'
              : 'shield')
            : null,
        }
      : null;
    if (!this.engine.applyAction(action)) return;
    if (action.type === 'set_angle' || action.type === 'set_power' || action.type === 'select_weapon') {
      return;
    }
    if ((action.type === 'fire' || action.type === 'use_shield') && commitmentState) {
      this.committedReplayCommands.push(
        committedReplayEntry({ type: 'select_weapon', weapon: commitmentState.weapon }),
        committedReplayEntry({ type: 'set_angle', angle: commitmentState.angle }),
        committedReplayEntry({ type: 'set_power', power: commitmentState.power }),
        committedReplayEntry(action.type === 'fire'
          ? { type: 'fire' }
          : { type: 'use_shield', weapon: commitmentState.shieldWeapon! }),
      );
      return;
    }
    this.committedReplayCommands.push(committedReplayEntry(action));
  }

  getCommittedReplayJournal(): readonly PlayerAction[] {
    return Object.freeze(this.committedReplayCommands.map(committedReplayEntry));
  }

  async createReplayPayload(runState: CampaignRunState): Promise<CampaignReplayPayload> {
    // Snapshot synchronously. Strict parsing then performs the bounded replay;
    // later accepted input cannot change this durable command sequence.
    const acceptedCommands = this.getCommittedReplayJournal();
    return createCampaignReplayPayload({
      runState,
      acceptedCommands,
    });
  }

  /** Bind one settled terminal result to this client's concrete engine and committed replay. */
  createResultReceipt(runState: CampaignRunState): CampaignResultReceipt {
    return createCampaignResultReceipt({
      runState,
      engine: this.engine,
      replayCommands: this.committedReplayCommands,
    });
  }

  getState(): BorrowedGameState {
    return this.engine.getState();
  }

  getInitialTerrain(): Uint8Array {
    return this.initialTerrain;
  }

  getEffectiveGravity(): number {
    return this.engine.getEffectiveGravity();
  }

  onStateChange(listener: (state: BorrowedGameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private isPaused(): boolean {
    return this.interfacePaused || this.pageSuspended;
  }

  private emit(state: BorrowedGameState): void {
    for (const listener of this.listeners) listener(state);
  }

  private currentCpuTurnKey(state: BorrowedGameState): string | null {
    if (state.phase !== 'PLAYER_TURN') return null;
    const active = state.tanks.find((tank) => tank.id === state.activePlayerId);
    return active?.ai ? `${state.round}:${state.turn}:${active.id}` : null;
  }

  private scheduleCpuTurn(): void {
    if (!this.running || this.isPaused()) return;
    const state = this.engine.getState();
    const key = this.currentCpuTurnKey(state);
    if (key === null) {
      this.cpuTurnKey = null;
      return;
    }
    if (key === this.cpuTurnKey) return;
    const active = state.tanks.find((tank) => tank.id === state.activePlayerId);
    if (!active?.ai) return;
    this.cpuTurnKey = key;
    const generation = ++this.cpuGeneration;
    const search = computeCampaignTactic({
      engine: this.engine,
      actorId: active.id,
      difficulty: active.ai,
      generation,
      isGenerationCurrent: (candidate) => this.running && !this.isPaused()
        && candidate === this.cpuGeneration && this.currentCpuTurnKey(this.engine.getState()) === key,
    });
    const fallbackWeapon = [
      active.selectedWeapon,
      'baby_missile' as const,
      ...(Object.keys(active.inventory) as WeaponType[]),
    ].find((weapon) => inputAllowsWeapon(this.inputCapabilities, weapon)
      && hasUsableAmmo(state, active.id, weapon));
    const plan = search.status === 'planned'
      ? search.plan
      : search.status === 'no-complete-candidate' && fallbackWeapon
        ? Object.freeze({
            weapon: fallbackWeapon,
            angle: Number.isFinite(active.angle) ? Math.min(180, Math.max(0, active.angle)) : 45,
            power: Number.isFinite(active.power) ? Math.min(100, Math.max(1, active.power)) : 50,
          })
        : null;
    if (!plan) {
      return;
    }

    let attackWeapon: WeaponType | null = null;
    this.scheduleCpuTimer(() => {
      if (!this.isCurrentCpuTurn(key)) return;
      const current = this.engine.getState();
      const tank = current.tanks.find((candidate) => candidate.id === current.activePlayerId);
      const plannedAmmo = tank?.inventory[plan.weapon];
      const babyAmmo = tank?.inventory.baby_missile;
      attackWeapon = plannedAmmo && (plannedAmmo.unlimited || plannedAmmo.count > 0)
        ? plan.weapon
        : babyAmmo && (babyAmmo.unlimited || babyAmmo.count > 0)
          ? 'baby_missile'
          : null;
      if (!attackWeapon) return;
      this.sendAction({ type: 'select_weapon', weapon: attackWeapon });
      this.sendAction({ type: 'set_angle', angle: plan.angle });
      this.sendAction({ type: 'set_power', power: plan.power });
    }, CPU_AIM_DELAY_MS);
    this.scheduleCpuTimer(() => {
      if (!this.isCurrentCpuTurn(key) || !attackWeapon) return;
      this.sendAction(attackWeapon === 'shield' ? { type: 'use_shield' } : { type: 'fire' });
    }, CPU_FIRE_DELAY_MS);
  }

  private isCurrentCpuTurn(key: string): boolean {
    return this.running && !this.isPaused() && this.currentCpuTurnKey(this.engine.getState()) === key;
  }

  private scheduleCpuTimer(callback: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      this.cpuTimers.delete(timer);
      callback();
    }, delayMs);
    this.cpuTimers.add(timer);
  }

  private clearCpuTimers(): void {
    for (const timer of this.cpuTimers) clearTimeout(timer);
    this.cpuTimers.clear();
  }
}
