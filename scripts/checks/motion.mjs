// Adversarial MOTION check for the singedTerra shared engine (Sprint 4, Slice 2.4
// — the 8th harness). Covers the two NEW tick-loop motion behaviors introduced in
// Slice 2 (the highest-risk determinism surface), plus napalm's one-tick burst.
//
// 2.1 funky_bomb — a mid-flight, AGE-triggered 5-way split. Unlike cluster_bomb
//     (which splits at the arc's APEX), funky splits at behavior.airburst.ageFrames
//     ticks of flight — provably BEFORE/AWAY-FROM the apex. It reuses the same
//     deterministic symmetric velocity fan (splitAirburst) and the same hasSplit
//     one-shot guard, and resolves EXACTLY ONCE.
//
// 2.3 bouncing_betty — reflects off terrain behavior.bounce.maxBounces times
//     (deriving the surface normal from neighboring-column heights, NO RNG), then
//     detonates on the next ground contact. The ProjectileState.bounces field
//     counts DOWN from maxBounces to 0; we watch it descend exactly maxBounces
//     steps, observe the velocity reflect (not detonate) on each bounce tick, and
//     assert exactly ONE explosion after the last bounce.
//
// 2.2 napalm (optional coverage) — on a single impact tick fans into
//     behavior.napalm.cells overlapping detonate() calls laid LEFT-TO-RIGHT, each
//     minting a distinct strictly-increasing ExplosionEvent id (the N-in-one-tick
//     contract the client's id-based dedupe relies on).
//
// Asserts:
//   1. funky_bomb splits mid-flight into exactly `count` co-located submunitions,
//      all carrying hasSplit, with a symmetric deterministic vx fan (consecutive
//      diffs == step = 2*spread/(count-1)), vy inherited.
//   2. The split is NOT an apex split: at the split tick the shell is NOT at the
//      apex (it is still RISING, vy<0), and the split tick differs from the tick
//      the same trajectory would cross apex. This proves the age-based trigger.
//   3. A non-funky weapon (missile) never splits.
//   4. bouncing_betty's `bounces` field descends maxBounces -> 0 across ticks
//      (exactly maxBounces bounce transitions), and exactly ONE explosion fires,
//      AFTER the last bounce (never before).
//   5. Reflection is real: on each bounce tick the velocity direction changes
//      (the projectile reflects, it does NOT detonate) while staying near the
//      surface.
//   6. The single betty explosion sources style/color/durationFrames/radius from
//      getWeapon('bouncing_betty').detonation.
//   7. napalm emits exactly `cells` explosions in ONE tick, with strictly
//      increasing distinct ids, laid out left-to-right.
//   8. Determinism (THE highest-value assert): two same-seed runs of funky_bomb,
//      and two of bouncing_betty, are BYTE-IDENTICAL — the serializer includes
//      projectiles (so the new `bounces` field is covered) + explosions + terrain
//      hex, catching any nondeterministic bounce normal or fan.
//
// Fully deterministic: no Math.random, no Date / wall-clock. Imports the shared
// TypeScript source directly (tsx runs .ts without a build step).
//
// Run: npx tsx scripts/checks/motion.mjs

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

// --- Weapon defs (read tunables from the table, never hardcode) ---
const FUNKY = getWeapon('funky_bomb');
const FUNKY_COUNT = FUNKY.behavior.airburst.count;
const FUNKY_SPREAD = FUNKY.behavior.airburst.spread;
const FUNKY_STEP = FUNKY_COUNT > 1 ? (2 * FUNKY_SPREAD) / (FUNKY_COUNT - 1) : 0;
const FUNKY_AGE = FUNKY.behavior.airburst.ageFrames;
const FUNKY_TRIGGER = FUNKY.behavior.airburst.trigger;

const BETTY = getWeapon('bouncing_betty');
const BETTY_MAX_BOUNCES = BETTY.behavior.bounce.maxBounces;
const BETTY_DET = BETTY.detonation;

