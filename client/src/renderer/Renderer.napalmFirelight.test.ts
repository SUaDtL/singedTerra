import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import type { FireCell, GameState } from '@shared/types/GameState';
import { Renderer } from './Renderer';

interface FillTrace {
  readonly style: unknown;
  readonly composite: string;
  readonly alpha: number;
}

interface FirelightSeam {
  ctx: CanvasRenderingContext2D;
  drawFire(state: GameState): void;
}

function recordingContext() {
  const ops: Array<{ name: string; args: number[]; value?: unknown }> = [];
  const fills: FillTrace[] = [];
  const stack: Array<Record<string, unknown>> = [];
  const ctx = {
    fillStyle: '#caller-fill',
    globalAlpha: 0.73,
    globalCompositeOperation: 'source-over',
    save(this: Record<string, unknown>) {
      stack.push({
        fillStyle: this.fillStyle,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
      });
      ops.push({ name: 'save', args: [] });
    },
    restore(this: Record<string, unknown>) {
      Object.assign(this, stack.pop());
      ops.push({ name: 'restore', args: [] });
    },
    translate(...args: number[]) {
      ops.push({ name: 'translate', args });
    },
    scale(...args: number[]) {
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
    moveTo(...args: number[]) {
      ops.push({ name: 'moveTo', args });
    },
    lineTo(...args: number[]) {
      ops.push({ name: 'lineTo', args });
    },
    closePath() {
      ops.push({ name: 'closePath', args: [] });
    },
    fill(this: Record<string, unknown>) {
      fills.push({
        style: this.fillStyle,
        composite: this.globalCompositeOperation as string,
        alpha: this.globalAlpha as number,
      });
      ops.push({ name: 'fill', args: [], value: this.fillStyle });
    },
    fillRect(this: Record<string, unknown>, ...args: number[]) {
      fills.push({
        style: this.fillStyle,
        composite: this.globalCompositeOperation as string,
        alpha: this.globalAlpha as number,
      });
      ops.push({ name: 'fillRect', args, value: this.fillStyle });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills, ops };
}

function terrainUnder(fire: readonly FireCell[], surfaceY = 300): Uint8Array {
  const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  for (const { x } of fire) {
    for (let y = surfaceY; y < CANVAS_HEIGHT; y++) {
      terrain[y * CANVAS_WIDTH + x] = 1;
    }
  }
  return terrain;
}

function state(fire: FireCell[], terrain = terrainUnder(fire)): GameState {
  return { fire, terrain } as unknown as GameState;
}

function seam() {
  const recorded = recordingContext();
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx: recorded.ctx,
  }) as FirelightSeam;
  return { ...recorded, renderer };
}

describe('Renderer pooled napalm firelight', () => {
  it('draws one exact additive elliptical bloom before four unchanged flame tongues', () => {
    const fire = [
      { x: 100, life: 36 },
      { x: 101, life: 36 },
      { x: 102, life: 36 },
      { x: 103, life: 36 },
    ];
    const { ctx, fills, ops, renderer } = seam();

    renderer.drawFire(state(fire));

    const gradient = ops.find((op) => op.name === 'gradient');
    const gradientFill = fills.find((fill) => fill.style === gradient?.value);
    expect(gradient?.args).toEqual([0, 0, 0, 0, 0, 1]);
    expect(
      ops
        .filter((op) => op.name === 'colorStop')
        .map(({ args, value }) => [args[0], value]),
    ).toEqual([
      [0, 'rgba(255, 210, 63, 0.92)'],
      [0.42, 'rgba(255, 90, 31, 0.58)'],
      [1, 'rgba(255, 90, 31, 0)'],
    ]);
    expect(ops.find((op) => op.name === 'translate')?.args).toEqual([101.5, 294]);
    expect(ops.find((op) => op.name === 'scale')?.args).toEqual([22.6, 40]);
    expect(ops.find((op) => op.name === 'arc')?.args).toEqual([
      0, 0, 1, 0, Math.PI * 2,
    ]);
    expect(gradientFill).toEqual({
      style: gradient?.value,
      composite: 'lighter',
      alpha: 0.18,
    });
    expect(ops.filter((op) => op.name === 'fillRect')).toHaveLength(0);
    expect(fills).toHaveLength(1 + fire.length * 2);
    expect(fills.slice(1).every(({ composite }) => composite === 'source-over'))
      .toBe(true);
    const gradientFillIndex = ops.findIndex(
      (op) => op.name === 'fill' && op.value === gradient?.value,
    );
    expect(gradientFillIndex).toBeGreaterThanOrEqual(0);
    expect(gradientFillIndex).toBeLessThan(
      ops.findIndex((op) => op.name === 'moveTo'),
    );
    expect(ctx.fillStyle).toBe('#caller-fill');
    expect(ctx.globalAlpha).toBe(0.73);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('splits a 33-column field into two gradients without mutating fire or terrain', () => {
    const fire = Array.from(
      { length: 33 },
      (_, index) => ({ x: 200 + index, life: 36 }),
    );
    const terrain = terrainUnder(fire);
    const fireBefore = structuredClone(fire);
    const terrainBefore = terrain.slice();
    const { ops, renderer } = seam();

    renderer.drawFire(state(fire, terrain));

    expect(ops.filter((op) => op.name === 'gradient')).toHaveLength(2);
    expect(ops.filter((op) => op.name === 'save')).toHaveLength(3);
    expect(ops.filter((op) => op.name === 'restore')).toHaveLength(3);
    expect(ops.filter((op) => op.name === 'translate').map((op) => op.args[0]))
      .toEqual([215.5, 232]);
    expect(fire).toEqual(fireBefore);
    expect(terrain).toEqual(terrainBefore);
  });

  it('anchors each bloom to the center column on uneven terrain', () => {
    const fire = [
      { x: 100, life: 36 },
      { x: 101, life: 36 },
      { x: 102, life: 36 },
    ];
    const terrain = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    for (const [x, surfaceY] of [[100, 320], [101, 280], [102, 360]]) {
      for (let y = surfaceY; y < CANVAS_HEIGHT; y++) {
        terrain[y * CANVAS_WIDTH + x] = 1;
      }
    }
    const { ops, renderer } = seam();

    renderer.drawFire(state(fire, terrain));

    expect(ops.find((op) => op.name === 'translate')?.args).toEqual([101, 274]);
  });

  it('omits bloom for a malformed or all-air terrain surface', () => {
    const fire = [{ x: 10, life: 36 }];
    const malformed = seam();
    const allAir = seam();

    malformed.renderer.drawFire(state(fire, new Uint8Array(10)));
    allAir.renderer.drawFire(state(
      fire,
      new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT),
    ));

    expect(malformed.ops.filter((op) => op.name === 'gradient')).toHaveLength(0);
    expect(allAir.ops.filter((op) => op.name === 'gradient')).toHaveLength(0);
  });

  it('does no Canvas work when no fire is active', () => {
    const { ops, renderer } = seam();
    renderer.drawFire(state([], new Uint8Array(0)));
    expect(ops).toEqual([]);
  });
});
