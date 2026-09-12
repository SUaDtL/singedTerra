import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

const lifecycle = readBattleConsoleContract('topology/lifecycle-triggers.json') as any;

describe('archived fail-soft state machine', () => {
  it('retains lifecycle trigger names as verification-only evidence', () => {
    expect(lifecycle.triggers.map((trigger: { key: string }) => trigger.key)).toEqual(lifecycle.indices.triggerKeys);
  });
});
