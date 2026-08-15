import { describe, expect, it } from 'vitest';
import type { GameState, TankState } from '@shared/types/GameState';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { Renderer } from './Renderer';

interface AimGuideRendererSeam {
  ctx: CanvasRenderingContext2D;
  showAimGuide: boolean;
  aimGuideEnabled: boolean;
  aimGuideGravity: number;
  drawAimGuide(state: GameState): void;
}

function tank(): TankState {
  return {
    id: 'p1',
    playerName: 'P1',
    color: '#ef4444',
    x: 120,
    y: 300,
    angle: 45,
    power: 50,
    health: 100,
    alive: true,
    selectedWeapon: 'baby_missile',
  } as TankState;
}

function state(): GameState {
  const active = tank();
  return {
    phase: 'PLAYER_TURN',
    activePlayerId: active.id,
    wind: 3,
    terrain: new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT),
    tanks: [active],
    walls: 'open',
  } as GameState;
}

function contextTrace() {
  const strokeAlphas: number[] = [];
  const fillAlphas: number[] = [];
  const ctx = {
    globalAlpha: 0.73,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#caller',
    fillStyle: '#caller',
    lineCap: 'square',
    lineWidth: 9,
    save() {},
    restore(this: { globalAlpha: number; globalCompositeOperation: string }) {
      this.globalAlpha = 0.73;
      this.globalCompositeOperation = 'source-over';
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke(this: { globalAlpha: number }) {
      strokeAlphas.push(this.globalAlpha);
    },
    arc() {},
    fill(this: { globalAlpha: number }) {
      fillAlphas.push(this.globalAlpha);
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    strokeAlphas,
    fillAlphas,
  };
}

describe('Renderer honest ballistic guide', () => {
  it('draws individually fading segments and beads without an endpoint marker', () => {
    const trace = contextTrace();
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      ctx: trace.ctx,
      showAimGuide: true,
      aimGuideEnabled: true,
      aimGuideGravity: 0.15,
    }) as AimGuideRendererSeam;

    renderer.drawAimGuide(state());

    expect(trace.strokeAlphas.length).toBeGreaterThan(5);
    expect(trace.fillAlphas).toHaveLength(trace.strokeAlphas.length + 1);
    for (let index = 1; index < trace.strokeAlphas.length; index++) {
      expect(trace.strokeAlphas[index]).toBeLessThan(trace.strokeAlphas[index - 1]!);
    }
    for (let index = 1; index < trace.fillAlphas.length; index++) {
      expect(trace.fillAlphas[index]).toBeLessThan(trace.fillAlphas[index - 1]!);
    }
    expect(trace.strokeAlphas.at(-1)).toBeLessThan(0.08);
    expect(trace.fillAlphas.at(-1)).toBeLessThan(0.08);
    expect(trace.ctx.globalAlpha).toBe(0.73);
    expect(trace.ctx.globalCompositeOperation).toBe('source-over');
  });
});
