import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';

const art = vi.hoisted(() => ({
  constructed: 0,
  state: 'loading' as 'loading' | 'timed_out' | 'ready' | 'failed',
  drawStatic: vi.fn((..._args: unknown[]) => false),
  drawBarrel: vi.fn((..._args: unknown[]) => false),
  readyListeners: new Set<() => void>(),
}));

vi.mock('./TankPartArt', () => ({
  TankPartArt: class {
    constructor() { art.constructed += 1; }
    get state() {
      return art.state;
    }
    readonly drawStatic = art.drawStatic;
    readonly drawBarrel = art.drawBarrel;
    onReady(listener: () => void) {
      art.readyListeners.add(listener);
      return () => art.readyListeners.delete(listener);
    }
  },
}));

import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
  releaseTankLoadoutPreviewResources,
} from './TankLoadoutPreview';

function fakeContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function stub2DContext(ctx: CanvasRenderingContext2D): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((contextId: string) => (contextId === '2d' ? ctx : null)) as HTMLCanvasElement['getContext'],
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  art.drawStatic.mockClear();
  art.drawBarrel.mockClear();
  art.drawStatic.mockReturnValue(false);
  art.drawBarrel.mockReturnValue(false);
  art.state = 'loading';
  art.readyListeners.clear();
  document.body.innerHTML = '';
});

