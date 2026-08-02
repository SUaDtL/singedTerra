export const EXPLOSION_ART_ASSET = 'art/explosion-sheet.webp';
export const EXPLOSION_ART_SOURCE_SIZE = 768;
export const EXPLOSION_ART_CELL_SIZE = 256;
export const EXPLOSION_ART_FRAME_COUNT = 9;
export const EXPLOSION_ART_LOAD_TIMEOUT_MS = 5_000;

export type ExplosionArtState = 'loading' | 'ready' | 'failed';
export type ExplosionArtImageFactory = () => HTMLImageElement;

function createBrowserImage(): HTMLImageElement {
  return new Image();
}

function assetUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${EXPLOSION_ART_ASSET}`;
}

/**
 * Loads and paints the authored conventional-blast atlas.
 *
 * Every unavailable or invalid path returns false so Renderer can retain its
 * complete procedural explosion. The class owns presentation only and never
 * observes or mutates deterministic game state.
 */
export class ExplosionArt {
  private readonly image: HTMLImageElement;
  private currentState: ExplosionArtState = 'loading';
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    createImage: ExplosionArtImageFactory = createBrowserImage,
    baseUrl: string = import.meta.env.BASE_URL,
  ) {
    this.image = createImage();
    this.image.onload = () => {
      if (this.currentState !== 'loading') return;
      if (
        this.image.naturalWidth !== EXPLOSION_ART_SOURCE_SIZE
        || this.image.naturalHeight !== EXPLOSION_ART_SOURCE_SIZE
      ) {
        this.fail();
        return;
      }
      this.clearLoadTimeout();
      this.currentState = 'ready';
    };
    this.image.onerror = () => this.fail();
    this.loadTimeout = globalThis.setTimeout(
      () => this.fail(),
      EXPLOSION_ART_LOAD_TIMEOUT_MS,
    );
    this.image.src = assetUrl(baseUrl);
  }

  get state(): ExplosionArtState {
    return this.currentState;
  }

  get isSettled(): boolean {
    return this.currentState !== 'loading';
  }

  /** Paint one centered square frame fully inside `reachRadius`. */
  draw(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    reachRadius: number,
    progress: number,
  ): boolean {
    if (
      this.currentState !== 'ready'
      || !Number.isFinite(cx)
      || !Number.isFinite(cy)
      || !Number.isFinite(reachRadius)
      || reachRadius <= 0
      || !Number.isFinite(progress)
    ) return false;

    const boundedProgress = Math.max(0, Math.min(1, progress));
    const frame = Math.min(
      EXPLOSION_ART_FRAME_COUNT - 1,
      Math.floor(boundedProgress * EXPLOSION_ART_FRAME_COUNT),
    );
    const sourceX = (frame % 3) * EXPLOSION_ART_CELL_SIZE;
    const sourceY = Math.floor(frame / 3) * EXPLOSION_ART_CELL_SIZE;
    const diameter = reachRadius * 2;
    let saved = false;
    try {
      ctx.save();
      saved = true;
      ctx.beginPath();
      ctx.arc(cx, cy, reachRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        this.image,
        sourceX,
        sourceY,
        EXPLOSION_ART_CELL_SIZE,
        EXPLOSION_ART_CELL_SIZE,
        cx - reachRadius,
        cy - reachRadius,
        diameter,
        diameter,
      );
      ctx.restore();
      saved = false;
      return true;
    } catch {
      if (saved) {
        try {
          ctx.restore();
        } catch {
          // The target context is already unusable; Renderer owns the fallback.
        }
      }
      // A transient target-context failure must not poison the reusable asset.
      return false;
    }
  }

  private fail(): void {
    if (this.currentState === 'failed') return;
    this.clearLoadTimeout();
    this.currentState = 'failed';
  }

  private clearLoadTimeout(): void {
    if (this.loadTimeout === null) return;
    globalThis.clearTimeout(this.loadTimeout);
    this.loadTimeout = null;
  }
}
