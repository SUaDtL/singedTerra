import { describe, expect, it, vi } from 'vitest';
import { WEAPONS, type WeaponType } from '@shared/engine/WeaponSystem';
import type { ExplosionEvent, GameState } from '@shared/types/GameState';
import type { ExplosionVisualProfile } from './explosionVisuals';
import { getBlastLightProfile } from './blastLighting';
import { flashIntensity } from './explosionFx';
import { Renderer } from './Renderer';

interface Op {
  name: string;
  args: number[];
  value?: unknown;
  alpha?: number;
  composite?: string;
}

interface BurstProbe {
  cx: number;
  cy: number;
  age: number;
  lifeFrames: number;
  visual: ExplosionVisualProfile;
}

interface RendererLightingSeam {
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
  effects: { spawnExplosion: ReturnType<typeof vi.fn> };
  consumeExplosion(state: Pick<GameState, 'explosions' | 'lastExplosion'>): void;
  drawFlash(): void;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function recordingContext() {
  const ops: Op[] = [];
  const stack: Array<Record<string, unknown>> = [];
  const ctx = {
    fillStyle: '#caller-fill',
    strokeStyle: '#caller-stroke',
    globalAlpha: 0.73,
    globalCompositeOperation: 'source-over',
    lineWidth: 4,
    save(this: Record<string, unknown>) {
      stack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        lineWidth: this.lineWidth,
      });
      ops.push({ name: 'save', args: [] });
    },
    restore(this: Record<string, unknown>) {
      Object.assign(this, stack.pop());
      ops.push({ name: 'restore', args: [] });
    },
    createRadialGradient(...args: number[]) {
      const gradient = {
        addColorStop(offset: number, color: string) {
          ops.push({ name: 'colorStop', args: [offset], value: color });
        },
      };
      ops.push({ name: 'gradient', args, value: gradient });
      return gradient;
    },
    fillRect(
      this: {
        fillStyle: unknown;
        globalAlpha: number;
        globalCompositeOperation: string;
      },
      ...args: number[]
    ) {
      ops.push({
        name: 'fillRect',
        args,
        value: this.fillStyle,
        alpha: this.globalAlpha,
        composite: this.globalCompositeOperation,
      });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function event(
  id: number,
  weaponType: WeaponType,
  cx: number,
  overrides: Partial<ExplosionEvent> = {},
): ExplosionEvent {
  const det = WEAPONS[weaponType].detonation;
  return {
    id,
    weaponType,
    cx,
    cy: 120,
    radius: det.radius,
    style: det.style,
    color: det.color,
    durationFrames: det.durationFrames,
    ...overrides,
  };
}

function rendererWith(events: ExplosionEvent[], reduceMotion = false) {
  const { ctx, ops } = recordingContext();
  const renderer = Object.create(Renderer.prototype) as RendererLightingSeam;
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
    reduceMotion,
    effects: { spawnExplosion: vi.fn() },
  });
  renderer.consumeExplosion({ explosions: events, lastExplosion: null });
  return { ctx, ops, renderer };
}

