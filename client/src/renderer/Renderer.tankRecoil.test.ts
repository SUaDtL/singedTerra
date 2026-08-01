import { describe, expect, it, vi } from 'vitest';
import { BARREL_LENGTH, barrelTip } from '@shared/engine/Tank';
import type { GameState, ProjectileState, TankState } from '@shared/types/GameState';
import { Renderer } from './Renderer';
import {
  TankRenderer,
  type TankRenderPose,
} from './TankRenderer';
import { TANK_RECOIL_FRAMES } from './tankRecoil';

interface RecoilRecord {
  tankId: string;
  angle: number;
  launchWeight: number;
  round: number;
  age: number;
}

interface RecoilSeam {
  reduceMotion: boolean;
  effectsBusy: number;
  wasFiring: boolean;
  tankRecoil: RecoilRecord | null;
  bursts: unknown[];
  scorches: unknown[];
  shake: number;
  kickX: number;
  kickY: number;
  prevMobilityPoses: Map<string, unknown>;
  effects: {
    spawnMuzzle: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
  };
  projectile: {
    clear: ReturnType<typeof vi.fn>;
    drawGroundShadows: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
  };
  terrain: {
    markDirty: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
  };
  tanks: {
    drawAll: ReturnType<typeof vi.fn>;
    drawBuriedMarker: ReturnType<typeof vi.fn>;
  };
  hud: { draw: ReturnType<typeof vi.fn> };
  ctx: {
    save: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
  };
  events: null;
  consumeExplosion: ReturnType<typeof vi.fn>;
  trackDamage: ReturnType<typeof vi.fn>;
  drawSky: ReturnType<typeof vi.fn>;
  drawShields: ReturnType<typeof vi.fn>;
  drawFire: ReturnType<typeof vi.fn>;
  drawExplosions: ReturnType<typeof vi.fn>;
  drawFlash: ReturnType<typeof vi.fn>;
  drawScorches: ReturnType<typeof vi.fn>;
  showAimGuide: boolean;
  aimGuideEnabled: boolean;
  spawnMuzzleFlash(state: GameState): void;
  currentTankRecoilPose(
    state: GameState,
    tanks: readonly TankState[],
  ): TankRenderPose | undefined;
  advanceTankRecoil(): void;
  isAnimating(state: GameState): boolean;
  reset(): void;
  render(state: GameState): void;
}

