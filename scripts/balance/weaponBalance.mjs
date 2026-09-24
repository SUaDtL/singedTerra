/**
 * WB-01: development-only, single-salvo experiments against the real engine.
 * Run through scripts/balance/run.mjs with node --import tsx. No runtime imports.
 * Fixture ammunition is granted on disposable clones, never on the source engine.
 */
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts';
import { surfaceAt } from '../../shared/src/engine/Terrain.ts';
import { searchShot } from '../../shared/src/engine/AiShotSearch.ts';

export const BALANCE_VERSION = 1;
export const DEFAULT_TICK_LIMIT = 2048;
export const WEAPON_IDS = Object.freeze([
  'baby_missile', 'missile', 'heavy_missile', 'nuke', 'cluster_bomb',
  'bouncing_betty', 'sandhog', 'riot_bomb', 'napalm', 'dirt_bomb', 'tracer',
]);
const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8cf4d'];

/** Stock seeded terrain/positions unless synthetic coordinates are disclosed. */
export const SCENARIOS = Object.freeze([
  { id: 'open-42', seed: 42, walls: 'open', falloff: 'decisive' },
  { id: 'open-7', seed: 7, walls: 'open', falloff: 'decisive' },
  { id: 'linear-42', seed: 42, walls: 'open', falloff: 'linear' },
  { id: 'wrap-13', seed: 13, walls: 'wrap', falloff: 'decisive' },
  { id: 'reflective-7', seed: 7, walls: 'reflective', falloff: 'decisive' },
  { id: 'shield-7', seed: 7, walls: 'open', falloff: 'decisive', shield: 'shield' },
  { id: 'heavy-shield-42', seed: 42, walls: 'open', falloff: 'decisive', shield: 'heavy_shield' },
  { id: 'four-seat-42', seed: 42, walls: 'open', falloff: 'decisive', seats: 4 },
  { id: 'teams-42', seed: 42, walls: 'open', falloff: 'decisive', seats: 4, teams: true },
  { id: 'near-calm', seed: 0x5eed1234, walls: 'open', falloff: 'decisive',
    synthetic: { positions: [190, 480], wind: 0 } },
].map((scenario) => Object.freeze(scenario)));

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
  }
}

/** Build a known corpus entry; return the actual starting state for disclosure. */
export function makeScenario(id) {
  const definition = SCENARIOS.find((scenario) => scenario.id === id);
  if (!definition) throw new Error(`Unknown balance scenario: ${id}`);
  const seats = definition.seats ?? 2;
  const options = {
    maxPlayers: seats, players: PALETTE.slice(0, seats).map((color, i) => ({ name: `P${i + 1}`, color })),
    seed: definition.seed, walls: definition.walls, maxWind: 10, gravity: 0.15,
    rounds: 1, armsLevel: 4, rulesetVersion: 4,
    starterWeaponFalloff: definition.falloff, teamMode: definition.teams ?? false,
  };
  const engine = new GameEngine(options);
  const preparation = [];
  if (definition.synthetic) {
    engine.getState().tanks.forEach((tank, i) => {
      tank.x = definition.synthetic.positions[i];
      tank.y = surfaceAt(engine.getState().terrain, tank.x);
    });
    engine.getState().wind = definition.synthetic.wind;
  }
  // Give every seat its ordinary shield action, returning control to P1.
  if (definition.shield) {
    for (let i = 0; i < seats; i += 1) {
      const actorId = engine.getState().activePlayerId;
      if (!engine.applyAction({ type: 'use_shield', weapon: definition.shield })) {
        throw new Error(`Rejected ${definition.shield} preparation for ${id}`);
      }
      preparation.push({ actorId, type: 'use_shield', weapon: definition.shield });
    }
  }
  return { engine, definition, options, preparation };
}

function tankRecord(tank) {
  return {
    id: tank.id, team: tank.team ?? null, health: tank.health, shieldHp: tank.shieldHp,
    alive: tank.alive, buried: tank.buried, x: tank.x, y: tank.y,
    credits: tank.credits, totalDamage: tank.totalDamage, kills: tank.kills,
  };
}

