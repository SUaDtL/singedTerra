import { describe, expect, it } from 'vitest';
import {
  ARMOR_HIT_LIFE_FRAMES,
  getArmorHitVisualProfile,
} from './armorHitVisuals';

describe('getArmorHitVisualProfile', () => {
  it('scales a finite positive health drop through a bounded visual envelope', () => {
    const light = getArmorHitVisualProfile(1)!;
    const medium = getArmorHitVisualProfile(40)!;
    const heavy = getArmorHitVisualProfile(100)!;

    expect(light).toEqual({
      strength: 0.25,
      radius: 16,
      sparkCount: 4,
      life: 14,
    });
    expect(medium.strength).toBe(0.4);
    expect(medium.radius).toBeCloseTo(18.4);
    expect(medium.sparkCount).toBe(5);
    expect(heavy).toEqual({
      strength: 1,
      radius: 28,
      sparkCount: 10,
      life: 14,
    });
  });

  it('pins the exact lifetime and caps hostile finite damage', () => {
    expect(ARMOR_HIT_LIFE_FRAMES).toBe(14);
    expect(getArmorHitVisualProfile(Number.MAX_VALUE)).toEqual({
      strength: 1,
      radius: 28,
      sparkCount: 10,
      life: ARMOR_HIT_LIFE_FRAMES,
    });
  });

  it('fails malformed and non-positive health drops closed', () => {
    expect(getArmorHitVisualProfile(Number.NaN)).toBeNull();
    expect(getArmorHitVisualProfile(Number.POSITIVE_INFINITY)).toBeNull();
    expect(getArmorHitVisualProfile(0)).toBeNull();
    expect(getArmorHitVisualProfile(-1)).toBeNull();
  });
});
