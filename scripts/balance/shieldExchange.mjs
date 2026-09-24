/**
 * WB-02: shield-first versus fire-first over two commitments per seat.
 * Development-only; run via scripts/balance/run.mjs --study=shield-exchange.
 * Actual GameEngine actions own purchases, damage, turns and terminal state.
 */
import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts';
import { makeScenario, searchWeapon, startingState, DEFAULT_TICK_LIMIT } from './weaponBalance.mjs';

export const EXCHANGE_SCENARIOS = Object.freeze(['open-42', 'open-7', 'wrap-13']);
export const EXCHANGE_WEAPONS = Object.freeze(['missile', 'heavy_missile', 'sandhog']);
export const EXCHANGE_STRATEGIES = Object.freeze(['fire-first', 'shield-first', 'heavy-shield-first']);
export const EXCHANGE_KITS = Object.freeze(['stock', 'depleted-30k']);
const COMMITMENTS_PER_SEAT = 2;
const REPLENISHMENT_CREDITS = 30_000;

function member(value, choices, name) {
  if (!choices.includes(value)) throw new Error(`Unknown ${name}: ${value}`);
}

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
  }
}

function stateRecord(engine) {
  const record = startingState(engine);
  return {
    ...record,
    phase: engine.getState().phase,
    tanks: record.tanks.map((tank) => ({
      ...tank,
      inventory: structuredClone(engine.getState().tanks.find(({ id }) => id === tank.id).inventory),
    })),
  };
}

/** Only this constructor grants the declared experimental replenishment state. */
export function makeExchangeFixture(scenarioId, kit = 'stock') {
  member(scenarioId, EXCHANGE_SCENARIOS, 'exchange scenario');
  member(kit, EXCHANGE_KITS, 'exchange kit');
  const fixture = makeScenario(scenarioId);
  if (kit === 'depleted-30k') {
    for (const tank of fixture.engine.getState().tanks) {
      tank.credits = REPLENISHMENT_CREDITS;
      for (const ammo of Object.values(tank.inventory)) if (!ammo.unlimited) ammo.count = 0;
    }
  }
  return {
    ...fixture, kit,
    synthetic: kit === 'stock' ? null : {
      creditsPerSeat: REPLENISHMENT_CREDITS,
      finiteStockPerWeapon: 0,
      note: 'Controlled replenishment checkpoint, not a naturally reached match state. Basic shell stays unlimited.',
    },
  };
}

function hasAmmo(tank, weapon) {
  const ammo = tank.inventory[weapon];
  return Boolean(ammo && (ammo.unlimited || ammo.count > 0));
}

/** Try one real bundle purchase; do not grant stock or calculate admission ourselves. */
function acquire(engine, weapon, purchases) {
  const state = engine.getState();
  const tank = state.tanks.find(({ id }) => id === state.activePlayerId);
  if (hasAmmo(tank, weapon)) return true;
  const before = { credits: tank.credits, count: tank.inventory[weapon].count };
  const accepted = engine.applyAction({ type: 'buy', weapon });
  const spent = before.credits - tank.credits;
  const granted = tank.inventory[weapon].count - before.count;
  if (state.phase !== 'PLAYER_TURN' || state.activePlayerId !== tank.id
    || (!accepted && (spent !== 0 || granted !== 0))) {
    throw new Error('Purchase violated the turn-neutral/rejection contract');
  }
  purchases.push({ actorId: tank.id, weapon, accepted, spent, granted,
    creditsBefore: before.credits, creditsAfter: tank.credits });
  return accepted && hasAmmo(tank, weapon);
}

function effectRecords(before, after) {
  return before.map((old) => {
    const tank = after.find(({ id }) => id === old.id);
    return { id: old.id, hullLost: Math.max(0, old.health - tank.health),
      shieldChange: tank.shieldHp - old.shieldHp, killed: old.alive && !tank.alive,
      deltaX: tank.x - old.x, deltaY: tank.y - old.y };
  });
}

