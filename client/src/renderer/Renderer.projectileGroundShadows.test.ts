import { describe, expect, it, vi } from 'vitest';
import type { GameState, ProjectileState } from '@shared/types/GameState';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { Renderer } from './Renderer';

interface RendererShadowSeam {
  bursts: unknown[];
  scorches: unknown[];
  lastSeenExplosionId: number;
  lastImpact: null;
  shake: number;
  kickX: number;
  kickY: number;
  effectsBusy: number;
  reduceMotion: boolean;
  events: null;
  wasFiring: boolean;
  prevFireLen: number;
  prevBounces: Map<number, number>;
  hadProjectileLastFrame: boolean;
  prevHealth: Map<string, number>;
  prevMobilityPoses: Map<string, unknown>;
  prevShieldHp: Map<string, number>;
  smokeThrottle: Map<string, number>;
  showAimGuide: boolean;
  aimGuideEnabled: boolean;
  effects: {
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
    spawnMuzzle: ReturnType<typeof vi.fn>;
  };
  mobilityEffects: {
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
    readonly isActive: boolean;
  };
  projectile: {
    drawGroundShadows: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
  };
  terrain: { draw: ReturnType<typeof vi.fn> };
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
  drawSky: ReturnType<typeof vi.fn>;
  render(state: GameState): void;
}

function shell(): ProjectileState {
  return {
    x: 200,
    y: 100,
    vx: 4,
    vy: 1,
    weaponType: 'missile',
    age: 10,
    hasSplit: false,
    bounces: 0,
  };
}

function state(): GameState {
  const projectile = shell();
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  terrain[(CANVAS_HEIGHT - 1) * CANVAS_WIDTH + projectile.x] = 1;
  return {
    phase: 'FIRING',
    activePlayerId: '',
    projectiles: [projectile],
    projectile,
    explosions: [],
    lastExplosion: null,
    fire: [],
    tanks: [],
    terrain,
    terrainVersion: 0,
  } as unknown as GameState;
}

function rendererSeam(): RendererShadowSeam {
  const renderer = Object.create(Renderer.prototype) as RendererShadowSeam;
  Object.assign(renderer, {
    bursts: [],
    scorches: [],
    lastSeenExplosionId: 0,
    lastImpact: null,
    shake: 0,
    kickX: 0,
    kickY: 0,
    effectsBusy: 0,
    reduceMotion: false,
    events: null,
    wasFiring: true,
    prevFireLen: 0,
    prevBounces: new Map(),
    hadProjectileLastFrame: true,
    prevHealth: new Map(),
    prevMobilityPoses: new Map(),
    prevShieldHp: new Map(),
    smokeThrottle: new Map(),
    showAimGuide: false,
    aimGuideEnabled: true,
    effects: {
      update: vi.fn(),
      draw: vi.fn(),
      spawnMuzzle: vi.fn(),
    },
    mobilityEffects: { update: vi.fn(), draw: vi.fn(), isActive: false },
    projectile: {
      drawGroundShadows: vi.fn(),
      draw: vi.fn(),
    },
    terrain: { draw: vi.fn() },
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
    drawSky: vi.fn(),
  });
  return renderer;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe('Renderer projectile-ground-shadow orchestration', () => {
  it('draws shadows with live terrain after terrain and before tanks and payloads', () => {
    const renderer = rendererSeam();
    const frame = state();

    renderer.render(frame);

    expect(renderer.projectile.drawGroundShadows)
      .toHaveBeenCalledWith(renderer.ctx, frame.projectiles, frame.terrain);
    expect(required(renderer.projectile.drawGroundShadows.mock.calls[0], 'ground shadow call')[2])
      .toBe(frame.terrain);
    const terrainOrder = required(renderer.terrain.draw.mock.invocationCallOrder[0], 'terrain draw');
    const shadowOrder = required(renderer.projectile.drawGroundShadows.mock.invocationCallOrder[0], 'ground shadow draw');
    const tankOrder = required(renderer.tanks.drawAll.mock.invocationCallOrder[0], 'tank draw');
    const payloadOrder = required(renderer.projectile.draw.mock.invocationCallOrder[0], 'payload draw');
    expect(terrainOrder).toBeLessThan(shadowOrder);
    expect(shadowOrder).toBeLessThan(tankOrder);
    expect(tankOrder).toBeLessThan(payloadOrder);
  });
});
