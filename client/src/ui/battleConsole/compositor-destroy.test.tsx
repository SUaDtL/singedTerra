import { describe, expect, it } from 'vitest';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { destroyBattleConsoleGeneration } from './lifecycle';

describe('AC-18 terminal cleanup', () => {
  it('is idempotent and reaches zero for every locked resource class', async () => {
    const first = await destroyBattleConsoleGeneration({ duringLoad: true, repeat: 1 });
    const repeated = await destroyBattleConsoleGeneration({ duringLoad: true, repeat: 3 });
    expect(first).toEqual(repeated);
    expect(Object.values(first.resources).every((count) => count === 0)).toBe(true);
    expect(first.staleCompletionRecreatedResources).toBe(false);
  });
});
