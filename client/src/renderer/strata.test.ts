/**
 * strata.test.ts — pure terrain-strata band math (TerrainRenderer cross-sections).
 * Boundaries are exactly where a visible horizontal seam would appear, so the
 * threshold + blend-zone behaviour is worth pinning.
 */
import { describe, it, expect } from 'vitest';
import {
  bandForY,
  bandFloatForY,
  STRATA_BAND_A,
  STRATA_BAND_B,
  STRATA_BLEND,
} from './strata';

describe('bandForY', () => {
  it('maps y to the three bands at the thresholds (upper bound exclusive)', () => {
    expect(bandForY(0)).toBe(0);
    expect(bandForY(STRATA_BAND_A - 1)).toBe(0);
    expect(bandForY(STRATA_BAND_A)).toBe(1);          // boundary belongs to the lower band
    expect(bandForY(STRATA_BAND_B - 1)).toBe(1);
    expect(bandForY(STRATA_BAND_B)).toBe(2);
    expect(bandForY(599)).toBe(2);
  });
});

describe('bandFloatForY', () => {
  it('is integer-valued away from the blend zones', () => {
    expect(bandFloatForY(STRATA_BAND_A - STRATA_BLEND - 1)).toBe(0);
    expect(bandFloatForY(STRATA_BAND_A + STRATA_BLEND + 1)).toBe(1);
    expect(bandFloatForY(STRATA_BAND_B + STRATA_BLEND + 1)).toBe(2);
  });

  it('ramps linearly through the A→B blend seam, hitting the midpoint at the threshold', () => {
    expect(bandFloatForY(STRATA_BAND_A - STRATA_BLEND)).toBeCloseTo(0);
    expect(bandFloatForY(STRATA_BAND_A)).toBeCloseTo(0.5);   // exactly on the boundary
    expect(bandFloatForY(STRATA_BAND_A + STRATA_BLEND)).toBeCloseTo(1);
  });

  it('ramps linearly through the B→C blend seam', () => {
    expect(bandFloatForY(STRATA_BAND_B - STRATA_BLEND)).toBeCloseTo(1);
    expect(bandFloatForY(STRATA_BAND_B)).toBeCloseTo(1.5);
    expect(bandFloatForY(STRATA_BAND_B + STRATA_BLEND)).toBeCloseTo(2);
  });
});
