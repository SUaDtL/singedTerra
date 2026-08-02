import { describe, expect, it, vi } from 'vitest';
import { blastReachRadius } from '@shared/engine/BlastGeometry';
import { WEAPONS, type WeaponType } from '@shared/engine/WeaponSystem';
import type { ExplosionEvent, GameState } from '@shared/types/GameState';
import type { ExplosionVisualProfile } from './explosionVisuals';
import { Renderer } from './Renderer';

interface Op {
  name: string;
  args: number[];
  value?: string;
  alpha?: number;
}

interface BurstProbe {
  age: number;
  lifeFrames: number;
  visual?: ExplosionVisualProfile;
}

interface RendererExplosionSeam {
  ctx: CanvasRenderingContext2D;
  bursts: BurstProbe[];
  scorches: unknown[];
  lastSeenExplosionId: number;
  lastImpact: { x: number; y: number } | null;
  shake: number;
  kickX: number;
  kickY: number;
  effectsBusy: number;
  reduceMotion: boolean;
  events: { onExplosion: ReturnType<typeof vi.fn> } | null;
  prevHealth: Map<string, number>;
  prevShieldHp: Map<string, number>;
  smokeThrottle: Map<string, number>;
  wasFiring: boolean;
  prevFireLen: number;
  prevBounces: Map<number, number>;
  hadProjectileLastFrame: boolean;
  effects: {
    spawnExplosion: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  projectile: { clear: ReturnType<typeof vi.fn> };
  terrain: { markDirty: ReturnType<typeof vi.fn> };
  consumeExplosion(state: Pick<GameState, 'explosions' | 'lastExplosion'>): void;
  drawExplosions(): void;
  reset(): void;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function requiredArg(op: Op, index: number): number {
  return required(op.args[index], `${op.name} argument ${index}`);
}

function recordingContext() {
  const ops: Op[] = [];
  const snapshots: Array<Record<string, unknown>> = [];
  let currentPath: Op[] = [];
  const ctx = {
    fillStyle: '#before-fill',
    strokeStyle: '#before-stroke',
    globalAlpha: 0.73,
    lineWidth: 4,
    lineCap: 'square',
    globalCompositeOperation: 'source-over',
    save(this: Record<string, unknown>) {
      snapshots.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha,
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
        globalCompositeOperation: this.globalCompositeOperation,
      });
      ops.push({ name: 'save', args: [] });
    },
    restore(this: Record<string, unknown>) {
      Object.assign(this, snapshots.pop());
      ops.push({ name: 'restore', args: [] });
    },
    createRadialGradient(...args: number[]) {
      ops.push({ name: 'gradient', args });
      return {
        addColorStop(offset: number, color: string) {
          ops.push({ name: 'colorStop', args: [offset], value: color });
        },
      };
    },
    beginPath() {
      currentPath = [];
      ops.push({ name: 'beginPath', args: [] });
    },
    closePath() { ops.push({ name: 'closePath', args: [] }); },
    arc(...args: number[]) {
      const op = { name: 'arc', args };
      currentPath.push(op);
      ops.push(op);
    },
    ellipse(...args: number[]) {
      const op = { name: 'ellipse', args };
      currentPath.push(op);
      ops.push(op);
    },
    moveTo(...args: number[]) {
      const op = { name: 'moveTo', args };
      currentPath.push(op);
      ops.push(op);
    },
    lineTo(...args: number[]) {
      const op = { name: 'lineTo', args };
      currentPath.push(op);
      ops.push(op);
    },
    fill(this: { fillStyle: unknown; globalAlpha: number }) {
      ops.push({
        name: 'fill',
        args: [],
        value: String(this.fillStyle),
        alpha: this.globalAlpha,
      });
    },
    stroke(this: { strokeStyle: unknown; globalAlpha: number; lineWidth: number }) {
      const arc = [...currentPath].reverse().find((op) => op.name === 'arc');
      ops.push({
        name: 'stroke',
        args: arc ? [...arc.args, this.lineWidth] : [this.lineWidth],
        value: String(this.strokeStyle),
        alpha: this.globalAlpha,
      });
    },
    fillRect(this: { fillStyle: unknown; globalAlpha: number }, ...args: number[]) {
      ops.push({
        name: 'fillRect',
        args,
        value: String(this.fillStyle),
        alpha: this.globalAlpha,
      });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function event(
  weaponType: WeaponType,
  overrides: Partial<ExplosionEvent> = {},
): ExplosionEvent {
  const det = WEAPONS[weaponType].detonation;
  return {
    id: 1,
    weaponType,
    cx: 100,
    cy: 100,
    radius: det.radius,
    style: det.style,
    color: det.color,
    durationFrames: det.durationFrames,
    ...overrides,
  };
}

function drawEvents(
  sources: ExplosionEvent[],
  events: RendererExplosionSeam['events'] = null,
) {
  const { ctx, ops } = recordingContext();
  const renderer = Object.create(Renderer.prototype) as RendererExplosionSeam;
  Object.assign(renderer, {
    ctx,
    bursts: [],
    scorches: [],
    lastSeenExplosionId: 0,
    lastImpact: null,
    shake: 0,
    kickX: 0,
    kickY: 0,
    effectsBusy: 0,
    reduceMotion: true,
    events,
    prevHealth: new Map(),
    prevMobilityPoses: new Map(),
    mobilityEffects: {
      spawn: vi.fn(), update: vi.fn(), draw: vi.fn(), clear: vi.fn(), isActive: false,
    },
    prevShieldHp: new Map(),
    smokeThrottle: new Map(),
    wasFiring: false,
    prevFireLen: 0,
    prevBounces: new Map(),
    hadProjectileLastFrame: false,
    effects: { spawnExplosion: vi.fn(), clear: vi.fn() },
    projectile: { clear: vi.fn() },
    terrain: { markDirty: vi.fn() },
  });
  renderer.consumeExplosion({ explosions: sources, lastExplosion: null });
  for (const burst of renderer.bursts) {
    burst.age = Math.ceil(burst.lifeFrames * 0.18);
  }
  renderer.drawExplosions();
  return { ctx, ops, renderer };
}

function draw(
  weaponType: WeaponType,
  overrides: Partial<ExplosionEvent> = {},
) {
  const source = event(weaponType, overrides);
  const before = { ...source };
  return { ...drawEvents([source]), source, before };
}

function count(ops: Op[], name: string): number {
  return ops.filter((op) => op.name === name).length;
}

function maxExtent(ops: Op[], cx: number, cy: number): number {
  let max = 0;
  const point = (x: number, y: number, pad = 0) => {
    max = Math.max(max, Math.hypot(x - cx, y - cy) + pad);
  };
  for (const op of ops) {
    if (op.name === 'gradient') {
      point(requiredArg(op, 3), requiredArg(op, 4), requiredArg(op, 5));
    } else if (op.name === 'arc') {
      point(requiredArg(op, 0), requiredArg(op, 1), requiredArg(op, 2));
    } else if (op.name === 'ellipse') {
      point(
        requiredArg(op, 0),
        requiredArg(op, 1),
        Math.max(requiredArg(op, 2), requiredArg(op, 3)),
      );
    } else if (op.name === 'stroke' && op.args.length >= 4) {
      point(
        requiredArg(op, 0),
        requiredArg(op, 1),
        requiredArg(op, 2) + requiredArg(op, 3) / 2,
      );
    } else if (op.name === 'moveTo' || op.name === 'lineTo') {
      point(requiredArg(op, 0), requiredArg(op, 1));
    } else if (op.name === 'fillRect') {
      const x = requiredArg(op, 0);
      const y = requiredArg(op, 1);
      const w = requiredArg(op, 2);
      const h = requiredArg(op, 3);
      point(x, y);
      point(x + w, y);
      point(x, y + h);
      point(x + w, y + h);
    }
  }
  return max;
}

describe('Renderer weapon-signature detonations', () => {
  it('caches the authoritative event profile once without mutating the event', () => {
    const { renderer, source, before } = draw('nuke');
    const burst = required(renderer.bursts[0], 'cached nuclear burst');
    expect(required(burst.visual, 'cached nuclear profile')).toMatchObject({
      family: 'nuclear',
      accent: source.color,
      reachRadius: blastReachRadius(source.radius, source.style),
    });
    expect(source).toEqual(before);
  });

  it('draws observably distinct family primitives through the centralized burst pass', () => {
    const conventional = draw('missile').ops;
    const nuclear = draw('nuke').ops;
    const earth = draw('dirt_bomb').ops;
    const incendiary = draw('napalm').ops;
    const scatter = draw('cluster_bomb').ops;
    const funky = draw('funky_bomb').ops;
    const mine = draw('bouncing_betty').ops;

    expect(count(conventional, 'arc')).toBe(1);
    expect(count(nuclear, 'arc')).toBeGreaterThan(count(conventional, 'arc'));
    expect(count(nuclear, 'stroke')).toBeGreaterThan(0);
    expect(count(earth, 'ellipse')).toBeGreaterThan(0);
    expect(count(incendiary, 'ellipse')).toBeGreaterThan(0);
    expect(count(incendiary, 'lineTo')).toBeGreaterThan(0);
    expect(count(scatter, 'stroke')).toBeGreaterThan(0);
    expect(count(funky, 'lineTo')).toBeGreaterThanOrEqual(10);
    expect(count(mine, 'stroke')).toBeGreaterThan(0);

    const signatures = [
      conventional, nuclear, earth, incendiary, scatter, funky, mine,
    ].map((ops) => ['arc', 'ellipse', 'lineTo', 'fillRect', 'stroke']
      .map((name) => count(ops, name)).join(':'));
    expect(new Set(signatures).size).toBe(7);
  });

  it('contains every family primitive within the shared full-grown reach', () => {
    for (const weaponType of [
      'missile',
      'nuke',
      'dirt_bomb',
      'napalm',
      'cluster_bomb',
      'funky_bomb',
      'bouncing_betty',
    ] as const) {
      const { ops, source } = draw(weaponType);
      const reach = blastReachRadius(source.radius, source.style);
      expect(maxExtent(ops, source.cx, source.cy)).toBeLessThanOrEqual(reach + 1e-9);
      expect(ops.some((op) => (
        (op.name === 'arc' && requiredArg(op, 2) === reach)
        || (op.name === 'ellipse' && requiredArg(op, 2) === reach)
        || ((op.name === 'moveTo' || op.name === 'lineTo')
          && Math.abs(Math.hypot(
            requiredArg(op, 0) - source.cx,
            requiredArg(op, 1) - source.cy,
          ) - reach) < 1e-9)
      ))).toBe(true);
    }
  });

  it('restores caller Canvas state and leaves authoritative input unchanged', () => {
    const { ctx, source, before } = draw('hot_napalm');
    expect(ctx.fillStyle).toBe('#before-fill');
    expect(ctx.strokeStyle).toBe('#before-stroke');
    expect(ctx.globalAlpha).toBe(0.73);
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.lineCap).toBe('square');
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(source).toEqual(before);
  });

  it('paints an overridden authoritative event color into body and family detail', () => {
    const { ops, renderer } = draw('dirt_bomb', { color: '#123abc' });
    const burst = required(renderer.bursts[0], 'overridden dirt burst');
    expect(required(burst.visual, 'overridden dirt profile').accent).toBe('#123abc');
    expect(ops.some((op) => (
      op.name === 'colorStop' && op.value?.includes('18, 58, 188')
    ))).toBe(true);
    expect(ops.some((op) => (
      op.name === 'fill' && op.value?.includes('18, 58, 188')
    ))).toBe(true);
  });

  it('draws the family body before its signature details', () => {
    const nuclear = draw('nuke').ops;
    const incendiary = draw('napalm').ops;
    expect(nuclear.findIndex((op) => op.name === 'fill'))
      .toBeLessThan(nuclear.findIndex((op) => op.name === 'stroke'));
    expect(incendiary.findIndex((op) => op.name === 'ellipse'))
      .toBeLessThan(incendiary.findIndex((op) => op.name === 'lineTo'));
  });

  it('preserves id dedupe and exact burst lifetime culling', () => {
    const { renderer, source } = draw('missile');
    expect(renderer.bursts).toHaveLength(1);

    renderer.consumeExplosion({ explosions: [source], lastExplosion: null });
    expect(renderer.bursts).toHaveLength(1);

    const burst = required(renderer.bursts[0], 'deduplicated burst');
    burst.age = burst.lifeFrames - 1;
    renderer.drawExplosions();
    expect(renderer.bursts).toHaveLength(0);
  });

  it('routes material to particles and coalesces armor-priority audio', () => {
    const events = { onExplosion: vi.fn() };
    const ground = event('nuke', { id: 1, radius: 80, impactType: 'ground' });
    const armor = event('missile', { id: 2, radius: 34, impactType: 'tank' });
    const { renderer } = drawEvents([ground, armor], events);

    expect(renderer.effects.spawnExplosion).toHaveBeenNthCalledWith(
      1,
      ground.cx,
      ground.cy,
      ground.radius,
      ground.color,
      'ground',
    );
    expect(renderer.effects.spawnExplosion).toHaveBeenNthCalledWith(
      2,
      armor.cx,
      armor.cy,
      armor.radius,
      armor.color,
      'tank',
    );
    expect(events.onExplosion).toHaveBeenCalledOnce();
    expect(events.onExplosion).toHaveBeenCalledWith(80, {
      impactType: 'tank',
      radius: 34,
    });
  });

  it('isolates simultaneous family alpha before drawing the next burst', () => {
    const nuke = event('nuke', { id: 1 });
    const missile = event('missile', { id: 2 });
    const { ops } = drawEvents([nuke, missile]);
    const bodyFills = ops.filter((op) => op.name === 'fill');

    expect(bodyFills).toHaveLength(2);
    expect(required(bodyFills[0], 'first burst body fill').alpha).toBe(0.73);
    expect(required(bodyFills[1], 'second burst body fill').alpha).toBe(0.73);
  });

  it('clears burst state and accepts restarted event ids after reset', () => {
    const { renderer, source } = draw('missile');
    expect(renderer.bursts).toHaveLength(1);
    expect(renderer.scorches).toHaveLength(1);

    renderer.reset();

    expect(renderer.bursts).toHaveLength(0);
    expect(renderer.scorches).toHaveLength(0);
    expect(renderer.lastSeenExplosionId).toBe(0);
    renderer.consumeExplosion({ explosions: [source], lastExplosion: null });
    expect(renderer.bursts).toHaveLength(1);
  });
});
