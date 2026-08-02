import { describe, expect, it, vi } from 'vitest';
import type { ExplosionEvent, GameState, ProjectileState } from '@shared/types/GameState';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { Renderer } from './Renderer';
import type { RenderEventSink } from './Renderer';
import { getImpactDepthParallax } from './impactDepthParallax';

interface RendererImpactSeam {
  bursts: Array<{ age: number }>;
  scorches: Array<{ age: number }>;
  scorchRgb: [number, number, number];
  lastSeenExplosionId: number;
  lastImpact: { x: number; y: number } | null;
  shake: number;
  kickX: number;
  kickY: number;
  impactHoldFrames: number;
  effectsBusy: number;
  reduceMotion: boolean;
  events: RenderEventSink | null;
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
    spawnExplosion: ReturnType<typeof vi.fn>;
    spawnMuzzle: ReturnType<typeof vi.fn>;
    spawnDamage: ReturnType<typeof vi.fn>;
    spawnArmorHit: ReturnType<typeof vi.fn>;
    spawnKill: ReturnType<typeof vi.fn>;
    spawnWreck: ReturnType<typeof vi.fn>;
    spawnShieldImpact: ReturnType<typeof vi.fn>;
    emitDamageSmoke: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  projectile: {
    drawGroundShadows: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  terrain: {
    draw: ReturnType<typeof vi.fn>;
    markDirty: ReturnType<typeof vi.fn>;
  };
  tanks: { drawAll: ReturnType<typeof vi.fn> };
  hud: { draw: ReturnType<typeof vi.fn> };
  ctx: {
    save: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    fillStyle: unknown;
  };
  skyGradient: CanvasGradient | null;
  drawSky(): void;
  drawCloudBanks: ReturnType<typeof vi.fn>;
  drawStars: ReturnType<typeof vi.fn>;
  drawSun: ReturnType<typeof vi.fn>;
  drawHorizonHaze: ReturnType<typeof vi.fn>;
  drawDistantRidges: ReturnType<typeof vi.fn>;
  drawWindGusts: ReturnType<typeof vi.fn>;
  drawLastImpact: ReturnType<typeof vi.fn>;
  drawExplosions: ReturnType<typeof vi.fn>;
  drawFlash: ReturnType<typeof vi.fn>;
  drawScorches: ReturnType<typeof vi.fn>;
  consumeExplosion(state: Pick<GameState, 'explosions' | 'lastExplosion'>): void;
  isAnimating(state: GameState): boolean;
  render(state: GameState): void;
  reset(): void;
}

function explosion(
  id: number,
  cx: number,
  cy: number,
  radius: number,
): ExplosionEvent {
  return {
    id,
    weaponType: 'missile',
    cx,
    cy,
    radius,
    style: 'blast',
    color: '#ff7a1f',
    durationFrames: 30,
  };
}

function rendererSeam(reduceMotion = false): RendererImpactSeam {
  const renderer = Object.create(Renderer.prototype) as RendererImpactSeam;
  Object.assign(renderer, {
    bursts: [],
    scorches: [],
    scorchRgb: [44, 30, 20],
    lastSeenExplosionId: 0,
    lastImpact: null,
    shake: 0,
    kickX: 0,
    kickY: 0,
    impactHoldFrames: 0,
    effectsBusy: 0,
    reduceMotion,
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
    effects: {
      spawnExplosion: vi.fn(),
      spawnMuzzle: vi.fn(),
      spawnDamage: vi.fn(),
      spawnArmorHit: vi.fn(),
      spawnKill: vi.fn(),
      spawnWreck: vi.fn(),
      spawnShieldImpact: vi.fn(),
      emitDamageSmoke: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
      clear: vi.fn(),
    },
    projectile: { drawGroundShadows: vi.fn(), draw: vi.fn(), clear: vi.fn() },
    terrain: { draw: vi.fn(), markDirty: vi.fn() },
    tanks: { drawAll: vi.fn() },
    hud: { draw: vi.fn() },
    ctx: {
      save: vi.fn(),
      translate: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    },
    skyGradient: {} as CanvasGradient,
    drawSky: vi.fn(),
    drawCloudBanks: vi.fn(),
    drawStars: vi.fn(),
    drawSun: vi.fn(),
    drawHorizonHaze: vi.fn(),
    drawDistantRidges: vi.fn(),
    drawWindGusts: vi.fn(),
    drawLastImpact: vi.fn(),
    drawExplosions: vi.fn(),
    drawFlash: vi.fn(),
    drawScorches: vi.fn(),
  });
  return renderer;
}

function idleState(): GameState {
  return {
    phase: 'PLAYER_TURN',
    explosions: [],
    lastExplosion: null,
    projectiles: [],
    projectile: null,
    fire: [],
    tanks: [],
    terrain: new Uint8Array(0),
    terrainVersion: 0,
    activePlayerId: '',
  } as unknown as GameState;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe('Renderer directional impact kick', () => {
  it('admits one simultaneous heavy batch, freezes its package twice, then releases it together', () => {
    const renderer = rendererSeam();
    const frame = idleState();
    const onExplosion = vi.fn();
    renderer.events = {
      onLaunch: vi.fn(),
      onExplosion,
      onHop: vi.fn(),
      onFireActive: vi.fn(),
      onMiss: vi.fn(),
    };
    const tank = {
      id: 'p1',
      x: 300,
      y: 400,
      angle: 45,
      color: '#e84d4d',
      alive: true,
      buried: false,
      health: 100,
      shieldHp: 0,
    };
    Object.assign(frame, { round: 1, activePlayerId: tank.id, tanks: [tank] });

    // Paint/baseline the pre-impact frame, then observe a simultaneous batch and
    // one authoritative health drop on the next snapshot.
    renderer.render(frame);
    vi.clearAllMocks();
    tank.health = 60;
    frame.explosions = [
      explosion(1, 100, 300, 50),
      explosion(2, 700, 300, 90),
    ];

    renderer.render(frame);
    expect(renderer.impactHoldFrames).toBe(1);
    expect(onExplosion).toHaveBeenCalledOnce();
    expect(onExplosion).toHaveBeenCalledWith(90, null);
    expect(renderer.effects.spawnExplosion).toHaveBeenCalledTimes(2);
    expect(renderer.bursts.map((burst) => burst.age)).toEqual([0, 0]);
    expect(renderer.scorches.map((scorch) => scorch.age)).toEqual([0, 0]);
    expect(renderer.effects.spawnDamage).not.toHaveBeenCalled();
    expect(renderer.terrain.draw).not.toHaveBeenCalled();
    expect(renderer.effects.update).not.toHaveBeenCalled();

    renderer.render(frame);
    expect(renderer.impactHoldFrames).toBe(0);
    expect(onExplosion).toHaveBeenCalledOnce();
    expect(renderer.effects.spawnExplosion).toHaveBeenCalledTimes(2);
    expect(renderer.bursts.map((burst) => burst.age)).toEqual([0, 0]);
    expect(renderer.scorches.map((scorch) => scorch.age)).toEqual([0, 0]);
    expect(renderer.effects.spawnDamage).not.toHaveBeenCalled();
    expect(renderer.terrain.draw).not.toHaveBeenCalled();
    expect(renderer.effects.update).not.toHaveBeenCalled();

    // Restore the real age-advancing painters for the release frame. At age 0 the
    // burst has zero radius; the scorch does draw, so provide the narrow Canvas
    // surface it uses without replacing the production renderer path.
    delete (renderer as unknown as Record<string, unknown>)['drawExplosions'];
    delete (renderer as unknown as Record<string, unknown>)['drawScorches'];
    const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
    Object.assign(renderer.ctx, {
      createRadialGradient: vi.fn(() => gradient),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
    });
    renderer.render(frame);
    expect(onExplosion).toHaveBeenCalledOnce();
    expect(renderer.effects.spawnExplosion).toHaveBeenCalledTimes(2);
    expect(renderer.bursts.map((burst) => burst.age)).toEqual([1, 1]);
    expect(renderer.scorches.map((scorch) => scorch.age)).toEqual([1, 1]);
    expect(renderer.effects.spawnDamage).toHaveBeenCalledOnce();
    expect(renderer.effects.spawnDamage).toHaveBeenCalledWith(300, 370, 40);
    expect(renderer.terrain.draw).toHaveBeenCalledTimes(1);
    expect(renderer.effects.update).toHaveBeenCalledTimes(1);
  });

  it('does not hold small or reduced-motion impacts', () => {
    const small = rendererSeam();
    const smallFrame = idleState();
    smallFrame.explosions = [explosion(1, 100, 300, 49)];
    small.render(smallFrame);
    expect(small.impactHoldFrames).toBe(0);
    expect(small.terrain.draw).toHaveBeenCalledTimes(1);

    const reduced = rendererSeam(true);
    const reducedFrame = idleState();
    reducedFrame.explosions = [explosion(1, 100, 300, 90)];
    reduced.render(reducedFrame);
    expect(reduced.impactHoldFrames).toBe(0);
    expect(reduced.terrain.draw).toHaveBeenCalledTimes(1);
  });

  it('keeps the idle redraw gate awake for a pending hold and clears it on reset', () => {
    const renderer = rendererSeam();
    const state = idleState();
    renderer.impactHoldFrames = 1;

    expect(renderer.isAnimating(state)).toBe(true);
    renderer.reset();
    expect(renderer.impactHoldFrames).toBe(0);
  });

  it('emits one muzzle flash on the real FIRING edge and does not retrigger mid-flight', () => {
    const renderer = rendererSeam();
    const frame = idleState();
    const shooter = {
      id: 'p1',
      x: 240,
      y: 410,
      angle: 42,
      color: '#00ffcc',
      alive: true,
      buried: false,
      health: 100,
      shieldHp: 0,
    };
    const shell: ProjectileState = {
      x: 250,
      y: 390,
      vx: 4,
      vy: -2,
      weaponType: 'funky_bomb',
      age: 0,
      hasSplit: false,
      bounces: 0,
    };
    Object.assign(frame, {
      phase: 'FIRING',
      activePlayerId: 'p1',
      tanks: [shooter],
      projectiles: [shell],
      projectile: shell,
    });

    renderer.render(frame);
    renderer.render(frame);
    expect(renderer.effects.spawnMuzzle).toHaveBeenCalledTimes(1);

    frame.phase = 'PLAYER_TURN';
    frame.projectiles = [];
    frame.projectile = null;
    renderer.render(frame);
    frame.phase = 'FIRING';
    frame.projectiles = [shell];
    frame.projectile = shell;
    renderer.render(frame);
    expect(renderer.effects.spawnMuzzle).toHaveBeenCalledTimes(2);
  });

  it('uses real explosion position/radius and retains the strongest simultaneous impulse', () => {
    const batches = [
      [
        explosion(1, 0, CANVAS_HEIGHT / 2, 54),
        explosion(2, CANVAS_WIDTH, CANVAS_HEIGHT / 2, 34),
      ],
      [
        explosion(1, CANVAS_WIDTH, CANVAS_HEIGHT / 2, 34),
        explosion(2, 0, CANVAS_HEIGHT / 2, 54),
      ],
    ];
    for (const explosions of batches) {
      const renderer = rendererSeam();
      renderer.consumeExplosion({ explosions, lastExplosion: null });
      expect(renderer.kickX).toBeCloseTo(4.8, 8);
      expect(renderer.kickY).toBeCloseTo(0, 8);
    }
  });

  it('lets a later weaker heavy blast replace recoil left over from an older frame', () => {
    const renderer = rendererSeam();
    renderer.consumeExplosion({
      explosions: [explosion(1, 0, CANVAS_HEIGHT / 2, 54)],
      lastExplosion: null,
    });
    renderer.consumeExplosion({
      explosions: [explosion(2, CANVAS_WIDTH, CANVAS_HEIGHT / 2, 34)],
      lastExplosion: null,
    });

    expect(renderer.kickX).toBeCloseTo(-1.6, 8);
    expect(renderer.kickY).toBeCloseTo(0, 8);
  });

  it('suppresses recoil for reduced-motion users', () => {
    const renderer = rendererSeam(true);
    renderer.consumeExplosion({
      explosions: [explosion(1, 0, CANVAS_HEIGHT / 2, 80)],
      lastExplosion: null,
    });

    expect(renderer.kickX).toBe(0);
    expect(renderer.kickY).toBe(0);
  });

  it('composes recoil into the world transform, decays it, and keeps redraw alive', () => {
    const renderer = rendererSeam();
    const state = idleState();
    renderer.kickX = 4;
    renderer.kickY = -3;

    expect(renderer.isAnimating(state)).toBe(true);
    renderer.render(state);

    expect(renderer.ctx.translate).toHaveBeenCalledWith(4, -3);
    expect(renderer.effects.update).toHaveBeenCalledWith(state.terrain);
    expect(renderer.effects.update.mock.calls[0]?.[0]).toBe(state.terrain);
    expect(Math.hypot(renderer.kickX, renderer.kickY)).toBeLessThan(5);
    expect(Math.hypot(renderer.kickX, renderer.kickY)).toBeGreaterThan(0);
  });

  it('routes far, middle, and battlefield art through isolated exact-ratio transforms', () => {
    const renderer = rendererSeam();
    const state = idleState();
    renderer.kickX = 8;
    renderer.kickY = -6;
    delete (renderer as unknown as Record<string, unknown>)['drawSky'];

    renderer.render(state);

    const profile = getImpactDepthParallax({ x: 8, y: -6 })!;
    expect(renderer.ctx.translate.mock.calls).toEqual([
      [profile.far.x, profile.far.y],
      [profile.middle.x, profile.middle.y],
      [profile.middle.x, profile.middle.y],
      [profile.world.x, profile.world.y],
    ]);
    const stars = required(renderer.drawStars.mock.invocationCallOrder[0], 'stars draw');
    const clouds = required(renderer.drawCloudBanks.mock.invocationCallOrder[0], 'cloud draw');
    const sun = required(renderer.drawSun.mock.invocationCallOrder[0], 'sun draw');
    const ridges = required(renderer.drawDistantRidges.mock.invocationCallOrder[0], 'ridge draw');
    const gusts = required(renderer.drawWindGusts.mock.invocationCallOrder[0], 'gust draw');
    const terrain = required(renderer.terrain.draw.mock.invocationCallOrder[0], 'terrain draw');
    expect(stars).toBeLessThan(clouds);
    expect(clouds).toBeLessThan(sun);
    expect(clouds).toBeLessThan(ridges);
    expect(ridges).toBeLessThan(gusts);
    expect(gusts).toBeLessThan(terrain);
    expect(renderer.ctx.save).toHaveBeenCalledTimes(4);
    expect(renderer.ctx.restore).toHaveBeenCalledTimes(4);
    expect(required(renderer.ctx.restore.mock.invocationCallOrder.at(-1), 'final restore'))
      .toBeLessThan(required(renderer.hud.draw.mock.invocationCallOrder[0], 'HUD draw'));
  });

  it('keeps every depth transform isolated on the live Canvas stack', () => {
    const renderer = rendererSeam();
    const trace: string[] = [];
    const stack: Array<{ x: number; y: number }> = [];
    let offset = { x: 0, y: 0 };
    renderer.kickX = 8;
    renderer.kickY = -6;
    delete (renderer as unknown as Record<string, unknown>)['drawSky'];

    renderer.ctx.save = vi.fn(() => {
      stack.push({ ...offset });
      trace.push('save');
    });
    renderer.ctx.translate = vi.fn((x: number, y: number) => {
      offset = { x: offset.x + x, y: offset.y + y };
      trace.push(`translate:${x},${y}`);
    });
    renderer.ctx.restore = vi.fn(() => {
      offset = stack.pop()!;
      trace.push('restore');
    });
    renderer.ctx.fillRect = vi.fn(() => trace.push(`sky-fill:${offset.x},${offset.y}`));
    renderer.drawCloudBanks = vi.fn(() => trace.push(`clouds:${offset.x},${offset.y}`));
    renderer.drawStars = vi.fn(() => trace.push(`stars:${offset.x},${offset.y}`));
    renderer.drawSun = vi.fn(() => trace.push(`sun:${offset.x},${offset.y}`));
    renderer.drawHorizonHaze = vi.fn(() => trace.push(`haze:${offset.x},${offset.y}`));
    renderer.drawDistantRidges = vi.fn(() => trace.push(`ridges:${offset.x},${offset.y}`));
    renderer.drawWindGusts = vi.fn(() => trace.push(`wind:${offset.x},${offset.y}`));
    renderer.terrain.draw = vi.fn(() => trace.push(`terrain:${offset.x},${offset.y}`));
    renderer.effects.draw = vi.fn(() => trace.push(`effects:${offset.x},${offset.y}`));
    renderer.drawLastImpact = vi.fn(() => trace.push(`aiming:${offset.x},${offset.y}`));
    renderer.hud.draw = vi.fn(() => trace.push(`hud:${offset.x},${offset.y}`));

    renderer.render(idleState());

    expect(trace).toEqual([
      'save',
      'translate:0.96,-0.72',
      'sky-fill:0.96,-0.72',
      'stars:0.96,-0.72',
      'clouds:0.96,-0.72',
      'sun:0.96,-0.72',
      'haze:0.96,-0.72',
      'restore',
      'save',
      'translate:2.8,-2.0999999999999996',
      'ridges:2.8,-2.0999999999999996',
      'restore',
      'save',
      'translate:2.8,-2.0999999999999996',
      'wind:2.8,-2.0999999999999996',
      'restore',
      'save',
      'translate:8,-6',
      'terrain:8,-6',
      'effects:8,-6',
      'aiming:8,-6',
      'restore',
      'hud:0,0',
    ]);
    expect(stack).toEqual([]);
    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it('preserves existing background geometry and ordering at zero displacement', () => {
    const renderer = rendererSeam();
    delete (renderer as unknown as Record<string, unknown>)['drawSky'];

    renderer.render(idleState());

    expect(renderer.ctx.fillRect).toHaveBeenCalledWith(
      -18,
      -18,
      CANVAS_WIDTH + 36,
      CANVAS_HEIGHT + 36,
    );
    expect(renderer.ctx.translate.mock.calls).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(renderer.drawCloudBanks).toHaveBeenCalledTimes(1);
    expect(renderer.drawStars).toHaveBeenCalledTimes(1);
    expect(renderer.drawSun).toHaveBeenCalledTimes(1);
    expect(renderer.drawHorizonHaze).toHaveBeenCalledTimes(1);
    expect(renderer.drawDistantRidges).toHaveBeenCalledTimes(1);
  });

  it('adds random shake to recoil instead of replacing it', () => {
    const renderer = rendererSeam();
    const random = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(0);
    renderer.kickX = 4;
    renderer.kickY = -3;
    renderer.shake = 6;

    renderer.render(idleState());

    expect(renderer.ctx.translate).toHaveBeenCalledWith(10, -9);
    expect(renderer.kickX).toBeCloseTo(2.88, 8);
    expect(renderer.kickY).toBeCloseTo(-2.16, 8);
    expect(renderer.shake).toBeCloseTo(5.1, 8);
    random.mockRestore();
  });

  it('keeps either recoil axis alive and terminates once both settle', () => {
    const renderer = rendererSeam();
    const state = idleState();

    renderer.kickX = 1;
    expect(renderer.isAnimating(state)).toBe(true);
    renderer.kickX = 0;
    renderer.kickY = 1;
    expect(renderer.isAnimating(state)).toBe(true);
    renderer.kickY = 0;
    expect(renderer.isAnimating(state)).toBe(false);

    renderer.kickX = 0.13;
    renderer.kickY = -0.13;
    for (let frame = 0; frame < 20 && renderer.isAnimating(state); frame++) {
      renderer.render(state);
    }
    expect(renderer.kickX).toBe(0);
    expect(renderer.kickY).toBe(0);
    expect(renderer.isAnimating(state)).toBe(false);
  });

  it('overscans the sky beyond maximum composed shake and recoil', () => {
    const renderer = rendererSeam();
    delete (renderer as unknown as Record<string, unknown>)['drawSky'];

    renderer.drawSky();

    expect(renderer.ctx.fillRect).toHaveBeenCalledWith(
      -18,
      -18,
      CANVAS_WIDTH + 36,
      CANVAS_HEIGHT + 36,
    );
  });

  it('clears directional recoil on reset', () => {
    const renderer = rendererSeam();
    renderer.kickX = 4;
    renderer.kickY = -3;

    renderer.reset();

    expect(renderer.kickX).toBe(0);
    expect(renderer.kickY).toBe(0);
  });
});