export function startingState(engine) {
  const state = engine.getState();
  return { turn: state.turn, round: state.round, activePlayerId: state.activePlayerId,
    wind: state.wind, walls: state.walls, tanks: state.tanks.map(tankRecord) };
}

/**
 * Only settled single-round results are measurable here. Classic GAME_OVER is
 * authoritative even when the engine cancels remaining effects on elimination.
 * A cap hit is explicitly unresolved, not a miss or a partially scored result.
 */
export function sampleShot(source, weapon, aim, { tickLimit = DEFAULT_TICK_LIMIT, terrain = false } = {}) {
  integer(tickLimit, 1, 20000, 'tickLimit');
  const initial = source.getState();
  if (initial.totalRounds !== 1 || initial.campaign || initial.phase !== 'PLAYER_TURN') {
    throw new Error('Balance probes require an actionable single-round classic engine');
  }
  const actor = initial.tanks.find((tank) => tank.id === initial.activePlayerId);
  if (!actor?.alive || actor.buried) throw new Error('Probe actor cannot act');
  const def = WEAPONS[weapon];
  if (!def?.implemented || def.behavior?.shield) throw new Error(`Not a fireable weapon: ${weapon}`);
  integer(aim.angle, 0, 180, 'angle');
  integer(aim.power, 0, actor.powerCap, 'power');
  const engine = source.clone();
  const state = engine.getState();
  const shooter = state.tanks.find((tank) => tank.id === actor.id);
  // Controlled one-shot stock. Basic-shell unlimited status is retained.
  shooter.inventory[weapon] = weapon === 'baby_missile'
    ? { count: 0, unlimited: true } : { count: 1, unlimited: false };
  const before = state.tanks.map(tankRecord);
  for (const action of [
    { type: 'select_weapon', weapon }, { type: 'set_angle', angle: aim.angle },
    { type: 'set_power', power: aim.power }, { type: 'fire' },
  ]) {
    if (!engine.applyAction(action)) throw new Error(`Rejected probe action: ${action.type}`);
  }
  let ticks = 0;
  let burnTicks = 0;
  let peakProjectiles = state.projectiles.length;
  const walls = new Set();
  while (state.phase === 'FIRING' || state.phase === 'RESOLVING') {
    if (ticks === tickLimit) return { status: 'unresolved', weapon, angle: aim.angle, power: aim.power, ticks };
    engine.tick();
    ticks += 1;
    if (state.fire.length > 0) burnTicks += 1;
    peakProjectiles = Math.max(peakProjectiles, state.projectiles.length);
    for (const hit of state.wallImpacts) walls.add(hit.id);
  }
  if (!['PLAYER_TURN', 'GAME_OVER'].includes(state.phase) || state.round !== initial.round
    || state.projectiles.length || state.fire.length) {
    throw new Error('Probe did not end at the supported classic settlement boundary');
  }
  const tankEffects = before.map((old) => {
    const tank = state.tanks.find((entry) => entry.id === old.id);
    const relation = old.id === actor.id ? 'self'
      : (actor.team === 1 || actor.team === 2) && actor.team === tank.team ? 'ally' : 'enemy';
    return { id: old.id, relation,
      hullLost: Math.max(0, old.health - tank.health), shieldLost: Math.max(0, old.shieldHp - tank.shieldHp),
      killed: old.alive && !tank.alive, buried: tank.buried,
      deltaX: tank.x - old.x, deltaY: tank.y - old.y,
    };
  });
  const sum = (relation, field) => tankEffects.filter((tank) => tank.relation === relation)
    .reduce((total, tank) => total + Number(tank[field]), 0);
  const nominalAmmoCost = weapon === 'baby_missile' ? 0 : def.price / def.bundleSize;
  const result = { status: 'settled', weapon, angle: aim.angle, power: aim.power, ticks, simulatedMs: ticks * 16,
    phase: state.phase, winner: state.winner, wallContacts: walls.size, burnTicks, peakProjectiles,
    enemyHullLost: sum('enemy', 'hullLost'), enemyShieldLost: sum('enemy', 'shieldLost'),
    selfHullLost: sum('self', 'hullLost'), allyHullLost: sum('ally', 'hullLost'),
    enemyKills: sum('enemy', 'killed'), enemyBuried: sum('enemy', 'buried'),
    creditedDamage: shooter.totalDamage - actor.totalDamage,
    creditedKills: shooter.kills - actor.kills, creditsEarned: shooter.credits - actor.credits,
    ammoConsumed: weapon === 'baby_missile' ? 0 : 1 - shooter.inventory[weapon].count,
    nominalAmmoCost, nominalNetCredits: shooter.credits - actor.credits - nominalAmmoCost,
    tankEffects };
  if (terrain) {
    let removed = 0;
    let added = 0;
    let changed = 0;
    for (let i = 0; i < initial.terrain.length; i += 1) {
      const old = initial.terrain[i];
      const next = state.terrain[i];
      if (old !== next) changed += 1;
      if (old !== 0 && next === 0) removed += 1;
      if (old === 0 && next !== 0) added += 1;
    }
    result.terrain = { changedPixels: changed, solidToAirPixels: removed, airToSolidPixels: added };
  }
  return result;
}

