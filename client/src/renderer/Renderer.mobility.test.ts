import { describe, expect, it, vi } from 'vitest';
import type { GameState, TankState } from '@shared/types/GameState';
import { Renderer } from './Renderer';
import { MobilityEffectsRenderer } from './MobilityEffectsRenderer';

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

interface MobilityEffectSeam {
  spawn: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  readonly isActive: boolean;
}

interface MobilityRendererSeam {
  reduceMotion: boolean;
  effectsBusy: number;
  prevMobilityPoses: Map<string, unknown>;
  mobilityEffects: MobilityEffectSeam;
  battlefieldBackdrop: {
    reset: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    readonly isSettled: boolean;
  };
  terrain: {
    readonly isMaterialSettled: boolean;
    markDirty: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };
  trackMobility(state: GameState): void;
  isAnimating(state: GameState): boolean;
  reset(): void;
}

interface MobilityRenderSeam extends Omit<MobilityRendererSeam, 'mobilityEffects' | 'terrain'> {
  render(state: GameState): void;
  mobilityEffects: MobilityEffectsRenderer;
  effects: { update: ReturnType<typeof vi.fn>; draw: ReturnType<typeof vi.fn> };
  projectile: { drawGroundShadows: ReturnType<typeof vi.fn>; draw: ReturnType<typeof vi.fn> };
  terrain: { draw: ReturnType<typeof vi.fn> };
  tanks: { drawAll: ReturnType<typeof vi.fn> };
}

