import type { ProjectileState, TankState } from '../types/GameState';
import { CANVAS_WIDTH, CANVAS_HEIGHT, pixelAt } from './Terrain';
import { TANK_WIDTH, TANK_HEIGHT } from './Tank';

/**
 * Deterministic projectile physics (SPEC §4.2). Fixed 16ms timestep so hot-seat
 * and networked execution produce identical results — no wall-clock time, no
 * mid-flight randomness, no clock-derived dt.
 *
 * Angle/launch convention (SPEC §6): angle in degrees, 0° = right (+x),
 * 90° = up (screen −y). Barrel unit vector is (cos θ, −sin θ).
 *
 * Coordinate convention: x in [0, CANVAS_WIDTH) left→right; y grows DOWNWARD.
 * terrain[x] is the surface y at column x; a point is underground when
 * y >= terrain[floor(x)].
 */

/** Gravity acceleration in px/tick (SPEC §4.2, §12). Added to vy each tick. */
export const GRAVITY = 0.15;

/** Per-tick horizontal acceleration multiplier applied to the wind value. */
export const WIND_FACTOR = 0.006;

/** Wind magnitude cap; range is [-MAX_WIND, +MAX_WIND] (SPEC §4.4). */
export const MAX_WIND = 10;

/**
 * Max amount the wind may change from one turn to the next (gentle drift). Wind
 * walks by a delta in [-WIND_DRIFT_STEP, +WIND_DRIFT_STEP] per turn (then clamps
 * to [-maxWind, +maxWind]) so players can range/walk shots in across turns.
 */
export const WIND_DRIFT_STEP = MAX_WIND * 0.25; // 2.5

/** Peak explosion damage at the blast center (SPEC §4.2). */
export const MAX_DAMAGE = 100;

/**
 * Launch speed (px/tick) per unit of power (power is 0–100). Tunable
 * (~0.12–0.3); with power 100 this yields a muzzle speed of ~24 px/tick.
 */
export const POWER_SCALE = 0.24;

/** Degrees → radians. */
const DEG_TO_RAD = Math.PI / 180;

/** Result of a single physics step / collision check (discriminated union). */
export type CollisionResult =
  | { type: 'none' }
  | { type: 'ground'; x: number; y: number }
  | { type: 'tank'; tankId: string; x: number; y: number }
  | { type: 'oob' };

/** Authoritative explosion event payload emitted into GameState (SPEC §7). */
export interface ExplosionResult {
  cx: number;
  cy: number;
  radius: number;
}

/** A 2D velocity. */
export interface Velocity {
  vx: number;
  vy: number;
}

/**
 * Launch velocity for a shot fired at `angleDeg` (0 = right, 90 = up) with the
 * given `power` (0–100). Up is screen −y, hence the −sin term.
 */
export function launchVelocity(angleDeg: number, power: number): Velocity {
  const theta = angleDeg * DEG_TO_RAD;
  const speed = power * POWER_SCALE;
  return {
    vx: speed * Math.cos(theta),
    vy: -speed * Math.sin(theta),
  };
}

/**
 * Advance a projectile by one fixed timestep (SPEC §4.2):
 *   vy += gravity; vx += wind * WIND_FACTOR; x += vx; y += vy.
 * Mutates and returns the projectile. dt is constant — never read from a clock.
 *
 * `gravity` defaults to the GRAVITY constant so existing 2-arg callers keep
 * working unchanged; the engine threads a per-room override (GameOptions.gravity).
 */
export function stepProjectile(
  p: ProjectileState,
  wind: number,
  gravity = GRAVITY,
): ProjectileState {
  p.vy += gravity;
  p.vx += wind * WIND_FACTOR;
  p.x += p.vx;
  p.y += p.vy;
  return p;
}

/**
 * Sweep collision along the segment from a projectile's pre-step position
 * (prevX, prevY) to its post-step position (p.x, p.y), testing intermediate
 * points so a fast shot cannot tunnel through a thin terrain spike or a tank
 * (the per-tick displacement can exceed TANK_WIDTH at high power).
 *
 * The segment is supersampled into ceil(distance / SWEEP_STEP) sub-steps and
 * `collide` is tested at each interpolated point (including the endpoint). The
 * FIRST hit along the path wins, so collisions register at the entry point
 * rather than wherever the endpoint happened to land. Fully deterministic — the
 * sub-step count and interpolation depend only on the input coordinates.
 */
