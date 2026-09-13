// P13 deterministic balance-and-pacing baseline contract.
//
// Proves that the versioned corpus is reproducible, reports its limits honestly,
// and refuses incomplete tuning records. Run with:
//   npx tsx scripts/checks/balance_pacing.mjs

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const corpusUrl = new URL('../balance/p13BalanceCorpus.ts', import.meta.url);
const jsonUrl = new URL('../../docs/balance/p13-v1.json', import.meta.url);
const htmlUrl = new URL('../../docs/balance/p13-v1.html', import.meta.url);

// Bootstrap check only: this establishes the contract owner before the behavior
// assertions below run. The controlled metric and invalid-record checks are the
// causal P13 oracles.
assert.ok(existsSync(corpusUrl), 'P13 corpus module must exist');

const {
  P13_CORPUS_VERSION,
  P13_POLICY_VERSION,
  P13_RULESET_VERSION,
  REQUIRED_MECHANISMS,
  deriveInspectionFlags,
  renderP13Report,
  runP13BalanceCorpus,
  validateP13Dataset,
} = await import(corpusUrl.href);

// P13-AC1: generation is repeatable and its declared inputs/version survive in
// each observation. Fixtures remain generated evidence, not a second oracle.
const first = runP13BalanceCorpus();
const second = runP13BalanceCorpus();
assert.deepEqual(second, first, 'the same P13 source inputs must reproduce byte-identically');
assert.equal(first.corpusVersion, P13_CORPUS_VERSION);
assert.equal(first.rulesetVersion, P13_RULESET_VERSION);
assert.equal(first.policyVersion, P13_POLICY_VERSION);
assert.equal(first.observations.length, 16, 'eight scenarios must run for both pinned seeds');
for (const observation of first.observations) {
  assert.equal(observation.corpusVersion, P13_CORPUS_VERSION);
  assert.equal(observation.rulesetVersion, P13_RULESET_VERSION);
  assert.equal(observation.policyVersion, P13_POLICY_VERSION);
  assert.equal(observation.executionMode, 'offline-engine', 'the corpus execution context must be explicit');
  assert.equal(observation.resolvedOptions.gravity, 0.15, 'effective gravity must be explicit');
  assert.equal(observation.resolvedOptions.maxWind, 10, 'effective wind cap must be explicit');
  assert.ok(['open', 'wrap'].includes(observation.resolvedOptions.walls), 'effective wall mode must be explicit');
  assert.ok(['none', 'lava'].includes(observation.resolvedOptions.hazards), 'effective hazard mode must be explicit');
  assert.equal(observation.resolvedOptions.interestRate, 0, 'effective interest must be explicit');
  assert.ok(observation.inputProvenance.sha256.length === 64, 'source input hash is required');
  assert.ok(observation.inputProvenance.files.includes('scripts/balance/p13BalanceCorpus.ts'), 'provenance must include the corpus runner');
  assert.ok(observation.inputProvenance.files.includes('client/src/client/quickOperations.ts'), 'provenance must include operation composition');
  assert.ok(observation.inputProvenance.files.includes('shared/src/engine/AI.ts'), 'provenance must include AI policy source');
  assert.ok(observation.inputProvenance.files.includes('shared/src/engine/GameEngine.ts'), 'provenance must include engine source');
  assert.ok(observation.inputProvenance.files.includes('shared/src/engine/Physics.ts'), 'provenance must include physics source');
  assert.ok(observation.inputProvenance.files.includes('shared/src/engine/Terrain.ts'), 'provenance must include terrain source');
  assert.ok(observation.inputProvenance.files.includes('shared/src/engine/WeaponSystem.ts'), 'provenance must include weapon source');
  assert.ok(observation.inputProvenance.files.every((path) => !path.includes('\\')), 'provenance paths must be platform-neutral');
  assert.ok(observation.trace.length > 0, 'every observation needs an inspectable action trace');
  assert.ok(observation.trace.every((entry) => entry.actions.every(({ action }) => typeof action.type === 'string')), 'trace must retain full committed action payloads');
  assert.equal(observation.policyIterationCounts.ai + observation.policyIterationCounts['scripted-mechanism'] + observation.transitionIterations, observation.policyIterations);
  assert.equal(observation.completedTurns + observation.neutralPreparationIterations + observation.incompleteActionIterations + observation.settlementCapIterations + observation.transitionIterations, observation.policyIterations, 'completed turns, preparation, incomplete actions, settlement caps, and round transitions must partition iterations');
  assert.equal(observation.trace.length, observation.policyIterations, 'every policy iteration must have a trace entry');

  const reduced = observation.trace.reduce((metrics, entry) => {
    metrics.simulationTicks += entry.settlementTicks;
    metrics.maxSettlementTicks = Math.max(metrics.maxSettlementTicks, entry.settlementTicks);
    if (entry.iterationKind === 'completed-turn') {
      assert.equal(entry.completedTurn, true, 'completed-turn entries must advance gameplay');
      metrics.completedTurns += 1;
      metrics.nonDamagingStreak = entry.damageDelta > 0 ? 0 : metrics.nonDamagingStreak + 1;
      metrics.maxNonDamagingStreak = Math.max(metrics.maxNonDamagingStreak, metrics.nonDamagingStreak);
    } else {
      assert.equal(entry.completedTurn, false, 'non-completed trace classes must not inflate completed turns');
      if (entry.iterationKind === 'neutral-preparation') metrics.neutralPreparationIterations += 1;
      if (entry.iterationKind === 'incomplete-action') metrics.incompleteActionIterations += 1;
      if (entry.iterationKind === 'settlement-cap') metrics.settlementCapIterations += 1;
      if (entry.iterationKind === 'round-transition') metrics.transitionIterations += 1;
    }
    if (entry.policyKind === 'ai' || entry.policyKind === 'scripted-mechanism') metrics.policyIterationCounts[entry.policyKind] += 1;
    for (const { action, accepted } of entry.actions) {
      if (action.type === 'buy') {
        metrics.purchases.attempted += 1;
        if (accepted) metrics.purchases.accepted += 1;
      }
    }
    const selectedWeapon = [...entry.actions].reverse().find(({ action, accepted }) => accepted && action.type === 'select_weapon')?.action;
    if (entry.actions.some(({ action, accepted }) => accepted && action.type === 'fire') && selectedWeapon?.type === 'select_weapon') {
      metrics.weaponUses[selectedWeapon.weapon] = (metrics.weaponUses[selectedWeapon.weapon] ?? 0) + 1;
    }
    if (entry.actions.some(({ action, accepted }) => accepted && action.type === 'use_shield')) {
      metrics.weaponUses.shield = (metrics.weaponUses.shield ?? 0) + 1;
    }
    return metrics;
  }, {
    completedTurns: 0,
    neutralPreparationIterations: 0,
    incompleteActionIterations: 0,
    settlementCapIterations: 0,
    transitionIterations: 0,
    simulationTicks: 0,
    maxSettlementTicks: 0,
    nonDamagingStreak: 0,
    maxNonDamagingStreak: 0,
    policyIterationCounts: { ai: 0, 'scripted-mechanism': 0 },
    purchases: { attempted: 0, accepted: 0 },
    weaponUses: {},
  });
  assert.equal(observation.completedTurns, reduced.completedTurns, 'completed turn aggregate must derive from trace');
  assert.equal(observation.neutralPreparationIterations, reduced.neutralPreparationIterations, 'neutral-preparation aggregate must derive from trace');
  assert.equal(observation.incompleteActionIterations, reduced.incompleteActionIterations, 'incomplete-action aggregate must derive from trace');
  assert.equal(observation.settlementCapIterations, reduced.settlementCapIterations, 'settlement-cap aggregate must derive from trace');
  assert.equal(observation.transitionIterations, reduced.transitionIterations, 'round-transition aggregate must derive from trace');
  assert.equal(observation.simulationTicks, reduced.simulationTicks, 'simulation tick aggregate must derive from trace');
  assert.equal(observation.maxSettlementTicks, reduced.maxSettlementTicks, 'maximum settlement aggregate must derive from trace');
  assert.equal(observation.maxNonDamagingStreak, reduced.maxNonDamagingStreak, 'non-damaging streak must exclude preparation and incomplete actions');
  assert.deepEqual(observation.policyIterationCounts, reduced.policyIterationCounts, 'policy iteration counts must derive from trace');
  assert.deepEqual(observation.purchases, { ...reduced.purchases, rejected: reduced.purchases.attempted - reduced.purchases.accepted }, 'purchase aggregates must derive from trace');
  assert.deepEqual(observation.weaponUses, reduced.weaponUses, 'accepted weapon uses must derive from trace');
  const topUses = Math.max(0, ...Object.values(reduced.weaponUses));
  assert.equal(observation.topStrategyShare, reduced.completedTurns === 0 ? 0 : topUses / reduced.completedTurns, 'strategy share must derive from accepted completed-turn trace data');
}
assert.equal(first.observations.find((observation) => observation.scenarioId === 'crosswind-medium')?.resolvedOptions.walls, 'wrap');
assert.equal(first.observations.find((observation) => observation.scenarioId === 'caldera-medium')?.resolvedOptions.hazards, 'lava');
assert.equal(first.observations.find((observation) => observation.scenarioId === 'siege-hard')?.resolvedOptions.suddenDeathTurn, 12);
assert.equal(first.observations.find((observation) => observation.scenarioId === 'team-hard')?.resolvedOptions.teamMode, true);

