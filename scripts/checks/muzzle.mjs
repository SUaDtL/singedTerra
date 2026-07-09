/**
 * MUZZLE / projectile-spawn check (dimension="muzzle").
 *
 * Run with tsx so the TypeScript shared/ sources import directly:
 *   npx tsx scripts/checks/muzzle.mjs
 *
 * Contract proved: a fired projectile spawns at the tank's VISUAL barrel tip —
 * the barrel pivots at the turret top (20px above tank.y, the tread bottom)
 * with barrel length 22, matching TankRenderer's geometry — NOT at ground
 * level. Regression test for the "shells exit near the tank's center of mass"
 * defect: barrelTip() used to pivot at (x, y) with length 18, so a horizontal
 * shot spawned at the tread bottom, ~20px below the visible muzzle.
 *
 * Also guards two invariants the fix must not break:
 *  - the engine spawn stays exactly barrelTip(tank, BARREL_LENGTH) — the same
 *    single source of truth the AI forward-sim uses (REVIEW_BACKLOG P3-15);
 *  - the spawn point sits OUTSIDE the shooter's own AABB at every legal angle
 *    (0..180), so a shot can never self-collide on its spawn tick.
 */

import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import {
  createTank,
  barrelTip,
  BARREL_LENGTH,
  TANK_WIDTH,
  TANK_HEIGHT,
} from '../../shared/src/engine/Tank.ts';
import { collide } from '../../shared/src/engine/Physics.ts';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../shared/src/engine/Terrain.ts';

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label, detail = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${label}${detail ? ' :: ' + detail : ''}`);
    console.log(`  FAIL - ${label}${detail ? ' :: ' + detail : ''}`);
  }
}

// The VISUAL barrel geometry (mirrors TankRenderer.ts): the barrel pivots at
// the turret top — tread (6) + body (10) + turret offset (4) = 20px above the
// tank base — and is 22px long. Pinned here as the EXPECTED physics contract:
// the shell must leave from where the barrel is drawn.
const VISUAL_PIVOT_ABOVE_BASE = 20;
const VISUAL_BARREL_LENGTH = 22;

const EPS = 1e-9;

/** Expected spawn point for a tank at (x, y) aiming at angleDeg. */
function visualMuzzle(x, y, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: x + VISUAL_BARREL_LENGTH * Math.cos(rad),
    y: y - VISUAL_PIVOT_ABOVE_BASE - VISUAL_BARREL_LENGTH * Math.sin(rad),
  };
}

/** Fire one shot at (angle, power) on a fresh engine; return {shooter, p}. */
function fireOnce(angle) {
  const engine = new GameEngine({ seed: 4242 });
  const shooter = engine.getState().tanks[0];
  const sx = shooter.x;
  const sy = shooter.y;
  engine.applyAction({ type: 'set_angle', angle });
  engine.applyAction({ type: 'set_power', power: 50 });
  engine.applyAction({ type: 'fire' });
  const state = engine.getState();
  ok(state.projectiles.length === 1, `angle ${angle}: one projectile spawned`);
  return { sx, sy, shooter: state.tanks[0], p: state.projectiles[0] };
}

// ---------------------------------------------------------------------------
console.log('\n[1] REGRESSION: shell spawns at the VISUAL muzzle, not ground level (OB-1)');
// ---------------------------------------------------------------------------
{
  // The defining case: a HORIZONTAL shot. Broken behavior spawns it at the
  // tread bottom (spawn.y === tank.y); correct behavior spawns it at the
  // barrel tip, 20px above the base.
  for (const angle of [0, 45, 90, 135, 180]) {
    const { sx, sy, p } = fireOnce(angle);
    const want = visualMuzzle(sx, sy, angle);
    ok(
      Math.abs(p.x - want.x) < EPS,
      `angle ${angle}: spawn x at visual muzzle`,
      `got ${p.x}, want ${want.x} (tank x=${sx})`,
    );
    ok(
      Math.abs(p.y - want.y) < EPS,
      `angle ${angle}: spawn y at visual muzzle`,
      `got ${p.y}, want ${want.y} (tank base y=${sy})`,
    );
  }

  // The bug's sharpest symptom, asserted directly: at angle 0 the shell must
  // NOT leave at tread-bottom height.
  const { sy, p } = fireOnce(0);
  ok(
    p.y < sy - TANK_HEIGHT,
    'horizontal shot exits ABOVE the tank body, not at its base',
    `spawn y=${p.y}, tank base y=${sy}, body top y=${sy - TANK_HEIGHT}`,
  );
}

// ---------------------------------------------------------------------------
console.log('[2] GUARD: engine spawn === barrelTip(tank, BARREL_LENGTH) (OB-2, P3-15)');
// ---------------------------------------------------------------------------
{
  // The AI forward-sim aims from barrelTip(me, BARREL_LENGTH) (AI.ts). If the
  // engine ever spawns from anywhere else, bot aim silently diverges from
  // real shots. Must hold before AND after the muzzle fix.
  for (const angle of [10, 77, 160]) {
    const { shooter, p } = fireOnce(angle);
    const tip = barrelTip(shooter, BARREL_LENGTH);
    ok(
      Math.abs(tip.x - p.x) < EPS && Math.abs(tip.y - p.y) < EPS,
      `angle ${angle}: engine spawned exactly at barrelTip(tank, BARREL_LENGTH)`,
      `spawn=(${p.x},${p.y}) tip=(${tip.x},${tip.y})`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log('[3] GUARD: spawn point is outside the shooter AABB at every legal angle (OB-3)');
// ---------------------------------------------------------------------------
{
  // Pure-geometry sweep over the full legal angle range. The shooter's AABB
  // spans x±TANK_WIDTH/2, y-TANK_HEIGHT..y; collide() must never classify the
  // spawn point as a hit on the shooter itself.
  const surfaceY = 300;
  const heightLine = new Array(CANVAS_WIDTH).fill(surfaceY);
  const tank = createTank('p1', 'P1', 400, heightLine, '#fff');
  const air = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT); // all-air bitmap

  const halfW = TANK_WIDTH / 2;
  for (let angle = 0; angle <= 180; angle += 1) {
    tank.angle = angle;
    const tip = barrelTip(tank, BARREL_LENGTH);
    const insideOwn =
      tip.x >= tank.x - halfW &&
      tip.x <= tank.x + halfW &&
      tip.y >= tank.y - TANK_HEIGHT &&
      tip.y <= tank.y;
    ok(!insideOwn, `angle ${angle}: spawn outside own AABB`,
      `tip=(${tip.x.toFixed(2)},${tip.y.toFixed(2)})`);
    const hit = collide(
      { x: tip.x, y: tip.y, vx: 0, vy: 0, weaponType: 'baby_missile' },
      air,
      [tank],
    );
    ok(hit.type !== 'tank', `angle ${angle}: collide() at spawn is not a self-hit`,
      `got ${JSON.stringify(hit)}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n===========================================');
console.log(`muzzle check: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
} else {
  console.log('ALL MUZZLE ASSERTIONS PASSED');
}
