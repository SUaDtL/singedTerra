import type { WeaponType } from '../engine/WeaponSystem';

/** Turn-system phases (SPEC §4.3 / §6). */
export type GamePhase =
  | 'LOBBY'
  | 'PLAYER_TURN'
  | 'FIRING'
  | 'RESOLVING'
  | 'GAME_OVER';

/**
 * Serializable snapshot of the full game state (SPEC §6). Broadcast by the
 * authoritative server after each RESOLVING phase, and used directly by the
 * hot-seat engine in the browser.
 */
export interface GameState {
  phase: GamePhase;
  turn: number;
  activePlayerId: string;
  /** Current wind value, range [-MAX_WIND, +MAX_WIND]. */
  wind: number;
  /**
   * Pixel terrain bitmap (Uint8Array of length CANVAS_WIDTH*CANVAS_HEIGHT,
   * index y*CANVAS_WIDTH + x, 0 = air, 1 = solid). Held by the engine and
   * returned BY REFERENCE from getState() — not copied per snapshot.
   */
  terrain: Uint8Array;
  tanks: TankState[];
  /**
   * All projectiles currently in flight (`[]` when none). FIRING iff
   * `projectiles.length > 0`. A single shot may spawn MULTIPLE projectiles —
   * e.g. an airburst weapon flies as one shell, then SPLITS at apex into N
   * submunitions, each of which is a separate entry here until it detonates.
   */
  projectiles: ProjectileState[];
  /**
   * BACK-COMPAT ALIAS for the first in-flight projectile (`projectiles[0]` or
   * `null`). Kept in lockstep with {@link projectiles} on every mutation so
   * legacy single-projectile consumers keep working. Do NOT mutate independently
   * — always derive it as `projectiles[0] ?? null`.
   */
  projectile: ProjectileState | null;
  /**
   * Most recent authoritative explosion, or `null` if none has occurred yet.
   *
   * Lifecycle / contract (so the client never replays a burst forever): the
   * engine sets this on impact to a NEW event whose `id` strictly increases
   * (monotonic counter). It is otherwise left untouched across ticks — it is
   * NOT cleared the next tick. The client keeps the last `id` it has animated;
   * on each `getState()` it compares `lastExplosion?.id`: if it is greater than
   * the id it last saw, it spawns a fresh particle burst and records the new id.
   * Equal id => already playing / already played => render nothing new. Because
   * ids are unique and monotonic, a given explosion triggers exactly one burst.
   */
  lastExplosion: ExplosionEvent | null;
  /**
   * Every explosion event produced by the MOST RECENT resolution, in the order
   * they fired (1..N — N>1 only for cluster weapons, which detonate as several
   * bomblets). Contract:
   *   - Initialized to `[]` and stays `[]` until the first blast.
   *   - REPLACED with a fresh `[]` at the START of each shot resolution (before
   *     any blast), then PUSHED to once per blast as each bomblet fires.
   *   - `length === count` for a cluster hit, `=== 1` for a normal hit, `=== 0`
   *     for an out-of-bounds miss (no blast, but the array is still reset).
   * `lastExplosion` mirrors the LAST element pushed in that resolution (or
   * `null` if none) for back-compat with consumers that read a single event.
   */
  explosions: ExplosionEvent[];
  /**
   * Active napalm fire field — every terrain column currently burning, with the
   * ticks of burn each has remaining. `[]` whenever nothing is alight (the
   * resting state between/after shots). Produced entirely by the engine each tick
   * (seeded on a napalm impact, then spread + decayed deterministically), read by
   * the renderer to draw flames. Like {@link terrain}, it is engine-authoritative
   * and never carries randomness — same (seed, action log) replays identically.
   * The FIRING phase is held open until this drains, so a turn resolves only once
   * the fire has burned out.
   */
  fire: FireCell[];
  winner: string | null;
}

/** One burning terrain column in the napalm fire field (see {@link GameState.fire}). */
export interface FireCell {
  /** Burning column (integer canvas x). */
  x: number;
  /** Ticks of burn remaining; counts down to 0, then the cell is removed. */
  life: number;
}

