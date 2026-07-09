/**
 * ADVERSARIAL collision / OOB check (dimension="collision").
 *
 * Run with tsx so the TypeScript shared/ sources import directly:
 *   npx tsx scripts/checks/collision.mjs
 *
 * This script REFUTES the collision + out-of-bounds + deform logic in
 * shared/src/engine/{Physics,Terrain,Tank,GameEngine}.ts by exercising the
 * edge cases the spec/contract calls out and asserting correct classification.
 *
 * It does NOT import via the @shared alias (forbidden in shared/) — it reaches
 * the engine through relative paths to the actual source, the same way the
 * engine's own internal imports do.
 */

import {
  collide,
  sweepCollide,
  stepProjectile,
  launchVelocity,
} from '../../shared/src/engine/Physics.ts';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  deform,
  applyGravity,
  surfaceAt,
} from '../../shared/src/engine/Terrain.ts';
import {
  createTank,
  placeTwoTanks,
  barrelTip,
  BARREL_LENGTH,
  TANK_WIDTH,
  TANK_HEIGHT,
} from '../../shared/src/engine/Tank.ts';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label, detail = '') {
  if (cond) {
    pass++;
    // console.log(`  ok  - ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  FAIL - ${label}${detail ? ' :: ' + detail : ''}`);
  }
}

