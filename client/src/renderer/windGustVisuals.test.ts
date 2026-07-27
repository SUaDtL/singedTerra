import { describe, expect, it } from 'vitest';
import {
  WIND_GUST_CALM_THRESHOLD,
  WIND_GUST_LIFE_FRAMES,
  getWindGustVisualProfile,
} from './windGustVisuals';

describe('getWindGustVisualProfile', () => {
  it('fails non-finite and near-calm wind closed', () => {
    for (const wind of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      -WIND_GUST_CALM_THRESHOLD + 0.001,
      0,
      WIND_GUST_CALM_THRESHOLD - 0.001,
    ]) {
      expect(getWindGustVisualProfile(wind)).toBeNull();
    }
  });

  it('preserves direction and maps equal magnitudes to one frozen profile envelope', () => {
    const left = getWindGustVisualProfile(-4);
    const right = getWindGustVisualProfile(4);

    expect(left).toEqual({
      direction: -1,
      strength: 0.4,
      streakCount: 7,
      length: 44,
      speed: 2.44,
      alpha: 0.172,
      life: WIND_GUST_LIFE_FRAMES,
    });
    expect(right).toEqual({ ...left, direction: 1 });
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(right)).toBe(true);
  });

  it('scales monotonically and clamps hostile magnitudes to exact presentation caps', () => {
    const calmEdge = getWindGustVisualProfile(WIND_GUST_CALM_THRESHOLD);
    const medium = getWindGustVisualProfile(6);
    const cap = getWindGustVisualProfile(10);
    const hostile = getWindGustVisualProfile(Number.MAX_VALUE);

    expect(calmEdge).toMatchObject({
      direction: 1,
      streakCount: 5,
      life: 48,
    });
    expect(calmEdge!.length).toBeCloseTo(28.8);
    expect(calmEdge!.speed).toBeCloseTo(1.452);
    expect(calmEdge!.alpha).toBeCloseTo(0.1036);
    expect(medium).toMatchObject({
      direction: 1,
      strength: 0.6,
      streakCount: 9,
      length: 52,
      speed: 2.96,
      life: 48,
    });
    expect(medium!.alpha).toBeCloseTo(0.208);
    expect(cap).toEqual({
      direction: 1,
      strength: 1,
      streakCount: 11,
      length: 68,
      speed: 4,
      alpha: 0.28,
      life: 48,
    });
    expect(hostile).toEqual(cap);
  });
});
