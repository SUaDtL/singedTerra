import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import type { ImpactLearningCue } from './impactLearning';

export const IMPACT_MONITOR_SOURCE_WIDTH = 144;
export const IMPACT_MONITOR_SOURCE_HEIGHT = 88;
export const IMPACT_MONITOR_CONTENT_WIDTH = 198;
export const IMPACT_MONITOR_CONTENT_HEIGHT = 121;
export const IMPACT_MONITOR_FRAME_WIDTH = 220;
export const IMPACT_MONITOR_FRAME_HEIGHT = 136;
export const IMPACT_MONITOR_TOP = 18;
export const IMPACT_MONITOR_COMPACT_SCALE_THRESHOLD = 0.8;
export const IMPACT_MONITOR_MAX_COMPACT_SCALE = 1.8;

const FRAME_INSET_X = 11;
const FRAME_INSET_Y = 7;

export interface ImpactLearningCueContext {
  readonly shooterId: string;
  readonly round: number;
  readonly turn: number;
  readonly explosionId: number;
}

export interface ImpactMonitorFocus {
  readonly cx: number;
  readonly cy: number;
  readonly reachRadius: number;
  readonly age: number;
  readonly lifeFrames: number;
  readonly cue?: ImpactLearningCue | null;
  readonly learningContext?: ImpactLearningCueContext;
}

export interface ImpactMonitorCandidate {
  readonly cx: number;
  readonly cy: number;
  readonly age: number;
  readonly lifeFrames: number;
  readonly reachRadius?: number;
  readonly visual?: { readonly reachRadius: number };
  readonly cue?: ImpactLearningCue | null;
  readonly learningContext?: ImpactLearningCueContext;
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
      ...(burst.cue !== undefined ? { cue: burst.cue } : {}),
      ...(burst.learningContext !== undefined ? { learningContext: burst.learningContext } : {}),
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

function presentationMonitorScale(viewportScale: number): number {
  if (
    !Number.isFinite(viewportScale)
    || viewportScale <= 0
    || viewportScale >= IMPACT_MONITOR_COMPACT_SCALE_THRESHOLD
  ) {
    return 1;
  }
  return Math.min(1 / viewportScale, IMPACT_MONITOR_MAX_COMPACT_SCALE);
}

export function getImpactMonitorGeometry(
  focus: ImpactMonitorFocus,
  worldOffset: Readonly<ImpactMonitorOffset>,
  viewportScale = 1,
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

  const monitorScale = presentationMonitorScale(viewportScale);
  const sourceWidth = IMPACT_MONITOR_SOURCE_WIDTH * monitorScale;
  const sourceHeight = IMPACT_MONITOR_SOURCE_HEIGHT * monitorScale;
  const frameWidth = IMPACT_MONITOR_FRAME_WIDTH * monitorScale;
  const frameHeight = IMPACT_MONITOR_FRAME_HEIGHT * monitorScale;
  const frameTop = IMPACT_MONITOR_TOP * monitorScale;
  const frameX = (CANVAS_WIDTH - frameWidth) / 2;

  return {
    focus: { x: focusX, y: focusY },
    source: {
      x: clamp(
        focusX - sourceWidth / 2,
        0,
        CANVAS_WIDTH - sourceWidth,
      ),
      y: clamp(
        focusY - sourceHeight / 2,
        0,
        CANVAS_HEIGHT - sourceHeight,
      ),
      width: sourceWidth,
      height: sourceHeight,
    },
    content: {
      x: frameX + FRAME_INSET_X * monitorScale,
      y: frameTop + FRAME_INSET_Y * monitorScale,
      width: IMPACT_MONITOR_CONTENT_WIDTH * monitorScale,
      height: IMPACT_MONITOR_CONTENT_HEIGHT * monitorScale,
    },
    frame: {
      x: frameX,
      y: frameTop,
      width: frameWidth,
      height: frameHeight,
    },
  };
}
