/**
 * Evaluator-only P04 feasibility probe.
 *
 * It drives ordinary GameEngine PlayerActions against the same two-seat,
 * Medium-CPU options used by Quick Duel. It never mutates a tank/loadout,
 * imports no browser code, and is not a runtime challenge implementation.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { computeAiPlan } from '../../shared/src/engine/AI.ts';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { MAX_MOVE_DELTA } from '../../shared/src/engine/Movement.ts';
import type { GameOptions } from '../../shared/src/types/GameOptions.ts';
import type { PlayerAction } from '../../shared/src/types/PlayerAction.ts';
import { quickOperationOptions } from '../../client/src/client/quickOperations.ts';
import { createPracticeFieldOrderById, observeFieldOrder } from '../../client/src/client/fieldOrder.ts';
import {
  createPracticeFieldOrderEvidence, observePracticeFieldOrderAction,
  practiceFieldOrderObservationFromEvidence, settlePracticeFieldOrderEvidence,
  snapshotPracticeFieldOrder,
} from '../../client/src/client/practiceFieldOrder.ts';

/** Only this exact operation/descriptor seed is published by P04v2. */
const SUPPORTED_SEEDS = [42] as const;
const SETTLEMENT_CAP = 5_000;
const MATCH_TURN_CAP = 64;
const POSITION_TARGET = MAX_MOVE_DELTA * 2;

type RouteKind = 'direct' | 'wrap' | 'advance' | 'retreat' | 'early-kit' | 'conserved-kit'
  | 'ranging-miss' | 'unchanged-position' | 'lean-defeat';

interface RecordedAction {
  readonly action: PlayerAction;
  readonly accepted: boolean;
}

interface ShotResult {
  readonly route: 'direct' | 'wrap';
  readonly angle: number;
  readonly power: number;
  readonly creditedDamage: number;
  readonly wallContacts: number;
  readonly settlementTicks: number;
}

interface RouteReceipt {
  readonly seed: number;
  readonly kind: RouteKind;
  readonly achieved: boolean;
  readonly detail: string;
  readonly actions: readonly RecordedAction[];
  readonly settlementTicks: number;
  readonly terminalPhase: string;
  readonly winner: string | null;
}

function baseOptions(seed: number): GameOptions {
  return {
    maxPlayers: 2,
    players: [
      { name: 'Player 1', color: '#ef5350' },
      { name: 'CPU 1', color: '#42a5f5', ai: 'medium' },
    ],
    seed,
    rounds: 3,
  };
}

function settle(engine: GameEngine): number {
  let ticks = 0;
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    engine.tick();
    ticks += 1;
    if (ticks > SETTLEMENT_CAP) throw new Error('settlement_cap');
  }
  return ticks;
}

function cpuHealth(engine: GameEngine): number {
  const cpu = engine.getState().tanks.find((tank) => tank.ai);
  if (!cpu) throw new Error('missing_cpu');
  return cpu.health;
}

function humanTotalDamage(engine: GameEngine): number {
  const human = engine.getState().tanks.find((tank) => !tank.ai);
  if (!human) throw new Error('missing_human');
  return human.totalDamage;
}

function record(engine: GameEngine, actions: RecordedAction[], action: PlayerAction): boolean {
  const accepted = engine.applyAction(action);
  actions.push({ action, accepted });
  return accepted;
}

