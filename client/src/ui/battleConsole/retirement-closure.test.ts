import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

const style = readBattleConsoleContract('topology/style-scope.json') as any;
const retirement = readBattleConsoleContract('ownership/retirement.json') as any;

describe('archived retirement and style-scope contract', () => {
  it('preserves the retirement record and selector prohibition as verification-only evidence', () => {
    expect(retirement.records.length).toBe(retirement.cardinalities.records);
    expect(retirement.records.length).toBeGreaterThan(0);
    expect(new Set(retirement.records.map((owner: { disposition: string }) => owner.disposition))).toEqual(new Set(['retire', 'replace', 'retain']));
    expect(style.replacement.cssModulePath).toBe('client/src/ui/battleConsole/BattleConsole.module.css');
    expect(style.globalHostRules.selectorAllowlist.length).toBeGreaterThan(0);
  });
});
