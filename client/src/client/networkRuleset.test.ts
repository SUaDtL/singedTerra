import { describe, expect, it } from 'vitest';
import {
  CURRENT_NETWORK_RULESET_VERSION,
  LEGACY_NETWORK_RULESET_VERSION,
  normalizeNetworkRulesetVersion,
} from './networkRuleset';

describe('network ruleset client contract', () => {
  it('keeps Phase A requests on legacy ruleset 1', () => {
    expect(LEGACY_NETWORK_RULESET_VERSION).toBe(1);
    expect(CURRENT_NETWORK_RULESET_VERSION).toBe(1);
  });

  it('preserves supported stored versions and fails invalid values closed to legacy', () => {
    expect(normalizeNetworkRulesetVersion(undefined)).toBe(1);
    expect(normalizeNetworkRulesetVersion(1)).toBe(1);
    expect(normalizeNetworkRulesetVersion(2)).toBe(2);
    expect(normalizeNetworkRulesetVersion(99)).toBe(1);
    expect(normalizeNetworkRulesetVersion('2')).toBe(1);
  });
});