// P13-AC3: the generator can disclose missing coverage diagnostically, while
// this pinned baseline requires every named mechanism to execute.
assert.deepEqual(Object.keys(first.mechanismCoverage).sort(), [...REQUIRED_MECHANISMS].sort());
for (const mechanism of REQUIRED_MECHANISMS) {
  const coverage = first.mechanismCoverage[mechanism];
  assert.equal(coverage.status, 'executed', `${mechanism} must execute in the pinned baseline`);
  assert.ok(coverage.observationIds.length > 0, `${mechanism} needs inspectable accepted observations`);
}
assert.equal(first.mechanismCoverage.restrictedArsenalRestock.status, 'executed', 'restricted-restock baseline must exercise the accepted engine buy after its disclosed setup');
const restockObservation = first.observations.find((observation) => observation.scenarioId === 'restricted-restock');
const restockPreparation = restockObservation?.trace.find((entry) => entry.actions.some(({ action, accepted }) => accepted && action.type === 'buy' && action.weapon === 'missile'));
assert.ok(restockPreparation, 'restricted-restock needs an accepted buy trace');
assert.equal(restockPreparation.completedTurn, false, 'a buy-only preparation must not be counted as a completed turn');
assert.equal(restockPreparation.iterationKind, 'neutral-preparation', 'a buy-only preparation must be identified separately');
assert.ok((restockObservation?.neutralPreparationIterations ?? 0) > 0, 'neutral preparation count must preserve the buy-only iteration');
assert.ok(
  first.observations.some((observation) => observation.scenarioId === 'team-hard' && observation.mechanisms.teamTargeting?.accepted),
  'team coverage requires the controlled exported-AI probe to select its declared enemy-target signal',
);
assert.ok(
  first.observations.some((observation) => observation.scenarioId === 'siege-hard'
    && observation.roundTransitions > 0
    && observation.trace.some((entry) => entry.effectiveGravity > 0.15)),
  'siege coverage requires both an actual round transition and observed gravity escalation',
);
assert.ok(
  first.observations.some((observation) => observation.scenarioId === 'caldera-medium'
    && observation.mechanisms.terrain?.accepted
    && observation.trace.some((entry) => entry.completedTurn && entry.settlementTicks > 0 && entry.terrainVersionDelta > 0)),
  'terrain coverage requires a completed traced production shot that mutates terrain',
);
assert.ok(
  first.observations.some((observation) => observation.scenarioId === 'shield-first' && observation.shieldActivations > 0),
  'shield count must include an accepted activation',
);
assert.ok(
  first.observations.some((observation) => observation.scenarioId === 'battery-range'
    && observation.mechanisms.battery?.accepted
    && (observation.mechanisms.battery.appliedPower ?? 0) > 100
    && observation.mechanisms.battery.fireAccepted),
  'Battery coverage requires an accepted buy, over-cap applied power, and accepted fire',
);
assert.deepEqual(
  deriveInspectionFlags({ termination: 'turn_cap', maxNonDamagingStreak: 7, maxSettlementTicks: 2500, topStrategyShare: 0.8, completedTurns: 8 }),
  ['incomplete_turn_cap', 'long_non_damaging_streak', 'long_resolution', 'concentrated_strategy'],
);

