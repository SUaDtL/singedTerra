import type {
  ExplosionEvent,
  GameState,
  TankState,
} from '../types/GameState';
import type { PlayerAction } from '../types/PlayerAction';
import type { GameOptions } from '../types/Events';
import { generate, deform, CANVAS_HEIGHT } from './Terrain';
import { placeTwoTanks, barrelTip } from './Tank';
import { launchVelocity, stepProjectile, sweepCollide } from './Physics';

/**
 * Master game state machine (SPEC §4.3). Owns the authoritative `GameState` and
 * drives the loop. Runs identically in the browser (hot-seat) and on the server
 * (networked) — physics is fixed-timestep and deterministic: identical
 * (seed, action-sequence, tick-count) always yields identical state.
 *
 * MVP0 scope: terrain + 2 tanks + aim + fire + ballistic flight + crater +
 * explosion event. NO turn rotation, NO health/damage, NO wind (wind term is
 * kept at 0). `phase` toggles only between PLAYER_TURN (aiming) and FIRING.
 */

/**
 * Fixed default terrain seed used when `GameOptions.seed` is absent. A literal
 * constant — NEVER derived from the clock or a global random source — so a
 * seedless construction is still fully reproducible.
 */
const DEFAULT_SEED = 0x5eed_1234;

/** MVP0 explosion/crater radius (px). Tunable; weapon-driven from MVP1 on. */
const MVP0_EXPLOSION_RADIUS = 28;

/** Barrel length (px) used to offset the projectile spawn off the tank body. */
const BARREL_LENGTH = 18;

/** MVP0 fixes wind to 0 (wind arrives in MVP1); the term is kept in physics. */
const MVP0_WIND = 0;

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

  /** Live terrain height map (authoritative; serialized into getState()). */
  private terrain: Uint16Array;

  /** Monotonic explosion id source — drives ExplosionEvent.id dedupe. */
  private explosionSeq = 0;

  constructor(options?: GameOptions) {
    const seed = options?.seed ?? DEFAULT_SEED;
    this.terrain = generate(seed);

    const terrainArr = Array.from(this.terrain);
    const tanks = placeTwoTanks(terrainArr, options);

    this.state = {
      phase: 'PLAYER_TURN',
      turn: 0,
      activePlayerId: tanks[0]?.id ?? '',
      wind: MVP0_WIND,
      terrain: terrainArr,
      tanks,
      projectile: null,
      lastExplosion: null,
      winner: null,
    };
  }

  /** Current snapshot of game state for rendering / broadcast. */
  getState(): GameState {
    return this.state;
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
        if (this.state.projectile !== null) return;
        const v = launchVelocity(tank.angle, tank.power);
        const tip = barrelTip(tank, BARREL_LENGTH);
        this.state.projectile = {
          x: tip.x,
          y: tip.y,
          vx: v.vx,
          vy: v.vy,
          weaponType: tank.selectedWeapon,
        };
        this.state.phase = 'FIRING';
        return;
      }
      default:
        return;
    }
  }

  /**
   * Advance one fixed timestep. While FIRING, integrate the projectile one step
   * then test for collision. On a ground/tank hit: crater the terrain, emit an
   * explosion event, drop the projectile, and return to aiming. On OOB: drop the
   * projectile and return to aiming. Outside FIRING this is a no-op.
   */
  tick(): void {
    if (this.state.phase !== 'FIRING') return;
    const p = this.state.projectile;
    if (p === null) {
      // Defensive: FIRING with no projectile — recover to aiming.
      this.state.phase = 'PLAYER_TURN';
      return;
    }

    // Remember the pre-step position so collision is swept across the whole
    // segment travelled this tick — a fast shot must not tunnel through a thin
    // terrain spike or a tank (per-tick displacement can exceed TANK_WIDTH).
    const prevX = p.x;
    const prevY = p.y;
    stepProjectile(p, this.state.wind);
    const hit = sweepCollide(p, prevX, prevY, this.terrain, this.state.tanks);

    if (hit.type === 'none') return;

    if (hit.type === 'ground' || hit.type === 'tank') {
      this.explode(hit.x, hit.y, MVP0_EXPLOSION_RADIUS);
    }
    // 'oob' (and resolved hits) clear the projectile and return to aiming.
    this.state.projectile = null;
    this.state.phase = 'PLAYER_TURN';
  }

  /**
   * Apply an explosion at (cx, cy): crater the terrain deterministically, keep
   * the serialized terrain in sync, and publish a monotonically-id'd
   * ExplosionEvent the client dedupes by id. (No damage in MVP0.)
   */
  private explode(cx: number, cy: number, radius: number): void {
    const range = deform(this.terrain, cx, cy, radius);

    // Mirror exactly the columns deform() reported as modified back into the
    // serialized height map — no independent re-derivation of the span, so the
    // two can never desync.
    if (range !== null) {
      for (let x = range.xStart; x <= range.xEnd; x++) {
        this.state.terrain[x] = this.terrain[x];
      }
    }

    const event: ExplosionEvent = {
      id: ++this.explosionSeq,
      cx,
      cy: clamp(cy, 0, CANVAS_HEIGHT),
      radius,
    };
    this.state.lastExplosion = event;
  }
}