function tank(overrides: Partial<TankState> = {}): TankState {
  return {
    id: 'p1',
    x: 240,
    y: 410,
    color: '#00ffcc',
    alive: true,
    buried: false,
    loadout: { treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry' },
    ...overrides,
  } as TankState;
}

function state(...tanks: TankState[]): GameState {
  return {
    round: 1,
    phase: 'PLAYER_TURN',
    tanks,
    projectiles: [],
    fire: [],
  } as unknown as GameState;
}

function seam(reduceMotion = false): MobilityRendererSeam {
  return Object.assign(Object.create(Renderer.prototype), {
    reduceMotion,
    effectsBusy: 0,
    prevMobilityPoses: new Map(),
    mobilityEffects: {
      spawn: vi.fn(),
      update: vi.fn(),
      draw: vi.fn(),
      clear: vi.fn(),
      isActive: false,
    },
    battlefieldBackdrop: { isSettled: true, reset: vi.fn(), select: vi.fn() },
    terrain: { isMaterialSettled: true, markDirty: vi.fn(), reset: vi.fn() },
    tanks: { isChassisArtSettled: true },
    bursts: [],
    scorches: [],
    wallContacts: [],
    shake: 0,
    kickX: 0,
    kickY: 0,
    tankRecoil: null,
    windGust: null,
    lastSeenExplosionId: 0,
    lastSeenWallImpactId: 0,
    lastImpact: null,
    prevHealth: new Map(),
    prevShieldHp: new Map(),
    shieldBaselineRound: null,
    smokeThrottle: new Map(),
    wasFiring: false,
    prevBounces: new Map(),
    hadProjectileLastFrame: false,
    effects: { clear: vi.fn() },
    projectile: { clear: vi.fn() },
    events: null,
  }) as MobilityRendererSeam;
}

function renderSeam(reduceMotion = false): MobilityRenderSeam {
  const renderer = seam(reduceMotion) as unknown as MobilityRenderSeam;
  Object.assign(renderer, {
    mobilityEffects: new MobilityEffectsRenderer(reduceMotion),
    effects: { update: vi.fn(), draw: vi.fn() },
    projectile: { drawGroundShadows: vi.fn(), draw: vi.fn() },
    terrain: { draw: vi.fn() },
    tanks: { drawAll: vi.fn() },
    hud: { draw: vi.fn() },
    ctx: {
      fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
      save: vi.fn(), translate: vi.fn(), restore: vi.fn(),
      fillRect: vi.fn(), strokeRect: vi.fn(),
    },
    consumeExplosion: vi.fn(),
    consumeWallImpacts: vi.fn(),
    trackWindGust: vi.fn(),
    trackDamage: vi.fn(),
    drawSky: vi.fn(),
    drawWindGusts: vi.fn(),
    advanceWindGust: vi.fn(),
    currentTankRecoilPose: vi.fn(() => null),
    advanceTankRecoil: vi.fn(),
    drawShields: vi.fn(),
    drawFire: vi.fn(),
    drawExplosions: vi.fn(),
    drawFlash: vi.fn(),
    drawScorches: vi.fn(),
  });
  return renderer;
}

describe('Renderer mobility-signature lifecycle', () => {
  it('takes a static externally delivered move through real admission, update, and under-tank draw order', () => {
    const renderer = renderSeam();
    const spawn = vi.spyOn(renderer.mobilityEffects, 'spawn');
    const update = vi.spyOn(renderer.mobilityEffects, 'update');
    const draw = vi.spyOn(renderer.mobilityEffects, 'draw');

    renderer.render(state(tank({ x: 240, y: 410 })));
    spawn.mockClear();
    update.mockClear();
    draw.mockClear();
    renderer.projectile.drawGroundShadows.mockClear();
    renderer.tanks.drawAll.mockClear();

    const externalMove = state(tank({ x: 244, y: 414 }));
    expect(renderer.isAnimating(externalMove)).toBe(true);
    renderer.render(externalMove);

    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ tankId: 'p1', dx: 4 }));
    const spawnOrder = required(spawn.mock.invocationCallOrder[0], 'mobility spawn');
    const updateOrder = required(update.mock.invocationCallOrder[0], 'mobility update');
    const shadowOrder = required(renderer.projectile.drawGroundShadows.mock.invocationCallOrder[0], 'ground shadow draw');
    const drawOrder = required(draw.mock.invocationCallOrder[0], 'mobility draw');
    const tankOrder = required(renderer.tanks.drawAll.mock.invocationCallOrder[0], 'tank draw');
    expect(spawnOrder).toBeLessThan(updateOrder);
    expect(shadowOrder).toBeLessThan(drawOrder);
    expect(drawOrder).toBeLessThan(tankOrder);
  });

  it('keeps the scene animating while an admitted mobility signature is alive', () => {
    const renderer = seam();
    Object.assign(renderer.mobilityEffects, { isActive: true });

    expect(renderer.isAnimating(state(tank()))).toBe(true);
  });

  it('wakes a static render loop for a legal externally delivered move without consuming it', () => {
    const renderer = seam();
    renderer.prevMobilityPoses.set('p1', {
      tankId: 'p1', round: 1, x: 240, y: 410, alive: true, buried: false,
      kit: 'foundry', color: '#00ffcc',
    });

    expect(renderer.isAnimating(state(tank({ x: 244, y: 414 })))).toBe(true);
    expect(renderer.prevMobilityPoses.get('p1')).toMatchObject({ x: 240, y: 410 });
  });

  it('wakes exactly one idle frame to prune an absent tank before its id reappears', () => {
    const renderer = renderSeam();
    const spawn = vi.spyOn(renderer.mobilityEffects, 'spawn');
    const baseline = state(tank({ x: 240, y: 410 }));
    const absent = state();
    const reappearing = state(tank({ x: 244, y: 414 }));

    renderer.render(baseline);
    spawn.mockClear();

    expect(renderer.isAnimating(absent)).toBe(true);
    renderer.render(absent);
    expect(renderer.prevMobilityPoses.has('p1')).toBe(false);
    expect(renderer.isAnimating(absent)).toBe(false);

    expect(renderer.isAnimating(reappearing)).toBe(true);
    renderer.render(reappearing);
    expect(renderer.prevMobilityPoses.get('p1')).toMatchObject({ x: 244, y: 414 });
    expect(spawn).not.toHaveBeenCalled();
    expect(renderer.mobilityEffects.isActive).toBe(false);
    expect(renderer.isAnimating(reappearing)).toBe(false);
  });

  it('observes one legal move once and silently rebaselines rejected movement', () => {
    const renderer = seam();
    renderer.trackMobility(state(tank({ x: 240 })));
    renderer.trackMobility(state(tank({ x: 244, y: 414 })));
    renderer.trackMobility(state(tank({ x: 244, y: 414 })));
    renderer.trackMobility(state(tank({ x: 260, y: 414 })));
    renderer.trackMobility(state(tank({ x: 264, y: 414, alive: false })));
    renderer.trackMobility({ ...state(tank({ x: 268, y: 414 })), round: 2 });
    renderer.trackMobility({ ...state(tank({ x: 272, y: 414, buried: true })), round: 2 });

    expect(renderer.mobilityEffects.spawn).toHaveBeenCalledTimes(1);
    expect(renderer.mobilityEffects.spawn).toHaveBeenCalledWith(expect.objectContaining({
      tankId: 'p1', x: 244, y: 414, dx: 4, direction: 1, kit: 'foundry', color: '#00ffcc',
    }));
    expect(renderer.effectsBusy).toBeGreaterThan(0);
  });

  it('forgets an absent tank before its id reappears', () => {
    const renderer = seam();
    renderer.trackMobility(state(tank({ x: 240, y: 410 })));
    renderer.trackMobility(state());
    renderer.trackMobility(state(tank({ x: 244, y: 414 })));

    expect(renderer.prevMobilityPoses.has('p1')).toBe(true);
    expect(renderer.mobilityEffects.spawn).not.toHaveBeenCalled();
  });

  it('suppresses motion-reduced observations without making the renderer busy', () => {
    const renderer = seam(true);
    renderer.trackMobility(state(tank({ x: 240 })));
    renderer.trackMobility(state(tank({ x: 244, y: 414 })));

    expect(renderer.mobilityEffects.spawn).not.toHaveBeenCalled();
    expect(renderer.effectsBusy).toBe(0);
  });

  it('wakes once to paint and rebaseline an externally delivered reduced-motion move', () => {
    const renderer = renderSeam(true);
    const baseline = state(tank({ x: 240, y: 410 }));
    const moved = state(tank({ x: 244, y: 414 }));

    renderer.render(baseline);

    expect(renderer.isAnimating(moved)).toBe(true);
    renderer.render(moved);

    expect(renderer.prevMobilityPoses.get('p1')).toMatchObject({ x: 244, y: 414 });
    expect(renderer.mobilityEffects.isActive).toBe(false);
    expect(renderer.effectsBusy).toBe(0);
    expect(renderer.isAnimating(moved)).toBe(false);
  });

  it('clears pose observations and residual mobility effects on reset', () => {
    const renderer = seam();
    renderer.prevMobilityPoses.set('p1', { x: 240 });

    renderer.reset();

    expect(renderer.prevMobilityPoses.size).toBe(0);
    expect(renderer.mobilityEffects.clear).toHaveBeenCalledOnce();
    expect(renderer.battlefieldBackdrop.reset).toHaveBeenCalledOnce();
    expect(renderer.terrain.reset).toHaveBeenCalledOnce();
  });
});

