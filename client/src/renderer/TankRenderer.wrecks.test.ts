import { describe, expect, it, vi } from 'vitest';
import type { TankState } from '@shared/types/GameState';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';
import { darkenHex, lightenHex } from '../ui/theme';
import { TankRenderer } from './TankRenderer';

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new Error(`Expected ${label}`);
  return value;
}

interface DrawOp {
  op: string;
  args: number[];
  fillStyle: string;
  strokeStyle: string;
  globalAlpha: number;
  lineWidth: number;
}

interface CanvasTrace {
  ops: DrawOp[];
  depth: number;
  underflow: boolean;
  state: {
    fillStyle: string;
    strokeStyle: string;
    globalAlpha: number;
    lineWidth: number;
    lineCap: CanvasLineCap;
  };
}

function tracingContext(): { ctx: CanvasRenderingContext2D; trace: CanvasTrace } {
  const trace: CanvasTrace = {
    ops: [],
    depth: 0,
    underflow: false,
    state: {
      fillStyle: '#caller-fill',
      strokeStyle: '#caller-stroke',
      globalAlpha: 0.73,
      lineWidth: 7,
      lineCap: 'square',
    },
  };
  const stack: CanvasTrace['state'][] = [];
  const record = (op: string, args: number[] = []) => {
    trace.ops.push({
      op,
      args,
      fillStyle: trace.state.fillStyle,
      strokeStyle: trace.state.strokeStyle,
      globalAlpha: trace.state.globalAlpha,
      lineWidth: trace.state.lineWidth,
    });
  };

  const raw = {
    get fillStyle() { return trace.state.fillStyle; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      trace.state.fillStyle = typeof value === 'string' ? value : '[gradient]';
    },
    get strokeStyle() { return trace.state.strokeStyle; },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      trace.state.strokeStyle = typeof value === 'string' ? value : '[gradient]';
    },
    get globalAlpha() { return trace.state.globalAlpha; },
    set globalAlpha(value: number) { trace.state.globalAlpha = value; },
    get lineWidth() { return trace.state.lineWidth; },
    set lineWidth(value: number) { trace.state.lineWidth = value; },
    get lineCap() { return trace.state.lineCap; },
    set lineCap(value: CanvasLineCap) { trace.state.lineCap = value; },
    save() {
      stack.push({ ...trace.state });
      trace.depth++;
      record('save');
    },
    restore() {
      if (stack.length === 0) {
        trace.underflow = true;
      } else {
        trace.state = stack.pop()!;
        trace.depth--;
      }
      record('restore');
    },
    beginPath() { record('beginPath'); },
    closePath() { record('closePath'); },
    moveTo(x: number, y: number) { record('moveTo', [x, y]); },
    lineTo(x: number, y: number) { record('lineTo', [x, y]); },
    arc(...args: number[]) { record('arc', args); },
    ellipse(...args: number[]) { record('ellipse', args); },
    fillRect(...args: number[]) { record('fillRect', args); },
    fill() { record('fill'); },
    stroke() { record('stroke'); },
    createRadialGradient(...args: number[]) {
      record('createRadialGradient', args);
      return { addColorStop() {} };
    },
  };

  return { ctx: raw as unknown as CanvasRenderingContext2D, trace };
}

function tank(overrides: Partial<TankState> = {}): TankState {
  return {
    id: 'p1',
    playerName: 'Ember',
    x: 240,
    y: 410,
    angle: 42,
    power: 62,
    powerCap: 100,
    health: 100,
    fuel: 0,
    selectedWeapon: 'baby_missile',
    inventory: {} as TankState['inventory'],
    accessories: { battery: 0, fuel_tank: 0, parachute: 0 },
    color: '#d65cff',
    loadout: { ...DEFAULT_TANK_LOADOUT },
    alive: true,
    shieldHp: 0,
    ai: null,
    credits: 0,
    roundWins: 0,
    kills: 0,
    totalDamage: 0,
    buried: false,
    buriedTurns: 0,
    ...overrides,
  };
}

