import { describe, expect, it } from 'vitest';
import { EffectsRenderer } from './EffectsRenderer';

interface ArmorHitState {
  tankId: string;
  x: number;
  y: number;
  color: string;
  strength: number;
  radius: number;
  age: number;
  life: number;
}

interface SparkState {
  color: string;
}

interface EffectsSeam {
  armorHits: ArmorHitState[];
  sparks: SparkState[];
  spawnArmorHit(
    tankId: string,
    x: number,
    y: number,
    amount: number,
    color: string,
  ): void;
  spawnDamage(x: number, y: number, amount: number): void;
  update(terrain: Uint8Array): void;
  draw(ctx: CanvasRenderingContext2D): void;
  clear(): void;
}

interface GradientTrace {
  args: number[];
  stops: Array<[number, string]>;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function requiredPoint(values: unknown[], label: string): [number, number] {
  const [x, y] = values;
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error(`Expected ${label}`);
  }
  return [x, y];
}

interface Op {
  name: string;
  args: unknown[];
  alpha?: number;
  composite?: string;
  fill?: unknown;
  stroke?: unknown;
}

function context() {
  const ops: Op[] = [];
  const gradients: GradientTrace[] = [];
  const stack: Array<Record<string, unknown>> = [];
  const ctx = {
    fillStyle: '#caller-fill' as string | CanvasGradient,
    strokeStyle: '#caller-stroke',
    globalAlpha: 0.63,
    globalCompositeOperation: 'source-over',
    lineWidth: 5,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    font: 'caller-font',
    save(this: Record<string, unknown>) {
      stack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        lineWidth: this.lineWidth,
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
        font: this.font,
      });
      ops.push({ name: 'save', args: [] });
    },
    restore(this: Record<string, unknown>) {
      Object.assign(this, stack.pop());
      ops.push({ name: 'restore', args: [] });
    },
    createRadialGradient(...args: number[]) {
      const trace: GradientTrace = { args, stops: [] };
      gradients.push(trace);
      return {
        addColorStop(offset: number, color: string) {
          trace.stops.push([offset, color]);
        },
      };
    },
    beginPath() { ops.push({ name: 'beginPath', args: [] }); },
    moveTo(...args: number[]) { ops.push({ name: 'moveTo', args }); },
    lineTo(...args: number[]) { ops.push({ name: 'lineTo', args }); },
    arc(...args: number[]) { ops.push({ name: 'arc', args }); },
    fill(this: Record<string, unknown>) {
      ops.push({
        name: 'fill',
        args: [],
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
        fill: this.fillStyle,
      });
    },
    stroke(this: Record<string, unknown>) {
      ops.push({
        name: 'stroke',
        args: [],
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
        stroke: this.strokeStyle,
      });
    },
    fillRect(this: Record<string, unknown>, ...args: number[]) {
      ops.push({
        name: 'fillRect',
        args,
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
        fill: this.fillStyle,
      });
    },
    strokeText() {},
    fillText(this: Record<string, unknown>, text: string, x: number, y: number) {
      ops.push({
        name: 'fillText',
        args: [text, x, y],
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
        fill: this.fillStyle,
      });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops, gradients };
}

function seam(reduceMotion = false): EffectsSeam {
  return new EffectsRenderer(reduceMotion) as unknown as EffectsSeam;
}

