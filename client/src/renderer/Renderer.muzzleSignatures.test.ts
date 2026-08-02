import { describe, expect, it, vi } from 'vitest';
import { BARREL_LENGTH, barrelTip } from '@shared/engine/Tank';
import type { GameState, ProjectileState, TankState } from '@shared/types/GameState';
import { Renderer } from './Renderer';
import { getMuzzleVisualProfile } from './muzzleVisuals';

interface MuzzleSeam {
  effectsBusy: number;
  effects: { spawnMuzzle: ReturnType<typeof vi.fn> };
  spawnMuzzleFlash(state: GameState): void;
}

function tank(): TankState {
  return {
    id: 'p1',
    x: 240,
    y: 410,
    angle: 42,
    color: '#00ffcc',
  } as TankState;
}

function projectile(weaponType: ProjectileState['weaponType']): ProjectileState {
  return {
    x: 250,
    y: 390,
    vx: 4,
    vy: -2,
    weaponType,
    age: 0,
    hasSplit: false,
    bounces: 0,
  };
}

function state(projectiles: ProjectileState[], tanks = [tank()]): GameState {
  return {
    activePlayerId: 'p1',
    tanks,
    projectiles,
    projectile: projectiles[0] ?? null,
  } as unknown as GameState;
}

function seam(): MuzzleSeam {
  const renderer = Object.create(Renderer.prototype) as MuzzleSeam;
  renderer.effectsBusy = 0;
  renderer.effects = { spawnMuzzle: vi.fn() };
  return renderer;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe('Renderer weapon-signature muzzle launch seam', () => {
  it('uses shared barrel-tip geometry and the first live projectile weapon profile', () => {
    const renderer = seam();
    const shooter = tank();
    const frame = state([
      projectile('funky_bomb'),
      projectile('baby_missile'),
    ], [shooter]);
    const tip = barrelTip(shooter, BARREL_LENGTH);

    renderer.spawnMuzzleFlash(frame);

    expect(renderer.effects.spawnMuzzle).toHaveBeenCalledWith(
      tip.x,
      tip.y,
      shooter.angle,
      getMuzzleVisualProfile('funky_bomb'),
    );
    expect(renderer.effectsBusy).toBeGreaterThan(0);
  });

  it('falls back to the bounded baseline when firing state has no projectile', () => {
    const renderer = seam();
    renderer.spawnMuzzleFlash(state([]));

    expect(required(renderer.effects.spawnMuzzle.mock.calls[0], 'baseline muzzle call')[3])
      .toEqual(getMuzzleVisualProfile('baby_missile'));
  });

  it('does no work when the active shooter is absent', () => {
    const renderer = seam();
    renderer.spawnMuzzleFlash(state([projectile('nuke')], []));

    expect(renderer.effects.spawnMuzzle).not.toHaveBeenCalled();
    expect(renderer.effectsBusy).toBe(0);
  });
});
