import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { createBattleConsoleLifecycleHarness } from './lifecycle';

const lifecycle = readBattleConsoleContract('topology/lifecycle-triggers.json') as any;

describe('AC-14 same lifecycle topology', () => {
  it('keeps one keyed semantic topology through loading, ready, context loss, and fallback', async () => {
    const harness = createBattleConsoleLifecycleHarness();
    const snapshots = await harness.walk(['loading', 'ready', 'fallback', 'ready']);
    expect(snapshots.map((state: { stableKeys: string[] }) => state.stableKeys)).toEqual(snapshots.map(() => snapshots[0].stableKeys));
    expect(snapshots.every((state: { rootCount: number; nodeObjectsStable: boolean }) => state.rootCount === 1 && state.nodeObjectsStable)).toBe(true);
    expect(harness.triggerKeys()).toEqual(lifecycle.indices.triggerKeys);
  });
});
