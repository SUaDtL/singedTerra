import type { TankState } from '../types/GameState.ts';
import { CANVAS_WIDTH, surfaceAt } from './Terrain.ts';
import { TANK_WIDTH } from './Tank.ts';

/** Largest signed horizontal distance accepted by one committed move action. */
export const MAX_MOVE_DELTA = 8;
/** Largest surface-height change a tank can traverse in one horizontal pixel. */
export const MAX_MOVE_SURFACE_STEP = 4;

/** True only for the exact movement payload domain shared with the Edge referee. */
export function isValidMoveDelta(delta: number): boolean {
  return Number.isInteger(delta) &&
    delta !== 0 &&
    Math.abs(delta) <= MAX_MOVE_DELTA;
}

/**
 * Resolve one deterministic tank movement commitment.
 *
 * The action is traversed one integer column at a time, preventing tunneling
 * through cliffs, battlefield bounds, or another living tank. Fuel is charged
 * only after a candidate pixel is accepted. The function mutates only `tank`
 * and returns the horizontal pixels actually traveled.
 */
export function resolveTankMove(
  tank: TankState,
  tanks: readonly TankState[],
  terrain: Uint8Array,
  delta: number,
): number {
  if (
    !isValidMoveDelta(delta) ||
    !tank.alive ||
    tank.buried ||
    tank.fuel <= 0
  ) {
    return 0;
  }

  const direction = Math.sign(delta);
  const requested = Math.min(Math.abs(delta), Math.floor(tank.fuel));
  const minX = TANK_WIDTH / 2;
  const maxX = CANVAS_WIDTH - TANK_WIDTH / 2;
  let traveled = 0;

  for (let step = 0; step < requested; step += 1) {
    const candidateX = tank.x + direction;
    if (candidateX < minX || candidateX > maxX) break;

    const candidateY = surfaceAt(terrain, candidateX);
    if (Math.abs(candidateY - tank.y) > MAX_MOVE_SURFACE_STEP) break;

    const blocked = tanks.some((other) =>
      other !== tank &&
      other.alive &&
      !other.buried &&
      Math.abs(other.x - candidateX) < TANK_WIDTH);
    if (blocked) break;

    tank.x = candidateX;
    tank.y = candidateY;
    tank.fuel -= 1;
    traveled += 1;
  }

  return traveled;
}
