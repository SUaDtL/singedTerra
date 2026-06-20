/**
 * Pure, DOM-free helpers for tank damage-state visual effects.
 *
 * These functions use only arithmetic — no browser/DOM dependency, no imports
 * from shared/ or client/. A Node/tsx harness can import them directly without
 * a canvas or window object.
 *
 * No imports from client/, shared/, or any DOM API.
 */

/**
 * Visual damage tier derived from authoritative tank.health.
 *
 * Boundaries (inclusive):
 *   health <= 0   → 'dead'      (tank is destroyed / being killed)
 *   health <= 33  → 'damaged'   (below ~33% — scorch tint + continuous smoke)
 *   health >  33  → 'healthy'   (no special overlay)
 *
 * Intentionally a pure function of health so the renderer and the harness
 * always agree on the same boundaries.
 *
 * @param health  Tank health value (0–100; may be negative from overkill).
 * @returns       Visual tier string literal.
 */
export type DamageTier = 'healthy' | 'damaged' | 'dead';

export const DAMAGE_THRESHOLD = 33 as const;

export function damageTier(health: number): DamageTier {
  if (health <= 0) return 'dead';
  if (health <= DAMAGE_THRESHOLD) return 'damaged';
  return 'healthy';
}
