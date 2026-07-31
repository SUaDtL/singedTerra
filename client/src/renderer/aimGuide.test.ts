import { describe, expect, it } from 'vitest';
import type { GameState, TankState } from '@shared/types/GameState';
import { BARREL_LENGTH, barrelTip } from '@shared/engine/Tank';
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

describe('skill-preserving aim guide', () => {
  it.each([
    { angle: 20, power: 10 },
    { angle: 45, power: 50 },
    { angle: 90, power: 100 },
    { angle: 135, power: 72 },
    { angle: 160, power: 25 },
  ])(
    'keeps every guide sample coaxial with the authored muzzle at $angle°/$power',
    ({ angle, power }) => {
      const me = tank({ angle, power });
      const points = buildLaunchGuide(me);
      const tip = barrelTip(me, BARREL_LENGTH);
      const radians = angle * Math.PI / 180;
      const aim = { x: Math.cos(radians), y: -Math.sin(radians) };

      expect(points[0]).toEqual(tip);
      for (const point of points.slice(1)) {
        const dx = point.x - tip.x;
        const dy = point.y - tip.y;
        const cross = dx * aim.y - dy * aim.x;
        const forward = dx * aim.x + dy * aim.y;
        expect(Math.abs(cross)).toBeLessThan(1e-8);
        expect(forward).toBeGreaterThan(0);
      }
    },
  );

  it('uses the same bounded launch hint on the opening turn and later turns', () => {
    const me = tank();
    const opening = { phase: 'PLAYER_TURN', turn: 0 } as GameState;
    const later = { ...opening, turn: 12 };

    expect(getAimGuideMode(opening, me, true, true)).toBe('launch');
    expect(getAimGuideMode(later, me, true, true)).toBe('launch');
  });

  it('never exposes a complete trajectory or impact point', () => {
    const me = tank({ power: 100 });
    const points = buildLaunchGuide(me);
    const tip = barrelTip(me, BARREL_LENGTH);

    expect(points).toHaveLength(AIM_GUIDE_TICKS);
    expect(points[0]).toEqual(tip);
    expect(Math.hypot(
      points[1]!.x - points[0]!.x,
      points[1]!.y - points[0]!.y,
    )).toBeLessThan(5);
    expect(Math.hypot(
      points.at(-1)!.x - tip.x,
      points.at(-1)!.y - tip.y,
    )).toBeLessThan(260);
  });

  it('changes only bounded cue length with power', () => {
    const low = buildLaunchGuide(tank({ angle: 45, power: 10 }));
    const high = buildLaunchGuide(tank({ angle: 45, power: 100 }));

    expect(low).toHaveLength(AIM_GUIDE_TICKS);
    expect(high).toHaveLength(AIM_GUIDE_TICKS);
    expect(Math.hypot(
      high.at(-1)!.x - high[0]!.x,
      high.at(-1)!.y - high[0]!.y,
    )).toBeGreaterThan(Math.hypot(
      low.at(-1)!.x - low[0]!.x,
      low.at(-1)!.y - low[0]!.y,
    ));
  });

  it('fails closed for hidden, inactive, or invalid guidance', () => {
    const me = tank();
    const turn = { phase: 'PLAYER_TURN', turn: 0 } as GameState;

    expect(getAimGuideMode(turn, me, false, true)).toBe('none');
    expect(getAimGuideMode(turn, me, true, false)).toBe('none');
    expect(getAimGuideMode({ ...turn, phase: 'FIRING' }, me, true, true)).toBe('none');
    expect(getAimGuideMode(turn, { ...me, alive: false }, true, true)).toBe('none');
    expect(buildLaunchGuide({ ...me, power: Number.NaN })).toEqual([]);
  });
});