describe('Renderer weapon-signature battlefield lighting', () => {
  it('draws weapon-colored radial lights before the existing headline exposure', () => {
    const source = event(1, 'napalm', 240, { color: '#123abc' });
    const before = { ...source };
    const { ops, renderer } = rendererWith([source]);

    renderer.drawFlash();

    expect(ops.filter((op) => op.name === 'gradient')).toHaveLength(1);
    expect(ops.some((op) => (
      op.name === 'colorStop'
      && typeof op.value === 'string'
      && op.value.includes('18, 58, 188')
    ))).toBe(true);
    expect(ops.some((op) => (
      op.name === 'colorStop'
      && op.args[0] === 1
      && typeof op.value === 'string'
      && op.value.endsWith(', 0)')
    ))).toBe(true);

    const gradient = required(ops.find((op) => op.name === 'gradient'), 'blast gradient');
    const local = required(ops.find((op) => (
      op.name === 'fillRect' && required(op.args[2], 'local fill width') < 1200
    )), 'local-light fill');
    const exposure = required(ops.find((op) => (
      op.name === 'fillRect' && required(op.args[2], 'exposure width') === 1200
    )), 'exposure fill');
    const localFill = ops.indexOf(local);
    const exposureFill = ops.indexOf(exposure);
    expect(local.value).toBe(gradient.value);
    expect(exposure.alpha).toBe(flashIntensity(
      0,
      source.durationFrames,
      source.radius,
    ));
    expect(localFill).toBeGreaterThanOrEqual(0);
    expect(exposureFill).toBeGreaterThan(localFill);
    expect(source).toEqual(before);
  });

  it('selects only the three strongest simultaneous lights without reordering bursts', () => {
    const sources = [
      event(1, 'missile', 10, { radius: 10, style: 'blast' }),
      event(2, 'nuke', 20, { radius: 100, style: 'blast' }),
      event(3, 'dirt_bomb', 30, { radius: 30, style: 'blast' }),
      event(4, 'napalm', 40, { radius: 40, style: 'blast' }),
      event(5, 'funky_bomb', 50, { radius: 50, style: 'blast' }),
    ];
    const { ops, renderer } = rendererWith(sources);
    const orderBefore = renderer.bursts.map((burst) => burst.cx);

    renderer.drawFlash();

    const centers = ops
      .filter((op) => op.name === 'gradient')
      .map((op) => op.args[0]);
    expect(centers).toEqual([20, 50, 40]);
    expect(renderer.bursts.map((burst) => burst.cx)).toEqual(orderBefore);
    expect(ops.filter((op) => (
      op.name === 'fillRect' && required(op.args[2], 'local fill width') < 1200
    ))).toHaveLength(3);
  });

  it('uses current age for arbitration so a stale large blast yields to fresh lights', () => {
    const sources = [
      event(1, 'missile', 10, { radius: 10, style: 'blast' }),
      event(2, 'nuke', 20, { radius: 100, style: 'blast' }),
      event(3, 'dirt_bomb', 30, { radius: 30, style: 'blast' }),
      event(4, 'napalm', 40, { radius: 40, style: 'blast' }),
      event(5, 'funky_bomb', 50, { radius: 50, style: 'blast' }),
    ];
    const { ops, renderer } = rendererWith(sources);
    const staleNuke = renderer.bursts.find((burst) => burst.cx === 20);
    if (!staleNuke) throw new Error('missing nuke burst');
    staleNuke.age = staleNuke.lifeFrames - 1;

    renderer.drawFlash();

    const centers = ops
      .filter((op) => op.name === 'gradient')
      .map((op) => op.args[0]);
    expect(centers).toEqual([50, 40, 30]);
  });

  it('draws exact helper radius/bounds and current-frame decay through the Canvas seam', () => {
    const source = event(1, 'napalm', 240);
    const { ops, renderer } = rendererWith([source]);
    const burst = required(renderer.bursts[0], 'napalm burst');
    const assertFrame = () => {
      const expected = getBlastLightProfile({
        family: burst.visual.family,
        reachRadius: burst.visual.reachRadius,
        age: burst.age,
        lifeFrames: burst.lifeFrames,
      });
      const gradient = required(ops.find((op) => op.name === 'gradient'), 'frame gradient');
      const local = required(ops.find((op) => (
        op.name === 'fillRect' && required(op.args[2], 'frame fill width') < 1200
      )), 'frame local-light fill');
      expect(gradient.args).toEqual([
        burst.cx,
        burst.cy,
        0,
        burst.cx,
        burst.cy,
        expected.radius,
      ]);
      expect(local.args).toEqual([
        burst.cx - expected.radius,
        burst.cy - expected.radius,
        expected.radius * 2,
        expected.radius * 2,
      ]);
      expect(local.value).toBe(gradient.value);
      expect(local.alpha).toBe(expected.alpha);
      return expected.alpha;
    };

    renderer.drawFlash();
    const peak = assertFrame();
    ops.length = 0;
    burst.age = Math.floor(burst.lifeFrames / 2);
    renderer.drawFlash();
    const middle = assertFrame();
    ops.length = 0;
    burst.age = burst.lifeFrames - 1;
    renderer.drawFlash();
    const tail = assertFrame();

    expect(middle).toBeLessThan(peak);
    expect(tail).toBeLessThan(middle);
    expect(tail).toBeGreaterThan(0);
  });

  it('uses additive local-light alpha and restores every caller Canvas field', () => {
    const { ctx, ops, renderer } = rendererWith([
      event(1, 'nuke', 300),
      event(2, 'dirt_bomb', 500),
    ]);

    renderer.drawFlash();

    const localFills = ops.filter((op) => (
      op.name === 'fillRect' && required(op.args[2], 'local fill width') < 1200
    ));
    expect(localFills).toHaveLength(2);
    expect(localFills.every((op) => op.composite === 'lighter')).toBe(true);
    const firstAlpha = required(required(localFills[0], 'first local fill').alpha, 'first local alpha');
    const secondAlpha = required(required(localFills[1], 'second local fill').alpha, 'second local alpha');
    expect(firstAlpha).toBeGreaterThan(secondAlpha);
    expect(ctx.fillStyle).toBe('#caller-fill');
    expect(ctx.strokeStyle).toBe('#caller-stroke');
    expect(ctx.globalAlpha).toBe(0.73);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(4);
  });

  it('draws no flash or local lighting under reduced motion', () => {
    const { ops, renderer } = rendererWith([event(1, 'nuke', 300)], true);
    renderer.drawFlash();
    expect(ops).toEqual([]);
  });
});
