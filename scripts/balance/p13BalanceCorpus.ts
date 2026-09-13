/**
 * P13's offline, deterministic balance-and-pacing baseline.
 *
 * This evaluates the production GameEngine through ordinary PlayerActions. It
 * records simulation signals for later inspection; it does not measure human
 * enjoyment, retention, fairness, or wall-clock waiting time.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAiPlan, type AiPlan } from '../../shared/src/engine/AI.ts';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { GRAVITY, MAX_WIND } from '../../shared/src/engine/Physics.ts';
import { normalizeTerrainHazardMode } from '../../shared/src/engine/Terrain.ts';
import { normalizeWallMode, type GameOptions } from '../../shared/src/types/GameOptions.ts';
import type { PlayerAction } from '../../shared/src/types/PlayerAction.ts';
import { quickOperationOptions, type QuickOperationId } from '../../client/src/client/quickOperations.ts';

export const P13_CORPUS_VERSION = 'p13-v1';
export const P13_RULESET_VERSION = 4;
export const P13_RUNNER_VERSION = 1;
export const P13_POLICY_VERSION = 1;
export const P13_SOURCE_REVISION = '3a2f7eda7fd0738e58a716d43054d377e238e3f7';

const SEEDS = [17, 42] as const;
const SETTLEMENT_TICK_CAP = 5_000;
const DEFAULT_TURN_CAP = 48;
const SIEGE_TURN_CAP = 72;
const LONG_NON_DAMAGING_STREAK = 6;
const LONG_SETTLEMENT_TICKS = 2_500;
const CONCENTRATED_STRATEGY_SHARE = 0.7;

export const REQUIRED_MECHANISMS = [
  'teamTargeting',
  'restrictedArsenalRestock',
  'multiRoundGravity',
  'battery',
  'shield',
  'terrain',
] as const;

type Mechanism = typeof REQUIRED_MECHANISMS[number];
type PolicyKind = 'ai' | 'scripted-mechanism';
type TraceKind = PolicyKind | 'round-transition';
type Termination = 'game_over' | 'turn_cap' | 'no_plan' | 'settlement_cap';

interface Scenario {
  id: string;
  operationId: QuickOperationId;
  difficulty: 'easy' | 'medium' | 'hard';
  policyKind: PolicyKind;
  turnCap: number;
  options: Partial<GameOptions>;
  mechanism?: Mechanism;
  evaluationSetup?: string;
}

interface TraceAction {
  readonly action: PlayerAction;
  readonly accepted: boolean;
}

interface TraceEntry {
  readonly policyIteration: number;
  readonly actorId: string;
  readonly policyKind: TraceKind;
  readonly round: number;
  readonly globalTurn: number;
  readonly effectiveGravity: number;
  readonly completedTurn: boolean;
  readonly iterationKind: 'completed-turn' | 'neutral-preparation' | 'incomplete-action' | 'settlement-cap' | 'round-transition';
  readonly planned?: Pick<AiPlan, 'weapon' | 'buy' | 'buyAccessory'>;
  readonly actions: readonly TraceAction[];
  readonly damageDelta: number;
  readonly terrainVersionDelta: number;
  readonly settlementTicks: number;
}

interface MechanismEvent {
  readonly attempted: boolean;
  readonly accepted?: boolean;
  readonly detail: string;
  readonly appliedPower?: number;
  readonly fireAccepted?: boolean;
}

interface ResolvedOptions {
  readonly maxPlayers: number;
  readonly players: NonNullable<GameOptions['players']>;
  readonly seed: number;
  readonly maxWind: number;
  readonly gravity: number;
  readonly walls: ReturnType<typeof normalizeWallMode>;
  readonly hazards: ReturnType<typeof normalizeTerrainHazardMode>;
  readonly rounds: number;
  readonly interestRate: number;
  readonly suddenDeathTurn: number;
  readonly armsLevel: number;
  readonly teamMode: boolean;
  readonly battlefieldWorld: NonNullable<GameOptions['battlefieldWorld']> | 'automatic';
  readonly rulesetVersion: typeof P13_RULESET_VERSION;
  readonly starterWeaponFalloff: 'decisive';
}

interface Observation {
  readonly id: string;
  readonly corpusVersion: typeof P13_CORPUS_VERSION;
  readonly rulesetVersion: typeof P13_RULESET_VERSION;
  readonly runnerVersion: typeof P13_RUNNER_VERSION;
  readonly policyVersion: typeof P13_POLICY_VERSION;
  readonly sourceRevision: typeof P13_SOURCE_REVISION;
  readonly inputProvenance: { readonly files: readonly string[]; readonly sha256: string };
  readonly scenarioId: string;
  readonly seed: number;
  readonly executionMode: 'offline-engine';
  readonly operationId: QuickOperationId;
  readonly policyKind: PolicyKind;
  readonly evaluationSetup: string | null;
  readonly resolvedOptions: ResolvedOptions;
  readonly seatCount: number;
  readonly teamMode: boolean;
  readonly difficulty: Scenario['difficulty'];
  readonly armsLevel: number;
  readonly termination: Termination;
  readonly terminalPhase: string;
  readonly winner: string | null;
  readonly winnerTeam: number | null;
  readonly policyIterationCap: number;
  readonly policyIterations: number;
  readonly completedTurns: number;
  readonly roundsReached: number;
  readonly roundTransitions: number;
  readonly simulationTicks: number;
  readonly maxSettlementTicks: number;
  readonly maxNonDamagingStreak: number;
  readonly topStrategyShare: number;
  readonly policyIterationCounts: Readonly<Record<PolicyKind, number>>;
  readonly transitionIterations: number;
  readonly neutralPreparationIterations: number;
  readonly incompleteActionIterations: number;
  readonly settlementCapIterations: number;
  readonly weaponUses: Readonly<Record<string, number>>;
  readonly purchases: { readonly attempted: number; readonly accepted: number; readonly rejected: number };
  readonly shieldActivations: number;
  readonly batteryPowerCap: number | null;
  readonly terrainVersionDelta: number;
  readonly mechanisms: Readonly<Partial<Record<Mechanism, MechanismEvent>>>;
  readonly inspectionFlags: readonly InspectionFlag[];
  readonly trace: readonly TraceEntry[];
}

export type InspectionFlag =
  | 'incomplete_turn_cap'
  | 'long_non_damaging_streak'
  | 'long_resolution'
  | 'concentrated_strategy';

interface MechanismCoverage {
  readonly status: 'executed' | 'missing';
  readonly observationIds: readonly string[];
  readonly reason: string;
}

export interface P13Dataset {
  readonly schemaVersion: 1;
  readonly corpusVersion: typeof P13_CORPUS_VERSION;
  readonly rulesetVersion: typeof P13_RULESET_VERSION;
  readonly runnerVersion: typeof P13_RUNNER_VERSION;
  readonly policyVersion: typeof P13_POLICY_VERSION;
  readonly sourceRevision: typeof P13_SOURCE_REVISION;
  readonly limits: {
    readonly settlementTickCap: number;
    readonly defaultTurnCap: number;
    readonly siegeTurnCap: number;
    readonly inspectionThresholds: Readonly<Record<'nonDamagingTurns' | 'settlementTicks' | 'strategyShare', number>>;
  };
  readonly limitations: readonly string[];
  readonly tuningDecision: string;
  readonly tuningCandidates: readonly unknown[];
  readonly mechanismCoverage: Readonly<Record<Mechanism, MechanismCoverage>>;
  readonly observations: readonly Observation[];
}

const PLAYER_COLORS = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'] as const;

function players(count: 2 | 4, difficulty: Scenario['difficulty']): NonNullable<GameOptions['players']> {
  return Array.from({ length: count }, (_, index) => ({
    name: `P${index + 1}`,
    color: PLAYER_COLORS[index]!,
    ai: difficulty,
  }));
}

const SCENARIOS: readonly Scenario[] = [
  { id: 'standard-medium', operationId: 'standard', difficulty: 'medium', policyKind: 'ai', turnCap: DEFAULT_TURN_CAP, options: { rounds: 3 } },
  { id: 'crosswind-medium', operationId: 'crosswind-range', difficulty: 'medium', policyKind: 'ai', turnCap: DEFAULT_TURN_CAP, options: { rounds: 3 } },
  { id: 'caldera-medium', operationId: 'caldera-run', difficulty: 'medium', policyKind: 'ai', turnCap: DEFAULT_TURN_CAP, options: { rounds: 3 }, mechanism: 'terrain' },
  { id: 'siege-hard', operationId: 'last-light-siege', difficulty: 'hard', policyKind: 'ai', turnCap: SIEGE_TURN_CAP, options: {}, mechanism: 'multiRoundGravity' },
  { id: 'team-hard', operationId: 'standard', difficulty: 'hard', policyKind: 'ai', turnCap: DEFAULT_TURN_CAP, options: { teamMode: true, rounds: 3 }, mechanism: 'teamTargeting' },
  { id: 'restricted-restock', operationId: 'standard', difficulty: 'hard', policyKind: 'scripted-mechanism', turnCap: DEFAULT_TURN_CAP, options: { armsLevel: 0, rounds: 3 }, mechanism: 'restrictedArsenalRestock', evaluationSetup: 'Evaluator-only precondition: p1 starts with finite Missile stock exhausted; the subsequent buy is a real engine action. This setup is not a match outcome or a balance result.' },
  { id: 'battery-range', operationId: 'standard', difficulty: 'medium', policyKind: 'scripted-mechanism', turnCap: DEFAULT_TURN_CAP, options: { armsLevel: 2, rounds: 3 }, mechanism: 'battery' },
  { id: 'shield-first', operationId: 'standard', difficulty: 'hard', policyKind: 'scripted-mechanism', turnCap: DEFAULT_TURN_CAP, options: { rounds: 3 }, mechanism: 'shield' },
];

function resolvedOptions(scenario: Scenario, seed: number): GameOptions {
  const seats = scenario.id === 'team-hard' ? 4 : 2;
  const base: GameOptions = {
    maxPlayers: seats,
    players: players(seats, scenario.difficulty),
    seed,
    rounds: 3,
    armsLevel: 4,
    rulesetVersion: P13_RULESET_VERSION,
    starterWeaponFalloff: 'decisive',
  };
  return quickOperationOptions(scenario.operationId, { ...base, ...scenario.options });
}

function effectiveOptions(options: GameOptions): ResolvedOptions {
  const rounds = Math.max(1, Math.floor(options.rounds ?? 1) || 1);
  const armsLevel = Number.isFinite(options.armsLevel) ? Math.max(0, Math.min(4, Math.floor(options.armsLevel!))) : 4;
  const interestRate = Number.isFinite(options.interestRate) && (options.interestRate ?? 0) > 0 ? options.interestRate! : 0;
  const suddenDeathTurn = Number.isFinite(options.suddenDeathTurn) && (options.suddenDeathTurn ?? 0) > 0 ? Math.floor(options.suddenDeathTurn!) : 0;
  const roster = options.players ?? [];
  return {
    maxPlayers: options.maxPlayers,
    players: roster.map((player) => ({ ...player })),
    seed: options.seed ?? 0,
    maxWind: options.maxWind ?? MAX_WIND,
    gravity: options.gravity ?? GRAVITY,
    walls: normalizeWallMode(options.walls),
    hazards: normalizeTerrainHazardMode(options.hazards),
    rounds,
    interestRate,
    suddenDeathTurn,
    armsLevel,
    teamMode: options.teamMode === true && roster.length === 4,
    battlefieldWorld: options.battlefieldWorld ?? 'automatic',
    rulesetVersion: P13_RULESET_VERSION,
    starterWeaponFalloff: 'decisive',
  };
}

function provenance(): Observation['inputProvenance'] {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const collectTs = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? collectTs(join(directory, entry.name))
      : entry.name.endsWith('.ts') ? [join(directory, entry.name)] : []);
  const absoluteFiles = [
    join(root, 'scripts/balance/p13BalanceCorpus.ts'),
    join(root, 'client/src/client/quickOperations.ts'),
    ...collectTs(join(root, 'shared/src')),
  ].filter((file) => statSync(file).isFile()).sort();
  const files = absoluteFiles.map((file) => relative(root, file).replaceAll('\\', '/'));
  const hash = createHash('sha256');
  for (const [index, relativePath] of files.entries()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(readFileSync(absoluteFiles[index]!, 'utf8').replaceAll('\r\n', '\n'));
    hash.update('\0');
  }
  return { files, sha256: hash.digest('hex') };
}

function totalDamage(engine: GameEngine): number {
  return engine.getState().tanks.reduce((sum, tank) => sum + tank.totalDamage, 0);
}

function actionSummary(action: PlayerAction, accepted: boolean): TraceAction {
  return { action, accepted };
}

function settle(engine: GameEngine): { ticks: number; capped: boolean } {
  let ticks = 0;
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    engine.tick();
    ticks += 1;
    if (ticks >= SETTLEMENT_TICK_CAP) return { ticks, capped: true };
  }
  return { ticks, capped: false };
}

function applyPlan(engine: GameEngine, plan: AiPlan, actions: TraceAction[]): { settlement: ReturnType<typeof settle>; shield: boolean } {
  const apply = (action: PlayerAction): boolean => {
    const accepted = engine.applyAction(action);
    actions.push(actionSummary(action, accepted));
    return accepted;
  };
  if (plan.buy) apply({ type: 'buy', weapon: plan.buy });
  if (plan.buyAccessory) apply({ type: 'buy', accessory: plan.buyAccessory });
  if (plan.weapon === 'shield') {
    const accepted = apply({ type: 'use_shield' });
    return { settlement: { ticks: 0, capped: false }, shield: accepted };
  }
  apply({ type: 'select_weapon', weapon: plan.weapon });
  apply({ type: 'set_angle', angle: plan.angle });
  apply({ type: 'set_power', power: plan.power });
  apply({ type: 'fire' });
  return { settlement: settle(engine), shield: false };
}

function scriptedTurn(
  engine: GameEngine,
  scenario: Scenario,
  state: { batteryDone: boolean; restockDone: boolean; shieldDone: boolean },
  actions: TraceAction[],
): { settlement: ReturnType<typeof settle>; executed?: MechanismEvent; shield: boolean } | null {
  const active = engine.getState().activePlayerId;
  const apply = (action: PlayerAction): boolean => {
    const accepted = engine.applyAction(action);
    actions.push(actionSummary(action, accepted));
    return accepted;
  };
  if (scenario.mechanism === 'restrictedArsenalRestock' && !state.restockDone) {
    if (active !== 'p1') return null;
    const accepted = apply({ type: 'buy', weapon: 'missile' });
    state.restockDone = true;
    return { settlement: { ticks: 0, capped: false }, shield: false, executed: { attempted: true, accepted, detail: `restricted missile restock attempted by ${active}` } };
  }
  if (scenario.mechanism === 'battery' && !state.batteryDone) {
    state.batteryDone = true;
    const accepted = apply({ type: 'buy', accessory: 'battery' });
    const afterBuy = engine.getState().tanks.find((tank) => tank.id === active);
    const selected = apply({ type: 'select_weapon', weapon: 'baby_missile' });
    apply({ type: 'set_angle', angle: 45 });
    const setPowerAccepted = apply({ type: 'set_power', power: 150 });
    const appliedPower = engine.getState().tanks.find((tank) => tank.id === active)?.power ?? 0;
    const fireAccepted = apply({ type: 'fire' });
    const settlement = settle(engine);
    return {
      settlement,
      shield: false,
      executed: {
        attempted: true,
        accepted: accepted && (afterBuy?.powerCap ?? 100) > 100 && selected && setPowerAccepted && appliedPower > 100 && fireAccepted,
        detail: `Battery purchase and over-cap power input attempted by ${active}`,
        appliedPower,
        fireAccepted,
      },
    };
  }
  if (scenario.mechanism === 'shield' && !state.shieldDone) {
    state.shieldDone = true;
    apply({ type: 'select_weapon', weapon: 'shield' });
    const accepted = apply({ type: 'use_shield' });
    return { settlement: { ticks: 0, capped: false }, shield: accepted, executed: { attempted: true, accepted, detail: `Shield activation attempted by ${active}` } };
  }
  return null;
}

function runObservation(scenario: Scenario, seed: number, inputProvenance: Observation['inputProvenance']): Observation {
  const options = resolvedOptions(scenario, seed);
  const effective = effectiveOptions(options);
  const engine = new GameEngine(options);
  if (scenario.mechanism === 'restrictedArsenalRestock') {
    engine.getState().tanks[0]!.inventory.missile.count = 0;
  }
  const initialTerrainVersion = engine.getState().terrainVersion;
  const openingGravity = engine.getEffectiveGravity();
  const trace: TraceEntry[] = [];
  const weaponUses: Record<string, number> = {};
  const mechanisms: Partial<Record<Mechanism, MechanismEvent>> = {};
  const scripted = { batteryDone: false, restockDone: false, shieldDone: false };
  let purchasesAttempted = 0;
  let purchasesAccepted = 0;
  let shieldActivations = 0;
  let simulationTicks = 0;
  let maxSettlementTicks = 0;
  let policyIterations = 0;
  let completedTurns = 0;
  let maxNonDamagingStreak = 0;
  let nonDamagingStreak = 0;
  let roundTransitions = 0;
  let transitionIterations = 0;
  const policyIterationCounts: Record<PolicyKind, number> = { ai: 0, 'scripted-mechanism': 0 };
  let neutralPreparationIterations = 0;
  let incompleteActionIterations = 0;
  let settlementCapIterations = 0;
  let termination: Termination = 'turn_cap';

  if (scenario.mechanism === 'teamTargeting') {
    const probe = engine.clone();
    const [cpu, enemy, ally, otherEnemy] = probe.getState().tanks;
    if (cpu && enemy && ally && otherEnemy) {
      Object.assign(cpu, { x: 100, y: 300 });
      Object.assign(enemy, { x: 700, y: 300, health: 100 });
      Object.assign(ally, { x: 130, y: 300, health: 12 });
      Object.assign(otherEnemy, { x: 780, y: 300, health: 0, alive: false });
      cpu.inventory.nuke.count = 1;
      const plan = computeAiPlan(probe.getState(), cpu.id, 'hard', probe.getEffectiveGravity(), Number.POSITIVE_INFINITY, 'conservative');
      mechanisms.teamTargeting = {
        attempted: true,
        accepted: plan?.weapon === 'nuke',
        detail: 'Controlled exported-AI probe: nearer ally at 130, 100hp enemy at 700; Nuke selection is the existing observable enemy-target signal.',
      };
    }
  }

  while (policyIterations < scenario.turnCap) {
    const before = engine.getState();
    if (before.phase === 'GAME_OVER') {
      termination = 'game_over';
      break;
    }
    if (before.phase === 'ROUND_OVER') {
      const accepted = engine.applyAction({ type: 'next_round' });
      trace.push({
        policyIteration: policyIterations,
        actorId: before.activePlayerId,
        policyKind: 'round-transition',
        round: before.round,
        globalTurn: before.turn,
        effectiveGravity: engine.getEffectiveGravity(),
        completedTurn: false,
        iterationKind: 'round-transition',
        actions: [{ action: { type: 'next_round' }, accepted }],
        damageDelta: 0,
        terrainVersionDelta: 0,
        settlementTicks: 0,
      });
      if (accepted) roundTransitions += 1;
      policyIterations += 1;
      transitionIterations += 1;
      continue;
    }
    if (before.phase !== 'PLAYER_TURN') {
      termination = 'settlement_cap';
      break;
    }

    const actorId = before.activePlayerId;
    const round = before.round;
    const globalTurn = before.turn;
    const effectiveGravity = engine.getEffectiveGravity();
    const damageBefore = totalDamage(engine);
    const terrainBefore = before.terrainVersion;
    const actions: TraceAction[] = [];
    let plan: AiPlan | null = null;
    let result = scenario.policyKind === 'scripted-mechanism'
      ? scriptedTurn(engine, scenario, scripted, actions)
      : null;
    const tracePolicyKind: PolicyKind = result ? 'scripted-mechanism' : 'ai';

    if (result?.executed && scenario.mechanism) mechanisms[scenario.mechanism] = result.executed;
    if (!result) {
      plan = computeAiPlan(
        engine.getState(),
        actorId,
        scenario.difficulty,
        engine.getEffectiveGravity(),
        options.armsLevel,
      );
      if (!plan) {
        termination = 'no_plan';
        break;
      }
      result = applyPlan(engine, plan, actions);
    }
    policyIterationCounts[tracePolicyKind] += 1;

    for (const action of actions) {
      if (action.action.type === 'buy') {
        purchasesAttempted += 1;
        if (action.accepted) purchasesAccepted += 1;
      }
    }
    if (result.shield) shieldActivations += 1;
    const selectedWeapon = [...actions].reverse().find((action) => action.action.type === 'select_weapon' && action.accepted)?.action;
    const acceptedFire = actions.some((action) => action.action.type === 'fire' && action.accepted);
    const acceptedShield = actions.some((action) => action.action.type === 'use_shield' && action.accepted);
    if (acceptedFire && selectedWeapon?.type === 'select_weapon') {
      weaponUses[selectedWeapon.weapon] = (weaponUses[selectedWeapon.weapon] ?? 0) + 1;
    }
    if (acceptedShield) weaponUses.shield = (weaponUses.shield ?? 0) + 1;

    const after = engine.getState();
    const damageDelta = totalDamage(engine) - damageBefore;
    const terrainVersionDelta = after.terrainVersion - terrainBefore;
    simulationTicks += result.settlement.ticks;
    maxSettlementTicks = Math.max(maxSettlementTicks, result.settlement.ticks);
    const completedTurn = after.activePlayerId !== actorId || after.phase === 'ROUND_OVER' || after.phase === 'GAME_OVER';
    const neutralPreparation = !completedTurn
      && !result.settlement.capped
      && actions.length > 0
      && actions.every(({ action, accepted }) => accepted && action.type === 'buy');
    const iterationKind: TraceEntry['iterationKind'] = completedTurn
      ? 'completed-turn'
      : result.settlement.capped
        ? 'settlement-cap'
        : neutralPreparation
          ? 'neutral-preparation'
          : 'incomplete-action';
    if (completedTurn) {
      completedTurns += 1;
      nonDamagingStreak = damageDelta > 0 ? 0 : nonDamagingStreak + 1;
      maxNonDamagingStreak = Math.max(maxNonDamagingStreak, nonDamagingStreak);
    } else if (iterationKind === 'neutral-preparation') {
      neutralPreparationIterations += 1;
    } else if (iterationKind === 'settlement-cap') {
      settlementCapIterations += 1;
    } else {
      incompleteActionIterations += 1;
    }
    trace.push({
      policyIteration: policyIterations,
      actorId,
      policyKind: tracePolicyKind,
      round,
      globalTurn,
      effectiveGravity,
      completedTurn,
      iterationKind,
      ...(plan ? { planned: { weapon: plan.weapon, ...(plan.buy ? { buy: plan.buy } : {}), ...(plan.buyAccessory ? { buyAccessory: plan.buyAccessory } : {}) } } : {}),
      actions,
      damageDelta,
      terrainVersionDelta,
      settlementTicks: result.settlement.ticks,
    });
    policyIterations += 1;
    if (result.settlement.capped) {
      termination = 'settlement_cap';
      break;
    }
  }

  const final = engine.getState();
  if (scenario.mechanism === 'multiRoundGravity' && !mechanisms.multiRoundGravity) {
    const gravityExercised = trace.some((entry) => entry.effectiveGravity > openingGravity);
    const multiRound = roundTransitions > 0 || final.round > 1;
    mechanisms.multiRoundGravity = {
      attempted: true,
      accepted: gravityExercised && multiRound,
      detail: `Last Light Siege reached ${policyIterations} policy iterations, ${completedTurns} completed turns, ${roundTransitions} round transitions, and gravity escalation=${gravityExercised}.`,
    };
  }
  if (scenario.mechanism === 'terrain' && !mechanisms.terrain) {
    const mutatedShot = trace.find((entry) => entry.completedTurn && entry.settlementTicks > 0 && entry.terrainVersionDelta > 0);
    mechanisms.terrain = {
      attempted: true,
      accepted: mutatedShot !== undefined,
      detail: mutatedShot
        ? `Production shot at policy iteration ${mutatedShot.policyIteration} changed terrainVersion by ${mutatedShot.terrainVersionDelta}.`
        : 'No traced completed production shot changed terrainVersion.',
    };
  }

  const topWeaponCount = Math.max(0, ...Object.values(weaponUses));
  if (final.phase === 'GAME_OVER') termination = 'game_over';
  const topStrategyShare = completedTurns === 0 ? 0 : topWeaponCount / completedTurns;
  const flags = deriveInspectionFlags({ termination, maxNonDamagingStreak, maxSettlementTicks, topStrategyShare, completedTurns });
  const batteryTank = final.tanks.find((tank) => tank.powerCap > 100);
  return {
    id: `${scenario.id}:${seed}`,
    corpusVersion: P13_CORPUS_VERSION,
    rulesetVersion: P13_RULESET_VERSION,
    runnerVersion: P13_RUNNER_VERSION,
    policyVersion: P13_POLICY_VERSION,
    sourceRevision: P13_SOURCE_REVISION,
    inputProvenance,
    scenarioId: scenario.id,
    seed,
    executionMode: 'offline-engine',
    operationId: scenario.operationId,
    policyKind: scenario.policyKind,
    evaluationSetup: scenario.evaluationSetup ?? null,
    resolvedOptions: effective,
    seatCount: effective.maxPlayers,
    teamMode: effective.teamMode,
    difficulty: scenario.difficulty,
    armsLevel: effective.armsLevel,
    termination,
    terminalPhase: final.phase,
    winner: final.winner,
    winnerTeam: final.winnerTeam ?? null,
    policyIterationCap: scenario.turnCap,
    policyIterations,
    completedTurns,
    roundsReached: final.round,
    roundTransitions,
    simulationTicks,
    maxSettlementTicks,
    maxNonDamagingStreak,
    topStrategyShare,
    policyIterationCounts,
    transitionIterations,
    neutralPreparationIterations,
    incompleteActionIterations,
    settlementCapIterations,
    weaponUses,
    purchases: { attempted: purchasesAttempted, accepted: purchasesAccepted, rejected: purchasesAttempted - purchasesAccepted },
    shieldActivations,
    batteryPowerCap: batteryTank?.powerCap ?? null,
    terrainVersionDelta: final.terrainVersion - initialTerrainVersion,
    mechanisms,
    inspectionFlags: flags,
    trace,
  };
}

function coverage(observations: readonly Observation[]): Record<Mechanism, MechanismCoverage> {
  const executedReasons: Record<Mechanism, string> = {
    teamTargeting: 'Controlled exported-AI probe selected the existing enemy-target signal; this is not a full-match target telemetry claim.',
    restrictedArsenalRestock: 'Accepted production-engine buy after the disclosed evaluator-only exhausted-stock precondition.',
    multiRoundGravity: 'Trace contains both a real round transition and an effective-gravity increase.',
    battery: 'Accepted production-engine Battery purchase and over-cap power input were traced.',
    shield: 'Accepted production-engine Shield activation was traced.',
    terrain: 'A traced completed production shot changed terrainVersion during the Caldera scenario.',
  };
  const result = {} as Record<Mechanism, MechanismCoverage>;
  for (const mechanism of REQUIRED_MECHANISMS) {
    const attempted = observations.filter((observation) => observation.mechanisms[mechanism]?.attempted);
    const accepted = attempted.filter((observation) => observation.mechanisms[mechanism]?.accepted);
    result[mechanism] = accepted.length > 0
      ? { status: 'executed', observationIds: accepted.map((observation) => observation.id), reason: executedReasons[mechanism] }
      : { status: 'missing', observationIds: attempted.map((observation) => observation.id), reason: 'Scenario ran, but the named mechanism was not accepted or observed.' };
  }
  return result;
}

export function deriveInspectionFlags(input: {
  termination: Termination;
  maxNonDamagingStreak: number;
  maxSettlementTicks: number;
  topStrategyShare: number;
  completedTurns: number;
}): InspectionFlag[] {
  const flags: InspectionFlag[] = [];
  if (input.termination === 'turn_cap') flags.push('incomplete_turn_cap');
  if (input.maxNonDamagingStreak >= LONG_NON_DAMAGING_STREAK) flags.push('long_non_damaging_streak');
  if (input.maxSettlementTicks >= LONG_SETTLEMENT_TICKS) flags.push('long_resolution');
  if (input.completedTurns >= 5 && input.topStrategyShare >= CONCENTRATED_STRATEGY_SHARE) flags.push('concentrated_strategy');
  return flags;
}

export function runP13BalanceCorpus(): P13Dataset {
  const inputProvenance = provenance();
  const observations = SCENARIOS.flatMap((scenario) => SEEDS.map((seed) => runObservation(scenario, seed, inputProvenance)));
  return {
    schemaVersion: 1,
    corpusVersion: P13_CORPUS_VERSION,
    rulesetVersion: P13_RULESET_VERSION,
    runnerVersion: P13_RUNNER_VERSION,
    policyVersion: P13_POLICY_VERSION,
    sourceRevision: P13_SOURCE_REVISION,
    limits: {
      settlementTickCap: SETTLEMENT_TICK_CAP,
      defaultTurnCap: DEFAULT_TURN_CAP,
      siegeTurnCap: SIEGE_TURN_CAP,
      inspectionThresholds: {
        nonDamagingTurns: LONG_NON_DAMAGING_STREAK,
        settlementTicks: LONG_SETTLEMENT_TICKS,
        strategyShare: CONCENTRATED_STRATEGY_SHARE,
      },
    },
    limitations: [
      'Automated bot outcomes are deterministic regression signals and do not establish human enjoyment, retention, or unbiased balance.',
      'Simulation ticks describe engine work and discrete turn resolution; they do not measure player waiting time or decision time.',
      'A turn cap is incomplete evidence to inspect, not proof of a softlock or a completed match.',
      'Scripted-mechanism observations exercise production actions but are excluded from claims about ordinary bot strategy.',
    ],
    tuningDecision: 'No tuning is proposed from bot-only evidence.',
    tuningCandidates: [],
    mechanismCoverage: coverage(observations),
    observations,
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function renderP13Report(dataset: P13Dataset): string {
  const rows = dataset.observations.map((observation) => `<tr><td>${observation.id}</td><td>${observation.policyKind}</td><td>${observation.termination}</td><td>${observation.completedTurns}/${observation.policyIterations}</td><td>${observation.simulationTicks}</td><td>${observation.inspectionFlags.join(', ') || 'none'}</td></tr>`).join('');
  const coverageRows = REQUIRED_MECHANISMS.map((mechanism) => {
    const entry = dataset.mechanismCoverage[mechanism];
    return `<li><strong>${mechanism}</strong>: ${entry.status} — ${escapeHtml(entry.reason)} (${entry.observationIds.join(', ') || 'none'})</li>`;
  }).join('');
  const setupRows = dataset.observations
    .filter((observation) => observation.evaluationSetup)
    .map((observation) => `<li><strong>${observation.id}</strong>: ${escapeHtml(observation.evaluationSetup!)}</li>`)
    .join('') || '<li>None.</li>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>P13 balance and pacing baseline</title><style>body{font:16px system-ui;margin:2rem;max-width:1100px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.35rem;text-align:left}code{white-space:pre-wrap}</style></head><body>
<h1>P13 deterministic balance and pacing baseline</h1>
<p>Corpus <code>${dataset.corpusVersion}</code>; ruleset ${dataset.rulesetVersion}; runner ${dataset.runnerVersion}; policy ${dataset.policyVersion}; source ${dataset.sourceRevision}.</p>
<h2>Evidence boundary</h2><ul>${dataset.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
<h2>Mechanism coverage</h2><ul>${coverageRows}</ul>
<h2>Evaluator-only setup</h2><ul>${setupRows}</ul>
<h2>Inspection thresholds</h2><p>Non-damaging streak ≥ ${dataset.limits.inspectionThresholds.nonDamagingTurns}; settlement ticks ≥ ${dataset.limits.inspectionThresholds.settlementTicks}; strategy share ≥ ${dataset.limits.inspectionThresholds.strategyShare}. Flags request trace inspection; they do not establish a balance verdict.</p>
<h2>Observations</h2><p>Turns are completed gameplay turns / policy iterations. Neutral preparation actions are retained in the trace but do not extend a non-damaging-turn streak.</p><table><thead><tr><th>id</th><th>policy</th><th>outcome</th><th>completed / iterations</th><th>simulation ticks</th><th>inspection flags</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Tuning</h2><p>${escapeHtml(dataset.tuningDecision)}</p>
</body></html>
`;
}

export function validateP13Dataset(dataset: P13Dataset): void {
  if (dataset.corpusVersion !== P13_CORPUS_VERSION || dataset.rulesetVersion !== P13_RULESET_VERSION || dataset.policyVersion !== P13_POLICY_VERSION) throw new Error('corpus/ruleset/policy version mismatch');
  for (const mechanism of REQUIRED_MECHANISMS) {
    const entry = dataset.mechanismCoverage[mechanism];
    if (!entry || (entry.status !== 'executed' && entry.status !== 'missing') || !entry.reason) throw new Error(`${mechanism} coverage is required`);
  }
  const observationIds = new Set(dataset.observations.map((observation) => observation.id));
  for (const candidate of dataset.tuningCandidates) {
    if (!candidate || typeof candidate !== 'object') throw new Error('tuning candidate must be an object');
    const record = candidate as Record<string, unknown>;
    if (typeof record.playerProblem !== 'string' || record.playerProblem.trim() === '') throw new Error('tuning candidate playerProblem is required');
    if (!Array.isArray(record.observationIds) || record.observationIds.length === 0
      || record.observationIds.some((id) => typeof id !== 'string' || id.trim() === '' || !observationIds.has(id))) {
      throw new Error('tuning candidate observationIds must be nonempty IDs from this dataset');
    }
    if (typeof record.proposedChange !== 'string' || record.proposedChange.trim() === '') throw new Error('tuning candidate proposedChange is required');
  }
}

export function writeP13Artifacts(): P13Dataset {
  const dataset = runP13BalanceCorpus();
  validateP13Dataset(dataset);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  mkdirSync(`${root}docs/balance`, { recursive: true });
  writeFileSync(`${root}docs/balance/p13-v1.json`, `${JSON.stringify(dataset, null, 2)}\n`);
  writeFileSync(`${root}docs/balance/p13-v1.html`, renderP13Report(dataset));
  return dataset;
}
