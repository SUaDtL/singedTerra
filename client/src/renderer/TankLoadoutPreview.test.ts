import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';

const art = vi.hoisted(() => ({
  drawStatic: vi.fn(() => false),
  drawBarrel: vi.fn(() => false),
}));

vi.mock('./TankPartArt', () => ({
  TankPartArt: class {
    readonly state = 'loading';
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
  document.body.innerHTML = '';
});

describe('tank loadout preview lifecycle', () => {
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
