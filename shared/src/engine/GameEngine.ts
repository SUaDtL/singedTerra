import type {
  ExplosionEvent,
  GameState,
  ProjectileState,
  TankState,
} from '../types/GameState';
import type { PlayerAction } from '../types/PlayerAction';
import type { GameOptions } from '../types/Events';
import {
  generate,
  buildBitmap,
  deform,
  applyGravity,
  surfaceAt,
  pixelAt,
  CANVAS_HEIGHT,
} from './Terrain';
import {
  placeTwoTanks,
  placeTanks,
  barrelTip,
  Tank,
  TANK_HEIGHT,
} from './Tank';
import {
  launchVelocity,
  stepProjectile,
  sweepCollide,
  explosionDamage,
  MAX_WIND,
  WIND_DRIFT_STEP,
  MAX_DAMAGE,
  GRAVITY,
} from './Physics';
import { getWeapon, type WeaponType } from './WeaponSystem';
import { createRng } from './Random';

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

/** Barrel length (px) used to offset the projectile spawn off the tank body. */
const BARREL_LENGTH = 18;

/** Aim-input clamps (SPEC §6: angle degrees 0=right..180=left; power 0–100). */
const ANGLE_MIN = 0;
const ANGLE_MAX = 180;
const POWER_MIN = 0;
const POWER_MAX = 100;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class GameEngine {
  private state: GameState;

  /** Live terrain pixel bitmap (authoritative; returned by ref from getState()). */
  private terrain: Uint8Array;

  /** Monotonic explosion id source — drives ExplosionEvent.id dedupe. */
  private explosionSeq = 0;

  /**
   * Independent seeded wind RNG stream (SPEC §4.4). Advanced exactly once per
   * turn (once at construction for the opening turn, once per NEXT_TURN). Kept
   * separate from terrain generation so the two streams never correlate. Same
   * game seed + same action sequence => identical wind sequence every turn.
   */
  private windRng: () => number;

  /** Per-room wind cap (defaults to MAX_WIND); tunable via GameOptions. */
  private maxWind: number;

  /** Per-room gravity (defaults to GRAVITY); tunable via GameOptions. */
  private gravity: number;

  constructor(options?: GameOptions) {
    const seed = options?.seed ?? DEFAULT_SEED;
    const heightLine = generate(seed);
    this.terrain = buildBitmap(heightLine);
    this.windRng = createRng(seed);
    this.maxWind = options?.maxWind ?? MAX_WIND;
    this.gravity = options?.gravity ?? GRAVITY;

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
      activePlayerId: tanks[0]?.id ?? '',
      // Opening turn's wind: drift from a 0 baseline, advancing the stream once.
      wind: this.nextWind(0),
      // SAME reference as this.terrain — getState() returns the live bitmap by
      // reference, no per-snapshot copy/sync.
      terrain: this.terrain,
      tanks,
      projectiles: [],
      projectile: null,
      lastExplosion: null,
      explosions: [],
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
    const delta = (this.windRng() * 2 - 1) * WIND_DRIFT_STEP;
    return clamp(current + delta, -this.maxWind, this.maxWind);
  }

  /** Current snapshot of game state for rendering / broadcast. */
  getState(): GameState {
    return this.state;
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
   * select_weapon is accepted for forward-compat but inert in MVP0.
   */
  applyAction(action: PlayerAction): void {
    if (this.state.phase !== 'PLAYER_TURN') return;
    const tank = this.activeTank();
    if (!tank) return;

    switch (action.type) {
      case 'set_angle':
        tank.angle = clamp(action.angle, ANGLE_MIN, ANGLE_MAX);
        return;
      case 'set_power':
        tank.power = clamp(action.power, POWER_MIN, POWER_MAX);
        return;
      case 'select_weapon':
        tank.selectedWeapon = action.weapon;
        return;
      case 'fire': {
        // Ignore a re-fire while a shot is still resolving (any projectile in
        // flight). FIRING iff projectiles.length > 0.
        if (this.state.projectiles.length > 0) return;
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
          },
        ];
        this.syncProjectileAlias();
        this.state.phase = 'FIRING';
        return;
      }
      default:
        return;
    }
  }

  /**
   * Advance one fixed timestep. While FIRING, integrate the projectile one step
   * (with the active wind) then sweep-test for collision. On any resolution
   * (ground/tank hit OR out-of-bounds miss) the shot resolves: crater + damage +
   * collapse + win check, then the turn advances (new wind) to PLAYER_TURN, or
   * the game ends at GAME_OVER. Outside FIRING this is a no-op.
   */
  tick(): void {
    if (this.state.phase !== 'FIRING') return;
    if (this.state.projectiles.length === 0) {
      // Defensive: FIRING with no projectile — recover to aiming.
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
      stepProjectile(p, this.state.wind, this.gravity);
      p.age++;

      // APEX AIRBURST: an airburst shell that just crossed the top of its arc
      // (vy rising -> falling) splits in place into a deterministic velocity
      // fan of submunitions and is itself removed (no detonation here).
      const airburst = getWeapon(p.weaponType).behavior?.airburst;
      if (
        airburst !== undefined &&
        p.hasSplit === false &&
        vyBefore < 0 &&
        p.vy >= 0
      ) {
        for (const sub of this.splitAirburst(p, airburst)) survivors.push(sub);
        continue; // parent shell consumed by the split
      }

      const hit = sweepCollide(p, prevX, prevY, this.terrain, this.state.tanks);

      if (hit.type === 'none') {
        survivors.push(p); // still in flight
        continue;
      }

      // This projectile resolves. A ground/tank hit detonates at the impact
      // point; an OOB miss produces no blast. Either way it leaves the flight.
      if (hit.type === 'ground' || hit.type === 'tank') {
        this.detonate(hit.x, hit.y, p.weaponType);
      }
    }

    this.state.projectiles = survivors;
    this.syncProjectileAlias();

    // The shot is fully resolved only once NO projectiles remain in flight
    // (parent + all submunitions have detonated / missed). Until then stay
    // FIRING. Run the turn-machine resolution EXACTLY ONCE on the emptying tick.
    if (survivors.length === 0) {
      this.state.phase = 'RESOLVING';
      this.resolve();
    }
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
    const alive = this.state.tanks.filter((t) => t.alive);

    if (alive.length <= 1) {
      // 1 alive => winner; 0 alive (mutual kill) => draw (winner stays null).
      this.state.phase = 'GAME_OVER';
      this.state.winner = alive.length === 1 ? alive[0].id : null;
      return;
    }

    // NEXT_TURN: rotate to the next living tank (stable order, wrapping), bump
    // the turn counter, and draw fresh wind.
    this.advanceTurn();
    this.state.wind = this.nextWind(this.state.wind);
    this.state.turn += 1;
    this.state.phase = 'PLAYER_TURN';
  }

  /**
   * Rotate `activePlayerId` to the next ALIVE tank in stable array order,
   * wrapping around. Dead tanks are skipped. Caller guarantees >= 2 are alive.
   */
  private advanceTurn(): void {
    const tanks = this.state.tanks;
    const n = tanks.length;
    const cur = tanks.findIndex((t) => t.id === this.state.activePlayerId);
    const start = cur < 0 ? 0 : cur;
    for (let step = 1; step <= n; step++) {
      const cand = tanks[(start + step) % n];
      if (cand.alive) {
        this.state.activePlayerId = cand.id;
        return;
      }
    }
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
  private detonate(cx: number, cy: number, weaponType: WeaponType): void {
    const { radius, maxDamage, raisesTerrain, style, color, durationFrames } =
      getWeapon(weaponType).detonation;
    const raise = raisesTerrain === true;

    // Deform the live bitmap, then let the touched columns' dirt fall. The
    // bitmap IS state.terrain (same reference), so no separate sync is needed.
    const range = deform(this.terrain, cx, cy, radius, raise);
    if (range !== null) applyGravity(this.terrain, range.xStart, range.xEnd);

    // Proximity damage to every living tank. explosionDamage() returns the
    // falloff value scaled to MAX_DAMAGE; rescale to the weapon's peak so
    // dist=0 => weapon.maxDamage and dist>=radius => 0.
    for (const tank of this.state.tanks) {
      if (!tank.alive) continue;
      const baseDamage = explosionDamage(cx, cy, radius, tank);
      // explosionDamage() peaks at the global MAX_DAMAGE; rescale to this
      // weapon's maxDamage so the falloff shape is preserved.
      const scaled = (baseDamage / MAX_DAMAGE) * maxDamage;
      if (scaled > 0) {
        Tank.applyDamage(tank, scaled);
      }
    }

    // Unified post-terrain tank resolution. For each alive tank:
    //  - if a crater opened beneath it (new surface is LOWER, i.e. surf > tank.y)
    //    the tank falls onto the new floor;
    //  - else if dirt now covers its MID-BODY it is buried -> instakill.
    // NOTE: tank.y is the BASE resting ON the surface, so the pixel at
    // (floor(x), floor(y)) is ALWAYS solid for a resting tank (it would kill
    // every resting tank). We instead sample the MID-BODY (tank.y - TANK_HEIGHT/2):
    // air for a resting tank, solid only once dirt has risen over the body.
    for (const tank of this.state.tanks) {
      if (!tank.alive) continue;
      const xi = Math.floor(tank.x);
      const surf = surfaceAt(this.terrain, tank.x);
      if (surf > tank.y) {
        tank.y = surf; // crater opened beneath -> tank falls onto new floor
      } else if (pixelAt(this.terrain, xi, Math.floor(tank.y - TANK_HEIGHT / 2)) === 1) {
        Tank.applyDamage(tank, tank.health); // dirt covers mid-body -> buried, instakill
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
}
