import type { ProjectileState, TankState } from '../types/GameState';

/**
 * Deterministic projectile physics (SPEC §4.2). Fixed 16ms timestep so hot-seat
 * and networked execution produce identical results — no wall-clock time, no
 * mid-flight randomness.
 */

/** Gravity acceleration in px/tick (SPEC §4.2, §12). */
export const GRAVITY = 0.15;

/** Per-tick horizontal acceleration multiplier applied to the wind value. */
export const WIND_FACTOR = 0.02;

/** Wind magnitude cap; range is [-MAX_WIND, +MAX_WIND] (SPEC §4.4). */
export const MAX_WIND = 10;

/** Peak explosion damage at the blast center (SPEC §4.2). */
export const MAX_DAMAGE = 100;

/** Result of a single physics step / collision check. */
export type CollisionResult =
  | { kind: 'none' }
  | { kind: 'ground'; x: number; y: number }
  | { kind: 'tank'; tankId: string; x: number; y: number }
  | { kind: 'out_of_bounds' };

/**
 * Advance a projectile by one fixed timestep, applying gravity and wind.
 * Mutates and returns the projectile.
 */
export function step(projectile: ProjectileState, wind: number): ProjectileState {
  void wind;
  throw new Error('not implemented');
}

/**
 * Test a projectile against the terrain, tanks, and bounds for this tick.
 */
export function collision(
  projectile: ProjectileState,
  terrain: Uint16Array,
  tanks: readonly TankState[],
): CollisionResult {
  void projectile;
  void terrain;
  void tanks;
  throw new Error('not implemented');
}

/**
 * Compute damage dealt to a tank from an explosion at (cx, cy) with radius r,
 * using circular falloff: damage = MAX_DAMAGE * (1 - dist/radius) (SPEC §4.2).
 */
export function explosion(
  cx: number,
  cy: number,
  r: number,
  tank: TankState,
): number {
  void cx;
  void cy;
  void r;
  void tank;
  throw new Error('not implemented');
}
