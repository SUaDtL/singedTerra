import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { replayIntentTransition } from './inputArbiter';

const traces = readBattleConsoleContract('topology/intent-transition-traces.json') as any;

describe('AC-15 semantic and intent parity', () => {
  it('replays every observed transition with exact-once ordered intent and result parity', async () => {
    for (const trace of traces.observed) {
      const actual = await replayIntentTransition(trace);
      expect(actual).toEqual(trace.targetTransition);
      expect(actual.intents.length).toBeLessThanOrEqual(1);
    }
  });
});
