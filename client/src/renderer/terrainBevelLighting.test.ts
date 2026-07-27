import { describe, expect, it } from 'vitest';
import {
  TERRAIN_BEVEL_DEPTH,
  TERRAIN_BEVEL_FALLOFF,
  createTerrainBevelSampler,
  terrainBevelLight,
} from './terrainBevelLighting';

function bitmap(rows: string[]): Uint8Array {
  return Uint8Array.from(
    rows.join('').replaceAll('.', '0').replaceAll('#', '1'),
    Number,
  );
}

describe('terrainBevelLight', () => {
  it('pins the authored depth and monotonic blend falloff', () => {
    expect(TERRAIN_BEVEL_DEPTH).toBe(3);
    expect(TERRAIN_BEVEL_FALLOFF).toEqual([0.32, 0.18, 0.08]);
    expect(Object.isFrozen(TERRAIN_BEVEL_FALLOFF)).toBe(true);
  });

  it('keeps air and fully enclosed terrain unlit', () => {
    expect(terrainBevelLight(bitmap(['.']), 1, 1, 0, 0)).toBe(0);
    expect(terrainBevelLight(bitmap([
      '#####',
      '#####',
      '#####',
      '#####',
      '#####',
    ]), 5, 5, 2, 2)).toBe(0);
  });

  it('casts an exact three-pixel upper highlight with no fourth-pixel tail', () => {
    const terrain = bitmap([
      '.....',
      '.....',
      '#####',
      '#####',
      '#####',
      '#####',
    ]);

    expect(terrainBevelLight(terrain, 5, 6, 2, 2)).toBe(0.32);
    expect(terrainBevelLight(terrain, 5, 6, 2, 3)).toBe(0.18);
    expect(terrainBevelLight(terrain, 5, 6, 2, 4)).toBe(0.08);
    expect(terrainBevelLight(terrain, 5, 6, 2, 5)).toBe(0);
  });

  it('lights left-facing walls and shades right-facing walls symmetrically', () => {
    const leftFacing = bitmap([
      '..####',
      '..####',
      '..####',
      '..####',
      '..####',
    ]);
    const rightFacing = bitmap([
      '####..',
      '####..',
      '####..',
      '####..',
      '####..',
    ]);

    expect(terrainBevelLight(leftFacing, 6, 5, 2, 2)).toBe(0.24);
    expect(terrainBevelLight(leftFacing, 6, 5, 3, 2)).toBe(0.135);
    expect(terrainBevelLight(leftFacing, 6, 5, 4, 2)).toBe(0.06);
    expect(terrainBevelLight(leftFacing, 6, 5, 5, 2)).toBe(0);
    expect(terrainBevelLight(rightFacing, 6, 5, 3, 2)).toBe(-0.24);
    expect(terrainBevelLight(rightFacing, 6, 5, 2, 2)).toBe(-0.135);
    expect(terrainBevelLight(rightFacing, 6, 5, 1, 2)).toBe(-0.06);
    expect(terrainBevelLight(rightFacing, 6, 5, 0, 2)).toBe(0);
  });

  it('shades downward exposure and lets the stronger cardinal win at corners', () => {
    const ceiling = bitmap([
      '#####',
      '#####',
      '#####',
      '.....',
      '.....',
    ]);
    const upperLeftCorner = bitmap([
      '.....',
      '..###',
      '..###',
      '..###',
      '..###',
    ]);

    expect(terrainBevelLight(ceiling, 5, 5, 2, 2)).toBe(-0.32);
    expect(terrainBevelLight(upperLeftCorner, 5, 5, 2, 1)).toBe(0.32);
  });

  it('casts an exact three-pixel downward shadow with no fourth-pixel tail', () => {
    const terrain = bitmap([
      '#####',
      '#####',
      '#####',
      '#####',
      '.....',
      '.....',
    ]);

    expect(terrainBevelLight(terrain, 5, 6, 2, 3)).toBe(-0.32);
    expect(terrainBevelLight(terrain, 5, 6, 2, 2)).toBe(-0.18);
    expect(terrainBevelLight(terrain, 5, 6, 2, 1)).toBe(-0.08);
    expect(terrainBevelLight(terrain, 5, 6, 2, 0)).toBe(0);
  });

  it.each([
    { air: [[2, 1], [3, 2]], expected: 0.08, label: 'upper-right' },
    { air: [[1, 2], [2, 3]], expected: -0.08, label: 'lower-left' },
    { air: [[3, 2], [2, 3]], expected: -0.32, label: 'lower-right' },
  ])('composes conflicting $label exposure by signed strongest faces', ({ air, expected }) => {
    const terrain = new Uint8Array(25);
    terrain.fill(1);
    for (const [x, y] of air) terrain[y * 5 + x] = 0;

    expect(terrainBevelLight(terrain, 5, 5, 2, 2)).toBeCloseTo(expected, 12);
  });

  it('treats every out-of-frame sample as sealed solid terrain', () => {
    const terrain = bitmap([
      '###',
      '###',
      '###',
    ]);

    expect(terrainBevelLight(terrain, 3, 3, 0, 0)).toBe(0);
    expect(terrainBevelLight(terrain, 3, 3, 2, 2)).toBe(0);
  });

  it.each([
    { terrain: new Uint8Array(0), width: 0, height: 1, x: 0, y: 0 },
    { terrain: new Uint8Array(0), width: 1, height: 0, x: 0, y: 0 },
    { terrain: new Uint8Array(4), width: 2.5, height: 2, x: 0, y: 0 },
    { terrain: new Uint8Array(3), width: 2, height: 2, x: 0, y: 0 },
    { terrain: new Uint8Array(4), width: 2, height: 2, x: -1, y: 0 },
    { terrain: new Uint8Array(4), width: 2, height: 2, x: 0, y: 2 },
    { terrain: new Uint8Array(4), width: 2, height: 2, x: 0.5, y: 0 },
  ])('fails closed for malformed geometry %#', (sample) => {
    expect(terrainBevelLight(
      sample.terrain,
      sample.width,
      sample.height,
      sample.x,
      sample.y,
    )).toBe(0);
  });

  it.each([
    { width: 0, height: 1, length: 0 },
    { width: -1, height: 1, length: 0 },
    { width: 1, height: 0, length: 0 },
    { width: 1.5, height: 2, length: 3 },
    { width: 2, height: 1.5, length: 3 },
    { width: Number.NaN, height: 2, length: 0 },
    { width: Number.POSITIVE_INFINITY, height: 2, length: 0 },
    { width: Number.MAX_SAFE_INTEGER, height: 2, length: 0 },
    { width: 2, height: 2, length: 3 },
    { width: 2, height: 2, length: 5 },
  ])('rejects malformed sampler frames directly %#', ({ width, height, length }) => {
    expect(createTerrainBevelSampler(
      new Uint8Array(length),
      width,
      height,
    )).toBeNull();
  });

  it('does not mutate the authoritative terrain bitmap', () => {
    const terrain = bitmap([
      '..###',
      '..###',
      '..###',
    ]);
    const before = terrain.slice();

    expect(terrainBevelLight(terrain, 5, 3, 2, 1)).toBe(0.24);
    expect(terrain).toEqual(before);
  });
});
