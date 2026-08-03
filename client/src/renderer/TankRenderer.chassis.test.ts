import { describe, expect, it, vi } from 'vitest';
import { BARREL_LENGTH, barrelTip } from '@shared/engine/Tank';
import type { TankState } from '@shared/types/GameState';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';
import { lightenHex } from '../ui/theme';
import type { TankChassisPainter } from './TankChassisArt';
import { TankRenderer } from './TankRenderer';

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

interface ContextHarness {
  ctx: CanvasRenderingContext2D;
  fillRect: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  strokes: string[];
  gradients: ReturnType<typeof vi.fn>;
}

function contextHarness(): ContextHarness {
  let strokeStyle = '';
  const strokes: string[] = [];
  const fillRect = vi.fn();
  const lineTo = vi.fn();
  const gradients = vi.fn(() => ({ addColorStop: vi.fn() }));
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      strokeStyle = typeof value === 'string' ? value : '[gradient]';
    },
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo,
    arc: vi.fn(),
    ellipse: vi.fn(),
    fillRect,
    fill: vi.fn(),
    stroke: vi.fn(() => strokes.push(strokeStyle)),
    createRadialGradient: gradients,
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillRect, lineTo, strokes, gradients };
}

function chassis(drawResult = true): {
  painter: TankChassisPainter;
  draw: ReturnType<typeof vi.fn>;
} {
  const draw = vi.fn(() => drawResult);
  return {
    painter: {
      isSettled: false,
      draw,
    },
    draw,
  };
}

describe('TankRenderer authored chassis integration', () => {
  it('substitutes only the live procedural chassis and preserves barrel geometry', () => {
    const art = chassis(true);
    const harness = contextHarness();
    const subject = tank();
    const tip = barrelTip(subject, BARREL_LENGTH);

    new TankRenderer(art.painter).draw(harness.ctx, subject, false);

    expect(art.draw).toHaveBeenCalledOnce();
    expect(art.draw).toHaveBeenCalledWith(
      harness.ctx,
      subject.x,
      subject.y,
      subject.color,
    );
    expect(harness.fillRect).not.toHaveBeenCalled();
    expect(harness.lineTo).toHaveBeenCalledWith(tip.x, tip.y);
    expect(harness.strokes).toContain(lightenHex(subject.color, 0.48));
    expect(harness.strokes).toContain(lightenHex(subject.color, 0.72));
  });

  it('keeps the procedural chassis as the loading or failure fallback', () => {
    const art = chassis(false);
    const harness = contextHarness();
    const subject = tank();

    new TankRenderer(art.painter).draw(harness.ctx, subject, false);

    expect(art.draw).toHaveBeenCalledOnce();
    expect(harness.fillRect).toHaveBeenCalled();
    expect(harness.lineTo).toHaveBeenCalled();
  });

  it('keeps active and damaged overlays above authored art', () => {
    const art = chassis(true);
    const active = contextHarness();
    const damaged = contextHarness();
    const renderer = new TankRenderer(art.painter);

    renderer.draw(active.ctx, tank(), true);
    renderer.draw(damaged.ctx, tank({ health: 20 }), false);

    expect(active.gradients).toHaveBeenCalledOnce();
    expect(active.fillRect).not.toHaveBeenCalled();
    expect(damaged.fillRect).toHaveBeenCalled();
    expect(damaged.strokes).toContain('#0d0600');
  });

  it('leaves dead-tank wreck rendering isolated from authored art', () => {
    const art = chassis(true);
    const harness = contextHarness();

    new TankRenderer(art.painter).draw(
      harness.ctx,
      tank({ alive: false, health: 0 }),
      true,
    );

    expect(art.draw).not.toHaveBeenCalled();
    expect(harness.gradients).not.toHaveBeenCalled();
  });

  it('contains recoil translation around the authored chassis draw', () => {
    const observations: Array<[number, number]> = [];
    let transform = { x: 0, y: 0 };
    const stack: Array<typeof transform> = [];
    const art = chassis(true);
    art.draw.mockImplementation(() => {
      observations.push([transform.x, transform.y]);
      return true;
    });
    const harness = contextHarness();
    harness.ctx.save = vi.fn(() => stack.push({ ...transform }));
    harness.ctx.translate = vi.fn((x: number, y: number) => {
      transform = { x: transform.x + x, y: transform.y + y };
    });
    harness.ctx.restore = vi.fn(() => {
      transform = stack.pop() ?? { x: 0, y: 0 };
    });
    const renderer = new TankRenderer(art.painter);

    renderer.drawAll(
      harness.ctx,
      [tank(), tank({ id: 'p2', x: 540 })],
      'p1',
      { tankId: 'p1', offsetX: -3, offsetY: 1 },
    );

    expect(observations).toEqual([
      [-3, 1],
      [0, 0],
    ]);
    expect(transform).toEqual({ x: 0, y: 0 });
  });
});
