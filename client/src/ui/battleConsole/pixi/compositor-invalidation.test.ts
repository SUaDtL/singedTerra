import { describe, expect, it } from 'vitest';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { invalidationPolicy } from '../instrumentation';

describe('AC-30 dirty-signature work bounds', () => {
  it('does zero work when stable and only the locked bounded work for one change', () => {
    expect(invalidationPolicy.measure({ changedFields: [] })).toEqual({ renders: 0, resizes: 0, allocations: 0 });
    expect(invalidationPolicy.measure({ changedFields: ['angle'] })).toEqual({ renders: 1, resizes: 0, allocations: 0 });
    expect(invalidationPolicy.measure({ changedFields: ['layoutMode'] })).toEqual({ renders: 1, resizes: 1, allocations: 0 });
  });
});