function eq(a, b, label) {
  ok(a === b, label, `expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

// A flat terrain BITMAP at a known surface y: a Uint8Array(800*500) with every
// pixel solid (1) for y in [surfaceY, CANVAS_HEIGHT) and air (0) above. This is
// exactly what collide()/sweepCollide() now consume (the engine holds the same
// pixel bitmap by reference).
function flatBitmap(surfaceY) {
  const b = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const s = surfaceY < 0 ? 0 : surfaceY > CANVAS_HEIGHT ? CANVAS_HEIGHT : surfaceY;
  for (let y = s; y < CANVAS_HEIGHT; y++) {
    const row = y * CANVAS_WIDTH;
    for (let x = 0; x < CANVAS_WIDTH; x++) b[row + x] = 1;
  }
  return b;
}

function mkProjectile(x, y, vx = 0, vy = 0) {
  return { x, y, vx, vy, weaponType: 'baby_missile' };
}

// ---------------------------------------------------------------------------
const LAST_COL = CANVAS_WIDTH - 1; // last valid column index
console.log(`\n[1] OOB exact boundaries (x=0 in, x=${LAST_COL} in, x=${CANVAS_WIDTH} oob, x<0 oob)`);
// ---------------------------------------------------------------------------
{
  const terrain = flatBitmap(490); // ground low so we don't accidentally hit it
  const tanks = [];

  // x === 0 : IN bounds (not OOB). At y above ground => 'none'.
  eq(collide(mkProjectile(0, 10), terrain, tanks).type, 'none',
    'x=0 is in-bounds (high in air => none)');

  // x === LAST_COL : last valid column, IN bounds.
  eq(collide(mkProjectile(LAST_COL, 10), terrain, tanks).type, 'none',
    `x=${LAST_COL} is in-bounds (high in air => none)`);

  // x === CANVAS_WIDTH : OOB (>= CANVAS_WIDTH).
  eq(collide(mkProjectile(CANVAS_WIDTH, 10), terrain, tanks).type, 'oob',
    `x=${CANVAS_WIDTH} is OOB`);

  // just over the right edge
  eq(collide(mkProjectile(CANVAS_WIDTH + 0.0001, 10), terrain, tanks).type, 'oob',
    `x=${CANVAS_WIDTH}.0001 is OOB`);

  // x just below 0
  eq(collide(mkProjectile(-0.0001, 10), terrain, tanks).type, 'oob',
    'x=-0.0001 is OOB');
  eq(collide(mkProjectile(-50, 10), terrain, tanks).type, 'oob',
    'x=-50 is OOB');

  // fractional last column, floor -> LAST_COL, still in bounds, none in air.
  eq(collide(mkProjectile(CANVAS_WIDTH - 0.0001, 10), terrain, tanks).type, 'none',
    `x=${LAST_COL}.9999 is in-bounds (floor=${LAST_COL})`);

  // ADVERSARIAL: ensure an in-bounds column never indexes terrain out of range.
  // floor(CANVAS_WIDTH-0.0001)=LAST_COL is a valid index; floor(CANVAS_WIDTH) would
  // be OOB but that path is short-circuited by the OOB check. Confirm ground hit.
  eq(collide(mkProjectile(LAST_COL, 495), terrain, tanks).type, 'ground',
    `x=${LAST_COL} at/below surface => ground (valid index, no OOR)`);
}

// ---------------------------------------------------------------------------
console.log('[2] Fired straight up returns and hits GROUND near origin (not OOB first)');
// ---------------------------------------------------------------------------
{
  // Tank near left edge on flat ground. Fire straight up (90deg). vx must be ~0
  // so x never leaves bounds; projectile must come back down and hit GROUND,
  // and the ground impact x must be ~the launch x (near origin), never OOB.
  const surfaceY = 400;
  const terrain = flatBitmap(surfaceY);
  // createTank expects a number[] HEIGHT LINE (Tank.ts is unchanged), so give it
  // a flat line at the same surface; collide() below gets the matching bitmap.
  const heightLine = new Array(CANVAS_WIDTH).fill(surfaceY);
  const tank = createTank('p1', 'P1', 60, heightLine, '#fff');

  const v = launchVelocity(90, 70);
  ok(Math.abs(v.vx) < 1e-9, 'straight-up vx ~ 0', `vx=${v.vx}`);
  ok(v.vy < 0, 'straight-up vy is upward (negative)', `vy=${v.vy}`);

  const tip = barrelTip(tank, BARREL_LENGTH);
  const p = mkProjectile(tip.x, tip.y, v.vx, v.vy);

  let result = { type: 'none' };
  let ticks = 0;
  const launchX = p.x;
  let sawOob = false;
  while (result.type === 'none' && ticks < 100000) {
    stepProjectile(p, 0);
    result = collide(p, terrain, []);
    if (result.type === 'oob') { sawOob = true; break; }
    ticks++;
  }
  ok(!sawOob, 'straight-up shot never goes OOB before landing');
  eq(result.type, 'ground', 'straight-up shot ends on GROUND');
  ok(Math.abs(result.x - launchX) < 1.0, 'ground impact x ~ launch x (near origin)',
    `launchX=${launchX} impactX=${result.x}`);
  ok(Math.abs(result.y - surfaceY) < Math.abs(v.vy) + 1, 'impact y ~ surface',
    `impactY=${result.y} surface=${surfaceY}`);
}

// ---------------------------------------------------------------------------
console.log('[3] Aimed AT enemy tank => tank hit (AABB); near-miss => not a tank hit');
// ---------------------------------------------------------------------------
{
  const terrain = flatBitmap(490);
  // Enemy tank with base at y=400, x=400. AABB spans:
  //   x in [400-10, 400+10] = [390,410]; y in [400-12, 400] = [388,400].
  const enemyLine = new Array(CANVAS_WIDTH).fill(490); // height line for createTank
  const enemy = createTank('p2', 'P2', 400, enemyLine, '#00f');
  enemy.y = 400;
  const tanks = [enemy];

  // Point dead-center of the box.
  eq(collide(mkProjectile(400, 394), terrain, tanks).type, 'tank',
    'projectile inside enemy AABB => tank');

  // Corners (inclusive boundary).
  eq(collide(mkProjectile(390, 388), terrain, tanks).type, 'tank',
    'AABB top-left corner inclusive => tank');
  eq(collide(mkProjectile(410, 400), terrain, tanks).type, 'tank',
    'AABB bottom-right corner inclusive => tank');

  // Near-miss: just left of the box, in the air (above ground).
  eq(collide(mkProjectile(389.5, 394), terrain, tanks).type, 'none',
    'just left of AABB in air => none (near-miss)');
  // Near-miss: just above the box.
  eq(collide(mkProjectile(400, 387.5), terrain, tanks).type, 'none',
    'just above AABB in air => none (near-miss)');

  // A dead tank must NOT block.
  const deadTanks = [{ ...enemy, alive: false }];
  eq(collide(mkProjectile(400, 394), terrain, deadTanks).type, 'none',
    'dead tank does not register a tank hit');
}

// ---------------------------------------------------------------------------
console.log('[4] deform at bitmap EDGES (cx near 0 / near 800): no OOR / NaN');
// ---------------------------------------------------------------------------
{
  // A deformed bitmap must stay a valid pixel buffer: fixed length (800*500),
  // every cell strictly 0 or 1, never NaN, and no out-of-range index error
  // (which would throw above and fail the harness outright).
  function assertCleanBitmap(b, label) {
    let bad = false;
    for (let i = 0; i < b.length; i++) {
      const v = b[i];
      if (v !== 0 && v !== 1) {
        bad = true;
        failures.push(`${label}: bitmap[${i}]=${v} not in {0,1}`);
        break;
      }
    }
    ok(!bad, label);
    eq(b.length, CANVAS_WIDTH * CANVAS_HEIGHT, `${label}: length unchanged`);
  }

  // Edge / off-canvas blast centers must not throw or corrupt the buffer.
  let b = flatBitmap(300);
  deform(b, 0, 300, 40);        // center at exact left edge
  assertCleanBitmap(b, 'deform cx=0 r=40');

  b = flatBitmap(300);
  deform(b, -30, 300, 40);      // center off the left edge
  assertCleanBitmap(b, 'deform cx=-30 r=40');

  b = flatBitmap(300);
  deform(b, CANVAS_WIDTH - 1, 300, 40);  // center at right edge x=799
  assertCleanBitmap(b, 'deform cx=799 r=40');

  b = flatBitmap(300);
  deform(b, CANVAS_WIDTH, 300, 40);      // center at x=800 (one past)
  assertCleanBitmap(b, 'deform cx=800 r=40');

  b = flatBitmap(300);
  deform(b, CANVAS_WIDTH + 50, 300, 40); // center well off right
  assertCleanBitmap(b, 'deform cx=850 r=40');

  // A centered crater + gravity actually LOWERS the surface (surfaceAt grows).
  b = flatBitmap(300);
  const surfaceBefore = surfaceAt(b, 400);
  const range = deform(b, 400, 400, 20);
  ok(range !== null, 'centered crater wrote pixels (deform returned a range)');
  if (range !== null) applyGravity(b, range.xStart, range.xEnd);
  ok(surfaceAt(b, 400) > surfaceBefore,
    'centered crater lowered the surface (surfaceAt increased)',
    `before=${surfaceBefore} after=${surfaceAt(b, 400)}`);
  assertCleanBitmap(b, 'centered crater bitmap still valid');

  // r<=0 and degenerate radius are no-ops: deform returns null, bitmap unchanged.
  b = flatBitmap(300);
  const before0 = surfaceAt(b, 400);
  ok(deform(b, 400, 300, 0) === null, 'r=0 returns null (no-op)');
  ok(surfaceAt(b, 400) === before0, 'r=0 left the bitmap unchanged');
  ok(deform(b, 400, 300, -5) === null, 'r<0 returns null (no-op)');
  ok(surfaceAt(b, 400) === before0, 'r<0 left the bitmap unchanged');
}

// ---------------------------------------------------------------------------
console.log('[5] Projectile does NOT collide with its OWN tank on the first tick');
// ---------------------------------------------------------------------------
{
  // Build via the real engine so spawn point = barrelTip, exactly as gameplay.
  const engine = new GameEngine({ seed: 12345 });
  const s0 = engine.getState();
  const shooter = s0.tanks[0];

  // Aim and fire.
  engine.applyAction({ type: 'set_angle', angle: 45 });
  engine.applyAction({ type: 'set_power', power: 60 });
  engine.applyAction({ type: 'fire' });

  const after = engine.getState();
  ok(after.phase === 'FIRING', 'phase is FIRING after fire');
  ok(after.projectiles.length === 1, 'one projectile spawned after fire');

  // The projectile spawn must NOT already be inside the shooter's AABB.
  const p = after.projectiles[0];
  const halfW = TANK_WIDTH / 2;
  const insideOwn =
    p.x >= shooter.x - halfW &&
    p.x <= shooter.x + halfW &&
    p.y >= shooter.y - TANK_HEIGHT &&
    p.y <= shooter.y;
  ok(!insideOwn, 'spawn (barrel tip) is OUTSIDE the shooter AABB',
    `spawn=(${p.x.toFixed(2)},${p.y.toFixed(2)}) tank base=(${shooter.x},${shooter.y})`);

  // Now run exactly ONE engine tick. It must not immediately resolve as a hit
  // ON THE SHOOTER (it should still be flying, OR have hit something that is not
  // the firing tank). Easiest robust assertion: after one tick we are not back
  // in PLAYER_TURN due to colliding with our own tank at the spawn.
  const angleUpTip = barrelTip(shooter, BARREL_LENGTH);
  ok(Math.abs(angleUpTip.x - p.x) < 1e-6 && Math.abs(angleUpTip.y - p.y) < 1e-6,
    'engine spawned projectile exactly at barrelTip');

  // Directly assert collide() on the freshly-spawned projectile vs all tanks
  // BEFORE any integration: at 45deg the barrel tip is up-and-right of the body,
  // so it must NOT be a tank hit on tick 0.
  const tanksNow = after.tanks;
  const firstCheck = collide(
    { x: p.x, y: p.y, vx: p.vx, vy: p.vy, weaponType: p.weaponType },
    s0.terrain,
    tanksNow,
  );
  ok(firstCheck.type !== 'tank' || firstCheck.tankId !== shooter.id,
    'pre-integration collide is not a self-tank hit',
    `got ${JSON.stringify(firstCheck)}`);

  // Run one real tick and confirm no self-detonation at origin: projectile
  // should still be in flight (phase FIRING) for a 45deg/60-power shot.
  engine.tick();
  const t1 = engine.getState();
  ok(t1.phase === 'FIRING' && t1.projectiles.length === 1,
    'after first tick projectile still in flight (no self-collision)',
    `phase=${t1.phase}`);
}

// ---------------------------------------------------------------------------
console.log('[6] Full-flight integration: a real shot lands (ground or tank), never hangs');
// ---------------------------------------------------------------------------
{
  const engine = new GameEngine({ seed: 777 });
  engine.applyAction({ type: 'set_angle', angle: 60 });
  engine.applyAction({ type: 'set_power', power: 80 });
  engine.applyAction({ type: 'fire' });

  let ticks = 0;
  while ((engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') && ticks < 100000) {
    engine.tick();
    ticks++;
  }
  ok(ticks < 100000, 'shot resolves within bounded ticks (no infinite flight)');
  eq(engine.getState().phase, 'PLAYER_TURN', 'engine returns to PLAYER_TURN after resolve');
  ok(engine.getState().projectiles.length === 0, 'projectiles cleared after resolve');
}

// ---------------------------------------------------------------------------
console.log('[7] placeTwoTanks rest ON the surface (sanity for spawn collision basis)');
// ---------------------------------------------------------------------------
{
  // placeTwoTanks is UNCHANGED and operates on a number[] HEIGHT LINE (Tank.ts is
  // untouched), NOT the pixel bitmap. Build a plain height line for this test.
  const heightLine = new Array(CANVAS_WIDTH).fill(420);
  const tanks = placeTwoTanks(heightLine);
  eq(tanks.length, 2, 'two tanks placed');
  for (const t of tanks) {
    eq(t.y, heightLine[Math.round(t.x)], `tank ${t.id} base sits at surface`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n[8] Swept collision: a FAST shot cannot tunnel through thin spikes / tanks');
// ---------------------------------------------------------------------------
// The per-tick displacement at max power (100 * POWER_SCALE = 24px) exceeds
// TANK_WIDTH (20px), so a plain post-step point test would tunnel. sweepCollide
// must catch these by sampling along the travelled segment.
{
  // (a) A thin 1px terrain spike directly in the flight path: an otherwise-empty
  // bitmap with a SINGLE solid COLUMN at x=400 (solid from y=250 down). A fast
  // horizontal shot at y=260 crosses that column (hit) but the empty neighbouring
  // columns must not register — preserves the no-tunnel intent on a 1px feature.
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT); // all air
  for (let y = 250; y < CANVAS_HEIGHT; y++) terrain[y * CANVAS_WIDTH + 400] = 1;

  let tunneled = 0;
  let hitSpike = 0;
  // Sweep many sub-pixel approach phases so we don't get lucky with alignment.
  for (let phase = 0; phase < 60; phase++) {
    const startX = 380 + phase / 60; // just left of the spike, sub-px offsets
    // Fly at y=260, which is BELOW the column's top (250) so the segment passes
    // THROUGH the solid column at x=400; every other column is pure air, so only
    // the column can register a hit.
    const p = mkProjectile(startX, 260, 30, 0); // 30px/tick, faster than any feature
    const prevX = p.x;
    const prevY = p.y;
    stepProjectile(p, 0); // advance one big step PAST the spike (x ~ 410)
    const hit = sweepCollide(p, prevX, prevY, terrain, []);
    if (hit.type === 'ground') hitSpike++;
    else tunneled++;
  }
  eq(tunneled, 0, 'no fast shot tunnels through a 1px terrain spike (swept)');
  ok(hitSpike === 60, '1px spike caught on every approach phase', `caught ${hitSpike}/60`);

  // (b) Same flight against a 20px tank. A point-only test tunnels ~45% of the
  // time at this speed; swept must be 0%.
  const flat = flatBitmap(CANVAS_HEIGHT - 1);
  // createTank needs a number[] height line; the tank's y is read from it, and
  // collide() gets the matching bitmap below.
  const tankLine = new Array(CANVAS_WIDTH).fill(CANVAS_HEIGHT - 1);
  const tank = createTank('t', 'T', 400, tankLine, '#fff');
  let tankTunneled = 0;
  for (let phase = 0; phase < 60; phase++) {
    const startX = 360 + phase / 60;
    const tankY = tank.y; // base
    const p = mkProjectile(startX, tankY - TANK_HEIGHT / 2, 30, 0);
    const prevX = p.x;
    const prevY = p.y;
    stepProjectile(p, 0);
    const hit = sweepCollide(p, prevX, prevY, flat, [tank]);
    if (hit.type !== 'tank') tankTunneled++;
  }
  eq(tankTunneled, 0, 'no fast shot tunnels through a 20px tank (swept)');

  // (c) Determinism: sweepCollide is a pure function of its inputs — same inputs
  // twice yields the same classification and snapped impact point.
  const t1 = flatBitmap(300);
  const pa = mkProjectile(100, 250, 30, 40);
  const pax = pa.x, pay = pa.y;
  stepProjectile(pa, 0);
  const ha = sweepCollide(pa, pax, pay, t1, []);
  const pb = mkProjectile(100, 250, 30, 40);
  const pbx = pb.x, pby = pb.y;
  stepProjectile(pb, 0);
  const hb = sweepCollide(pb, pbx, pby, t1, []);
  ok(
    JSON.stringify(ha) === JSON.stringify(hb) && pa.x === pb.x && pa.y === pb.y,
    'sweepCollide is deterministic (same inputs => same hit + snap point)',
  );
}

// ---------------------------------------------------------------------------
console.log('\n===========================================');
console.log(`collision check: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
} else {
  console.log('ALL COLLISION/OOB ASSERTIONS PASSED');
}