export function sweepCollide(
  p: ProjectileState,
  prevX: number,
  prevY: number,
  terrain: Uint8Array,
  tanks: readonly TankState[],
): CollisionResult {
  const endX = p.x;
  const endY = p.y;
  const dx = endX - prevX;
  const dy = endY - prevY;
  const dist = Math.hypot(dx, dy);

  // Sub-step finely enough to never skip the smallest collidable feature (a
  // 1px-wide terrain column). One sample per SWEEP_STEP px of travel.
  const steps = Math.max(1, Math.ceil(dist / SWEEP_STEP));
  const probe: ProjectileState = {
    x: prevX,
    y: prevY,
    vx: p.vx,
    vy: p.vy,
    weaponType: p.weaponType,
    age: p.age,
    hasSplit: p.hasSplit,
  };

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    probe.x = prevX + dx * t;
    probe.y = prevY + dy * t;
    const hit = collide(probe, terrain, tanks);
    if (hit.type !== 'none') {
      // Report the impact at the interpolated point where it was detected,
      // and snap the projectile back to that point so downstream consumers
      // (explosion center) use the entry location, not the overshot endpoint.
      p.x = probe.x;
      p.y = probe.y;
      return hit;
    }
  }
  return { type: 'none' };
}

/**
 * Max travel (px) between successive collision samples in `sweepCollide`. Must
 * be <= the smallest collidable feature (a single 1px terrain pixel) so nothing
 * tunnels.
 */
const SWEEP_STEP = 1;

/**
 * Test a projectile against bounds, tanks, and terrain for this tick. Checked
 * in priority order: out-of-bounds → tank → ground. Call AFTER integrating.
 *
 * - OOB: x < 0 || x >= CANVAS_WIDTH (x===0 ok, x===CANVAS_WIDTH-1 ok).
 * - Tank: AABB of width TANK_WIDTH / height TANK_HEIGHT, centered on tank.x
 *   with its base at tank.y (box spans [tank.y - h, tank.y]).
 * - Ground: bottom-floor (y >= CANVAS_HEIGHT) or a solid bitmap pixel at
 *   (floor(x), floor(y)).
 */
export function collide(
  p: ProjectileState,
  terrain: Uint8Array,
  tanks: readonly TankState[],
): CollisionResult {
  // Out of bounds (horizontal). A miss — handled before terrain/tank so an
  // off-screen projectile never indexes terrain out of range.
  if (p.x < 0 || p.x >= CANVAS_WIDTH) {
    return { type: 'oob' };
  }

  // Tank hit (AABB). Only living tanks block.
  const halfW = TANK_WIDTH / 2;
  for (const tank of tanks) {
    if (tank.alive === false) continue;
    const left = tank.x - halfW;
    const right = tank.x + halfW;
    const top = tank.y - TANK_HEIGHT;
    const bottom = tank.y;
    if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
      return { type: 'tank', tankId: tank.id, x: p.x, y: p.y };
    }
  }

  // Ground hit. y grows downward. The bottom of the canvas is an implicit solid
  // floor; otherwise hit when the pixel at (floor(x), floor(y)) is solid. (The
  // OOB-x check above guarantees x in [0, CANVAS_WIDTH) here.)
  const xi = Math.floor(p.x);
  if (p.y >= CANVAS_HEIGHT) return { type: 'ground', x: p.x, y: p.y };
  if (pixelAt(terrain, xi, Math.floor(p.y)) === 1) {
    return { type: 'ground', x: p.x, y: p.y };
  }

  return { type: 'none' };
}

/**
 * Build the authoritative explosion event for an impact at (cx, cy). The engine
 * emits this into GameState; the client renders the expanding-circle animation
 * from it (client-only visual state).
 */
export function explosionResult(
  cx: number,
  cy: number,
  radius: number,
): ExplosionResult {
  return { cx, cy, radius };
}

/**
 * Circular damage falloff (SPEC §4.2): MAX_DAMAGE * (1 - dist/radius), clamped
 * to [0, MAX_DAMAGE]. Returns 0 at/beyond the blast edge.
 */
export function damage(dist: number, radius: number): number {
  if (radius <= 0) return 0;
  const d = MAX_DAMAGE * (1 - dist / radius);
  return d < 0 ? 0 : d > MAX_DAMAGE ? MAX_DAMAGE : d;
}

/**
 * Convenience: damage dealt to a tank from an explosion at (cx, cy) with the
 * given radius, measured from the tank's center-of-body (SPEC §4.2).
 */
export function explosionDamage(
  cx: number,
  cy: number,
  radius: number,
  tank: TankState,
): number {
  const tx = tank.x;
  const ty = tank.y - TANK_HEIGHT / 2;
  const dist = Math.hypot(cx - tx, cy - ty);
  return damage(dist, radius);
}
