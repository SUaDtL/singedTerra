import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  WEAPONS,
  type AccessoryType,
  type WeaponType,
} from '@shared/engine/WeaponSystem';
import { STORE_CATALOG } from './storeCatalog';

describe('store catalog', () => {
  it('covers every finite-stock implemented weapon and accessory once in stable categories', () => {
    const catalogEntries = STORE_CATALOG.flatMap((section) => section.entries);
    const catalogKeys = catalogEntries.map((entry) => entry.type);
    const expectedKeys = [
      ...(Object.keys(WEAPONS) as WeaponType[]).filter(
        (type) => WEAPONS[type].implemented && type !== 'baby_missile',
      ),
      ...(Object.keys(ACCESSORIES) as AccessoryType[]),
    ];

    expect(STORE_CATALOG.map((section) => section.title)).toEqual([
      'Impact',
      'Tactical',
      'Terrain & Fire',
      'Systems',
    ]);
    expect(catalogKeys).toHaveLength(expectedKeys.length);
    expect(new Set(catalogKeys)).toEqual(new Set(expectedKeys));
    expect(STORE_CATALOG.map((section) => section.entries.map((entry) => entry.type))).toEqual([
      ['missile', 'heavy_missile', 'baby_nuke', 'nuke'],
      ['bouncing_betty', 'funky_bomb', 'cluster_bomb', 'mirv', 'deaths_head'],
      ['dirt_bomb', 'riot_bomb', 'napalm', 'hot_napalm', 'sandhog'],
      ['shield', 'battery', 'fuel_tank'],
    ]);
  });

  it('provides concise behavior summaries for every store item', () => {
    const summaries = Object.fromEntries(
      STORE_CATALOG.flatMap((section) => section.entries)
        .map((entry) => [entry.type, entry.summary]),
    );

    expect(Object.values(summaries).every((summary) => summary.trim().length > 0)).toBe(true);
    expect(summaries).toMatchObject({
      bouncing_betty: 'Bounds through terrain with a blast at every hop.',
      riot_bomb: 'Carves a wide crater without blast damage.',
      napalm: 'Spreads a lingering fire across the surface.',
      sandhog: 'Drills underground before its endpoint blast.',
      shield: 'Absorbs incoming damage before it reaches your tank.',
      battery: '+100 power cap.',
      fuel_tank: '+100 movement fuel.',
    });
  });
});