describe('EffectsRenderer armor-hit bursts', () => {
  it('coalesces one burst per tank, strengthens it, and avoids duplicate spark fans', () => {
    const renderer = seam();
    renderer.spawnArmorHit('p1', 100, 80, 1, '#00ffcc');

    expect(renderer.armorHits).toEqual([{
      tankId: 'p1',
      x: 100,
      y: 80,
      color: '#00ffcc',
      strength: 0.25,
      radius: 16,
      age: -1,
      life: 14,
    }]);
    expect(renderer.sparks).toHaveLength(4);
    expect(renderer.sparks.map((spark) => spark.color)).toEqual([
      '#00ffcc',
      '#fff7d6',
      '#ffd23f',
      '#00ffcc',
    ]);

    required(renderer.armorHits[0], 'first armor hit').age = 7;
    renderer.spawnArmorHit('p1', 104, 82, 100, '#ff6644');
    expect(renderer.armorHits).toEqual([{
      tankId: 'p1',
      x: 104,
      y: 82,
      color: '#ff6644',
      strength: 1,
      radius: 28,
      age: -1,
      life: 14,
    }]);
    expect(renderer.sparks).toHaveLength(4);

    required(renderer.armorHits[0], 'refreshed armor hit').age = 6;
    renderer.spawnArmorHit('p1', 106, 84, 1, '#ff6644');
    expect(renderer.armorHits[0]).toMatchObject({
      x: 106,
      y: 84,
      strength: 1,
      radius: 28,
      age: -1,
    });
    expect(renderer.sparks).toHaveLength(4);

    renderer.spawnArmorHit('p2', 300, 200, 1, '#44aaff');
    expect(renderer.armorHits.map((hit) => hit.tankId)).toEqual(['p1', 'p2']);
    expect(renderer.sparks).toHaveLength(8);

    required(renderer.armorHits[1], 'second tank armor hit').age = 5;
    const p2BeforeRefresh = { ...required(renderer.armorHits[1], 'second tank armor hit') };
    renderer.spawnArmorHit('p1', 108, 86, 100, '#ff6644');
    expect(renderer.armorHits[1]).toEqual(p2BeforeRefresh);

    const terrain = new Uint8Array(1200 * 600);
    for (let i = 0; i < 9; i++) renderer.update(terrain);
    expect(renderer.armorHits.map((hit) => hit.tankId)).toEqual(['p1']);
    for (let i = 0; i < 6; i++) renderer.update(terrain);
    expect(renderer.armorHits).toHaveLength(0);
  });

  it.each([
    { amount: 1, expected: 4 },
    { amount: 40, expected: 5 },
    { amount: 100, expected: 10 },
  ])('emits the integrated $expected-spark fan for a fresh $amount-point hit', ({
    amount,
    expected,
  }) => {
    const renderer = seam();
    renderer.spawnArmorHit('p1', 100, 80, amount, '#00ffcc');

    expect(renderer.sparks).toHaveLength(expected);
  });

  it('draws a bounded additive owner-color flash before sparks and text', () => {
    const renderer = seam();
    renderer.spawnArmorHit('p1', 100, 80, 100, '#00ffcc');
    renderer.spawnDamage(100, 50, 20);
    const { ctx, ops, gradients } = context();

    renderer.draw(ctx);

    expect(gradients).toEqual([{
      args: [100, 80, 0, 100, 80, 28],
      stops: [
        [0, 'rgba(255, 255, 255, 0.96)'],
        [0.38, '#00ffcc'],
        [1, 'rgba(255, 170, 60, 0)'],
      ],
    }]);
    expect(ops.filter((op) => op.name === 'arc').map((op) => op.args))
      .toEqual([[100, 80, 28, 0, Math.PI * 2]]);
    expect(ops.filter((op) => op.name === 'moveTo')).toHaveLength(3);
    expect(ops.filter((op) => op.name === 'lineTo')).toHaveLength(3);
    const flash = ops.findIndex((op) => op.name === 'fill');
    const spark = ops.findIndex((op) => op.name === 'fillRect');
    const text = ops.findIndex((op) => op.name === 'fillText');
    const glintStroke = ops.findIndex((op) => op.name === 'stroke');
    expect(flash).toBeLessThan(spark);
    expect(glintStroke).toBeLessThan(spark);
    expect(spark).toBeLessThan(text);
    expect(required(ops[flash], 'armor flash draw').composite).toBe('lighter');
    expect(required(ops[spark], 'armor spark draw').composite).toBe('source-over');
    expect(required(ops[text], 'armor damage text draw').composite).toBe('source-over');
    for (const endpoint of ops.filter((op) => op.name === 'lineTo')) {
      const [x, y] = requiredPoint(endpoint.args, 'armor glint endpoint');
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(Math.hypot(x - 100, y - 80)).toBeLessThanOrEqual(28);
    }
    expect(ctx.fillStyle).toBe('#caller-fill');
    expect(ctx.strokeStyle).toBe('#caller-stroke');
    expect(ctx.globalAlpha).toBe(0.63);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(5);
  });

  it('visibly decays the flash and glints through its bounded lifetime', () => {
    const renderer = seam();
    renderer.spawnArmorHit('p1', 100, 80, 100, '#00ffcc');
    required(renderer.armorHits[0], 'decaying armor hit').age = 7;
    const { ctx, ops } = context();

    renderer.draw(ctx);

    expect(required(ops.find((op) => op.name === 'fill'), 'decaying armor flash').alpha)
      .toBeCloseTo(0.23);
    expect(required(ops.find((op) => op.name === 'stroke'), 'decaying armor glint').alpha)
      .toBeCloseTo(0.2);
    const firstGlint = requiredPoint(
      required(ops.find((op) => op.name === 'moveTo'), 'first armor glint').args,
      'first armor glint point',
    );
    expect(firstGlint[0]).toBeCloseTo(100 + Math.cos(0.55) * 10.08);
    expect(firstGlint[1]).toBeCloseTo(80 + Math.sin(0.55) * 10.08);
  });

  it('suppresses decoration but retains numeric information under reduced motion', () => {
    const renderer = seam(true);
    renderer.spawnArmorHit('p1', 100, 80, 50, '#00ffcc');
    renderer.spawnDamage(100, 50, 20);
    const { ctx, ops } = context();
    renderer.draw(ctx);

    expect(renderer.armorHits).toHaveLength(0);
    expect(renderer.sparks).toHaveLength(0);
    expect(ops.filter((op) => op.name === 'fillText').map((op) => op.args[0]))
      .toEqual(['-20']);
    expect(ops.some((op) => op.composite === 'lighter')).toBe(false);
  });

  it.each([
    { label: 'empty identity', tankId: '', x: 100, y: 80, amount: 50, color: '#00ffcc' },
    { label: 'empty color', tankId: 'p1', x: 100, y: 80, amount: 50, color: '' },
    ...[Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY].flatMap((value) => [
      { label: `x=${value}`, tankId: 'p1', x: value, y: 80, amount: 50, color: '#00ffcc' },
      { label: `y=${value}`, tankId: 'p1', x: 100, y: value, amount: 50, color: '#00ffcc' },
      { label: `amount=${value}`, tankId: 'p1', x: 100, y: 80, amount: value, color: '#00ffcc' },
    ]),
  ])('fails malformed input closed: $label', ({ tankId, x, y, amount, color }) => {
    const renderer = seam();
    renderer.spawnArmorHit(tankId, x, y, amount, color);

    expect(renderer.armorHits).toHaveLength(0);
    expect(renderer.sparks).toHaveLength(0);
  });

  it('culls at the exact lifetime and clear removes every live burst', () => {
    const renderer = seam();
    renderer.spawnArmorHit('p1', 100, 80, 50, '#00ffcc');
    const terrain = new Uint8Array(1200 * 600);

    for (let i = 0; i < 14; i++) renderer.update(terrain);
    expect(renderer.armorHits).toHaveLength(1);
    renderer.update(terrain);
    expect(renderer.armorHits).toHaveLength(0);

    renderer.spawnArmorHit('p1', 100, 80, 50, '#00ffcc');
    renderer.clear();
    expect(renderer.armorHits).toHaveLength(0);
    expect(renderer.sparks).toHaveLength(0);
  });
});
