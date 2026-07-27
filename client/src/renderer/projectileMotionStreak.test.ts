import { describe, expect, it } from 'vitest';
import {
  MAX_STREAK_SPEED,
  MIN_STREAK_SPEED,
  getProjectileMotionStreak,
} from './projectileMotionStreak';

describe('getProjectileMotionStreak', () => {
  it.each([
    { vx: 0, vy: 0, radius: 4 },
    { vx: MIN_STREAK_SPEED - 0.001, vy: 0, radius: 4 },
    ...[Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      .map((vx) => ({ vx, vy: 2, radius: 4 })),
    ...[Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      .map((vy) => ({ vx: 2, vy, radius: 4 })),
    ...[Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, 0, -1]
      .map((radius) => ({ vx: 2, vy: 1, radius })),
  ])('fails malformed, stationary, and near-stationary input %# closed', ({
    vx,
    vy,
    radius,
  }) => {
    expect(getProjectileMotionStreak(vx, vy, radius)).toBeNull();
  });

  it.each([
    { vx: 10, vy: 0, tail: [-1, 0], head: [-1, 0] },
    { vx: -10, vy: 0, tail: [1, 0], head: [1, 0] },
    { vx: 0, vy: -10, tail: [0, 1], head: [0, 1] },
    { vx: 0, vy: 10, tail: [0, -1], head: [0, -1] },
  ])('points behind true velocity %#', ({ vx, vy, tail, head }) => {
    const streak = getProjectileMotionStreak(vx, vy, 4)!;

    const sign = (value: number): number => Math.sign(value) || 0;
    expect(sign(streak.tailOffsetX)).toBe(tail[0]);
    expect(sign(streak.tailOffsetY)).toBe(tail[1]);
    expect(sign(streak.headOffsetX)).toBe(head[0]);
    expect(sign(streak.headOffsetY)).toBe(head[1]);
    expect(Math.hypot(
      streak.tailOffsetX - streak.headOffsetX,
      streak.tailOffsetY - streak.headOffsetY,
    )).toBeCloseTo(streak.length);
  });

  it('scales speed monotonically and clamps exact presentation endpoints', () => {
    const slow = getProjectileMotionStreak(MIN_STREAK_SPEED, 0, 4)!;
    const medium = getProjectileMotionStreak(
      (MIN_STREAK_SPEED + MAX_STREAK_SPEED) / 2,
      0,
      4,
    )!;
    const cap = getProjectileMotionStreak(MAX_STREAK_SPEED, 0, 4)!;
    const hostile = getProjectileMotionStreak(1000, 0, 4)!;

    expect(slow).toMatchObject({ length: 6, alpha: 0.22 });
    expect(medium).toMatchObject({ length: 17, alpha: 0.33 });
    expect(cap).toMatchObject({ length: 28, alpha: 0.44 });
    expect(hostile).toEqual(cap);
    expect(slow.length).toBeLessThan(medium.length);
    expect(medium.length).toBeLessThan(cap.length);
  });

  it('uses Euclidean diagonal magnitude and preserves an independent 3-4 direction', () => {
    const thresholdComponent = MIN_STREAK_SPEED / Math.SQRT2;
    const threshold = getProjectileMotionStreak(
      thresholdComponent,
      thresholdComponent,
      4,
    );
    const below = getProjectileMotionStreak(
      thresholdComponent - 0.001,
      thresholdComponent - 0.001,
      4,
    );
    const triangle = getProjectileMotionStreak(3, 4, 4)!;
    const segmentX = triangle.tailOffsetX - triangle.headOffsetX;
    const segmentY = triangle.tailOffsetY - triangle.headOffsetY;

    expect(threshold).toMatchObject({ length: 6, alpha: 0.22 });
    expect(below).toBeNull();
    expect(Math.abs(segmentX / segmentY)).toBeCloseTo(3 / 4);
    expect(Math.hypot(segmentX, segmentY)).toBeCloseTo(triangle.length);
    expect(triangle.length).toBeCloseTo(
      6 + ((5 - MIN_STREAK_SPEED) / (MAX_STREAK_SPEED - MIN_STREAK_SPEED)) * 22,
    );
  });

  it('caps extreme finite diagonal motion without losing finite geometry', () => {
    const streak = getProjectileMotionStreak(
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      4,
    );

    expect(streak).toMatchObject({ length: 28, alpha: 0.44 });
    expect(streak && Object.values(streak).every(Number.isFinite)).toBe(true);
    expect(Math.abs(streak!.tailOffsetX)).toBeCloseTo(
      Math.abs(streak!.tailOffsetY),
    );
  });

  it('uses bounded payload scale for width and returns frozen finite geometry', () => {
    const tiny = getProjectileMotionStreak(10, 0, 0.5)!;
    const parent = getProjectileMotionStreak(10, 0, 4.8)!;
    const child = getProjectileMotionStreak(10, 0, 4.8 * 0.68)!;
    const huge = getProjectileMotionStreak(10, 0, Number.MAX_VALUE)!;

    expect(tiny.width).toBe(1.5);
    expect(child.width).toBeLessThan(parent.width);
    expect(parent.width).toBeLessThan(5);
    expect(huge.width).toBe(5);
    expect(Object.isFrozen(parent)).toBe(true);
    expect(Object.values(parent).every(Number.isFinite)).toBe(true);
  });
});
