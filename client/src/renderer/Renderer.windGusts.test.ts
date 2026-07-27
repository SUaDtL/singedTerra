import { describe, expect, it, vi } from 'vitest';
import type { GameState } from '@shared/types/GameState';
import { Renderer } from './Renderer';
import {
  getWindGustVisualProfile,
  type WindGustVisualProfile,
} from './windGustVisuals';

interface WindGustState {
  profile: Readonly<WindGustVisualProfile>;
  age: number;
}

interface WindSeam {
  reduceMotion: boolean;
  windTurnKey: string | null;
  windGust: WindGustState | null;
  bursts: unknown[];
  scorches: unknown[];
  shake: number;
  kickX: number;
  kickY: number;
  effectsBusy: number;
  tankRecoil: null;
  ctx: CanvasRenderingContext2D;
  events: null;
  wasFiring: boolean;
  effects: {
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
  tanks: {
    drawAll: ReturnType<typeof vi.fn>;
    drawBuriedMarker: ReturnType<typeof vi.fn>;
  };
  hud: { draw: ReturnType<typeof vi.fn> };
  showAimGuide: boolean;
  aimGuideEnabled: boolean;
  prevHealth: Map<string, number>;
  prevShieldHp: Map<string, number>;
  shieldBaselineRound: number | null;
  smokeThrottle: Map<string, number>;
  lastSeenExplosionId: number;
  lastImpact: null;
  prevFireLen: number;
  prevBounces: Map<number, number>;
  hadProjectileLastFrame: boolean;
  consumeExplosion: ReturnType<typeof vi.fn>;
  trackDamage: ReturnType<typeof vi.fn>;
  drawSky: ReturnType<typeof vi.fn>;
  drawWindGusts: (() => void) & ReturnType<typeof vi.fn>;
  advanceWindGust(): void;
  trackWindGust(state: GameState): void;
  advanceTankRecoil: ReturnType<typeof vi.fn>;
  drawShields: ReturnType<typeof vi.fn>;
  drawFire: ReturnType<typeof vi.fn>;
  drawExplosions: ReturnType<typeof vi.fn>;
  drawFlash: ReturnType<typeof vi.fn>;
  drawScorches: ReturnType<typeof vi.fn>;
  drawLastImpact: ReturnType<typeof vi.fn>;
  drawAimGuide: ReturnType<typeof vi.fn>;
  render(state: GameState): void;
  isAnimating(state: GameState): boolean;
  reset(): void;
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'PLAYER_TURN',
    turn: 0,
    round: 1,
    activePlayerId: 'p1',
    wind: 4,
    tanks: [],
    terrain: new Uint8Array(1200 * 600),
    terrainVersion: 1,
    projectiles: [],
    projectile: null,
    explosions: [],
    lastExplosion: null,
    fire: [],
    ...overrides,
  } as unknown as GameState;
}

function lifecycleSeam(reduceMotion = false): WindSeam {
  return Object.assign(Object.create(Renderer.prototype), {
    reduceMotion,
    windTurnKey: null,
    windGust: null,
  }) as WindSeam;
}

function renderSeam(): WindSeam {
  const renderer = lifecycleSeam();
  Object.assign(renderer, {
    bursts: [],
    scorches: [],
    shake: 0,
    kickX: 0,
    kickY: 0,
    effectsBusy: 0,
    tankRecoil: null,
    ctx: { save: vi.fn(), translate: vi.fn(), restore: vi.fn() },
    events: null,
    wasFiring: false,
    effects: { update: vi.fn(), draw: vi.fn(), clear: vi.fn() },
    projectile: {
      drawGroundShadows: vi.fn(),
      draw: vi.fn(),
      clear: vi.fn(),
    },
    terrain: { draw: vi.fn(), markDirty: vi.fn() },
    tanks: { drawAll: vi.fn(), drawBuriedMarker: vi.fn() },
    hud: { draw: vi.fn() },
    showAimGuide: false,
    aimGuideEnabled: true,
    prevHealth: new Map(),
    prevShieldHp: new Map(),
    shieldBaselineRound: null,
    smokeThrottle: new Map(),
    lastSeenExplosionId: 0,
    lastImpact: null,
    prevFireLen: 0,
    prevBounces: new Map(),
    hadProjectileLastFrame: false,
    consumeExplosion: vi.fn(),
    trackDamage: vi.fn(),
    drawSky: vi.fn(),
    drawWindGusts: vi.fn(function (this: WindSeam) {
      // Keep the real render-route lifetime observable without needing Canvas.
      if (this.windGust) drawnAges.push(this.windGust.age);
    }),
    advanceTankRecoil: vi.fn(),
    drawShields: vi.fn(),
    drawFire: vi.fn(),
    drawExplosions: vi.fn(),
    drawFlash: vi.fn(),
    drawScorches: vi.fn(),
    drawLastImpact: vi.fn(),
    drawAimGuide: vi.fn(),
  });
  return renderer;
}

let drawnAges: number[] = [];