const NAPALM = getWeapon('napalm');
const NAPALM_CELLS = NAPALM.behavior.napalm.cells;

// Representative aims (chosen by sweep against the real engine for this seed so
// the intended behavior actually fires in-bounds).
const FUNKY_AIM = { angle: 78, power: 60, weapon: 'funky_bomb' };
const BETTY_AIM = { angle: 55, power: 35, weapon: 'bouncing_betty' };
const NAPALM_AIM = { angle: 65, power: 40, weapon: 'napalm' };

/**
 * Fire one shot and tick to resolution, capturing a per-tick in-flight trace.
 * Records: the first tick any submunition appears (split snapshot + the rising/
 * apex diagnostics), the running max in-flight count, the per-tick `bounces` of a
 * single tracked projectile (for betty) and the velocity around each bounce
 * transition. The engine resets state.explosions at the START of the next shot,
 * so state.explosions after resolution is THIS shot's burst list.
 */
function fireShot(engine, { angle, power, weapon }) {
  engine.applyAction({ type: 'select_weapon', weapon });
  engine.applyAction({ type: 'set_angle', angle });
  engine.applyAction({ type: 'set_power', power });
  engine.applyAction({ type: 'fire' });

  let everSplit = false;
  let maxInFlight = 0;
  let preSplitMax = 0;
  let atSplit = null;        // snapshot at the split tick
  let splitTick = -1;        // tick index of the split (1-based tick count)
  let splitVyBefore = null;  // vy of the rising shell on the pre-split tick
  let apexTick = -1;         // tick the SINGLE shell crosses apex (vy<0 -> vy>=0)
  let anySplitFlag = false;

  // Betty bounce trace: track the single projectile's `bounces` each tick and the
  // velocity just before/after each decrement (a bounce reflects velocity).
  let prevBounces = null;
  let prevVel = null;
  const bounceTransitions = []; // { tick, from, to, velBefore, velAfter, x, y }

  let ticks = 0;
  let prevSingle = null; // the single in-flight projectile from the previous tick

  while (engine.getState().phase === 'FIRING' && ticks < MAX_TICKS) {
    // Capture the single-shell apex BEFORE this tick integrates (only meaningful
    // while there is exactly one un-split shell in flight).
    const psBefore = engine.getState().projectiles;
    const singleBefore = psBefore.length === 1 ? psBefore[0] : null;

    engine.tick();
    ticks++;

    const ps = engine.getState().projectiles;
    maxInFlight = Math.max(maxInFlight, ps.length);

    // Apex detection for the single shell (mirror the engine's apex condition).
    if (apexTick === -1 && singleBefore && ps.length === 1) {
      if (singleBefore.vy < 0 && ps[0].vy >= 0) apexTick = ticks;
    }

    const hasSub = ps.some((p) => p.hasSplit);
    if (hasSub) anySplitFlag = true;
    if (hasSub && !everSplit) {
      everSplit = true;
      splitTick = ticks;
      splitVyBefore = singleBefore ? singleBefore.vy : null;
      atSplit = {
        len: ps.length,
        allSplit: ps.every((p) => p.hasSplit),
        sameX: ps.every((p) => approx(p.x, ps[0].x, 1e-9)),
        sameY: ps.every((p) => approx(p.y, ps[0].y, 1e-9)),
        vx: ps.map((p) => p.vx),
        vy: ps.map((p) => p.vy),
      };
    } else if (!everSplit) {
      preSplitMax = Math.max(preSplitMax, ps.length);
    }

    // Betty bounce trace (single projectile, never splits).
    const single = ps.length === 1 ? ps[0] : null;
    if (single) {
      if (prevBounces !== null && single.bounces < prevBounces) {
        bounceTransitions.push({
          tick: ticks,
          from: prevBounces,
          to: single.bounces,
          velBefore: prevVel,
          velAfter: { vx: single.vx, vy: single.vy },
          x: single.x,
          y: single.y,
        });
      }
      prevBounces = single.bounces;
      prevVel = { vx: single.vx, vy: single.vy };
    }
    prevSingle = single;
  }
  if (ticks >= MAX_TICKS) throw new Error('projectile never resolved (possible infinite flight)');
  return {
    st: engine.getState(),
    everSplit, maxInFlight, preSplitMax, atSplit, anySplitFlag,
    splitTick, splitVyBefore, apexTick, bounceTransitions, ticks,
  };
}

