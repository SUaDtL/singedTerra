import { describe, expect, it } from 'vitest';
import { BattleConsoleResourceLedger, resourcesAreZero } from './resources';

describe('resource-ledger terminal cleanup', () => {
  it('closes acquisition without fabricating release of an outstanding lease', () => {
    const ledger = new BattleConsoleResourceLedger();
    const importLease = ledger.acquire('pendingImports');
    const promiseLease = ledger.acquire('pendingPromises');
    const first = ledger.close();
    const repeated = ledger.close();
    expect(first).toEqual(repeated);
    expect(first).toMatchObject({ pendingImports: 1, pendingPromises: 1 });
    expect(resourcesAreZero(first)).toBe(false);
    expect(() => ledger.acquire('pixiApplications')).toThrow();

    importLease.release();
    expect(ledger.snapshot()).toMatchObject({ pendingImports: 0, pendingPromises: 1 });
    promiseLease.release();
    expect(resourcesAreZero(ledger.snapshot())).toBe(true);
  });
});
