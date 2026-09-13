// Generated retained cq1 API. Runtime is self-contained; MIT, singedTerra contributors.
import type { GameState, GamePhase } from '../../types/GameState.ts';
export type HumanAction = { readonly type: 'set_angle'; readonly angle: number }
  | { readonly type: 'set_power'; readonly power: number } | { readonly type: 'fire' };
export interface HumanFire { readonly angle: number; readonly power: number }
export type Terminal = 'objective_cleared' | 'terminal_without_clear' | 'objective_not_cleared' | 'work_limit';
export type WorkKind = 'engineTicks' | 'cpuProbes' | 'cpuCandidates' | 'sweepSegments' | 'sweepSamples'
  | 'collisionChecks' | 'terrainCells' | 'terrainSteps' | 'engineSteps' | 'allocatedBytes' | 'copiedBytes' | 'totalUnits';
export type Work = Readonly<Record<WorkKind, number>>;
export type Event = Readonly<{ type: 'salvo_settled'; actor: 'human' | 'cpu'; salvo: number; ticks: number;
  humanHealth: number; cpuHealth: number; damageToCpu: number; phase: GamePhase }>
  | Readonly<{ type: 'cpu_selected'; salvo: number; angle: number; power: number; probeCount: number;
    simulationTicks: number; coarseBest: HumanFire }> | Readonly<{ type: 'terminal'; terminal: Terminal }>;
export interface Result {
  readonly editionId: 'cq1'; readonly seed: 42; readonly terminal: Terminal;
  readonly humanSalvos: number; readonly cpuSalvos: number; readonly humanHealth: number; readonly cpuHealth: number;
  readonly liveTicks: number; readonly cpuSimulationTicks: number; readonly maximumProbeCount: number;
  readonly transcript: readonly HumanFire[]; readonly events: readonly Event[];
}
export interface Controller {
  readonly complete: boolean; readonly awaitingHuman: boolean; readonly transcript: readonly HumanFire[];
  readonly events: readonly Event[]; readonly work: Work;
  /** Detached snapshot; typed-array storage is independent of the engine. Null after work refusal. */
  getState(): Readonly<GameState> | null;
  applyHumanAction(action: HumanAction): boolean; tick(): void; result(): Result;
}
export declare const artifactApiVersion: 1;
export declare const editionId: 'cq1';
export declare const catalog: Readonly<{ editionId: 'cq1'; trialId: 'crosswind-qualification';
  entitlementId: 'crosswind-qualification'; descriptorVersion: 1; objectiveVersion: 1;
  verifierArtifactId: 'cq1'; cpuPolicyId: 'cq1-hard-v3'; rewardVersion: 1; seed: 42;
  reward: Readonly<{ medalId: 'crosswind-qualification'; xp: 200 }>;
  rules: Readonly<{ maxPlayers: 2; humanSeat: 0; rounds: 1; walls: 'wrap'; hazards: 'none'; gravity: 0.15;
    maxWind: 6; interestRate: 0; suddenDeathTurn: 0; teamMode: false; armsLevel: 0;
    starterWeaponFalloff: 'decisive'; weapon: 'baby_missile' }>;
  limits: Readonly<{ humanSalvos: 3; cpuSalvos: 3; angle: Readonly<{min:0;max:180}>;
    power: Readonly<{min:0;max:100}>; sessionSeconds:1800; computeAttempts:3 }> }>;
export declare const workLimits: Work;
export declare function createController(): Controller;
export declare function replayWithWork(transcript: unknown): Readonly<{ result: Result; work: Work }>;
