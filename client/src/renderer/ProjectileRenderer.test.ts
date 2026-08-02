import { describe, expect, it } from 'vitest';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import type { ProjectileState } from '@shared/types/GameState';
import { ProjectileRenderer } from './ProjectileRenderer';
import {
  MAX_STREAK_SPEED,
  getProjectileMotionStreak,
} from './projectileMotionStreak';
import { getProjectileVisualProfile } from './projectileVisuals';

interface CanvasTrace {
  operations: string[];
  arcs: number[];
  arcCalls: Array<{
    x: number;
    y: number;
    radius: number;
    alpha: number;
    fill: string;
  }>;
  fills: string[];
  fillCalls: Array<{ style: string; composite: string }>;
  rotations: number[];
  linearGradients: Array<{
    points: [number, number, number, number];
    stops: Array<[number, string]>;
  }>;
  strokeCalls: Array<{
    move: [number, number];
    line: [number, number];
    style: string;
    width: number;
    alpha: number;
    composite: string;
    cap: CanvasLineCap;
  }>;
  radialGradients: Array<{ composite: string }>;
  saves: number;
  restores: number;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function tracingContext(): { ctx: CanvasRenderingContext2D; trace: CanvasTrace } {
  const trace: CanvasTrace = {
    operations: [],
    arcs: [],
    arcCalls: [],
    fills: [],
    fillCalls: [],
    rotations: [],
    linearGradients: [],
    strokeCalls: [],
    radialGradients: [],
    saves: 0,
    restores: 0,
  };
  let fillStyle = '';
  let strokeStyle = '';
  let globalAlpha = 0.37;
  let globalCompositeOperation = 'source-over';
  let lineWidth = 7;
  let lineCap: CanvasLineCap = 'square';
  let move: [number, number] = [0, 0];
  let line: [number, number] = [0, 0];
  const stack: Array<{
    fillStyle: string;
    strokeStyle: string;
    globalAlpha: number;
    globalCompositeOperation: string;
    lineWidth: number;
    lineCap: CanvasLineCap;
  }> = [];

  const ctx = {
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      fillStyle = typeof value === 'string' ? value : '[gradient]';
      trace.fills.push(fillStyle);
    },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      strokeStyle = typeof value === 'string' ? value : '[gradient]';
    },
    get globalAlpha() { return globalAlpha; },
    set globalAlpha(value: number) { globalAlpha = value; },
    get globalCompositeOperation() { return globalCompositeOperation; },
    set globalCompositeOperation(value: string) { globalCompositeOperation = value; },
    get lineWidth() { return lineWidth; },
    set lineWidth(value: number) { lineWidth = value; },
    get lineCap() { return lineCap; },
    set lineCap(value: CanvasLineCap) { lineCap = value; },
    save() {
      trace.saves++;
      trace.operations.push('save');
      stack.push({
        fillStyle,
        strokeStyle,
        globalAlpha,
        globalCompositeOperation,
        lineWidth,
        lineCap,
      });
    },
    restore() {
      trace.restores++;
      trace.operations.push('restore');
      const saved = stack.pop();
      if (saved) {
        ({
          fillStyle,
          strokeStyle,
          globalAlpha,
          globalCompositeOperation,
          lineWidth,
          lineCap,
        } = saved);
      }
    },
    translate() { trace.operations.push('translate'); },
    rotate(angle: number) { trace.rotations.push(angle); trace.operations.push('rotate'); },
    beginPath() { trace.operations.push('beginPath'); },
    closePath() { trace.operations.push('closePath'); },
    moveTo(x: number, y: number) { move = [x, y]; trace.operations.push('moveTo'); },
    lineTo(x: number, y: number) { line = [x, y]; trace.operations.push('lineTo'); },
    bezierCurveTo() { trace.operations.push('bezierCurveTo'); },
    ellipse() { trace.operations.push('ellipse'); },
    arc(x: number, y: number, radius: number) {
      trace.arcs.push(radius);
      trace.arcCalls.push({ x, y, radius, alpha: globalAlpha, fill: fillStyle });
      trace.operations.push('arc');
    },
    fill() {
      trace.fillCalls.push({ style: fillStyle, composite: globalCompositeOperation });
      trace.operations.push('fill');
    },
    stroke() {
      trace.strokeCalls.push({
        move,
        line,
        style: strokeStyle,
        width: lineWidth,
        alpha: globalAlpha,
        composite: globalCompositeOperation,
        cap: lineCap,
      });
      trace.operations.push('stroke');
    },
    fillRect() { trace.operations.push('fillRect'); },
    createRadialGradient() {
      trace.radialGradients.push({ composite: globalCompositeOperation });
      trace.operations.push('createRadialGradient');
      return {
        addColorStop(_offset: number, color: string) {
          trace.fills.push(color);
        },
      };
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      const gradient = {
        points: [x0, y0, x1, y1] as [number, number, number, number],
        stops: [] as Array<[number, string]>,
      };
      trace.linearGradients.push(gradient);
      trace.operations.push('createLinearGradient');
      return {
        addColorStop(offset: number, color: string) {
          gradient.stops.push([offset, color]);
        },
      };
    },
  } as unknown as CanvasRenderingContext2D;

  return { ctx, trace };
}

