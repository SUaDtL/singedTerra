import { describe, expect, it } from 'vitest';
import { EffectsRenderer } from './EffectsRenderer';

interface ShieldImpactState {
  x: number;
  y: number;
  strength: number;
  age: number;
  life: number;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

interface TextState {
  text: string;
  color: string;
  size: number;
  age: number;
}

interface EffectsSeam {
  shieldImpacts: ShieldImpactState[];
  texts: TextState[];
  spawnShieldImpact(x: number, y: number, amount: number): void;
}

interface Op {
  name: string;
  args: unknown[];
  stroke?: unknown;
  alpha?: number;
  composite?: string;
  lineWidth?: number;
}

function context() {
  const ops: Op[] = [];
  const stack: Array<Record<string, unknown>> = [];
  const ctx = {
    fillStyle: '#caller-fill',
    strokeStyle: '#caller-stroke',
    globalAlpha: 0.61,
    globalCompositeOperation: 'source-over',
    lineWidth: 4,
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
    beginPath() { ops.push({ name: 'beginPath', args: [] }); },
    moveTo(...args: number[]) { ops.push({ name: 'moveTo', args }); },
    lineTo(...args: number[]) { ops.push({ name: 'lineTo', args }); },
    arc(...args: number[]) { ops.push({ name: 'arc', args }); },
    fillRect() {},
    fill() {},
    stroke(this: Record<string, unknown>) {
      ops.push({
        name: 'stroke',
        args: [],
        stroke: this.strokeStyle,
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
        lineWidth: this.lineWidth as number,
      });
    },
    strokeText(this: Record<string, unknown>, text: string, x: number, y: number) {
      ops.push({
        name: 'strokeText',
        args: [text, x, y],
        stroke: this.strokeStyle,
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
        lineWidth: this.lineWidth as number,
      });
    },
    fillText(this: Record<string, unknown>, text: string, x: number, y: number) {
      ops.push({
        name: 'fillText',
        args: [text, x, y],
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
      });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function seam(reduceMotion = false): EffectsSeam {
  return new EffectsRenderer(reduceMotion) as unknown as EffectsSeam;
}

describe('EffectsRenderer shield-impact response', () => {
  it('stores one bounded impact and an exact rounded blocked-damage readout', () => {
    const renderer = seam();
    renderer.spawnShieldImpact(300, 220, 47.6);

    expect(renderer.shieldImpacts).toEqual([{
      x: 300,
      y: 220,
      strength: 47.6 / 120,
      age: 0,
      life: 28,
    }]);
    expect(renderer.texts).toContainEqual(expect.objectContaining({
      text: 'BLOCK 48',
      color: '#7ad7ff',
      age: 0,
    }));

    renderer.spawnShieldImpact(300, 220, 999);
    expect(required(renderer.shieldImpacts[1], 'heavy shield impact').strength).toBe(1);
    expect(required(renderer.texts[1], 'heavy block text').size).toBe(19);
    renderer.spawnShieldImpact(300, 220, 1);
    expect(required(renderer.shieldImpacts[2], 'light shield impact').strength).toBe(0.25);
    expect(required(renderer.texts[2], 'light block text').size).toBeCloseTo(12.05);
    renderer.spawnShieldImpact(300, 220, 47.4);
    expect(required(renderer.texts[3], 'rounded block text').text).toBe('BLOCK 47');
  });

  it('draws paired expanding rings plus eight facets and restores caller Canvas state', () => {
    const renderer = seam();
    renderer.spawnShieldImpact(300, 220, 60);
    const { ctx, ops } = context();

    (renderer as unknown as EffectsRenderer).draw(ctx);

    expect(ops.filter((op) => op.name === 'arc').map((op) => op.args))
      .toEqual([
        [300, 220, 24, 0, Math.PI * 2],
        [300, 220, 18, 0, Math.PI * 2],
      ]);
    expect(ops.filter((op) => op.name === 'moveTo')).toHaveLength(8);
    expect(ops.filter((op) => op.name === 'lineTo')).toHaveLength(8);
    expect(ops.filter((op) => op.name === 'stroke')).toHaveLength(3);
    expect(ops.some((op) => op.composite === 'lighter')).toBe(true);
    expect(ops.filter((op) => op.name === 'save')).toHaveLength(2);
    expect(ops.filter((op) => op.name === 'restore')).toHaveLength(2);
    const lastRipple = ops.map((op) => op.name).lastIndexOf('stroke');
    const blockText = ops.findIndex(
      (op) => op.name === 'fillText' && op.args[0] === 'BLOCK 60',
    );
    expect(lastRipple).toBeLessThan(blockText);
    expect(required(ops[blockText], 'block text draw').composite).toBe('source-over');
    expect(ctx.fillStyle).toBe('#caller-fill');
    expect(ctx.strokeStyle).toBe('#caller-stroke');
    expect(ctx.globalAlpha).toBe(0.61);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(4);
  });

  it('advances ring radius/fade/facet rotation and scales light versus heavy hits', () => {
    const renderer = seam();
    renderer.spawnShieldImpact(300, 220, 60);
    required(renderer.shieldImpacts[0], 'active shield impact').age = 14;
    const { ctx, ops } = context();

    (renderer as unknown as EffectsRenderer).draw(ctx);

    const strokes = ops.filter((op) => op.name === 'stroke');
    expect(strokes.map((op) => op.lineWidth)).toEqual([2, 1, 1]);
    expect(required(strokes[0], 'outer shield ring').alpha).toBeCloseTo(0.335);
    expect(required(strokes[1], 'inner shield ring').alpha).toBeCloseTo(0.1943);
    expect(required(strokes[2], 'shield facets').alpha).toBeCloseTo(0.26);
    expect(ops.filter((op) => op.name === 'arc').map((op) => op.args))
      .toEqual([
        [300, 220, 33, 0, Math.PI * 2],
        [300, 220, 23, 0, Math.PI * 2],
      ]);
    const expectedMoves: number[][] = [];
    const expectedLines: number[][] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.16;
      expectedMoves.push([
        300 + Math.cos(angle) * 35,
        220 + Math.sin(angle) * 35,
      ]);
      expectedLines.push([
        300 + Math.cos(angle) * 41,
        220 + Math.sin(angle) * 41,
      ]);
    }
    expect(ops.filter((op) => op.name === 'moveTo').map((op) => op.args))
      .toEqual(expectedMoves);
    expect(ops.filter((op) => op.name === 'lineTo').map((op) => op.args))
      .toEqual(expectedLines);

    const light = seam();
    light.spawnShieldImpact(0, 0, 1);
    const lightCanvas = context();
    (light as unknown as EffectsRenderer).draw(lightCanvas.ctx);
    const heavy = seam();
    heavy.spawnShieldImpact(0, 0, 999);
    const heavyCanvas = context();
    (heavy as unknown as EffectsRenderer).draw(heavyCanvas.ctx);
    const lightOuter = required(
      lightCanvas.ops.find((op) => op.name === 'stroke'),
      'light outer shield ring',
    );
    const heavyOuter = required(
      heavyCanvas.ops.find((op) => op.name === 'stroke'),
      'heavy outer shield ring',
    );
    expect(lightOuter.alpha).toBeCloseTo(0.545);
    expect(lightOuter.lineWidth).toBe(1.5);
    expect(heavyOuter.alpha).toBeCloseTo(0.92);
    expect(heavyOuter.lineWidth).toBe(3);
  });

  it('retains information but suppresses moving decoration under reduced motion', () => {
    const renderer = seam(true);
    renderer.spawnShieldImpact(300, 220, 35);
    const { ctx, ops } = context();
    (renderer as unknown as EffectsRenderer).draw(ctx);

    expect(renderer.shieldImpacts).toHaveLength(0);
    expect(renderer.texts).toContainEqual(expect.objectContaining({
      text: 'BLOCK 35',
    }));
    expect(ops.filter((op) => op.name === 'stroke')).toHaveLength(0);
    expect(ops.filter((op) => op.name === 'fillText').map((op) => op.args[0]))
      .toEqual(['BLOCK 35']);
    expect(required(ops.find((op) => op.name === 'fillText'), 'reduced-motion block text').composite)
      .toBe('source-over');
  });

  it('culls at the exact lifetime and clear removes every live impact', () => {
    const renderer = seam();
    renderer.spawnShieldImpact(300, 220, 40);
    const terrain = new Uint8Array(1200 * 600);

    for (let i = 0; i < 27; i++) {
      (renderer as unknown as EffectsRenderer).update(terrain);
    }
    expect(renderer.shieldImpacts).toHaveLength(1);
    (renderer as unknown as EffectsRenderer).update(terrain);
    expect(renderer.shieldImpacts).toHaveLength(0);

    renderer.spawnShieldImpact(300, 220, 40);
    (renderer as unknown as EffectsRenderer).clear();
    expect(renderer.shieldImpacts).toHaveLength(0);
    expect(renderer.texts).toHaveLength(0);
  });
});
