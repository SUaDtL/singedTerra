import { describe, expect, it } from 'vitest';
import {
  FAR_PARALLAX_RATIO,
  MAX_CAMERA_DISPLACEMENT,
  MIDDLE_PARALLAX_RATIO,
  getImpactDepthParallax,
} from './impactDepthParallax';

describe('impact depth parallax', () => {
  it('pins the authored depth ratios and defensive displacement cap', () => {
    expect(FAR_PARALLAX_RATIO).toBe(0.12);
    expect(MIDDLE_PARALLAX_RATIO).toBe(0.35);
    expect(MAX_CAMERA_DISPLACEMENT).toBe(20);
  });

  it('keeps rest geometry still and returns an immutable profile', () => {
    const profile = getImpactDepthParallax({ x: 0, y: 0 });

    expect(profile).toEqual({
      far: { x: 0, y: 0 },
      middle: { x: 0, y: 0 },
      world: { x: 0, y: 0 },
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile?.far)).toBe(true);
    expect(Object.isFrozen(profile?.middle)).toBe(true);
    expect(Object.isFrozen(profile?.world)).toBe(true);
  });

  it.each([
    { source: { x: 10, y: 0 }, world: { x: 10, y: 0 } },
    { source: { x: -10, y: 0 }, world: { x: -10, y: 0 } },
    { source: { x: 0, y: 10 }, world: { x: 0, y: 10 } },
    { source: { x: 0, y: -10 }, world: { x: 0, y: -10 } },
    { source: { x: 8, y: -6 }, world: { x: 8, y: -6 } },
  ])('preserves direction and exact layer ratios for $source', ({ source, world }) => {
    const profile = getImpactDepthParallax(source)!;

    expect(profile.world).toEqual(world);
    expect(profile.far.x).toBeCloseTo(world.x * FAR_PARALLAX_RATIO, 12);
    expect(profile.far.y).toBeCloseTo(world.y * FAR_PARALLAX_RATIO, 12);
    expect(profile.middle.x).toBeCloseTo(world.x * MIDDLE_PARALLAX_RATIO, 12);
    expect(profile.middle.y).toBeCloseTo(world.y * MIDDLE_PARALLAX_RATIO, 12);
  });

  it('scales hostile finite input without distorting its direction', () => {
    const profile = getImpactDepthParallax({
      x: Number.MAX_VALUE,
      y: -Number.MAX_VALUE / 2,
    })!;

    expect(profile.world.x).toBe(MAX_CAMERA_DISPLACEMENT);
    expect(profile.world.y).toBe(-MAX_CAMERA_DISPLACEMENT / 2);
    expect(profile.world.x / profile.world.y).toBeCloseTo(-2, 12);
    for (const layer of [profile.far, profile.middle, profile.world]) {
      expect(Number.isFinite(layer.x)).toBe(true);
      expect(Number.isFinite(layer.y)).toBe(true);
      expect(Math.abs(layer.x)).toBeLessThanOrEqual(MAX_CAMERA_DISPLACEMENT);
      expect(Math.abs(layer.y)).toBeLessThanOrEqual(MAX_CAMERA_DISPLACEMENT);
    }
  });

  it.each([
    {
      source: { x: 20, y: -10 },
      world: { x: 20, y: -10 },
      label: 'exact boundary',
    },
    {
      source: { x: 20.000_001, y: -10 },
      world: { x: 20, y: -9.999_999_500_000_025 },
      label: 'just beyond x boundary',
    },
    {
      source: { x: -Number.MAX_VALUE / 4, y: Number.MAX_VALUE },
      world: { x: -5, y: 20 },
      label: 'hostile y-dominant input',
    },
  ])('applies the exact shared cap for $label', ({ source, world }) => {
    const profile = getImpactDepthParallax(source)!;

    expect(profile.world.x).toBeCloseTo(world.x, 12);
    expect(profile.world.y).toBeCloseTo(world.y, 12);
    expect(profile.far.x).toBeCloseTo(world.x * 0.12, 12);
    expect(profile.far.y).toBeCloseTo(world.y * 0.12, 12);
    expect(profile.middle.x).toBeCloseTo(world.x * 0.35, 12);
    expect(profile.middle.y).toBeCloseTo(world.y * 0.35, 12);
  });

  it.each([
    { x: Number.NaN, y: 0 },
    { x: Number.POSITIVE_INFINITY, y: 0 },
    { x: Number.NEGATIVE_INFINITY, y: 0 },
    { x: 0, y: Number.NaN },
    { x: 0, y: Number.POSITIVE_INFINITY },
    { x: 0, y: Number.NEGATIVE_INFINITY },
  ])('fails closed for malformed displacement %#', (source) => {
    expect(getImpactDepthParallax(source)).toBeNull();
  });

  it('does not mutate or retain the caller displacement', () => {
    const source = { x: 7, y: -5 };
    const before = { ...source };
    const profile = getImpactDepthParallax(source)!;

    expect(source).toEqual(before);
    source.x = 99;
    source.y = 99;
    expect(profile.world).toEqual({ x: 7, y: -5 });
  });
});
