import { describe, expect, it } from 'vitest';
import { bettyHopCount, fireActiveEdge, isOobFizzle } from './audioEdges';

describe('fireActiveEdge', () => {
  it.each([
    { previous: 0, current: 0, expected: null },
    { previous: 0, current: 2, expected: 'start' },
    { previous: 3, current: 0, expected: 'stop' },
    { previous: 3, current: 2, expected: null },
  ] as const)('maps $previous -> $current to $expected', ({ previous, current, expected }) => {
    expect(fireActiveEdge(previous, current)).toBe(expected);
  });
});

describe('bettyHopCount', () => {
  it.each([
    { previous: 0, current: 0, expected: 0 },
    { previous: 2, current: 2, expected: 0 },
    { previous: 2, current: 1, expected: 1 },
    { previous: 4, current: 1, expected: 3 },
    { previous: 1, current: 3, expected: 0 },
  ])('maps $previous -> $current to $expected hops', ({ previous, current, expected }) => {
    expect(bettyHopCount(previous, current)).toBe(expected);
  });
});

describe('isOobFizzle', () => {
  it.each([
    [false, false, false, false],
    [false, false, true, false],
    [false, true, false, false],
    [false, true, true, false],
    [true, false, false, true],
    [true, false, true, false],
    [true, true, false, false],
    [true, true, true, false],
  ] as const)(
    'maps projectile history (%s, %s) and explosion=%s to %s',
    (hadProjectile, hasProjectile, newExplosion, expected) => {
      expect(isOobFizzle(hadProjectile, hasProjectile, newExplosion)).toBe(expected);
    },
  );
});
