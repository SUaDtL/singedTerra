/**
 * Art-direction tokens — the SINGLE SOURCE OF TRUTH for the singedTerra look
 * (Sprint 5 graphical overhaul). Every value here is pulled from the README
 * banner (docs/assets/banner.svg) so the whole game reads as one piece.
 *
 * These TS constants are consumed by the CANVAS renderers (sky/terrain/tanks/
 * projectiles/explosions). The DOM side (HUD, lobby, splash) reads the SAME
 * values mirrored as CSS custom properties in style.css `:root`. Change a colour
 * in BOTH places (or, preferably, treat this file as canonical and keep the CSS
 * vars in lockstep) so the canvas and the overlay never drift apart.
 *
 * Aesthetic: vector-pixel hybrid — retro palette + CRT, modern feel. No
 * randomness, no DOM access here; safe to import anywhere in client/.
 */

/** Dusk sky gradient, top → horizon (matches banner `#sky`). */
export const SKY_STOPS = [
  { at: 0.0, color: '#160d2e' }, // deep indigo zenith
  { at: 0.38, color: '#3a1d5e' }, // violet
  { at: 0.64, color: '#8e2f53' }, // magenta band
  { at: 0.84, color: '#d4562a' }, // ember horizon
  { at: 1.0, color: '#f2a04b' }, // amber glow
] as const;

/** Scorched terrain fill ramp (surface → deep) + lit rim (matches banner `#ground`). */
export const TERRAIN = {
  rim: '#7a4f2e', // lit surface edge
  top: '#5a3a22',
  mid: '#3c2516',
  deep: '#1d120b',
} as const;

/** Signature accents. */
export const ACCENT = {
  gold: '#ffd23f',
  ember: '#ff7a1f',
  emberDeep: '#d4562a',
  sun: '#ffb24a',
  sunCore: '#ffe9a8',
} as const;

/** Per-player tank palette (body + top-highlight band) + shared tread. */
export const TANK = {
  red: '#e84d4d',
  redLite: '#ff7a7a',
  blue: '#4d8ce8',
  blueLite: '#7fb0ff',
  tread: '#2a2118',
} as const;

/** Explosion burst ramp, core → edge (matches banner `#boom`). */
export const BOOM = {
  core: '#fff7d6',
  mid: '#ffd23f',
  edge: '#ff7a1f',
} as const;

/** Text + ink. */
export const TEXT = {
  body: '#e9e4f2', // soft lavender-white default copy
  gold: '#ffe9a8',
  dim: '#9a86b8',
  ink: '#160d2e',
} as const;

/** Backdrop behind the stage (matches the splash backdrop). */
export const BACKDROP = '#0c0716';

/**
 * Type system: chunky display for titles, mono for HUD numerics, sans for body.
 * D1 (locked): one self-hosted display face for headings; until its woff2 is
 * dropped into client/public/fonts/, the stack falls back to a strong system
 * display face so it looks deliberate immediately.
 */
export const FONT = {
  display:
    "'SingedDisplay', 'Trebuchet MS', 'Segoe UI', 'Verdana', sans-serif",
  mono: "'Courier New', ui-monospace, 'SFMono-Regular', monospace",
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

/** CRT overlay intensity (D2: subtle). Mirrored in style.css :root. */
export const CRT = {
  scanlineAlpha: 0.1,
  vignetteAlpha: 0.35,
} as const;

/**
 * Build the banner dusk-sky gradient onto a canvas context. Centralised so every
 * sky draw is identical. Caller supplies the vertical extent (y0..y1).
 */
export function skyGradient(
  ctx: CanvasRenderingContext2D,
  y0: number,
  y1: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const stop of SKY_STOPS) g.addColorStop(stop.at, stop.color);
  return g;
}

/* ---- Colour helpers (canvas shading from an arbitrary player hex) ---- */

/** Parse `#rgb`/`#rrggbb` into [r,g,b] 0..255 (player swatches are hex). */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Mix a hex colour toward white by t (0..1) → `rgb(...)` string. */
export function lightenHex(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${(r + (255 - r) * t) | 0}, ${(g + (255 - g) * t) | 0}, ${(b + (255 - b) * t) | 0})`;
}

/** Mix a hex colour toward black by t (0..1) → `rgb(...)` string. */
export function darkenHex(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${(r * (1 - t)) | 0}, ${(g * (1 - t)) | 0}, ${(b * (1 - t)) | 0})`;
}