// This is a declared diagnostic aim-selection policy, not a weapon tier score.
export function compareSamples(a, b) {
  return b.enemyHullLost - a.enemyHullLost || b.enemyShieldLost - a.enemyShieldLost
    || b.enemyBuried - a.enemyBuried || (a.selfHullLost + a.allyHullLost) - (b.selfHullLost + b.allyHullLost)
    || a.angle - b.angle || a.power - b.power;
}

function axis(max, step) {
  const values = [];
  for (let value = 0; value <= max; value += step) values.push(value);
  if (values.at(-1) !== max) values.push(max);
  return values;
}

/** Equal coarse grids and two bounded refinement neighborhoods for every weapon. */
export function searchWeapon(engine, weapon, { angleStep = 10, powerStep = 20,
  tickLimit = DEFAULT_TICK_LIMIT } = {}) {
  integer(angleStep, 1, 90, 'angleStep');
  integer(powerStep, 1, 100, 'powerStep');
  if ((Math.ceil(180 / angleStep) + 1) * (Math.ceil(100 / powerStep) + 1) > 1000) {
    throw new RangeError('Coarse grid exceeds the 1000-candidate per-weapon budget');
  }
  const results = new Map();
  let unresolved = 0;
  const probe = (angle, power) => {
    if (angle < 0 || angle > 180 || power < 0 || power > 100) return;
    const key = `${angle}:${power}`;
    if (results.has(key)) return;
    const sample = sampleShot(engine, weapon, { angle, power }, { tickLimit });
    results.set(key, sample);
    if (sample.status === 'unresolved') unresolved += 1;
  };
  for (const angle of axis(180, angleStep)) for (const power of axis(100, powerStep)) probe(angle, power);
  const ordered = () => [...results.values()].filter((sample) => sample.status === 'settled').sort(compareSamples);
  // The existing missile proxy proposes additional coordinates, never scores
  // weapon results. This prevents narrow direct-hit basins being missed by the
  // coarse grid while both firing directions still receive the equal grid.
  const state = engine.getState();
  const actor = state.tanks.find((tank) => tank.id === state.activePlayerId);
  const rangingProposals = [];
  for (const target of state.tanks) {
    if (!target.alive || target.id === actor.id
      || ((actor.team === 1 || actor.team === 2) && target.team === actor.team)) continue;
    const proposal = searchShot(state, actor, target, 'hard', engine.getEffectiveGravity());
    if (proposal.shot) {
      const { angle, power } = proposal.shot;
      rangingProposals.push({ targetId: target.id, angle, power, proxyProbes: proposal.probes });
      probe(angle, power);
    }
  }
  const anchors = ordered().slice(0, 2);
  for (const anchor of anchors) {
    for (let da = -6; da <= 6; da += 2) {
      for (let dp = -10; dp <= 10; dp += 5) probe(anchor.angle + da, anchor.power + dp);
    }
  }
  const best = ordered()[0];
  if (!best) return { probes: results.size, unresolved, rangingProposals, best: null, tolerance: null };
  // Boundary cells are omitted, not clamped/duplicated. Each result discloses N.
  const neighborhood = [];
  for (const da of [-1, 0, 1]) for (const dp of [-2, 0, 2]) {
    const angle = best.angle + da;
    const power = best.power + dp;
    if (angle < 0 || angle > 180 || power < 0 || power > 100) continue;
    neighborhood.push(sampleShot(engine, weapon, { angle, power }, { tickLimit }));
  }
  const settled = neighborhood.filter((sample) => sample.status === 'settled');
  const losses = settled.map((sample) => sample.enemyHullLost);
  return { probes: results.size, unresolved, rangingProposals,
    best: sampleShot(engine, weapon, best, { tickLimit, terrain: true }),
    tolerance: { total: neighborhood.length, settled: settled.length,
      unresolved: neighborhood.length - settled.length,
      damaging: losses.filter((loss) => loss > 0).length,
      meanEnemyHullLost: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null,
      minEnemyHullLost: losses.length ? Math.min(...losses) : null,
      samples: neighborhood.map(({ status, angle, power, enemyHullLost, selfHullLost, allyHullLost }) => (
        { status, angle, power, enemyHullLost, selfHullLost, allyHullLost }
      )) } };
}