// --- Check 1: funky_bomb mid-flight split into a deterministic symmetric fan ---
{
  const engine = freshEngine();
  const r = fireShot(engine, FUNKY_AIM);

  if (FUNKY_TRIGGER !== 'age') fail(`funky_bomb trigger is '${FUNKY_TRIGGER}', expected 'age' (this harness covers the age-triggered split)`);
  if (!r.everSplit) {
    fail('funky_bomb never split mid-flight (no submunitions ever appeared)');
  } else {
    if (r.preSplitMax !== 1) fail(`pre-split in-flight count was ${r.preSplitMax}, expected exactly 1 (single shell before split)`);
    const a = r.atSplit;
    if (a.len !== FUNKY_COUNT) fail(`funky split produced ${a.len} submunitions, expected ${FUNKY_COUNT}`);
    if (!a.allSplit) fail('not every projectile at the funky split carried hasSplit=true');
    if (!a.sameX || !a.sameY) fail('funky submunitions were not all spawned at the same (x,y) split point');
    const diffs = a.vx.slice(1).map((v, i) => v - a.vx[i]);
    for (const d of diffs) if (!approx(d, FUNKY_STEP)) fail(`funky vx fan step ${d} != expected ${FUNKY_STEP}`);
    const mean = a.vx.reduce((s, v) => s + v, 0) / FUNKY_COUNT;
    for (let i = 0; i < FUNKY_COUNT; i++) {
      if (!approx(a.vx[i] - mean, -(a.vx[FUNKY_COUNT - 1 - i] - mean))) fail(`funky vx fan not symmetric at i=${i}`);
    }
    for (const v of a.vy) if (!approx(v, a.vy[0])) fail('funky submunition vy not uniformly inherited from parent');
    if (!failed) {
      log(`[funky] pre-split in-flight=1, split@tick ${r.splitTick} => ${FUNKY_COUNT} co-located submunitions (hasSplit=true), vx=[${a.vx.map((v) => v.toFixed(3)).join(', ')}], step=${FUNKY_STEP}, symmetric.`);
      log('PASS: funky_bomb splits mid-flight into a deterministic symmetric velocity fan.');
    }
  }
}

// --- Check 2: the split is AGE-triggered, NOT an apex split ---
{
  const engine = freshEngine();
  const r = fireShot(engine, FUNKY_AIM);
  if (!r.everSplit) {
    fail('funky_bomb never split — cannot verify age (not apex) trigger');
  } else {
    // The split must fire on (or just after) the ageFrames tick — well before the
    // shell would have crossed apex for this lob.
    if (r.splitTick < FUNKY_AGE) fail(`funky split fired at tick ${r.splitTick}, before ageFrames=${FUNKY_AGE} (impossible for an age trigger)`);
    // The defining property: at the split the shell is NOT at apex. For this lob
    // the shell is still RISING (vy < 0) when it splits — the apex condition
    // (vyBefore<0 && vy>=0) does NOT hold. Confirm we captured a rising vy.
    if (r.splitVyBefore === null) fail('could not capture the funky shell vy at the split tick');
    else if (!(r.splitVyBefore < 0)) fail(`funky shell vy at split was ${r.splitVyBefore} (>=0) — chosen aim splits at/after apex; pick an aim that splits while RISING to prove non-apex`);
    // And the split tick must differ from the tick this same trajectory would
    // cross apex (apex never reached as a single shell because it split first =>
    // apexTick stays -1, which is itself proof the split pre-empted the apex).
    if (r.apexTick !== -1 && r.apexTick === r.splitTick) fail(`funky split tick (${r.splitTick}) coincides with the apex tick — indistinguishable from an apex split`);
    if (!failed) {
      log(`[funky] split@tick ${r.splitTick} (ageFrames=${FUNKY_AGE}), shell vy=${r.splitVyBefore.toFixed(3)} (<0 => still RISING), single-shell apexTick=${r.apexTick} (-1 => apex never reached, split pre-empted it).`);
      log('PASS: funky_bomb split is AGE-triggered mid-arc, NOT at apex.');
    }
  }
}

