import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { retirementManifest } from './mount';

const style = readBattleConsoleContract('topology/style-scope.json') as any;
const retirement = readBattleConsoleContract('ownership/retirement.json') as any;

describe('AC-29 retirement and style-scope closure', () => {
  it('retires every legacy owner and forbids styling selectors as behavior APIs', () => {
    expect(retirementManifest.records).toEqual(retirement.records);
    expect(retirementManifest.records.length).toBe(retirement.cardinalities.records);
    expect(retirementManifest.records.length).toBeGreaterThan(0);
    expect(new Set(retirementManifest.records.map((owner: { disposition: string }) => owner.disposition))).toEqual(new Set(['retire', 'replace', 'retain']));
    expect(retirementManifest.behaviorSelectorPaths).toEqual([]);
    expect(retirementManifest.cssModulePath).toBe(style.replacement.cssModulePath);
    expect(retirementManifest.globalSelectors).toEqual(style.globalHostRules.selectorAllowlist);
  });
});
