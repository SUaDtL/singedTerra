import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';

const art = vi.hoisted(() => ({
  state: 'loading' as 'loading' | 'ready' | 'failed',
  drawStatic: vi.fn((..._args: unknown[]) => false),
  drawBarrel: vi.fn((..._args: unknown[]) => false),
}));

vi.mock('./TankPartArt', () => ({
  TankPartArt: class {
    get state() {
      return art.state;
    }
    readonly drawStatic = art.drawStatic;
    readonly drawBarrel = art.drawBarrel;
  },
}));

import {
  clearTankLoadoutPreview,
  paintTankLoadoutPreview,
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  art.drawStatic.mockClear();
  art.drawBarrel.mockClear();
  art.drawStatic.mockReturnValue(false);
  art.drawBarrel.mockReturnValue(false);
  art.state = 'loading';
  document.body.innerHTML = '';
});

describe('tank loadout preview lifecycle', () => {
  it('preserves the compact thumbnail profile by default', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'failed';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
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
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
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

  it('renders a combat-readable tactical card from direct scale-two variants', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    art.state = 'ready';
    art.drawStatic.mockReturnValue(true);
    art.drawBarrel.mockReturnValue(true);
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
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
    expect(art.drawStatic.mock.calls[0]?.[2]).toBe(2);
    expect(art.drawBarrel.mock.calls[0]?.[2]).toBe(2);
    expect(ctx.scale).not.toHaveBeenCalled();
  });

  it('keeps queued retries bound to the presentation mode', () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);

    paintTankLoadoutPreview(canvas, '#e84d4d', DEFAULT_TANK_LOADOUT);
    paintTankLoadoutPreview(
      canvas,
      '#e84d4d',
      DEFAULT_TANK_LOADOUT,
      'spotlight',
    );
    vi.advanceTimersByTime(50);

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
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
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

  it('invalidates a queued atlas retry when the portrait is cleared', () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    const canvas = document.createElement('canvas');
    document.body.append(canvas);

    paintTankLoadoutPreview(canvas, '#e84d4d', DEFAULT_TANK_LOADOUT);
    expect(art.drawStatic).toHaveBeenCalledOnce();
    expect(canvas.dataset['tankPreviewSignature']).toBeDefined();

    clearTankLoadoutPreview(canvas);
    expect(canvas.dataset['tankPreviewSignature']).toBeUndefined();
    expect(ctx.clearRect).toHaveBeenLastCalledWith(0, 0, 84, 48);

    vi.advanceTimersByTime(50);
    expect(art.drawStatic).toHaveBeenCalledOnce();
  });
});
