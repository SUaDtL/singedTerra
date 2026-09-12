import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from '../contractTestSupport';

const projections = readBattleConsoleContract('topology/projections.json') as any;

describe('archived compact target requirement', () => {
  it('retains the recorded 44 by 44 CSS-pixel floor as archive evidence', () => {
    expect(projections.compactTargets.every((target: { hitRect: { width: number; height: number } }) => target.hitRect.width >= 44 && target.hitRect.height >= 44)).toBe(true);
  });
});
