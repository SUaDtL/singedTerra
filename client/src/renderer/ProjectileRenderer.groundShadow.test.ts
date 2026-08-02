import { describe, expect, it } from 'vitest';
import type { ProjectileState } from '@shared/types/GameState';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { ProjectileRenderer } from './ProjectileRenderer';
import { getProjectileGroundShadow } from './projectileGroundShadow';

interface Op {
  name: string;
  args: number[];
  value?: unknown;
  alpha?: number;
  composite?: string;
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
    globalCompositeOperation: 'lighter',
    lineWidth: 4,
    translateX: 17,
    translateY: -4,
    scaleX: 2,
    scaleY: 0.5,
    save(this: Record<string, unknown>) {
      stack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        lineWidth: this.lineWidth,
        translateX: this.translateX,
        translateY: this.translateY,
        scaleX: this.scaleX,
        scaleY: this.scaleY,
      });
      ops.push({ name: 'save', args: [] });
    },
    restore(this: Record<string, unknown>) {
      Object.assign(this, stack.pop());
      ops.push({ name: 'restore', args: [] });
    },
    translate(this: Record<string, number>, ...args: number[]) {
      this.translateX = required(this.translateX, 'current translation x')
        + required(args[0], 'translate x') * required(this.scaleX, 'current scale x');
      this.translateY = required(this.translateY, 'current translation y')
        + required(args[1], 'translate y') * required(this.scaleY, 'current scale y');
      ops.push({ name: 'translate', args });
    },
    scale(this: Record<string, number>, ...args: number[]) {
      this.scaleX = required(this.scaleX, 'current scale x') * required(args[0], 'scale x');
      this.scaleY = required(this.scaleY, 'current scale y') * required(args[1], 'scale y');
      ops.push({ name: 'scale', args });
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
    beginPath() {
      ops.push({ name: 'beginPath', args: [] });
    },
    arc(...args: number[]) {
      ops.push({ name: 'arc', args });
    },
    fill(this: {
      fillStyle: unknown;
      globalAlpha: number;
      globalCompositeOperation: string;
    }) {
      ops.push({
        name: 'fill',
        args: [],
        value: this.fillStyle,
        alpha: this.globalAlpha,
        composite: this.globalCompositeOperation,
      });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function terrainWithSurface(columns: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  for (const [x, surfaceY] of columns) {
    for (let y = surfaceY; y < CANVAS_HEIGHT; y++) {
      terrain[y * CANVAS_WIDTH + x] = 1;
    }
  }
  return terrain;
}

function projectile(x: number, y: number, age = 10): ProjectileState {
  return {
    x,
    y,
    vx: 4,
    vy: 2,
    weaponType: 'cluster_bomb',
    age,
    hasSplit: true,
    bounces: 0,
  };
}

describe('ProjectileRenderer terrain-projected shadows', () => {
  it('draws one neutral radial ellipse for each valid live projectile', () => {
    const terrain = terrainWithSurface([[100, 400], [200, 350], [300, 300]]);
    const projectiles = [
      projectile(100, 200),
      projectile(200, 320),
      projectile(300, 300),
    ];
    const before = JSON.stringify(projectiles);
    const { ctx, ops } = recordingContext();
    const renderer = new ProjectileRenderer();

    renderer.drawGroundShadows(ctx, projectiles, terrain);

    const gradients = ops.filter((op) => op.name === 'gradient');
    const fills = ops.filter((op) => op.name === 'fill');
    expect(gradients).toHaveLength(2);
    expect(gradients.map((op) => op.args)).toEqual([
      [0, 0, 0, 0, 0, 1],
      [0, 0, 0, 0, 0, 1],
    ]);
    expect(fills).toHaveLength(2);
    expect(ops.filter((op) => op.name === 'translate').map((op) => op.args))
      .toEqual([[100, 401], [200, 351]]);
    expect(ops.some((op) => (
      op.name === 'colorStop'
      && op.args[0] === 1
      && op.value === 'rgba(7, 3, 12, 0)'
    ))).toBe(true);
    expect(ops.filter((op) => op.name === 'colorStop').map((op) => [
      op.args[0],
      op.value,
    ])).toEqual([
      [0, 'rgba(7, 3, 12, 0.86)'],
      [0.55, 'rgba(7, 3, 12, 0.5)'],
      [1, 'rgba(7, 3, 12, 0)'],
      [0, 'rgba(7, 3, 12, 0.86)'],
      [0.55, 'rgba(7, 3, 12, 0.5)'],
      [1, 'rgba(7, 3, 12, 0)'],
    ]);
    expect(fills.every((op) => op.composite === 'source-over')).toBe(true);
    expect(required(fills[0], 'first shadow fill').value)
      .toBe(required(gradients[0], 'first shadow gradient').value);
    expect(required(fills[1], 'second shadow fill').value)
      .toBe(required(gradients[1], 'second shadow gradient').value);
    expect(JSON.stringify(projectiles)).toBe(before);
    expect(ctx.fillStyle).toBe('#caller-fill');
    expect(ctx.globalAlpha).toBe(0.73);
    expect(ctx.globalCompositeOperation).toBe('lighter');
    expect((ctx as unknown as { translateX: number }).translateX).toBe(17);
    expect((ctx as unknown as { translateY: number }).translateY).toBe(-4);
    expect((ctx as unknown as { scaleX: number }).scaleX).toBe(2);
    expect((ctx as unknown as { scaleY: number }).scaleY).toBe(0.5);
  });

  it('applies exact helper geometry and alpha for low and high shells', () => {
    const terrain = terrainWithSurface([[400, 500], [500, 500]]);
    const projectiles = [projectile(400, 480), projectile(500, 100)];
    const expected = projectiles.map((p) => getProjectileGroundShadow(p, terrain));
    const { ctx, ops } = recordingContext();
    const renderer = new ProjectileRenderer();

    renderer.drawGroundShadows(ctx, projectiles, terrain);

    const scales = ops.filter((op) => op.name === 'scale');
    const fills = ops.filter((op) => op.name === 'fill');
    expect(scales.map((op) => op.args)).toEqual(expected.map((cue) => [
      cue!.radiusX,
      cue!.radiusY,
    ]));
    expect(fills.map((op) => op.alpha)).toEqual(expected.map((cue) => cue!.alpha));
    expect(ops.filter((op) => op.name === 'arc').map((op) => op.args))
      .toEqual([[0, 0, 1, 0, Math.PI * 2], [0, 0, 1, 0, Math.PI * 2]]);
  });

  it('restores every caller Canvas field and does no work without a valid cue', () => {
    const terrain = terrainWithSurface([[10, 400]]);
    const { ctx, ops } = recordingContext();
    const renderer = new ProjectileRenderer();

    renderer.drawGroundShadows(ctx, [projectile(10, 400)], terrain);

    expect(ops.filter((op) => op.name === 'gradient')).toHaveLength(0);
    expect(ctx.fillStyle).toBe('#caller-fill');
    expect(ctx.strokeStyle).toBe('#caller-stroke');
    expect(ctx.globalAlpha).toBe(0.73);
    expect(ctx.globalCompositeOperation).toBe('lighter');
    expect(ctx.lineWidth).toBe(4);
    expect((ctx as unknown as { translateX: number }).translateX).toBe(17);
    expect((ctx as unknown as { translateY: number }).translateY).toBe(-4);
    expect((ctx as unknown as { scaleX: number }).scaleX).toBe(2);
    expect((ctx as unknown as { scaleY: number }).scaleY).toBe(0.5);
  });

  it('does not project a surface shadow for an underground Sandhog drill', () => {
    const terrain = terrainWithSurface([[100, 400]]);
    const { ctx, ops } = recordingContext();
    const renderer = new ProjectileRenderer();

    renderer.drawGroundShadows(ctx, [{
      ...projectile(100, 200),
      weaponType: 'sandhog',
      burrowTicksRemaining: 18,
    }], terrain);

    expect(ops.filter((op) => op.name === 'gradient')).toHaveLength(0);
    expect(ops.filter((op) => op.name === 'fill')).toHaveLength(0);
  });
});
