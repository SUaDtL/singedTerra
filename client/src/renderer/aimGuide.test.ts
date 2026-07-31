import { describe, expect, it } from 'vitest';
import type { GameState, TankState } from '@shared/types/GameState';
import { BARREL_LENGTH, barrelTip } from '@shared/engine/Tank';
import { launchVelocity, stepProjectile } from '@shared/engine/Physics';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import {
  AIM_GUIDE_TICKS,
  buildLaunchGuide,
  getAimGuideMode,
} from './aimGuide';

function tank(overrides: Partial<TankState> = {}): TankState {
  return {
    id: 'p1',
    playerName: 'P1',
    color: '#ef4444',
    x: 120,
    y: 420,
    angle: 45,
    power: 50,
    health: 100,
    alive: true,
    selectedWeapon: 'baby_missile',
    ...overrides,
  } as TankState;
}

function gameState(
  me: TankState,
  overrides: Partial<GameState> = {},
): GameState {
  return {
    phase: 'PLAYER_TURN',
    turn: 0,
    activePlayerId: me.id,
    wind: 0,
    terrain: new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT),
    terrainVersion: 0,
    tanks: [
      me,
      tank({
        id: 'p2',
        playerName: 'P2',
        color: '#3b82f6',
        x: 1080,
        angle: 135,
      }),
    ],
    walls: 'open',
    projectiles: [],
    explosions: [],
    ...overrides,
  } as GameState;
}

function pathLength(points: ReadonlyArray<{ x: number; y: number }>): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.y - points[index - 1]!.y,
    );
  }
  return length;
}

