import { describe, expect, it, vi } from 'vitest';
import type { GameState, TankState } from '@shared/types/GameState';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { Renderer } from './Renderer';

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

interface RendererTankSeam {
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
  prevShieldHp: Map<string, number>;
  smokeThrottle: Map<string, number>;
  showAimGuide: boolean;
  aimGuideEnabled: boolean;
  effects: {
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
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

function tank(id: string, overrides: Partial<TankState> = {}): TankState {
  return {
    id,
    playerName: id,
    x: 100 + Number(id.slice(1)) * 80,
    y: 410,
    angle: 45,
    power: 50,
    powerCap: 100,
    health: 100,
    fuel: 0,
    selectedWeapon: 'baby_missile',
    inventory: {} as TankState['inventory'],
    color: '#d65cff',
    loadout: { ...DEFAULT_TANK_LOADOUT },
    alive: true,
    shieldHp: 0,
    ai: null,
    credits: 0,
    roundWins: 0,
    kills: 0,
    totalDamage: 0,
    buried: false,
    buriedTurns: 0,
    ...overrides,
  };
}

function frame(): GameState {
  const visibleDead = tank('p1', { alive: false, health: 0 });
  const visibleLive = tank('p2');
  const buriedLive = tank('p3', { buried: true, buriedTurns: 1 });
  const buriedDead = tank('p4', { alive: false, health: 0, buried: true, buriedTurns: 1 });
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  for (const trapped of [buriedLive, buriedDead]) {
    terrain[(CANVAS_HEIGHT - 1) * CANVAS_WIDTH + trapped.x] = 1;
  }
  return {
    phase: 'PLAYER_TURN',
    activePlayerId: visibleLive.id,
    projectiles: [],
    projectile: null,
    explosions: [],
    lastExplosion: null,
    fire: [],
    tanks: [visibleDead, visibleLive, buriedLive, buriedDead],
    terrain,
    terrainVersion: 0,
  } as unknown as GameState;
}

function rendererSeam(): RendererTankSeam {
  const renderer = Object.create(Renderer.prototype) as RendererTankSeam;
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
    wasFiring: false,
    prevFireLen: 0,
    prevBounces: new Map(),
    hadProjectileLastFrame: false,
    prevHealth: new Map(),
    prevMobilityPoses: new Map(),
    mobilityEffects: {
      spawn: vi.fn(), update: vi.fn(), draw: vi.fn(), clear: vi.fn(), isActive: false,
    },
    prevShieldHp: new Map(),
    smokeThrottle: new Map(),
    showAimGuide: false,
    aimGuideEnabled: true,
    effects: { update: vi.fn(), draw: vi.fn() },
    projectile: { drawGroundShadows: vi.fn(), draw: vi.fn() },
    terrain: { draw: vi.fn() },
    tanks: { drawAll: vi.fn(), drawBuriedMarker: vi.fn() },
    hud: { draw: vi.fn() },
    ctx: { save: vi.fn(), translate: vi.fn(), restore: vi.fn() },
    drawSky: vi.fn(),
  });
  return renderer;
}

describe('Renderer persistent-wreck layer routing', () => {
  it('keeps all buried silhouettes below terrain and beacons only living trapped tanks', () => {
    const renderer = rendererSeam();
    const state = frame();
    const visibleDead = required(state.tanks[0], 'visible wreck');
    const visibleLive = required(state.tanks[1], 'visible live tank');
    const buriedLive = required(state.tanks[2], 'buried live tank');
    const buriedDead = required(state.tanks[3], 'buried wreck');

    renderer.render(state);

    expect(renderer.tanks.drawAll).toHaveBeenCalledTimes(2);
    expect(renderer.tanks.drawAll.mock.calls[0]).toEqual([
      renderer.ctx,
      [buriedLive, buriedDead],
    ]);
    expect(renderer.tanks.drawAll.mock.calls[1]).toEqual([
      renderer.ctx,
      [visibleDead, visibleLive],
      visibleLive.id,
    ]);
    expect(renderer.tanks.drawBuriedMarker).toHaveBeenCalledTimes(1);
    const markerCall = required(renderer.tanks.drawBuriedMarker.mock.calls[0], 'buried marker draw');
    expect(markerCall[1]).toBe(buriedLive.x);
    expect(markerCall[3]).toBe(buriedLive.color);

    const buriedOrder = required(renderer.tanks.drawAll.mock.invocationCallOrder[0], 'buried draw');
    const terrainOrder = required(renderer.terrain.draw.mock.invocationCallOrder[0], 'terrain draw');
    const visibleOrder = required(renderer.tanks.drawAll.mock.invocationCallOrder[1], 'visible draw');
    const beaconOrder = required(renderer.tanks.drawBuriedMarker.mock.invocationCallOrder[0], 'buried marker draw');
    expect(buriedOrder).toBeLessThan(terrainOrder);
    expect(terrainOrder).toBeLessThan(visibleOrder);
    expect(visibleOrder).toBeLessThan(beaconOrder);
  });
});