describe('tank loadout preview lifecycle', () => {
  it('releases the shared atlas owner between inactive presentation generations', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'failed';
    stub2DContext(fakeContext());
    const before = art.constructed;

    paintTankLoadoutPreview(document.createElement('canvas'), '#e84d4d', DEFAULT_TANK_LOADOUT);
    expect(art.constructed).toBe(before + 1);

    releaseTankLoadoutPreviewResources();
    paintTankLoadoutPreview(document.createElement('canvas'), '#4d8ce8', DEFAULT_TANK_LOADOUT);
    expect(art.constructed).toBe(before + 2);
  });
  it('preserves the compact thumbnail profile by default', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'failed';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    const ctx = fakeContext();
    stub2DContext(ctx);
    const canvas = document.createElement('canvas');

    paintTankLoadoutPreview(canvas, '#e84d4d', DEFAULT_TANK_LOADOUT);

    expect({ width: canvas.width, height: canvas.height }).toEqual({
      width: 84,
      height: 48,
    });
    expect(ctx.scale).toHaveBeenCalledWith(1.6, 1.6);
    expect(art.drawStatic.mock.calls[0]).toHaveLength(2);
    expect(art.drawBarrel.mock.calls[0]).toHaveLength(2);
  });

  it('renders a materially larger spotlight from direct scale-four variants', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'ready';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    const ctx = fakeContext();
    stub2DContext(ctx);
    const canvas = document.createElement('canvas');

    paintTankLoadoutPreview(
      canvas,
      '#4d8ce8',
      DEFAULT_TANK_LOADOUT,
      'spotlight',
    );

    expect({ width: canvas.width, height: canvas.height }).toEqual({
      width: 320,
      height: 180,
    });
    expect(canvas.width).toBeGreaterThan(84 * 3);
    expect(canvas.height).toBeGreaterThan(48 * 3);
    expect(art.drawStatic.mock.calls[0]?.[2]).toBe(4);
    expect(art.drawBarrel.mock.calls[0]?.[2]).toBe(4);
  });

  it('renders a combat-readable tactical card that fills the commander recess', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'ready';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    const ctx = fakeContext();
    stub2DContext(ctx);
    const canvas = document.createElement('canvas');

    paintTankLoadoutPreview(
      canvas,
      '#e84d4d',
      DEFAULT_TANK_LOADOUT,
      'tactical',
    );

    expect({ width: canvas.width, height: canvas.height }).toEqual({
      width: 144,
      height: 80,
    });
    expect(art.drawStatic.mock.calls[0]?.[2]).toBe(2.68);
    expect(art.drawBarrel.mock.calls[0]?.[2]).toBe(2.68);
    expect(ctx.scale).not.toHaveBeenCalled();
  });

  it('repaints only the current presentation when late art becomes ready', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const ctx = fakeContext();
    stub2DContext(ctx);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);

    paintTankLoadoutPreview(canvas, '#e84d4d', DEFAULT_TANK_LOADOUT);
    paintTankLoadoutPreview(
      canvas,
      '#e84d4d',
      DEFAULT_TANK_LOADOUT,
      'spotlight',
    );
    expect(art.readyListeners.size).toBe(1);
    art.state = 'ready';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    for (const listener of [...art.readyListeners]) listener();

    expect(art.drawStatic.mock.calls.map((call) => call[2])).toEqual([
      undefined,
      4,
      4,
    ]);
    expect({ width: canvas.width, height: canvas.height }).toEqual({
      width: 320,
      height: 180,
    });
  });

  it('draws a scaled non-blank fallback when spotlight art is unavailable', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'failed';
    const ctx = fakeContext();
    stub2DContext(ctx);
    const canvas = document.createElement('canvas');

    paintTankLoadoutPreview(
      canvas,
      '#e8c84d',
      DEFAULT_TANK_LOADOUT,
      'spotlight',
    );

    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.scale).toHaveBeenCalledWith(4, 4);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it('invalidates a late-art repaint when the portrait is cleared', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const ctx = fakeContext();
    stub2DContext(ctx);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);

    paintTankLoadoutPreview(canvas, '#e84d4d', DEFAULT_TANK_LOADOUT);
    expect(art.drawStatic).toHaveBeenCalledOnce();
    expect(art.readyListeners.size).toBe(1);
    expect(canvas.dataset['tankPreviewSignature']).toBeDefined();

    clearTankLoadoutPreview(canvas);
    expect(art.readyListeners.size).toBe(0);
    expect(canvas.dataset['tankPreviewSignature']).toBeUndefined();
    expect(ctx.clearRect).toHaveBeenLastCalledWith(0, 0, 84, 48);

    art.state = 'ready';
    for (const listener of [...art.readyListeners]) listener();
    expect(art.drawStatic).toHaveBeenCalledOnce();
  });

  it('prunes detached timed-out previews across repeated lobby replacement', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'timed_out';
    stub2DContext(fakeContext());

    let current = document.createElement('canvas');
    document.body.append(current);
    paintTankLoadoutPreview(current, '#e84d4d', DEFAULT_TANK_LOADOUT);
    expect(art.readyListeners.size).toBe(1);

    for (let index = 0; index < 5; index++) {
      const replacement = document.createElement('canvas');
      current.replaceWith(replacement);
      current = replacement;
      paintTankLoadoutPreview(current, '#e84d4d', DEFAULT_TANK_LOADOUT);
      expect(art.readyListeners.size).toBe(1);
    }

    art.state = 'ready';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    for (const listener of [...art.readyListeners]) listener();
    expect(art.drawStatic).toHaveBeenCalledTimes(7);
  });

  it('keeps every preview painted while a lobby subtree is being assembled', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'timed_out';
    stub2DContext(fakeContext());
    const subtree = document.createElement('section');
    const canvases = Array.from({ length: 3 }, () => {
      const canvas = document.createElement('canvas');
      subtree.append(canvas);
      paintTankLoadoutPreview(canvas, '#e84d4d', DEFAULT_TANK_LOADOUT);
      return canvas;
    });

    expect(art.readyListeners.size).toBe(3);
    document.body.append(subtree);
    await Promise.resolve();
    art.state = 'ready';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    for (const listener of [...art.readyListeners]) listener();

    expect(art.drawStatic).toHaveBeenCalledTimes(6);
    expect(canvases.every((canvas) => canvas.isConnected)).toBe(true);
  });
});
