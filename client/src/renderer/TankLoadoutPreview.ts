import type { TankState } from '@shared/types/GameState';
import type { TankLoadout } from '@shared/types/TankLoadout';
import { TankPartArt } from './TankPartArt';

const previewArt = new TankPartArt();
const PREVIEW_WIDTH = 84;
const PREVIEW_HEIGHT = 48;
const SCALE = 1.6;
const RETRY_MS = 50;

/** Invalidate queued atlas retries and remove any stale assembled vehicle. */
export function clearTankLoadoutPreview(canvas: HTMLCanvasElement): void {
  delete canvas.dataset['tankPreviewSignature'];
  if (
    typeof navigator !== 'undefined'
    && navigator.userAgent.toLowerCase().includes('jsdom')
  ) return;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    // DOM-only test environments do not implement Canvas.
  }
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}

function drawFallback(
  ctx: CanvasRenderingContext2D,
  color: string,
): void {
  ctx.fillStyle = '#12090b';
  ctx.fillRect(3, 20, 34, 6);
  ctx.fillStyle = color;
  ctx.fillRect(7, 12, 26, 9);
  ctx.fillRect(15, 7, 13, 6);
  ctx.strokeStyle = '#e8e0d2';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(21, 8);
  ctx.lineTo(40, 4);
  ctx.stroke();
}

/**
 * Paint a lobby preview through the same authored painter as the battlefield.
 * A compact geometric fallback appears immediately while the atlas loads.
 */
export function paintTankLoadoutPreview(
  canvas: HTMLCanvasElement,
  color: string,
  loadout: TankLoadout,
): void {
  const signature = [
    color,
    loadout.treads,
    loadout.hull,
    loadout.turret,
    loadout.barrel,
  ].join('|');
  canvas.dataset['tankPreviewSignature'] = signature;
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  if (
    typeof navigator !== 'undefined'
    && navigator.userAgent.toLowerCase().includes('jsdom')
  ) return;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    // DOM-only test environments do not implement Canvas; the live browser does.
  }
  if (ctx === null) return;
  ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.scale(SCALE, SCALE);
  const tank = {
    x: 22,
    y: 27,
    angle: 12,
    color,
    loadout,
  } as TankState;
  const staticReady = previewArt.drawStatic(ctx, tank);
  const barrelReady = staticReady && previewArt.drawBarrel(ctx, tank);
  if (!staticReady || !barrelReady) drawFallback(ctx, color);
  ctx.restore();

  if (previewArt.state === 'loading') {
    globalThis.setTimeout(() => {
      if (
        canvas.isConnected
        && canvas.dataset['tankPreviewSignature'] === signature
      ) {
        paintTankLoadoutPreview(canvas, color, loadout);
      }
    }, RETRY_MS);
  }
}
