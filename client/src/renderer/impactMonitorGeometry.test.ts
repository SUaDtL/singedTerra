import { describe, expect, it } from 'vitest';
import {
  getImpactMonitorGeometry,
  selectImpactMonitorFocus,
  type ImpactMonitorFocus,
} from './impactMonitor';

const burst = (
  overrides: Partial<ImpactMonitorFocus> = {},
): ImpactMonitorFocus => ({
  cx: 600,
  cy: 300,
  reachRadius: 34,
  age: 3,
  lifeFrames: 16,
  ...overrides,
});

describe('impact monitor focus selection', () => {
  it('returns null when no live burst can be shown', () => {
    expect(selectImpactMonitorFocus([])).toBeNull();
  });

  it.each([
    { cx: Number.NaN },
    { cy: Number.POSITIVE_INFINITY },
    { reachRadius: 0 },
    { reachRadius: -1 },
    { age: -1 },
    { lifeFrames: 0 },
    { age: 16, lifeFrames: 16 },
  ])('ignores malformed or expired burst values %#', (overrides) => {
    expect(selectImpactMonitorFocus([burst(overrides)])).toBeNull();
  });

  it('selects the live burst with the largest authoritative reach', () => {
    const strongest = burst({ cx: 820, reachRadius: 72, age: 9 });

    expect(selectImpactMonitorFocus([
      burst({ cx: 140, reachRadius: 28, age: 1 }),
      strongest,
      burst({ cx: 480, reachRadius: 52, age: 0 }),
    ])).toEqual(strongest);
  });

  it('selects the newest live burst when authoritative reaches tie', () => {
    const newest = burst({ cx: 470, reachRadius: 52, age: 1 });

    expect(selectImpactMonitorFocus([
      burst({ cx: 260, reachRadius: 52, age: 5 }),
      newest,
      burst({ cx: 900, reachRadius: 52, age: 3 }),
    ])).toEqual(newest);
  });

  it('selects the later-admitted burst when equal reaches spawned together', () => {
    const later = burst({ cx: 930, reachRadius: 42, age: 0 });

    expect(selectImpactMonitorFocus([
      burst({ cx: 250, reachRadius: 42, age: 0 }),
      later,
    ])).toEqual(later);
  });
});

describe('impact monitor geometry', () => {
  it('centers the source crop and returns the exact screen-space frame', () => {
    expect(getImpactMonitorGeometry(burst(), { x: 0, y: 0 })).toEqual({
      focus: { x: 600, y: 300 },
      source: { x: 528, y: 256, width: 144, height: 88 },
      content: { x: 501, y: 25, width: 198, height: 121 },
      frame: { x: 490, y: 18, width: 220, height: 136 },
    });
  });

  it('tracks the currently rendered world recoil before choosing the crop', () => {
    expect(getImpactMonitorGeometry(burst(), { x: 7, y: -5 })).toMatchObject({
      focus: { x: 607, y: 295 },
      source: { x: 535, y: 251, width: 144, height: 88 },
    });
  });

  it.each([
    { label: 'top-left', focus: burst({ cx: 0, cy: 0 }), x: 0, y: 0 },
    { label: 'top-right', focus: burst({ cx: 1200, cy: 0 }), x: 1056, y: 0 },
    { label: 'bottom-left', focus: burst({ cx: 0, cy: 600 }), x: 0, y: 512 },
    { label: 'bottom-right', focus: burst({ cx: 1200, cy: 600 }), x: 1056, y: 512 },
  ])('keeps the crop inside the world at the $label edge', ({ focus, x, y }) => {
    expect(getImpactMonitorGeometry(focus, { x: 0, y: 0 })).toMatchObject({
      source: { x, y, width: 144, height: 88 },
    });
  });

  it.each([
    { x: Number.NaN, y: 0 },
    { x: 0, y: Number.NEGATIVE_INFINITY },
  ])('fails closed for malformed world recoil %#', (worldOffset) => {
    expect(getImpactMonitorGeometry(burst(), worldOffset)).toBeNull();
  });
});
