import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';
import { dynamicAppearanceRegistry } from './scene';

const appearance = readBattleConsoleContract('state/dynamic-appearance.json') as any;

describe('dynamic appearance contract registry', () => {
  it('retains the declared keys and structural ownership limits', () => {
    expect(dynamicAppearanceRegistry.expectationKeys).toEqual(appearance.expectations.map((entry: { key: string }) => entry.key));
    expect(dynamicAppearanceRegistry.expectationKeys.length).toBe(appearance.cardinalities.expectations);
    expect(dynamicAppearanceRegistry.reconstructsOwners).toBe(false);
    expect(dynamicAppearanceRegistry.usesMasksToHideWrongInk).toBe(false);
  });
});
