// Adversarial determinism check for the singedTerra shared engine.
//
// Runs the same scripted game TWICE with an identical (seed, action-sequence)
// and asserts the serialized final states are byte-identical. Also asserts a
// DIFFERENT seed produces DIFFERENT terrain (so "deterministic" isn't just a
// constant that ignores the seed).
//
// Run: npx tsx scripts/checks/determinism.mjs
//
// tsx executes the .ts source directly, so we import GameEngine straight from
// the shared TypeScript source (no build step required).

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const SEED_A = 0xc0ffee;
const SEED_B = 0xbadbeef; // different terrain expected

// A scripted turn: aim, then fire, then tick to resolution. This (angle, power)
// is deliberately chosen to LAND a terrain hit (not sail out of bounds) so the
// determinism comparison actually exercises the seeded terrain-deform / crater
// path and the explosion event — the highest-risk determinism surface. We assert
// below that an explosion did in fact occur, so the check can't silently regress
// into only testing the trivial out-of-bounds path.
const ACTIONS = [
  { type: 'set_angle', angle: 45 },
  { type: 'set_power', power: 35 },
  { type: 'fire' },
];

const MAX_TICKS = 100_000; // generous safety cap so a stuck shot can't hang us

// terrain is now a Uint8Array pixel bitmap (length 800*500). Hex-encode it for a
// compact, stable string form — JSON.stringify on a 400k-element typed array is
// huge and slow. Buffer is a Node global under tsx.
const terrainHex = (t) => Buffer.from(t).toString('hex');

/**
 * Drive a fresh engine through the scripted actions, then tick until the
 * projectile resolves (engine returns to PLAYER_TURN) or we hit MAX_TICKS.
 * Returns the final GameState.
 */
function runGame(seed) {
  const engine = new GameEngine({ maxPlayers: 2, seed });

  for (const action of ACTIONS) {
    engine.applyAction(action);
  }

  let ticks = 0;
  // After `fire`, phase is FIRING and projectile is non-null. tick() resolves
  // back to PLAYER_TURN with projectile === null on impact / OOB.
  while ((engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') && ticks < MAX_TICKS) {
    engine.tick();
    ticks++;
  }

  return { state: engine.getState(), ticks };
}

/**
 * Canonical, stable string serialization of the parts of GameState that the
 * physics/engine determinism claim covers: terrain, tank positions/aim/state,
 * the projectile, phase, and the explosion event. Object key order is fixed
 * here (not reliant on engine insertion order) so the comparison is robust.
 */
function serialize(state) {
  // Include EVERY engine-computed TankState field, not just position/aim. The
  // economy/scoreboard/shield/burial sprints added fields (powerCap, shieldHp,
  // credits, inventory, fuel, kills, totalDamage, roundWins, buried, buriedTurns)
  // that are part of the determinism claim; omitting them let a divergence in any
  // of them pass the byte-comparison silently.
  const tanks = state.tanks.map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    angle: t.angle,
    power: t.power,
    powerCap: t.powerCap,
    health: t.health,
    fuel: t.fuel,
    alive: t.alive,
    shieldHp: t.shieldHp,
    credits: t.credits,
    inventory: t.inventory,
    roundWins: t.roundWins,
    kills: t.kills,
    totalDamage: t.totalDamage,
    buried: t.buried,
    buriedTurns: t.buriedTurns,
  }));
  const canonical = {
    phase: state.phase,
    turn: state.turn,
    round: state.round,
    totalRounds: state.totalRounds,
    lastRoundWinnerId: state.lastRoundWinnerId,
    activePlayerId: state.activePlayerId,
    wind: state.wind,
    winner: state.winner,
    tanks,
    projectiles: state.projectiles,
    projectile: state.projectile,
    lastExplosion: state.lastExplosion,
    explosions: state.explosions,
    // Napalm fire field — engine-authoritative + part of the determinism claim.
    fire: state.fire,
    terrain: terrainHex(state.terrain),
  };
  return JSON.stringify(canonical);
}

/** First index where two strings differ, with a small context window. */
function firstDiff(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 40);
      return {
        index: i,
        a: a.slice(from, i + 40),
        b: b.slice(from, i + 40),
      };
    }
  }
  if (a.length !== b.length) {
    return { index: len, a: a.slice(len, len + 80), b: b.slice(len, len + 80) };
  }
  return null;
}

let failed = false;
const log = (...args) => console.log(...args);

// --- Check 1: same seed + same actions => identical final state ---
const run1 = runGame(SEED_A);
const run2 = runGame(SEED_A);
const s1 = serialize(run1.state);
const s2 = serialize(run2.state);

log(`[run1] seed=0x${SEED_A.toString(16)} ticks=${run1.ticks} phase=${run1.state.phase}`);
log(`[run2] seed=0x${SEED_A.toString(16)} ticks=${run2.ticks} phase=${run2.state.phase}`);
log(`[run1] serialized length=${s1.length}`);
log(`[run2] serialized length=${s2.length}`);

if (run1.ticks >= MAX_TICKS || run2.ticks >= MAX_TICKS) {
  failed = true;
  log(`FAIL: projectile never resolved within ${MAX_TICKS} ticks (possible infinite flight).`);
}

// Self-validation: confirm the scripted shot actually CRATERED the terrain
// (explosion path), not merely flew out of bounds. Otherwise the determinism
// assertion would be testing a near-empty code path.
if (run1.state.lastExplosion === null) {
  failed = true;
  log('FAIL: scripted shot produced no explosion — determinism check did NOT exercise the terrain-deform path (adjust ACTIONS to land a hit).');
} else {
  log(`[run1] explosion exercised: ${JSON.stringify(run1.state.lastExplosion)} (terrain-deform path covered).`);
}

if (s1 === s2) {
  log('PASS: identical (seed, actions) produced byte-identical final state (determinism holds).');
} else {
  failed = true;
  const d = firstDiff(s1, s2);
  log('FAIL: same seed + same actions produced DIVERGENT state (NON-DETERMINISTIC).');
  if (d) {
    log(`  first diff at index ${d.index}`);
    log(`  run1: ...${d.a}...`);
    log(`  run2: ...${d.b}...`);
  }
}

// --- Check 2: different seed => different terrain ---
const runC = runGame(SEED_B);
const terrainA = terrainHex(run1.state.terrain);
const terrainC = terrainHex(runC.state.terrain);

log(`[run3] seed=0x${SEED_B.toString(16)} ticks=${runC.ticks} phase=${runC.state.phase}`);

if (terrainA === terrainC) {
  failed = true;
  log('FAIL: different seeds produced IDENTICAL terrain (seed is ignored — terrain not seed-driven).');
} else {
  log('PASS: different seeds produced different terrain (seed wiring is effective).');
}

if (failed) {
  log('\nDETERMINISM CHECK: FAILED');
  process.exit(1);
} else {
  log('\nDETERMINISM CHECK: PASSED');
  process.exit(0);
}
