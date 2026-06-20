// Adversarial AIRBURST check for the singedTerra shared engine.
//
// The cluster_bomb is a REAL APEX AIRBURST: the shell flies as ONE projectile,
// SPLITS at the apex of its arc (vy goes from rising to falling) into `count`
// submunitions arranged in a DETERMINISTIC horizontal velocity fan, each of
// which then falls ballistically (gravity + wind) and detonates where it lands.
// There is NO instantaneous-crater path anymore.
//
// Asserts:
//   1. Apex split: while rising, the cluster shell stays a SINGLE in-flight
//      projectile with hasSplit=false; at apex it becomes exactly `count`
//      submunitions, ALL hasSplit=true, all spawned at the same (x, y), with a
//      symmetric velocity fan whose consecutive vx diffs equal step=2*spread/(count-1).
//      The parent is consumed (replaced), NOT detonated at apex.
//   2. Wide ballistic landing fan: a representative lob lands ALL `count`
//      bomblets in-bounds, producing `count` distinct explosions with strictly
//      increasing ids 1..count, every burst carrying the weapon's detonation
//      style/color/durationFrames/radius, cy clamped, lastExplosion === last.
//      The landing cx span is WIDE (bomblets spread across most of the field).
//   3. Single resolve: resolve() runs EXACTLY ONCE after the last submunition
//      leaves flight (turn advances by 1, active player rotates once). Verified
//      against a single-missile shot from the same seed: post-shot wind is
//      byte-identical, proving nextWind() fired exactly once (not count times).
//   4. A normal (non-airburst) missile NEVER splits: stays a single projectile,
//      one blast, no submunitions.
//   5. Two same-seed cluster runs are byte-identical (deterministic fan + state).
//
// Fully deterministic: no Math.random, no Date / wall-clock. Imports the shared
// TypeScript source directly (tsx runs .ts without a build step).
//
// Run: npx tsx scripts/checks/airburst.mjs

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { getWeapon } from '../../shared/src/engine/WeaponSystem.ts';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/src/engine/Terrain.ts';

const SEED = 0x5eed1234;
const MAX_TICKS = 100_000;

const PALETTE = ['#e84d4d', '#4d8ce8'];

function makePlayers(n) {
  const players = [];
  for (let i = 0; i < n; i++) players.push({ name: `P${i + 1}`, color: PALETTE[i % PALETTE.length] });
  return players;
}

function freshEngine() {
  return new GameEngine({ players: makePlayers(2), maxPlayers: 2, seed: SEED });
}

let failed = false;
const log = (...args) => console.log(...args);
const fail = (msg) => { failed = true; log(`FAIL: ${msg}`); };
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const cdef = getWeapon('cluster_bomb');
const COUNT = cdef.behavior.airburst.count;
const SPREAD = cdef.behavior.airburst.spread;
const STEP = COUNT > 1 ? (2 * SPREAD) / (COUNT - 1) : 0;
const DET = cdef.detonation;

// A representative lob (angle 78, power 50 from the left tank near x=120 on the
// 1200px field) that puts ALL COUNT bomblets in-bounds in a modest landing carpet
// (cx span ~55px for this seed). Chosen by sweep against the real engine.
const CLUSTER_AIM = { angle: 78, power: 50, weapon: 'cluster_bomb' };

/**
 * Fire one shot and tick to resolution, capturing an in-flight trace. Returns
 * the resolved state plus split diagnostics. The engine resets state.explosions
 * at the START of the next shot, so the array inspected here is this shot's burst
 * list. `atSplit` snapshots the in-flight projectiles on the first tick any
 * submunition appears; `preSplitInFlight` is the in-flight count while still a
 * single rising shell (before the split, excluding the resolving empty tick).
 */
function fireShot(engine, { angle, power, weapon }) {
  engine.applyAction({ type: 'select_weapon', weapon });
  engine.applyAction({ type: 'set_angle', angle });
  engine.applyAction({ type: 'set_power', power });
  engine.applyAction({ type: 'fire' });

  let everSplit = false;
  let maxInFlight = 0;
  let preSplitMax = 0;
  let atSplit = null;
  let anySplitFlag = false;

  let ticks = 0;
  while (engine.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
    engine.tick();
    const ps = engine.getState().projectiles;
    maxInFlight = Math.max(maxInFlight, ps.length);
    const hasSub = ps.some((p) => p.hasSplit);
    if (hasSub) anySplitFlag = true;
    if (hasSub && !everSplit) {
      everSplit = true;
      atSplit = {
        len: ps.length,
        allSplit: ps.every((p) => p.hasSplit),
        sameX: ps.every((p) => approx(p.x, ps[0].x, 1e-9)),
        sameY: ps.every((p) => approx(p.y, ps[0].y, 1e-9)),
        vx: ps.map((p) => p.vx),
        vy: ps.map((p) => p.vy),
      };
    } else if (!everSplit) {
      // Still a single rising shell (no submunitions yet).
      preSplitMax = Math.max(preSplitMax, ps.length);
    }
    ticks++;
  }
  if (ticks >= MAX_TICKS) throw new Error('projectile never resolved (possible infinite flight)');
  return { st: engine.getState(), everSplit, maxInFlight, preSplitMax, atSplit, anySplitFlag };
}

