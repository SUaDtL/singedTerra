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
 * Napalm fire field: on impact the shell does NOT crater or carpet-bomb. It
 * splashes a puddle of burning terrain columns (`splashRadius` px each side of
 * impact) and emits an ignition flash; thereafter the fire SPREADS along the
 * surface (`spreadRate` columns/side/tick, flowing downhill freely but only
 * climbing walls up to `climbLimit` px), pools in valleys, and BURNS any tank
 * standing in it for `dotPerTick` damage each tick until every column's
 * `burnTicks` lifetime expires. All damage is this lingering burn — there is no
 * impact blast. Purely deterministic (surface heights + fixed steps, no RNG).
 */
export interface NapalmDef {
  /** Initial burning-puddle half-width seeded on impact (px each side of impact x). */
  splashRadius: number;
  /** Max half-width the fire may spread to, measured from the impact column (px). */
  maxSpread: number;
  /** Columns the fire creeps outward, per side, per tick. */
  spreadRate: number;
  /** Ticks each ignited column burns before going out. */
  burnTicks: number;
  /** Damage per tick dealt to a tank standing in the fire. */
  dotPerTick: number;
  /** Max upward step (px) the fire will climb into a higher neighbour column;
   *  taller rises block the spread (fire flows down/across, not up cliffs). */
  climbLimit: number;
}

/**
 * Bounce behavior: the shell reflects off terrain `maxBounces` times (deriving
 * the surface normal from neighboring-column heights) before it detonates, losing
 * a fraction of its speed per bounce (`restitution`). Tank hits always detonate
 * immediately regardless of remaining bounces. Purely deterministic — the normal
 * is derived from the replicated terrain bitmap, never random.
 *
 * The two optional fields turn a plain "rubber ball" bounce into a BOUNDING MINE:
 * `detonateEachBounce` fires a full blast at EVERY ground contact (not just the
 * final one), so the shell lays a chain of explosions as it skips downrange; and
 * `hopBoost` adds an upward velocity kick after each reflection so it visibly
 * LEAPS between blasts instead of dribbling along the surface. Both are pure
 * arithmetic (constant kick, deterministic normal) so replay stays byte-identical.
 */
export interface BounceDef {
  /** Terrain bounces before detonation. */
  maxBounces: number;
  /** Velocity retained per bounce (0..1). */
  restitution: number;
  /** When true, detonate a full blast at EVERY ground contact (bounding-mine
   *  chain), not only after the bounces are spent. Absent => silent bounces. */
  detonateEachBounce?: boolean;
  /** Upward velocity (px/tick) added after each reflection so the shell hops/
   *  leaps off each contact. Absent/0 => pure physical reflection only. */
  hopBoost?: number;
}

/**
 * Shield: not a projectile at all. Activating it (the `use_shield` action) wraps
 * the firing tank in `particles` destructible force-field particles; each
 * damaging blast destroys one and is fully negated while ≥1 remains. Pure integer
 * count, decremented per damaging hit — deterministic, no RNG.
 */
export interface ShieldDef {
  /** Particles granted on activation (each absorbs one damaging blast/burn tick). */
  particles: number;
}

/** Optional non-default flight/behavior modifiers for a weapon. */
export interface BehaviorDef {
  /** Present only on airburst (cluster) weapons. Absent => simple ballistic shell. */
  airburst?: AirburstDef;
  /** Present only on napalm. Absent => plain shell (single impact detonation). */
  napalm?: NapalmDef;
  /** Present only on bouncing weapons (bouncing_betty). Absent => no bounce. */
  bounce?: BounceDef;
  /** Present only on the shield. Absent => an offensive weapon (a projectile). */
  shield?: ShieldDef;
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
  // ---- Store economy (SPEC §9 weapon shop). Prices/bundles/arms-levels are
  // mapped from the canonical Scorched Earth 1991 catalog (see
  // docs/reference/scorched_earth_1991_catalog.ts). ----
  /** Cost in credits for ONE bundle (a purchase grants `bundleSize` rounds). */
  price: number;
  /** Rounds granted per purchase (Scorched Earth sells in bundles). */
  bundleSize: number;
  /** Arms-level availability gate (0 = always available). Informational until an
   *  arms-level room setting exists; the store may dim higher-level items. */
  armsLevel: number;
}

/**
 * Napalm fire-field tuning (NAMED CONSTANTS, not magic numbers). On impact a
 * burning puddle ~2*NAPALM_SPLASH wide is seeded, then creeps NAPALM_SPREAD_RATE
 * columns/side/tick out to ±NAPALM_MAX_SPREAD (flowing downhill, climbing rises
 * only up to NAPALM_CLIMB px). Each column burns NAPALM_BURN_TICKS ticks; a tank
 * in the flames takes NAPALM_DOT per tick (so a full engulfment over the burn
 * roughly totals a heavy-weapon hit, but spread out — rewarding good terrain).
 */
const NAPALM_SPLASH = 24;       // initial puddle half-width (px) — ~48px wide splat
const NAPALM_MAX_SPREAD = 90;   // max half-width the fire creeps to from impact (px)
const NAPALM_SPREAD_RATE = 3;   // columns/side/tick the fire front advances
const NAPALM_BURN_TICKS = 78;   // ~1.3s per column at 60fps — fire lingers
// damage/tick to a tank in the fire. A dead-centre hit keeps a tank in the flames
// for ~burnTicks, so peak total ≈ DOT*burnTicks ≈ 55 — a heavy AREA-DENIAL hit
// that wounds/zones but does NOT one-shot a full-health tank (vs the missile's
// burst damage). Tunable in playtesting.
const NAPALM_DOT = 0.7;
const NAPALM_CLIMB = 6;         // max px rise the fire will climb (walls block it)

