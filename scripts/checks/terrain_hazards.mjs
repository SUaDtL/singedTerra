import assert from 'node:assert/strict';
import {
  AIR_PIXEL,
  SOLID_PIXEL,
  LAVA_PIXEL,
  applyTerrainHazards,
  generateBitmap,
  normalizeTerrainHazardMode,
  deform,
  settleStep,
} from '../../shared/src/engine/Terrain.ts';
import { collide } from '../../shared/src/engine/Physics.ts';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';

assert.equal(AIR_PIXEL, 0);
assert.equal(SOLID_PIXEL, 1);
assert.equal(LAVA_PIXEL, 2);
assert.equal(normalizeTerrainHazardMode(undefined), 'none');
assert.equal(normalizeTerrainHazardMode('lava'), 'lava');
assert.equal(normalizeTerrainHazardMode('water'), 'none');

const first = generateBitmap(0x51ced);
const second = first.slice();
assert.equal(applyTerrainHazards(first, 0x51ced, 'lava') > 0, true);
assert.deepEqual(first, (() => {
  const copy = second.slice();
  applyTerrainHazards(copy, 0x51ced, 'lava');
  return copy;
})());
assert.deepEqual(second, generateBitmap(0x51ced));
assert.equal(applyTerrainHazards(second, 0x51ced, 'none'), 0);
assert.equal([...first].every((value) => value === AIR_PIXEL || value === SOLID_PIXEL || value === LAVA_PIXEL), true);
assert.equal(first.some((value) => value === LAVA_PIXEL), true);

const lavaIndex = first.findIndex((value) => value === LAVA_PIXEL);
const lavaX = lavaIndex % 1200;
const lavaY = Math.floor(lavaIndex / 1200);
assert.equal(collide({ x: lavaX + 0.1, y: lavaY + 0.1, vx: 0, vy: 0, weaponType: 'missile', age: 0, hasSplit: false, bounces: 0 }, first, []).material, 'lava');

const engine = new GameEngine({ maxPlayers: 2, seed: 0x51ced, hazards: 'lava' });
const engineLava = engine.getState().terrain.findIndex((value) => value === LAVA_PIXEL);
assert.equal(engineLava >= 0, true);
const tank = engine.getState().tanks[0];
const tankX = engineLava % 1200;
const tankSurface = Math.floor(engineLava / 1200);
tank.x = tankX;
tank.y = tankSurface - 5;
engine.resolveTanksToTerrain();
assert.equal(tank.alive, false);

const crater = new Uint8Array(1200 * 600);
crater[300 * 1200 + 300] = LAVA_PIXEL;
deform(crater, 300, 300, 2, false);
assert.equal(crater[300 * 1200 + 300], AIR_PIXEL);

const raised = new Uint8Array(1200 * 600);
raised[300 * 1200 + 300] = LAVA_PIXEL;
deform(raised, 300, 300, 2, true);
assert.equal(raised[300 * 1200 + 300], SOLID_PIXEL);

const settling = new Uint8Array(1200 * 600);
settling[20 * 1200 + 500] = LAVA_PIXEL;
assert.equal(settleStep(settling, 500, 500, 1), true);
assert.equal(settling[21 * 1200 + 500], LAVA_PIXEL);

const clone = engine.clone();
assert.deepEqual(clone.getState().terrain, engine.getState().terrain);

const fourSeat = new GameEngine({
  maxPlayers: 4,
  seed: 0,
  hazards: 'lava',
  players: [
    { name: 'A', color: '#a00' },
    { name: 'B', color: '#0a0' },
    { name: 'C', color: '#00a' },
    { name: 'D', color: '#aa0' },
  ],
});
for (const seat of fourSeat.getState().tanks) {
  assert.notEqual(
    fourSeat.getState().terrain[Math.floor(seat.y) * 1200 + Math.floor(seat.x)],
    LAVA_PIXEL,
  );
}

console.log('TERRAIN HAZARDS CHECK: PASSED');