interface CanvasOperation {
  name: string;
  color?: string;
  args: number[];
}

function canvas() {
  const operations: CanvasOperation[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    save() { operations.push({ name: 'save', args: [] }); },
    restore() { operations.push({ name: 'restore', args: [] }); },
    beginPath() { operations.push({ name: 'beginPath', args: [] }); },
    moveTo(...args: number[]) { operations.push({ name: 'moveTo', args }); },
    lineTo(...args: number[]) { operations.push({ name: 'lineTo', args }); },
    arc(...args: number[]) { operations.push({ name: 'arc', args }); },
    fill(this: { fillStyle: string }) { operations.push({ name: 'fill', color: this.fillStyle, args: [] }); },
    fillRect(this: { fillStyle: string }, ...args: number[]) { operations.push({ name: 'fillRect', color: this.fillStyle, args }); },
    strokeRect(this: { strokeStyle: string }, ...args: number[]) { operations.push({ name: 'strokeRect', color: this.strokeStyle, args }); },
    stroke(this: { strokeStyle: string }) { operations.push({ name: 'stroke', color: this.strokeStyle, args: [] }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, operations };
}

describe('MobilityEffectsRenderer', () => {
  it('draws pairwise-distinct deterministic motifs with the exact accepted accents', () => {
    const expectedAccent = {
      foundry: '#d6a15f',
      ranger: '#c68cff',
      bulwark: '#6ee7ff',
      jackal: '#ffc857',
    } as const;
    const signatures: string[] = [];

    for (const kit of Object.keys(expectedAccent) as Array<keyof typeof expectedAccent>) {
      const renderer = new MobilityEffectsRenderer(false);
      renderer.spawn({ tankId: kit, x: 100, y: 200, dx: 4, direction: 1, kit, color: '#123456' });
      const { ctx, operations } = canvas();
      renderer.draw(ctx);

      expect(operations.some((operation) => operation.color === '#123456')).toBe(true);
      expect([...new Set(operations
        .map((operation) => operation.color)
        .filter((color): color is string => color !== undefined && color !== '#123456'))])
        .toEqual([expectedAccent[kit]]);
      signatures.push(JSON.stringify(operations.map(({ name, args }) => ({ name, args }))));
    }

    expect(new Set(signatures).size).toBe(4);
  });

  it('expires exactly at its bounded profile lifetime and releases idle work', () => {
    const renderer = new MobilityEffectsRenderer(false);
    renderer.spawn({ tankId: 'p1', x: 100, y: 200, dx: 4, direction: 1, kit: 'jackal', color: '#123456' });

    for (let frame = 0; frame < 19; frame++) renderer.update();
    expect(renderer.isActive).toBe(true);
    renderer.update();
    expect(renderer.isActive).toBe(false);
  });

  it('suppresses all reduced-motion signatures', () => {
    const renderer = new MobilityEffectsRenderer(true);
    renderer.spawn({ tankId: 'p1', x: 100, y: 200, dx: 4, direction: 1, kit: 'bulwark', color: '#123456' });

    expect(renderer.isActive).toBe(false);
  });
});
