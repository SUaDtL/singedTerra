/**
 * Pure value→gauge mappings for the cockpit HUD instrument cluster (#44).
 *
 * DOM-free and dependency-free on purpose: the SVG gauges in HUD.ts read these
 * to position needles / fills and to format on-gauge numeric labels, and the
 * `scripts/checks/gaugemath.mjs` harness pins the truth table without a browser.
 * No `@shared` import so the relative-path harness needs no alias resolution; the
 * clamp is inlined. Nothing here is determinism-sensitive (display only).
 */

/** Local clamp — inlined to keep this module import-free (see file header). */
function clampLocal(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Treat magnitudes below this as calm, so the wind needle/arrow doesn't jitter near zero. */
const WIND_CALM_EPSILON = 0.05;

/** Linear fraction of `value` across [min,max], clamped to [0,1] (e.g. power 0..100). */
export function gaugeFraction(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clampLocal((value - min) / (max - min), 0, 1);
}

/** Signed wind deflection in [-1,1]: +right, -left, clamped to ±maxWind. */
export function windNeedleOffset(wind: number, maxWind: number): number {
  if (maxWind <= 0) return 0;
  return clampLocal(wind / maxWind, -1, 1);
}

/** Needle rotation (deg) for the elevation dial: the engine's GLOBAL barrel
 *  angle (0=right, 90=up, 180=left), clamped to [0,180]. */
export function elevationNeedleDeg(angle: number): number {
  return clampLocal(angle, 0, 180);
}

/** Barrel-relative elevation above the horizon (0=flat..90=up) from the global angle. */
export function elevationDegrees(angle: number): number {
  const a = Math.round(angle);
  return a <= 90 ? a : 180 - a;
}

/** Aim-direction glyph: ▶ right, ◀ left, ▲ straight up. */
export function aimDirectionGlyph(angle: number): string {
  const a = Math.round(angle);
  return a < 90 ? '▶' : a > 90 ? '◀' : '▲';
}

/** Power gauge numeric label: rounded integer string. */
export function powerLabel(power: number): string {
  return String(Math.round(power));
}

/** Wind magnitude label: absolute value to one decimal. */
export function windMagnitudeLabel(wind: number): string {
  return Math.abs(wind).toFixed(1);
}

/** Wind direction symbol: → right, ← left, • calm (|wind| < 0.05). */
export function windDirectionSymbol(wind: number): string {
  return Math.abs(wind) < WIND_CALM_EPSILON ? '•' : wind > 0 ? '→' : '←';
}