// P13-AC2: preserve the evidence boundary in rendered player-readable output.
const report = renderP13Report(first);
assert.match(report, /do not establish human enjoyment, retention, or unbiased balance/i);
assert.match(report, /scripted-mechanism/i);

// P13-AC4: baseline makes no tuning claim, and future proposals cannot omit the
// player problem, observation references, or actual proposed change.
assert.doesNotThrow(() => validateP13Dataset(first));
assert.deepEqual(first.tuningCandidates, [], 'the first P13 dataset must not tune from bot-only evidence');
assert.match(first.tuningDecision, /no tuning is proposed from bot-only evidence/i);
assert.throws(
  () => validateP13Dataset({ ...first, tuningCandidates: [{ observationIds: ['standard-medium:17'], proposedChange: 'Lower gravity' }] }),
  /playerProblem/,
);
assert.throws(
  () => validateP13Dataset({ ...first, tuningCandidates: [{ playerProblem: 'Shots resolve slowly', observationIds: [], proposedChange: 'Lower gravity' }] }),
  /observationIds/,
);
assert.throws(
  () => validateP13Dataset({ ...first, tuningCandidates: [{ playerProblem: 'Shots resolve slowly', observationIds: ['does-not-exist'], proposedChange: 'Lower gravity' }] }),
  /observationIds/,
);
assert.throws(
  () => validateP13Dataset({ ...first, tuningCandidates: [{ playerProblem: 'Shots resolve slowly', observationIds: ['standard-medium:17'] }] }),
  /proposedChange/,
);
assert.throws(
  () => validateP13Dataset({ ...first, mechanismCoverage: { ...first.mechanismCoverage, battery: { status: 'missing', observationIds: [] } } }),
  /battery/,
);

assert.deepEqual(JSON.parse(await readFile(jsonUrl, 'utf8')), first, 'pinned JSON must match generated corpus');
assert.equal(await readFile(htmlUrl, 'utf8'), report, 'pinned HTML must match generated report');

console.log(JSON.stringify({
  kind: 'balance-pacing-pass',
  corpusVersion: P13_CORPUS_VERSION,
  observations: first.observations.length,
  mechanisms: Object.keys(first.mechanismCoverage).length,
}));
