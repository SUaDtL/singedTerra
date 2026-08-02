import { describe, expect, it, vi } from 'vitest';
import { ACCENT, BACKDROP, TEXT } from '../ui/theme';
import {
  ImpactMonitorPainter,
  type ImpactMonitorCanvasFactory,
} from './ImpactMonitorPainter';
import type { ImpactMonitorGeometry } from './impactMonitor';

const geometry: ImpactMonitorGeometry = {
  focus: { x: 607, y: 295 },
  source: { x: 535, y: 251, width: 144, height: 88 },
  content: { x: 501, y: 25, width: 198, height: 121 },
  frame: { x: 490, y: 18, width: 220, height: 136 },
};

interface PainterHarness {
  factory: ImpactMonitorCanvasFactory;
  target: CanvasRenderingContext2D;
  scratchCanvas: HTMLCanvasElement;
  operations: string[];
  scratchSave: ReturnType<typeof vi.fn>;
  scratchRestore: ReturnType<typeof vi.fn>;
  scratchDrawImage: ReturnType<typeof vi.fn>;
  scratchRoundRect: ReturnType<typeof vi.fn>;
  scratchClip: ReturnType<typeof vi.fn>;
  scratchStrokeRect: ReturnType<typeof vi.fn>;
  scratchFillText: ReturnType<typeof vi.fn>;
  targetDrawImage: ReturnType<typeof vi.fn>;
  targetFillRect: ReturnType<typeof vi.fn>;
  targetStrokeRect: ReturnType<typeof vi.fn>;
  styles: { fill: string[]; stroke: string[] };
}

function harness(options: {
  sourceCopyError?: boolean;
  finalPaintError?: boolean;
  contextAvailable?: boolean;
  factoryError?: boolean;
} = {}): PainterHarness {
  const operations: string[] = [];
  const styles = { fill: [] as string[], stroke: [] as string[] };
  const scratchSave = vi.fn(() => operations.push('scratch-save'));
  const scratchRestore = vi.fn(() => operations.push('scratch-restore'));
  const scratchDrawImage = vi.fn(() => {
    operations.push('source-copy');
    if (options.sourceCopyError) throw new Error('source copy failed');
  });
  const scratchRoundRect = vi.fn(() => operations.push('content-path'));
  const scratchClip = vi.fn(() => operations.push('content-clip'));
  const scratchStrokeRect = vi.fn(() => operations.push('frame-stroke'));
  const scratchFillText = vi.fn(() => operations.push('label'));
  const scratch = {
    save: scratchSave,
    restore: scratchRestore,
    clearRect: vi.fn(() => operations.push('scratch-clear')),
    drawImage: scratchDrawImage,
    beginPath: vi.fn(),
    roundRect: scratchRoundRect,
    clip: scratchClip,
    fillRect: vi.fn(() => operations.push('frame-fill')),
    strokeRect: scratchStrokeRect,
    fillText: scratchFillText,
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      styles.fill.push(String(value));
    },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      styles.stroke.push(String(value));
    },
    set lineWidth(_value: number) {},
    set shadowColor(_value: string) {},
    set shadowBlur(_value: number) {},
    set shadowOffsetY(_value: number) {},
    set font(_value: string) {},
    set textBaseline(_value: CanvasTextBaseline) {},
  } as unknown as CanvasRenderingContext2D;
  const scratchCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => options.contextAvailable === false ? null : scratch),
  } as unknown as HTMLCanvasElement;
  const factory = vi.fn(() => {
    if (options.factoryError) throw new Error('canvas unavailable');
    return scratchCanvas;
  });

  const targetDrawImage = vi.fn(() => {
    operations.push('final-paint');
    if (options.finalPaintError) throw new Error('final paint failed');
  });
  const targetFillRect = vi.fn(() => operations.push('target-fill'));
  const targetStrokeRect = vi.fn(() => operations.push('target-stroke'));
  const target = {
    canvas: { width: 1200, height: 600 },
    drawImage: targetDrawImage,
    fillRect: targetFillRect,
    strokeRect: targetStrokeRect,
    save: vi.fn(() => operations.push('target-save')),
    restore: vi.fn(() => operations.push('target-restore')),
  } as unknown as CanvasRenderingContext2D;

  return {
    factory,
    target,
    scratchCanvas,
    operations,
    scratchSave,
    scratchRestore,
    scratchDrawImage,
    scratchRoundRect,
    scratchClip,
    scratchStrokeRect,
    scratchFillText,
    targetDrawImage,
    targetFillRect,
    targetStrokeRect,
    styles,
  };
}