function projectile(
  weaponType: WeaponType,
  overrides: Partial<ProjectileState> = {},
): ProjectileState {
  return {
    x: 100,
    y: 90,
    vx: 4,
    vy: -3,
    weaponType,
    age: 10,
    hasSplit: false,
    bounces: 0,
    ...overrides,
  };
}

function drawTwice(weaponType: WeaponType): CanvasTrace {
  const renderer = new ProjectileRenderer();
  const { ctx, trace } = tracingContext();
  renderer.draw(ctx, [projectile(weaponType)]);
  renderer.draw(ctx, [projectile(weaponType, { x: 104, y: 87 })]);
  return trace;
}

function countOperation(trace: CanvasTrace, operation: string): number {
  return trace.operations.filter((candidate) => candidate === operation).length;
}

function countSilhouetteStrokes(trace: CanvasTrace): number {
  return trace.strokeCalls.filter((call) => call.style !== '[gradient]').length;
}

function countSilhouetteLines(trace: CanvasTrace): number {
  const motionLines = trace.strokeCalls
    .filter((call) => call.style === '[gradient]')
    .length;
  return countOperation(trace, 'lineTo') - motionLines;
}

describe('ProjectileRenderer weapon signatures', () => {
  it('uses the weapon accent and profile radii for both shell and history trail', () => {
    const baby = drawTwice('baby_missile');
    const nuke = drawTwice('nuke');

    expect(baby.fills).toContain('#ffb347');
    expect(nuke.fills).toContain('#fff7c2');
    expect(baby.arcs).toContain(5);
    expect(baby.arcs).toContain(9);
    expect(nuke.arcs).toContain(7.5);
    expect(nuke.arcs).toContain(18);
  });

  it('draws distinct Canvas silhouettes for every major projectile family', () => {
    const heavy = drawTwice('heavy_missile');
    const nuclear = drawTwice('nuke');
    const earth = drawTwice('dirt_bomb');
    const napalm = drawTwice('napalm');
    const mine = drawTwice('bouncing_betty');
    const airburst = drawTwice('cluster_bomb');

    expect({
      ellipse: countOperation(heavy, 'ellipse'),
      fillRect: countOperation(heavy, 'fillRect'),
      stroke: countSilhouetteStrokes(heavy),
      closePath: countOperation(heavy, 'closePath'),
    }).toEqual({ ellipse: 2, fillRect: 2, stroke: 0, closePath: 0 });
    expect({
      ellipse: countOperation(nuclear, 'ellipse'),
      fillRect: countOperation(nuclear, 'fillRect'),
      stroke: countSilhouetteStrokes(nuclear),
      closePath: countOperation(nuclear, 'closePath'),
    }).toEqual({ ellipse: 0, fillRect: 0, stroke: 2, closePath: 0 });
    expect({
      lineTo: countSilhouetteLines(earth),
      closePath: countOperation(earth, 'closePath'),
      stroke: countSilhouetteStrokes(earth),
      bezierCurveTo: countOperation(earth, 'bezierCurveTo'),
    }).toEqual({ lineTo: 8, closePath: 2, stroke: 0, bezierCurveTo: 0 });
    expect({
      lineTo: countSilhouetteLines(napalm),
      closePath: countOperation(napalm, 'closePath'),
      stroke: countSilhouetteStrokes(napalm),
      bezierCurveTo: countOperation(napalm, 'bezierCurveTo'),
    }).toEqual({ lineTo: 0, closePath: 2, stroke: 0, bezierCurveTo: 4 });
    expect({
      lineTo: countSilhouetteLines(mine),
      closePath: countOperation(mine, 'closePath'),
      stroke: countSilhouetteStrokes(mine),
      bezierCurveTo: countOperation(mine, 'bezierCurveTo'),
    }).toEqual({ lineTo: 4, closePath: 0, stroke: 2, bezierCurveTo: 0 });
    expect({
      lineTo: countSilhouetteLines(airburst),
      fillRect: countOperation(airburst, 'fillRect'),
      stroke: countSilhouetteStrokes(airburst),
      closePath: countOperation(airburst, 'closePath'),
    }).toEqual({ lineTo: 6, fillRect: 2, stroke: 0, closePath: 2 });
  });

  it('resets at ground entry and suppresses only the decorative drill wake for reduced motion', () => {
    const renderer = new ProjectileRenderer();
    renderer.draw(tracingContext().ctx, [projectile('sandhog', { age: 1 })]);
    renderer.draw(tracingContext().ctx, [projectile('sandhog', { x: 104, age: 2 })]);

    const entry = tracingContext();
    renderer.draw(entry.ctx, [projectile('sandhog', {
      x: 108,
      y: 94,
      age: 3,
      burrowTicksRemaining: 22,
    })]);
    expect(entry.trace.arcs).toHaveLength(1);

    const active = tracingContext();
    renderer.draw(active.ctx, [projectile('sandhog', {
      x: 111.2,
      y: 96.4,
      age: 4,
      burrowTicksRemaining: 21,
    })]);
    expect(active.trace.arcs).toHaveLength(2);

    const reduced = new ProjectileRenderer(true);
    reduced.draw(tracingContext().ctx, [projectile('sandhog', {
      age: 3,
      burrowTicksRemaining: 22,
    })]);
    const reducedNext = tracingContext();
    reduced.draw(reducedNext.ctx, [projectile('sandhog', {
      x: 103.2,
      y: 92.4,
      age: 4,
      burrowTicksRemaining: 21,
    })]);
    expect(reducedNext.trace.arcs).toHaveLength(1);
    expect(reducedNext.trace.linearGradients).toHaveLength(0);
  });

  it('draws split airburst children smaller with their own finned silhouette', () => {
    const renderer = new ProjectileRenderer();
    const parentContext = tracingContext();
    const childContext = tracingContext();

    renderer.draw(parentContext.ctx, [projectile('mirv')]);
    renderer.draw(childContext.ctx, [projectile('mirv', { hasSplit: true })]);

    expect(parentContext.trace.operations).toContain('closePath');
    expect(childContext.trace.operations).not.toContain('closePath');
    expect(childContext.trace.operations).toContain('stroke');
    // The real split is co-located: semantic identity, not distance, must reset
    // slot 0 so the child does not repaint the carrier's trail.
    expect(childContext.trace.arcs).toHaveLength(2);
    expect(Math.max(...childContext.trace.arcs)).toBeLessThan(
      Math.max(...parentContext.trace.arcs),
    );
  });

  it('orients silhouettes along velocity and balances Canvas state', () => {
    const renderer = new ProjectileRenderer();
    const { ctx, trace } = tracingContext();
    ctx.fillStyle = 'sentinel-fill';
    ctx.strokeStyle = 'sentinel-stroke';
    ctx.globalAlpha = 0.37;
    ctx.lineWidth = 7;
    ctx.lineCap = 'square';

    renderer.draw(ctx, [projectile('napalm', { vx: 0, vy: 5 })]);

    expect(trace.rotations).toContain(Math.PI / 2);
    expect(trace.saves).toBeGreaterThan(0);
    expect(trace.saves).toBe(trace.restores);
    expect(ctx.fillStyle).toBe('sentinel-fill');
    expect(ctx.strokeStyle).toBe('sentinel-stroke');
    expect(ctx.globalAlpha).toBe(0.37);
    expect(ctx.lineWidth).toBe(7);
    expect(ctx.lineCap).toBe('square');
  });

  it('draws trail before halo before silhouette and wires both interpolation endpoints', () => {
    const renderer = new ProjectileRenderer();
    renderer.draw(tracingContext().ctx, [projectile('hot_napalm', { x: 100, age: 1 })]);
    renderer.draw(tracingContext().ctx, [projectile('hot_napalm', { x: 104, age: 2 })]);
    const { ctx, trace } = tracingContext();

    renderer.draw(ctx, [projectile('hot_napalm', { x: 108, age: 3 })]);

    expect(trace.arcCalls.slice(0, 2)).toEqual([
      { x: 100, y: 90, radius: 7, alpha: 0.1, fill: '#ff3a00' },
      { x: 104, y: 90, radius: 2.3, alpha: 0.52, fill: '#ff3a00' },
    ]);
    const trailArc = trace.operations.indexOf('arc');
    const motion = trace.operations.indexOf('createLinearGradient');
    const halo = trace.operations.indexOf('createRadialGradient');
    const silhouette = trace.operations.indexOf('translate');
    expect(trailArc).toBeLessThan(motion);
    expect(motion).toBeLessThan(halo);
    expect(halo).toBeLessThan(silhouette);
  });

  it('draws one bounded velocity ribbon between history and the live payload', () => {
    const renderer = new ProjectileRenderer();
    const { ctx, trace } = tracingContext();
    ctx.fillStyle = 'sentinel-fill';
    ctx.strokeStyle = 'sentinel-stroke';
    ctx.globalAlpha = 0.37;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 7;
    ctx.lineCap = 'square';

    renderer.draw(ctx, [projectile('nuke', { vx: 3, vy: 4, age: 0 })]);

    expect(trace.linearGradients).toHaveLength(1);
    const gradient = required(trace.linearGradients[0], 'motion gradient');
    expect(gradient.stops).toEqual([
      [0, 'rgba(255, 247, 194, 0)'],
      [0.6, 'rgba(255, 247, 194, 0.5)'],
      [1, '#fff7c2'],
    ]);
    const motionStrokes = trace.strokeCalls.filter((call) => call.style === '[gradient]');
    expect(motionStrokes).toHaveLength(2);
    for (const stroke of motionStrokes) {
      expect(stroke.move[0]).toBeLessThan(stroke.line[0]);
      expect(stroke.move[1]).toBeLessThan(stroke.line[1]);
      expect(stroke.composite).toBe('screen');
      expect(stroke.cap).toBe('round');
      expect([...stroke.move, ...stroke.line, stroke.width, stroke.alpha]
        .every(Number.isFinite)).toBe(true);
      expect(stroke.alpha).toBeGreaterThan(0);
      expect(stroke.alpha).toBeLessThanOrEqual(0.44);
    }
    expect(required(motionStrokes[0], 'outer motion stroke').width).toBe(5);
    expect(required(motionStrokes[1], 'inner motion stroke').width).toBeCloseTo(1.6);
    const expected = getProjectileMotionStreak(3, 4, 6)!;
    expect(gradient.points[0]).toBeCloseTo(100 + expected.tailOffsetX);
    expect(gradient.points[1]).toBeCloseTo(90 + expected.tailOffsetY);
    expect(gradient.points[2]).toBeCloseTo(100 + expected.headOffsetX);
    expect(gradient.points[3]).toBeCloseTo(90 + expected.headOffsetY);
    const [tailX, tailY, headX, headY] = gradient.points;
    expect(Math.hypot(headX - tailX, headY - tailY)).toBeGreaterThanOrEqual(6);
    expect(Math.hypot(headX - tailX, headY - tailY)).toBeLessThanOrEqual(28);
    expect(Math.hypot(headX - 100, headY - 90)).toBeLessThanOrEqual(2);
    expect(required(trace.radialGradients[0], 'payload halo gradient').composite)
      .toBe('source-over');
    expect(trace.fillCalls.at(-1)?.composite).toBe('source-over');

    const motion = trace.operations.indexOf('createLinearGradient');
    const halo = trace.operations.indexOf('createRadialGradient');
    const silhouette = trace.operations.indexOf('translate');
    expect(motion).toBeGreaterThanOrEqual(0);
    expect(motion).toBeLessThan(halo);
    expect(halo).toBeLessThan(silhouette);

    expect(ctx.fillStyle).toBe('sentinel-fill');
    expect(ctx.strokeStyle).toBe('sentinel-stroke');
    expect(ctx.globalAlpha).toBe(0.37);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(7);
    expect(ctx.lineCap).toBe('square');

    const translated = tracingContext();
    new ProjectileRenderer().draw(translated.ctx, [projectile('nuke', {
      x: 407,
      y: 311,
      vx: 3,
      vy: 4,
      age: 0,
    })]);
    const translatedPoints = required(
      translated.trace.linearGradients[0],
      'translated motion gradient',
    ).points;
    expect(translatedPoints[0] - tailX).toBeCloseTo(307);
    expect(translatedPoints[1] - tailY).toBeCloseTo(221);
    expect(translatedPoints[2] - headX).toBeCloseTo(307);
    expect(translatedPoints[3] - headY).toBeCloseTo(221);
  });

  it('consumes live speed/direction and scales newly split children without history', () => {
    const renderer = new ProjectileRenderer();
    const slow = tracingContext();
    const fast = tracingContext();
    const reverse = tracingContext();
    const child = tracingContext();
    const stopped = tracingContext();

    renderer.draw(slow.ctx, [projectile('mirv', { vx: 1, vy: 0, age: 0 })]);
    renderer.clear();
    renderer.draw(fast.ctx, [projectile('mirv', {
      vx: MAX_STREAK_SPEED,
      vy: 0,
      age: 0,
    })]);
    renderer.clear();
    renderer.draw(reverse.ctx, [projectile('mirv', {
      vx: -MAX_STREAK_SPEED,
      vy: 0,
      age: 0,
    })]);
    renderer.clear();
    renderer.draw(child.ctx, [projectile('mirv', {
      vx: MAX_STREAK_SPEED,
      vy: 0,
      age: 0,
      hasSplit: true,
    })]);
    renderer.clear();
    renderer.draw(stopped.ctx, [projectile('mirv', { vx: 0, vy: 0, age: 0 })]);

    const segmentLength = (trace: CanvasTrace): number => {
      const [x0, y0, x1, y1] = required(
        trace.linearGradients[0],
        'motion gradient for segment length',
      ).points;
      return Math.hypot(x1 - x0, y1 - y0);
    };
    expect(segmentLength(fast.trace)).toBeGreaterThan(segmentLength(slow.trace));
    expect(required(fast.trace.strokeCalls[1], 'fast inner stroke').alpha)
      .toBeGreaterThan(required(slow.trace.strokeCalls[1], 'slow inner stroke').alpha);
    expect(fast.trace.strokeCalls.slice(0, 2).map((stroke) => stroke.alpha))
      .toEqual([0.44 * 0.6, 0.44]);
    expect(fast.trace.strokeCalls.slice(0, 2)
      .every((stroke) => stroke.alpha <= 0.44)).toBe(true);
    const fastGradient = required(fast.trace.linearGradients[0], 'fast motion gradient');
    const reverseGradient = required(reverse.trace.linearGradients[0], 'reverse motion gradient');
    expect(fastGradient.points[0]).toBeLessThan(fastGradient.points[2]);
    expect(reverseGradient.points[0]).toBeGreaterThan(reverseGradient.points[2]);
    expect(child.trace.linearGradients).toHaveLength(1);
    expect(required(child.trace.strokeCalls[0], 'child outer stroke').width)
      .toBeLessThan(required(fast.trace.strokeCalls[0], 'fast outer stroke').width);
    expect(child.trace.arcs).toHaveLength(2);
    expect(stopped.trace.linearGradients).toHaveLength(0);

    for (const value of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]) {
      for (const coordinates of [{ x: value }, { y: value }]) {
        renderer.clear();
        const malformedPosition = tracingContext();
        renderer.draw(malformedPosition.ctx, [projectile('mirv', {
          ...coordinates,
          vx: MAX_STREAK_SPEED,
          vy: 0,
          age: 0,
        })]);
        expect(malformedPosition.trace.linearGradients).toHaveLength(0);
      }
    }
  });

  it('wires each major family trail profile through the Canvas seam', () => {
    const signatures = new Set<string>();
    for (const weaponType of [
      'heavy_missile',
      'dirt_bomb',
      'napalm',
      'bouncing_betty',
      'cluster_bomb',
    ] as const) {
      const renderer = new ProjectileRenderer();
      renderer.draw(tracingContext().ctx, [projectile(weaponType, { x: 100, age: 1 })]);
      renderer.draw(tracingContext().ctx, [projectile(weaponType, { x: 104, age: 2 })]);
      const frame = tracingContext();
      renderer.draw(frame.ctx, [projectile(weaponType, { x: 108, age: 3 })]);
      const profile = getProjectileVisualProfile(projectile(weaponType));
      const trail = frame.trace.arcCalls.slice(0, 2).map((call) => ({
        radius: call.radius,
        alpha: call.alpha,
        fill: call.fill,
      }));

      const oldTrail = required(trail[0], `${weaponType} old trail sample`);
      const newTrail = required(trail[1], `${weaponType} new trail sample`);

      expect(oldTrail.fill).toBe(profile.accent);
      expect(oldTrail.radius).toBeCloseTo(profile.trailRadiusMax);
      expect(oldTrail.alpha).toBeCloseTo(profile.trailAlphaOld);
      expect(newTrail.fill).toBe(profile.accent);
      expect(newTrail.radius).toBeCloseTo(profile.trailRadiusMin);
      expect(newTrail.alpha).toBeCloseTo(profile.trailAlphaNew);
      signatures.add(JSON.stringify(trail.map((entry) => ({
        ...entry,
        radius: entry.radius.toFixed(3),
        alpha: entry.alpha.toFixed(3),
      }))));
    }
    expect(signatures.size).toBe(5);
  });

  it('keeps exactly 30 history samples and honors the 100px discontinuity boundary', () => {
    const capacityRenderer = new ProjectileRenderer();
    for (let age = 0; age < 30; age++) {
      capacityRenderer.draw(
        tracingContext().ctx,
        [projectile('baby_missile', { x: 100 + age, age })],
      );
    }
    const capacityFrame = tracingContext();
    capacityRenderer.draw(
      capacityFrame.ctx,
      [projectile('baby_missile', { x: 130, age: 30 })],
    );
    // 29 retained trail puffs + one halo; the shell itself is an ellipse.
    expect(capacityFrame.trace.arcs).toHaveLength(30);

    const boundaryRenderer = new ProjectileRenderer();
    boundaryRenderer.draw(
      tracingContext().ctx,
      [projectile('baby_missile', { x: 0, y: 0, age: 0 })],
    );
    const exactBoundary = tracingContext();
    boundaryRenderer.draw(
      exactBoundary.ctx,
      [projectile('baby_missile', { x: 100, y: 0, age: 1 })],
    );
    expect(exactBoundary.trace.arcs).toHaveLength(2);

    const beyondBoundary = tracingContext();
    boundaryRenderer.draw(
      beyondBoundary.ctx,
      [projectile('baby_missile', { x: 200.01, y: 0, age: 2 })],
    );
    expect(beyondBoundary.trace.arcs).toHaveLength(1);
  });

  it('starts a fresh trail after a wrap transfer instead of crossing the arena', () => {
    const renderer = new ProjectileRenderer();
    renderer.draw(
      tracingContext().ctx,
      [projectile('baby_missile', { x: 1198, y: 90, age: 8 })],
    );
    const afterPortal = tracingContext();
    renderer.draw(
      afterPortal.ctx,
      [projectile('baby_missile', { x: 3, y: 91, age: 9 })],
    );

    // A fresh payload halo only: the pre-transfer point cannot become a trail.
    expect(afterPortal.trace.arcs).toHaveLength(1);
  });

  it('resets all histories when split children compact or the live count changes', () => {
    const renderer = new ProjectileRenderer();
    const children: [ProjectileState, ProjectileState] = [
      projectile('mirv', { x: 100, hasSplit: true, age: 1 }),
      projectile('mirv', { x: 150, hasSplit: true, age: 1 }),
    ];
    renderer.draw(tracingContext().ctx, children);
    renderer.draw(tracingContext().ctx, [
      { ...children[0], x: 104, age: 2 },
      { ...children[1], x: 154, age: 2 },
    ]);

    const compacted = tracingContext();
    renderer.draw(compacted.ctx, [{ ...children[1], x: 158, age: 3 }]);
    expect(compacted.trace.arcs).toHaveLength(2);

    const regrown = tracingContext();
    renderer.draw(regrown.ctx, [
      { ...children[1], x: 162, age: 4 },
      projectile('mirv', { x: 200, hasSplit: true, age: 1 }),
    ]);
    // Both children have only halo + core after count 1 -> 2.
    expect(regrown.trace.arcs).toHaveLength(4);
  });

  it('retains identity, discontinuity, and clear semantics without mutating state', () => {
    const renderer = new ProjectileRenderer();
    const state = projectile('baby_missile');
    const before = { ...state };

    renderer.draw(tracingContext().ctx, [state]);
    renderer.draw(tracingContext().ctx, [{ ...state, x: 4, age: 1 }]);

    const weaponChanged = tracingContext();
    renderer.draw(weaponChanged.ctx, [projectile('missile', { x: 8, age: 2 })]);
    expect(weaponChanged.trace.arcs).toHaveLength(1);

    renderer.draw(tracingContext().ctx, [projectile('missile', { x: 12, age: 3 })]);
    const ageRewound = tracingContext();
    renderer.draw(ageRewound.ctx, [projectile('missile', { x: 16, age: 0 })]);
    expect(ageRewound.trace.arcs).toHaveLength(1);

    renderer.clear();
    const afterClear = tracingContext();
    renderer.draw(afterClear.ctx, [{ ...state, x: 20 }]);
    expect(afterClear.trace.arcs).toHaveLength(1);
    expect(state).toEqual(before);
  });
});
