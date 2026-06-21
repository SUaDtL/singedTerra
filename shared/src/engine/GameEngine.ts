import type {
  ExplosionEvent,
  GameState,
  ProjectileState,
  TankState,
} from '../types/GameState';
import type { PlayerAction } from '../types/PlayerAction';
import type { GameOptions } from '../types/GameOptions';
import {
  generate,
  buildBitmap,
  deform,
  applyGravity,
  settleStep,
  COLLAPSE_PX_PER_TICK,
  surfaceAt,
  pixelAt,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from './Terrain';
import {
  placeTwoTanks,
  placeTanks,
  barrelTip,
  Tank,
  TANK_HEIGHT,
  TANK_WIDTH,
  BARREL_LENGTH,
} from './Tank';
import { clamp } from './math';
import {
  launchVelocity,
  stepProjectile,
  sweepCollide,
  explosionDamage,
  surfaceNormalAt,
  reflectVelocity,
  MAX_WIND,
  WIND_DRIFT_STEP,
  MAX_DAMAGE,
  GRAVITY,
} from './Physics';
import {
  getWeapon,
  type WeaponType,
  type AccessoryType,
  type NapalmDef,
  CREDITS_PER_DAMAGE,
  TURN_STIPEND,
  BATTERY_PRICE,
  BATTERY_BUNDLE_SIZE,
  BATTERY_POWER_PER_UNIT,
  BATTERY_ARMS_LEVEL,
} from './WeaponSystem';
import { createRng } from './Random';

/**
 * Burial safety valve (#15): the maximum number of turns a tank may stay trapped under
 * dirt before it auto-digs-out, so a player can never be locked out of the match forever.
 * A buried tank may be freed EARLIER by terrain cleared over it (a crater / Riot Bomb).
 * Tunable; a named constant, not a magic number.
 */
const MAX_BURIED_TURNS = 2;

/**
 * Master game state machine (SPEC §4.3). Owns the authoritative `GameState` and
 * drives the loop. Runs identically in the browser (hot-seat) and on the server
 * (networked) — physics is fixed-timestep and deterministic: identical
 * (seed, action-sequence, tick-count) always yields identical state.
 *
 * MVP1 scope: terrain + 2–4 tanks + aim + fire + ballistic flight + crater +
 * explosion event + per-blast damage/death + terrain collapse + turn rotation
 * over living tanks + per-turn seeded wind + win/draw detection. The turn state
 * machine is LOBBY → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN → GAME_OVER;
 * RESOLVING and NEXT_TURN are transient within a single resolving tick(), so the
 * resting phase after a resolved shot is PLAYER_TURN (or GAME_OVER).
 */

/**
 * Fixed default terrain seed used when `GameOptions.seed` is absent. A literal
 * constant — NEVER derived from the clock or a global random source — so a
 * seedless construction is still fully reproducible.
 */
const DEFAULT_SEED = 0x5eed_1234;

/**
 * Derive a per-round terrain/wind seed from the match's base seed and the (1-based)
 * round number. Round 1 uses the base seed directly (see the constructor); rounds
 * 2..N use this. Pure arithmetic over uint32 (the >>> 0 keeps it a 32-bit unsigned
 * value, matching what generate()/createRng() consume) — so every networked client
 * replaying the same action log computes the identical seed for every round, with no
 * new action and no server involvement. The multiplier is the golden-ratio constant
 * (2^32/φ) used widely as a cheap hash mixer, so successive rounds decorrelate.
 */
function deriveRoundSeed(baseSeed: number, round: number): number {
  return (baseSeed + round * 0x9e3779b1) >>> 0;
}

/** Push-off distance (px) along the surface normal after a bounce so the next
 *  tick does not re-collide with the same solid pixel. */
const BOUNCE_EPS = 1.5;

/** Aim-input clamps (SPEC §6: angle degrees 0=right..180=left; power 0–100). */
const ANGLE_MIN = 0;
const ANGLE_MAX = 180;
const POWER_MIN = 0;
/** Baseline firing-power cap (SPEC §6). A tank's effective cap may rise above this with
 *  bought Batteries (TankState.powerCap); this is only the default / no-battery ceiling. */
export const POWER_MAX = 100;

/**
 * Sudden-death gravity ramp (SE-parity stalemate-breaker). Once `state.turn` passes the
 * room's `suddenDeathTurn`, effective gravity is multiplied by (1 + turnsPast * this), so
 * each subsequent turn shrinks max range and forces resolution. A NAMED, playtest-tunable
 * constant (12%/turn) — exported so the harness pins the exact value with no magic-number
 * drift. Pure arithmetic; sudden death is a function of the turn count only, never a clock.
 */
export const SUDDEN_DEATH_GRAVITY_RAMP = 0.12;

/**
 * Effective gravity under sudden death — the SINGLE source of truth, shared by the engine's
 * per-tick integration AND the AI shot planner (so bots aim with the gravity the engine will
 * actually fly the shot under). Pure: equals `baseGravity` until `turn` passes
 * `suddenDeathTurn`, then ramps `baseGravity * (1 + (turn - suddenDeathTurn) * RAMP)`.
 * suddenDeathTurn <= 0 disables it (returns base). No clock, no random.
 */
export function effectiveGravity(baseGravity: number, turn: number, suddenDeathTurn: number): number {
  if (suddenDeathTurn <= 0) return baseGravity;
  const past = turn - suddenDeathTurn;
  if (past <= 0) return baseGravity;
  return baseGravity * (1 + past * SUDDEN_DEATH_GRAVITY_RAMP);
}

export class GameEngine {
  private state: GameState;

  /** Live terrain pixel bitmap (authoritative; returned by ref from getState()). */
  private terrain: Uint8Array;

  /** Monotonic explosion id source — drives ExplosionEvent.id dedupe. */
  private explosionSeq = 0;

  /**
   * Active napalm fire field — working store of burning column x → ticks of burn
   * remaining. A Map (not the GameState array) for O(1) ignite/decay during
   * spread; mirrored to `state.fire` (sorted by x, deterministic) after each
   * mutation. Empty whenever nothing is alight. Only one napalm shot burns at a
   * time (a shot fully resolves before the next turn), so a single field suffices.
   */
  private fire = new Map<number, number>();

  /** The burning napalm's def + impact column, retained while `fire` is non-empty
   *  so processFire() knows the spread bounds/rate. Null when nothing is alight. */
  private fireDef: NapalmDef | null = null;
  private fireCenter = 0;

  /**
   * Columns this fire has EVER lit. A column burns exactly once: spread never
   * re-ignites a scorched column. Without this, a frontier cell that decays lets
   * the spread retreat then re-extend into the just-burned column, relighting it
   * forever — an oscillating, non-terminating fire. Cleared when the field dies.
   */
  private fireScorched = new Set<number>();

  /**
   * Store economy bookkeeping for the in-flight shot: who fired it, and the total
   * EFFECTIVE damage it has dealt to OTHER tanks so far. Set/reset when a shot is
   * fired; read in resolve() to award the shooter credits. Self-damage does not
   * pay. Pure integers — deterministic.
   */
  private shooterId = '';
  private shotDamage = 0;

  /**
   * Independent seeded wind RNG stream (SPEC §4.4). Advanced exactly once per
   * turn (once at construction for the opening turn, once per NEXT_TURN). Kept
   * separate from terrain generation so the two streams never correlate. Same
   * game seed + same action sequence => identical wind sequence every turn.
   */
  private windRng: () => number;

  /**
   * The seed passed to `createRng()` when the current `windRng` stream was
   * initialised — equal to `this.seed` for the opening round and to
   * `deriveRoundSeed(this.seed, round)` for every subsequent round (set by
   * `startNextRound()`). Retained so `clone()` can reconstruct an identical RNG
   * stream at exactly the same position without having to snapshot the closure's
   * internal state.
   */
  private windRngSeed: number;

  /**
   * How many times `this.windRng()` has been called since the last
   * `createRng()` invocation (construction or `startNextRound()`). Incremented
   * by `nextWind()`. Used by `clone()` to fast-forward a fresh copy of the RNG
   * to the same stream position as the original.
   */
  private windRngCalls = 0;

  /** Per-room wind cap (defaults to MAX_WIND); tunable via GameOptions. */
  private maxWind: number;

  /** Per-room gravity (defaults to GRAVITY); tunable via GameOptions. */
  private gravity: number;

  /**
   * Base terrain/wind seed for the whole match. The opening round uses it directly;
   * each later round derives its own seed from it + the round index (deriveRoundSeed)
   * so rounds differ yet every networked client regenerates the identical terrain.
   */
  private seed: number;

  /** Best-of-N match length (>= 1). 1 => single-round / back-compat behavior. */
  private totalRounds: number;

  /**
   * Per-round credit interest rate (SE-parity economy). At each ROUND_OVER boundary every
   * tank earns `floor(credits * interestRate)` on its carried balance. 0 => no interest
   * (back-compat). A non-finite/negative option falls back to 0. Pure integer arithmetic.
   */
  private interestRate: number;

  /**
   * Sudden-death threshold turn (SE-parity stalemate-breaker). 0 => off (back-compat).
   * Once the PER-ROUND turn (`state.turn - turnAtRoundStart`) exceeds this, `currentGravity()`
   * ramps gravity up per turn. A non-finite/negative option falls back to 0 (off). Pure
   * function of the per-round turn count.
   */
  private suddenDeathTurn: number;

  /**
   * The match-global `state.turn` value at which the CURRENT round began (0 for the opening
   * round; reset in startNextRound). Subtracted from `state.turn` to get the PER-ROUND turn
   * that drives sudden death, so escalation resets each round and a long earlier round never
   * carries it forward. Deterministic integer; copied by clone().
   */
  private turnAtRoundStart: number;

  /**
   * Arms-level store cap (SE-parity economy, 0–4). `applyBuy` rejects any weapon whose
   * `armsLevel` exceeds this. Defaults to 4 (everything buyable / back-compat); an
   * out-of-range option is clamped into [0, 4]. Gates purchases only — never the opening
   * loadout or physics. Static config; copied by clone() for next-seat derivation parity.
   */
  private armsLevel: number;

  /** Original construction options, retained so startNextRound can re-place tanks
   *  the same way the opening round did (same player roster / layout path). */
  private options?: GameOptions;

  /**
   * Pending unsettled column range from the most recent detonation(s), merged
   * across multiple detonations in the same tick (cluster/MIRV/betty chain).
   * Non-null only between the moment FIRING ends (settled, non-game-over) and
   * when the animated RESOLVING settle completes. Null when no settle is pending.
   *
   * During FIRING (projectiles still in flight), detonations settle instantly
   * (flushSettleInstant) and this field is consumed within the same tick.
   * At end-of-turn with no projectiles and no fire, this field is LEFT for the
   * RESOLVING phase to animate one settleStep per tick until converged.
   *
   * Determinism: pure integer xStart/xEnd — no clock, no random.
   */
  private pendingSettle: { xStart: number; xEnd: number } | null = null;

  /**
   * Lazily-built per-column surface cache (P2 perf): surfaceAt() is an O(H) top-down
   * scan, and processFire/canSpread/resolveTanksToTerrain call it per burning column
   * EVERY tick — re-scanning a stable bitmap. This memoizes the topmost-solid y per
   * column, keyed on `state.terrainVersion`. Every terrain mutation (deform, each
   * settle step, round-restart rebuild) already bumps terrainVersion, so a version
   * mismatch invalidates the whole cache; entries are computed lazily on first query
   * via the SAME surfaceAt() scan, so cached values are byte-identical to a fresh
   * scan. `-1` marks an uncomputed column (a real surface y is always in [0, H]).
   * Determinism: pure derived data — no clock, no random; a clone rebuilds it lazily.
   */
  private surfaceCache = new Int16Array(CANVAS_WIDTH).fill(-1);
  private surfaceCacheVersion = -1;

  /**
   * Cached surfaceAt: returns the topmost-solid y for column floor(x), identical to
   * surfaceAt(this.terrain, x). Rebuilds (invalidates) the cache when terrainVersion
   * has changed since the last fill, then memoizes each queried column. The clamp on
   * x mirrors surfaceAt exactly so the cache is keyed on the same column index.
   */
  private surfaceAtCached(x: number): number {
    if (this.surfaceCacheVersion !== this.state.terrainVersion) {
      this.surfaceCache.fill(-1);
      this.surfaceCacheVersion = this.state.terrainVersion;
    }
    const xi = clamp(Math.floor(x), 0, CANVAS_WIDTH - 1);
    const cached = this.surfaceCache[xi];
    if (cached !== -1) return cached;
    const surf = surfaceAt(this.terrain, xi);
    this.surfaceCache[xi] = surf;
    return surf;
  }

  constructor(options?: GameOptions) {
    const seed = options?.seed ?? DEFAULT_SEED;
    const heightLine = generate(seed);
    this.terrain = buildBitmap(heightLine);
    this.windRng = createRng(seed);
    this.windRngSeed = seed;
    this.maxWind = options?.maxWind ?? MAX_WIND;
    this.gravity = options?.gravity ?? GRAVITY;
    this.seed = seed;
    // Clamp to a sane >= 1 integer; non-finite/<=0 falls back to a single round.
    this.totalRounds = Math.max(1, Math.floor(options?.rounds ?? 1) || 1);
    // Per-round interest: a finite, non-negative rate or 0 (no interest / back-compat).
    const rate = options?.interestRate ?? 0;
    this.interestRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
    // Sudden death: a finite, positive threshold turn or 0 (off / back-compat).
    const sd = options?.suddenDeathTurn ?? 0;
    this.suddenDeathTurn = Number.isFinite(sd) && sd > 0 ? Math.floor(sd) : 0;
    // Arms level: a finite level clamped to [0,4], else 4 (everything / back-compat).
    const al = options?.armsLevel;
    this.armsLevel = Number.isFinite(al) ? clamp(Math.floor(al as number), 0, 4) : 4;
    this.turnAtRoundStart = 0; // opening round begins at the turn-0 baseline
    this.options = options;

    // number[] height line for tank placement (Tank.ts is unchanged and still
    // expects a per-column surface line, not the pixel bitmap).
    const terrainArr = Array.from(heightLine);

    // 2–4 explicit players => generalized placement; otherwise the MVP0 default
    // two-tank layout (byte-identical to before for back-compat).
    const players = options?.players;
    const tanks =
      players && players.length >= 2 && players.length <= 4
        ? placeTanks(terrainArr, players, options)
        : placeTwoTanks(terrainArr, options);

    this.state = {
      phase: 'PLAYER_TURN',
      turn: 0,
      round: 1,
      totalRounds: this.totalRounds,
      lastRoundWinnerId: null,
      activePlayerId: tanks[0]?.id ?? '',
      // Opening turn's wind: drift from a 0 baseline, advancing the stream once.
      wind: this.nextWind(0),
      // SAME reference as this.terrain — getState() returns the live bitmap by
      // reference, no per-snapshot copy/sync.
      terrain: this.terrain,
      terrainVersion: 0, // bumped on every deform/raise (render-only; see GameState)
      tanks,
      projectiles: [],
      projectile: null,
      lastExplosion: null,
      explosions: [],
      fire: [],
      winner: null,
    };
  }

  /**
   * Gentle-drift wind (SPEC §4.4): walk the current wind by a deterministic
   * delta in [-WIND_DRIFT_STEP, +WIND_DRIFT_STEP], then clamp into
   * [-maxWind, +maxWind]. Advances the seeded stream by EXACTLY ONE per call
   * (once at construction for the opening wind — drifting from a 0 baseline —
   * and once per NEXT_TURN), so wind stays a pure function of (seed, action
   * sequence). Net effect: |wind| <= maxWind always, and successive winds differ
   * by at most WIND_DRIFT_STEP, so players can range/walk shots in across turns.
   */
  private nextWind(current: number): number {
    this.windRngCalls++;
    const delta = (this.windRng() * 2 - 1) * WIND_DRIFT_STEP;
    return clamp(current + delta, -this.maxWind, this.maxWind);
  }

  /**
   * Effective gravity for the CURRENT turn (SE-parity sudden death). Equal to the base
   * `this.gravity` until `state.turn` passes `suddenDeathTurn`, after which it ramps:
   *   base * (1 + (turn - suddenDeathTurn) * SUDDEN_DEATH_GRAVITY_RAMP).
   * A PURE FUNCTION of (base gravity, state.turn, suddenDeathTurn) — no clock, no random —
   * so every networked client computes the identical value for a given turn. The turn does
   * not change mid-flight (it advances only at resolve()), so a shot uses one fixed gravity
   * for its whole arc. suddenDeathTurn 0 returns base unchanged (back-compat).
   */
  private currentGravity(): number {
    // PER-ROUND turn: turns since this round began, so sudden death resets every round
    // rather than accumulating match-global turns into later rounds.
    return effectiveGravity(this.gravity, this.state.turn - this.turnAtRoundStart, this.suddenDeathTurn);
  }

  /**
   * Public read of the engine's effective gravity for the CURRENT turn (SE-parity sudden
   * death). The AI shot planner reads this so a bot aims with the gravity the engine will
   * ACTUALLY fly the shot under — otherwise it plans a flatter arc and lands short once
   * sudden death escalates. Pure read; never mutates. Deterministic (a function of turn).
   */
  getEffectiveGravity(): number {
    return this.currentGravity();
  }

  /** Current snapshot of game state for rendering / broadcast. */
  getState(): GameState {
    return this.state;
  }

  /**
   * Return a fully-independent deep copy of this engine. Ticking or applying
   * actions on the clone NEVER mutates the original (and vice versa).
   *
   * Every piece of mutable state is deep-copied:
   *   - terrain bitmap (`Uint8Array.slice()`)
   *   - tanks array (each `TankState` including its `inventory` record)
   *   - projectiles array (each `ProjectileState`)
   *   - fire field (`Map` + `Set` + `fireDef` reference — NapalmDef is a
   *     read-only weapon definition constant, not mutated by the engine)
   *   - `GameState.fire` snapshot array (plain objects)
   *   - explosion arrays and `lastExplosion` (plain objects)
   *   - all scalar state fields
   *   - wind RNG stream (re-created from `windRngSeed` and fast-forwarded
   *     `windRngCalls` times so the clone is at the identical stream position)
   *
   * Determinism guarantee: the clone produces the same future sequence of
   * wind values, phase transitions, and seat rotations as a full-log replay
   * would, because every field that influences those transitions is copied.
   */
  clone(): GameEngine {
    // Build a new instance without running the constructor (which would
    // generate fresh terrain and tanks from the seed — wasteful and wrong).
    const c = Object.create(GameEngine.prototype) as GameEngine;

    // --- Scalar / primitive fields ---
    c.explosionSeq  = this.explosionSeq;
    c.fireCenter    = this.fireCenter;
    c.shooterId     = this.shooterId;
    c.shotDamage    = this.shotDamage;
    c.maxWind       = this.maxWind;
    c.gravity       = this.gravity;
    c.seed          = this.seed;
    c.totalRounds   = this.totalRounds;
    c.interestRate  = this.interestRate;
    c.suddenDeathTurn = this.suddenDeathTurn;
    c.turnAtRoundStart = this.turnAtRoundStart;
    c.armsLevel     = this.armsLevel;
    c.options       = this.options; // GameOptions is treated as immutable config
    // Deep-copy pending settle range (a plain {xStart,xEnd} value object or null).
    c.pendingSettle = this.pendingSettle !== null ? { ...this.pendingSettle } : null;

    // Surface cache: pure derived data — give the clone its own buffer and force a
    // lazy rebuild (version -1 never matches the copied terrainVersion). Not copying
    // entries keeps clone() equivalent: the first query recomputes via surfaceAt().
    c.surfaceCache = new Int16Array(CANVAS_WIDTH).fill(-1);
    c.surfaceCacheVersion = -1;

    // --- Wind RNG: re-create from the recorded seed + fast-forward ---
    c.windRngSeed   = this.windRngSeed;
    c.windRngCalls  = this.windRngCalls;
    const freshRng  = createRng(this.windRngSeed);
    for (let i = 0; i < this.windRngCalls; i++) freshRng();
    c.windRng       = freshRng;

    // --- Terrain bitmap: independent copy ---
    c.terrain = this.terrain.slice();

    // --- Napalm fire: Map + Set + def reference (def is immutable) ---
    c.fire         = new Map(this.fire);
    c.fireScorched = new Set(this.fireScorched);
    c.fireDef      = this.fireDef;   // NapalmDef is a read-only weapon-def constant

    // --- Deep-copy GameState ---
    const s = this.state;

    // Deep-copy each TankState including its inventory (Record<WeaponType, AmmoEntry>).
    const cloneTanks = s.tanks.map((t) => {
      const inv: Record<string, { count: number; unlimited: boolean }> = {};
      for (const [k, v] of Object.entries(t.inventory)) {
        inv[k] = { count: v.count, unlimited: v.unlimited };
      }
      return {
        ...t,
        inventory: inv as typeof t.inventory,
      };
    });

    // Deep-copy each ProjectileState.
    const cloneProjectiles = s.projectiles.map((p) => ({ ...p }));

    // The back-compat projectile alias must point into the CLONE's array, not the original.
    const cloneProjectile = cloneProjectiles[0] ?? null;

    // Explosion events are plain-data value objects; spread-copy each.
    const cloneExplosions   = s.explosions.map((e) => ({ ...e }));
    const cloneLastExp      = s.lastExplosion ? { ...s.lastExplosion } : null;

    // Fire cells are plain-data value objects.
    const cloneFire = s.fire.map((f) => ({ ...f }));

    c.state = {
      phase:             s.phase,
      turn:              s.turn,
      round:             s.round,
      totalRounds:       s.totalRounds,
      lastRoundWinnerId: s.lastRoundWinnerId,
      activePlayerId:    s.activePlayerId,
      wind:              s.wind,
      terrain:           c.terrain,   // points to the clone's own bitmap
      terrainVersion:    s.terrainVersion,
      tanks:             cloneTanks,
      projectiles:       cloneProjectiles,
      projectile:        cloneProjectile,
      lastExplosion:     cloneLastExp,
      explosions:        cloneExplosions,
      fire:              cloneFire,
      winner:            s.winner,
    };

    return c;
  }

  /**
   * Keep the back-compat single-projectile alias in lockstep with the array.
   * Call after EVERY mutation of `state.projectiles`. `projectile` is purely a
   * derived view (`projectiles[0] ?? null`) — never mutate it independently.
   */
  private syncProjectileAlias(): void {
    this.state.projectile = this.state.projectiles[0] ?? null;
  }

  /** The currently active (aiming) tank, or undefined if none. */
  private activeTank(): TankState | undefined {
    return this.state.tanks.find((t) => t.id === this.state.activePlayerId);
  }

  /**
   * Apply a player input. Aim changes (set_angle/set_power) are honored only
   * while aiming (PLAYER_TURN). `fire` is honored only while aiming and with no
   * projectile in flight; it launches the shot and transitions to FIRING.
   * select_weapon sets the active weapon (no ammo gate here — gating happens on
   * `fire`, which rejects a shot when the selected weapon is out of ammo).
   */
  applyAction(action: PlayerAction): void {
    // ROUND_OVER between-rounds shop (V1 match structure): only buying and starting
    // the next round are honored. buy targets the named tank (all players may shop);
    // next_round flips the already-staged next round into combat.
    if (this.state.phase === 'ROUND_OVER') {
      if (action.type === 'buy') {
        const target = action.tankId
          ? this.state.tanks.find((t) => t.id === action.tankId)
          : this.activeTank();
        if (target) this.applyBuy(action, target);
      } else if (action.type === 'next_round') {
        this.state.phase = 'PLAYER_TURN';
      }
      return;
    }

    if (this.state.phase !== 'PLAYER_TURN') return;
    const tank = this.activeTank();
    if (!tank) return;

    switch (action.type) {
      case 'set_angle':
        tank.angle = clamp(action.angle, ANGLE_MIN, ANGLE_MAX);
        return;
      case 'set_power':
        // Clamp to the tank's per-tank power cap (POWER_MAX baseline, raised by bought
        // Batteries) so a battery-equipped tank can over-power a shot for extra range.
        tank.power = clamp(action.power, POWER_MIN, tank.powerCap);
        return;
      case 'select_weapon':
        tank.selectedWeapon = action.weapon;
        return;
      case 'fire': {
        // Ignore a re-fire while a shot is still resolving (any projectile in
        // flight). FIRING iff projectiles.length > 0.
        if (this.state.projectiles.length > 0) return;

        // AMMO GATE (Slice 1.1). Reject the shot if the selected weapon has no
        // ammo and is not unlimited. Rejection returns WITHOUT mutating state or
        // transitioning to FIRING — the tank stays in PLAYER_TURN, free to pick
        // another weapon. The inventory entry is guaranteed present (inventory is
        // exhaustive over WeaponType).
        const ammo = tank.inventory[tank.selectedWeapon];
        if (!ammo.unlimited && ammo.count <= 0) return;

        // Store-economy bookkeeping: this tank owns the shot, and its dealt
        // damage tally starts fresh (credited to the shooter in resolve()).
        this.shooterId = tank.id;
        this.shotDamage = 0;

        const v = launchVelocity(tank.angle, tank.power);
        const tip = barrelTip(tank, BARREL_LENGTH);
        // Reset the explosion list for THIS shot so its detonations accumulate
        // across ticks (a cluster shot lands its bomblets over several ticks);
        // the renderer dedupes by id, so accumulating is safe.
        this.state.explosions = [];
        this.state.projectiles = [
          {
            x: tip.x,
            y: tip.y,
            vx: v.vx,
            vy: v.vy,
            weaponType: tank.selectedWeapon,
            age: 0,
            hasSplit: false,
            bounces:
              getWeapon(tank.selectedWeapon).behavior?.bounce?.maxBounces ?? 0,
          },
        ];

        // AMMO DECREMENT. Spend exactly one round — only for finite weapons,
        // and only AFTER the shot is committed (projectile pushed, gate passed).
        // Bounded by the gate above (count was > 0), so count never goes negative.
        if (!ammo.unlimited) ammo.count--;

        this.syncProjectileAlias();
        this.state.phase = 'FIRING';
        return;
      }
      case 'buy':
        // Buy for the active tank (PLAYER_TURN ignores any tankId, preserving the
        // prior contract). Does NOT end the turn.
        this.applyBuy(action, tank);
        return;
      case 'next_round':
        return; // only valid during ROUND_OVER (handled above)
      case 'use_shield': {
        // Activating the shield is a turn-ending commitment, like firing. Gate on
        // shield ammo (the inventory entry is guaranteed present). Rejection leaves
        // the tank aiming, free to choose otherwise.
        const ammo = tank.inventory.shield;
        if (!ammo.unlimited && ammo.count <= 0) return;

        const capacity = getWeapon('shield').behavior?.shield?.capacity ?? 0;
        tank.shieldHp = capacity;
        if (!ammo.unlimited) ammo.count--;

        // No projectile, no FIRING phase — the shield resolves instantly. Shielding
        // can't kill, so normally we just advance the turn (next living player, fresh
        // wind), mirroring resolve()'s NEXT_TURN tail. Defensive guard (#14): if the
        // board is somehow already down to one survivor, end the round/match instead
        // of advancing the turn over an already-decided game.
        if (this.endRoundIfDecided()) return;
        this.advanceTurn();
        this.state.wind = this.nextWind(this.state.wind);
        this.state.turn += 1;
        this.state.phase = 'PLAYER_TURN';
        return;
      }
      default:
        return;
    }
  }

  /**
   * Purchase one bundle of a weapon for `target` (shared by the PLAYER_TURN store
   * and the ROUND_OVER between-rounds shop). Rejected for unimplemented or
   * unlimited-stock weapons, or when the tank can't afford it. Turn-neutral — never
   * changes phase or active player. The CPU-seat idempotency guard (P1-7b) collapses
   * staggered duplicate bot buys in networked lockstep to exactly-once.
   */
  private applyBuy(action: { weapon?: WeaponType; accessory?: AccessoryType }, target: TankState): void {
    // Enforce "exactly one of weapon/accessory" in the ENGINE too (the referee enforces it on
    // the wire). Without this, a both-fields buy resolves the accessory first and silently
    // drops the paid-for weapon — and hot-seat has no referee to catch it. Same rejection in
    // both execution contexts so they can never diverge (CLAUDE.md: one codebase, two contexts).
    if (action.weapon && action.accessory) return;

    // ACCESSORY purchases (SE-parity) route through the same buy action but raise a tank
    // attribute instead of adding weapon ammo. A Battery raises powerCap (extra range). It
    // is logged once and replayed once, so it applies exactly once per client — no count is
    // needed for idempotency (bots don't buy accessories in this sprint; if a future AI
    // does, it must gain an idempotency guard like the weapon path's `slot.count > 0`).
    if (action.accessory === 'battery') {
      if (BATTERY_ARMS_LEVEL > this.armsLevel) return; // arms-level gate (battery is lvl 2)
      if (target.credits < BATTERY_PRICE) return;      // can't afford
      target.credits -= BATTERY_PRICE;
      target.powerCap += BATTERY_POWER_PER_UNIT * BATTERY_BUNDLE_SIZE;
      return;
    }
    if (!action.weapon) return; // neither a weapon nor a recognized accessory — nothing to buy
    const def = getWeapon(action.weapon);
    if (!def.implemented) return;
    // Arms-level gate (SE-parity): the room caps what is buyable. A weapon above the
    // room's arms level is not for sale here. Default armsLevel 4 => everything (no-op).
    if (def.armsLevel > this.armsLevel) return;
    const slot = target.inventory[action.weapon];
    if (slot.unlimited) return; // unlimited stock — nothing to buy
    if (target.ai && slot.count > 0) return; // idempotent bot restock (P1-7b)
    if (target.credits < def.price) return; // can't afford
    target.credits -= def.price;
    slot.count += def.bundleSize;
  }

  /**
   * Advance one fixed timestep. While FIRING, integrate the projectile one step
   * (with the active wind) then sweep-test for collision. On any resolution
   * (ground/tank hit OR out-of-bounds miss) the shot resolves: crater + damage +
   * collapse + win check, then the turn advances (new wind) to PLAYER_TURN, or
   * the game ends at GAME_OVER.
   *
   * While RESOLVING with a pending settle (AC-02), advances the animated terrain
   * collapse by ONE settleStep (COLLAPSE_PX_PER_TICK pixels per column) and
   * re-derives tank positions. When fully settled, calls resolve() to advance the
   * turn machine. Outside FIRING/RESOLVING this is a no-op.
   */
  tick(): void {
    // RESOLVING branch (AC-02): animate the terrain collapse one step per tick.
    // Only entered when pendingSettle is non-null (set by detonate() during the
    // just-completed FIRING phase). Each call advances the settle by
    // COLLAPSE_PX_PER_TICK px/column; when converged, calls resolve() to finish
    // the turn. If pendingSettle is null (e.g. napalm-only or no deform), this
    // branch is never reached (phase transitions to PLAYER_TURN directly).
    if (this.state.phase === 'RESOLVING') {
      if (this.pendingSettle !== null) {
        const stillSettling = this.settleStepAnimated();
        if (!stillSettling) {
          // Settle converged this tick — advance the turn machine.
          this.resolve();
        }
        // else: stay in RESOLVING for the next tick.
      }
      // If pendingSettle is null but phase is somehow still RESOLVING (defensive),
      // call resolve() to avoid getting stuck.
      else {
        this.resolve();
      }
      return;
    }

    if (this.state.phase !== 'FIRING') return;
    if (this.state.projectiles.length === 0 && this.fire.size === 0) {
      // Defensive: FIRING with nothing in flight AND no fire burning — a stuck
      // state; recover to aiming. NOTE the fire guard: a napalm field burns on
      // AFTER its shell is consumed (no projectile, fire active is VALID FIRING),
      // so we must NOT bail while it is alight — fall through to processFire().
      this.state.phase = 'PLAYER_TURN';
      this.syncProjectileAlias();
      return;
    }

    // Process EACH in-flight projectile this tick. A projectile may: keep
    // flying, AIRBURST at apex (replaced by N submunitions), detonate on a
    // ground/tank hit (removed, blast applied), or sail OOB (removed, no blast).
    // We rebuild the in-flight list as `survivors`; any apex split injects its
    // submunitions into the SAME list so they begin flying next tick.
    const survivors: ProjectileState[] = [];
    const current = this.state.projectiles;

    for (const p of current) {
      // Pre-step velocity sign drives apex detection (up is -y, so rising is
      // vy < 0). We capture it BEFORE integrating this tick.
      const vyBefore = p.vy;

      // Remember the pre-step position so collision is swept across the whole
      // segment travelled this tick — a fast shot must not tunnel through a thin
      // terrain spike or a tank (per-tick displacement can exceed TANK_WIDTH).
      const prevX = p.x;
      const prevY = p.y;
      // Effective gravity rises under sudden death (pure function of the current turn);
      // identical to this.gravity when sudden death is off, so trajectories are unchanged.
      stepProjectile(p, this.state.wind, this.currentGravity());
      p.age++;

      // SPLIT GATE: an airburst/funky shell splits ONCE (hasSplit guard) into a
      // deterministic velocity fan, then is consumed. The TRIGGER decides WHEN:
      //  - 'apex': the tick the shell crosses the top of its arc (vy rising
      //            -> falling). Pre-step sign vyBefore<0 && post-step p.vy>=0.
      //  - 'age' : the first tick at/after the shell reaches ageFrames ticks of
      //            flight (p.age was just incremented above). Mid-arc, NOT apex.
      // Both reuse splitAirburst (no randomness; fan is a pure function of the
      // parent state + weapon def). hasSplit:false on the parent and true on
      // every submunition guarantees a single split.
      const airburst = getWeapon(p.weaponType).behavior?.airburst;
      if (airburst !== undefined && p.hasSplit === false) {
        const shouldSplit =
          airburst.trigger === 'apex'
            ? vyBefore < 0 && p.vy >= 0
            : p.age >= (airburst.ageFrames ?? 0);
        if (shouldSplit) {
          for (const sub of this.splitAirburst(p, airburst)) survivors.push(sub);
          continue; // parent shell consumed by the split
        }
      }

      const hit = sweepCollide(p, prevX, prevY, this.terrain, this.state.tanks);

      if (hit.type === 'none') {
        survivors.push(p); // still in flight
        continue;
      }

      // This projectile resolves. A direct TANK hit always detonates. A GROUND
      // hit on a bouncing shell with bounces REMAINING reflects (does NOT
      // detonate) and keeps flying; otherwise it detonates. An OOB miss produces
      // no blast. A still-bouncing shell is pushed back to survivors.
      if (hit.type === 'tank') {
        const napalm = getWeapon(p.weaponType).behavior?.napalm;
        if (napalm !== undefined) {
          this.igniteNapalm(hit.x, hit.y, napalm, p.weaponType); // splashes burning fuel, no blast
        } else {
          this.detonate(hit.x, hit.y, p.weaponType); // direct tank hit always detonates
        }
      } else if (hit.type === 'ground') {
        if (p.bounces > 0) {
          // BOUNCE: reflect off the derived surface normal, decrement, keep
          // flying. sweepCollide already snapped p.x/p.y to the impact point.
          // We compute the normal + reflect BEFORE any detonate() so the bounce
          // direction reads the surface the shell actually struck (a per-bounce
          // crater must not perturb the very normal we are bouncing off).
          const bounce = getWeapon(p.weaponType).behavior?.bounce;
          const n = surfaceNormalAt(this.terrain, p.x);
          const r = reflectVelocity({ vx: p.vx, vy: p.vy }, n, bounce?.restitution);
          p.vx = r.vx;
          p.vy = r.vy;
          // HOP: a bounding mine leaps off each contact (upward = −y). Pure
          // constant kick, so replay stays deterministic.
          if (bounce?.hopBoost) p.vy -= bounce.hopBoost;
          p.bounces--;
          // Nudge the projectile OFF the surface along the normal by >1px so the
          // next tick's collide() does not immediately re-hit the same solid
          // pixel (it was snapped to the impact point, which is on/at solid).
          p.x += n.vx * BOUNCE_EPS;
          p.y += n.vy * BOUNCE_EPS;
          // BOUNDING-MINE CHAIN: detonate a full blast at this contact (damage +
          // crater + explosion event) so betty lays a line of blasts as it skips,
          // instead of bouncing silently. Done AFTER reflecting/nudging above.
          if (bounce?.detonateEachBounce) this.detonate(hit.x, hit.y, p.weaponType);
          survivors.push(p); // still in flight
        } else {
          const napalm = getWeapon(p.weaponType).behavior?.napalm;
          if (napalm !== undefined) {
            this.igniteNapalm(hit.x, hit.y, napalm, p.weaponType); // splashes burning fuel, no blast
          } else {
            this.detonate(hit.x, hit.y, p.weaponType); // bounces spent -> detonate
          }
        }
      }
    }

    this.state.projectiles = survivors;
    this.syncProjectileAlias();

    // Burn the napalm fire field one tick (spread + DOT + decay). No-op when
    // nothing is alight. Runs every FIRING tick so a fire ignited THIS tick by an
    // impact above gets its first burn immediately.
    this.processFire();

    // -----------------------------------------------------------------------
    // POST-FIRE settle + turn-resolution decision (AC-02 deferred-final-settle)
    //
    // The rule:
    //  (A) Projectiles still in flight OR fire still burning → flush instantly so
    //      mid-flight bomblet trajectories/collisions stay byte-identical to today
    //      ACROSS ticks. KNOWN DEVIATION: when two projectiles detonate in the SAME
    //      tick, blast #1 is no longer compacted before blast #2's collide within that
    //      tick (the single flush runs after the whole projectile loop), so a same-tick
    //      #2 may collide an un-compacted overhang. This is deterministic (every client
    //      runs identical deferred logic → no lockstep desync; replay == live); it only
    //      shifts gameplay outcomes for rare same-tick multi-detonation seeds vs pre-
    //      animated-collapse. Accepted as a gameplay-parity trade-off of the deferred
    //      settle (compacting per-blast in-loop would instant-compact the FINAL blast
    //      too and defeat the animation). See sprint-log stabilize-and-juice-2.
    //  (B) Board already down to <= 1 alive → flush instantly and end immediately
    //      (preserves #14: win banner must not wait for dirt).
    //  (C) Settled + alive > 1 + no fire → leave pendingSettle for the RESOLVING
    //      phase to animate one settleStep per tick.
    //  (D) While fire is burning (no projectiles, fire active) → flush instantly
    //      each tick (fire is the visual focus; collapse settles under it).
    // -----------------------------------------------------------------------
    const aliveCount = this.state.tanks.reduce((n, t) => (t.alive ? n + 1 : n), 0);
    const settled = survivors.length === 0 && this.fire.size === 0;

    if (survivors.length > 0) {
      // (A) Projectiles still in flight — flush instantly to keep trajectory parity.
      this.flushSettleInstant();
    } else if (!settled) {
      // (D) No projectiles but fire still burning — flush instantly each tick.
      this.flushSettleInstant();
    }

    if (aliveCount <= 1) {
      // (B) Game-ending condition — abandon any remaining in-flight state, flush
      // instantly (no animation), and resolve immediately (preserves #14).
      this.state.projectiles = [];
      this.syncProjectileAlias();
      this.fire.clear();
      this.fireDef = null;
      this.fireScorched.clear();
      this.syncFire();
      this.flushSettleInstant();
      this.state.phase = 'RESOLVING';
      this.resolve();
    } else if (settled) {
      // (C) Normal turn end: board has > 1 alive, no projectiles, no fire.
      // Leave pendingSettle for the RESOLVING animated collapse if one is pending;
      // set phase to RESOLVING but do NOT call resolve() yet.
      // If no settle is pending (e.g. missed shot, or raise-terrain weapon with
      // no unsettled columns), go straight through to resolve().
      this.state.phase = 'RESOLVING';
      if (this.pendingSettle === null) {
        // Nothing to animate — resolve immediately (same as before AC-02 for
        // no-deform turns, e.g. napalm-only or missed shots).
        this.resolve();
      }
      // else: stay in RESOLVING; tick() will drive the animated settle.
    }
    // If neither settled nor game-ending, stay in FIRING for the next tick.
  }

  /**
   * Split an airburst shell at apex into a DETERMINISTIC horizontal velocity
   * fan of `count` submunitions, all spawned at the parent's current (x, y).
   *
   * Submunition i (i in [0, count)) inherits the parent's velocity plus a
   * symmetric horizontal offset:
   *   vx_i = parentVx + (i - (count-1)/2) * step,  step = (2*spread)/(count-1)
   * so the bomblets fan out evenly from -spread..+spread px/tick around the
   * parent's vx (a single bomblet just inherits parentVx). vy is inherited
   * unchanged (≈0 at apex). Every submunition carries hasSplit:true so it never
   * re-splits, and age resets to 0. No randomness — purely a function of the
   * parent state + weapon def, preserving determinism.
   */
  private splitAirburst(
    parent: ProjectileState,
    airburst: { count: number; spread: number },
  ): ProjectileState[] {
    const { count, spread } = airburst;
    const subs: ProjectileState[] = [];
    const step = count > 1 ? (2 * spread) / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * step;
      subs.push({
        x: parent.x,
        y: parent.y,
        vx: parent.vx + offset,
        vy: parent.vy,
        weaponType: parent.weaponType,
        age: 0,
        hasSplit: true,
        bounces: 0,
      });
    }
    return subs;
  }

  /**
   * Resolve a fired shot after the blast: count survivors, end the game on a win
   * (1 alive => that tank wins) or draw (0 alive => GAME_OVER, winner null), or
   * else advance to the next living player's turn and regenerate wind.
   *
   * Damage + terrain collapse already happened inside explode(); this is the
   * turn-machine portion (RESOLVING → GAME_OVER | NEXT_TURN → PLAYER_TURN).
   */
  private resolve(): void {
    // Store economy: pay the shooter for this shot — CREDITS_PER_DAMAGE per point
    // of effective damage dealt to opponents, plus a flat TURN_STIPEND (so even a
    // miss earns a little). Awarded BEFORE the win-check/turn-advance, while
    // shooterId is still the player who fired. Dead shooters still collect (a
    // mutual-kill shot paid out). Pure arithmetic — deterministic.
    const shooter = this.state.tanks.find((t) => t.id === this.shooterId);
    if (shooter) {
      shooter.credits += Math.round(this.shotDamage * CREDITS_PER_DAMAGE) + TURN_STIPEND;
    }

    // End the round/match if the board is down to <= 1 survivor; otherwise rotate to
    // the next living tank (stable order, wrapping), bump the turn counter, and draw
    // fresh wind.
    if (this.endRoundIfDecided()) return;
    this.advanceTurn();
    this.state.wind = this.nextWind(this.state.wind);
    this.state.turn += 1;
    this.state.phase = 'PLAYER_TURN';
  }

  /**
   * Round/match terminator (V1 match structure). If <= 1 tank is alive, record the
   * round result and either end the MATCH (phase=GAME_OVER, winner set) or stage the
   * next round (phase=ROUND_OVER, between-rounds shop) — returning true. If >= 2 are
   * alive the round continues and this returns false (no state change). Carries NO
   * credit/turn side-effects, so it is safe to call from ANY elimination point — the
   * post-shot resolve() and the use_shield turn-advance (#14). With totalRounds === 1
   * this is byte-identical to the old single-round behavior (clinch is 1, so any round
   * win ends the match, and a draw with round >= totalRounds also ends it).
   */
  private endRoundIfDecided(): boolean {
    const alive = this.state.tanks.filter((t) => t.alive);
    if (alive.length > 1) return false;

    // 1 alive => that tank won the round; 0 alive (mutual kill) => draw (no one scores).
    const roundWinner = alive.length === 1 ? alive[0] : null;
    this.state.lastRoundWinnerId = roundWinner?.id ?? null;
    if (roundWinner) roundWinner.roundWins += 1;

    // First to clinch ceil(N/2) round wins takes the match; or the match ends once all
    // N rounds have been played (only reachable past a clinch via draws).
    const clinch = Math.ceil(this.totalRounds / 2);
    const clinched = roundWinner !== null && roundWinner.roundWins >= clinch;
    const matchOver = clinched || this.state.round >= this.totalRounds;

    if (matchOver) {
      this.state.phase = 'GAME_OVER';
      this.state.winner = this.computeMatchWinner();
      return true;
    }

    // Stage the next round (fresh terrain, reset tanks, carried economy/score) but
    // PAUSE in the ROUND_OVER between-rounds shop — players spend carried credits, then
    // a next_round action begins combat. startNextRound() leaves phase at PLAYER_TURN;
    // override to ROUND_OVER so the shop window opens first.
    this.startNextRound();
    this.state.phase = 'ROUND_OVER';
    return true;
  }

  /**
   * Rotate `activePlayerId` to the next tank that can actually take a turn — ALIVE and
   * NOT buried — in stable array order, wrapping around. Dead tanks are skipped; buried
   * tanks are skipped too (they are trapped, #15). Caller guarantees >= 2 are alive.
   *
   * Each call also advances the burial safety valve: every still-buried tank counts one
   * trapped turn, and once it has been trapped MAX_BURIED_TURNS turns it auto-digs-out so
   * a player can never be locked out forever (they may also be freed earlier by terrain
   * cleared over them). If EVERY alive tank is buried, the longest-trapped one is freed so
   * play always progresses.
   */
  private advanceTurn(): void {
    const tanks = this.state.tanks;
    const n = tanks.length;

    // Safety valve (#15): tick down each buried tank's trap timer; auto-free at the cap.
    for (const t of tanks) {
      if (t.alive && t.buried) {
        t.buriedTurns += 1;
        if (t.buriedTurns >= MAX_BURIED_TURNS) {
          t.buried = false;
          t.buriedTurns = 0;
        }
      }
    }

    const cur = tanks.findIndex((t) => t.id === this.state.activePlayerId);
    const start = cur < 0 ? 0 : cur;
    for (let step = 1; step <= n; step++) {
      const cand = tanks[(start + step) % n];
      if (cand.alive && !cand.buried) {
        this.state.activePlayerId = cand.id;
        return;
      }
    }

    // Deadlock guard: every alive tank is buried. Free the longest-trapped one (stable
    // tie-break by array order) and hand it the turn so the match can't stall.
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (tanks[i].alive && (pick < 0 || tanks[i].buriedTurns > tanks[pick].buriedTurns)) {
        pick = i;
      }
    }
    if (pick >= 0) {
      tanks[pick].buried = false;
      tanks[pick].buriedTurns = 0;
      this.state.activePlayerId = tanks[pick].id;
    }
  }

  /**
   * Match winner = the tank with the STRICTLY-most round wins; a tie for the lead is
   * a draw (null). For a single-round match this reproduces the old win/draw rule
   * exactly: the sole survivor has 1 win (everyone else 0) => that tank; a mutual kill
   * leaves everyone at 0 => tie => null. Pure read over the roster — deterministic.
   */
  private computeMatchWinner(): string | null {
    const tanks = this.state.tanks;
    if (tanks.length === 0) return null;
    let best = tanks[0];
    let tie = false;
    for (let i = 1; i < tanks.length; i++) {
      if (tanks[i].roundWins > best.roundWins) {
        best = tanks[i];
        tie = false;
      } else if (tanks[i].roundWins === best.roundWins) {
        tie = true;
      }
    }
    return tie ? null : best.id;
  }

  /**
   * Begin the next round of a best-of-N match (V1 match structure). Called from
   * resolve() when a round ended but the match has not been clinched. EVERYTHING here
   * is a pure function of (base seed, the new round number, the carried roster) — no
   * clock, no Math.random — so a fresh-engine replay of the same action log lands on
   * an identical next round on every networked client, needing NO new action.
   *
   * Carried across the round boundary: each tank's credits, purchased inventory, and
   * accumulated roundWins (matched by stable id). Reset: terrain (regenerated from the
   * derived round seed), tank positions (re-placed on the new surface), health, shield,
   * fuel, aim, selected weapon, alive flag, wind stream, projectiles, and the fire field.
   */
  private startNextRound(): void {
    this.state.round += 1;
    const roundSeed = deriveRoundSeed(this.seed, this.state.round);

    // Fresh terrain for the new round, from the derived (deterministic) seed.
    const heightLine = generate(roundSeed);
    this.terrain = buildBitmap(heightLine);
    this.state.terrain = this.terrain;
    this.state.terrainVersion += 1; // render-only: force a terrain re-render

    // Re-place tanks on the new surface via the same path the opening round used, then
    // graft the carried economy/score fields back over the fresh (reset) tanks.
    const terrainArr = Array.from(heightLine);
    const players = this.options?.players;
    const fresh =
      players && players.length >= 2 && players.length <= 4
        ? placeTanks(terrainArr, players, this.options)
        : placeTwoTanks(terrainArr, this.options);
    const prior = new Map(this.state.tanks.map((t) => [t.id, t]));
    for (const tank of fresh) {
      const old = prior.get(tank.id);
      if (old) {
        // Carry earnings, plus per-round INTEREST on the carried (post-payout) balance.
        // floor() keeps credits integer so a networked replay never drifts on a fraction;
        // interestRate 0 => +0 => byte-identical to the pre-interest carry (back-compat).
        tank.credits = old.credits + Math.floor(old.credits * this.interestRate); // carry + interest
        tank.inventory = old.inventory; // carry purchased ammo (and spent rounds)
        tank.powerCap = old.powerCap; // carry bought Batteries (power cap) across rounds
        tank.roundWins = old.roundWins; // accumulate match score
        tank.kills = old.kills; // accumulate match scoreboard
        tank.totalDamage = old.totalDamage; // accumulate match scoreboard
      }
    }
    this.state.tanks = fresh;
    this.state.activePlayerId = fresh[0]?.id ?? '';

    // Reset transient combat state and re-seed the wind stream for the new round.
    this.state.projectiles = [];
    this.syncProjectileAlias();
    this.state.explosions = [];
    this.state.lastExplosion = null;
    this.state.fire = [];
    this.fire.clear();
    this.fireScorched.clear();
    this.fireDef = null;
    this.pendingSettle = null; // clear any pending animated settle from the prior round
    this.windRng = createRng(roundSeed);
    this.windRngSeed = roundSeed;
    this.windRngCalls = 0;
    this.state.wind = this.nextWind(0);

    this.state.turn += 1;
    // Reset the sudden-death per-round baseline: this round restarts at base gravity even if
    // the match-global turn count is already past the threshold (per-round, not match-global).
    this.turnAtRoundStart = this.state.turn;
    this.state.phase = 'PLAYER_TURN';
  }

  /**
   * THE detonation primitive — the SINGLE place a blast happens. Apply an
   * explosion at (cx, cy) for the given weapon: deform the pixel bitmap (crater
   * or raise) and let the touched columns' dirt fall, apply proximity damage to
   * EVERY alive tank, resolve each surviving tank against the new terrain (drop
   * into a fresh crater, or instakill if buried), and publish a
   * monotonically-id'd ExplosionEvent the client dedupes by id.
   *
   * Every weapon AND every airburst submunition routes through here, reading the
   * weapon's `detonation.*` group — so all blast behavior lives in one place.
   */
  /**
   * Apply blast/burn damage to a tank, honoring its shield. The shield is a DAMAGE
   * POOL (tank.shieldHp): it absorbs up to its remaining charge of this hit and
   * drains by exactly that much; any OVERFLOW beyond the pool leaks through to the
   * tank's health (so the hit that breaks the shield still wounds). Every blast and
   * burn tick (cluster bomblets, betty hops, napalm ticks) routes through here with
   * its ACTUAL damage, so the field depletes commensurate with incoming magnitude —
   * a nuke drains ~100, a napalm tick ~0.7 — not one-hit-per-particle regardless of
   * size (REVIEW_BACKLOG P1-5). Pure min/subtract — deterministic, no RNG. Burial
   * (terrain) does NOT come through here — being buried bypasses the field by design.
   */
  private applyBlastDamage(tank: TankState, amount: number): void {
    if (amount <= 0) return;
    if (tank.shieldHp > 0) {
      const absorbed = Math.min(tank.shieldHp, amount);
      tank.shieldHp -= absorbed;
      amount -= absorbed;
      if (amount <= 0) return; // hit fully soaked by the field
    }
    const before = tank.health;
    Tank.applyDamage(tank, amount);
    // Store economy: credit the shooter for EFFECTIVE damage (post-clamp) dealt to
    // an OPPONENT this shot — self-damage, overkill, and shield-absorbed damage
    // don't pay (only the leaked overflow reaches health and counts).
    if (tank.id !== this.shooterId) {
      const dealt = before - tank.health;
      this.shotDamage += dealt;
      // V1 scoreboard: accrue the shooter's match damage tally, and credit a kill
      // when this hit takes the opponent from alive to dead.
      const shooter = this.state.tanks.find((t) => t.id === this.shooterId);
      if (shooter) {
        shooter.totalDamage += dealt;
        if (before > 0 && tank.health <= 0) shooter.kills += 1;
      }
    }
  }

  /**
   * Re-derive every alive tank's position and burial state against the CURRENT
   * (post-settle) terrain bitmap. Called after each terrain compaction:
   *   - after flushSettleInstant() completes a full instant settle, and
   *   - after each settleStepAnimated() advances the animated settle one step.
   *
   * Loop body is identical to the original per-blast loop in detonate() — extracted
   * so that progressive settle ticks can re-run it without touching detonate().
   */
  private resolveTanksToTerrain(): void {
    // Unified post-terrain tank resolution. For each alive tank, re-derive its
    // relationship to the (just-deformed/settled) surface:
    //  - if a crater opened beneath it (new surface is LOWER, i.e. surf > tank.y) the
    //    tank falls onto the new floor — and is freed if it had been buried;
    //  - else if dirt now covers its MID-BODY it is TRAPPED (buried, #15) — NOT killed:
    //    being stuck is the punishment. Burial deals no damage and credits no kill; the
    //    tank digs out when terrain above it clears (this same loop on a later crater /
    //    Riot Bomb) or auto-frees after MAX_BURIED_TURNS turns (see advanceTurn);
    //  - else its mid-body is clear air => it is not (or no longer) buried.
    // NOTE: tank.y is the BASE resting ON the surface, so the pixel at (floor(x),
    // floor(y)) is ALWAYS solid for a resting tank. We sample the MID-BODY
    // (tank.y - TANK_HEIGHT/2): air for a resting tank, solid only once dirt has risen
    // over the body — so burial is a pure function of current terrain vs tank position.
    for (const tank of this.state.tanks) {
      if (!tank.alive) continue;
      const xi = Math.floor(tank.x);
      const surf = this.surfaceAtCached(tank.x);
      if (surf > tank.y) {
        tank.y = surf; // crater opened beneath -> tank falls onto new floor
        tank.buried = false; // ...and is dug free if it had been buried
      } else if (pixelAt(this.terrain, xi, Math.floor(tank.y - TANK_HEIGHT / 2)) === 1) {
        if (!tank.buried) tank.buriedTurns = 0; // a FRESH burial starts the trap timer
        tank.buried = true; // dirt over mid-body -> trapped (no damage, no kill)
      } else {
        tank.buried = false; // mid-body is clear air -> not buried / dug out
      }
    }
  }

  /**
   * Flush any pending terrain settle to full convergence in a SINGLE synchronous
   * call (instant compaction, identical to the old immediate applyGravity). Used
   * during FIRING (projectiles still in flight, so mid-flight bomblet trajectories
   * and collisions must stay byte-identical to the pre-AC-02 behavior) and on
   * game-ending turns (so the win banner never waits for dirt — preserves #14).
   *
   * After compaction, re-derives every alive tank's position/burial (same call
   * as the per-tick animated path), bumps terrainVersion, and clears pendingSettle.
   * No-op if pendingSettle is null.
   */
  private flushSettleInstant(): void {
    if (this.pendingSettle === null) return;
    const { xStart, xEnd } = this.pendingSettle;
    // settleStep with pxPerTick=CANVAS_HEIGHT compacts each column in one pass,
    // identical to the original applyGravity behavior.
    while (settleStep(this.terrain, xStart, xEnd, CANVAS_HEIGHT)) { /* converge */ }
    this.state.terrainVersion++;
    this.resolveTanksToTerrain();
    this.pendingSettle = null;
  }

  /**
   * Advance the animated end-of-turn terrain collapse by ONE tick (COLLAPSE_PX_PER_TICK
   * pixels per column). Called once per RESOLVING tick. Re-derives tank positions
   * after each step (tanks sink progressively). Returns `true` if any pixel moved
   * (more settling still to do); `false` once fully converged (settle is done —
   * caller should transition to resolve() on the same tick). Clears pendingSettle
   * when converged.
   *
   * Bumps terrainVersion on every call so the renderer redraws after each step.
   */
  private settleStepAnimated(): boolean {
    if (this.pendingSettle === null) return false;
    const { xStart, xEnd } = this.pendingSettle;
    const moved = settleStep(this.terrain, xStart, xEnd, COLLAPSE_PX_PER_TICK);
    this.state.terrainVersion++;
    this.resolveTanksToTerrain();
    if (!moved) {
      this.pendingSettle = null;
    }
    return moved;
  }

  private detonate(cx: number, cy: number, weaponType: WeaponType): void {
    const { radius, maxDamage, raisesTerrain, style, color, durationFrames } =
      getWeapon(weaponType).detonation;
    const raise = raisesTerrain === true;

    // Deform the live bitmap. The bitmap IS state.terrain (same reference).
    // Do NOT compact (applyGravity) here — instead merge the deformed column range
    // into pendingSettle so the caller can decide whether to settle instantly
    // (mid-flight) or animate (end-of-turn). Signal the bitmap change so the
    // renderer rebuilds its offscreen without hashing 400k bytes every frame (P2-8).
    const range = deform(this.terrain, cx, cy, radius, raise);
    if (range !== null) {
      // MERGE into pendingSettle (widen xStart = min, xEnd = max across all blasts
      // in this tick — cluster/MIRV/betty chain can fire multiple detonations).
      if (this.pendingSettle === null) {
        this.pendingSettle = { xStart: range.xStart, xEnd: range.xEnd };
      } else {
        this.pendingSettle.xStart = Math.min(this.pendingSettle.xStart, range.xStart);
        this.pendingSettle.xEnd   = Math.max(this.pendingSettle.xEnd,   range.xEnd);
      }
      // Signal the deform (pre-settle) so the renderer shows the raw crater shape.
      this.state.terrainVersion++;
    }

    // Proximity damage to every living tank. explosionDamage() returns the
    // falloff value scaled to MAX_DAMAGE; rescale to the weapon's peak so
    // dist=0 => weapon.maxDamage and dist>=radius => 0.
    // NOTE: tank resolution (drop/burial) is intentionally DEFERRED to after
    // terrain settles (flushSettleInstant or settleStepAnimated) — damage is
    // computed against the crater shape, not the settled shape.
    for (const tank of this.state.tanks) {
      if (!tank.alive) continue;
      const baseDamage = explosionDamage(cx, cy, radius, tank);
      // explosionDamage() peaks at the global MAX_DAMAGE; rescale to this
      // weapon's maxDamage so the falloff shape is preserved.
      const scaled = (baseDamage / MAX_DAMAGE) * maxDamage;
      if (scaled > 0) {
        this.applyBlastDamage(tank, scaled); // shield pool soaks up to its charge
      }
    }

    // Style/color/duration come from the weapon definition; ids are strictly
    // increasing across every blast (including each bomblet of a cluster).
    const event: ExplosionEvent = {
      id: ++this.explosionSeq,
      cx,
      cy: clamp(cy, 0, CANVAS_HEIGHT),
      radius,
      style,
      color,
      durationFrames,
    };
    // Append to THIS resolution's list and mirror the latest into lastExplosion
    // (back-compat: single-event consumers read the last event pushed).
    this.state.explosions.push(event);
    this.state.lastExplosion = event;
  }

  /**
   * Napalm impact — IGNITE, do not blast. Seeds a burning puddle of terrain
   * columns ±def.splashRadius around the impact x (no crater, no impact damage)
   * and emits a single ignition flash for visual punch + screen-shake. All of
   * napalm's damage is the per-tick burn applied later in processFire(); the
   * impact itself is harmless. Retains the def + center so the fire can spread.
   *
   * Determinism: ignite writes are pure arithmetic on the integer impact column;
   * the flash id comes from the same monotonic explosionSeq as every other blast.
   */
  private igniteNapalm(cx: number, cy: number, def: NapalmDef, weaponType: WeaponType): void {
    const center = Math.round(cx);
    this.fireDef = def;
    this.fireCenter = center;
    // Seed the initial puddle. ignite() refreshes life on overlap, so re-igniting
    // an already-burning column is harmless.
    for (let dx = -def.splashRadius; dx <= def.splashRadius; dx++) {
      this.ignite(center + dx, def.burnTicks);
    }

    // Ignition flash — VISUAL ONLY (reuses the FIRING weapon's detonation look,
    // so hot_napalm flashes hotter/wider/longer than napalm). No terrain deform,
    // no proximity damage: the burn does the work. weaponType comes from the
    // replayed action log, so this stays determinism-safe; fall back to napalm if
    // a future caller ever omits it.
    const det = (getWeapon(weaponType) ?? getWeapon('napalm')).detonation;
    const event: ExplosionEvent = {
      id: ++this.explosionSeq,
      cx,
      cy: clamp(cy, 0, CANVAS_HEIGHT),
      radius: det.radius,
      style: det.style,
      color: det.color,
      durationFrames: det.durationFrames,
    };
    this.state.explosions.push(event);
    this.state.lastExplosion = event;

    this.syncFire();
  }

  /** Light a single terrain column, clamped in-bounds. A column burns at most
   *  once per fire: an already-scorched column is never relit (caller also guards
   *  this for spread, but igniting the splash is funneled through here too). */
  private ignite(x: number, life: number): void {
    if (x < 0 || x >= CANVAS_WIDTH) return;
    if (this.fireScorched.has(x)) return;
    this.fireScorched.add(x);
    this.fire.set(x, life);
  }

  /**
   * Advance the napalm fire one tick: SPREAD the front outward (downhill-biased),
   * BURN any tank standing in the flames, then DECAY every column. No-op when
   * nothing is alight. Fully deterministic — surface heights + fixed integer
   * steps, no RNG, no clock.
   */
  private processFire(): void {
    if (this.fire.size === 0 || this.fireDef === null) {
      if (this.state.fire.length > 0) this.state.fire = [];
      return;
    }
    const def = this.fireDef;

    // 1. SPREAD. Creep the current extent outward up to spreadRate columns per
    //    side. Fire flows freely DOWNHILL (and across) but only climbs into a
    //    higher neighbour when the rise is within climbLimit — so it pours into
    //    valleys/craters and is stopped by walls. Bounded by ±maxSpread of the
    //    impact center, guaranteeing termination.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const x of this.fire.keys()) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    for (let s = 0; s < def.spreadRate; s++) {
      const rx = maxX + 1;
      if (
        rx - this.fireCenter <= def.maxSpread &&
        !this.fireScorched.has(rx) &&
        this.canSpread(maxX, rx, def)
      ) {
        this.ignite(rx, def.burnTicks);
        maxX = rx;
      }
      const lx = minX - 1;
      if (
        this.fireCenter - lx <= def.maxSpread &&
        !this.fireScorched.has(lx) &&
        this.canSpread(minX, lx, def)
      ) {
        this.ignite(lx, def.burnTicks);
        minX = lx;
      }
    }

    // 2. BURN. A tank takes dotPerTick if a burning column lies within its
    //    footprint AND at roughly its feet (so fire pooled in a pit far below an
    //    elevated tank does not scorch it). One application per tank per tick.
    const halfW = TANK_WIDTH / 2;
    for (const tank of this.state.tanks) {
      if (!tank.alive) continue;
      const lo = Math.ceil(tank.x - halfW);
      const hi = Math.floor(tank.x + halfW);
      let inFire = false;
      for (let x = lo; x <= hi; x++) {
        if (!this.fire.has(x)) continue;
        if (Math.abs(this.surfaceAtCached(x) - tank.y) <= TANK_HEIGHT * 2) {
          inFire = true;
          break;
        }
      }
      if (inFire) this.applyBlastDamage(tank, def.dotPerTick); // shield pool drains per-tick
    }

    // 3. DECAY. Tick every column down; drop the burnt-out ones. Decrement survivors
    //    in place (Map.set on an EXISTING key during iteration is safe and does not
    //    disturb the iteration order), and collect only the EXPIRED keys to delete
    //    after the loop — deleting mid-iteration is the only unsafe mutation. This
    //    avoids spreading the full key set into a fresh array every burning tick;
    //    the resulting fire contents are identical (same survivors, same removals).
    let expired: number[] | null = null;
    for (const [x, life] of this.fire) {
      const next = life - 1;
      if (next <= 0) (expired ??= []).push(x);
      else this.fire.set(x, next);
    }
    if (expired !== null) {
      for (const x of expired) this.fire.delete(x);
    }

    // Fire fully burnt out — clear the retained def + scorched set so the NEXT
    // napalm starts with a clean slate (a fresh shot may light the same columns).
    if (this.fire.size === 0) {
      this.fireDef = null;
      this.fireScorched.clear();
    }

    this.syncFire();
  }

  /**
   * Whether the fire may spread from column `fromX` into neighbour `toX`. Flows
   * downhill (toX lower, i.e. larger surface y) freely; climbs a higher neighbour
   * only when the rise is within def.climbLimit px. An all-air neighbour column
   * (surfaceAt == CANVAS_HEIGHT) reads as far below => fire pours into the pit.
   */
  private canSpread(fromX: number, toX: number, def: NapalmDef): boolean {
    if (toX < 0 || toX >= CANVAS_WIDTH) return false;
    const from = this.surfaceAtCached(fromX); // y (down = larger)
    const to = this.surfaceAtCached(toX);
    const rise = from - to; // > 0 => toX is HIGHER (smaller y)
    return rise <= def.climbLimit;
  }

  /** Mirror the working `fire` Map into `state.fire`, sorted by x for a stable,
   *  deterministic snapshot order (renderer + serialization read this array). */
  private syncFire(): void {
    // Build the snapshot in a single pass (no intermediate spread/map arrays), then
    // sort by x. Same resulting array of {x,life} in the same ascending-x order as
    // the prior spread+map+sort — purely fewer per-tick allocations.
    const cells: { x: number; life: number }[] = [];
    for (const [x, life] of this.fire) cells.push({ x, life });
    cells.sort((a, b) => a.x - b.x);
    this.state.fire = cells;
  }
}