// --- Check 3: a normal (non-funky) missile NEVER splits ---
{
  const engine = freshEngine();
  const r = fireShot(engine, { angle: 78, power: 60, weapon: 'missile' });
  log(`[normal] missile maxInFlight=${r.maxInFlight} everSplit=${r.everSplit} explosions=${r.st.explosions.length}`);
  if (r.everSplit || r.anySplitFlag) fail('missile spawned submunitions (it must never split)');
  if (r.maxInFlight !== 1) fail(`missile maxInFlight=${r.maxInFlight}, expected 1 (single shell)`);
  if (!failed) log('PASS: missile stays a single ballistic shell, never splits.');
}

// --- Check 4 + 5 + 6: bouncing_betty bounce count, reflection, single blast ---
{
  const engine = freshEngine();
  const r = fireShot(engine, BETTY_AIM);
  const ex = r.st.explosions;
  const tr = r.bounceTransitions;

  log(`[betty] bounce transitions=${tr.length} (expected ${BETTY_MAX_BOUNCES}); bounces ${tr.map((t) => `${t.from}->${t.to}`).join(', ')}; explosions=${ex.length}`);

  // Check 4: exactly maxBounces bounce transitions, descending maxBounces -> 0.
  if (tr.length !== BETTY_MAX_BOUNCES) {
    fail(`betty bounced ${tr.length} times, expected ${BETTY_MAX_BOUNCES} (aim should land on terrain, not sail OOB)`);
  } else {
    let expectFrom = BETTY_MAX_BOUNCES;
    for (const t of tr) {
      if (t.from !== expectFrom || t.to !== expectFrom - 1) fail(`betty bounce out of order: saw ${t.from}->${t.to}, expected ${expectFrom}->${expectFrom - 1}`);
      expectFrom--;
    }
    if (expectFrom !== 0) fail(`betty bounces did not descend to 0 (stopped at ${expectFrom})`);
  }

  // Check 5: reflection is real — on each bounce tick the velocity DIRECTION
  // changes (it did not simply detonate; the projectile kept flying with a
  // reflected vector), and the bounce happened near the surface (high y).
  for (const t of tr) {
    if (!t.velBefore || !t.velAfter) { fail('missing velocity around a betty bounce'); continue; }
    // Direction change: the velocity vector is not a positive scalar multiple of
    // the pre-bounce vector (a reflection flips the normal-component sign).
    const before = t.velBefore, after = t.velAfter;
    const cross = before.vx * after.vy - before.vy * after.vx;
    const dot = before.vx * after.vx + before.vy * after.vy;
    const changed = Math.abs(cross) > 1e-9 || dot < 0;
    if (!changed) fail(`betty bounce at tick ${t.tick} did not change velocity direction (before=${JSON.stringify(before)} after=${JSON.stringify(after)})`);
    // Bounce occurs near the terrain surface, not in open sky.
    if (t.y < CANVAS_HEIGHT * 0.2) fail(`betty bounce at y=${t.y.toFixed(1)} is too high to be a terrain contact`);
  }

  // Check 6: exactly ONE explosion, AFTER the last bounce, with detonation fields.
  if (ex.length !== 1) {
    fail(`bouncing_betty produced ${ex.length} explosions, expected exactly 1 (detonates only after bounces spent)`);
  } else {
    const e = ex[0];
    if (e.style !== BETTY_DET.style) fail(`betty explosion style=${e.style}, expected ${BETTY_DET.style}`);
    if (e.color !== BETTY_DET.color) fail(`betty explosion color=${e.color}, expected ${BETTY_DET.color}`);
    if (e.durationFrames !== BETTY_DET.durationFrames) fail(`betty explosion dur=${e.durationFrames}, expected ${BETTY_DET.durationFrames}`);
    if (e.radius !== BETTY_DET.radius) fail(`betty explosion radius=${e.radius}, expected ${BETTY_DET.radius}`);
    if (r.st.lastExplosion !== e) fail('betty lastExplosion is not explosions[0]');
  }
  if (!failed) log(`PASS: bouncing_betty reflected exactly ${BETTY_MAX_BOUNCES}x (bounces ${BETTY_MAX_BOUNCES}->0) then detonated ONCE with detonation-def visuals.`);
}

