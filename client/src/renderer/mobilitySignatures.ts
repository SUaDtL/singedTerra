import {
  MAX_MOVE_DELTA,
  MAX_MOVE_SURFACE_STEP,
} from '@shared/engine/Movement';
import type { TankKitId } from '@shared/types/TankLoadout';

export interface MobilityPoseSample {
  readonly tankId: string;
  readonly round: number;
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
  readonly buried: boolean;
  readonly kit: TankKitId;
  readonly color: string;
}

export interface MobilitySignatureEvent {
  readonly tankId: string;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly direction: -1 | 1;
  readonly kit: TankKitId;
  readonly color: string;
}

export interface MobilitySignatureProfile {
  readonly motif: 'tread' | 'stride' | 'hover' | 'wheel';
  readonly accent: string;
  readonly lifeFrames: number;
  readonly markCount: number;
  readonly trailLength: number;
  readonly lift: number;
}

export const MOBILITY_SIGNATURE_PROFILES: Readonly<Record<TankKitId, MobilitySignatureProfile>> = {
  foundry: { motif: 'tread', accent: '#d6a15f', lifeFrames: 24, markCount: 5, trailLength: 24, lift: 4 },
  ranger: { motif: 'stride', accent: '#c68cff', lifeFrames: 22, markCount: 4, trailLength: 20, lift: 8 },
  bulwark: { motif: 'hover', accent: '#6ee7ff', lifeFrames: 28, markCount: 6, trailLength: 30, lift: 10 },
  jackal: { motif: 'wheel', accent: '#ffc857', lifeFrames: 20, markCount: 4, trailLength: 26, lift: 6 },
};

/**
 * Admit only one legal-looking, same-round fuel move to presentation. The
 * authoritative movement state remains untouched; rejected observations simply
 * establish a fresh renderer baseline.
 */
export function observeMobilitySignature(
  previous: MobilityPoseSample | null | undefined,
  current: MobilityPoseSample,
): MobilitySignatureEvent | null {
  if (
    previous == null
    || previous.tankId !== current.tankId
    || previous.round !== current.round
    || !previous.alive
    || previous.buried
    || !current.alive
    || current.buried
    || !hasFinitePosition(previous)
    || !hasFinitePosition(current)
  ) {
    return null;
  }

  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  if (
    !Number.isInteger(dx)
    || dx === 0
    || Math.abs(dx) > MAX_MOVE_DELTA
    || Math.abs(dy) > MAX_MOVE_SURFACE_STEP * Math.abs(dx)
  ) {
    return null;
  }

  return Object.freeze({
    tankId: current.tankId,
    x: current.x,
    y: current.y,
    dx,
    direction: dx > 0 ? 1 : -1,
    kit: current.kit,
    color: current.color,
  });
}

/** Return a renderer-safe lifecycle progress value in the inclusive [0, 1] range. */
export function mobilitySignatureProgress(age: number, lifeFrames: number): number {
  if (!Number.isFinite(lifeFrames) || lifeFrames <= 0 || !Number.isFinite(age)) return 1;
  return Math.min(1, Math.max(0, age / lifeFrames));
}

/** A burst is drawable only for finite, non-negative ages before its finite lifetime. */
export function isMobilitySignatureAlive(age: number, lifeFrames: number): boolean {
  return Number.isFinite(age)
    && age >= 0
    && Number.isFinite(lifeFrames)
    && lifeFrames > 0
    && age < lifeFrames;
}

function hasFinitePosition(sample: MobilityPoseSample): boolean {
  return Number.isFinite(sample.x) && Number.isFinite(sample.y);
}
