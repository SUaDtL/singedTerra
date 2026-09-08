import type { TankState } from '@shared/types/GameState';
import type { TankLoadout } from '@shared/types/TankLoadout';
import { TankPartArt } from './TankPartArt';

let previewArt: TankPartArt | null = null;

function currentPreviewArt(): TankPartArt {
  previewArt ??= new TankPartArt();
  return previewArt;
}
interface PreviewSubscription {
  readonly canvas: WeakRef<HTMLCanvasElement>;
  readonly unsubscribe: () => void;
  wasConnected: boolean;
}
const previewSubscriptions = new WeakMap<
  HTMLCanvasElement,
  PreviewSubscription
>();
const activePreviewSubscriptions = new Set<PreviewSubscription>();

function removePreviewSubscription(subscription: PreviewSubscription): void {
  subscription.unsubscribe();
  activePreviewSubscriptions.delete(subscription);
  const canvas = subscription.canvas.deref();
  if (canvas && previewSubscriptions.get(canvas) === subscription) {
    previewSubscriptions.delete(canvas);
  }
}

function pruneDetachedPreviewSubscriptions(): void {
  for (const subscription of activePreviewSubscriptions) {
    const canvas = subscription.canvas.deref();
    if (!canvas) {
      removePreviewSubscription(subscription);
    } else if (canvas.isConnected) {
      subscription.wasConnected = true;
    } else if (subscription.wasConnected) {
      removePreviewSubscription(subscription);
    }
  }
}

/** Release page-shared preview art while no lobby/HUD preview generation is active. */
export function releaseTankLoadoutPreviewResources(): void {
  for (const subscription of [...activePreviewSubscriptions]) {
    removePreviewSubscription(subscription);
  }
  previewArt = null;
}

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
    artScale: 2.68,
  },
};

/** Invalidate queued atlas retries and remove any stale assembled vehicle. */
export function clearTankLoadoutPreview(canvas: HTMLCanvasElement): void {
  const subscription = previewSubscriptions.get(canvas);
  if (subscription) removePreviewSubscription(subscription);
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
  pruneDetachedPreviewSubscriptions();
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
  const currentSubscription = previewSubscriptions.get(canvas);
  if (currentSubscription) removePreviewSubscription(currentSubscription);
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
  const art = currentPreviewArt();
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
    ? art.drawStatic(ctx, tank)
    : art.drawStatic(ctx, tank, profile.artScale);
  const barrelReady = staticReady && (
    profile.artScale === undefined
      ? art.drawBarrel(ctx, tank)
      : art.drawBarrel(ctx, tank, profile.artScale)
  );
  if (!staticReady || !barrelReady) drawFallback(ctx, color, profile);
  ctx.restore();

  if (art.state === 'loading' || art.state === 'timed_out') {
    const canvasRef = new WeakRef(canvas);
    let subscription: PreviewSubscription;
    const unsubscribe = art.onReady(() => {
      activePreviewSubscriptions.delete(subscription);
      const currentCanvas = canvasRef.deref();
      if (!currentCanvas) return;
      if (previewSubscriptions.get(currentCanvas) === subscription) {
        previewSubscriptions.delete(currentCanvas);
      }
      if (
        currentCanvas.isConnected
        && currentCanvas.dataset['tankPreviewSignature'] === signature
      ) {
        paintTankLoadoutPreview(currentCanvas, color, loadout, mode);
      }
    });
    subscription = {
      canvas: canvasRef,
      unsubscribe,
      wasConnected: canvas.isConnected,
    };
    activePreviewSubscriptions.add(subscription);
    previewSubscriptions.set(canvas, subscription);
    queueMicrotask(() => {
      if (!activePreviewSubscriptions.has(subscription)) return;
      const currentCanvas = canvasRef.deref();
      if (currentCanvas?.isConnected) {
        subscription.wasConnected = true;
      } else {
        removePreviewSubscription(subscription);
      }
    });
  }
}