/**
 * The experimental opponent fires the same requested weapon, greedily aimed by
 * WB-01 on the current state. It is NOT the shipped CPU or a match-win predictor.
 * Fixed aims are an explicit test fixture; their bounds are checked before work.
 * Every execution begins on a clone. Search stock grants never enter this clone.
 */
export function sampleShieldExchange(source, {
  strategy = 'fire-first', weapon = 'missile', subjectId = 'p1',
  tickLimit = DEFAULT_TICK_LIMIT, fixedAim = null,
} = {}) {
  member(strategy, EXCHANGE_STRATEGIES, 'exchange strategy');
  member(weapon, EXCHANGE_WEAPONS, 'exchange weapon');
  member(subjectId, ['p1', 'p2'], 'subject seat');
  integer(tickLimit, 1, 20_000, 'tickLimit');
  const initial = source.getState();
  if (initial.campaign || initial.totalRounds !== 1 || initial.phase !== 'PLAYER_TURN'
    || initial.activePlayerId !== 'p1' || initial.tanks.length !== 2
    || initial.tanks.some((tank, i) => tank.id !== `p${i + 1}` || !tank.alive || tank.buried
      || tank.team === 1 || tank.team === 2 || tank.powerCap !== 100)) {
    throw new Error('Exchange requires an actionable, two-seat, single-round classic checkpoint starting with p1 and power cap 100');
  }
  if (fixedAim !== null) {
    if (!fixedAim || typeof fixedAim !== 'object'
      || Object.keys(fixedAim).sort().join(',') !== 'angle,power') throw new Error('Invalid fixed aim');
    integer(fixedAim.angle, 0, 180, 'angle');
    integer(fixedAim.power, 0, 100, 'power');
  }
  const engine = source.clone();
  const state = engine.getState();
  const start = stateRecord(engine);
  const commitments = { p1: 0, p2: 0 };
  const trace = [];
  const purchases = [];
  const fallbacks = [];
  let shieldActivated = false;
  let simulationTicks = 0;
  let termination = 'horizon';
  let incompleteReason = null;
  const searchWork = { actualEngineProbes: 0, unresolvedCandidates: 0, proxyProbes: 0 };

  for (let step = 0; step < 2 * COMMITMENTS_PER_SEAT; step += 1) {
    if (state.phase === 'GAME_OVER') { termination = 'game_over'; break; }
    const actor = state.tanks.find(({ id }) => id === state.activePlayerId);
    const expectedId = step % 2 === 0 ? 'p1' : 'p2';
    if (!actor?.alive || actor.buried || state.phase !== 'PLAYER_TURN'
      || actor.id !== expectedId || commitments[actor.id] >= COMMITMENTS_PER_SEAT) {
      termination = 'blocked'; incompleteReason = 'unexpected-turn-or-unactionable-seat'; break;
    }
    const before = state.tanks.map((tank) => ({ ...tank }));
    const turn = state.turn;
    const wind = state.wind;
    let actionWeapon = weapon;
    let kind = 'fire';
    const shield = strategy === 'shield-first' ? 'shield' : 'heavy_shield';
    const wantsShield = actor.id === subjectId && commitments[subjectId] === 0 && strategy !== 'fire-first';
    if (wantsShield) {
      if (acquire(engine, shield, purchases)) { kind = 'use_shield'; actionWeapon = shield; }
      else fallbacks.push({ step, actorId: actor.id, requested: shield, reason: 'shield-unavailable', fallback: 'offense' });
    }
    if (kind === 'fire' && !acquire(engine, weapon, purchases)) {
      actionWeapon = 'baby_missile';
      fallbacks.push({ step, actorId: actor.id, requested: weapon, reason: 'restock-rejected', fallback: actionWeapon });
    }
    if (!hasAmmo(actor, actionWeapon)) {
      termination = 'blocked'; incompleteReason = 'no-legal-ammunition'; break;
    }
    let aim = null;
    if (kind === 'fire') {
      if (fixedAim) aim = { ...fixedAim };
      else {
        const search = searchWeapon(engine, actionWeapon, { tickLimit });
        searchWork.actualEngineProbes += search.probes + (search.tolerance?.total ?? 0) + (search.best ? 1 : 0);
        searchWork.unresolvedCandidates += search.unresolved + (search.tolerance?.unresolved ?? 0);
        searchWork.proxyProbes += search.rangingProposals.reduce((total, proposal) => total + proposal.proxyProbes, 0);
        if (!search.best) {
          termination = 'unresolved'; incompleteReason = 'no-settled-aim-candidate'; break;
        }
        aim = { angle: search.best.angle, power: search.best.power };
      }
    }
    const action = kind === 'use_shield' ? { type: 'use_shield', weapon: actionWeapon } : { type: 'fire' };
    if (aim) {
      for (const selection of [{ type: 'select_weapon', weapon: actionWeapon },
        { type: 'set_angle', angle: aim.angle }, { type: 'set_power', power: aim.power }]) {
        if (!engine.applyAction(selection)) throw new Error(`Rejected exchange selection: ${selection.type}`);
      }
    }
    if (!engine.applyAction(action)) throw new Error(`Rejected acquired exchange commitment: ${kind}`);
    commitments[actor.id] += 1;
    if (kind === 'use_shield') shieldActivated = true;
    let ticks = 0;
    while (state.phase === 'FIRING' || state.phase === 'RESOLVING') {
      if (ticks === tickLimit) break;
      engine.tick(); ticks += 1;
    }
    simulationTicks += ticks;
    const settled = state.phase === 'PLAYER_TURN' || state.phase === 'GAME_OVER';
    trace.push({ step, actorId: actor.id, turn, wind, kind, weapon: actionWeapon, aim,
      accepted: true, settled, ticks,
      // Do not present partial physical changes as a settled measurement.
      effects: settled ? effectRecords(before, state.tanks) : null });
    if (!settled) { termination = 'unresolved'; incompleteReason = 'settlement-cap'; break; }
    if (state.round !== initial.round || state.projectiles.length || state.fire.length) {
      throw new Error('Unexpected round reset or live effects at settlement');
    }
    if (state.phase === 'GAME_OVER') { termination = 'game_over'; break; }
  }

  const finish = stateRecord(engine);
  const complete = termination === 'horizon' || termination === 'game_over';
  const summary = complete ? {
    winner: state.winner,
    // A horizon result is censored, not a draw or an inferred win.
    matchFinished: termination === 'game_over',
    tanks: finish.tanks.map((tank, i) => {
      const old = start.tanks[i];
      const spent = purchases.filter(({ actorId }) => actorId === tank.id).reduce((sum, p) => sum + p.spent, 0);
      const used = trace.filter(({ actorId }) => actorId === tank.id);
      return { id: tank.id, hull: tank.health, hullLost: Math.max(0, old.health - tank.health),
        shieldHp: tank.shieldHp, alive: tank.alive,
        commitments: commitments[tank.id], shots: used.filter(({ kind }) => kind === 'fire').length,
        shieldUses: used.filter(({ kind }) => kind === 'use_shield').length,
        spentCredits: spent, earnedCredits: tank.credits - old.credits + spent,
        endingCredits: tank.credits,
        creditedDamage: tank.totalDamage - old.totalDamage, creditedKills: tank.kills - old.kills,
        consumedReplacementValue: used.reduce((sum, { weapon: id }) => sum + (id === 'baby_missile' ? 0 : WEAPONS[id].price / WEAPONS[id].bundleSize), 0) };
    }),
  } : null;
  return { strategy, weapon, subjectId, limits: { commitmentsPerSeat: COMMITMENTS_PER_SEAT, tickLimit }, aimPolicy: fixedAim ? { kind: 'fixed-fixture', ...fixedAim }
    : { kind: 'wb01-greedy-actual-weapon', angleStep: 10, powerStep: 20 },
    termination, incompleteReason, shieldActivated,
    commitments, simulationTicks, searchWork, purchases, fallbacks, start, finish, trace, summary };
}

