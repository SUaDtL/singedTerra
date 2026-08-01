import { describe, expect, it } from 'vitest';
import {
  MOBILITY_SIGNATURE_PROFILES,
  isMobilitySignatureAlive,
  mobilitySignatureProgress,
  observeMobilitySignature,
  type MobilityPoseSample,
} from './mobilitySignatures';

const basePose: MobilityPoseSample = {
  tankId: 'tank-1',
  round: 1,
  x: 100,
  y: 220,
  alive: true,
  buried: false,
  kit: 'foundry',
  color: '#123456',
};

describe('observeMobilitySignature', () => {
  it('uses a first sample only as a baseline', () => {
    expect(observeMobilitySignature(null, basePose)).toBeNull();
  });

  it('does not emit for an unchanged horizontal position', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, y: 223 })).toBeNull();
  });

  it('emits the current endpoint for a legal positive move', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, x: 104, y: 224, kit: 'ranger' }))
      .toEqual({
        tankId: 'tank-1', x: 104, y: 224, dx: 4, direction: 1, kit: 'ranger', color: '#123456',
      });
  });

  it('emits a negative direction for a legal negative move', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, x: 96, y: 216, kit: 'jackal' }))
      .toMatchObject({ dx: -4, direction: -1, kit: 'jackal' });
  });

  it('admits the maximum legal horizontal delta', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, x: 108, y: 252 }))
      .toMatchObject({ dx: 8, direction: 1 });
  });

  it('silently rebases an oversized movement jump', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, x: 109 })).toBeNull();
  });

  it('rejects an implausible surface step paired with a legal horizontal delta', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, x: 102, y: 229 })).toBeNull();
  });

  it('silently rebases on a round change', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, round: 2, x: 104 })).toBeNull();
  });

  it('rejects dead or buried endpoints and baselines', () => {
    expect(observeMobilitySignature(basePose, { ...basePose, x: 104, alive: false })).toBeNull();
    expect(observeMobilitySignature({ ...basePose, buried: true }, { ...basePose, x: 104 })).toBeNull();
  });
});

describe('MOBILITY_SIGNATURE_PROFILES', () => {
  it.each([
    ['foundry', 'tread', '#d6a15f', 24, 5, 24, 4],
    ['ranger', 'stride', '#c68cff', 22, 4, 20, 8],
    ['bulwark', 'hover', '#6ee7ff', 28, 6, 30, 10],
    ['jackal', 'wheel', '#ffc857', 20, 4, 26, 6],
  ] as const)('provides the %s mobility profile', (kit, motif, accent, lifeFrames, markCount, trailLength, lift) => {
    expect(MOBILITY_SIGNATURE_PROFILES[kit]).toEqual({
      motif, accent, lifeFrames, markCount, trailLength, lift,
    });
  });
});

describe('mobility signature lifecycle helpers', () => {
  it('clamps drawing progress to its finite lifetime', () => {
    expect(mobilitySignatureProgress(-3, 20)).toBe(0);
    expect(mobilitySignatureProgress(5, 20)).toBe(0.25);
    expect(mobilitySignatureProgress(30, 20)).toBe(1);
    expect(mobilitySignatureProgress(5, 0)).toBe(1);
  });

  it('keeps effects alive only within a finite positive lifetime', () => {
    expect(isMobilitySignatureAlive(0, 20)).toBe(true);
    expect(isMobilitySignatureAlive(19, 20)).toBe(true);
    expect(isMobilitySignatureAlive(20, 20)).toBe(false);
    expect(isMobilitySignatureAlive(-1, 20)).toBe(false);
    expect(isMobilitySignatureAlive(1, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
