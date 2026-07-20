import type { AiDifficulty, GameState, ProjectileState, TankState } from '../types/GameState';
import { launchVelocity, stepProjectile, sweepCollide } from './Physics';
import { BARREL_LENGTH, TANK_HEIGHT, TANK_WIDTH, barrelTip } from './Tank';
import { clamp } from './math';

const SIM_MAX_TICKS = 1600;
/** A center-to-impact distance within half the tank's smaller dimension is a
 * reachable direct hit while still requiring contact-quality aim. */
const DIRECT_HIT_SCORE = Math.min(TANK_WIDTH, TANK_HEIGHT) / 2;

interface ShotSearchProfile {
  angleStep: number;
  powerStep: number;
  coarseAngleStep: number;
  coarsePowerStep: number;
  basinCount: number;
  refinementRadius: number;
}

export interface ShotCandidate {
  angle: number;
  power: number;
  score: number;
}

export interface ShotSearchOutcome {
  shot: ShotCandidate | null;
  probes: number;
}

const SHOT_SEARCH_PROFILES: Readonly<Record<AiDifficulty, ShotSearchProfile>> = {
  easy: { angleStep: 3, powerStep: 4, coarseAngleStep: 12, coarsePowerStep: 16, basinCount: 3, refinementRadius: 3 },
  medium: { angleStep: 2, powerStep: 2, coarseAngleStep: 10, coarsePowerStep: 10, basinCount: 3, refinementRadius: 3 },
  hard: { angleStep: 1, powerStep: 1, coarseAngleStep: 8, coarsePowerStep: 8, basinCount: 3, refinementRadius: 3 },
};

type ShotProbe = (
  state: GameState,
  me: TankState,
  angle: number,
  power: number,
  gravity: number,
) => { x: number; y: number } | null;

function axisValues(lo: number, hi: number, step: number): number[] {
  const values: number[] = [];
  for (let value = lo; value <= hi; value += step) values.push(value);
  if (values[values.length - 1] !== hi) values.push(hi);
  return values;
}

function compareCandidate(a: ShotCandidate, b: ShotCandidate): number {
  return a.score - b.score || a.angle - b.angle || a.power - b.power;
}

function distinctBasins(candidates: ShotCandidate[], profile: ShotSearchProfile): ShotCandidate[] {
  const basins: ShotCandidate[] = [];
  for (const candidate of candidates) {
    const overlaps = basins.some((basin) =>
      Math.abs(candidate.angle - basin.angle) <= profile.coarseAngleStep &&
      Math.abs(candidate.power - basin.power) <= profile.coarsePowerStep);
    if (!overlaps) basins.push(candidate);
    if (basins.length === profile.basinCount) break;
  }
  return basins;
}

export function searchShot(
  state: GameState,
  me: TankState,
  target: TankState,
  difficulty: AiDifficulty,
  gravity: number,
  probe: ShotProbe = simulateImpact,
): ShotSearchOutcome {
  const profile = SHOT_SEARCH_PROFILES[difficulty];
  const rightward = target.x >= me.x;
  const angleLo = rightward ? 5 : 90;
  const angleHi = rightward ? 90 : 175;
  const tx = target.x;
  const ty = target.y - TANK_HEIGHT / 2;
  const visited = new Set<string>();
  let probes = 0;

  const evaluate = (angle: number, power: number): ShotCandidate | null => {
    const key = `${angle}:${power}`;
    if (visited.has(key)) return null;
    visited.add(key);
    probes++;
    const impact = probe(state, me, angle, power, gravity);
    return impact ? { angle, power, score: Math.hypot(impact.x - tx, impact.y - ty) } : null;
  };

  const coarse: ShotCandidate[] = [];
  for (const angle of axisValues(angleLo, angleHi, profile.coarseAngleStep)) {
    for (const power of axisValues(20, 100, profile.coarsePowerStep)) {
      const candidate = evaluate(angle, power);
      if (candidate) coarse.push(candidate);
    }
  }
  coarse.sort(compareCandidate);
  let best = coarse[0] ?? null;

  for (const basin of distinctBasins(coarse, profile)) {
    for (let da = -profile.refinementRadius; da <= profile.refinementRadius; da++) {
      for (let dp = -profile.refinementRadius; dp <= profile.refinementRadius; dp++) {
        const angle = clamp(basin.angle + da * profile.angleStep, angleLo, angleHi);
        const power = clamp(basin.power + dp * profile.powerStep, 20, 100);
        const candidate = evaluate(angle, power);
        if (candidate && (!best || compareCandidate(candidate, best) < 0)) best = candidate;
      }
    }
    if (best && best.score <= DIRECT_HIT_SCORE) break;
  }
  return { shot: best, probes };
}

export function simulateImpact(
  state: GameState,
  me: TankState,
  angle: number,
  power: number,
  gravity: number,
): { x: number; y: number } | null {
  const velocity = launchVelocity(angle, power);
  const tip = barrelTip({ ...me, angle }, BARREL_LENGTH);
  const projectile: ProjectileState = {
    x: tip.x,
    y: tip.y,
    vx: velocity.vx,
    vy: velocity.vy,
    weaponType: 'missile',
    age: 0,
    hasSplit: true,
    bounces: 0,
  };
  for (let tick = 0; tick < SIM_MAX_TICKS; tick++) {
    const previousX = projectile.x;
    const previousY = projectile.y;
    stepProjectile(projectile, state.wind, gravity);
    const hit = sweepCollide(projectile, previousX, previousY, state.terrain, state.tanks);
    if (hit.type === 'ground' || hit.type === 'tank') return { x: projectile.x, y: projectile.y };
    if (hit.type === 'oob') return null;
  }
  return null;
}
