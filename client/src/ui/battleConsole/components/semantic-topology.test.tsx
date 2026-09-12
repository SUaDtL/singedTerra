import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';
import { battleConsoleSemanticNodes } from '../runtimeData';

const owners = readBattleConsoleContract('topology/semantic-owners.json') as any;

describe('archived semantic topology projection', () => {
  it('retains every stable key needed by the current semantic interpreter', () => {
    const expected = owners.nodes.map((node: { stableKey: string }) => node.stableKey);
    expect(battleConsoleSemanticNodes.map((entry) => entry.stableKey)).toEqual(expected);
    expect(new Set(expected).size).toBe(expected.length);
    expect(owners.nodes.every((node: { rawHTMLElementIdentityIsApplicationContract: boolean }) => node.rawHTMLElementIdentityIsApplicationContract === false)).toBe(true);
  });
});
