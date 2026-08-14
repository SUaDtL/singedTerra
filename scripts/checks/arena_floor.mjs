/**
 * Deterministic regression harness for the protected arena floor that reserves
 * the bottom 100 logical pixels for the instrumentation rail.
 *
 * Run: npx tsx scripts/checks/arena_floor.mjs
 */

import * as Terrain from '../../shared/src/engine/Terrain.ts';
import { collide, sweepCollide } from '../../shared/src/engine/Physics.ts';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

const EXPECTED_FLOOR_Y = 500;
let pass = 0;
let fail = 0;

function eq(actual, expected, label) {
  if (actual === expected) {
    pass++;
    return;
  }
  fail++;
  console.log(`FAIL - ${label}: expected ${expected}, got ${actual}`);
}

console.log('[arena floor] protected shared boundary');

eq(Terrain.ARENA_FLOOR_Y, EXPECTED_FLOOR_Y,
  'exports the logical top edge of the covered instrumentation rail');

{
  const air = new Uint8Array(Terrain.BITMAP_LEN);
  eq(Terrain.surfaceAt(air, 400), EXPECTED_FLOOR_Y,
    'an all-air column synthesizes the protected floor surface');
}

{
  const terrain = Terrain.buildBitmap(new Uint16Array(Terrain.CANVAS_WIDTH).fill(Terrain.CANVAS_HEIGHT));
  Terrain.deform(terrain, 400, EXPECTED_FLOOR_Y, 60, false);
  eq(Terrain.pixelAt(terrain, 400, EXPECTED_FLOOR_Y), Terrain.SOLID_PIXEL,
    'a crater cannot clear the protected base at the rail edge');
  eq(Terrain.pixelAt(terrain, 400, Terrain.CANVAS_HEIGHT - 1), Terrain.SOLID_PIXEL,
    'a crater cannot clear the protected base below the rail edge');
}

{
  const terrain = new Uint8Array(Terrain.BITMAP_LEN);
  const projectile = { x: 400, y: EXPECTED_FLOOR_Y, vx: 0, vy: 1, weaponType: 'baby_missile' };
  eq(collide(projectile, terrain, []).type, 'ground',
    'a downward projectile collides at the logical floor, not canvas bottom');
}

{
  const terrain = new Uint8Array(Terrain.BITMAP_LEN);
  const projectile = { x: 400, y: EXPECTED_FLOOR_Y + 0.9, vx: 0, vy: 1, weaponType: 'baby_missile' };
  const hit = sweepCollide(projectile, 400, EXPECTED_FLOOR_Y - 0.1, terrain, []);
  eq(hit.type, 'ground', 'a swept floor crossing reports a ground impact');
  eq(hit.y, EXPECTED_FLOOR_Y, 'a swept floor crossing reports the exact logical impact y');
  eq(projectile.y, EXPECTED_FLOOR_Y, 'a swept floor crossing snaps the projectile to the logical impact y');
}

{
  const terrain = new Uint8Array(Terrain.BITMAP_LEN);
  terrain[495 * Terrain.CANVAS_WIDTH + 400] = Terrain.SOLID_PIXEL;
  const projectile = { x: 400, y: EXPECTED_FLOOR_Y + 10, vx: 0, vy: 1, weaponType: 'baby_missile' };
  const hit = sweepCollide(projectile, 400, 490, terrain, []);
  eq(hit.type, 'ground', 'a swept crossing detects earlier terrain before the logical floor');
  eq(hit.y, 495, 'an earlier terrain impact keeps its own impact y');
  eq(projectile.y, 495, 'an earlier terrain impact keeps the projectile above the rail');
}

{
  const terrain = new Uint8Array(Terrain.BITMAP_LEN);
  for (let x = 520; x <= 680; x++) {
    for (let y = EXPECTED_FLOOR_Y - 2; y < Terrain.CANVAS_HEIGHT; y++) {
      terrain[y * Terrain.CANVAS_WIDTH + x] = Terrain.SOLID_PIXEL;
    }
  }
  Terrain.applyTerrainHazards(terrain, 1337, 'lava');
  for (let x = 520; x <= 680; x++) {
    for (let y = EXPECTED_FLOOR_Y; y < Terrain.CANVAS_HEIGHT; y++) {
      eq(terrain[y * Terrain.CANVAS_WIDTH + x], Terrain.SOLID_PIXEL,
        `lava hazard keeps protected base solid at (${x}, ${y})`);
    }
  }
}

{
  const engine = new GameEngine({ seed: 24680 });
  for (const tank of engine.getState().tanks) {
    eq(tank.y <= EXPECTED_FLOOR_Y, true,
      `fresh engine tank ${tank.id} resolves above the protected rail`);
  }
}

console.log(`arena floor check: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
