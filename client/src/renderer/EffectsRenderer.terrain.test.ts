import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { EffectsRenderer } from './EffectsRenderer';

function byteHash(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

interface EffectsTerrainSeam {
  debris: Array<{
    x: number; y: number; vx: number; vy: number; size: number; color: string;
    rot: number; vr: number; age: number; life: number; landed: boolean;
  }>;
  smoke: Array<{
    x: number; y: number; vy: number; r: number; grow: number;
    alpha: number; age: number; life: number;
  }>;
  sparks: Array<{
    x: number; y: number; vx: number; vy: number; color: string; age: number; life: number;
  }>;
  texts: Array<{
    x: number; y: number; vy: number; text: string; color: string;
    size: number; age: number; life: number;
  }>;
  update(terrain: Uint8Array): void;
}

describe('EffectsRenderer terrain-aware debris', () => {
  it('settles debris on live terrain while other effect families advance unchanged', () => {
    const renderer = new EffectsRenderer(false) as unknown as EffectsTerrainSeam;
    renderer.debris.push({
      x: 100, y: 2, vx: 0, vy: 2, size: 2, color: '#654321',
      rot: 0.4, vr: 0.2, age: 0, life: 20, landed: false,
    });
    renderer.smoke.push({
      x: 30, y: 20, vy: -1, r: 2, grow: 0.5, alpha: 0.2, age: 0, life: 20,
    });
    renderer.sparks.push({
      x: 40, y: 10, vx: 1, vy: 1, color: '#fff', age: 0, life: 20,
    });
    renderer.texts.push({
      x: 50, y: 20, vy: -1, text: '-5', color: '#fff', size: 12, age: 0, life: 20,
    });
    const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    terrain[5 * CANVAS_WIDTH + 99] = 1;
    terrain[5 * CANVAS_WIDTH + 100] = 1;
    terrain[5 * CANVAS_WIDTH + 101] = 1;
    const beforeTerrain = byteHash(terrain);

    renderer.update(terrain);

    expect(renderer.debris[0]).toMatchObject({
      x: 100, vx: 0, vy: 0, vr: 0, age: 1, landed: true,
    });
    expect(required(renderer.debris[0], 'settled debris').y).toBeLessThan(4);
    expect(renderer.smoke[0]).toMatchObject({ y: 19, r: 2.5, age: 1 });
    expect(renderer.sparks[0]).toMatchObject({ x: 41, age: 1 });
    const spark = required(renderer.sparks[0], 'advancing terrain spark');
    expect(spark.y).toBeCloseTo(11.12, 8);
    expect(spark.vy).toBeCloseTo(1.12, 8);
    expect(renderer.texts[0]).toMatchObject({ y: 19, age: 1 });
    expect(byteHash(terrain)).toBe(beforeTerrain);
  });

  it('keeps reduced-motion debris-free while retaining informational text', () => {
    const renderer = new EffectsRenderer(true) as unknown as EffectsTerrainSeam;

    (renderer as unknown as EffectsRenderer).spawnExplosion(100, 100, 40, '#fff');
    (renderer as unknown as EffectsRenderer).spawnWreck(100, 100, '#f00');
    (renderer as unknown as EffectsRenderer).spawnDamage(100, 100, 12);

    expect(renderer.debris).toHaveLength(0);
    expect(renderer.smoke).toHaveLength(0);
    expect(renderer.sparks).toHaveLength(0);
    expect(renderer.texts).toHaveLength(1);
  });

  it('culls debris at the exact lifetime boundary while retaining younger chunks', () => {
    const renderer = new EffectsRenderer(false) as unknown as EffectsTerrainSeam;
    const base = {
      x: 100, y: 2, vx: 0, vy: 0, size: 2, color: '#654321',
      rot: 0, vr: 0, life: 20, landed: false,
    };
    renderer.debris.push(
      { ...base, age: 18 },
      { ...base, age: 19 },
    );

    renderer.update(new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT));

    expect(renderer.debris).toHaveLength(1);
    expect(required(renderer.debris[0], 'retained debris').age).toBe(19);
  });
});
