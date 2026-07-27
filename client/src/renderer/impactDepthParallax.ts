/** Far atmosphere retains most of its position during a foreground camera hit. */
export const FAR_PARALLAX_RATIO = 0.12;
/** Ridges and wind ribbons bridge the far sky and destructible battlefield. */
export const MIDDLE_PARALLAX_RATIO = 0.35;
/** Defensive presentation cap; production recoil is already bounded below this. */
export const MAX_CAMERA_DISPLACEMENT = 20;

export interface CameraDisplacement {
  readonly x: number;
  readonly y: number;
}

export interface ImpactDepthParallax {
  readonly far: Readonly<CameraDisplacement>;
  readonly middle: Readonly<CameraDisplacement>;
  readonly world: Readonly<CameraDisplacement>;
}

function frozenOffset(x: number, y: number): Readonly<CameraDisplacement> {
  return Object.freeze({
    // Collapse signed zero so test traces and Canvas calls stay canonical.
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y,
  });
}

/**
 * Split one render-only camera displacement into three depth layers.
 *
 * Hostile finite values are scaled together rather than independently clamped,
 * preserving direction while keeping every component bounded.
 */
export function getImpactDepthParallax(
  displacement: Readonly<CameraDisplacement>,
): Readonly<ImpactDepthParallax> | null {
  const { x, y } = displacement;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const largestComponent = Math.max(Math.abs(x), Math.abs(y));
  const scale = largestComponent > MAX_CAMERA_DISPLACEMENT
    ? MAX_CAMERA_DISPLACEMENT / largestComponent
    : 1;
  const worldX = x * scale;
  const worldY = y * scale;

  return Object.freeze({
    far: frozenOffset(
      worldX * FAR_PARALLAX_RATIO,
      worldY * FAR_PARALLAX_RATIO,
    ),
    middle: frozenOffset(
      worldX * MIDDLE_PARALLAX_RATIO,
      worldY * MIDDLE_PARALLAX_RATIO,
    ),
    world: frozenOffset(worldX, worldY),
  });
}
