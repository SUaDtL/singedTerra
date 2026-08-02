import { ACCENT, BACKDROP, FONT, TEXT } from '../ui/theme';
import {
  IMPACT_MONITOR_FRAME_HEIGHT,
  IMPACT_MONITOR_FRAME_WIDTH,
  type ImpactMonitorGeometry,
} from './impactMonitor';

export type ImpactMonitorCanvasFactory = () => HTMLCanvasElement;

function createCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

export class ImpactMonitorPainter {
  private readonly compositeCanvas: HTMLCanvasElement | null;
  private readonly compositeContext: CanvasRenderingContext2D | null;

  constructor(createCompositeCanvas: ImpactMonitorCanvasFactory = createCanvas) {
    try {
      const canvas = createCompositeCanvas();
      canvas.width = IMPACT_MONITOR_FRAME_WIDTH;
      canvas.height = IMPACT_MONITOR_FRAME_HEIGHT;
      this.compositeCanvas = canvas;
      this.compositeContext = canvas.getContext('2d');
    } catch {
      this.compositeCanvas = null;
      this.compositeContext = null;
    }
  }

  draw(
    target: CanvasRenderingContext2D,
    geometry: ImpactMonitorGeometry | null,
    reduceMotion: boolean,
  ): boolean {
    const canvas = this.compositeCanvas;
    const ctx = this.compositeContext;
    if (reduceMotion || geometry === null || !canvas || !ctx) return false;

    const { content, frame, source } = geometry;
    const contentX = content.x - frame.x;
    const contentY = content.y - frame.y;
    let savedDepth = 0;
    let composed = false;

    try {
      ctx.clearRect(0, 0, frame.width, frame.height);
      ctx.save();
      savedDepth += 1;

      // Keep the shadow inside the atomic composite so a failed target paint
      // cannot leave any monitor fragment behind on the battlefield.
      ctx.fillStyle = 'rgba(12, 7, 22, 0.72)';
      ctx.fillRect(3, 4, frame.width - 3, frame.height - 4);
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, frame.width - 3, frame.height - 3);

      ctx.save();
      savedDepth += 1;
      ctx.beginPath();
      ctx.roundRect(
        contentX,
        contentY,
        content.width,
        content.height,
        7,
      );
      ctx.clip();
      ctx.drawImage(
        target.canvas,
        source.x,
        source.y,
        source.width,
        source.height,
        contentX,
        contentY,
        content.width,
        content.height,
      );
      ctx.restore();
      savedDepth -= 1;

      ctx.lineWidth = 1;
      ctx.strokeStyle = ACCENT.gold;
      ctx.strokeRect(0.5, 0.5, frame.width - 1, frame.height - 1);
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.34)';
      ctx.strokeRect(4.5, 4.5, frame.width - 9, frame.height - 9);

      ctx.fillStyle = BACKDROP;
      ctx.fillRect(12, 7, 111, 19);
      ctx.fillStyle = TEXT.gold;
      ctx.font = `700 11px ${FONT.mono}`;
      ctx.textBaseline = 'middle';
      ctx.fillText('IMPACT MONITOR', 18, 21);
      composed = true;
    } catch {
      composed = false;
    } finally {
      while (savedDepth > 0) {
        try {
          ctx.restore();
          savedDepth -= 1;
        } catch {
          composed = false;
          break;
        }
      }
    }

    if (!composed) return false;

    try {
      // This is the only target-canvas paint. Canvas drawImage is atomic: if it
      // throws, the already-composed offscreen frame never covers the battlefield.
      target.drawImage(canvas, frame.x, frame.y, frame.width, frame.height);
      return true;
    } catch {
      return false;
    }
  }
}
