import { describe, expect, it } from 'vitest';
import { BARREL_LENGTH, BARREL_PIVOT_HEIGHT, barrelTip } from '@shared/engine/Tank';
import type { TankState } from '@shared/types/GameState';
import {
  DEFAULT_TANK_LOADOUT,
  TANK_KIT_IDS,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import {
  DEFAULT_TANK_PART_SET,
  TANK_PART_ATLAS_HEIGHT,
  TANK_PART_SETS,
  TANK_PART_SLOTS,
  tankPartDefinition,
  tankBarrelMount,
} from './tankPartCatalog';

describe('modular tank part catalog', () => {
  it('defines one exhaustive default set with tight occupied source crops', () => {
    expect(TANK_PART_SLOTS).toEqual([
      'treads',
      'hull',
      'turret',
      'barrel',
    ]);
    expect(Object.keys(DEFAULT_TANK_PART_SET.parts)).toEqual(TANK_PART_SLOTS);

    for (const [column, slot] of TANK_PART_SLOTS.entries()) {
      const crop = DEFAULT_TANK_PART_SET.parts[slot].source;
      expect(crop.x).toBeGreaterThanOrEqual(column * 256);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual((column + 1) * 256);
      expect(crop.y + crop.height).toBeLessThanOrEqual(128);
      expect(crop.width).toBeLessThan(256);
      expect(crop.height).toBeLessThan(128);
    }
  });

  it('defines four coherent atlas rows with tight compatible parts', () => {
    expect(TANK_PART_ATLAS_HEIGHT).toBe(512);
    expect(Object.keys(TANK_PART_SETS)).toEqual(TANK_KIT_IDS);

    for (const [row, kit] of TANK_KIT_IDS.entries()) {
      expect(Object.keys(TANK_PART_SETS[kit].parts)).toEqual(TANK_PART_SLOTS);
      for (const [column, slot] of TANK_PART_SLOTS.entries()) {
        const crop = TANK_PART_SETS[kit].parts[slot].source;
        expect(crop.x).toBeGreaterThanOrEqual(column * 256);
        expect(crop.y).toBeGreaterThanOrEqual(row * 128);
        expect(crop.x + crop.width).toBeLessThanOrEqual((column + 1) * 256);
        expect(crop.y + crop.height).toBeLessThanOrEqual((row + 1) * 128);
        expect(crop.width).toBeLessThan(256);
        expect(crop.height).toBeLessThan(128);
      }
    }
  });

  it('stacks distinct mobility, hull, and turret boxes into side-view tanks', () => {
    for (const kit of TANK_KIT_IDS) {
      const { treads, hull, turret } = TANK_PART_SETS[kit].parts;
      const geometries = [treads, hull, turret].map((part) => ({
        offsetX: part.offsetX,
        offsetY: part.offsetY,
        width: part.width,
        height: part.height,
      }));

      expect(new Set(geometries.map((geometry) =>
        JSON.stringify(geometry))).size).toBe(3);
      expect(treads.offsetY + treads.height).toBe(0);
      expect(hull.offsetY).toBeLessThan(treads.offsetY + treads.height);
      expect(hull.offsetY + hull.height).toBeGreaterThan(treads.offsetY);
      expect(turret.offsetY).toBeLessThan(hull.offsetY);
      expect(turret.offsetY + turret.height).toBeGreaterThanOrEqual(-20);
      expect(turret.offsetY).toBeLessThanOrEqual(-20);
    }
  });

  it('resolves every slot independently from a mixed player loadout', () => {
    const loadout: TankLoadout = {
      treads: 'jackal',
      hull: 'ranger',
      turret: 'foundry',
      barrel: 'jackal',
    };

    expect(TANK_PART_SLOTS.map((slot) =>
      Math.floor(tankPartDefinition(loadout, slot).source.y / 128))).toEqual([
      3,
      1,
      0,
      3,
    ]);
    expect(tankPartDefinition(DEFAULT_TANK_LOADOUT, 'barrel')).toBe(
      DEFAULT_TANK_PART_SET.parts.barrel,
    );
  });

  it('anchors the visible barrel pivot and muzzle to shared engine geometry', () => {
    const tank = {
      x: 240,
      y: 410,
      angle: 42,
    } as TankState;
    const mount = tankBarrelMount(tank);
    const tip = barrelTip(tank, BARREL_LENGTH);

    expect(mount.pivot).toEqual({
      x: tank.x,
      y: tank.y - BARREL_PIVOT_HEIGHT,
    });
    expect(mount.muzzle).toEqual(tip);
    expect(Math.hypot(
      mount.muzzle.x - mount.pivot.x,
      mount.muzzle.y - mount.pivot.y,
    )).toBeCloseTo(BARREL_LENGTH, 8);

    const barrel = DEFAULT_TANK_PART_SET.parts.barrel;
    expect(barrel.pivotX).toBe(-barrel.offsetX);
    expect(barrel.muzzleX).toBe(BARREL_LENGTH - barrel.offsetX);
    expect(barrel.muzzleX - barrel.pivotX).toBe(BARREL_LENGTH);
    expect(barrel.width).toBeLessThan(30);
    expect(barrel.height).toBeLessThan(12);
  });
});