describe('TankRenderer persistent wrecks', () => {
  it('draws an ordered low charred wreck with an owner-derived remnant', () => {
    for (const color of ['#d65cff', '#7ad7ff']) {
      const { ctx, trace } = tracingContext();
      new TankRenderer().draw(ctx, tank({ color, alive: false, health: 0 }), true);

      expect(trace.ops.filter((op) => op.op === 'fill').map((op) => op.fillStyle))
        .toEqual([
          '#07030c',
          '#120b0b',
          '#1a1110',
          darkenHex(color, 0.58),
          '#5f4938',
          '#5f4938',
        ]);
      expect(trace.ops.filter((op) => op.op === 'arc')).toHaveLength(2);

      const points = trace.ops
        .filter((op) => op.op === 'moveTo' || op.op === 'lineTo')
        .map((op, index) => [
          requiredNumber(op.args[0], `wreck point ${index} x`) - 240,
          requiredNumber(op.args[1], `wreck point ${index} y`) - 410,
        ]);
      expect(points).toEqual([
        [-17, 0], [15, 0], [12, -5], [-13, -4],
        [-13, -4], [-9, -11], [-2, -13], [5, -11], [13, -6], [10, -3], [-10, -3],
        [-8, -9], [-2, -11], [5, -9], [8, -6], [-6, -6],
        [-11, -4], [-3, -7], [3, -5], [11, -7],
      ]);
    }
  });

  it('omits intact and active-player geometry for dead tanks', () => {
    const active = tracingContext();
    const inactive = tracingContext();
    const renderer = new TankRenderer();
    const destroyed = tank({ alive: false, health: -30 });
    renderer.draw(active.ctx, destroyed, true);
    renderer.draw(inactive.ctx, destroyed, false);

    expect(active.trace.ops).toEqual(inactive.trace.ops);
    expect(active.trace.ops.some((op) => op.op === 'createRadialGradient')).toBe(false);
    expect(active.trace.ops.some((op) => op.op === 'fillRect')).toBe(false);
    expect(active.trace.ops.some(
      (op) => op.op === 'stroke' && op.strokeStyle === lightenHex('#d65cff', 0.48),
    )).toBe(false);
    expect(active.trace.ops.some(
      (op) => op.op === 'stroke' && op.strokeStyle === lightenHex('#d65cff', 0.72),
    )).toBe(false);
  });

  it('uses alive, not health, as the destroyed-state authority', () => {
    const deadWithHealth = tracingContext();
    const liveAtZeroHealth = tracingContext();
    const renderer = new TankRenderer();

    renderer.draw(deadWithHealth.ctx, tank({ alive: false, health: 100 }), false);
    renderer.draw(liveAtZeroHealth.ctx, tank({ alive: true, health: 0 }), false);

    expect(deadWithHealth.trace.ops.some(
      (op) => op.op === 'fill' && op.fillStyle === '#1a1110',
    )).toBe(true);
    expect(deadWithHealth.trace.ops.some((op) => op.op === 'fillRect')).toBe(false);
    expect(liveAtZeroHealth.trace.ops.some((op) => op.op === 'fillRect')).toBe(true);
    expect(liveAtZeroHealth.trace.ops.some(
      (op) => op.op === 'fill' && op.fillStyle === '#1a1110',
    )).toBe(false);
  });

  it('is deterministic and restores the caller Canvas state exactly', () => {
    const first = tracingContext();
    const second = tracingContext();
    const renderer = new TankRenderer();

    renderer.draw(first.ctx, tank({ alive: false, health: 0 }), false);
    renderer.draw(second.ctx, tank({ alive: false, health: 0 }), false);

    expect(first.trace.ops).toEqual(second.trace.ops);
    expect(first.trace.depth).toBe(0);
    expect(first.trace.underflow).toBe(false);
    expect(first.trace.state).toEqual({
      fillStyle: '#caller-fill',
      strokeStyle: '#caller-stroke',
      globalAlpha: 0.73,
      lineWidth: 7,
      lineCap: 'square',
    });
  });

  it('retains the existing alive active and damaged paths', () => {
    const healthy = tracingContext();
    const damaged = tracingContext();
    const renderer = new TankRenderer();

    renderer.draw(healthy.ctx, tank(), true);
    renderer.draw(damaged.ctx, tank({ health: 20 }), false);

    expect(healthy.trace.ops.some((op) => op.op === 'createRadialGradient')).toBe(true);
    expect(healthy.trace.ops.some((op) => op.op === 'fillRect')).toBe(true);
    expect(healthy.trace.ops.some(
      (op) => op.op === 'stroke' && op.strokeStyle === lightenHex('#d65cff', 0.48),
    )).toBe(true);
    expect(damaged.trace.ops.some(
      (op) => op.op === 'stroke' && op.strokeStyle === '#0d0600',
    )).toBe(true);
  });

  it('drawAll forwards mixed live and dead rows without filtering either', () => {
    const { ctx } = tracingContext();
    const renderer = new TankRenderer();
    const destroyed = tank({ id: 'p1', alive: false, health: 0 });
    const survivor = tank({ id: 'p2', alive: true, health: 80 });
    const draw = vi.spyOn(renderer, 'draw');

    renderer.drawAll(ctx, [destroyed, survivor], survivor.id);

    expect(draw.mock.calls).toEqual([
      [ctx, destroyed, false],
      [ctx, survivor, true],
    ]);
  });
});