/**
 * Shield force-field tuning. Activating the shield grants this many particles;
 * each damaging blast (or napalm burn tick) destroys one and is negated while ≥1
 * remains. 12 => blocks a direct missile + glance, or ~12 cluster bomblets / napalm
 * ticks before failing. Tunable in playtesting.
 */
const SHIELD_PARTICLES = 12;

/**
 * Store economy tuning (SPEC §9). Credits use the Scorched Earth scale (weapons
 * cost thousands), so earnings are scaled to match: a tank starts with
 * STARTING_CREDITS, earns CREDITS_PER_DAMAGE per point of damage dealt to an
 * opponent, plus a flat TURN_STIPEND each shot (so even a miss pays a little).
 * A clean kill (~100 dmg) nets ~CREDITS_PER_DAMAGE*100 + stipend ≈ a Baby Nuke.
 * All integers / pure arithmetic — deterministic, no RNG.
 */
export const STARTING_CREDITS = 15000;  // ~ a Nuke, or a Missile pack + Cluster
export const CREDITS_PER_DAMAGE = 80;   // 100-dmg kill => 8000
export const TURN_STIPEND = 500;        // flat income per shot fired

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
    price: 400, bundleSize: 10, armsLevel: 0, // unlimited stock — store hides it
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
    price: 1875, bundleSize: 5, armsLevel: 0,
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
    price: 6000, bundleSize: 3, armsLevel: 1, // no exact catalog twin — interpolated

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
    price: 10000, bundleSize: 3, armsLevel: 0,
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
    price: 12000, bundleSize: 1, armsLevel: 1,
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
    price: 5000, bundleSize: 5, armsLevel: 0, // ≈ Dirt Ball (earth-producing)
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
    price: 6000, bundleSize: 5, armsLevel: 2, // ≈ Roller (skips across terrain)
    detonation: {
      radius: 30,
      maxDamage: 55,
      style: 'blast',
      color: '#ff8c42', // orange
      durationFrames: 52,
    },
    behavior: {
      // BOUNCING BETTY = a BOUNDING MINE, not a rubber ball. It skips across the
      // terrain detonating a FULL blast at every ground contact (4 total: 3 hops
      // + a final), leaping upward (hopBoost) between blasts so it lays a chain of
      // explosions downrange — distinct from the cluster's instant carpet. It
      // reflects BETTY_MAX_BOUNCES (3) times about the derived surface normal,
      // retaining BETTY_RESTITUTION (0.7) of speed per hop, then detonates a 4th
      // time and is consumed. maxBounces/restitution MUST match the canonical
      // Physics constants MAX_BOUNCES / BOUNCE_RESTITUTION (asserted in the motion
      // harness); kept inline so WeaponSystem stays dependency-free of Physics.
      bounce: { maxBounces: 3, restitution: 0.7, detonateEachBounce: true, hopBoost: 2.6 },
    },
  },
  funky_bomb: {
    type: 'funky_bomb',
    name: 'Funky Bomb',
    implemented: true,
    price: 7000, bundleSize: 2, armsLevel: 4,
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
    price: 10000, bundleSize: 10, armsLevel: 2,
    // detonation values here drive ONLY the ignition flash (color/radius/duration
    // for the visual splash + screen-shake). maxDamage is 0 — napalm deals NO
    // impact damage; all of its damage is the per-tick burn (behavior.napalm.
    // dotPerTick). It also does not crater, so the terrain stays to carry the fire.
    detonation: {
      radius: 34,
      maxDamage: 0, // pure DOT weapon — the burn does the damage, not the impact
      style: 'blast',
      color: '#ff5a1f', // burning orange
      durationFrames: 40,
    },
    behavior: {
      // NAPALM: a spreading, lingering fire field (NOT an instant carpet). On
      // impact it seeds a burning puddle, then the fire creeps along the surface
      // (downhill-biased), pooling in valleys and burning tanks over time. Fully
      // deterministic — surface heights + fixed per-tick steps, no RNG. See the
      // NapalmDef doc + igniteNapalm/processFire in GameEngine.
      napalm: {
        splashRadius: NAPALM_SPLASH,
        maxSpread:    NAPALM_MAX_SPREAD,
        spreadRate:   NAPALM_SPREAD_RATE,
        burnTicks:    NAPALM_BURN_TICKS,
        dotPerTick:   NAPALM_DOT,
        climbLimit:   NAPALM_CLIMB,
      },
    },
  },
  cluster_bomb: {
    type: 'cluster_bomb',
    name: 'Cluster Bomb',
    implemented: true,
    price: 10000, bundleSize: 3, armsLevel: 2, // ≈ MIRV (apex multi-warhead)
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
    implemented: true,
    price: 20000, bundleSize: 3, armsLevel: 3,
    // No blast — the shield never detonates. These fields are inert (radius 0 =>
    // detonate() is a no-op even if ever routed here), kept for type-exhaustiveness
    // and so the client can read a color for the force-field ring.
    detonation: {
      radius: 0,
      maxDamage: 0,
      style: 'blast',
      color: '#7ad7ff', // shimmer blue (force-field ring)
      durationFrames: 50,
    },
    behavior: {
      // SHIELD: activating it (use_shield) grants SHIELD_PARTICLES particles; each
      // damaging blast strips one and is fully negated while ≥1 remains.
      shield: { particles: SHIELD_PARTICLES },
    },
  },
};

/** Look up a weapon definition by type. */
export function getWeapon(type: WeaponType): WeaponDefinition {
  return WEAPONS[type];
}
