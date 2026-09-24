/**
 * WB-03: paired counterfactual of free starting Heavy Shield access.
 * Development-only. Uses WB-02's actual-action runner; no live balance changes.
 */
import { isDeepStrictEqual } from 'node:util';
import { makeExchangeFixture, sampleShieldExchange, EXCHANGE_SCENARIOS,
  EXCHANGE_WEAPONS } from './shieldExchange.mjs';

export const OPENING_SHIELD_PROFILES = Object.freeze(['stock', 'no-free-heavy']);
export const OPENING_SHIELD_POLICIES = Object.freeze(['fire-first', 'held-shield-first']);
const COMMITMENTS_PER_SEAT = 4;

/** Remove only the one finite heavy charge on each disposable starting tank. */
export function makeOpeningShieldFixture(scenarioId, profile = 'stock') {
  if (!OPENING_SHIELD_PROFILES.includes(profile)) throw new Error(`Unknown opening profile: ${profile}`);
  const fixture = makeExchangeFixture(scenarioId, 'stock');
  const changes = [];
  for (const tank of fixture.engine.getState().tanks) {
    if (tank.inventory.heavy_shield.unlimited || tank.inventory.heavy_shield.count !== 1
      || tank.inventory.shield.unlimited || tank.inventory.shield.count !== 1 || tank.shieldHp !== 0) {
      throw new Error('Opening-shield experiment needs review: the stock shield contract changed');
    }
    if (profile === 'no-free-heavy') {
      tank.inventory.heavy_shield.count = 0;
      changes.push({ actorId: tank.id, path: 'inventory.heavy_shield.count', before: 1, after: 0 });
    }
  }
  return { ...fixture, profile, changes };
}

function withoutHeavyCounts(record) {
  const copy = structuredClone(record);
  for (const tank of copy.tanks) tank.inventory.heavy_shield.count = 0;
  return copy;
}

/** Compare only pairs with the declared intervention and the same policy. */
export function compareOpeningShield(baseline, candidate) {
  const validStocks = baseline.start.tanks.length === 2 && candidate.start.tanks.length === 2
    && baseline.start.tanks.every((tank, i) => (
      tank.inventory.heavy_shield.count === 1 && !tank.inventory.heavy_shield.unlimited
      && candidate.start.tanks[i].inventory.heavy_shield.count === 0
      && !candidate.start.tanks[i].inventory.heavy_shield.unlimited
    ));
  if (!validStocks || !OPENING_SHIELD_POLICIES.includes(baseline.strategy)
    || baseline.strategy !== candidate.strategy || baseline.weapon !== candidate.weapon
    || baseline.subjectId !== candidate.subjectId
    || !isDeepStrictEqual(baseline.limits, candidate.limits)
    || !isDeepStrictEqual(baseline.aimPolicy, candidate.aimPolicy)
    || !isDeepStrictEqual(withoutHeavyCounts(baseline.start), withoutHeavyCounts(candidate.start))) {
    throw new Error('Opening comparison requires matched inputs differing only in starting Heavy Shield count');
  }
  if (!baseline.summary || !candidate.summary) return { status: 'incomplete' };
  if (baseline.strategy === 'fire-first') {
    // An unused removed item must not change shots, cash, simulation or turn RNG.
    const normalized = (result) => ({ ...result,
      start: withoutHeavyCounts(result.start), finish: withoutHeavyCounts(result.finish) });
    if (!isDeepStrictEqual(normalized(baseline), normalized(candidate))) {
      throw new Error('Negative control changed combat despite never using either shield');
    }
    return { status: 'control-identical' };
  }
  const baselineDefense = baseline.trace.find((event) => event.actorId === baseline.subjectId
    && event.kind === 'use_shield');
  const candidateDefense = candidate.trace.find((event) => event.actorId === candidate.subjectId
    && event.kind === 'use_shield');
  if (!baselineDefense || !candidateDefense) return { status: 'defense-not-executed' };
  if (baselineDefense.weapon !== 'heavy_shield' || candidateDefense.weapon !== 'shield') {
    throw new Error('Opening pair did not execute the declared heavy-versus-normal intervention');
  }
  const index = baseline.summary.tanks.findIndex(({ id }) => id === baseline.subjectId);
  const previous = baseline.summary.tanks[index];
  const current = candidate.summary.tanks[index];
  return { status: 'compared',
    baselineTermination: baseline.termination, candidateTermination: candidate.termination,
    baselineWinner: baseline.summary.winner, candidateWinner: candidate.summary.winner,
    subjectAliveBefore: previous.alive, subjectAliveAfter: current.alive,
    subjectHullDelta: current.hull - previous.hull,
    subjectShieldDelta: current.shieldHp - previous.shieldHp,
    subjectShotsDelta: current.shots - previous.shots,
    subjectCashDelta: current.endingCredits - previous.endingCredits,
    opponentHullDelta: candidate.summary.tanks[1 - index].hull - baseline.summary.tanks[1 - index].hull,
    committedTicksDelta: candidate.simulationTicks - baseline.simulationTicks };
}