/** Visual style of an explosion — drives the client's burst rendering. */
export type ExplosionStyle = 'blast' | 'cluster';

/**
 * Authoritative explosion record surfaced in {@link GameState.lastExplosion}
 * and {@link GameState.explosions}. Position/radius are engine-authoritative;
 * the client turns this into the ~500ms expanding-circles animation
 * (client-only visual state, not in shared/). The style/color/durationFrames
 * fields come from the firing weapon's definition (SPEC §4.5).
 */
export interface ExplosionEvent {
  /** Monotonically increasing id; the client dedupes bursts by this. */
  id: number;
  /** Blast center x (canvas px). */
  cx: number;
  /** Blast center y (canvas px). */
  cy: number;
  /** Blast radius (px). */
  radius: number;
  /** Visual style of the burst (e.g. single 'blast' vs 'cluster' bomblet). */
  style: ExplosionStyle;
  /** CSS color string for the burst (from the weapon definition). */
  color: string;
  /** How many frames the client animation should run for this burst. */
  durationFrames: number;
}

/** One inventory slot: remaining rounds, or unlimited ammo (no Infinity sentinel). */
export interface AmmoEntry {
  count: number;
  unlimited: boolean;
}

/** Computer-opponent difficulty tier. Defined here (a leaf types module) so both
 *  the engine AI and the options/lobby plumbing can reference it cycle-free. */
export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface TankState {
  id: string;
  playerName: string;
  x: number;
  y: number;
  /** Degrees, 0 = right, 90 = up. */
  angle: number;
  /** 0–100. */
  power: number;
  /** 0–100. */
  health: number;
  /** V1 movement fuel. */
  fuel: number;
  selectedWeapon: WeaponType;
  /** V1 weapon inventory: per-weapon ammo (count + unlimited flag). */
  inventory: Record<WeaponType, AmmoEntry>;
  /** CSS color string. */
  color: string;
  alive: boolean;
  /**
   * Remaining shield particles — a destructible particle force field (SPEC §4.5,
   * Sprint 4 Slice 3). 0 = no shield. Activating the shield sets it to the shield
   * weapon's particle count; each DAMAGING blast (or napalm burn tick) destroys
   * ONE particle and is fully negated while ≥1 remains, so area weapons shred it
   * faster. Pure integer, decremented per damaging hit — deterministic, no RNG.
   * The client renders a depleting ring of dots straight from this count.
   */
  shieldParticles: number;
  /**
   * Computer-opponent control: the difficulty tier when this tank is CPU-driven,
   * or `null` for a human. Set at creation, never affects physics — purely tells
   * the client's AI driver to plan + play this tank's turn (and the HUD to badge
   * it "CPU"). Deterministic (a static flag).
   */
  ai: AiDifficulty | null;
  /**
   * Store credits (SPEC §9 weapon shop). Spent on `buy` actions during the tank's
   * turn; earned deterministically in the engine — per point of damage dealt to an
   * opponent, plus a flat per-shot stipend. Starts at STARTING_CREDITS. Integer.
   */
  credits: number;
}

export interface ProjectileState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponType: WeaponType;
  /** Ticks elapsed since this projectile spawned (0 on the spawn tick). */
  age: number;
  /**
   * Whether this projectile has already performed its airburst split. A parent
   * airburst shell is `false` until it crosses apex (then it is removed and
   * replaced by submunitions); every submunition spawns with `true` so it never
   * re-splits. Non-airburst projectiles are always `false`.
   */
  hasSplit: boolean;
  /**
   * Terrain bounces this projectile has REMAINING before it detonates. Bouncing
   * weapons (bouncing_betty) spawn with MAX_BOUNCES; each ground hit reflects
   * velocity and decrements this, detonating only when it reaches 0. Every other
   * projectile (and every airburst submunition) spawns with 0 so a ground hit
   * detonates immediately, preserving existing behavior.
   */
  bounces: number;
}
