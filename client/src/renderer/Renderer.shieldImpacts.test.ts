import { describe, expect, it, vi } from 'vitest';
import { TANK_HEIGHT } from '@shared/engine/Tank';
import type { GameState, TankState } from '@shared/types/GameState';
import { Renderer } from './Renderer';

interface ShieldImpactSeam {
  effectsBusy: number;
  prevHealth: Map<string, number>;
  prevShieldHp: Map<string, number>;
  shieldBaselineRound: number | null;
  smokeThrottle: Map<string, number>;
  effects: {
    spawnArmorHit: ReturnType<typeof vi.fn>;
    spawnDamage: ReturnType<typeof vi.fn>;
    spawnKill: ReturnType<typeof vi.fn>;
    spawnWreck: ReturnType<typeof vi.fn>;
    spawnShieldImpact: ReturnType<typeof vi.fn>;
    emitDamageSmoke: ReturnType<typeof vi.fn>;
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
  projectile: { clear: ReturnType<typeof vi.fn> };
  terrain: { markDirty: ReturnType<typeof vi.fn> };
  events: null;
  trackDamage(state: GameState): void;
  reset(): void;
}

interface ShieldRenderSeam extends ShieldImpactSeam {
  reduceMotion: boolean;
  showAimGuide: boolean;
  aimGuideEnabled: boolean;
  skyGradient: CanvasGradient | null;
  effects: ShieldImpactSeam['effects'] & {
    spawnExplosion: ReturnType<typeof vi.fn>;
    spawnMuzzle: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
  };
  projectile: ShieldImpactSeam['projectile'] & {
    drawGroundShadows: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
  };
  terrain: ShieldImpactSeam['terrain'] & { draw: ReturnType<typeof vi.fn> };
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
  consumeExplosion: ReturnType<typeof vi.fn>;
  drawSky: ReturnType<typeof vi.fn>;
  drawShields: ReturnType<typeof vi.fn>;
  drawFire: ReturnType<typeof vi.fn>;
  drawExplosions: ReturnType<typeof vi.fn>;
  drawFlash: ReturnType<typeof vi.fn>;
  drawScorches: ReturnType<typeof vi.fn>;
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
    shieldHp: 120,
    ...overrides,
  } as TankState;
}

function state(subject: TankState): GameState {
  return { round: 1, tanks: [subject] } as unknown as GameState;
}

