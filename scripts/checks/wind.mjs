// Adversarial wind-drift check for the singedTerra shared engine.
//
// Asserts the frozen gentle-drift wind contract (engine barrier MVP1):
//   (a) DETERMINISTIC: two same-seed, same-action runs produce byte-identical
//       per-turn wind sequences for N=2,3,4.
//   (b) BOUNDED: |wind| <= maxWind for every turn (clamp respected).
//   (c) WALKABLE: |wind[t+1] - wind[t]| <= WIND_DRIFT_STEP for every step.
//   (d) SEED-DRIVEN: a different seed produces a different wind sequence.
//   (e) GRAVITY-DOMINANT: maxWind * WIND_FACTOR < GRAVITY, so wind no longer
//       overpowers gravity.
//
// Fully deterministic: no Math.random, no Date / wall-clock. Imports the shared
// TypeScript source directly (tsx runs .ts without a build step).
//
// Run: npx tsx scripts/checks/wind.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { WIND_DRIFT_STEP, WIND_FACTOR, MAX_WIND, GRAVITY } from '../../shared/src/engine/Physics.ts';

const MAX_TICKS = 100_000;
const TURNS = 40; // record this many per-turn wind values (game won't end: weak shots)

const PALETTE = ['#e84d4d', '#4d8ce8', '#4de87a', '#e8c84d'];

function makePlayers(n) {
  const players = [];
  for (let i = 0; i < n; i++) players.push({ name: `P${i + 1}`, color: PALETTE[i] });
  return players;
}

/**
 * Drive N players through `TURNS` turns, firing a weak fixed shot each turn so
 * NEXT_TURN (and thus wind drift) runs every turn without anyone dying. Records
 * state.wind at the START of each PLAYER_TURN. A fixed steep low-power shot is
 * deterministic and resolves in-bounds without killing (so the game keeps going).
 */
function windSequence(n, seed) {
  const engine = new GameEngine({ players: makePlayers(n), maxPlayers: n, seed });
  const winds = [];
  for (let t = 0; t < TURNS; t++) {
    const pre = engine.getState();
    if (pre.phase !== 'PLAYER_TURN') break; // game ended (shouldn't with weak shots)
    winds.push(pre.wind);

    // Weak high lob: lands near the firing tank but power 3 deals little damage,
    // so tanks survive and turns keep advancing (exercising drift every turn).
    engine.applyAction({ type: 'set_angle', angle: 80 });
    engine.applyAction({ type: 'set_power', power: 3 });
    engine.applyAction({ type: 'fire' });

    let ticks = 0;
    while (engine.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
      engine.tick();
      ticks++;
    }
    if (ticks >= MAX_TICKS) throw new Error(`projectile never resolved (N=${n}, turn ${t})`);
  }
  return winds;
}

let failed = false;
const log = (...args) => console.log(...args);
const fail = (msg) => { failed = true; log(`FAIL: ${msg}`); };

const SEED_A = 0x1111;
const SEED_B = 0x9999;
const EPS = 1e-6;

// --- (a) determinism + (b) bounded + (c) walkable, for N=2,3,4 ---
for (const n of [2, 3, 4]) {
  const s1 = windSequence(n, SEED_A);
  const s2 = windSequence(n, SEED_A);

  log(`\n[N=${n}] turns=${s1.length} first5=[${s1.slice(0, 5).map((w) => w.toFixed(4)).join(', ')}]`);

  if (s1.length < 2) fail(`[N=${n}] too few turns recorded (${s1.length}) — drift not exercised`);

  // (a) deterministic
  const identical = s1.length === s2.length && s1.every((w, i) => w === s2[i]);
  if (!identical) fail(`[N=${n}] same-seed wind sequences DIVERGED (NON-DETERMINISTIC)`);
  else log(`PASS[N=${n}]: same-seed wind sequence byte-identical across two runs.`);

  // (b) bounded
  let maxAbs = 0;
  for (const w of s1) maxAbs = Math.max(maxAbs, Math.abs(w));
  if (maxAbs > MAX_WIND + EPS) fail(`[N=${n}] |wind| exceeded MAX_WIND: maxAbs=${maxAbs}`);
  else log(`PASS[N=${n}]: |wind| <= MAX_WIND (maxAbs=${maxAbs.toFixed(4)}).`);

  // (c) walkable
  let maxDelta = 0;
  for (let i = 1; i < s1.length; i++) maxDelta = Math.max(maxDelta, Math.abs(s1[i] - s1[i - 1]));
  if (maxDelta > WIND_DRIFT_STEP + EPS) fail(`[N=${n}] step exceeded WIND_DRIFT_STEP: maxDelta=${maxDelta}`);
  else log(`PASS[N=${n}]: |wind[t+1]-wind[t]| <= WIND_DRIFT_STEP (maxDelta=${maxDelta.toFixed(4)}).`);

  // Self-validation: wind must actually VARY (not a frozen constant).
  if (new Set(s1).size < 2) fail(`[N=${n}] wind never changed across turns — drift not live`);
}

// --- (d) seed-driven: different seed => different sequence ---
{
  const a = windSequence(3, SEED_A);
  const b = windSequence(3, SEED_B);
  const differs = a.length !== b.length || a.some((w, i) => w !== b[i]);
  log(`\n[seed] s(0x${SEED_A.toString(16)})[0]=${a[0].toFixed(4)} s(0x${SEED_B.toString(16)})[0]=${b[0].toFixed(4)}`);
  if (!differs) fail('different seeds produced IDENTICAL wind sequence (seed ignored)');
  else log('PASS: different seeds => different wind sequence (seed wiring effective).');
}

// --- (e) gravity dominates wind ---
{
  const maxWindAccel = MAX_WIND * WIND_FACTOR;
  log(`\n[accel] MAX_WIND*WIND_FACTOR=${maxWindAccel} GRAVITY=${GRAVITY}`);
  if (!(maxWindAccel < GRAVITY)) fail(`max wind accel ${maxWindAccel} not < GRAVITY ${GRAVITY}`);
  else log(`PASS: max wind accel ${maxWindAccel} < GRAVITY ${GRAVITY} (wind no longer dominates).`);
}

if (failed) {
  log('\nWIND CHECK: FAILED');
  process.exit(1);
} else {
  log('\nWIND CHECK: PASSED');
  process.exit(0);
}
