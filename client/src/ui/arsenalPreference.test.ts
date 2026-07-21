import { describe, expect, it } from 'vitest';
import { COMPACT_TOUCH_QUERY, resolveInitialArsenalCollapsed } from './arsenalPreference';

describe('resolveInitialArsenalCollapsed', () => {
  it('uses the compact-touch default only when no valid preference exists', () => {
    expect(resolveInitialArsenalCollapsed(null, true)).toBe(true);
    expect(resolveInitialArsenalCollapsed(null, false)).toBe(false);
    expect(resolveInitialArsenalCollapsed('unexpected', true)).toBe(true);
    expect(resolveInitialArsenalCollapsed('unexpected', false)).toBe(false);
  });

  it('lets either saved preference override the viewport', () => {
    expect(resolveInitialArsenalCollapsed('1', false)).toBe(true);
    expect(resolveInitialArsenalCollapsed('1', true)).toBe(true);
    expect(resolveInitialArsenalCollapsed('0', false)).toBe(false);
    expect(resolveInitialArsenalCollapsed('0', true)).toBe(false);
  });

  it('pins the compact-touch media query contract', () => {
    expect(COMPACT_TOUCH_QUERY).toBe('(pointer: coarse) and (max-height: 700px)');
  });
});
