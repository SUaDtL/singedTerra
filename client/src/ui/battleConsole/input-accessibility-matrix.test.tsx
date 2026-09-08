import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { inputAccessibilityRegistry } from './inputArbiter';

const arbiter = readBattleConsoleContract('state/input-arbiter.json') as any;
const accessibility = readBattleConsoleContract('state/input-accessibility.json') as any;

describe('AC-21 input and accessibility parity', () => {
  it('owns every listener and transition once with ready/fallback parity', () => {
    expect(inputAccessibilityRegistry.listenerKeys).toEqual(arbiter.indices.listenerKeys);
    expect(inputAccessibilityRegistry.transitionKeys).toEqual(arbiter.indices.interactionKeys);
    expect(inputAccessibilityRegistry.matrixKeys).toEqual(accessibility.matrix.map((entry: { branchKey: string }) => entry.branchKey));
    expect(inputAccessibilityRegistry.matrixKeys.length).toBe(accessibility.cardinalities.matrixRecords);
    expect(inputAccessibilityRegistry.duplicateOwners).toEqual([]);
    expect(inputAccessibilityRegistry.readyFallbackParity).toBe(true);
  });
});
