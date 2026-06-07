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
  type NapalmDef,
  CREDITS_PER_DAMAGE,
  TURN_STIPEND,
} from './WeaponSystem';
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
const POWER_MAX = 100;

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

  /** Original construction options, retained so startNextRound can re-place tanks
   *  the same way the opening round did (same player roster / layout path). */
  private options?: GameOptions;

  constructor(options?: GameOptions) {
    const seed = options?.seed ?? DEFAULT_SEED;
    const heightLine = generate(seed);
    this.terrain = buildBitmap(heightLine);
    this.windRng = createRng(seed);
    this.maxWind = options?.maxWind ?? MAX_WIND;
    this.gravity = options?.gravity ?? GRAVITY;
    this.seed = seed;
    // Clamp to a sane >= 1 integer; non-finite/<=0 falls back to a single round.
    this.totalRounds = Math.max(1, Math.floor(options?.rounds ?? 1) || 1);
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
   * select_weapon sets the active weapon (no ammo gate here — gating happens on
   * `fire`, which rejects a shot when the selected weapon is out of ammo).
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
      case 'buy': {
        // Purchase one bundle from the store. Does NOT end the turn (buy as many
        // times as credits allow, then fire). Rejected for unimplemented or
        // unlimited weapons, or when the active tank can't afford it.
        const def = getWeapon(action.weapon);
        if (!def.implemented) return;
        const slot = tank.inventory[action.weapon];
        if (slot.unlimited) return; // unlimited stock — nothing to buy
        // Idempotent restock for CPU seats (P1-7b). In networked lockstep EVERY
        // client submits a bot's action, and a buy is turn-neutral, so the referee's
        // turn-cursor (which makes fires exactly-once) can't dedupe staggered
        // duplicate buys — two clients could each commit a buy row and overspend the
        // bot. A bot only ever buys a weapon it LACKS (AI.chooseBuy), so collapse the
        // duplicates by skipping a CPU-seat buy when it already owns one: exactly-once
        // effective on every replay. Humans may stock multiples, so this is bots-only.
        if (tank.ai && slot.count > 0) return;
        if (tank.credits < def.price) return; // can't afford
        tank.credits -= def.price;
        slot.count += def.bundleSize;
        return;
      }
      case 'use_shield': {
        // Activating the shield is a turn-ending commitment, like firing. Gate on
        // shield ammo (the inventory entry is guaranteed present). Rejection leaves
        // the tank aiming, free to choose otherwise.
        const ammo = tank.inventory.shield;
        if (!ammo.unlimited && ammo.count <= 0) return;

        const capacity = getWeapon('shield').behavior?.shield?.capacity ?? 0;
        tank.shieldHp = capacity;
        if (!ammo.unlimited) ammo.count--;

        // No projectile, no FIRING phase — the shield resolves instantly. No one
        // can die from shielding, so skip the win-check and just advance the turn
        // (next living player, fresh wind), mirroring resolve()'s NEXT_TURN tail.
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
   * Advance one fixed timestep. While FIRING, integrate the projectile one step
   * (with the active wind) then sweep-test for collision. On any resolution
   * (ground/tank hit OR out-of-bounds miss) the shot resolves: crater + damage +
   * collapse + win check, then the turn advances (new wind) to PLAYER_TURN, or
   * the game ends at GAME_OVER. Outside FIRING this is a no-op.
   */
  tick(): void {
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
      stepProjectile(p, this.state.wind, this.gravity);
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
          this.igniteNapalm(hit.x, hit.y, napalm); // splashes burning fuel, no blast
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
            this.igniteNapalm(hit.x, hit.y, napalm); // splashes burning fuel, no blast
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

    // The shot is fully resolved only once NO projectiles remain in flight AND
    // the napalm fire has burned out — so a turn waits for the flames. Run the
    // turn-machine resolution EXACTLY ONCE on the settling tick.
    if (survivors.length === 0 && this.fire.size === 0) {
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

    const alive = this.state.tanks.filter((t) => t.alive);

    if (alive.length <= 1) {
      // ROUND END (V1 match structure). 1 alive => that tank won the round; 0 alive
      // (mutual kill) => the round is a draw (no one scores). Record the result, then
      // either end the MATCH or start the next round. With totalRounds === 1 this is
      // byte-identical to the old single-round behavior (clinch is 1, so any round win
      // ends the match, and a draw with round >= totalRounds also ends it).
      const roundWinner = alive.length === 1 ? alive[0] : null;
      this.state.lastRoundWinnerId = roundWinner?.id ?? null;
      if (roundWinner) roundWinner.roundWins += 1;

      // First to clinch ceil(N/2) round wins takes the match; or the match ends once
      // all N rounds have been played (only reachable past a clinch via draws).
      const clinch = Math.ceil(this.totalRounds / 2);
      const clinched = roundWinner !== null && roundWinner.roundWins >= clinch;
      const matchOver = clinched || this.state.round >= this.totalRounds;

      if (matchOver) {
        this.state.phase = 'GAME_OVER';
        this.state.winner = this.computeMatchWinner();
        return;
      }

      this.startNextRound();
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
        tank.credits = old.credits; // carry earnings
        tank.inventory = old.inventory; // carry purchased ammo (and spent rounds)
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
    this.windRng = createRng(roundSeed);
    this.state.wind = this.nextWind(0);

    this.state.turn += 1;
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

  private detonate(cx: number, cy: number, weaponType: WeaponType): void {
    const { radius, maxDamage, raisesTerrain, style, color, durationFrames } =
      getWeapon(weaponType).detonation;
    const raise = raisesTerrain === true;

    // Deform the live bitmap, then let the touched columns' dirt fall. The
    // bitmap IS state.terrain (same reference), so no separate sync is needed.
    const range = deform(this.terrain, cx, cy, radius, raise);
    if (range !== null) {
      applyGravity(this.terrain, range.xStart, range.xEnd);
      // Signal the (in-place) bitmap change so the renderer rebuilds its offscreen
      // without hashing 400k bytes every frame (P2-8). Render-only; not physics.
      this.state.terrainVersion++;
    }

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
        this.applyBlastDamage(tank, scaled); // shield pool soaks up to its charge
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
        // V1 scoreboard: a burial caused by this shot is a kill for the shooter
        // (not blast damage, so it adds to kills but not totalDamage). Self-burial
        // from one's own crater does not count.
        if (!tank.alive && tank.id !== this.shooterId) {
          const shooter = this.state.tanks.find((t) => t.id === this.shooterId);
          if (shooter) shooter.kills += 1;
        }
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
  private igniteNapalm(cx: number, cy: number, def: NapalmDef): void {
    const center = Math.round(cx);
    this.fireDef = def;
    this.fireCenter = center;
    // Seed the initial puddle. ignite() refreshes life on overlap, so re-igniting
    // an already-burning column is harmless.
    for (let dx = -def.splashRadius; dx <= def.splashRadius; dx++) {
      this.ignite(center + dx, def.burnTicks);
    }

    // Ignition flash — VISUAL ONLY (reuses the weapon's detonation look). No
    // terrain deform, no proximity damage: the burn does the work.
    const det = getWeapon('napalm').detonation;
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
        if (Math.abs(surfaceAt(this.terrain, x) - tank.y) <= TANK_HEIGHT * 2) {
          inFire = true;
          break;
        }
      }
      if (inFire) this.applyBlastDamage(tank, def.dotPerTick); // shield pool drains per-tick
    }

    // 3. DECAY. Tick every column down; drop the burnt-out ones. Collect keys
    //    first so we never mutate the Map mid-iteration.
    for (const x of [...this.fire.keys()]) {
      const life = this.fire.get(x)! - 1;
      if (life <= 0) this.fire.delete(x);
      else this.fire.set(x, life);
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
    const from = surfaceAt(this.terrain, fromX); // y (down = larger)
    const to = surfaceAt(this.terrain, toX);
    const rise = from - to; // > 0 => toX is HIGHER (smaller y)
    return rise <= def.climbLimit;
  }

  /** Mirror the working `fire` Map into `state.fire`, sorted by x for a stable,
   *  deterministic snapshot order (renderer + serialization read this array). */
  private syncFire(): void {
    const cells = [...this.fire.entries()].map(([x, life]) => ({ x, life }));
    cells.sort((a, b) => a.x - b.x);
    this.state.fire = cells;
  }
}
