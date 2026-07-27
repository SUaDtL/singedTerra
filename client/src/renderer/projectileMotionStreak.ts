export const MIN_STREAK_SPEED = 0.35;
export const MAX_STREAK_SPEED = 25;

export interface ProjectileMotionStreak {
  readonly tailOffsetX: number;
  readonly tailOffsetY: number;
  readonly headOffsetX: number;
  readonly headOffsetY: number;
  readonly length: number;
  readonly width: number;
  readonly alpha: number;
}

/**
 * Derive a bounded, presentation-only ribbon behind the current velocity.
 * Offsets are relative to the projectile position; callers own translation.
 */
export function getProjectileMotionStreak(
  vx: number,
  vy: number,
  coreRadius: number,
): Readonly<ProjectileMotionStreak> | null {
  if (
    !Number.isFinite(vx)
    || !Number.isFinite(vy)
    || !Number.isFinite(coreRadius)
    || coreRadius <= 0
  ) return null;

  const speed = Math.hypot(vx, vy);
  if (speed < MIN_STREAK_SPEED) return null;

  // Math.hypot(MAX_VALUE, MAX_VALUE) overflows even though both components are
  // finite. Normalize through their largest component for that hostile-but-valid
  // case so presentation caps instead of dropping a real direction cue.
  let unitX: number;
  let unitY: number;
  if (Number.isFinite(speed)) {
    unitX = vx / speed;
    unitY = vy / speed;
  } else {
    const componentScale = Math.max(Math.abs(vx), Math.abs(vy));
    const scaledX = vx / componentScale;
    const scaledY = vy / componentScale;
    const scaledLength = Math.hypot(scaledX, scaledY);
    unitX = scaledX / scaledLength;
    unitY = scaledY / scaledLength;
  }

  const strength = Math.min(
    1,
    (speed - MIN_STREAK_SPEED) / (MAX_STREAK_SPEED - MIN_STREAK_SPEED),
  );
  const length = 6 + strength * 22;
  const radiusStrength = Math.min(1, Math.max(0, (coreRadius - 1) / 5));
  const width = 1.5 + radiusStrength * 3.5;
  const alpha = 0.22 + strength * 0.22;
  const headGap = Math.min(2, coreRadius * 0.35);

  return Object.freeze({
    tailOffsetX: -unitX * (headGap + length),
    tailOffsetY: -unitY * (headGap + length),
    headOffsetX: -unitX * headGap,
    headOffsetY: -unitY * headGap,
    length,
    width,
    alpha,
  });
}
