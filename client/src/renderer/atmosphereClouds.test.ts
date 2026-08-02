import { describe, expect, it, vi } from 'vitest';
import {
  ATMOSPHERE_CLOUD_BANKS,
  ATMOSPHERE_CLOUD_HEIGHT,
  ATMOSPHERE_CLOUD_WIDTH,
  AtmosphereCloudLayer,
} from './atmosphereClouds';

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe('atmospheric cloud field', () => {
  it('pins one immutable, bounded far-to-near cel-shaded composition', () => {
    expect(ATMOSPHERE_CLOUD_WIDTH).toBe(1200);
    expect(ATMOSPHERE_CLOUD_HEIGHT).toBe(600);
    expect(ATMOSPHERE_CLOUD_BANKS.map((bank) => bank.depth)).toEqual([
      'far',
      'far',
      'near',
      'near',
    ]);
    expect(Object.isFrozen(ATMOSPHERE_CLOUD_BANKS)).toBe(true);

    const lobes = ATMOSPHERE_CLOUD_BANKS.flatMap((bank) => bank.lobes);
    expect(lobes.length).toBeGreaterThanOrEqual(20);
    for (const bank of ATMOSPHERE_CLOUD_BANKS) {
      expect(Object.isFrozen(bank)).toBe(true);
      expect(Object.isFrozen(bank.lobes)).toBe(true);
      expect(bank.body).toMatch(/^rgba\(/);
      expect(bank.shadow).toMatch(/^rgba\(/);
      expect(bank.rim).toBe('#ffe9a8');
      for (const lobe of bank.lobes) {
        expect(Object.isFrozen(lobe)).toBe(true);
        expect(lobe.x - lobe.rx).toBeGreaterThanOrEqual(-160);
        expect(lobe.x + lobe.rx).toBeLessThanOrEqual(1360);
        expect(lobe.y - lobe.ry).toBeGreaterThanOrEqual(20);
        expect(lobe.y + lobe.ry).toBeLessThanOrEqual(300);
        expect(lobe.rx).toBeGreaterThan(0);
        expect(lobe.ry).toBeGreaterThan(0);
      }
    }
  });

  it('builds the offscreen art once and reuses it across target frames', () => {
    const layerContext = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
    };
    const surface = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => layerContext),
    };
    const factory = vi.fn(() => surface as unknown as HTMLCanvasElement);
    const target = { drawImage: vi.fn() };
    const layer = new AtmosphereCloudLayer(factory);

    layer.draw(target as unknown as CanvasRenderingContext2D);
    layer.draw(target as unknown as CanvasRenderingContext2D);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(surface.width).toBe(ATMOSPHERE_CLOUD_WIDTH);
    expect(surface.height).toBe(ATMOSPHERE_CLOUD_HEIGHT);
    expect(surface.getContext).toHaveBeenCalledTimes(1);
    expect(layerContext.ellipse.mock.calls.length).toBeGreaterThanOrEqual(40);
    expect(layerContext.moveTo).toHaveBeenCalledTimes(14);
    const moveOrder = required(layerContext.moveTo.mock.invocationCallOrder[0], 'cloud contour move');
    const strokeOrder = required(layerContext.stroke.mock.invocationCallOrder[0], 'cloud contour stroke');
    expect(moveOrder).toBeLessThan(strokeOrder);
    expect(layerContext.fill).toHaveBeenCalled();
    expect(layerContext.stroke).toHaveBeenCalled();
    expect(target.drawImage).toHaveBeenCalledTimes(2);
    expect(target.drawImage).toHaveBeenNthCalledWith(1, surface, 0, 0);
    expect(target.drawImage).toHaveBeenNthCalledWith(2, surface, 0, 0);
  });
});
