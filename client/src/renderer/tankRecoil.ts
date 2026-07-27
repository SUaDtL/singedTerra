/** Maximum number of rendered frames occupied by one local launch kick. */
export const TANK_RECOIL_FRAMES = 10;

const MIN_LAUNCH_WEIGHT = 0.8;
const MAX_LAUNCH_WEIGHT = 1.8;
const MIN_PEAK_PX = 1.4;
const MAX_PEAK_PX = 4;
const VERTICAL_DAMPING = 0.35;

export interface TankRecoilPose {
  readonly x: number;
  readonly y: number;
}

/**
 * Map the existing bounded muzzle-profile weight to a short chassis translation.
 * This is presentation-only: callers translate Canvas state rather than changing
 * the authoritative tank coordinates used by physics, aim, or networking.
 */
export function tankRecoilPose(
  angleDeg: number,
  launchWeight: number,
  age: number,
): TankRecoilPose | null {
  if (
    !Number.isFinite(angleDeg)
    || !Number.isFinite(launchWeight)
    || launchWeight <= 0
    || !Number.isInteger(age)
    || age < 0
    || age >= TANK_RECOIL_FRAMES
  ) {
    return null;
  }

  const weight = Math.min(
    MAX_LAUNCH_WEIGHT,
    Math.max(MIN_LAUNCH_WEIGHT, launchWeight),
  );
  const weightProgress =
    (weight - MIN_LAUNCH_WEIGHT) / (MAX_LAUNCH_WEIGHT - MIN_LAUNCH_WEIGHT);
  const peak = MIN_PEAK_PX + (MAX_PEAK_PX - MIN_PEAK_PX) * weightProgress;
  const recovery = 1 - age / TANK_RECOIL_FRAMES;
  const displacement = peak * recovery * recovery;
  const angle = (angleDeg * Math.PI) / 180;

  return {
    x: -Math.cos(angle) * displacement,
    y: Math.sin(angle) * displacement * VERTICAL_DAMPING,
  };
}
