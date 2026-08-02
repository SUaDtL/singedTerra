import { describe, expect, it } from 'vitest';
import type { FireCell } from '@shared/types/GameState';
import {
  FIRELIGHT_CHUNK_COLUMNS,
  FIRELIGHT_FULL_LIFE,
  FIRELIGHT_MAX_POOLS,
  getNapalmFirelightPools,
} from './napalmFirelight';

function cells(
  start: number,
  end: number,
  life = FIRELIGHT_FULL_LIFE,
): FireCell[] {
  return Array.from(
    { length: end - start + 1 },
    (_, index) => ({ x: start + index, life }),
  );
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe('getNapalmFirelightPools', () => {
  it('pins the bounded authored pooling constants', () => {
    expect(FIRELIGHT_CHUNK_COLUMNS).toBe(32);
    expect(FIRELIGHT_MAX_POOLS).toBe(8);
    expect(FIRELIGHT_FULL_LIFE).toBe(36);
  });

  it('turns one full-life contiguous run into one exact finite pool', () => {
    expect(getNapalmFirelightPools(cells(10, 13))).toEqual([{
      startX: 10,
      endX: 13,
      centerX: 11.5,
      radiusX: 22.6,
      radiusY: 40,
      alpha: 0.18,
      intensity: 1,
    }]);
  });

  it('splits a broad field after exactly 32 columns with overlapping coverage', () => {
    const pools = getNapalmFirelightPools(cells(10, 42));

    expect(pools).toEqual([
      {
        startX: 10,
        endX: 41,
        centerX: 25.5,
        radiusX: 54.8,
        radiusY: 40,
        alpha: 0.18,
        intensity: 1,
      },
      {
        startX: 42,
        endX: 42,
        centerX: 42,
        radiusX: 19.15,
        radiusY: 40,
        alpha: 0.18,
        intensity: 1,
      },
    ]);
    const pool = required(pools[0], 'isolated napalm pool');
    expect(pool.radiusX).toBeGreaterThan(
      pool.endX - pool.centerX,
    );
  });

  it('covers a 181-column hot-napalm field with six bounded adjacent pools', () => {
    const pools = getNapalmFirelightPools(cells(400, 580));

    expect(pools).toHaveLength(6);
    expect(pools.map(({ startX, endX }) => [startX, endX])).toEqual([
      [400, 431],
      [432, 463],
      [464, 495],
      [496, 527],
      [528, 559],
      [560, 580],
    ]);
    expect(pools.every((pool) => pool.radiusX <= 56)).toBe(true);
  });

  it('starts a new pool across a one-column gap and restores world-x order', () => {
    const source = [
      { x: 24, life: 18 },
      { x: 10, life: 36 },
      { x: 23, life: 18 },
      { x: 11, life: 36 },
    ];

    expect(getNapalmFirelightPools(source)).toEqual([
      expect.objectContaining({ startX: 10, endX: 11, centerX: 10.5 }),
      expect.objectContaining({ startX: 23, endX: 24, centerX: 23.5 }),
    ]);
  });

  it('uses the strongest remaining life in a pool and clamps it at full strength', () => {
    const half = getNapalmFirelightPools([
      { x: 1, life: 1 },
      { x: 2, life: 18 },
      { x: 3, life: 9 },
    ])[0];
    const overfull = getNapalmFirelightPools([{ x: 4, life: 360 }])[0];

    expect(half).toMatchObject({
      intensity: 0.5,
      radiusY: 28,
      alpha: 0.105,
    });
    expect(overfull).toMatchObject({
      intensity: 1,
      radiusY: 40,
      alpha: 0.18,
    });
  });

  it('keeps the strongest duplicate column without changing its footprint', () => {
    expect(getNapalmFirelightPools([
      { x: 50, life: 2 },
      { x: 50, life: 36 },
      { x: 50, life: 7 },
    ])).toEqual([
      expect.objectContaining({
        startX: 50,
        endX: 50,
        centerX: 50,
        intensity: 1,
      }),
    ]);
  });

  it('caps at the eight strongest pools and then returns them in world order', () => {
    const source = Array.from(
      { length: FIRELIGHT_MAX_POOLS + 1 },
      (_, index) => ({ x: index * 2, life: index + 1 }),
    );
    const pools = getNapalmFirelightPools(source);

    expect(pools).toHaveLength(FIRELIGHT_MAX_POOLS);
    expect(pools.map((pool) => pool.centerX)).toEqual([
      2, 4, 6, 8, 10, 12, 14, 16,
    ]);
    expect(pools.map((pool) => pool.intensity)).toEqual([
      2 / 36, 3 / 36, 4 / 36, 5 / 36,
      6 / 36, 7 / 36, 8 / 36, 9 / 36,
    ]);
  });

  it('accepts exact canvas edges and skips malformed cells independently', () => {
    const malformed = [
      null,
      {},
      { x: -1, life: 10 },
      { x: 1200, life: 10 },
      { x: 4.5, life: 10 },
      { x: Number.NaN, life: 10 },
      { x: 10, life: 0 },
      { x: 11, life: -1 },
      { x: 12, life: Number.POSITIVE_INFINITY },
      { x: 13, life: Number.NaN },
      { x: 0, life: 1 },
      { x: 1199, life: 1 },
    ] as unknown as FireCell[];

    expect(getNapalmFirelightPools(malformed).map((pool) => pool.centerX))
      .toEqual([0, 1199]);
  });

  it('fails closed for absent or non-array input', () => {
    expect(getNapalmFirelightPools([])).toEqual([]);
    expect(getNapalmFirelightPools(null as unknown as FireCell[])).toEqual([]);
    expect(getNapalmFirelightPools({} as unknown as FireCell[])).toEqual([]);
  });

  it('does not mutate source order or cells and freezes every returned value', () => {
    const source = [
      { x: 8, life: 12 },
      { x: 7, life: 24 },
    ];
    const before = structuredClone(source);
    const pools = getNapalmFirelightPools(source);

    expect(source).toEqual(before);
    expect(pools).not.toBe(source);
    expect(Object.isFrozen(pools)).toBe(true);
    expect(pools.every(Object.isFrozen)).toBe(true);
  });
});