/** Pair only completed windows; do not collapse survivability and cost into a score. */
export function compareShieldExchange(baseline, candidate) {
  if (!baseline.summary || !candidate.summary) return { status: 'incomplete' };
  if (baseline.strategy !== 'fire-first' || candidate.strategy === 'fire-first'
    || baseline.weapon !== candidate.weapon || baseline.subjectId !== candidate.subjectId
    || JSON.stringify(baseline.start) !== JSON.stringify(candidate.start)
    || JSON.stringify(baseline.aimPolicy) !== JSON.stringify(candidate.aimPolicy)
    || JSON.stringify(baseline.limits) !== JSON.stringify(candidate.limits)) {
    throw new Error('Exchange comparison requires identical inputs and fire-first baseline');
  }
  if (!candidate.shieldActivated) return { status: 'shield-not-executed' };
  const index = candidate.summary.tanks.findIndex(({ id }) => id === candidate.subjectId);
  const current = candidate.summary.tanks[index];
  const prior = baseline.summary.tanks[index];
  return { status: 'compared',
    subjectHullDelta: current.hull - prior.hull,
    opponentHullDelta: candidate.summary.tanks[1 - index].hull - baseline.summary.tanks[1 - index].hull,
    subjectCashDelta: current.endingCredits - prior.endingCredits,
    subjectShotsDelta: current.shots - prior.shots,
    subjectShieldRemaining: current.shieldHp,
    baselineTermination: baseline.termination, candidateTermination: candidate.termination };
}

