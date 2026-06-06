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
  /**
   * Split trigger: 'apex' fires when the shell crosses the top of its arc
   * (vy rising -> falling); 'age' fires once the shell reaches `ageFrames`
   * ticks of flight (mid-arc, independent of apex). Both reuse the same
   * deterministic fan (splitAirburst) and the same hasSplit one-shot guard.
   */
  trigger: 'apex' | 'age';
  /**
   * For trigger:'age' ONLY — the projectile age (ticks since spawn) at which
   * the shell splits. Ignored for trigger:'apex'. A fixed integer constant so
   * the split fires on a deterministic tick (pure function of tick count).
   */
  ageFrames?: number;
  /** Number of submunitions the shell splits into. */
  count: number;
  /** Half-width of the horizontal velocity fan (px/tick). */
  spread: number;
}

/**
 * Napalm spread: on impact the shell fans into `cells` overlapping detonations
 * laid LEFT-TO-RIGHT across the impact column, each offset `step` px from the
 * previous. Purely geometric — derived from the impact point + this def, no RNG.
 */
export interface NapalmDef {
  /** Number of detonate() cells fired at the impact point. */
  cells: number;
  /** Horizontal spacing (px) between adjacent cells. */
  step: number;
}

/**
 * Bounce behavior: the shell reflects off terrain `maxBounces` times (deriving
 * the surface normal from neighboring-column heights) before it detonates, losing
 * a fraction of its speed per bounce (`restitution`). Tank hits always detonate
 * immediately regardless of remaining bounces. Purely deterministic — the normal
 * is derived from the replicated terrain bitmap, never random.
 */
export interface BounceDef {
  /** Terrain bounces before detonation. */
  maxBounces: number;
  /** Velocity retained per bounce (0..1). */
  restitution: number;
}

/** Optional non-default flight/behavior modifiers for a weapon. */
export interface BehaviorDef {
  /** Present only on airburst (cluster) weapons. Absent => simple ballistic shell. */
  airburst?: AirburstDef;
  /** Present only on napalm. Absent => plain shell (single impact detonation). */
  napalm?: NapalmDef;
  /** Present only on bouncing weapons (bouncing_betty). Absent => no bounce. */
  bounce?: BounceDef;
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
 * Napalm spread tuning (NAMED CONSTANTS, not magic numbers). On impact the
 * shell fires NAPALM_CELLS overlapping detonations spaced NAPALM_STEP px apart,
 * centered on the impact x. An ODD cell count puts one detonation exactly on the
 * impact point. NAPALM_STEP ~= 0.7*radius(40) gives an overlapping carpet
 * ~(NAPALM_CELLS-1)*NAPALM_STEP wide (~112px for 5/28).
 */
const NAPALM_CELLS = 5; // odd => one cell exactly on the impact x
const NAPALM_STEP = 28; // px between cells; ~0.7*radius => overlapping carpet

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
    implemented: true,
    detonation: {
      radius: 50,
      maxDamage: 85,
      style: 'blast',
      color: '#ff6600',
      durationFrames: 110,
    },
  },
  baby_nuke: {
    type: 'baby_nuke',
    name: 'Baby Nuke',
    implemented: true,
    detonation: {
      radius: 65,
      maxDamage: 90,
      style: 'blast',
      color: '#fff27a', // pale nuclear yellow
      durationFrames: 95,
    },
  },
  nuke: {
    type: 'nuke',
    name: 'Nuke',
    implemented: true,
    detonation: {
      radius: 90,
      maxDamage: 100,
      style: 'blast',
      color: '#fff7c2', // bright white-yellow flash
      durationFrames: 115,
    },
  },
  dirt_bomb: {
    type: 'dirt_bomb',
    name: 'Dirt Bomb',
    implemented: true,
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
    implemented: true,
    detonation: {
      radius: 30,
      maxDamage: 55,
      style: 'blast',
      color: '#ff8c42', // orange
      durationFrames: 52,
    },
    behavior: {
      // BOUNCING BETTY: reflect off terrain BETTY_MAX_BOUNCES (3) times, then
      // detonate on the 4th ground contact. Each bounce reflects velocity about
      // the derived surface normal and retains BETTY_RESTITUTION (0.7) of speed.
      // These literals MUST match the canonical Physics constants MAX_BOUNCES /
      // BOUNCE_RESTITUTION (asserted in the motion harness); kept inline here so
      // WeaponSystem stays dependency-free of Physics (both live in shared/).
      bounce: { maxBounces: 3, restitution: 0.7 },
    },
  },
  funky_bomb: {
    type: 'funky_bomb',
    name: 'Funky Bomb',
    implemented: true,
    detonation: {
      radius: 25,
      maxDamage: 45,
      style: 'blast',
      color: '#d65cff', // funky magenta
      durationFrames: 52,
    },
    behavior: {
      // FUNKY BOMB: 5-way mid-flight split. trigger:'age' splits at ageFrames
      // ticks (mid-arc, NOT apex) so the fan opens before the shell peaks,
      // raining bomblets over a downrange spread. Same deterministic fan math
      // as cluster_bomb (splitAirburst); a wider `spread` than cluster (0.5)
      // gives the funky scatter. All values are NAMED TUNABLES below.
      airburst: { trigger: 'age', count: 5, spread: 1.5, ageFrames: 40 },
    },
  },
  napalm: {
    type: 'napalm',
    name: 'Napalm',
    implemented: true,
    // detonation values are the PER-CELL blast read by detonate(); the impact
    // fans into behavior.napalm.cells of these laid across the landing column.
    detonation: {
      radius: 40,
      maxDamage: 65,
      style: 'blast',
      color: '#ff5a1f', // burning orange
      durationFrames: 56,
    },
    behavior: {
      // NAPALM: on impact (NOT mid-flight), the engine fires `cells` overlapping
      // detonate() calls laid LEFT-TO-RIGHT across the impact column, `step` px
      // apart. Purely geometric (impact point + this def) — deterministic, no RNG.
      napalm: { cells: NAPALM_CELLS, step: NAPALM_STEP },
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