// --- Check 7: napalm emits N distinct, strictly-increasing ids in one tick ---
{
  const engine = freshEngine();
  const r = fireShot(engine, NAPALM_AIM);
  const ex = r.st.explosions;
  log(`[napalm] explosions.length=${ex.length} (expected ${NAPALM_CELLS}); cx=[${ex.map((e) => e.cx.toFixed(1)).join(', ')}]; ids=[${ex.map((e) => e.id).join(', ')}]`);
  if (ex.length !== NAPALM_CELLS) {
    fail(`napalm produced ${ex.length} cells, expected ${NAPALM_CELLS} (aim should land on terrain)`);
  } else {
    // Distinct, strictly increasing ids (the client's id>highWater dedupe relies
    // on this for N-in-one-tick bursts).
    for (let i = 1; i < ex.length; i++) {
      if (!(ex[i].id > ex[i - 1].id)) fail(`napalm ids not strictly increasing at i=${i}: ${ex[i - 1].id} then ${ex[i].id}`);
    }
    // Laid out left-to-right (cx non-decreasing in emission order).
    for (let i = 1; i < ex.length; i++) {
      if (ex[i].cx < ex[i - 1].cx) fail(`napalm cells not left-to-right at i=${i}: cx ${ex[i - 1].cx} then ${ex[i].cx}`);
    }
    if (!failed) log(`PASS: napalm emitted ${NAPALM_CELLS} distinct strictly-increasing ids in one tick, laid left-to-right.`);
  }
}

// --- Check 8: same-seed runs byte-identical (funky + betty) ---
{
  function serialize(state) {
    return JSON.stringify({
      phase: state.phase,
      turn: state.turn,
      activePlayerId: state.activePlayerId,
      wind: state.wind,
      winner: state.winner,
      // projectiles + projectile cover the new `bounces`/age fields; explosions
      // cover the fan/burst ids; terrain hex catches any divergent deform.
      projectiles: state.projectiles,
      projectile: state.projectile,
      explosions: state.explosions,
      lastExplosion: state.lastExplosion,
      tanks: state.tanks.map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health, alive: t.alive })),
      terrain: Buffer.from(state.terrain).toString('hex'),
    });
  }
  function run(aim) {
    return serialize(fireShot(freshEngine(), aim).st);
  }
  const f1 = run(FUNKY_AIM);
  const f2 = run(FUNKY_AIM);
  if (f1 !== f2) fail('two same-seed funky_bomb runs DIVERGED (NON-DETERMINISTIC fan/split)');
  else log(`PASS: two same-seed funky_bomb runs byte-identical (len ${f1.length}).`);

  const b1 = run(BETTY_AIM);
  const b2 = run(BETTY_AIM);
  if (b1 !== b2) fail('two same-seed bouncing_betty runs DIVERGED (NON-DETERMINISTIC bounce normal/reflection)');
  else log(`PASS: two same-seed bouncing_betty runs byte-identical (len ${b1.length}).`);
}

if (failed) {
  log('\nMOTION CHECK: FAILED');
  process.exit(1);
} else {
  log('\nMOTION CHECK: PASSED');
  process.exit(0);
}
