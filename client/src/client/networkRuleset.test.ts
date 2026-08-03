import { describe, expect, it } from 'vitest';
import {
  CURRENT_NETWORK_RULESET_VERSION,
  LEGACY_NETWORK_RULESET_VERSION,
  normalizeNetworkRulesetVersion,
} from './networkRuleset';

describe('network ruleset client contract', () => {
  it('keeps legacy compatibility while new requests use prepared ruleset 2', () => {
    expect(LEGACY_NETWORK_RULESET_VERSION).toBe(1);
    expect(CURRENT_NETWORK_RULESET_VERSION).toBe(2);
  });

  it('preserves supported stored versions and fails invalid values closed to legacy', () => {
    expect(normalizeNetworkRulesetVersion(undefined)).toBe(1);
    expect(normalizeNetworkRulesetVersion(1)).toBe(1);
    expect(normalizeNetworkRulesetVersion(2)).toBe(2);
    expect(normalizeNetworkRulesetVersion(3)).toBe(3);
    expect(normalizeNetworkRulesetVersion(99)).toBe(1);
    expect(normalizeNetworkRulesetVersion('2')).toBe(1);
  });
});