function evaluateShot(
  initial: GameEngine,
  angle: number,
  power: number,
  requireWrap: boolean,
): ShotResult | null {
  const engine = initial.clone();
  const opponentHealthBefore = cpuHealth(engine);
  const humanDamageBefore = humanTotalDamage(engine);
  if (!engine.applyAction({ type: 'select_weapon', weapon: 'baby_missile' })) return null;
  if (!engine.applyAction({ type: 'set_angle', angle })) return null;
  if (!engine.applyAction({ type: 'set_power', power })) return null;
  if (!engine.applyAction({ type: 'fire' })) return null;
  const settlementTicks = settle(engine);
  const state = engine.getState();
  const wallContacts = state.wallImpacts.length;
  const creditedDamage = Math.max(0, humanTotalDamage(engine) - humanDamageBefore);
  if (creditedDamage <= 0 || opponentHealthBefore <= cpuHealth(engine)
    || (requireWrap && wallContacts === 0) || (!requireWrap && wallContacts > 0)) return null;
  return {
    route: requireWrap ? 'wrap' : 'direct',
    angle,
    power,
    creditedDamage,
    wallContacts,
    settlementTicks,
  };
}

function findShot(engine: GameEngine, requireWrap: boolean): ShotResult | null {
  const angles = requireWrap
    ? [105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160]
    : [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  const powers = requireWrap ? [65, 70, 75, 80, 85, 90, 95, 100] : [45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
  let best: ShotResult | null = null;
  for (const angle of angles) {
    for (const power of powers) {
      const candidate = evaluateShot(engine, angle, power, requireWrap);
      if (candidate && (best === null || candidate.creditedDamage > best.creditedDamage
        || (candidate.creditedDamage === best.creditedDamage && candidate.settlementTicks < best.settlementTicks))) {
        best = candidate;
      }
    }
  }
  return best;
}

function executeBabyShot(engine: GameEngine, actions: RecordedAction[], shot: ShotResult): number {
  if (!record(engine, actions, { type: 'select_weapon', weapon: 'baby_missile' })) throw new Error('select_rejected');
  if (!record(engine, actions, { type: 'set_angle', angle: shot.angle })) throw new Error('angle_rejected');
  if (!record(engine, actions, { type: 'set_power', power: shot.power })) throw new Error('power_rejected');
  if (!record(engine, actions, { type: 'fire' })) throw new Error('fire_rejected');
  return settle(engine);
}

function rangingReceipt(seed: number, route: 'direct' | 'wrap'): RouteReceipt {
  const options = quickOperationOptions('crosswind-range', baseOptions(seed));
  if (options.seed !== seed) throw new Error('unsupported_crosswind_seed');
  const engine = new GameEngine(options);
  const actions: RecordedAction[] = [];
  const shot = findShot(engine, route === 'wrap');
  if (!shot) {
    return { seed, kind: route, achieved: false, detail: 'No bounded legal Baby Missile hit found.', actions, settlementTicks: 0, terminalPhase: engine.getState().phase, winner: engine.getState().winner };
  }
  const before = humanTotalDamage(engine);
  const ticks = executeBabyShot(engine, actions, shot);
  return {
    seed,
    kind: route,
    achieved: humanTotalDamage(engine) > before,
    detail: `${route} Baby Missile: angle ${shot.angle}, power ${shot.power}, credited damage ${shot.creditedDamage}, wall contacts ${shot.wallContacts}`,
    actions,
    settlementTicks: ticks,
    terminalPhase: engine.getState().phase,
    winner: engine.getState().winner,
  };
}

function positionReceipt(seed: number, kind: 'advance' | 'retreat'): RouteReceipt {
  const options = quickOperationOptions('caldera-run', baseOptions(seed));
  if (options.seed !== seed) throw new Error('unsupported_caldera_seed');
  const engine = new GameEngine(options);
  const actions: RecordedAction[] = [];
  const direction = kind === 'advance' ? MAX_MOVE_DELTA : -MAX_MOVE_DELTA;
  const initial = engine.getState().tanks.find((tank) => tank.id === 'p1');
  if (!initial) throw new Error('missing_human');
  const initialX = initial.x;
  record(engine, actions, { type: 'move', delta: direction });
  record(engine, actions, { type: 'move', delta: direction });
  const human = engine.getState().tanks.find((tank) => tank.id === 'p1');
  const travel = human ? Math.abs(human.x - initialX) : 0;
  const shot = findShot(engine, false);
  if (!shot) {
    return { seed, kind, achieved: false, detail: `Opening travel ${travel}; no bounded legal hit found.`, actions, settlementTicks: 0, terminalPhase: engine.getState().phase, winner: engine.getState().winner };
  }
  const before = humanTotalDamage(engine);
  const ticks = executeBabyShot(engine, actions, shot);
  return {
    seed,
    kind,
    achieved: travel >= POSITION_TARGET && humanTotalDamage(engine) > before,
    detail: `${kind} travel ${travel}; Baby Missile angle ${shot.angle}, power ${shot.power}, credited damage ${Math.max(0, humanTotalDamage(engine) - before)}`,
    actions,
    settlementTicks: ticks,
    terminalPhase: engine.getState().phase,
    winner: engine.getState().winner,
  };
}

function applyPlan(engine: GameEngine, actions: RecordedAction[]): number {
  const state = engine.getState();
  const active = state.tanks.find((tank) => tank.id === state.activePlayerId);
  if (!active) throw new Error('missing_active');
  const difficulty = active.ai ? 'medium' : 'hard';
  const plan = computeAiPlan(state, active.id, difficulty, engine.getEffectiveGravity(), 0);
  if (!plan) throw new Error('no_plan');
  if (plan.buy) record(engine, actions, { type: 'buy', weapon: plan.buy });
  if (plan.buyAccessory) record(engine, actions, { type: 'buy', accessory: plan.buyAccessory });
  if (plan.weapon === 'shield') {
    record(engine, actions, { type: 'use_shield' });
    return 0;
  }
  record(engine, actions, { type: 'select_weapon', weapon: plan.weapon });
  record(engine, actions, { type: 'set_angle', angle: plan.angle });
  record(engine, actions, { type: 'set_power', power: plan.power });
  if (!record(engine, actions, { type: 'fire' })) throw new Error('planned_fire_rejected');
  return settle(engine);
}

function openingKitShot(engine: GameEngine, actions: RecordedAction[], weapon: 'heavy_missile' | 'baby_missile'): number {
  const before = humanTotalDamage(engine);
  let best: { angle: number; power: number; damage: number; ticks: number } | null = null;
  for (const angle of [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]) {
    for (const power of [50, 60, 70, 80, 90, 100]) {
      const probe = engine.clone();
      if (!probe.applyAction({ type: 'select_weapon', weapon })
        || !probe.applyAction({ type: 'set_angle', angle })
        || !probe.applyAction({ type: 'set_power', power })
        || !probe.applyAction({ type: 'fire' })) continue;
      const ticks = settle(probe);
      const damage = Math.max(0, humanTotalDamage(probe) - before);
      if (!best || damage > best.damage || (damage === best.damage && ticks < best.ticks)) best = { angle, power, damage, ticks };
    }
  }
  if (!best) throw new Error(`no_${weapon}_opening_shot`);
  record(engine, actions, { type: 'select_weapon', weapon });
  record(engine, actions, { type: 'set_angle', angle: best.angle });
  record(engine, actions, { type: 'set_power', power: best.power });
  if (!record(engine, actions, { type: 'fire' })) throw new Error(`rejected_${weapon}_opening_shot`);
  return settle(engine);
}

function leanArsenalReceipt(seed: number, kind: 'early-kit' | 'conserved-kit'): RouteReceipt {
  const options = quickOperationOptions('lean-arsenal', baseOptions(seed));
  if (options.seed !== seed) throw new Error('unsupported_lean_seed');
  const engine = new GameEngine(options);
  const actions: RecordedAction[] = [];
  // The conserved route spends only on an allowed Level-0 restock before
  // preserving its one heavy opening round. This proves a normal store action
  // remains usable beneath the cap without manufacturing an inventory state.
  if (kind === 'conserved-kit' && !record(engine, actions, { type: 'buy', weapon: 'missile' })) {
    throw new Error('level_zero_restock_rejected');
  }
  let settlementTicks = openingKitShot(engine, actions, kind === 'early-kit' ? 'heavy_missile' : 'baby_missile');
  let turns = 0;
  while (engine.getState().phase !== 'GAME_OVER' && turns < MATCH_TURN_CAP) {
    if (engine.getState().phase === 'ROUND_OVER') {
      record(engine, actions, { type: 'next_round' });
    } else if (engine.getState().phase === 'PLAYER_TURN') {
      settlementTicks += applyPlan(engine, actions);
      turns += 1;
    } else {
      settlementTicks += settle(engine);
    }
  }
  const winner = engine.getState().winner;
  return {
    seed,
    kind,
    achieved: engine.getState().phase === 'GAME_OVER' && winner === 'p1',
    detail: `${kind}; ${turns} completed action turns; armsLevel ${options.armsLevel}; winner ${winner ?? 'draw'}`,
    actions,
    settlementTicks,
    terminalPhase: engine.getState().phase,
    winner,
  };
}

function missedReceipt(seed: number, kind: 'ranging-miss' | 'unchanged-position' | 'lean-defeat'): RouteReceipt {
  const operation = kind === 'ranging-miss' ? 'crosswind-range'
    : kind === 'unchanged-position' ? 'caldera-run' : 'lean-arsenal';
  const engine = new GameEngine(quickOperationOptions(operation, baseOptions(seed)));
  const actions: RecordedAction[] = [];
  let settlementTicks = 0;
  let humanSalvos = 0;
  let turns = 0;
  while (engine.getState().phase !== 'GAME_OVER' && turns < MATCH_TURN_CAP) {
    const state = engine.getState();
    if (state.phase === 'ROUND_OVER') {
      if (!record(engine, actions, { type: 'next_round' })) throw new Error('retry_next_round_rejected');
    } else if (state.activePlayerId === 'p1') {
      const angle = kind === 'unchanged-position' ? 30 : 90;
      const power = kind === 'unchanged-position' ? 100 : 0;
      for (const action of [
        { type: 'select_weapon', weapon: 'baby_missile' },
        { type: 'set_angle', angle }, { type: 'set_power', power }, { type: 'fire' },
      ] satisfies PlayerAction[]) {
        if (!record(engine, actions, action)) throw new Error('retry_human_action_rejected');
      }
      settlementTicks += settle(engine);
      humanSalvos += 1;
      if (kind === 'unchanged-position' || (kind === 'ranging-miss' && humanSalvos === 3)) break;
    } else {
      settlementTicks += applyPlan(engine, actions);
    }
    turns += 1;
  }
  if (kind === 'lean-defeat' && (engine.getState().phase !== 'GAME_OVER' || engine.getState().winner === 'p1')) {
    throw new Error('lean_defeat_not_demonstrated');
  }
  return { seed, kind, achieved: false, actions, settlementTicks,
    detail: `${kind}; ${humanSalvos} legal human salvos; no imposed tank state`,
    terminalPhase: engine.getState().phase, winner: engine.getState().winner };
}

/** Independently replay every recorded route through the actual runtime evidence and reducer. */
function verifyRuntimeOutcome(receipt: RouteReceipt) {
  const operation = ['direct', 'wrap', 'ranging-miss'].includes(receipt.kind) ? 'crosswind-range'
    : ['advance', 'retreat', 'unchanged-position'].includes(receipt.kind) ? 'caldera-run' : 'lean-arsenal';
  const objective = operation === 'crosswind-range' ? 'first-strike'
    : operation === 'caldera-run' ? 'set-the-position' : 'make-it-count';
  const engine = new GameEngine(quickOperationOptions(operation, baseOptions(receipt.seed)));
  let evidence = createPracticeFieldOrderEvidence(engine.getState())!;
  let order = createPracticeFieldOrderById(objective)!;
  const trace = receipt.actions.map(({ action, accepted }, index) => {
    const before = snapshotPracticeFieldOrder(engine.getState());
    const replayAccepted = engine.applyAction(action);
    if (!accepted || !replayAccepted) throw new Error(`illegal_receipt_action:${receipt.kind}:${index}`);
    const after = snapshotPracticeFieldOrder(engine.getState());
    evidence = observePracticeFieldOrderAction(evidence, action, before, after);
    const settlementTicks = settle(engine);
    evidence = settlePracticeFieldOrderEvidence(evidence, engine.getState());
    const observation = practiceFieldOrderObservationFromEvidence(evidence, engine.getState());
    if (!observation) throw new Error('missing_replayed_observation');
    order = observeFieldOrder(order, observation);
    return { index, actor: before.activePlayerId, phaseBefore: before.phase,
      phaseAfterAction: after.phase, phaseAfterSettlement: engine.getState().phase,
      settlementTicks, humanSalvos: evidence.humanSalvos,
      settledHumanDamage: evidence.settledHumanDamage, result: order.result };
  });
  const expected = receipt.achieved ? 'achieved' : 'missed';
  if (order.result?.status !== expected) throw new Error(`runtime_outcome_mismatch:${receipt.kind}:${order.result?.status}`);
  if (engine.getState().phase !== receipt.terminalPhase || engine.getState().winner !== receipt.winner) {
    throw new Error(`runtime_terminal_mismatch:${receipt.kind}`);
  }
  return { operation, objective, expected, actual: order.result, trace };
}

function sharedSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sharedSources(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

const receipts: RouteReceipt[] = [];
for (const seed of SUPPORTED_SEEDS) {
  receipts.push(rangingReceipt(seed, 'direct'), rangingReceipt(seed, 'wrap'));
  receipts.push(positionReceipt(seed, 'advance'), positionReceipt(seed, 'retreat'));
  receipts.push(leanArsenalReceipt(seed, 'early-kit'), leanArsenalReceipt(seed, 'conserved-kit'));
  receipts.push(missedReceipt(seed, 'ranging-miss'), missedReceipt(seed, 'unchanged-position'), missedReceipt(seed, 'lean-defeat'));
}

const report = {
  schemaVersion: 1,
  task: 'P04 tactical challenge feasibility',
  source: {
    baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    identity: 'Base revision plus the following exact UTF-8/LF source fingerprints; base alone does not contain this uncommitted candidate.',
    normalization: 'Decode UTF-8; replace CRLF with LF; hash UTF-8 bytes with unkeyed SHA-256.',
    files: [...sharedSources('shared/src'),
      'tsconfig.base.json', 'client/tsconfig.json',
      'client/src/client/quickOperations.ts', 'client/src/client/fieldOrder.ts',
      'client/src/client/practiceFieldOrder.ts', 'scripts/feasibility/p04TacticalChallengeFeasibility.ts',
    ].sort().map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex') })),
  },
  supportedSeeds: SUPPORTED_SEEDS,
  constraints: [
    'ordinary GameEngine PlayerActions only',
    'exact resolved P04 Quick Operation options and descriptor seed only',
    'success damage is the settled human.totalDamage delta (effective opponent damage)',
    'no state mutation or test-only loadout',
    'Quick Duel two-seat Medium CPU roster',
    'bounded angle/power grids and a 64-turn match cap',
  ],
  receipts: receipts.map(receipt => ({ ...receipt, runtimeVerification: verifyRuntimeOutcome(receipt) })),
  allExpectedOutcomesVerified: true,
};

mkdirSync('docs/feasibility', { recursive: true });
writeFileSync(join('docs', 'feasibility', 'p04-tactical-challenges-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ allExpectedOutcomesVerified: report.allExpectedOutcomesVerified, receipts: receipts.map(({ seed, kind, achieved, detail }) => ({ seed, kind, achieved, detail })) }, null, 2));
