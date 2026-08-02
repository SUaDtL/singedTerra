import { describe, expect, it } from 'vitest';
import {
  HEAVY_IMPACT_HOLD_FRAMES,
  HEAVY_IMPACT_RADIUS_THRESHOLD,
  impactHitStopFrames,
} from './impactHitStop';

describe('impactHitStopFrames', () => {
  it('holds only large impacts for one finite two-frame beat', () => {
    expect(impactHitStopFrames(HEAVY_IMPACT_RADIUS_THRESHOLD - 1, false)).toBe(0);
    expect(impactHitStopFrames(HEAVY_IMPACT_RADIUS_THRESHOLD, false))
      .toBe(HEAVY_IMPACT_HOLD_FRAMES);
    expect(impactHitStopFrames(90, false)).toBe(HEAVY_IMPACT_HOLD_FRAMES);
  });

  it('suppresses hit-stop for reduced-motion users', () => {
    expect(impactHitStopFrames(90, true)).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'fails closed for malformed radius %s',
    (radius) => {
      expect(impactHitStopFrames(radius, false)).toBe(0);
    },
  );
});
