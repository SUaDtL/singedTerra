import { describe, expect, it } from 'vitest';
import { WEAPONS } from '@shared/engine/WeaponSystem';
import { WEAPON_INTEL } from './weaponIntel';

describe('weapon tactical intel catalog', () => {
  it('authors concise tactical guidance for every implemented weapon', () => {
    const implemented = Object.entries(WEAPONS)
      .filter(([, weapon]) => weapon.implemented)
      .map(([type]) => type)
      .sort();

    expect(Object.keys(WEAPON_INTEL).sort()).toEqual(implemented);
    expect(implemented).toHaveLength(18);

    for (const type of implemented) {
      const intel = WEAPON_INTEL[type as keyof typeof WEAPON_INTEL];
      expect(intel, `${type} needs authored intel`).toBeDefined();
      for (const field of ['role', 'terrain', 'damage', 'useCase'] as const) {
        expect(intel[field].trim(), `${type}.${field} must not be empty`).not.toBe('');
        expect(intel[field].length, `${type}.${field} must stay scannable`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('describes tracer as a finite turn-and-ammunition tradeoff', () => {
    expect(WEAPON_INTEL.tracer.role).not.toMatch(/risk-free/i);
    expect(WEAPON_INTEL.tracer.useCase).toMatch(/turn/i);
    expect(WEAPON_INTEL.tracer.useCase).toMatch(/ammunition/i);
  });
});
