/**
 * Weapon definitions (SPEC §4.5).
 *
 * The full V1 roster of 10 weapons is declared here as the `WeaponType` union so
 * that client/server type-check against the complete contract. Only Baby Missile
 * and Missile are wired up for MVP1; the rest are stubbed in the definition table.
 */

export type WeaponType =
  | 'baby_missile'
  | 'missile'
  | 'heavy_missile'
  | 'baby_nuke'
  | 'nuke'
  | 'dirt_bomb'
  | 'bouncing_betty'
  | 'funky_bomb'
  | 'napalm'
  | 'shield';

/** Static description of a weapon's behavior. */
export interface WeaponDefinition {
  /** Stable identifier (matches the WeaponType union). */
  type: WeaponType;
  /** Human-readable name shown in the HUD. */
  name: string;
  /** Explosion radius in pixels. */
  radius: number;
  /** Peak damage at the center of the blast. */
  maxDamage: number;
  /** Whether this weapon raises terrain instead of cratering it (e.g. dirt bomb). */
  raisesTerrain: boolean;
  /** Whether this weapon is implemented for the current milestone. */
  implemented: boolean;
}

/**
 * Weapon definition table. MVP1 only implements Baby Missile + Missile; the
 * remaining entries are placeholders with rough tuning values so the type is
 * exhaustive and consumers can render a full shop UI later.
 */
export const WEAPONS: Record<WeaponType, WeaponDefinition> = {
  baby_missile: {
    type: 'baby_missile',
    name: 'Baby Missile',
    radius: 18,
    maxDamage: 25,
    raisesTerrain: false,
    implemented: true,
  },
  missile: {
    type: 'missile',
    name: 'Missile',
    radius: 30,
    maxDamage: 50,
    raisesTerrain: false,
    implemented: true,
  },
  heavy_missile: {
    type: 'heavy_missile',
    name: 'Heavy Missile',
    radius: 45,
    maxDamage: 75,
    raisesTerrain: false,
    implemented: false,
  },
  baby_nuke: {
    type: 'baby_nuke',
    name: 'Baby Nuke',
    radius: 60,
    maxDamage: 90,
    raisesTerrain: false,
    implemented: false,
  },
  nuke: {
    type: 'nuke',
    name: 'Nuke',
    radius: 90,
    maxDamage: 100,
    raisesTerrain: false,
    implemented: false,
  },
  dirt_bomb: {
    type: 'dirt_bomb',
    name: 'Dirt Bomb',
    radius: 50,
    maxDamage: 0,
    raisesTerrain: true,
    implemented: false,
  },
  bouncing_betty: {
    type: 'bouncing_betty',
    name: 'Bouncing Betty',
    radius: 30,
    maxDamage: 50,
    raisesTerrain: false,
    implemented: false,
  },
  funky_bomb: {
    type: 'funky_bomb',
    name: 'Funky Bomb',
    radius: 25,
    maxDamage: 40,
    raisesTerrain: false,
    implemented: false,
  },
  napalm: {
    type: 'napalm',
    name: 'Napalm',
    radius: 40,
    maxDamage: 60,
    raisesTerrain: false,
    implemented: false,
  },
  shield: {
    type: 'shield',
    name: 'Shield',
    radius: 0,
    maxDamage: 0,
    raisesTerrain: false,
    implemented: false,
  },
};

/** Look up a weapon definition by type. */
export function getWeapon(type: WeaponType): WeaponDefinition {
  return WEAPONS[type];
}