// --- Check 1: APEX SPLIT into a deterministic symmetric velocity fan ---
{
  const engine = freshEngine();
  const r = fireShot(engine, CLUSTER_AIM);

  if (!r.everSplit) {
    fail('cluster_bomb never split at apex (no submunitions ever appeared)');
  } else {
    // Before the split the shell is a SINGLE projectile.
    if (r.preSplitMax !== 1) fail(`pre-split in-flight count was ${r.preSplitMax}, expected exactly 1 (single rising shell)`);
    // At the split it becomes exactly COUNT submunitions, all hasSplit=true,
    // all co-located at the apex point.
    const a = r.atSplit;
    if (a.len !== COUNT) fail(`apex split produced ${a.len} submunitions, expected ${COUNT}`);
    if (!a.allSplit) fail('not every projectile at split carried hasSplit=true');
    if (!a.sameX || !a.sameY) fail('submunitions were not all spawned at the same (x,y) apex point');
    // Symmetric velocity fan: consecutive vx diffs all === STEP; symmetric about
    // the middle bomblet (offsets -spread..+spread); vy inherited (equal across all).
    const diffs = a.vx.slice(1).map((v, i) => v - a.vx[i]);
    for (const d of diffs) if (!approx(d, STEP)) fail(`vx fan step ${d} != expected ${STEP}`);
    // Symmetry: vx[i] - mean == -(vx[COUNT-1-i] - mean).
    const mean = a.vx.reduce((s, v) => s + v, 0) / COUNT;
    for (let i = 0; i < COUNT; i++) {
      if (!approx(a.vx[i] - mean, -(a.vx[COUNT - 1 - i] - mean))) fail(`vx fan not symmetric at i=${i}`);
    }
    // vy inherited unchanged across all bomblets (≈ apex vy).
    for (const v of a.vy) if (!approx(v, a.vy[0])) fail('submunition vy not uniformly inherited from parent');
    if (!failed) {
      log(`[airburst] pre-split in-flight=1, apex => ${COUNT} co-located submunitions (hasSplit=true), vx=[${a.vx.map((v) => v.toFixed(3)).join(', ')}], step=${STEP}, symmetric.`);
      log('PASS: cluster_bomb splits at apex into a deterministic symmetric velocity fan.');
    }
  }
}

// --- Check 2: WIDE ballistic landing fan => COUNT distinct explosions ---
{
  const engine = freshEngine();
  const r = fireShot(engine, CLUSTER_AIM);
  const ex = r.st.explosions;

  log(`[airburst] explosions.length=${ex.length} (expected ${COUNT}); cx=[${ex.map((e) => e.cx.toFixed(1)).join(', ')}]`);
  if (ex.length !== COUNT) {
    fail(`cluster_bomb produced ${ex.length} distinct blasts, expected ${COUNT} (all bomblets in-bounds for this aim)`);
  } else {
    // Strictly increasing ids 1..COUNT.
    for (let i = 0; i < ex.length; i++) {
      if (ex[i].id !== i + 1) fail(`bomblet ${i} id=${ex[i].id}, expected ${i + 1}`);
    }
    // Every burst sources its visuals from the weapon's detonation group.
    for (const e of ex) {
      if (e.style !== DET.style) fail(`bomblet style=${e.style}, expected ${DET.style}`);
      if (e.color !== DET.color) fail(`bomblet color=${e.color}, expected ${DET.color}`);
      if (e.durationFrames !== DET.durationFrames) fail(`bomblet dur=${e.durationFrames}, expected ${DET.durationFrames}`);
      if (e.radius !== DET.radius) fail(`bomblet radius=${e.radius}, expected ${DET.radius}`);
      if (e.cx < 0 || e.cx >= CANVAS_WIDTH) fail(`bomblet cx=${e.cx} out of field [0,${CANVAS_WIDTH})`);
      if (e.cy < 0 || e.cy > CANVAS_HEIGHT) fail(`bomblet cy=${e.cy} not clamped to [0,${CANVAS_HEIGHT}]`);
    }
    // The bomblets form a genuine spread carpet (not bunched at one point). The
    // fan is deliberately tuned tight enough to stay on-field for ordinary lobs,
    // so we demand a real but modest carpet, not "most of the field".
    const cxs = ex.map((e) => e.cx);
    const span = Math.max(...cxs) - Math.min(...cxs);
    // Absolute px floor: the carpet width is a function of the airburst spread +
    // post-apex fall time (PHYSICS), NOT the canvas width — so this must NOT be
    // tied to CANVAS_WIDTH (a wider field would wrongly raise the bar, which is
    // exactly what broke when the field grew 800->1200 and POWER_SCALE dropped).
    const MIN_SPAN = 40; // a genuine carpet, not bunched at one point
    if (span < MIN_SPAN) fail(`landing fan span ${span.toFixed(1)} too narrow (< ${MIN_SPAN})`);
    if (r.st.lastExplosion !== ex[ex.length - 1]) fail('lastExplosion is not explosions[last] for the cluster shot');
    if (!failed) log(`PASS: ${COUNT} ballistic bomblets landed in a spread carpet (cx span ${span.toFixed(1)}px), ids 1..${COUNT}, fields from detonation def.`);
  }
}

