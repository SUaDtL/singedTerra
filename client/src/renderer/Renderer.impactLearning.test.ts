import { describe, expect, it, vi } from 'vitest';
import type { ExplosionEvent, GameState } from '@shared/types/GameState';
import type { ImpactLearningCue } from './impactLearning';
import { Renderer } from './Renderer';

interface LearningBurst {
  cx: number;
  cy: number;
  age: number;
  lifeFrames: number;
  visual: { reachRadius: number };
  cue?: ImpactLearningCue | null;
  learningContext?: {
    shooterId: string;
    round: number;
    turn: number;
    explosionId: number;
  };
}

interface RendererLearningSeam {
  ctx: CanvasRenderingContext2D;
  bursts: LearningBurst[];
  scorches: unknown[];
  lastSeenExplosionId: number;
  lastImpact: { x: number; y: number } | null;
  shake: number;
  kickX: number;
  kickY: number;
  impactHoldFrames: number;
  effectsBusy: number;
  reduceMotion: boolean;
  explosionArt: { state: string };
  events: null;
  effects: {
    spawnExplosion: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  impactMonitor: { draw: ReturnType<typeof vi.fn> };
  showAimGuide: boolean;
  wasFiring: boolean;
  impactLearningShot: { shooterId: string; local: boolean } | null;
  observeShotLaunch(state: Pick<GameState, 'phase' | 'activePlayerId'>): boolean;
  consumeExplosion(state: GameState): void;
  drawImpactMonitor(offset: { x: number; y: number }): void;
  currentImpactLearningCue(): unknown;
}

const cue: ImpactLearningCue = {
  readout: '84 PX LEFT OF CPU 1',
  correction: 'SHIFT IMPACT RIGHT',
};

function rendererHarness(): RendererLearningSeam {
  const renderer = Object.create(Renderer.prototype) as RendererLearningSeam;
  Object.assign(renderer, {
    ctx: {
      canvas: {
        width: 1200,
        height: 600,
        getBoundingClientRect: () => ({ width: 600, height: 300 }),
      },
    } as unknown as CanvasRenderingContext2D,
    bursts: [],
    scorches: [],
    lastSeenExplosionId: 0,
    lastImpact: null,
    shake: 0,
    kickX: 0,
    kickY: 0,
    impactHoldFrames: 0,
    effectsBusy: 0,
    reduceMotion: true,
    explosionArt: { state: 'failed' },
    events: null,
    effects: { spawnExplosion: vi.fn(), clear: vi.fn() },
    impactMonitor: { draw: vi.fn(() => true) },
    showAimGuide: true,
    wasFiring: false,
    impactLearningShot: null,
  });
  return renderer;
}

function explosion(): ExplosionEvent {
  return {
    id: 1,
    weaponType: 'baby_missile',
    cx: 716,
    cy: 380,
    radius: 18,
    impactType: 'ground',
    style: 'blast',
    color: '#ffb347',
    durationFrames: 85,
  };
}

function impactState(event = explosion()): GameState {
  return {
    explosions: [event],
    lastExplosion: event,
    walls: 'open',
    round: 2,
    turn: 7,
    tanks: [
      {
        id: 'shooter',
        playerName: 'Commander',
        x: 180,
        alive: true,
        team: null,
      },
      {
        id: 'target',
        playerName: 'CPU 1',
        x: 800,
        alive: true,
        team: null,
      },
    ],
  } as unknown as GameState;
}

describe('Renderer impact learning wiring', () => {
  it('captures one local shooter at the firing edge and does not relatch mid-flight', () => {
    const renderer = rendererHarness();

    expect(renderer.observeShotLaunch({
      phase: 'FIRING',
      activePlayerId: 'shooter',
    })).toBe(true);
    expect(renderer.impactLearningShot).toEqual({ shooterId: 'shooter', local: true });

    renderer.showAimGuide = false;
    expect(renderer.observeShotLaunch({
      phase: 'FIRING',
      activePlayerId: 'other',
    })).toBe(false);
    expect(renderer.impactLearningShot).toEqual({ shooterId: 'shooter', local: true });
  });

  it('captures remote or CPU shots as ineligible after the next firing edge', () => {
    const renderer = rendererHarness();
    renderer.wasFiring = true;
    renderer.observeShotLaunch({ phase: 'PLAYER_TURN', activePlayerId: 'target' });
    renderer.showAimGuide = false;

    expect(renderer.observeShotLaunch({
      phase: 'FIRING',
      activePlayerId: 'target',
    })).toBe(true);
    expect(renderer.impactLearningShot).toEqual({ shooterId: 'target', local: false });
  });

  it('attaches learning only to a locally owned shot burst', () => {
    const local = rendererHarness();
    local.impactLearningShot = { shooterId: 'shooter', local: true };
    local.consumeExplosion(impactState());
    expect(local.bursts[0]?.cue).toEqual(cue);

    const remote = rendererHarness();
    remote.impactLearningShot = { shooterId: 'shooter', local: false };
    remote.consumeExplosion(impactState());
    expect(remote.bursts[0]?.cue ?? null).toBeNull();
  });

  it('exports only the live renderer-admitted cue with its shot identity', () => {
    const renderer = rendererHarness();
    renderer.impactLearningShot = { shooterId: 'shooter', local: true };
    renderer.consumeExplosion(impactState());

    expect(renderer.currentImpactLearningCue()).toEqual({
      ...cue,
      shooterId: 'shooter',
      round: 2,
      turn: 7,
      explosionId: 1,
    });

    renderer.bursts[0]!.age = renderer.bursts[0]!.lifeFrames;
    expect(renderer.currentImpactLearningCue()).toBeNull();
  });

  it('keeps each explosion cue attached through strongest-burst monitor selection', () => {
    const renderer = rendererHarness();
    renderer.impactLearningShot = { shooterId: 'shooter', local: true };
    const near = explosion();
    const strong: ExplosionEvent = {
      ...explosion(),
      id: 2,
      cx: 854,
      radius: 70,
    };
    const state = impactState(strong);
    state.explosions = [near, strong];

    renderer.consumeExplosion(state);
    expect(renderer.bursts).toHaveLength(2);
    expect(renderer.bursts[0]?.cue).toEqual(cue);
    expect(renderer.bursts[1]?.cue).toEqual({
      readout: '54 PX RIGHT OF CPU 1',
      correction: 'SHIFT IMPACT LEFT',
    });

    renderer.drawImpactMonitor({ x: 0, y: 0 });
    expect(renderer.impactMonitor.draw.mock.calls[0]?.[3]).toEqual({
      readout: '54 PX RIGHT OF CPU 1',
      correction: 'SHIFT IMPACT LEFT',
    });
  });

  it('forwards the selected burst cue into the compact monitor painter', () => {
    const renderer = rendererHarness();
    renderer.bursts.push({
      cx: 716,
      cy: 380,
      age: 1,
      lifeFrames: 85,
      visual: { reachRadius: 18 },
      cue,
    });

    renderer.drawImpactMonitor({ x: 0, y: 0 });

    expect(renderer.impactMonitor.draw).toHaveBeenCalledOnce();
    expect(renderer.impactMonitor.draw.mock.calls[0]?.[3]).toEqual(cue);
  });
});