interface StrokeTrace {
  alpha: number;
  composite: string;
  lineWidth: number;
  move: [number, number];
  curve: [number, number, number, number];
}

function canvasContext() {
  const strokes: StrokeTrace[] = [];
  const ops: string[] = [];
  const stack: Array<Record<string, unknown>> = [];
  let move: [number, number] = [0, 0];
  let curve: [number, number, number, number] = [0, 0, 0, 0];
  const ctx = {
    globalAlpha: 0.61,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#caller',
    lineWidth: 7,
    lineCap: 'square',
    save(this: Record<string, unknown>) {
      stack.push({
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
      });
      ops.push('save');
    },
    restore(this: Record<string, unknown>) {
      Object.assign(this, stack.pop());
      ops.push('restore');
    },
    beginPath() { ops.push('beginPath'); },
    moveTo(x: number, y: number) {
      move = [x, y];
      ops.push('moveTo');
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      curve = [cx, cy, x, y];
      ops.push('quadraticCurveTo');
    },
    stroke(this: Record<string, unknown>) {
      strokes.push({
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
        lineWidth: this.lineWidth as number,
        move,
        curve,
      });
      ops.push('stroke');
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokes, ops };
}

function drawWind(
  renderer: WindSeam,
  profile: Readonly<WindGustVisualProfile>,
  age: number,
) {
  renderer.windGust = { profile, age };
  const trace = canvasContext();
  renderer.ctx = trace.ctx;
  renderer.drawWindGusts();
  return trace;
}

describe('Renderer turn-start wind gusts', () => {
  it('admits one gust per finite PLAYER_TURN key and keeps round/turn identities distinct', () => {
    const renderer = lifecycleSeam();
    renderer.trackWindGust(state({ wind: 4 }));
    expect(renderer.windTurnKey).toBe('1:0');
    expect(renderer.windGust).toEqual({
      profile: getWindGustVisualProfile(4),
      age: 0,
    });

    const first = renderer.windGust;
    renderer.trackWindGust(state({ wind: 10 }));
    expect(renderer.windGust).toBe(first);

    renderer.trackWindGust(state({ phase: 'FIRING', turn: 1, wind: -6 }));
    expect(renderer.windTurnKey).toBe('1:0');
    renderer.trackWindGust(state({ turn: 1, wind: -6 }));
    expect(renderer.windTurnKey).toBe('1:1');
    expect(renderer.windGust?.profile.direction).toBe(-1);

    renderer.trackWindGust(state({ round: 2, turn: 1, wind: 2 }));
    expect(renderer.windTurnKey).toBe('2:1');
    expect(renderer.windGust?.profile.strength).toBe(0.2);
  });

  it('records calm/reduced-motion turns without leaving stale animation', () => {
    const renderer = lifecycleSeam();
    renderer.trackWindGust(state({ wind: 8 }));
    renderer.trackWindGust(state({ turn: 1, wind: 0 }));
    expect(renderer.windTurnKey).toBe('1:1');
    expect(renderer.windGust).toBeNull();

    const reduced = lifecycleSeam(true);
    reduced.trackWindGust(state({ wind: -10 }));
    expect(reduced.windTurnKey).toBe('1:0');
    expect(reduced.windGust).toBeNull();
  });

  it('draws exact ages 0 through 47 through the real render route, then releases idle', () => {
    drawnAges = [];
    const renderer = renderSeam();
    const current = state({ wind: 6 });

    renderer.render(current);
    expect(renderer.isAnimating(current)).toBe(true);
    for (let frame = 1; frame < 48; frame++) renderer.render(current);
    expect(drawnAges).toEqual(Array.from({ length: 48 }, (_, age) => age));
    expect(renderer.windGust).toBeNull();
    expect(renderer.isAnimating(current)).toBe(false);

    renderer.render(current);
    expect(drawnAges).toHaveLength(48);
  });

  it('routes the gust after the static sky and before destructible terrain', () => {
    drawnAges = [];
    const renderer = renderSeam();
    renderer.render(state());

    expect(renderer.drawSky.mock.invocationCallOrder[0])
      .toBeLessThan(renderer.drawWindGusts.mock.invocationCallOrder[0]);
    expect(renderer.drawWindGusts.mock.invocationCallOrder[0])
      .toBeLessThan(renderer.terrain.draw.mock.invocationCallOrder[0]);
  });

  it('consumes profile count, length, and speed when drawing light and strong wind', () => {
    const renderer = lifecycleSeam();
    const lightProfile = getWindGustVisualProfile(0.2)!;
    const strongProfile = getWindGustVisualProfile(10)!;
    const lightFirst = drawWind(renderer, lightProfile, 0);
    const lightLater = drawWind(renderer, lightProfile, 10);
    const strongFirst = drawWind(renderer, strongProfile, 0);
    const strongLater = drawWind(renderer, strongProfile, 10);

    expect(lightFirst.strokes).toHaveLength(5);
    expect(strongFirst.strokes).toHaveLength(11);
    expect(lightFirst.strokes[0].curve[2] - lightFirst.strokes[0].move[0])
      .toBeCloseTo(lightProfile.length);
    expect(strongFirst.strokes[0].curve[2] - strongFirst.strokes[0].move[0])
      .toBeCloseTo(strongProfile.length);
    expect(lightLater.strokes[0].curve[2] - lightFirst.strokes[0].curve[2])
      .toBeCloseTo(lightProfile.speed * 10);
    expect(strongLater.strokes[0].curve[2] - strongFirst.strokes[0].curve[2])
      .toBeCloseTo(strongProfile.speed * 10);
  });

  it('bounds every ribbon coordinate and alpha while restoring caller canvas state', () => {
    const renderer = lifecycleSeam();
    const profile = getWindGustVisualProfile(10)!;
    const first = drawWind(renderer, profile, 7);

    expect(first.ops[0]).toBe('save');
    expect(first.ops.at(-1)).toBe('restore');
    for (const stroke of first.strokes) {
      expect(stroke.composite).toBe('screen');
      expect(stroke.alpha).toBeGreaterThan(0);
      expect(stroke.alpha).toBeLessThanOrEqual(0.28);
      expect(stroke.lineWidth).toBeGreaterThanOrEqual(0.8);
      expect(stroke.lineWidth).toBeLessThanOrEqual(2);
      const [tailX, tailY] = stroke.move;
      const [bendX, bendY, headX, headY] = stroke.curve;
      for (const x of [tailX, bendX, headX]) {
        expect(x).toBeGreaterThanOrEqual(-148);
        expect(x).toBeLessThanOrEqual(1348);
      }
      for (const y of [tailY, bendY, headY]) {
        expect(y).toBeGreaterThanOrEqual(64);
        expect(y).toBeLessThanOrEqual(316);
      }
    }
    expect(first.ctx.globalAlpha).toBe(0.61);
    expect(first.ctx.globalCompositeOperation).toBe('source-over');
    expect(first.ctx.strokeStyle).toBe('#caller');
    expect(first.ctx.lineWidth).toBe(7);
    expect(first.ctx.lineCap).toBe('square');
  });

  it('travels in the wind direction and wraps late leftward motion safely', () => {
    const renderer = lifecycleSeam();
    const rightProfile = getWindGustVisualProfile(10)!;
    const rightFirst = drawWind(renderer, rightProfile, 0);
    const rightLater = drawWind(renderer, rightProfile, 10);
    expect(rightLater.strokes[0].curve[2])
      .toBeGreaterThan(rightFirst.strokes[0].curve[2]);

    const leftProfile = getWindGustVisualProfile(-10)!;
    const leftFirst = drawWind(renderer, leftProfile, 0);
    const leftLater = drawWind(renderer, leftProfile, 10);
    expect(leftLater.strokes[0].curve[2]).toBeLessThan(leftFirst.strokes[0].curve[2]);

    const beforeWrap = drawWind(renderer, leftProfile, 22);
    const afterWrap = drawWind(renderer, leftProfile, 23);
    expect(beforeWrap.strokes[0].curve[2]).toBe(-78);
    expect(afterWrap.strokes[0].curve[2]).toBe(1278);
  });

  it('pins the fade-in, peak, and recovery alpha envelope', () => {
    const renderer = lifecycleSeam();
    const profile = getWindGustVisualProfile(10)!;
    const alphaAt = (age: number): number => {
      renderer.windGust = { profile, age };
      const trace = canvasContext();
      renderer.ctx = trace.ctx;
      renderer.drawWindGusts();
      return trace.strokes[0].alpha;
    };

    expect(alphaAt(0)).toBeCloseTo(0.28 * 0.125 * 0.65);
    expect(alphaAt(7)).toBeCloseTo(0.28 * 0.65);
    expect(alphaAt(42)).toBeCloseTo(0.28 * 0.5 * 0.65);
  });

  it('treats an uninitialized optional gust seam as no live animation', () => {
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      ctx: canvasContext().ctx,
    }) as WindSeam;

    expect(() => renderer.drawWindGusts()).not.toThrow();
    expect(() => renderer.advanceWindGust()).not.toThrow();
  });

  it.each([
    ...[Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      .map((round) => ({ round, turn: 0 })),
    ...[Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      .map((turn) => ({ round: 1, turn })),
  ])('ignores malformed turn identity %#', ({ round, turn }) => {
    const renderer = lifecycleSeam();
    renderer.trackWindGust(state({ round, turn, wind: 10 }));

    expect(renderer.windTurnKey).toBeNull();
    expect(renderer.windGust).toBeNull();
  });

  it('reset drops gust state and permits the same opening turn to be observed again', () => {
    const renderer = renderSeam();
    renderer.trackWindGust(state({ wind: 5 }));
    renderer.reset();

    expect(renderer.windTurnKey).toBeNull();
    expect(renderer.windGust).toBeNull();
    renderer.trackWindGust(state({ wind: 5 }));
    expect(renderer.windGust).not.toBeNull();
  });
});
