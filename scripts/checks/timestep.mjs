// Adversarial determinism check: fixed timestep & seed correctness.
// Run: npx tsx scripts/checks/timestep.mjs
//
// REFUTES the claim "physics is deterministic given (seed, inputs) and uses a
// fixed timestep with no clock-derived dt." Three probes:
//   (a) Trajectory depends ONLY on tick count, not on how ticks are batched.
//       Ticking N times must equal ticking in chunks (no hidden dt-from-clock,
//       no per-call wall-clock state).
//   (b) Terrain generation is stable across many seeds: no crashes, every
//       surface value within [0, CANVAS_HEIGHT], correct length.
//   (c) Re-running the same seed many times yields byte-identical terrain and
//       identical projectile evolution (no global mutable state, no Math.random).

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import {
  generate,
  generateBitmap,
  deform,
  applyGravity,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../../shared/src/engine/Terrain.ts';
import {
  launchVelocity,
  stepProjectile,
  GRAVITY,
} from '../../shared/src/engine/Physics.ts';

let failures = 0;
let checks = 0;
const log = (m) => console.log(m);
function fail(msg) {
  failures++;
  console.log('  FAIL: ' + msg);
}
function ok(msg) {
  checks++;
  console.log('  ok:   ' + msg);
}

// --- helpers -----------------------------------------------------------------

// Snapshot all in-flight projectiles (or 'null' when none) for comparison.
// Multiple projectiles can be live at once (airburst submunitions), so we
// serialize the whole array; an empty array reads as 'null' (resolved).
function projSnap(state) {
  const ps = state.projectiles;
  if (ps.length === 0) return 'null';
  return ps.map((p) => [p.x, p.y, p.vx, p.vy].join(',')).join('|');
}

// Drive an engine to FIRING with a fixed aim and a fixed shot, then return a
// fresh engine in FIRING state ready to tick.
function firingEngine(seed, angle, power) {
  const e = new GameEngine({ seed });
  e.applyAction({ type: 'set_angle', angle });
  e.applyAction({ type: 'set_power', power });
  e.applyAction({ type: 'fire' });
  return e;
}

// Tick an engine and capture the projectile snapshot AFTER each tick, until
// the projectile clears (impact/oob) or we hit maxTicks. Returns the ordered
// list of snapshots. The final entry is 'null' once the shot resolves.
function tickTrace(engine, maxTicks) {
  const trace = [];
  for (let i = 0; i < maxTicks; i++) {
    engine.tick();
    trace.push(projSnap(engine.getState()));
    if (engine.getState().projectile === null) break;
  }
  return trace;
}

// =============================================================================
// (a) Batching invariance — trajectory depends only on tick COUNT.
// =============================================================================
log('\n(a) Fixed timestep: ticking is batch-invariant (no clock-derived dt)');
{
  const seed = 12345;
  const angle = 50;
  const power = 80;

  // Reference: tick one-at-a-time, capturing every per-tick snapshot.
  const ref = tickTrace(firingEngine(seed, angle, power), 5000);
  const refLen = ref.length;

  if (refLen < 2) {
    fail(`reference trajectory too short (${refLen}) — shot did not fly`);
  } else {
    ok(`reference shot flew ${refLen} ticks then resolved (last=${ref[refLen - 1]})`);
  }

  // Probe 1: per-call snapshots must be identical whether we call tick() in a
  // tight loop or interleave other no-op work. Because tick() must not read a
  // clock, calling it across simulated "time gaps" must not change anything.
  // We emulate batching by re-running and comparing the WHOLE trace.
  for (const chunk of [1, 2, 3, 7, 50, 10000]) {
    const e = firingEngine(seed, angle, power);
    const trace = [];
    let resolved = false;
    let ticked = 0;
    while (!resolved && ticked < 5000) {
      for (let c = 0; c < chunk && !resolved; c++) {
        e.tick();
        ticked++;
        trace.push(projSnap(e.getState()));
        if (e.getState().projectile === null) resolved = true;
      }
    }
    const same =
      trace.length === ref.length && trace.every((v, i) => v === ref[i]);
    if (same) ok(`chunk=${chunk}: identical trace (${trace.length} ticks)`);
    else
      fail(
        `chunk=${chunk}: trace diverged from reference ` +
          `(len ${trace.length} vs ${ref.length})`,
      );
  }

  // Probe 2: pure-physics layer. Integrate one projectile two ways:
  //  - N single steps
  //  - the same N steps but with a real-time delay between calls (sleep-free,
  //    but we read Date.now() ourselves to PROVE the engine ignores wall time).
  const v = launchVelocity(angle, power);
  const mk = () => ({ x: 100, y: 100, vx: v.vx, vy: v.vy, weaponType: 'baby_missile' });

  const a = mk();
  for (let i = 0; i < 200; i++) stepProjectile(a, 0);

  const b = mk();
  let spin = 0;
  for (let i = 0; i < 200; i++) {
    // Burn a variable amount of wall-clock between steps. If stepProjectile
    // secretly used elapsed real time, b would diverge from a.
    const t0 = Date.now();
    while (Date.now() - t0 < (i % 3)) spin++;
    stepProjectile(b, 0);
  }
  const eq =
    a.x === b.x && a.y === b.y && a.vx === b.vx && a.vy === b.vy;
  if (eq)
    ok(`stepProjectile ignores wall-clock: identical after 200 steps (spin=${spin})`);
  else
    fail(
      `stepProjectile diverged under wall-clock delay: a=(${a.x},${a.y}) b=(${b.x},${b.y})`,
    );

  // Probe 3: closed-form check that the constant dt is exactly the documented
  // 16ms-equivalent unit step. After k steps with wind=0, vy must equal
  // vy0 + k*GRAVITY (each tick adds GRAVITY exactly once — no fractional dt).
  const c = mk();
  const k = 37;
  for (let i = 0; i < k; i++) stepProjectile(c, 0);
  const expectedVy = v.vy + k * GRAVITY;
  if (Math.abs(c.vy - expectedVy) < 1e-9)
    ok(`unit timestep: vy after ${k} ticks == vy0 + ${k}*GRAVITY`);
  else
    fail(`unit timestep broken: vy=${c.vy} expected ${expectedVy}`);
}

// =============================================================================
// (b) Terrain generation stable across many seeds.
// =============================================================================
log('\n(b) Terrain generation: stable & in-bounds across many seeds');
{
  let crashes = 0;
  let oobValues = 0;
  let badLen = 0;
  let nanCount = 0;
  const seedsToTry = 4000;

  // Mix of structured, edge, and pseudo-random seeds (the pseudo-random source
  // here is the test harness's own — fine; the ENGINE must stay seeded).
  const seeds = [];
  for (let i = 0; i < seedsToTry; i++) {
    if (i < 8) seeds.push([0, 1, -1, 0xffffffff, 0x7fffffff, 2 ** 31, -(2 ** 31), 123456789][i]);
    else seeds.push((i * 2654435761) >>> 0);
  }
  // Also throw deliberately hostile seeds at it.
  seeds.push(NaN, Infinity, -Infinity, 1.5, -0.0, 3.999, 1e20);

  for (const s of seeds) {
    let t;
    try {
      t = generate(s);
    } catch (err) {
      crashes++;
      if (crashes <= 3) log(`    crash on seed ${s}: ${err?.message ?? err}`);
      continue;
    }
    if (t.length !== CANVAS_WIDTH) badLen++;
    for (let x = 0; x < t.length; x++) {
      const y = t[x];
      if (Number.isNaN(y)) {
        nanCount++;
        break;
      }
      if (y < 0 || y > CANVAS_HEIGHT) {
        oobValues++;
        break;
      }
    }
  }

  if (crashes === 0) ok(`no crashes across ${seeds.length} seeds (incl. hostile)`);
  else fail(`${crashes} seeds crashed terrain generation`);

  if (badLen === 0) ok(`every terrain has length ${CANVAS_WIDTH}`);
  else fail(`${badLen} terrains had wrong length`);

  if (nanCount === 0) ok('no NaN surface values produced');
  else fail(`${nanCount} terrains contained NaN surface values`);

  if (oobValues === 0)
    ok(`every surface value within [0, ${CANVAS_HEIGHT}]`);
  else fail(`${oobValues} terrains had out-of-range surface values`);

  // Deform must keep the BITMAP well-formed: every pixel stays 0/1 (air/solid)
  // and the length is invariant at 800*500 after deform + gravity. Operates on
  // the pixel bitmap (deform now takes a Uint8Array, not a height line).
  let deformBadPixel = 0;
  let deformBadLen = 0;
  for (let i = 0; i < 500; i++) {
    const b = generateBitmap((i * 40503) >>> 0);
    const cx = (i * 37) % CANVAS_WIDTH;
    const cyVal = 200;
    const r = 28 + (i % 50);
    const range = deform(b, cx, cyVal, r);
    if (range !== null) applyGravity(b, range.xStart, range.xEnd);
    if (b.length !== CANVAS_WIDTH * CANVAS_HEIGHT) {
      deformBadLen++;
      continue;
    }
    for (let p = 0; p < b.length; p++) {
      if (b[p] !== 0 && b[p] !== 1) {
        deformBadPixel++;
        break;
      }
    }
  }
  if (deformBadLen === 0) ok(`deform keeps bitmap length ${CANVAS_WIDTH * CANVAS_HEIGHT}`);
  else fail(`${deformBadLen} deformed bitmaps had wrong length`);

  if (deformBadPixel === 0) ok('deform keeps every pixel value in {0, 1}');
  else fail(`${deformBadPixel} deformed bitmaps had out-of-range pixel values`);

  // Sensitivity: different seeds should generally give different terrain (a
  // weak anti-stuck check — a constant generator would be "stable" but wrong).
  const t0 = generate(111);
  const t1 = generate(222);
  let diff = 0;
  for (let x = 0; x < t0.length; x++) if (t0[x] !== t1[x]) diff++;
  if (diff > 0) ok(`distinct seeds yield distinct terrain (${diff}/${CANVAS_WIDTH} cols differ)`);
  else fail('two different seeds produced identical terrain (generator ignores seed?)');
}

// =============================================================================
// (c) Re-running the same seed is stable (no global state, no Math.random).
// =============================================================================
log('\n(c) Same-seed reproducibility (terrain + full projectile evolution)');
{
  const seed = 0xABCDEF;

  // Terrain: regenerate many times, compare byte-for-byte against first.
  const base = generate(seed);
  let terrainDrift = 0;
  for (let rep = 0; rep < 200; rep++) {
    const t = generate(seed);
    if (t.length !== base.length) {
      terrainDrift++;
      continue;
    }
    for (let x = 0; x < t.length; x++) {
      if (t[x] !== base[x]) {
        terrainDrift++;
        break;
      }
    }
  }
  if (terrainDrift === 0) ok('terrain identical across 200 regenerations of same seed');
  else fail(`${terrainDrift} regenerations drifted from the first`);

  // Interleave OTHER seeds between regenerations to expose hidden shared state.
  let interleaveDrift = 0;
  for (let rep = 0; rep < 100; rep++) {
    generate((rep * 99991) >>> 0); // perturb any global PRNG state, if present
    const t = generate(seed);
    for (let x = 0; x < t.length; x++) {
      if (t[x] !== base[x]) {
        interleaveDrift++;
        break;
      }
    }
  }
  if (interleaveDrift === 0)
    ok('terrain reproducible even when other seeds are generated in between');
  else fail(`${interleaveDrift} interleaved regenerations drifted (hidden global state?)`);

  // Full engine run: same seed + same action sequence => identical tick traces.
  const refTrace = tickTrace(firingEngine(seed, 63, 77), 5000);
  let runDrift = 0;
  for (let rep = 0; rep < 50; rep++) {
    // Construct other engines in between to perturb any module-level counters.
    new GameEngine({ seed: (rep + 1) * 7 });
    const tr = tickTrace(firingEngine(seed, 63, 77), 5000);
    const same =
      tr.length === refTrace.length && tr.every((v, i) => v === refTrace[i]);
    if (!same) runDrift++;
  }
  if (runDrift === 0)
    ok(`engine tick trace identical across 50 reruns (len=${refTrace.length})`);
  else fail(`${runDrift}/50 engine reruns drifted from reference trace`);

  // Default-seed (no options) must also be reproducible and clock-free.
  const d1 = new GameEngine().getState().terrain;
  const d2 = new GameEngine().getState().terrain;
  let defDrift = 0;
  for (let x = 0; x < d1.length; x++) if (d1[x] !== d2[x]) defDrift++;
  if (defDrift === 0) ok('default-seed engines produce identical terrain (no clock seed)');
  else fail(`default-seed engines drifted in ${defDrift} columns (clock-derived seed?)`);
}

// =============================================================================
log('\n=============================================');
log(`checks passed: ${checks}   failures: ${failures}`);
if (failures > 0) {
  log('RESULT: REFUTED — determinism/timestep guarantee is violated.');
  process.exit(1);
} else {
  log('RESULT: UPHELD — could not refute fixed-timestep & seed determinism.');
  process.exit(0);
}
