import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

const appearance = readBattleConsoleContract('state/dynamic-appearance.json') as any;

describe('archived dynamic appearance contract', () => {
  it('retains the declared keys and structural ownership limits as archive evidence', () => {
    expect(appearance.expectations.map((entry: { key: string }) => entry.key)).toHaveLength(appearance.cardinalities.expectations);
    expect(appearance.expectations.every((entry: { fallbackOwner: string; readyOwner: string }) => (
      typeof entry.fallbackOwner === 'string' && typeof entry.readyOwner === 'string'
    ))).toBe(true);
  });
});
