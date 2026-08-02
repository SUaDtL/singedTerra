import { describe, expect, it, vi } from 'vitest';
import {
  EXPLOSION_ART_ASSET,
  EXPLOSION_ART_CELL_SIZE,
  EXPLOSION_ART_FRAME_COUNT,
  EXPLOSION_ART_LOAD_TIMEOUT_MS,
  EXPLOSION_ART_SOURCE_SIZE,
  ExplosionArt,
  type ExplosionArtImageFactory,
} from './ExplosionArt';

interface ControlledImage {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

function controlledImage(): ControlledImage {
  return {
    src: '',
    naturalWidth: 0,
    naturalHeight: 0,
    onload: null,
    onerror: null,
  };
}

function settleValid(image: ControlledImage): void {
  image.naturalWidth = EXPLOSION_ART_SOURCE_SIZE;
  image.naturalHeight = EXPLOSION_ART_SOURCE_SIZE;
  image.onload?.();
}

function drawingContext(drawImage = vi.fn()) {
  const save = vi.fn();
  const beginPath = vi.fn();
  const arc = vi.fn();
  const clip = vi.fn();
  const restore = vi.fn();
  return {
    ctx: {
      save,
      beginPath,
      arc,
      clip,
      drawImage,
      restore,
    } as unknown as CanvasRenderingContext2D,
    drawImage,
    save,
    beginPath,
    arc,
    clip,
    restore,
  };
}

describe('ExplosionArt', () => {
  it('loads one base-aware atlas and keeps the procedural fallback active while pending', () => {
    const image = controlledImage();
    let handlersAttachedBeforeSrc = false;
    let assignedSrc = '';
    Object.defineProperty(image, 'src', {
      get: () => assignedSrc,
      set: (value: string) => {
        assignedSrc = value;
        handlersAttachedBeforeSrc = (
          typeof image.onload === 'function'
          && typeof image.onerror === 'function'
        );
      },
    });
    const createImage: ExplosionArtImageFactory = () => (
      image as unknown as HTMLImageElement
    );
    const art = new ExplosionArt(createImage, '/singedTerra/');
    const { ctx, drawImage } = drawingContext();

    expect(EXPLOSION_ART_ASSET).toBe('art/explosion-sheet.webp');
    expect(handlersAttachedBeforeSrc).toBe(true);
    expect(assignedSrc).toBe('/singedTerra/art/explosion-sheet.webp');
    expect(art.state).toBe('loading');
    expect(art.isSettled).toBe(false);
    expect(art.draw(
      ctx,
      120,
      240,
      40,
      0,
    )).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it.each([
    { progress: -1, frame: 0 },
    { progress: 0, frame: 0 },
    { progress: 0.5, frame: 4 },
    { progress: 0.999, frame: EXPLOSION_ART_FRAME_COUNT - 1 },
    { progress: 1, frame: EXPLOSION_ART_FRAME_COUNT - 1 },
    { progress: 99, frame: EXPLOSION_ART_FRAME_COUNT - 1 },
  ])('draws progress $progress from bounded frame $frame', ({ progress, frame }) => {
    const image = controlledImage();
    const art = new ExplosionArt(
      () => image as unknown as HTMLImageElement,
      '/',
    );
    const context = drawingContext();
    settleValid(image);
    expect(art.state).toBe('ready');
    expect(art.isSettled).toBe(true);

    expect(art.draw(
      context.ctx,
      120,
      240,
      40,
      progress,
    )).toBe(true);
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.arc).toHaveBeenCalledWith(
      120,
      240,
      40,
      0,
      Math.PI * 2,
    );
    expect(context.clip).toHaveBeenCalledOnce();
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      (frame % 3) * EXPLOSION_ART_CELL_SIZE,
      Math.floor(frame / 3) * EXPLOSION_ART_CELL_SIZE,
      EXPLOSION_ART_CELL_SIZE,
      EXPLOSION_ART_CELL_SIZE,
      80,
      200,
      80,
      80,
    );
    expect(context.restore).toHaveBeenCalledOnce();
    expect(art.isSettled).toBe(true);
  });

  it.each([
    {
      name: 'decode error',
      settle(image: ControlledImage): void { image.onerror?.(); },
    },
    {
      name: 'wrong width',
      settle(image: ControlledImage): void {
        image.naturalWidth = EXPLOSION_ART_SOURCE_SIZE - 1;
        image.naturalHeight = EXPLOSION_ART_SOURCE_SIZE;
        image.onload?.();
      },
    },
    {
      name: 'wrong height',
      settle(image: ControlledImage): void {
        image.naturalWidth = EXPLOSION_ART_SOURCE_SIZE;
        image.naturalHeight = EXPLOSION_ART_SOURCE_SIZE + 1;
        image.onload?.();
      },
    },
  ])('fails closed for $name', ({ settle }) => {
    const image = controlledImage();
    const art = new ExplosionArt(
      () => image as unknown as HTMLImageElement,
      '/',
    );
    settle(image);

    expect(art.state).toBe('failed');
    expect(art.isSettled).toBe(true);
    expect(art.draw(
      { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
      120,
      240,
      40,
      0.5,
    )).toBe(false);
  });

  it('keeps the asset ready after a transient target-context draw failure', () => {
    const image = controlledImage();
    const art = new ExplosionArt(
      () => image as unknown as HTMLImageElement,
      '/',
    );
    settleValid(image);
    const context = drawingContext(vi.fn(() => {
      throw new Error('context lost');
    }));

    expect(art.draw(
      context.ctx,
      120,
      240,
      40,
      0.5,
    )).toBe(false);
    expect(art.state).toBe('ready');
    expect(art.isSettled).toBe(true);
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it('times out a pending load and ignores a late decode', () => {
    vi.useFakeTimers();
    try {
      const image = controlledImage();
      const art = new ExplosionArt(
        () => image as unknown as HTMLImageElement,
        '/',
      );

      vi.advanceTimersByTime(EXPLOSION_ART_LOAD_TIMEOUT_MS);
      expect(art.state).toBe('failed');
      expect(art.isSettled).toBe(true);

      settleValid(image);
      expect(art.state).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });
});
