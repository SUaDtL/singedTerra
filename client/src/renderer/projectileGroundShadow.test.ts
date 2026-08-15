import { describe, expect, it } from 'vitest';
import { ARENA_FLOOR_Y, CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import {
  GROUND_SHADOW_MAX_ALPHA,
  GROUND_SHADOW_MAX_RADIUS_X,
  GROUND_SHADOW_MAX_RADIUS_Y,
  GROUND_SHADOW_MIN_ALPHA,
  GROUND_SHADOW_MIN_RADIUS_X,
  GROUND_SHADOW_MIN_RADIUS_Y,
  getProjectileGroundShadow,
} from './projectileGroundShadow';

function terrainWithSurface(columns: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  for (const [x, surfaceY] of columns) {
    for (let y = surfaceY; y < CANVAS_HEIGHT; y++) {
      terrain[y * CANVAS_WIDTH + x] = 1;
    }
  }
  return terrain;
}

function byteHash(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

describe('getProjectileGroundShadow', () => {
  it('projects onto the current live terrain column without mutating either input', () => {
    const terrain = terrainWithSurface([[100, 320], [101, 300]]);
    const terrainBefore = byteHash(terrain);
    const projectile = { x: 100.75, y: 260 } as const;
    const projectileBefore = { ...projectile };

    const first = getProjectileGroundShadow(projectile, terrain);
    const craterWall = getProjectileGroundShadow({ x: 101, y: 260 }, terrain);

    expect(first?.x).toBe(100.75);
    expect(first?.groundY).toBe(320);
    expect(first?.altitude).toBe(60);
    expect(craterWall?.groundY).toBe(300);
    expect(craterWall?.altitude).toBe(40);
    expect(projectile).toEqual(projectileBefore);
    expect(byteHash(terrain)).toBe(terrainBefore);
  });

  it('widens and softens monotonically with altitude, then stays capped', () => {
    const terrain = terrainWithSurface([[200, 320]]);
    const low = getProjectileGroundShadow({ x: 200, y: 310 }, terrain);
    const middle = getProjectileGroundShadow({ x: 200, y: 170 }, terrain);
    const high = getProjectileGroundShadow({ x: 200, y: -500 }, terrain);

    expect(low).not.toBeNull();
    expect(middle).not.toBeNull();
    expect(high).not.toBeNull();
    expect(low!.radiusX).toBeLessThan(middle!.radiusX);
    expect(middle!.radiusX).toBeLessThanOrEqual(high!.radiusX);
    expect(low!.radiusY).toBeLessThan(middle!.radiusY);
    expect(middle!.radiusY).toBeLessThanOrEqual(high!.radiusY);
    expect(low!.alpha).toBeGreaterThan(middle!.alpha);
    expect(middle!.alpha).toBeGreaterThanOrEqual(high!.alpha);
    expect(high!.radiusX).toBe(GROUND_SHADOW_MAX_RADIUS_X);
    expect(high!.radiusY).toBe(GROUND_SHADOW_MAX_RADIUS_Y);
    expect(high!.alpha).toBeCloseTo(GROUND_SHADOW_MIN_ALPHA);
  });

  it('pins the exact bounded altitude envelope at low, middle, and cap', () => {
    const terrain = terrainWithSurface([[300, 320]]);
    const low = getProjectileGroundShadow({ x: 300, y: 320 - 1 }, terrain);
    const middle = getProjectileGroundShadow({ x: 300, y: 320 - 160 }, terrain);
    const cap = getProjectileGroundShadow({ x: 300, y: 320 - 320 }, terrain);

    expect(low!.radiusX).toBeCloseTo(GROUND_SHADOW_MIN_RADIUS_X + (21 / 320));
    expect(low!.radiusY).toBeCloseTo(GROUND_SHADOW_MIN_RADIUS_Y + (4 / 320));
    expect(low!.alpha).toBeCloseTo(GROUND_SHADOW_MAX_ALPHA - (0.32 / 320));
    expect(middle!.radiusX).toBeCloseTo(19.5);
    expect(middle!.radiusY).toBeCloseTo(5);
    expect(middle!.alpha).toBeCloseTo(0.36);
    expect(cap!.radiusX).toBe(GROUND_SHADOW_MAX_RADIUS_X);
    expect(cap!.radiusY).toBe(GROUND_SHADOW_MAX_RADIUS_Y);
    expect(cap!.alpha).toBeCloseTo(GROUND_SHADOW_MIN_ALPHA);
  });

  it('fails closed off-canvas, at/below ground, and for malformed state', () => {
    const terrain = terrainWithSurface([[10, 320]]);
    const shortTerrain = new Uint8Array(20);
    const invalid = [
      { projectile: { x: -0.01, y: 20 }, terrain },
      { projectile: { x: CANVAS_WIDTH, y: 20 }, terrain },
      { projectile: { x: Number.NaN, y: 20 }, terrain },
      { projectile: { x: 10, y: Number.POSITIVE_INFINITY }, terrain },
      { projectile: { x: 10, y: 320 }, terrain },
      { projectile: { x: 10, y: 321 }, terrain },
      { projectile: { x: 10, y: 20 }, terrain: shortTerrain },
    ];

    for (const sample of invalid) {
      expect(getProjectileGroundShadow(sample.projectile, sample.terrain)).toBeNull();
    }
  });

  it('projects all-air terrain onto the synthesized arena floor', () => {
    const shadow = getProjectileGroundShadow(
      { x: 10, y: 20 },
      new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT),
    );

    expect(shadow?.groundY).toBe(ARENA_FLOOR_Y);
  });
});
