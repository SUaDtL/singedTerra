export type BattleConsoleLayoutMode = 'compact' | 'standard' | 'wide';

interface ModeProjection {
  readonly numerator: number;
  readonly denominator: number;
}

export const BATTLE_CONSOLE_LOGICAL_SURFACE = Object.freeze({ width: 1388, height: 212 });

const MODE_PROJECTIONS: Readonly<Record<BattleConsoleLayoutMode, ModeProjection>> = Object.freeze({
  compact: Object.freeze({ numerator: 240, denominator: 347 }),
  standard: Object.freeze({ numerator: 295, denominator: 347 }),
  wide: Object.freeze({ numerator: 1, denominator: 1 }),
});

const TRANSFORMED_LANDMARK_COUNT = 100;
const TRANSFORMED_SOCKET_COUNT = 11;

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export interface BattleConsoleRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function projectResponsiveRect(
  rect: BattleConsoleRect,
  mode: BattleConsoleLayoutMode,
): BattleConsoleRect {
  const projection = MODE_PROJECTIONS[mode];
  const project = (value: number) => roundHalfAwayFromZero(value * projection.numerator / projection.denominator);
  return Object.freeze({
    x: project(rect.x),
    y: project(rect.y),
    width: project(rect.width),
    height: project(rect.height),
  });
}

export interface ResponsiveLayoutProjection {
  readonly mode: BattleConsoleLayoutMode;
  readonly scale: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly devicePixelRatio: number;
  readonly cssGeometryChangesWithDpr: false;
  readonly landmarkCount: number;
  readonly socketCount: number;
}

export interface BattleConsoleViewportProjectionRequest {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly stageViewportWidth?: number;
  readonly devicePixelRatio: number;
  readonly coarsePointer: boolean;
}

export interface BattleConsoleSurfaceFit {
  readonly width: number;
  readonly height: number;
  readonly surfaceScale: number;
}

/**
 * Fits the already-projected mode atlas to the battlefield's logical rail.
 * Apply this once to both presentation hosts, not to individual assets or
 * overlay portals. The outer game-stage transform owns physical viewport scale.
 */
export function fitBattleConsoleLayoutToRail(
  layout: ResponsiveLayoutProjection,
  railWidth: number,
): BattleConsoleSurfaceFit {
  if (!Number.isFinite(railWidth) || railWidth <= 0) {
    throw new RangeError('railWidth must be a positive finite number');
  }
  const surfaceScale = railWidth / layout.cssWidth;
  return Object.freeze({
    width: railWidth,
    height: layout.cssHeight * surfaceScale,
    surfaceScale,
  });
}

/**
 * Projects the canonical 1388x212 console into CSS space first, then derives
 * backing-store dimensions from DPR. DPR can therefore never move CSS geometry.
 */
export function projectResponsiveLayout(
  mode: BattleConsoleLayoutMode,
  devicePixelRatio: number,
): ResponsiveLayoutProjection {
  const projection = MODE_PROJECTIONS[mode];
  if (!projection) throw new RangeError(`Unsupported battle-console layout mode: ${String(mode)}`);
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    throw new RangeError('devicePixelRatio must be a positive finite number');
  }

  const scale = projection.numerator / projection.denominator;
  const cssWidth = roundHalfAwayFromZero(BATTLE_CONSOLE_LOGICAL_SURFACE.width * scale);
  const cssHeight = roundHalfAwayFromZero(BATTLE_CONSOLE_LOGICAL_SURFACE.height * scale);

  return {
    mode,
    scale,
    cssWidth,
    cssHeight,
    backingWidth: Math.round(cssWidth * devicePixelRatio),
    backingHeight: Math.round(cssHeight * devicePixelRatio),
    devicePixelRatio,
    cssGeometryChangesWithDpr: false,
    landmarkCount: TRANSFORMED_LANDMARK_COUNT,
    socketCount: TRANSFORMED_SOCKET_COUNT,
  };
}

/**
 * Selects console geometry in the logical coordinate space of the shared
 * 1200x600 game stage. Desktop composition is retained at full stage size;
 * a reduced stage uses the compact arrangement with larger physical copy.
 */
export function projectBattleConsoleLayoutForViewport({
  viewportWidth,
  viewportHeight,
  stageViewportWidth = viewportWidth,
  devicePixelRatio,
  coarsePointer,
}: BattleConsoleViewportProjectionRequest): ResponsiveLayoutProjection {
  for (const [name, value] of Object.entries({ viewportWidth, viewportHeight, stageViewportWidth })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
  }
  const stageScale = Math.min(stageViewportWidth / 1200, viewportHeight / 600, 2);
  const logicalWidth = viewportWidth / stageScale;
  // Desktop labels are authored for a full-size stage. Before any stage reduction,
  // switch to the 26px compact copy rather than shrinking desktop labels further.
  const mode: BattleConsoleLayoutMode = coarsePointer || stageScale < 1 || logicalWidth <= 960
    ? 'compact'
    : logicalWidth < 1388
      ? 'standard'
      : 'wide';
  return projectResponsiveLayout(mode, devicePixelRatio);
}
