import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';
import { battleConsoleSemanticNodes } from './runtimeData';

const lifecycle = readBattleConsoleContract('topology/lifecycle-triggers.json') as any;

describe('archived lifecycle topology', () => {
  it('keeps archive trigger evidence separate from the runtime semantic projection', () => {
    expect(lifecycle.indices.triggerKeys).toEqual(lifecycle.triggers.map((trigger: { key: string }) => trigger.key));
    expect(battleConsoleSemanticNodes.every((node) => typeof node.stableKey === 'string')).toBe(true);
  });
});
