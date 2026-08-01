import { describe, expect, it, vi } from 'vitest';
import type { GameState, WallImpactEvent } from '@shared/types/GameState';
import {
  consumeWallContacts,
  drawSidewalls,
} from './sidewallVisuals';
import { Renderer } from './Renderer';

function context() {
  const ops: string[] = [];
  return {
    ops,
    ctx: {
      save: vi.fn(() => ops.push('save')),
      restore: vi.fn(() => ops.push('restore')),
      beginPath: vi.fn(() => ops.push('begin')),
      moveTo: vi.fn(() => ops.push('move')),
      lineTo: vi.fn(() => ops.push('line')),
      stroke: vi.fn(() => ops.push('stroke')),
      fillRect: vi.fn(() => ops.push('fillRect')),
      setLineDash: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      shadowBlur: 0,
      shadowColor: '',
    } as unknown as CanvasRenderingContext2D,
  };
}

function event(id: number, side: 'left' | 'right' = 'left'): WallImpactEvent {
  return { id, side, x: side === 'left' ? 0.01 : 1199.99, y: 180 };
}

describe('reflective sidewall presentation', () => {
  it('draws two static rails only for reflective rooms', () => {
    const open = context();
    drawSidewalls(open.ctx, 'open', []);
    expect(open.ops).toHaveLength(0);

    const reflective = context();
    drawSidewalls(reflective.ctx, 'reflective', []);
    expect(reflective.ops.filter((op) => op === 'stroke')).toHaveLength(2);
  });

  it('draws paired wrap rails and accents both exit and entry edges', () => {
    const wrap = context();
    drawSidewalls(
      wrap.ctx,
      'wrap',
      [{ ...event(1), age: 0 }],
      false,
    );

    expect(wrap.ops.filter((op) => op === 'stroke')).toHaveLength(2);
    expect(wrap.ops.filter((op) => op === 'fillRect').length).toBeGreaterThanOrEqual(2);
  });

  it('dedupes monotonic contacts and returns one coalesced audio edge', () => {
    expect(consumeWallContacts([event(1), event(2, 'right')], 1)).toEqual({
      lastSeenId: 2,
      contacts: [event(2, 'right')],
      audio: event(2, 'right'),
    });
    expect(consumeWallContacts([event(1)], 2)).toEqual({
      lastSeenId: 2,
      contacts: [],
      audio: null,
    });
  });

  it('keeps rails but suppresses animated contact accents under reduced motion', () => {
    const normal = context();
    drawSidewalls(normal.ctx, 'reflective', [{ ...event(1), age: 0 }], false);
    const reduced = context();
    drawSidewalls(reduced.ctx, 'reflective', [{ ...event(1), age: 0 }], true);

    expect(normal.ops.filter((op) => op === 'fillRect').length).toBeGreaterThan(0);
    expect(reduced.ops.filter((op) => op === 'fillRect')).toHaveLength(0);
    expect(reduced.ops.filter((op) => op === 'stroke')).toHaveLength(2);
  });

  it('routes each authoritative contact to the sink once and re-arms on reset', () => {
    const onWallImpact = vi.fn();
    const onFireActive = vi.fn();
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      bursts: [],
      scorches: [],
      lastSeenExplosionId: 0,
      lastSeenWallImpactId: 0,
      wallContacts: [],
      lastImpact: null,
      prevHealth: new Map(),
      prevMobilityPoses: new Map(),
      mobilityEffects: { clear: vi.fn() },
      prevShieldHp: new Map(),
      shieldBaselineRound: null,
      smokeThrottle: new Map(),
      shake: 0,
      kickX: 0,
      kickY: 0,
      effectsBusy: 0,
      wasFiring: false,
      tankRecoil: null,
      windGust: null,
      windTurnKey: null,
      effects: { clear: vi.fn() },
      projectile: { clear: vi.fn() },
      terrain: { markDirty: vi.fn() },
      prevFireLen: 0,
      prevBounces: new Map(),
      hadProjectileLastFrame: false,
      events: { onWallImpact, onFireActive },
    }) as {
      wallContacts: Array<WallImpactEvent & { age: number }>;
      consumeWallImpacts(state: GameState): void;
      reset(): void;
    };
    const state = { walls: 'wrap', wallImpacts: [event(1)] } as GameState;

    renderer.consumeWallImpacts(state);
    renderer.consumeWallImpacts(state);
    expect(renderer.wallContacts).toEqual([{ ...event(1), age: 0 }]);
    expect(onWallImpact).toHaveBeenCalledWith('left', 'wrap');

    renderer.reset();
    expect(renderer.wallContacts).toEqual([]);
    renderer.consumeWallImpacts(state);
    expect(onWallImpact).toHaveBeenCalledTimes(2);
  });
});
