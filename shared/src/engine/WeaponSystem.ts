/**
 * Weapon definitions (SPEC §4.5).
 *
 * The full V1 roster of 10 weapons is declared here as the `WeaponType` union so
 * that client/server type-check against the complete contract. Only Baby Missile
 * and Missile are wired up for MVP1; the rest are stubbed in the definition table.
 */

import type { ExplosionStyle } from '../types/GameState';

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
  | 'cluster_bomb'
  | 'shield';

/**
 * Detonation parameters — everything about a weapon's blast at the moment it
 * lands. Read ONLY by the engine's `detonate()` primitive, so all per-weapon
 * blast behavior lives in one nested group (clean to extend as the library
 * grows). Every weapon AND every airburst submunition routes through these.
 */
export interface DetonationDef {
  /** Explosion radius in pixels (PER-SUBMUNITION for airburst weapons). */
  radius: number;
  /** Peak damage at the center of the blast (PER-SUBMUNITION for airburst). */
  maxDamage: number;
  /** Whether this weapon raises terrain instead of cratering it (e.g. dirt bomb). */
  raisesTerrain?: boolean;
  /** Visual style of the resulting explosion event(s). */
  style: ExplosionStyle;
  /** CSS color string the client renders the burst with. */
  color: string;
  /** How many frames the client should animate each burst for. */
  durationFrames: number;
}

/**
 * Airburst behavior: the shell flies as a single projectile and SPLITS into
 * `count` submunitions when it crosses the apex of its arc (vy goes from rising
 * to falling). Submunitions fan out horizontally and fall ballistically under
 * gravity + wind, each detonating where it lands. `spread` is the half-width of
 * the submunitions' horizontal VELOCITY fan (px/tick); see GameEngine for the
 * exact (deterministic) fan formula.
 */
export interface AirburstDef {
  /** Split trigger — currently only at the arc's apex. */
  trigger: 'apex';
  /** Number of submunitions the shell splits into. */
  count: number;
  /** Half-width of the horizontal velocity fan (px/tick). */
  spread: number;
}

/** Optional non-default flight/behavior modifiers for a weapon. */
export interface BehaviorDef {
  /** Present only on airburst (cluster) weapons. Absent => simple ballistic shell. */
  airburst?: AirburstDef;
}

/** Static description of a weapon's behavior. */
export interface WeaponDefinition {
  /** Stable identifier (matches the WeaponType union). */
  type: WeaponType;
  /** Human-readable name shown in the HUD. */
  name: string;
  /** Whether this weapon is implemented for the current milestone. */
  implemented: boolean;
  /** Blast parameters applied when the weapon (or each submunition) lands. */
  detonation: DetonationDef;
  /** Optional flight-behavior modifiers (e.g. airburst). Absent => plain shell. */
  behavior?: BehaviorDef;
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
    implemented: true,
    detonation: {
      radius: 18,
      maxDamage: 34, // tuned: ~3 direct hits to kill (was 25)
      style: 'blast',
      color: '#ffb347', // soft orange
      durationFrames: 85, // ~1.4s at 60fps — slow Scorched-Earth-style bloom
    },
  },
  missile: {
    type: 'missile',
    name: 'Missile',
    implemented: true,
    detonation: {
      radius: 30,
      maxDamage: 60, // tuned: ~2 direct hits to kill (was 50)
      style: 'blast',
      color: '#ff6a2b', // hotter orange/red
      durationFrames: 100, // ~1.7s at 60fps — slow Scorched-Earth-style bloom
    },
  },
  heavy_missile: {
    type: 'heavy_missile',
    name: 'Heavy Missile',
    implemented: false,
    detonation: {
      radius: 45,
      maxDamage: 80,
      style: 'blast',
      color: '#ff3b1f', // deep red
      durationFrames: 58,
    },
  },
  baby_nuke: {
    type: 'baby_nuke',
    name: 'Baby Nuke',
    implemented: false,
    detonation: {
      radius: 60,
      maxDamage: 90,
      style: 'blast',
      color: '#fff27a', // pale nuclear yellow
      durationFrames: 58,
    },
  },
  nuke: {
    type: 'nuke',
    name: 'Nuke',
    implemented: false,
    detonation: {
      radius: 90,
      maxDamage: 100,
      style: 'blast',
      color: '#fff7c2', // bright white-yellow flash
      durationFrames: 58,
    },
  },
  dirt_bomb: {
    type: 'dirt_bomb',
    name: 'Dirt Bomb',
    implemented: false,
    detonation: {
      radius: 50,
      maxDamage: 0,
      raisesTerrain: true,
      style: 'blast',
      color: '#a9744f', // earthy brown
      durationFrames: 52,
    },
  },
  bouncing_betty: {
    type: 'bouncing_betty',
    name: 'Bouncing Betty',
    implemented: false,
    detonation: {
      radius: 30,
      maxDamage: 55,
      style: 'blast',
      color: '#ff8c42', // orange
      durationFrames: 52,
    },
  },
  funky_bomb: {
    type: 'funky_bomb',
    name: 'Funky Bomb',
    implemented: false,
    detonation: {
      radius: 25,
      maxDamage: 45,
      style: 'blast',
      color: '#d65cff', // funky magenta
      durationFrames: 52,
    },
  },
  napalm: {
    type: 'napalm',
    name: 'Napalm',
    implemented: false,
    detonation: {
      radius: 40,
      maxDamage: 65,
      style: 'blast',
      color: '#ff5a1f', // burning orange
      durationFrames: 56,
    },
  },
  cluster_bomb: {
    type: 'cluster_bomb',
    name: 'Cluster Bomb',
    implemented: true,
    // detonation values are PER-SUBMUNITION; the shell airbursts into
    // behavior.airburst.count bomblets that fan out and fall independently.
    detonation: {
      radius: 18,
      // Per-bomblet. Damage STACKS across bomblets, so a well-placed airburst that
      // lands 2-3 on a tank totals ~baby-missile-level (~34) — the cluster's value
      // is reliability/area coverage, not raw single-bomblet punch (justifies a
      // higher shop price later). A single glancing bomblet ~this value.
      maxDamage: 28,
      style: 'cluster',
      color: '#ffd23f', // distinct gold
      durationFrames: 60, // ~1s per bomblet (5 overlapping reads as a longer carpet)
    },
    behavior: {
      // spread = half-width of the horizontal velocity fan (px/tick). A bomblet's
      // ground offset ≈ spread*fall_time (~90 ticks), so 0.5 lands the extremes
      // ~2 tank widths from center => a TIGHT carpet where a direct hit stacks
      // ~3 overlapping bomblets. (Was 4.5 then 2.0 — both scattered too wide to
      // reward aim; see airburst playtest feedback.)
      airburst: { trigger: 'apex', count: 5, spread: 0.5 },
    },
  },
  shield: {
    type: 'shield',
    name: 'Shield',
    implemented: false,
    detonation: {
      radius: 0,
      maxDamage: 0,
      style: 'blast',
      color: '#7ad7ff', // shimmer blue
      durationFrames: 50,
    },
  },
};

/** Look up a weapon definition by type. */
export function getWeapon(type: WeaponType): WeaponDefinition {
  return WEAPONS[type];
}
