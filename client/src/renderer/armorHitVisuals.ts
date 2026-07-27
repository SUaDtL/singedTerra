export const ARMOR_HIT_LIFE_FRAMES = 14;

const MIN_STRENGTH = 0.25;
const MAX_DAMAGE_SCALE = 100;
const MIN_RADIUS = 16;
const MAX_RADIUS = 28;
const MIN_SPARKS = 4;
const MAX_SPARKS = 10;

export interface ArmorHitVisualProfile {
  readonly strength: number;
  readonly radius: number;
  readonly sparkCount: number;
  readonly life: number;
}

/**
 * Map an authoritative health loss to bounded client-only hit presentation.
 * Physics and networking consume none of these values.
 */
export function getArmorHitVisualProfile(
  damage: number,
): ArmorHitVisualProfile | null {
  if (!Number.isFinite(damage) || damage <= 0) return null;

  const strength = Math.min(1, Math.max(MIN_STRENGTH, damage / MAX_DAMAGE_SCALE));
  const progress = (strength - MIN_STRENGTH) / (1 - MIN_STRENGTH);

  return {
    strength,
    radius: MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * progress,
    sparkCount: Math.round(MIN_SPARKS + (MAX_SPARKS - MIN_SPARKS) * progress),
    life: ARMOR_HIT_LIFE_FRAMES,
  };
}
