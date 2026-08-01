import type { AccessoryType, WeaponType } from '@shared/engine/WeaponSystem';

export interface StoreWeaponEntry {
  readonly kind: 'weapon';
  readonly type: WeaponType;
  readonly summary: string;
}

export interface StoreAccessoryEntry {
  readonly kind: 'accessory';
  readonly type: AccessoryType;
  readonly summary: string;
}

export type StoreCatalogEntry = StoreWeaponEntry | StoreAccessoryEntry;

export interface StoreCatalogSection {
  readonly title: string;
  readonly entries: readonly StoreCatalogEntry[];
}

/** Presentation-only grouping and role copy for the in-turn armory catalog. */
export const STORE_CATALOG: readonly StoreCatalogSection[] = [
  {
    title: 'Impact',
    entries: [
      { kind: 'weapon', type: 'missile', summary: 'Reliable direct-hit blast.' },
      { kind: 'weapon', type: 'heavy_missile', summary: 'Heavy blast for fortified targets.' },
      { kind: 'weapon', type: 'baby_nuke', summary: 'Compact nuclear blast.' },
      { kind: 'weapon', type: 'nuke', summary: 'Maximum-radius nuclear blast.' },
    ],
  },
  {
    title: 'Tactical',
    entries: [
      {
        kind: 'weapon',
        type: 'bouncing_betty',
        summary: 'Bounds through terrain with a blast at every hop.',
      },
      { kind: 'weapon', type: 'funky_bomb', summary: 'Splits into a wide mid-flight spread.' },
      {
        kind: 'weapon',
        type: 'cluster_bomb',
        summary: 'Splits at the apex into a tight bomblet carpet.',
      },
      { kind: 'weapon', type: 'mirv', summary: 'Splits at the apex into three heavy warheads.' },
      {
        kind: 'weapon',
        type: 'deaths_head',
        summary: 'Splits at the apex into seven heavy warheads.',
      },
    ],
  },
  {
    title: 'Terrain & Fire',
    entries: [
      { kind: 'weapon', type: 'dirt_bomb', summary: 'Raises a mound instead of a crater.' },
      { kind: 'weapon', type: 'riot_bomb', summary: 'Carves a wide crater without blast damage.' },
      { kind: 'weapon', type: 'napalm', summary: 'Spreads a lingering fire across the surface.' },
      {
        kind: 'weapon',
        type: 'hot_napalm',
        summary: 'A wider, hotter, longer-burning fire field.',
      },
      { kind: 'weapon', type: 'sandhog', summary: 'Drills underground before its endpoint blast.' },
    ],
  },
  {
    title: 'Systems',
    entries: [
      {
        kind: 'weapon',
        type: 'shield',
        summary: 'Absorbs incoming damage before it reaches your tank.',
      },
      { kind: 'accessory', type: 'battery', summary: '+100 power cap.' },
      { kind: 'accessory', type: 'fuel_tank', summary: '+100 movement fuel.' },
    ],
  },
];
