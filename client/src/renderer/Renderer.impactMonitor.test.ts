import { describe, expect, it, vi } from 'vitest';
import type { GameState } from '@shared/types/GameState';
import type { ExplosionVisualProfile } from './explosionVisuals';
import { Renderer } from './Renderer';
import type { ImpactMonitorOffset } from './impactMonitor';

interface MonitorBurst {
  cx: number;
  cy: number;
  age: number;
  lifeFrames: number;
  visual: Pick<ExplosionVisualProfile, 'reachRadius'>;
}

interface RendererMonitorSeam {
  ctx: CanvasRenderingContext2D;
  bursts: MonitorBurst[];
  reduceMotion: boolean;
  impactMonitor: { draw: ReturnType<typeof vi.fn> };
  drawImpactMonitor(worldOffset: ImpactMonitorOffset): void;
}

const burst = (
  cx: number,
  reachRadius: number,
  age: number,
): MonitorBurst => ({
  cx,
  cy: 300,
  age,
  lifeFrames: 30,
  visual: { reachRadius },
});

function monitorSeam(reduceMotion = false): RendererMonitorSeam {
  const renderer = Object.create(Renderer.prototype) as RendererMonitorSeam;
  Object.assign(renderer, {
    ctx: { canvas: { width: 1200, height: 600 } } as CanvasRenderingContext2D,
    bursts: [],
    reduceMotion,
    impactMonitor: { draw: vi.fn(() => true) },
  });
  return renderer;
}

describe('Renderer impact monitor', () => {
  it('does not ask the painter to draw without a live burst', () => {
    const renderer = monitorSeam();

    renderer.drawImpactMonitor({ x: 0, y: 0 });

    expect(renderer.impactMonitor.draw).not.toHaveBeenCalled();
  });

  it('passes the newest of the strongest reaches with current world recoil', () => {
    const renderer = monitorSeam();
    renderer.bursts = [
      burst(200, 52, 0),
      burst(600, 72, 5),
      burst(900, 72, 1),
    ];

    renderer.drawImpactMonitor({ x: 7, y: -5 });

    expect(renderer.impactMonitor.draw).toHaveBeenCalledWith(
      renderer.ctx,
      {
        focus: { x: 907, y: 295 },
        source: { x: 835, y: 251, width: 144, height: 88 },
        content: { x: 501, y: 25, width: 198, height: 121 },
        frame: { x: 490, y: 18, width: 220, height: 136 },
      },
      false,
    );
  });

  it('keeps the impact monitor visible for reduced-motion users', () => {
    const renderer = monitorSeam(true);
    renderer.bursts = [burst(600, 72, 0)];

    renderer.drawImpactMonitor({ x: 0, y: 0 });

    expect(renderer.impactMonitor.draw).toHaveBeenCalledWith(
      renderer.ctx,
      {
        focus: { x: 600, y: 300 },
        source: { x: 528, y: 256, width: 144, height: 88 },
        content: { x: 501, y: 25, width: 198, height: 121 },
        frame: { x: 490, y: 18, width: 220, height: 136 },
      },
      false,
    );
  });

  it('composites after the world transform is restored and before the canvas HUD slot', () => {
    const trace: string[] = [];
    const renderer = monitorSeam() as RendererMonitorSeam & Record<string, unknown>;
    renderer.bursts = [burst(600, 72, 0)];
    renderer.impactMonitor.draw = vi.fn(() => {
      trace.push('monitor');
      return true;
    });
    const ctx = {
      canvas: { width: 1200, height: 600 },
      save: vi.fn(() => trace.push('save')),
      translate: vi.fn(() => trace.push('translate')),
      restore: vi.fn(() => trace.push('restore')),
    } as unknown as CanvasRenderingContext2D;
    renderer.ctx = ctx;
    Object.assign(renderer, {
      lastSeenExplosionId: 0,
      lastSeenWallImpactId: 0,
      impactHoldFrames: 0,
      effectsBusy: 0,
      kickX: 0,
      kickY: 0,
      shake: 0,
      wasFiring: false,
      events: null,
      showAimGuide: false,
      aimGuideEnabled: true,
      wallContacts: [],
      consumeExplosion: vi.fn(),
      consumeWallImpacts: vi.fn(),
      trackWindGust: vi.fn(),
      trackDamage: vi.fn(),
      trackMobility: vi.fn(),
      advanceWindGust: vi.fn(),
      currentTankRecoilPose: vi.fn(() => null),
      advanceTankRecoil: vi.fn(),
      drawSky: vi.fn(),
      drawWindGusts: vi.fn(),
      drawShields: vi.fn(),
      drawFire: vi.fn(),
      drawExplosions: vi.fn(),
      drawFlash: vi.fn(),
      drawScorches: vi.fn(),
      drawLastImpact: vi.fn(),
      mobilityEffects: { update: vi.fn(), draw: vi.fn() },
      effects: { update: vi.fn(), draw: vi.fn() },
      projectile: { drawGroundShadows: vi.fn(), draw: vi.fn() },
      terrain: { draw: vi.fn() },
      tanks: { drawAll: vi.fn(), drawBuriedMarker: vi.fn() },
      hud: { draw: vi.fn(() => trace.push('hud')) },
    });
    const state = {
      phase: 'PLAYER_TURN',
      explosions: [],
      lastExplosion: null,
      projectiles: [],
      projectile: null,
      fire: [],
      tanks: [],
      terrain: new Uint8Array(0),
      terrainVersion: 0,
      activePlayerId: '',
      walls: 'open',
    } as unknown as GameState;

    (renderer as unknown as { render(state: GameState): void }).render(state);

    const monitorIndex = trace.indexOf('monitor');
    const hudIndex = trace.indexOf('hud');
    expect(monitorIndex).toBeGreaterThan(trace.lastIndexOf('restore'));
    expect(monitorIndex).toBeLessThan(hudIndex);
  });
});