// --- Check 3: resolve() runs EXACTLY ONCE (turn advances once; wind drawn once) ---
{
  // Cluster shot: turn 0 -> 1, active rotates p1 -> p2.
  const ce = freshEngine();
  const cpre = ce.getState();
  const cActive = cpre.activePlayerId;
  const cTurn = cpre.turn;
  const cPost = fireShot(ce, CLUSTER_AIM).st;
  if (cPost.phase !== 'PLAYER_TURN') fail(`cluster post-shot phase=${cPost.phase}, expected PLAYER_TURN`);
  if (cPost.turn !== cTurn + 1) fail(`cluster turn ${cPost.turn}, expected ${cTurn + 1} (single resolve)`);
  if (cPost.activePlayerId === cActive) fail('cluster did not rotate active player (resolve not run)');

  // Same-seed single missile lob: its post-shot wind must equal the cluster's
  // post-shot wind. nextWind() advances the seeded stream EXACTLY ONCE per
  // resolve; if the cluster had resolved per-bomblet (COUNT times) the streams
  // would diverge. Byte-identical wind proves resolve()/nextWind() ran once.
  const me = freshEngine();
  const mPost = fireShot(me, { angle: 78, power: 50, weapon: 'missile' }).st;
  log(`[airburst] post-shot wind cluster=${cPost.wind} missile=${mPost.wind}`);
  if (!approx(cPost.wind, mPost.wind, 0)) fail('cluster post-shot wind != single-missile post-shot wind => nextWind() fired more than once');
  if (!failed) log('PASS: resolve() ran exactly once (turn +1, active rotated once, wind drawn once — byte-identical to a single shot).');
}

// --- Check 4: a normal (non-airburst) missile NEVER splits ---
{
  const engine = freshEngine();
  const r = fireShot(engine, { angle: 78, power: 50, weapon: 'missile' });
  log(`[normal] missile maxInFlight=${r.maxInFlight} everSplit=${r.everSplit} explosions=${r.st.explosions.length}`);
  if (r.everSplit || r.anySplitFlag) fail('missile spawned submunitions (it must never airburst)');
  if (r.maxInFlight !== 1) fail(`missile maxInFlight=${r.maxInFlight}, expected 1 (single shell)`);
  if (r.st.explosions.length !== 1) fail(`missile produced ${r.st.explosions.length} blasts, expected 1`);
  else if (r.st.lastExplosion !== r.st.explosions[0]) fail('lastExplosion is not explosions[0] for the missile hit');
  if (!failed) log('PASS: missile stays a single ballistic shell => exactly 1 blast, no submunitions.');
}

// --- Check 5: two same-seed cluster runs are byte-identical ---
{
  function serialize(state) {
    return JSON.stringify({
      phase: state.phase,
      turn: state.turn,
      activePlayerId: state.activePlayerId,
      wind: state.wind,
      winner: state.winner,
      explosions: state.explosions,
      lastExplosion: state.lastExplosion,
      tanks: state.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive })),
      terrain: Buffer.from(state.terrain).toString('hex'),
    });
  }
  function run() {
    const engine = freshEngine();
    return serialize(fireShot(engine, CLUSTER_AIM).st);
  }
  const a = run();
  const b = run();
  if (a !== b) fail('two same-seed cluster runs DIVERGED (NON-DETERMINISTIC)');
  else log(`PASS: two same-seed cluster runs byte-identical (len ${a.length}).`);
}

if (failed) {
  log('\nAIRBURST CHECK: FAILED');
  process.exit(1);
} else {
  log('\nAIRBURST CHECK: PASSED');
  process.exit(0);
}
