import { describe, expect, it, vi } from 'vitest';
import { BACKDROP, TEXT } from '../ui/theme';
import {
  ImpactMonitorPainter,
  type ImpactMonitorCanvasFactory,
} from './ImpactMonitorPainter';
import type { ImpactMonitorGeometry } from './impactMonitor';
import type { ImpactLearningCue } from './impactLearning';

const geometry: ImpactMonitorGeometry = {
  focus: { x: 607, y: 295 },
  source: { x: 535, y: 251, width: 144, height: 88 },
  content: { x: 501, y: 25, width: 198, height: 121 },
  frame: { x: 490, y: 18, width: 220, height: 136 },
};

const compactGeometry: ImpactMonitorGeometry = {
  focus: { x: 600, y: 300 },
  source: { x: 470.4, y: 220.8, width: 259.2, height: 158.4 },
  content: { x: 421.8, y: 45, width: 356.4, height: 217.8 },
  frame: { x: 402, y: 32.4, width: 396, height: 244.8 },
};

const cue: ImpactLearningCue = {
  readout: '84 PX LEFT OF CPU 1',
  correction: 'SHIFT IMPACT RIGHT',
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
  const scratchFill = vi.fn(() => operations.push('shape-fill'));
  const scratchStroke = vi.fn(() => operations.push('shape-stroke'));
  const scratchFillText = vi.fn(() => operations.push('label'));
  const scratch = {
    save: scratchSave,
    restore: scratchRestore,
    clearRect: vi.fn(() => operations.push('scratch-clear')),
    drawImage: scratchDrawImage,
    beginPath: vi.fn(),
    roundRect: scratchRoundRect,
    clip: scratchClip,
    fill: scratchFill,
    stroke: scratchStroke,
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

  it('resizes and scales the complete frame for a compact readable viewport', () => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, compactGeometry, false)).toBe(true);

    expect(probe.scratchCanvas.width).toBe(396);
    expect(probe.scratchCanvas.height).toBe(245);
    const [contentX, contentY, contentWidth, contentHeight, radius] =
      probe.scratchRoundRect.mock.calls[0]!;
    expect(contentX).toBeCloseTo(19.8);
    expect(contentY).toBeCloseTo(12.6);
    expect(contentWidth).toBeCloseTo(356.4);
    expect(contentHeight).toBeCloseTo(217.8);
    expect(radius).toBeCloseTo(12.6);
    const [, labelX, labelY] = probe.scratchFillText.mock.calls[0]!;
    expect(labelX).toBeCloseTo(32.4);
    expect(labelY).toBeCloseTo(37.8);
    expect(probe.targetDrawImage).toHaveBeenCalledWith(
      probe.scratchCanvas,
      402,
      32.4,
      396,
      244.8,
    );
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

    expect(monitor.draw(probe.target, geometry, false, cue)).toBe(true);
    expect(probe.scratchRoundRect).toHaveBeenCalledWith(11, 7, 198, 121, 7);
    expect(probe.scratchRoundRect).toHaveBeenCalledWith(1, 1, 218, 134, 8);
    expect(probe.scratchRoundRect).toHaveBeenCalledWith(5, 5, 210, 126, 6);
    expect(probe.scratchRoundRect).toHaveBeenCalledWith(10, 6, 118, 22, 4);
    expect(probe.scratchRoundRect).toHaveBeenCalledWith(10, 94, 200, 36, 4);
    expect(probe.scratchClip).toHaveBeenCalledOnce();
    expect(probe.scratchStrokeRect).not.toHaveBeenCalled();
    expect(probe.scratchFillText).toHaveBeenCalledWith('IMPACT MONITOR', 18, 21);
    expect(probe.styles.fill).toContain(BACKDROP);
    expect(probe.styles.fill).toContain(TEXT.gold);
    expect(probe.styles.stroke).toContain('rgba(214, 160, 70, 0.78)');
    expect(probe.targetFillRect).not.toHaveBeenCalled();
    expect(probe.targetStrokeRect).not.toHaveBeenCalled();
  });

  it('draws a bounded two-line learning cue inside the normal monitor frame', () => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false, cue)).toBe(true);

    expect(probe.scratchFillText).toHaveBeenNthCalledWith(
      2,
      '84 PX LEFT OF CPU 1',
      18,
      107,
      184,
    );
    expect(probe.scratchFillText).toHaveBeenNthCalledWith(
      3,
      'SHIFT IMPACT RIGHT',
      18,
      122,
      184,
    );
  });

  it('scales the complete learning cue with the compact monitor frame', () => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, compactGeometry, false, cue)).toBe(true);

    expect(probe.scratchFillText).toHaveBeenNthCalledWith(
      2,
      '84 PX LEFT OF CPU 1',
      32.4,
      192.6,
      331.2,
    );
    expect(probe.scratchFillText).toHaveBeenNthCalledWith(
      3,
      'SHIFT IMPACT RIGHT',
      32.4,
      219.6,
      331.2,
    );
  });

  it('keeps the existing single label when no learning cue is available', () => {
    const probe = harness();
    const monitor = new ImpactMonitorPainter(probe.factory);

    expect(monitor.draw(probe.target, geometry, false)).toBe(true);
    expect(probe.scratchFillText).toHaveBeenCalledOnce();
    expect(probe.scratchFillText).toHaveBeenCalledWith('IMPACT MONITOR', 18, 21);
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
