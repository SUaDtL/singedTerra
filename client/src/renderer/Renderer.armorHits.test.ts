import { describe, expect, it, vi } from 'vitest';
import { TANK_HEIGHT } from '@shared/engine/Tank';
import type { GameState, TankState } from '@shared/types/GameState';
import { EffectsRenderer } from './EffectsRenderer';
import { Renderer } from './Renderer';

interface ArmorHitSeam {
  reduceMotion: boolean;
  effectsBusy: number;
  prevHealth: Map<string, number>;
  prevShieldHp: Map<string, number>;
  shieldBaselineRound: number | null;
  smokeThrottle: Map<string, number>;
  tankRecoil: null;
  effects: {
    spawnArmorHit: ReturnType<typeof vi.fn>;
    spawnDamage: ReturnType<typeof vi.fn>;
    spawnKill: ReturnType<typeof vi.fn>;
    spawnWreck: ReturnType<typeof vi.fn>;
    spawnShieldImpact: ReturnType<typeof vi.fn>;
    emitDamageSmoke: ReturnType<typeof vi.fn>;
    spawnMuzzle: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  bursts: unknown[];
  scorches: unknown[];
  lastSeenExplosionId: number;
  lastImpact: null;
  shake: number;
  kickX: number;
  kickY: number;
  wasFiring: boolean;
  prevFireLen: number;
  prevBounces: Map<number, number>;
  hadProjectileLastFrame: boolean;
  showAimGuide: boolean;
  aimGuideEnabled: boolean;
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
  drawSky: ReturnType<typeof vi.fn>;
  drawShields: ReturnType<typeof vi.fn>;
  drawFire: ReturnType<typeof vi.fn>;
  drawExplosions: ReturnType<typeof vi.fn>;
  drawFlash: ReturnType<typeof vi.fn>;
  drawScorches: ReturnType<typeof vi.fn>;
  trackDamage(state: GameState): void;
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

function state(tanks: TankState[]): GameState {
  return {
    phase: 'RESOLVING',
    round: 1,
    activePlayerId: tanks[0]?.id ?? 'p1',
    tanks,
    terrain: new Uint8Array(1200 * 600),
    terrainVersion: 1,
    projectiles: [],
    projectile: null,
    explosions: [],
    lastExplosion: null,
    fire: [],
  } as unknown as GameState;
}

function seam(): ArmorHitSeam {
  const renderer = Object.create(Renderer.prototype) as ArmorHitSeam;
  Object.assign(renderer, {
    reduceMotion: false,
    effectsBusy: 0,
    prevHealth: new Map(),
    prevShieldHp: new Map(),
    shieldBaselineRound: null,
    smokeThrottle: new Map(),
    tankRecoil: null,
    effects: {
      spawnArmorHit: vi.fn(),
      spawnDamage: vi.fn(),
      spawnKill: vi.fn(),
      spawnWreck: vi.fn(),
      spawnShieldImpact: vi.fn(),
      emitDamageSmoke: vi.fn(),
      spawnMuzzle: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
      clear: vi.fn(),
    },
    bursts: [],
    scorches: [],
    lastSeenExplosionId: 0,
    lastImpact: null,
    shake: 0,
    kickX: 0,
    kickY: 0,
    wasFiring: false,
    prevFireLen: 0,
    prevBounces: new Map(),
    hadProjectileLastFrame: false,
    showAimGuide: false,
    aimGuideEnabled: true,
    projectile: {
      clear: vi.fn(),
      drawGroundShadows: vi.fn(),
      draw: vi.fn(),
    },
    terrain: { markDirty: vi.fn(), draw: vi.fn() },
    tanks: { drawAll: vi.fn(), drawBuriedMarker: vi.fn() },
    hud: { draw: vi.fn() },
    ctx: { save: vi.fn(), translate: vi.fn(), restore: vi.fn() },
    events: null,
    consumeExplosion: vi.fn(),
    drawSky: vi.fn(),
    drawShields: vi.fn(),
    drawFire: vi.fn(),
    drawExplosions: vi.fn(),
    drawFlash: vi.fn(),
    drawScorches: vi.fn(),
  });
  return renderer;
}

describe('Renderer armor-hit transition', () => {
  it('routes a real two-frame health drop before update and front-layer drawing', () => {
    const renderer = seam();
    renderer.render(state([tank({ health: 100 })]));
    renderer.render(state([tank({ health: 72 })]));

    expect(renderer.effects.spawnArmorHit).toHaveBeenCalledTimes(1);
    expect(renderer.effects.spawnArmorHit).toHaveBeenCalledWith(
      'p1',
      240,
      410 - TANK_HEIGHT / 2,
      28,
      '#00ffcc',
    );
    expect(renderer.effects.spawnArmorHit.mock.invocationCallOrder[0])
      .toBeLessThan(renderer.effects.update.mock.invocationCallOrder[1]);
    expect(renderer.tanks.drawAll.mock.invocationCallOrder[1])
      .toBeLessThan(renderer.effects.draw.mock.invocationCallOrder[1]);
  });

  it('admits only strict surviving visible health drops', () => {
    const renderer = seam();
    renderer.trackDamage(state([tank({ health: 100 })]));
    renderer.trackDamage(state([tank({ health: 75 })]));
    renderer.trackDamage(state([tank({ health: 75 })]));
    renderer.trackDamage(state([tank({ health: 90 })]));

    expect(renderer.effects.spawnArmorHit).toHaveBeenCalledTimes(1);
    expect(renderer.effects.spawnArmorHit).toHaveBeenCalledWith(
      'p1',
      240,
      410 - TANK_HEIGHT / 2,
      25,
      '#00ffcc',
    );
    expect(renderer.effects.spawnDamage).toHaveBeenCalledTimes(1);
    expect(renderer.effectsBusy).toBeGreaterThan(0);
  });

  it('keeps lethal and buried damage on their existing truthful feedback paths', () => {
    const lethal = seam();
    lethal.trackDamage(state([tank({ health: 20 })]));
    lethal.trackDamage(state([tank({ health: 0, alive: false })]));
    expect(lethal.effects.spawnArmorHit).not.toHaveBeenCalled();
    expect(lethal.effects.spawnDamage).toHaveBeenCalledWith(240, 380, 20);
    expect(lethal.effects.spawnKill).toHaveBeenCalledTimes(1);
    expect(lethal.effects.spawnWreck).toHaveBeenCalledTimes(1);

    const buried = seam();
    buried.trackDamage(state([tank({ health: 100 })]));
    buried.trackDamage(state([tank({ health: 80, buried: true })]));
    expect(buried.effects.spawnArmorHit).not.toHaveBeenCalled();
    expect(buried.effects.spawnDamage).toHaveBeenCalledWith(240, 380, 20);
  });

  it('keeps shield-only and health-overflow feedback independent', () => {
    const renderer = seam();
    renderer.trackDamage(state([tank({ health: 100, shieldHp: 30 })]));
    renderer.trackDamage(state([tank({ health: 100, shieldHp: 10 })]));
    expect(renderer.effects.spawnArmorHit).not.toHaveBeenCalled();
    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledTimes(1);

    renderer.trackDamage(state([tank({ health: 88, shieldHp: 0 })]));
    expect(renderer.effects.spawnArmorHit).toHaveBeenCalledWith(
      'p1',
      240,
      410 - TANK_HEIGHT / 2,
      12,
      '#00ffcc',
    );
    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledTimes(2);
  });

  it('tracks simultaneous tank drops independently', () => {
    const renderer = seam();
    renderer.trackDamage(state([
      tank({ id: 'p1', x: 200, health: 100 }),
      tank({ id: 'p2', x: 800, health: 100, color: '#ff6644' }),
    ]));
    renderer.trackDamage(state([
      tank({ id: 'p1', x: 200, health: 90 }),
      tank({ id: 'p2', x: 800, health: 65, color: '#ff6644' }),
    ]));

    expect(renderer.effects.spawnArmorHit.mock.calls).toEqual([
      ['p1', 200, 410 - TANK_HEIGHT / 2, 10, '#00ffcc'],
      ['p2', 800, 410 - TANK_HEIGHT / 2, 35, '#ff6644'],
    ]);
  });

  it('draws the full-strength birth frame plus thirteen recovery frames through Renderer.render', () => {
    const renderer = seam();
    const effects = new EffectsRenderer(false) as unknown as {
      armorHits: Array<{ age: number }>;
      spawnDamage: (...args: unknown[]) => void;
      draw: (...args: unknown[]) => void;
    };
    vi.spyOn(effects, 'spawnDamage').mockImplementation(() => undefined);
    const drawnAges: number[] = [];
    vi.spyOn(effects, 'draw').mockImplementation(() => {
      if (effects.armorHits[0]) drawnAges.push(effects.armorHits[0].age);
    });
    renderer.effects = effects as unknown as ArmorHitSeam['effects'];

    renderer.render(state([tank({ health: 100 })]));
    const damaged = state([tank({ health: 70 })]);
    renderer.render(damaged);
    for (let frame = 1; frame < 14; frame++) renderer.render(damaged);

    expect(drawnAges).toEqual(Array.from({ length: 14 }, (_, age) => age));
    renderer.render(damaged);
    expect(drawnAges).toHaveLength(14);
  });
});
