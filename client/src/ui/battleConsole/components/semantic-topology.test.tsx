import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { semanticRegistry } from '../BattleConsoleRoot';

const owners = readBattleConsoleContract('topology/semantic-owners.json') as any;

describe('AC-12 complete semantic registry', () => {
  it('maps every discovered stable key exactly once to Preact and never contracts raw node identity', () => {
    const expected = owners.nodes.map((node: { stableKey: string }) => node.stableKey);
    expect(semanticRegistry.map((entry: { stableKey: string }) => entry.stableKey)).toEqual(expected);
    expect(new Set(expected).size).toBe(expected.length);
    expect(semanticRegistry.every((entry: { owner: string; rawNodeIdentityContract: boolean }) => entry.owner === 'preact' && entry.rawNodeIdentityContract === false)).toBe(true);
  });
});
