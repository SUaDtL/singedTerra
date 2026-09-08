import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { compactTargetRegistry } from '../BattleConsoleRoot';

const projections = readBattleConsoleContract('topology/projections.json') as any;

describe('AC-23 compact target floors', () => {
  it('keeps every compact target at least 44 by 44 CSS pixels', () => {
    expect(compactTargetRegistry).toEqual(projections.compactTargets);
    expect(compactTargetRegistry.every((target: { hitRect: { width: number; height: number } }) => target.hitRect.width >= 44 && target.hitRect.height >= 44)).toBe(true);
  });
});