export function runShieldExchanges({ scenarioIds = EXCHANGE_SCENARIOS, weaponIds = EXCHANGE_WEAPONS,
  onProgress = () => {} } = {}) {
  for (const [ids, choices, name] of [[scenarioIds, EXCHANGE_SCENARIOS, 'exchange scenario'],
    [weaponIds, EXCHANGE_WEAPONS, 'exchange weapon']]) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error(`Select unique nonempty ${name}s`);
    for (const id of ids) member(id, choices, name);
  }
  const fixtures = [];
  const rows = [];
  for (const scenarioId of scenarioIds) for (const kit of EXCHANGE_KITS) {
    const fixture = makeExchangeFixture(scenarioId, kit);
    fixtures.push({ scenarioId, kit, options: fixture.options, synthetic: fixture.synthetic });
    for (const weapon of weaponIds) for (const subjectId of ['p1', 'p2']) {
      let baseline;
      for (const strategy of EXCHANGE_STRATEGIES) {
        const result = sampleShieldExchange(fixture.engine, { strategy, weapon, subjectId });
        if (strategy === 'fire-first') baseline = result;
        rows.push({ scenarioId, kit, ...result,
          comparison: strategy === 'fire-first' ? null : compareShieldExchange(baseline, result) });
      }
      onProgress(scenarioId, `${kit}/${weapon}/${subjectId}`);
    }
  }
  return { schemaVersion: 1, study: 'WB-02-shield-exchange', fixtures,
    method: { commitmentsPerSeat: COMMITMENTS_PER_SEAT, tickLimit: DEFAULT_TICK_LIMIT,
      offense: 'Same requested weapon for both seats; actual stock, then one bundle buy if needed, then basic-shell fallback on refusal.',
      defense: 'Subject replaces its first shot with one normal/heavy shield; refused acquisition falls back to offense and is marked unexecuted.',
      aim: 'Greedy WB-01 search on every changed state. No human-noise or shipped CPU-policy claim.',
      initiative: 'Each strategy is tested as p1 and p2 from the unchanged p1-first checkpoint.',
      limitations: ['Two commitments per seat or true engine terminal; horizon is not a draw or win-rate sample.',
        'Stock is the real opening kit. Depleted-30k clears finite stock and grants equal experimental credits; it is not naturally earned progression.',
        'Purchases use complete bundle prices; unused inventory remains in finish. Replacement value is a separate nominal opportunity measure, not a debit.',
        'No movement, shield refresh, multi-round carry, interest, uncertainty model or campaign behavior.',
        'Search may miss good aims. Unresolved comparisons are not ranked. No shared catalog or CPU policy is modified.'] }, rows };
}
