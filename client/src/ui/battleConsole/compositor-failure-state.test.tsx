import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { simulateLifecycleFailure } from './lifecycle';

const lifecycle = readBattleConsoleContract('topology/lifecycle-triggers.json') as any;

describe('AC-17 fail-soft state machine', () => {
  it('rejects every stale completion and preserves one operable semantic generation', async () => {
    for (const trigger of lifecycle.triggers) {
      const outcome = await simulateLifecycleFailure(trigger.key);
      expect(outcome.winningGenerationCount).toBeLessThanOrEqual(1);
      expect(outcome.staleCompletionMounted).toBe(false);
      expect(outcome.semanticTopologyPreserved).toBe(true);
    }
  });
});
