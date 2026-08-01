import type { TankState } from '@shared/types/GameState';
import type { TankLoadout } from '@shared/types/TankLoadout';
import { TankPartArt } from './TankPartArt';

const previewArt = new TankPartArt();
const RETRY_MS = 50;

export type TankLoadoutPreviewMode = 'thumbnail' | 'spotlight' | 'tactical';

interface TankLoadoutPreviewProfile {
  readonly width: number;
  readonly height: number;
  readonly tankX: number;
  readonly tankY: number;
  readonly contextScale: number;
  readonly artScale?: number;
}

const PREVIEW_PROFILES: Readonly<
  Record<TankLoadoutPreviewMode, TankLoadoutPreviewProfile>
> = {
  thumbnail: {
    width: 84,
    height: 48,
    tankX: 22,
    tankY: 27,
    contextScale: 1.6,
  },
  spotlight: {
    width: 320,
    height: 180,
    tankX: 160,
    tankY: 158,
    contextScale: 1,
    artScale: 4,
  },
  tactical: {
    width: 144,
    height: 80,
    tankX: 72,
    tankY: 70,
    contextScale: 1,
    artScale: 2,
  },
};

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
  profile: TankLoadoutPreviewProfile,
): void {
  const fallbackScale = profile.artScale ?? 1;
  if (fallbackScale !== 1) {
    ctx.translate(
      (profile.width - 43 * fallbackScale) / 2,
      (profile.height - 30 * fallbackScale) / 2,
    );
    ctx.scale(fallbackScale, fallbackScale);
  }
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
  mode: TankLoadoutPreviewMode = 'thumbnail',
): void {
  const profile = PREVIEW_PROFILES[mode];
  const signature = [
    mode,
    color,
    loadout.treads,
    loadout.hull,
    loadout.turret,
    loadout.barrel,
  ].join('|');
  canvas.dataset['tankPreviewSignature'] = signature;
  canvas.width = profile.width;
  canvas.height = profile.height;
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
  ctx.clearRect(0, 0, profile.width, profile.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  if (profile.contextScale !== 1) {
    ctx.scale(profile.contextScale, profile.contextScale);
  }
  const tank = {
    x: profile.tankX,
    y: profile.tankY,
    angle: 12,
    color,
    loadout,
  } as TankState;
  const staticReady = profile.artScale === undefined
    ? previewArt.drawStatic(ctx, tank)
    : previewArt.drawStatic(ctx, tank, profile.artScale);
  const barrelReady = staticReady && (
    profile.artScale === undefined
      ? previewArt.drawBarrel(ctx, tank)
      : previewArt.drawBarrel(ctx, tank, profile.artScale)
  );
  if (!staticReady || !barrelReady) drawFallback(ctx, color, profile);
  ctx.restore();

  if (previewArt.state === 'loading') {
    globalThis.setTimeout(() => {
      if (
        canvas.isConnected
        && canvas.dataset['tankPreviewSignature'] === signature
      ) {
        paintTankLoadoutPreview(canvas, color, loadout, mode);
      }
    }, RETRY_MS);
  }
}
