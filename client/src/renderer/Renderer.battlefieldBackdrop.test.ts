import { describe, expect, it, vi } from 'vitest';
import type { GameState } from '@shared/types/GameState';
import { Renderer } from './Renderer';
import {
  BATTLEFIELD_WORLDS,
  BattlefieldBackdrop,
  type BackdropImageFactory,
} from './BattlefieldBackdrop';

interface BackdropSeam {
  ctx: CanvasRenderingContext2D;
  skyGradient: CanvasGradient;
  battlefieldBackdrop: {
    readonly isSettled: boolean;
    select?(terrain: Uint8Array): unknown;
    draw(ctx: CanvasRenderingContext2D, overscan?: number): boolean;
  };
  atmosphereClouds: { draw: ReturnType<typeof vi.fn> };
  drawStars: ReturnType<typeof vi.fn>;
  drawSun: ReturnType<typeof vi.fn>;
  drawHorizonHaze: ReturnType<typeof vi.fn>;
  drawDistantRidges: ReturnType<typeof vi.fn>;
  drawSky(): void;
  terrain: {
    selectWorld: ReturnType<typeof vi.fn>;
  };
  selectBattlefieldWorld(terrain: Uint8Array): void;
  bursts: unknown[];
  scorches: unknown[];
  wallContacts: unknown[];
  shake: number;
  kickX: number;
  kickY: number;
  effectsBusy: number;
  tankRecoil: null;
  windGust: null;
  isAnimating(state: GameState): boolean;
}

function skySeam(didDrawBackdrop: boolean): BackdropSeam {
  const ctx = {
    save: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;

  return Object.assign(Object.create(Renderer.prototype), {
    ctx,
    skyGradient: {} as CanvasGradient,
    battlefieldBackdrop: {
      isSettled: didDrawBackdrop,
      draw: vi.fn(() => didDrawBackdrop),
    },
    atmosphereClouds: { draw: vi.fn() },
    drawStars: vi.fn(),
    drawSun: vi.fn(),
    drawHorizonHaze: vi.fn(),
    drawDistantRidges: vi.fn(),
  }) as BackdropSeam;
}

function animationSeam(isSettled: boolean): BackdropSeam {
  return Object.assign(Object.create(Renderer.prototype), {
    battlefieldBackdrop: { isSettled, draw: vi.fn() },
    bursts: [],
    scorches: [],
    wallContacts: [],
    shake: 0,
    kickX: 0,
    kickY: 0,
    effectsBusy: 0,
    prevMobilityPoses: new Map(),
    mobilityEffects: { isActive: false },
    tankRecoil: null,
    windGust: null,
  }) as BackdropSeam;
}

function controlledBackdrop(): {
  backdrop: BattlefieldBackdrop;
  image: HTMLImageElement;
} {
  const image = {
    src: '',
    naturalWidth: 0,
    naturalHeight: 0,
    onload: null,
    onerror: null,
  } as unknown as HTMLImageElement;
  const createImage: BackdropImageFactory = () => image;
  return {
    backdrop: new BattlefieldBackdrop(createImage, '/'),
    image,
  };
}

function idleState(): GameState {
  return {
    phase: 'PLAYER_TURN',
    tanks: [],
    projectiles: [],
    fire: [],
  } as unknown as GameState;
}

describe('Renderer authored battlefield backdrop seam', () => {
  it('routes the exact selected world profile to backdrop and terrain once', () => {
    const terrain = new Uint8Array([0, 1, 1, 0]);
    const world = BATTLEFIELD_WORLDS[1]!;
    const select = vi.fn(() => world);
    const selectWorld = vi.fn();
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      battlefieldBackdrop: { isSettled: false, select, draw: vi.fn() },
      terrain: { selectWorld },
    }) as BackdropSeam;

    renderer.selectBattlefieldWorld(terrain);

    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(terrain);
    expect(selectWorld).toHaveBeenCalledOnce();
    expect(selectWorld).toHaveBeenCalledWith(world);
  });

  it('keeps the complete procedural atmosphere while the authored image is unavailable', () => {
    const renderer = skySeam(false);

    renderer.drawSky();

    expect(renderer.battlefieldBackdrop.draw).toHaveBeenCalledOnce();
    expect(renderer.atmosphereClouds.draw).toHaveBeenCalledOnce();
    expect(renderer.drawDistantRidges).toHaveBeenCalledOnce();
    expect(renderer.drawStars).toHaveBeenCalledOnce();
    expect(renderer.drawSun).toHaveBeenCalledOnce();
    expect(renderer.drawHorizonHaze).toHaveBeenCalledOnce();
  });

  it('replaces only procedural clouds and ridges when the panorama draws', () => {
    const renderer = skySeam(true);

    renderer.drawSky();

    expect(renderer.battlefieldBackdrop.draw).toHaveBeenCalledOnce();
    expect(renderer.atmosphereClouds.draw).not.toHaveBeenCalled();
    expect(renderer.drawDistantRidges).not.toHaveBeenCalled();
    expect(renderer.drawStars).toHaveBeenCalledOnce();
    expect(renderer.drawSun).toHaveBeenCalledOnce();
    expect(renderer.drawHorizonHaze).toHaveBeenCalledOnce();
  });

  it('keeps the first asynchronously ready frame eligible until it is drawn', () => {
    const { backdrop, image } = controlledBackdrop();
    const renderer = animationSeam(false);
    renderer.battlefieldBackdrop = backdrop;
    backdrop.select(new Uint8Array([1]));

    expect(renderer.isAnimating(idleState())).toBe(true);
    Object.assign(image, { naturalWidth: 1_774, naturalHeight: 887 });
    image.onload?.(new Event('load'));

    expect(backdrop.state).toBe('ready');
    expect(renderer.isAnimating(idleState())).toBe(true);
    expect(backdrop.draw({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)).toBe(true);
    expect(renderer.isAnimating(idleState())).toBe(false);
  });

  it('releases idle immediately when loading fails and fallback remains visible', () => {
    const { backdrop, image } = controlledBackdrop();
    const renderer = animationSeam(false);
    renderer.battlefieldBackdrop = backdrop;
    backdrop.select(new Uint8Array([1]));

    image.onerror?.(new Event('error'));

    expect(backdrop.state).toBe('failed');
    expect(renderer.isAnimating(idleState())).toBe(false);
  });
});
