import { MAX_WIND } from '@shared/engine/Physics';

export const WIND_GUST_CALM_THRESHOLD = 0.2;
export const WIND_GUST_LIFE_FRAMES = 48;

export interface WindGustVisualProfile {
  readonly direction: -1 | 1;
  readonly strength: number;
  readonly streakCount: number;
  readonly length: number;
  readonly speed: number;
  readonly alpha: number;
  readonly life: number;
}

/**
 * Map the authoritative wind value onto a small, bounded presentation envelope.
 * This never feeds physics: it only lets the sky echo the same value already
 * shown by the HUD and consumed by the deterministic projectile step.
 */
export function getWindGustVisualProfile(
  wind: number,
): Readonly<WindGustVisualProfile> | null {
  if (!Number.isFinite(wind) || Math.abs(wind) < WIND_GUST_CALM_THRESHOLD) {
    return null;
  }

  const strength = Math.min(1, Math.abs(wind) / MAX_WIND);
  return Object.freeze({
    direction: wind < 0 ? -1 : 1,
    strength,
    streakCount: Math.round(5 + strength * 6),
    length: 28 + strength * 40,
    speed: 1.4 + strength * 2.6,
    alpha: 0.1 + strength * 0.18,
    life: WIND_GUST_LIFE_FRAMES,
  });
}