export function runOpeningShieldStudy({ scenarioIds = EXCHANGE_SCENARIOS,
  weaponIds = EXCHANGE_WEAPONS, onProgress = () => {} } = {}) {
  for (const [ids, choices, label] of [[scenarioIds, EXCHANGE_SCENARIOS, 'scenario'],
    [weaponIds, EXCHANGE_WEAPONS, 'weapon']]) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length
      || ids.some((id) => !choices.includes(id))) throw new Error(`Select known unique nonempty opening ${label}s`);
  }
  const pairs = [];
  const fixtures = [];
  for (const scenarioId of scenarioIds) {
    const baseline = makeOpeningShieldFixture(scenarioId);
    const candidate = makeOpeningShieldFixture(scenarioId, 'no-free-heavy');
    fixtures.push({ scenarioId, options: baseline.options, intervention: candidate.changes,
      note: 'Counterfactual opening only. All prices, normal-shield stock, hull, credits, terrain and RNG remain stock.' });
    for (const weapon of weaponIds) for (const subjectId of ['p1', 'p2']) {
      for (const strategy of OPENING_SHIELD_POLICIES) {
        const options = { strategy, subjectId, weapon, commitmentsPerSeat: COMMITMENTS_PER_SEAT };
        const stock = sampleShieldExchange(baseline.engine, options);
        const noFreeHeavy = sampleShieldExchange(candidate.engine, options);
        pairs.push({ scenarioId, weapon, subjectId, strategy, stock, noFreeHeavy,
          comparison: compareOpeningShield(stock, noFreeHeavy) });
        onProgress(scenarioId, `${weapon}/${subjectId}/${strategy}`);
      }
    }
  }
  return { schemaVersion: 1, study: 'WB-03-opening-heavy-shield', fixtures,
    method: { commitmentsPerSeat: COMMITMENTS_PER_SEAT,
      profiles: OPENING_SHIELD_PROFILES, policies: OPENING_SHIELD_POLICIES,
      defense: 'Subject first commitment uses the strongest held shield that increases protection; no defensive purchase or refresh. Opponent fires.',
      offense: 'Existing WB-02 runner: real stock/bundle purchases/basic fallback, greedy actual-weapon aim each shot.',
      control: 'Fire-first paired results must be identical except unused Heavy Shield inventory.',
      limitations: ['One candidate, three seeded boards, three weapons; not a player population or global balance ranking.',
        'Four commitments per seat at most; a horizon is censored, not a victory or draw.',
        'Only the subject activates defense. No claims about both players shielding or the shipped CPU.',
        'Damage-led perfect-information search is not measured human skill or win-optimal play.',
        'No movement, multi-round carry, shield refresh, match pacing or player enjoyment measurement.',
        'Failed/unexecuted defense comparisons are excluded explicitly, never counted as a benefit.',
        'Removing a free item changes access, not capacity, purchase price or existing verified rules. Nothing is enabled in the game.'] }, pairs };
}
