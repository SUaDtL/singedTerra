import { describe, expect, it, vi } from 'vitest';
import { WEAPONS } from '@shared/engine/WeaponSystem';
import type { ExplosionEvent, GameState } from '@shared/types/GameState';
import { Renderer } from './Renderer';

interface BurstProbe {
  age: number;
  lifeFrames: number;
  authored: boolean;
}

interface RendererSeam {
  ctx: CanvasRenderingContext2D;
  bursts: BurstProbe[];
  scorches: unknown[];
  wallContacts: unknown[];
  lastSeenExplosionId: number;
  lastImpact: { x: number; y: number } | null;
  shake: number;
  kickX: number;
  kickY: number;
  impactHoldFrames: number;
  effectsBusy: number;
  reduceMotion: boolean;
  events: null;
  explosionArt: {
    state: 'loading' | 'ready' | 'failed';
    isSettled: boolean;
    draw: ReturnType<typeof vi.fn>;
  };
  effects: { spawnExplosion: ReturnType<typeof vi.fn> };
  mobilityEffects: { isActive: boolean };
  prevMobilityPoses: Map<string, unknown>;
  tankRecoil: null;
  windGust: null;
  drawExplosionSignature: ReturnType<typeof vi.fn>;
  consumeExplosion(state: Pick<GameState, 'explosions' | 'lastExplosion'>): void;
  drawExplosions(): void;
  isAnimating(state: GameState): boolean;
}

function event(
  weaponType: keyof typeof WEAPONS,
  id = 1,
): ExplosionEvent {
  const detonation = WEAPONS[weaponType].detonation;
  return {
    id,
    weaponType,
    cx: 200,
    cy: 220,
    radius: detonation.radius,
    style: detonation.style,
    color: detonation.color,
    durationFrames: detonation.durationFrames,
  };
}

function seam(
  state: 'loading' | 'ready' | 'failed' = 'ready',
  reduceMotion = false,
): RendererSeam {
  const gradient = { addColorStop: vi.fn() };
  const renderer = Object.create(Renderer.prototype) as RendererSeam;
  Object.assign(renderer, {
    ctx: {
      save: vi.fn(),
      restore: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D,
    bursts: [],
    scorches: [],
    wallContacts: [],
    lastSeenExplosionId: 0,
    lastImpact: null,
    shake: 0,
    kickX: 0,
    kickY: 0,
    impactHoldFrames: 0,
    effectsBusy: 0,
    reduceMotion,
    events: null,
    explosionArt: {
      state,
      isSettled: state !== 'loading',
      draw: vi.fn(() => true),
    },
    effects: { spawnExplosion: vi.fn() },
    mobilityEffects: { isActive: false },
    prevMobilityPoses: new Map(),
    tankRecoil: null,
    windGust: null,
    drawExplosionSignature: vi.fn(),
  });
  return renderer;
}

describe('Renderer authored conventional explosions', () => {
  it('redraws only while the atlas load is unresolved, never until a first shot', () => {
    const idle = {
      phase: 'PLAYER_TURN',
      tanks: [],
      projectiles: [],
      fire: [],
    } as unknown as GameState;

    expect(seam('loading').isAnimating(idle)).toBe(true);
    expect(seam('ready').isAnimating(idle)).toBe(false);
    expect(seam('failed').isAnimating(idle)).toBe(false);
  });

  it('snapshots authored eligibility only for ready conventional bursts', () => {
    const renderer = seam('ready');
    renderer.consumeExplosion({
      explosions: [event('missile', 1), event('nuke', 2)],
      lastExplosion: null,
    });

    expect(renderer.bursts.map((burst) => burst.authored)).toEqual([true, false]);
  });

  it('locks loading and reduced-motion bursts to procedural fallback', () => {
    const loading = seam('loading');
    loading.consumeExplosion({ explosions: [event('missile')], lastExplosion: null });
    loading.explosionArt.state = 'ready';
    loading.bursts[0]!.age = Math.ceil(loading.bursts[0]!.lifeFrames * 0.5);
    loading.drawExplosions();

    expect(loading.bursts[0]?.authored).toBe(false);
    expect(loading.explosionArt.draw).not.toHaveBeenCalled();
    expect(loading.drawExplosionSignature).toHaveBeenCalledOnce();

    const reduced = seam('ready', true);
    reduced.consumeExplosion({ explosions: [event('missile')], lastExplosion: null });
    expect(reduced.bursts[0]?.authored).toBe(false);
  });

  it('uses the authored frame when paint succeeds and procedural fallback when it does not', () => {
    const authored = seam('ready');
    authored.consumeExplosion({ explosions: [event('missile')], lastExplosion: null });
    authored.bursts[0]!.age = Math.ceil(authored.bursts[0]!.lifeFrames * 0.5);
    authored.drawExplosions();

    expect(authored.explosionArt.draw).toHaveBeenCalledOnce();
    expect(authored.drawExplosionSignature).not.toHaveBeenCalled();

    const failedPaint = seam('ready');
    failedPaint.explosionArt.draw
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    failedPaint.consumeExplosion({ explosions: [event('missile')], lastExplosion: null });
    failedPaint.bursts[0]!.age = Math.ceil(failedPaint.bursts[0]!.lifeFrames * 0.5);
    failedPaint.drawExplosions();

    expect(failedPaint.explosionArt.draw).toHaveBeenCalledOnce();
    expect(failedPaint.drawExplosionSignature).toHaveBeenCalledOnce();
    expect(failedPaint.bursts[0]?.authored).toBe(false);

    failedPaint.drawExplosions();
    expect(failedPaint.explosionArt.draw).toHaveBeenCalledOnce();
    expect(failedPaint.drawExplosionSignature).toHaveBeenCalledTimes(2);
  });
});
