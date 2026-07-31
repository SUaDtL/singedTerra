import type { GameState, TankState } from '@shared/types/GameState';
import { BARREL_LENGTH, barrelTip } from '@shared/engine/Tank';
import { clamp } from '@shared/engine/math';

/**
 * A deliberately short, stylized projection: enough to communicate launch
 * direction and relative power, but never an authoritative ballistic path.
 */
export const AIM_GUIDE_TICKS = 14;

export interface AimGuidePoint {
  readonly x: number;
  readonly y: number;
}

export type AimGuideMode = 'none' | 'launch';

/** Decide whether the local player receives the bounded launch hint. */
export function getAimGuideMode(
  state: Pick<GameState, 'phase'>,
  tank: Readonly<TankState>,
  localControls: boolean,
  guideEnabled: boolean,
): AimGuideMode {
  return localControls
    && guideEnabled
    && state.phase === 'PLAYER_TURN'
    && tank.alive
    ? 'launch'
    : 'none';
}

/**
 * Build a local launch cue rather than a trajectory. The bounded muzzle ray
 * intentionally ignores authoritative wind, gravity, terrain, tanks, walls,
 * and the fixed-step recurrence. It therefore cannot reveal a collision or
 * solve a bank shot.
 */
export function buildLaunchGuide(
  tank: Readonly<TankState>,
): AimGuidePoint[] {
  if (
    !tank.alive
    || !Number.isFinite(tank.x)
    || !Number.isFinite(tank.y)
    || !Number.isFinite(tank.angle)
    || !Number.isFinite(tank.power)
  ) {
    return [];
  }

  const tip = barrelTip(tank, BARREL_LENGTH);
  const radians = tank.angle * Math.PI / 180;
  const powerRatio = Math.sqrt(clamp(tank.power / 100, 0, 1));
  const length = 48 + powerRatio * 78;
  // The first point is the exact shared muzzle. Every later point stays on that
  // same ray so the cue reads as one continuous extension of the barrel.
  const points: AimGuidePoint[] = [tip];
  for (let index = 1; index < AIM_GUIDE_TICKS; index++) {
    // Ease out of the muzzle so the first visible bead stays connected to the
    // barrel at gameplay scale; later beads open up into the same bounded cue.
    const progress = (index / (AIM_GUIDE_TICKS - 1)) ** 1.45;
    const distance = length * progress;
    points.push({
      x: tip.x + Math.cos(radians) * distance,
      y: tip.y - Math.sin(radians) * distance,
    });
  }
  return points;
}