function tank(overrides: Partial<TankState> = {}): TankState {
  return {
    id: 'p1',
    x: 240,
    y: 410,
    angle: 42,
    color: '#00ffcc',
    alive: true,
    buried: false,
    health: 100,
    shieldHp: 0,
    ...overrides,
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

function frame(
  weaponType: ProjectileState['weaponType'],
  tanks = [tank(), tank({ id: 'p2', x: 760, color: '#ff6644' })],
): GameState {
  const projectiles = [projectile(weaponType)];
  return {
    phase: 'FIRING',
    round: 1,
    activePlayerId: 'p1',
    tanks,
    projectiles,
    projectile: projectiles[0],
    terrain: new Uint8Array(1200 * 600),
    terrainVersion: 1,
    explosions: [],
    lastExplosion: null,
    fire: [],
  } as unknown as GameState;
}

function seam(): RecoilSeam {
  const renderer = Object.create(Renderer.prototype) as RecoilSeam;
  Object.assign(renderer, {
    reduceMotion: false,
    effectsBusy: 0,
    wasFiring: false,
    tankRecoil: null,
    bursts: [],
    scorches: [],
    shake: 0,
    kickX: 0,
    kickY: 0,
    effects: {
      spawnMuzzle: vi.fn(),
      clear: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
    },
    projectile: {
      clear: vi.fn(),
      drawGroundShadows: vi.fn(),
      draw: vi.fn(),
    },
    terrain: {
      markDirty: vi.fn(),
      draw: vi.fn(),
    },
    tanks: {
      drawAll: vi.fn(),
      drawBuriedMarker: vi.fn(),
    },
    hud: { draw: vi.fn() },
    ctx: {
      save: vi.fn(),
      translate: vi.fn(),
      restore: vi.fn(),
    },
    events: null,
    consumeExplosion: vi.fn(),
    trackDamage: vi.fn(),
    drawSky: vi.fn(),
    drawShields: vi.fn(),
    drawFire: vi.fn(),
    drawExplosions: vi.fn(),
    drawFlash: vi.fn(),
    drawScorches: vi.fn(),
    showAimGuide: false,
    aimGuideEnabled: true,
    lastSeenExplosionId: 0,
    lastImpact: null,
    prevHealth: new Map(),
    prevMobilityPoses: new Map(),
    mobilityEffects: {
      spawn: vi.fn(), update: vi.fn(), draw: vi.fn(), clear: vi.fn(), isActive: false,
    },
    prevShieldHp: new Map(),
    shieldBaselineRound: null,
    smokeThrottle: new Map(),
    prevFireLen: 0,
    prevBounces: new Map(),
    hadProjectileLastFrame: false,
  });
  return renderer;
}

describe('Renderer weapon-weighted tank recoil', () => {
  it('routes the real launch edge into one isolated decaying shooter pose', () => {
    const renderer = seam();
    const state = frame('nuke');
    const before = structuredClone(state.tanks);
    const authoritativeTip = barrelTip(state.tanks[0], BARREL_LENGTH);

    renderer.render(state);
    renderer.render(state);
    renderer.render({ ...state, phase: 'PLAYER_TURN' });
    renderer.render(state);

    expect(renderer.effects.spawnMuzzle).toHaveBeenCalledTimes(2);
    expect(renderer.effects.spawnMuzzle.mock.calls[0].slice(0, 3)).toEqual([
      authoritativeTip.x,
      authoritativeTip.y,
      state.tanks[0].angle,
    ]);
    const firstPose = renderer.tanks.drawAll.mock.calls[0][3] as TankRenderPose;
    const secondPose = renderer.tanks.drawAll.mock.calls[1][3] as TankRenderPose;
    expect(firstPose.tankId).toBe('p1');
    expect(firstPose.offsetX).toBeLessThan(0);
    expect(Math.hypot(secondPose.offsetX, secondPose.offsetY))
      .toBeLessThan(Math.hypot(firstPose.offsetX, firstPose.offsetY));
    expect(state.tanks).toEqual(before);
  });

  it('weights premium launch recoil above the light baseline', () => {
    const light = seam();
    const lightFrame = frame('baby_missile');
    light.spawnMuzzleFlash(lightFrame);
    const lightPose = light.currentTankRecoilPose(lightFrame, lightFrame.tanks)!;

    const heavy = seam();
    const heavyFrame = frame('nuke');
    heavy.spawnMuzzleFlash(heavyFrame);
    const heavyPose = heavy.currentTankRecoilPose(heavyFrame, heavyFrame.tanks)!;

    expect(Math.hypot(heavyPose.offsetX, heavyPose.offsetY))
      .toBeGreaterThan(Math.hypot(lightPose.offsetX, lightPose.offsetY));
  });

  it('suppresses poses for reduced motion and non-visible living shooters', () => {
    const reduced = seam();
    reduced.spawnMuzzleFlash(frame('heavy_missile'));
    expect(reduced.tankRecoil).not.toBeNull();
    reduced.reduceMotion = true;
    reduced.spawnMuzzleFlash(frame('nuke'));
    expect(reduced.tankRecoil).toBeNull();

    for (const shooter of [
      tank({ alive: false }),
      tank({ buried: true }),
    ]) {
      const renderer = seam();
      renderer.spawnMuzzleFlash(frame('nuke', [shooter]));
      expect(renderer.tankRecoil).toBeNull();
      expect(renderer.effects.spawnMuzzle).toHaveBeenCalledTimes(1);
    }
  });

  it('clears stale recoil when a launch edge has no matching shooter', () => {
    const renderer = seam();
    renderer.spawnMuzzleFlash(frame('nuke'));
    expect(renderer.tankRecoil).not.toBeNull();

    renderer.spawnMuzzleFlash({
      ...frame('heavy_missile'),
      activePlayerId: 'missing',
    });

    expect(renderer.tankRecoil).toBeNull();
    expect(renderer.effects.spawnMuzzle).toHaveBeenCalledTimes(1);
  });

  it('invalidates recoil before a same-ID tank is rebuilt for the next round', () => {
    const renderer = seam();
    const launch = frame('nuke');
    renderer.spawnMuzzleFlash(launch);
    expect(renderer.tankRecoil).not.toBeNull();

    const nextRound = {
      ...launch,
      phase: 'ROUND_OVER',
      round: launch.round + 1,
      tanks: [tank({ id: 'p1', x: 520 })],
    } as GameState;

    expect(renderer.currentTankRecoilPose(nextRound, nextRound.tanks)).toBeUndefined();
    expect(renderer.tankRecoil).toBeNull();
  });

  it('suppresses an admitted recoil if its shooter later dies, is buried, or disappears', () => {
    for (const tanks of [
      [tank({ alive: false })],
      [tank({ buried: true })],
      [tank({ id: 'p2' })],
    ]) {
      const renderer = seam();
      const launch = frame('nuke');
      renderer.spawnMuzzleFlash(launch);
      expect(renderer.tankRecoil).not.toBeNull();
      const changed = { ...launch, tanks } as GameState;

      expect(renderer.currentTankRecoilPose(changed, tanks)).toBeUndefined();
    }
  });

  it('keeps redraws alive through exact expiry and reset-compatible null state', () => {
    const renderer = seam();
    const state = frame('heavy_missile');
    const idleState = {
      ...state,
      phase: 'PLAYER_TURN',
      projectiles: [],
      projectile: null,
    } as GameState;
    for (const subject of idleState.tanks) {
      renderer.prevMobilityPoses.set(subject.id, { tankId: subject.id });
    }
    renderer.spawnMuzzleFlash(state);
    renderer.effectsBusy = 0;

    for (let age = 0; age < TANK_RECOIL_FRAMES; age++) {
      expect(renderer.isAnimating(idleState)).toBe(true);
      renderer.advanceTankRecoil();
    }
    expect(renderer.tankRecoil).toBeNull();
    expect(renderer.isAnimating(idleState)).toBe(false);

    renderer.spawnMuzzleFlash(state);
    expect(renderer.tankRecoil).not.toBeNull();
    renderer.reset();
    expect(renderer.tankRecoil).toBeNull();
  });
});

describe('TankRenderer recoil pose containment', () => {
  it('translates only the matching tank and restores Canvas state before the next', () => {
    const renderer = new TankRenderer();
    const stack: Array<{ x: number; y: number }> = [];
    let transform = { x: 0, y: 0 };
    const ctx = {
      save: vi.fn(() => stack.push({ ...transform })),
      translate: vi.fn((x: number, y: number) => {
        transform = { x: transform.x + x, y: transform.y + y };
      }),
      restore: vi.fn(() => {
        transform = stack.pop() ?? { x: 0, y: 0 };
      }),
    } as unknown as CanvasRenderingContext2D;
    const observations: Array<[string, number, number]> = [];
    vi.spyOn(renderer, 'draw').mockImplementation((_ctx, subject) => {
      observations.push([subject.id, transform.x, transform.y]);
    });

    renderer.drawAll(
      ctx,
      [tank(), tank({ id: 'p2' })],
      'p1',
      { tankId: 'p1', offsetX: -3, offsetY: 1 },
    );

    expect(observations).toEqual([
      ['p1', -3, 1],
      ['p2', 0, 0],
    ]);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(transform).toEqual({ x: 0, y: 0 });
  });
});
