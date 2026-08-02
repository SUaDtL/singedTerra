import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';

export const IMPACT_MONITOR_SOURCE_WIDTH = 144;
export const IMPACT_MONITOR_SOURCE_HEIGHT = 88;
export const IMPACT_MONITOR_CONTENT_WIDTH = 198;
export const IMPACT_MONITOR_CONTENT_HEIGHT = 121;
export const IMPACT_MONITOR_FRAME_WIDTH = 220;
export const IMPACT_MONITOR_FRAME_HEIGHT = 136;
export const IMPACT_MONITOR_TOP = 18;

const FRAME_X = (CANVAS_WIDTH - IMPACT_MONITOR_FRAME_WIDTH) / 2;
const CONTENT_X = FRAME_X + 11;
const CONTENT_Y = IMPACT_MONITOR_TOP + 7;

export interface ImpactMonitorFocus {
  readonly cx: number;
  readonly cy: number;
  readonly reachRadius: number;
  readonly age: number;
  readonly lifeFrames: number;
}

export interface ImpactMonitorCandidate {
  readonly cx: number;
  readonly cy: number;
  readonly age: number;
  readonly lifeFrames: number;
  readonly reachRadius?: number;
  readonly visual?: { readonly reachRadius: number };
}

export interface ImpactMonitorOffset {
  readonly x: number;
  readonly y: number;
}

export interface ImpactMonitorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ImpactMonitorGeometry {
  readonly focus: Readonly<ImpactMonitorOffset>;
  readonly source: Readonly<ImpactMonitorRect>;
  readonly content: Readonly<ImpactMonitorRect>;
  readonly frame: Readonly<ImpactMonitorRect>;
}

function isLiveFocus(focus: ImpactMonitorFocus): boolean {
  return Number.isFinite(focus.cx)
    && Number.isFinite(focus.cy)
    && Number.isFinite(focus.reachRadius)
    && focus.reachRadius > 0
    && Number.isFinite(focus.age)
    && focus.age >= 0
    && Number.isFinite(focus.lifeFrames)
    && focus.lifeFrames > 0
    && focus.age < focus.lifeFrames;
}

export function selectImpactMonitorFocus(
  bursts: readonly ImpactMonitorCandidate[],
): ImpactMonitorFocus | null {
  let selected: ImpactMonitorFocus | null = null;

  for (const burst of bursts) {
    const candidate: ImpactMonitorFocus = {
      cx: burst.cx,
      cy: burst.cy,
      reachRadius: burst.reachRadius ?? burst.visual?.reachRadius ?? Number.NaN,
      age: burst.age,
      lifeFrames: burst.lifeFrames,
    };
    if (!isLiveFocus(candidate)) continue;
    if (
      selected === null
      || candidate.reachRadius > selected.reachRadius
      || (
        candidate.reachRadius === selected.reachRadius
        && candidate.age <= selected.age
      )
    ) {
      selected = candidate;
    }
  }

  return selected;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getImpactMonitorGeometry(
  focus: ImpactMonitorFocus,
  worldOffset: Readonly<ImpactMonitorOffset>,
): ImpactMonitorGeometry | null {
  if (
    !isLiveFocus(focus)
    || !Number.isFinite(worldOffset.x)
    || !Number.isFinite(worldOffset.y)
  ) {
    return null;
  }

  const focusX = focus.cx + worldOffset.x;
  const focusY = focus.cy + worldOffset.y;
  if (!Number.isFinite(focusX) || !Number.isFinite(focusY)) return null;

  return {
    focus: { x: focusX, y: focusY },
    source: {
      x: clamp(
        focusX - IMPACT_MONITOR_SOURCE_WIDTH / 2,
        0,
        CANVAS_WIDTH - IMPACT_MONITOR_SOURCE_WIDTH,
      ),
      y: clamp(
        focusY - IMPACT_MONITOR_SOURCE_HEIGHT / 2,
        0,
        CANVAS_HEIGHT - IMPACT_MONITOR_SOURCE_HEIGHT,
      ),
      width: IMPACT_MONITOR_SOURCE_WIDTH,
      height: IMPACT_MONITOR_SOURCE_HEIGHT,
    },
    content: {
      x: CONTENT_X,
      y: CONTENT_Y,
      width: IMPACT_MONITOR_CONTENT_WIDTH,
      height: IMPACT_MONITOR_CONTENT_HEIGHT,
    },
    frame: {
      x: FRAME_X,
      y: IMPACT_MONITOR_TOP,
      width: IMPACT_MONITOR_FRAME_WIDTH,
      height: IMPACT_MONITOR_FRAME_HEIGHT,
    },
  };
}
