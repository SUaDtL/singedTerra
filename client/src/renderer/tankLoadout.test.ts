import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TANK_LOADOUT,
  TANK_KIT_IDS,
  TANK_PART_SLOTS,
  normalizeTankLoadout,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import { placeTanks } from '@shared/engine/Tank';
import { CANVAS_WIDTH } from '@shared/engine/Terrain';

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe('tank cosmetic loadout contract', () => {
  it('defines four kits across four independently selectable slots', () => {
    expect(TANK_KIT_IDS).toEqual(['foundry', 'ranger', 'bulwark', 'jackal']);
    expect(TANK_PART_SLOTS).toEqual(['treads', 'hull', 'turret', 'barrel']);
    expect(DEFAULT_TANK_LOADOUT).toEqual({
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'foundry',
    });
  });

  it('preserves a complete allowlisted mix and returns a fresh value', () => {
    const input: TankLoadout = {
      treads: 'jackal',
      hull: 'ranger',
      turret: 'jackal',
      barrel: 'ranger',
    };

    const normalized = normalizeTankLoadout(input);

    expect(normalized).toEqual(input);
    expect(normalized).not.toBe(input);
  });

  it.each([
    undefined,
    null,
    {},
    { treads: 'ranger' },
    {
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'prototype',
    },
    {
      treads: ['foundry'],
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'foundry',
    },
    {
      treads: 'foundry',
      hull: 'foundry',
      turret: 'foundry',
      barrel: 'foundry',
      stats: { armor: 999 },
    },
  ])('fails closed to a fresh Foundry preset for %#', (input) => {
    const normalized = normalizeTankLoadout(input);
    expect(normalized).toEqual(DEFAULT_TANK_LOADOUT);
    expect(normalized).not.toBe(DEFAULT_TANK_LOADOUT);
  });

  it('propagates presentation metadata into tanks without changing placement', () => {
    const terrain = Array.from({ length: 800 }, () => 420);
    const loadout: TankLoadout = {
      treads: 'jackal',
      hull: 'bulwark',
      turret: 'jackal',
      barrel: 'jackal',
    };
    const tanks = placeTanks(terrain, [
      { name: 'Custom', color: '#e84d4d', loadout },
      { name: 'Default', color: '#4d8ce8' },
    ]);
    const custom = required(tanks[0], 'custom tank');
    const baseline = required(tanks[1], 'baseline tank');

    expect(custom.loadout).toEqual(loadout);
    expect(custom.loadout).not.toBe(loadout);
    expect(baseline.loadout).toEqual(DEFAULT_TANK_LOADOUT);
    expect(custom.x).toBe(CANVAS_WIDTH * 0.1);
    expect(custom.y).toBe(420);
    expect(custom.angle).toBe(45);
    expect(baseline.x).toBe(CANVAS_WIDTH * 0.9);
    expect(baseline.angle).toBe(135);
  });
});