function seam(): ShieldImpactSeam {
  const renderer = Object.create(Renderer.prototype) as ShieldImpactSeam;
  Object.assign(renderer, {
    effectsBusy: 0,
    prevHealth: new Map(),
    prevShieldHp: new Map(),
    shieldBaselineRound: null,
    smokeThrottle: new Map(),
    effects: {
      spawnArmorHit: vi.fn(),
      spawnDamage: vi.fn(),
      spawnKill: vi.fn(),
      spawnWreck: vi.fn(),
      spawnShieldImpact: vi.fn(),
      emitDamageSmoke: vi.fn(),
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
    projectile: { clear: vi.fn() },
    terrain: { markDirty: vi.fn() },
    events: null,
  });
  return renderer;
}

function renderSeam(): ShieldRenderSeam {
  const renderer = seam() as ShieldRenderSeam;
  Object.assign(renderer, {
    reduceMotion: false,
    showAimGuide: false,
    aimGuideEnabled: true,
    skyGradient: {} as CanvasGradient,
    effects: {
      ...renderer.effects,
      spawnExplosion: vi.fn(),
      spawnMuzzle: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
    },
    projectile: {
      ...renderer.projectile,
      drawGroundShadows: vi.fn(),
      draw: vi.fn(),
    },
    terrain: { ...renderer.terrain, draw: vi.fn() },
    tanks: { drawAll: vi.fn(), drawBuriedMarker: vi.fn() },
    hud: { draw: vi.fn() },
    ctx: { save: vi.fn(), translate: vi.fn(), restore: vi.fn() },
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

function renderState(subject: TankState): GameState {
  return {
    phase: 'RESOLVING',
    round: 1,
    tanks: [subject],
    activePlayerId: subject.id,
    terrain: new Uint8Array(1200 * 600),
    terrainVersion: 1,
    projectiles: [],
    projectile: null,
    explosions: [],
    lastExplosion: null,
    fire: [],
  } as unknown as GameState;
}

describe('Renderer shield-impact transition', () => {
  it('routes a real two-frame render drop through update and front-layer drawing', () => {
    const renderer = renderSeam();
    renderer.render(renderState(tank({ shieldHp: 120 })));
    renderer.render(renderState(tank({ shieldHp: 90 })));

    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledTimes(1);
    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledWith(
      240,
      410 - TANK_HEIGHT / 2,
      30,
    );
    expect(renderer.effects.spawnShieldImpact.mock.invocationCallOrder[0])
      .toBeLessThan(renderer.effects.update.mock.invocationCallOrder[1]);
    expect(renderer.drawShields.mock.invocationCallOrder[1])
      .toBeLessThan(renderer.effects.draw.mock.invocationCallOrder[1]);
  });

  it('spawns exactly one centered response for a strict positive shield drop', () => {
    const renderer = seam();
    renderer.trackDamage(state(tank({ shieldHp: 120 })));
    renderer.trackDamage(state(tank({ shieldHp: 72 })));
    renderer.trackDamage(state(tank({ shieldHp: 72 })));

    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledTimes(1);
    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledWith(
      240,
      410 - TANK_HEIGHT / 2,
      48,
    );
    expect(renderer.effectsBusy).toBeGreaterThan(0);
  });

  it('silently baselines first observation and updates activation/recharge baselines', () => {
    const renderer = seam();
    renderer.trackDamage(state(tank({ shieldHp: 0 })));
    renderer.trackDamage(state(tank({ shieldHp: 120 })));
    renderer.trackDamage(state(tank({ shieldHp: 120 })));
    renderer.trackDamage(state(tank({ shieldHp: 140 })));
    renderer.trackDamage(state(tank({ shieldHp: 130 })));

    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledTimes(1);
    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledWith(
      240,
      410 - TANK_HEIGHT / 2,
      10,
    );

    const fresh = seam();
    fresh.trackDamage(state(tank({ shieldHp: 55 })));
    expect(fresh.effects.spawnShieldImpact).not.toHaveBeenCalled();

    const activated = seam();
    activated.trackDamage(state(tank({ shieldHp: 0 })));
    activated.trackDamage(state(tank({ shieldHp: 120 })));
    activated.trackDamage(state(tank({ shieldHp: 100 })));
    expect(activated.effects.spawnShieldImpact).toHaveBeenCalledWith(
      240,
      410 - TANK_HEIGHT / 2,
      20,
    );
  });

  it('tracks shield transitions independently per tank id', () => {
    const renderer = seam();
    renderer.trackDamage({
      round: 1,
      tanks: [
        tank({ id: 'p1', x: 200, shieldHp: 80 }),
        tank({ id: 'p2', x: 800, shieldHp: 60 }),
      ],
    } as unknown as GameState);
    renderer.trackDamage({
      round: 1,
      tanks: [
        tank({ id: 'p1', x: 200, shieldHp: 70 }),
        tank({ id: 'p2', x: 800, shieldHp: 35 }),
      ],
    } as unknown as GameState);

    expect(renderer.effects.spawnShieldImpact.mock.calls).toEqual([
      [200, 410 - TANK_HEIGHT / 2, 10],
      [800, 410 - TANK_HEIGHT / 2, 25],
    ]);
  });

  it('keeps shield absorption and health overflow as independent truthful feedback', () => {
    const renderer = seam();
    renderer.trackDamage(state(tank({ shieldHp: 30, health: 100 })));
    renderer.trackDamage(state(tank({ shieldHp: 0, health: 88 })));

    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledWith(
      240,
      410 - TANK_HEIGHT / 2,
      30,
    );
    expect(renderer.effects.spawnDamage).toHaveBeenCalledWith(240, 380, 12);
  });

  it('re-baselines rebuilt tanks when the authoritative round changes', () => {
    const renderer = seam();
    renderer.trackDamage(state(tank({ shieldHp: 55, x: 240 })));
    renderer.trackDamage({
      ...state(tank({ shieldHp: 0, x: 760 })),
      round: 2,
    });

    expect(renderer.effects.spawnShieldImpact).not.toHaveBeenCalled();

    renderer.trackDamage({
      ...state(tank({ shieldHp: 120, x: 760 })),
      round: 2,
    });
    renderer.trackDamage({
      ...state(tank({ shieldHp: 90, x: 760 })),
      round: 2,
    });
    expect(renderer.effects.spawnShieldImpact).toHaveBeenCalledWith(
      760,
      410 - TANK_HEIGHT / 2,
      30,
    );
  });

  it('reset clears the shield baseline and all transient effect state', () => {
    const renderer = seam();
    renderer.prevShieldHp.set('p1', 120);
    renderer.shieldBaselineRound = 3;

    renderer.reset();

    expect(renderer.prevShieldHp.size).toBe(0);
    expect(renderer.shieldBaselineRound).toBeNull();
    expect(renderer.effects.clear).toHaveBeenCalledTimes(1);
  });
});
