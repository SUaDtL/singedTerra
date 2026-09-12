import { describe, expect, it } from 'vitest';
import { BattleConsoleResourceLedger, resourcesAreZero } from './resources';

describe('resource-ledger terminal cleanup', () => {
  it('is idempotent and rejects resource acquisition after terminal close', () => {
    const ledger = new BattleConsoleResourceLedger();
    ledger.acquire('pendingImports');
    ledger.acquire('pendingPromises');
    const first = ledger.close();
    const repeated = ledger.close();
    expect(first).toEqual(repeated);
    expect(resourcesAreZero(first)).toBe(true);
    expect(() => ledger.acquire('pixiApplications')).toThrow();
  });
});
