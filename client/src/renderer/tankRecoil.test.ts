import { describe, expect, it } from 'vitest';
import {
  TANK_RECOIL_FRAMES,
  tankRecoilPose,
} from './tankRecoil';

describe('tankRecoilPose', () => {
  it('kicks opposite the barrel direction with a grounded vertical component', () => {
    const right = tankRecoilPose(0, 1, 0);
    const up = tankRecoilPose(90, 1, 0);
    const left = tankRecoilPose(180, 1, 0);

    expect(right).not.toBeNull();
    expect(right!.x).toBeLessThan(0);
    expect(right!.y).toBeCloseTo(0);
    expect(up!.x).toBeCloseTo(0);
    expect(up!.y).toBeGreaterThan(0);
    expect(up!.y).toBeLessThan(Math.abs(right!.x));
    expect(left!.x).toBeGreaterThan(0);
    expect(left!.y).toBeCloseTo(0);
  });

  it('gives heavy launches more weight while capping peak travel at four pixels', () => {
    const light = tankRecoilPose(42, 0.9, 0)!;
    const heavy = tankRecoilPose(42, 1.75, 0)!;
    const hostile = tankRecoilPose(0, 999, 0)!;

    expect(Math.hypot(heavy.x, heavy.y))
      .toBeGreaterThan(Math.hypot(light.x, light.y));
    expect(hostile).toEqual({ x: -4, y: 0 });
  });

  it('recovers monotonically and expires at the exact bounded lifetime', () => {
    expect(TANK_RECOIL_FRAMES).toBe(10);
    const distances = Array.from(
      { length: TANK_RECOIL_FRAMES },
      (_, age) => {
        const pose = tankRecoilPose(25, 1.3, age)!;
        return Math.hypot(pose.x, pose.y);
      },
    );

    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeLessThan(distances[i - 1]);
    }
    expect(tankRecoilPose(25, 1.3, TANK_RECOIL_FRAMES - 1)).not.toBeNull();
    expect(tankRecoilPose(25, 1.3, TANK_RECOIL_FRAMES)).toBeNull();
  });

  it('fails malformed or invalid inputs closed without emitting a pose', () => {
    expect(tankRecoilPose(Number.NaN, 1, 0)).toBeNull();
    expect(tankRecoilPose(45, Number.POSITIVE_INFINITY, 0)).toBeNull();
    expect(tankRecoilPose(45, 0, 0)).toBeNull();
    expect(tankRecoilPose(45, -1, 0)).toBeNull();
    expect(tankRecoilPose(45, 1, -1)).toBeNull();
    expect(tankRecoilPose(45, 1, 0.5)).toBeNull();
  });
});