export function runBalance({ scenarioIds = SCENARIOS.map(({ id }) => id), weaponIds = WEAPON_IDS,
  search = {}, onProgress = () => {} } = {}) {
  if (!scenarioIds.length || !weaponIds.length || new Set(scenarioIds).size !== scenarioIds.length
    || new Set(weaponIds).size !== weaponIds.length) throw new Error('Select nonempty, unique scenarios and weapons');
  for (const weapon of weaponIds) if (!WEAPON_IDS.includes(weapon)) throw new Error(`Unknown study weapon: ${weapon}`);
  const rows = [];
  const scenarios = [];
  for (const id of scenarioIds) {
    const scenario = makeScenario(id);
    scenarios.push({ id, options: scenario.options, preparation: scenario.preparation,
      synthetic: scenario.definition.synthetic ?? null, start: startingState(scenario.engine) });
    for (const weapon of weaponIds) {
      rows.push({ scenario: id, weapon, ...searchWeapon(scenario.engine, weapon, search) });
      onProgress(id, weapon);
    }
  }
  return { schemaVersion: BALANCE_VERSION, scenarios,
    method: { angleStep: search.angleStep ?? 10, powerStep: search.powerStep ?? 20,
      tickLimit: search.tickLimit ?? DEFAULT_TICK_LIMIT, angleDomain: [0, 180], powerDomain: [0, 100], refinementAnchors: 2,
      refinementAngleOffsets: [-6, -4, -2, 0, 2, 4, 6], refinementPowerOffsets: [-10, -5, 0, 5, 10],
      toleranceAngleOffsets: [-1, 0, 1], tolerancePowerOffsets: [-2, 0, 2],
      rangingProposals: 'existing hard missile-proxy search per enemy, rescored only by the actual weapon',
      selection: 'hull loss, shield loss, burial, lower self/ally hull loss, lower angle, lower power',
      limitations: ['Single salvo; no opponent reply or match win-rate model.',
        'Finite ammunition is granted on isolated clones; prices are nominal bundle fractions, not purchases.',
        'Tolerance is an equal-weight neighborhood, not measured human input error.',
        'Timeouts are unresolved and excluded from ranking/means; counts remain explicit.',
        'Terminal elimination follows current classic cancellation semantics.',
        'Terrain occupancy differences include collapse, not just excavation; deltaY is not damage attribution.',
        'No global tier score; damage-led search undervalues utility and does not prove an optimum.'] },
    catalog: Object.fromEntries(weaponIds.map((id) => [id, { ...structuredClone(WEAPONS[id]),
      nominalAmmoCost: id === 'baby_missile' ? 0 : WEAPONS[id].price / WEAPONS[id].bundleSize }])), rows };
}