describe('skill-preserving honest ballistic aim guide', () => {
  it.each([
    { label: 'left wind at normal gravity', wind: -6, gravity: 0.15 },
    { label: 'calm wind at normal gravity', wind: 0, gravity: 0.15 },
    { label: 'right wind at normal gravity', wind: 6, gravity: 0.15 },
    { label: 'calm wind at sudden-death gravity', wind: 0, gravity: 0.45 },
  ])(
    'leaves the exact muzzle tangentially and matches every shared physics tick: $label',
    ({ wind, gravity }) => {
      const me = tank({ angle: 45, power: 40 });
      const state = gameState(me, { wind });
      const points = buildLaunchGuide(state, me, gravity);
      const tip = barrelTip(me, BARREL_LENGTH);
      const velocity = launchVelocity(me.angle, me.power);
      const speed = Math.hypot(velocity.vx, velocity.vy);

      expect(points).toHaveLength(AIM_GUIDE_TICKS + 2);
      expect(points[0]).toEqual(tip);

      const opening = points[1]!;
      const openingDx = opening.x - tip.x;
      const openingDy = opening.y - tip.y;
      expect(Math.abs(openingDx * velocity.vy - openingDy * velocity.vx))
        .toBeLessThan(1e-8);
      expect((openingDx * velocity.vx + openingDy * velocity.vy) / speed)
        .toBeGreaterThan(0);

      const projectile = {
        ...tip,
        ...velocity,
        weaponType: me.selectedWeapon,
        age: 0,
        hasSplit: false,
        bounces: 0,
      };
      for (let tick = 1; tick <= AIM_GUIDE_TICKS; tick++) {
        stepProjectile(projectile, state.wind, gravity);
        expect(points[tick + 1]!.x).toBeCloseTo(projectile.x, 10);
        expect(points[tick + 1]!.y).toBeCloseTo(projectile.y, 10);
      }
    },
  );

  it('curves with live wind and effective gravity instead of a decorative bend', () => {
    const me = tank({ angle: 60, power: 40 });
    const leftWind = buildLaunchGuide(gameState(me, { wind: -6 }), me, 0.15);
    const rightWind = buildLaunchGuide(gameState(me, { wind: 6 }), me, 0.15);
    const heavyGravity = buildLaunchGuide(gameState(me), me, 0.45);

    expect(rightWind.at(-1)!.x).toBeGreaterThan(leftWind.at(-1)!.x);
    expect(heavyGravity.at(-1)!.y).toBeGreaterThan(rightWind.at(-1)!.y);

    const tip = barrelTip(me, BARREL_LENGTH);
    const radians = me.angle * Math.PI / 180;
    const aim = { x: Math.cos(radians), y: -Math.sin(radians) };
    const final = rightWind.at(-1)!;
    const cross = (final.x - tip.x) * aim.y - (final.y - tip.y) * aim.x;
    expect(Math.abs(cross)).toBeGreaterThan(1);
  });

  it('uses the same bounded launch hint on the opening turn and later turns', () => {
    const me = tank();
    const opening = { phase: 'PLAYER_TURN', turn: 0 } as GameState;
    const later = { ...opening, turn: 12 };

    expect(getAimGuideMode(opening, me, true, true)).toBe('launch');
    expect(getAimGuideMode(later, me, true, true)).toBe('launch');
  });

  it('shows no ballistic fiction for the non-projectile Shield action', () => {
    const shielding = tank({ selectedWeapon: 'shield' });
    const turn = gameState(shielding);

    expect(getAimGuideMode(turn, shielding, true, true)).toBe('none');
    expect(buildLaunchGuide(turn, shielding, 0.15)).toEqual([]);
  });

  it('caps high-power arc length at the legacy guide reach', () => {
    const me = tank({ power: 100 });
    const points = buildLaunchGuide(gameState(me), me, 0.15);
    const legacyReach = 48 + Math.sqrt(me.power / 100) * 78;

    expect(points.length).toBeLessThanOrEqual(AIM_GUIDE_TICKS + 2);
    expect(pathLength(points)).toBeCloseTo(legacyReach, 6);
  });

  it('ends at the first real contact when a very short shot lands inside the hint', () => {
    const me = tank({ angle: 0, power: 30 });
    const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    const surfaceY = 405;
    for (let y = surfaceY; y < CANVAS_HEIGHT; y++) {
      terrain.fill(1, y * CANVAS_WIDTH, (y + 1) * CANVAS_WIDTH);
    }
    const points = buildLaunchGuide(gameState(me, { terrain }), me, 0.3);

    expect(points.length).toBeLessThan(AIM_GUIDE_TICKS + 2);
    expect(points.at(-1)!.y).toBeGreaterThanOrEqual(surfaceY);
    expect(points.at(-1)!.y).toBeLessThan(surfaceY + 1);
  });

  it('never lets the synthetic muzzle tangent overrun an immediate contact', () => {
    const me = tank({ angle: 0, power: 100 });
    const tip = barrelTip(me, BARREL_LENGTH);
    const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    terrain[Math.floor(tip.y) * CANVAS_WIDTH + Math.floor(tip.x + 1)] = 1;

    const points = buildLaunchGuide(gameState(me, { terrain }), me, 0.15);
    const endpoint = points.at(-1)!;

    expect(pathLength(points)).toBeLessThan(4);
    expect(Math.max(...points.map((point) => point.x))).toBe(endpoint.x);
  });

  it('ends at a swept tank or reflective-wall contact without predicting beyond it', () => {
    const me = tank({ angle: 0, power: 60 });
    const target = tank({
      id: 'p2',
      playerName: 'P2',
      color: '#3b82f6',
      x: 190,
      y: 412,
      angle: 135,
    });
    const tankHit = buildLaunchGuide(gameState(me, { tanks: [me, target] }), me, 0.15);
    expect(tankHit.length).toBeLessThan(AIM_GUIDE_TICKS + 2);
    expect(tankHit.at(-1)!.x).toBeLessThanOrEqual(target.x);

    const railTank = tank({ x: 1150, angle: 0, power: 100 });
    const rail = buildLaunchGuide(gameState(railTank, {
      tanks: [railTank, target],
      walls: 'reflective',
    }), railTank, 0.15);
    expect(rail.length).toBeLessThan(AIM_GUIDE_TICKS + 2);
    expect(rail.at(-1)!.x).toBeLessThan(CANVAS_WIDTH);
    expect(rail.at(-1)!.x).toBeGreaterThan(CANVAS_WIDTH - 2);
  });

  it('ends an honest wrap guide at the first portal instead of revealing its destination', () => {
    const portalTank = tank({ x: 1150, angle: 0, power: 100 });
    const points = buildLaunchGuide(gameState(portalTank, {
      tanks: [portalTank],
      walls: 'wrap',
    }), portalTank, 0.15);
    const endpoint = points.at(-1)!;

    expect(points.length).toBeLessThan(AIM_GUIDE_TICKS + 2);
    expect(endpoint.x).toBeGreaterThan(CANVAS_WIDTH - 2);
    expect(endpoint.x).toBeLessThan(CANVAS_WIDTH);
    expect(Math.max(...points.map((point) => point.x))).toBe(endpoint.x);
  });

  it('fails closed for hidden, inactive, or invalid guidance', () => {
    const me = tank();
    const turn = { phase: 'PLAYER_TURN', turn: 0 } as GameState;

    expect(getAimGuideMode(turn, me, false, true)).toBe('none');
    expect(getAimGuideMode(turn, me, true, false)).toBe('none');
    expect(getAimGuideMode({ ...turn, phase: 'FIRING' }, me, true, true)).toBe('none');
    expect(getAimGuideMode(turn, { ...me, alive: false }, true, true)).toBe('none');
    expect(buildLaunchGuide(
      gameState(me),
      { ...me, power: Number.NaN },
      0.15,
    )).toEqual([]);
  });
});