describe('ImpactMonitorPainter', () => {
  it('allocates and sizes one reusable complete-frame buffer for repeated draws', () => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false)).toBe(true);
    expect(monitor.draw(probe.target, geometry, false)).toBe(true);
    expect(probe.factory).toHaveBeenCalledOnce();
    expect(probe.scratchCanvas.width).toBe(220);
    expect(probe.scratchCanvas.height).toBe(136);
  });

  it.each([
    { geometry: null, reduceMotion: false, label: 'no geometry' },
    { geometry, reduceMotion: true, label: 'reduced motion' },
  ])('does no canvas work for $label', ({ geometry: candidate, reduceMotion }) => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, candidate, reduceMotion)).toBe(false);
    expect(probe.scratchDrawImage).not.toHaveBeenCalled();
    expect(probe.targetDrawImage).not.toHaveBeenCalled();
  });

  it('copies the bounded battlefield crop into local content before one final composite', () => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false)).toBe(true);
    expect(probe.scratchDrawImage).toHaveBeenCalledWith(
      probe.target.canvas,
      535,
      251,
      144,
      88,
      11,
      7,
      198,
      121,
    );
    expect(probe.targetDrawImage).toHaveBeenCalledWith(
      probe.scratchCanvas,
      490,
      18,
      220,
      136,
    );
    expect(probe.operations.indexOf('source-copy'))
      .toBeLessThan(probe.operations.indexOf('final-paint'));
  });

  it('builds proportional dusk-and-gold ballistic chrome offscreen', () => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false)).toBe(true);
    expect(probe.scratchRoundRect).toHaveBeenCalledWith(11, 7, 198, 121, 7);
    expect(probe.scratchClip).toHaveBeenCalledOnce();
    expect(probe.scratchStrokeRect).toHaveBeenCalledTimes(2);
    expect(probe.scratchFillText).toHaveBeenCalledWith('IMPACT MONITOR', 18, 21);
    expect(probe.styles.fill).toContain(BACKDROP);
    expect(probe.styles.fill).toContain(TEXT.gold);
    expect(probe.styles.stroke).toContain(ACCENT.gold);
    expect(probe.targetFillRect).not.toHaveBeenCalled();
    expect(probe.targetStrokeRect).not.toHaveBeenCalled();
  });

  it('fails soft and never touches the target when source copy fails', () => {
    const probe = harness({ sourceCopyError: true });
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false)).toBe(false);
    expect(probe.scratchSave).toHaveBeenCalledTimes(2);
    expect(probe.scratchRestore).toHaveBeenCalledTimes(2);
    expect(probe.targetDrawImage).not.toHaveBeenCalled();
    expect(probe.targetFillRect).not.toHaveBeenCalled();
  });

  it('attempts only one atomic target composite when final paint fails', () => {
    const probe = harness({ finalPaintError: true });
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false)).toBe(false);
    expect(probe.scratchSave).toHaveBeenCalledTimes(2);
    expect(probe.scratchRestore).toHaveBeenCalledTimes(2);
    expect(probe.targetDrawImage).toHaveBeenCalledOnce();
    expect(probe.targetFillRect).not.toHaveBeenCalled();
    expect(probe.targetStrokeRect).not.toHaveBeenCalled();
    expect(probe.operations.filter((operation) => operation.startsWith('target-')))
      .toEqual([]);
  });

  it.each([
    { contextAvailable: false, label: '2D context unavailable' },
    { factoryError: true, label: 'canvas creation throws' },
  ])('fails soft when $label', (options) => {
    const probe = harness(options);
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false)).toBe(false);
    expect(probe.targetDrawImage).not.toHaveBeenCalled();
  });
});
