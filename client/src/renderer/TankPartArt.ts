import type { TankState } from '@shared/types/GameState';
import {
  DEFAULT_TANK_LOADOUT,
  normalizeTankLoadout,
  type TankKitId,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import {
  TANK_PART_ATLAS_ASSET,
  TANK_PART_ATLAS_HEIGHT,
  TANK_PART_ATLAS_WIDTH,
  TANK_PART_SLOTS,
  tankPartDefinition,
  tankBarrelMount,
  type TankPartDefinition,
  type TankPartSlot,
} from './tankPartCatalog';

export const TANK_PART_LOAD_TIMEOUT_MS = 5_000;

export type TankPartArtState = 'loading' | 'ready' | 'failed';
export type TankPartImageFactory = () => HTMLImageElement;
export type TankPartCanvasFactory = () => HTMLCanvasElement;

export interface TankPartPainter {
  readonly state: TankPartArtState;
  readonly isSettled: boolean;
  drawStatic(
    ctx: CanvasRenderingContext2D,
    tank: Readonly<TankState>,
    scale?: number,
  ): boolean;
  drawBarrel(
    ctx: CanvasRenderingContext2D,
    tank: Readonly<TankState>,
    scale?: number,
  ): boolean;
}

function normalizeRenderScale(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : 1;
}

function createBrowserImage(): HTMLImageElement {
  return new Image();
}

function createBrowserCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function assetUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${TANK_PART_ATLAS_ASSET}`;
}

/**
 * Loads one four-cell atlas and lazily caches each slot/color combination.
 * The renderer retains its previous authored/procedural fallbacks whenever this
 * painter is not ready or a draw fails.
 */
export class TankPartArt implements TankPartPainter {
  private readonly image: HTMLImageElement;
  private readonly variants = new Map<string, HTMLCanvasElement>();
  private readonly paintedSlots = new Set<TankPartSlot>();
  private currentState: TankPartArtState = 'loading';
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    createImage: TankPartImageFactory = createBrowserImage,
    private readonly createCanvas: TankPartCanvasFactory =
      createBrowserCanvas,
    baseUrl: string = import.meta.env.BASE_URL,
  ) {
    this.image = createImage();
    this.image.onload = () => {
      if (this.currentState !== 'loading') return;
      if (
        this.image.naturalWidth !== TANK_PART_ATLAS_WIDTH
        || this.image.naturalHeight !== TANK_PART_ATLAS_HEIGHT
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
      TANK_PART_LOAD_TIMEOUT_MS,
    );
    this.image.src = assetUrl(baseUrl);
  }

  get state(): TankPartArtState {
    return this.currentState;
  }

  get isSettled(): boolean {
    return (
      this.currentState === 'failed'
      || (
        this.currentState === 'ready'
        && this.paintedSlots.size === TANK_PART_SLOTS.length
      )
    );
  }

  /** Test/debug seam: which independently cached slots exist for one color. */
  cachedSlots(
    color: string,
    loadout: Readonly<TankLoadout> = DEFAULT_TANK_LOADOUT,
  ): TankPartSlot[] {
    return TANK_PART_SLOTS.filter((slot) =>
      this.variants.has(this.cacheKey(loadout[slot], slot, color)));
  }

  drawStatic(
    ctx: CanvasRenderingContext2D,
    tank: Readonly<TankState>,
    scale?: number,
  ): boolean {
    if (this.currentState !== 'ready') return false;
    const renderScale = normalizeRenderScale(scale);
    const loadout = normalizeTankLoadout(tank.loadout);
    const slots = ['treads', 'hull', 'turret'] as const;
    const prepared = slots.map((slot) => ({
      slot,
      definition: tankPartDefinition(loadout, slot),
      variant: this.variantFor(
        loadout[slot],
        slot,
        tankPartDefinition(loadout, slot),
        tank.color,
        renderScale,
      ),
    }));
    if (prepared.some(({ variant }) => variant === null)) return false;

    try {
      for (const { slot, definition, variant } of prepared) {
        ctx.drawImage(
          variant!,
          tank.x + definition.offsetX * renderScale,
          tank.y + definition.offsetY * renderScale,
        );
        this.paintedSlots.add(slot);
      }
      return true;
    } catch {
      this.fail();
      return false;
    }
  }

  drawBarrel(
    ctx: CanvasRenderingContext2D,
    tank: Readonly<TankState>,
    scale?: number,
  ): boolean {
    if (this.currentState !== 'ready') return false;
    const renderScale = normalizeRenderScale(scale);
    const loadout = normalizeTankLoadout(tank.loadout);
    const definition = tankPartDefinition(loadout, 'barrel');
    const variant = this.variantFor(
      loadout.barrel,
      'barrel',
      definition,
      tank.color,
      renderScale,
    );
    if (variant === null) return false;
    const mount = tankBarrelMount(tank);

    try {
      ctx.save();
      ctx.translate(
        tank.x + (mount.pivot.x - tank.x) * renderScale,
        tank.y + (mount.pivot.y - tank.y) * renderScale,
      );
      ctx.rotate(mount.radians);
      // A tight silhouette keeps red barrels readable against the red dusk sky
      // without flattening the authored rivets and muzzle detail.
      ctx.shadowColor = '#10070b';
      ctx.shadowBlur = 0.75;
      ctx.drawImage(
        variant,
        definition.offsetX * renderScale,
        definition.offsetY * renderScale,
      );
      ctx.restore();
      this.paintedSlots.add('barrel');
      return true;
    } catch {
      // Balance a successful save even when a later transform/draw throws.
      try {
        ctx.restore();
      } catch {
        // Target context is already unusable; the renderer will draw fallback.
      }
      this.fail();
      return false;
    }
  }

  private variantFor(
    kit: TankKitId,
    slot: TankPartSlot,
    definition: TankPartDefinition,
    color: string,
    scale: number,
  ): HTMLCanvasElement | null {
    const key = this.cacheKey(kit, slot, color, scale);
    const cached = this.variants.get(key);
    if (cached !== undefined) return cached;

    try {
      const canvas = this.createCanvas();
      canvas.width = definition.width * scale;
      canvas.height = definition.height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        this.fail();
        return null;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      this.drawSource(ctx, definition, scale);

      // The chassis carries player identity. Keep the barrel neutral steel so
      // its authored muzzle and highlight remain legible against every sky.
      if (slot === 'barrel') {
        this.variants.set(key, canvas);
        return canvas;
      }

      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      // Multiply intentionally paints through transparent pixels. Restore the
      // authored alpha once; the fill has made destination alpha opaque, so
      // this does not square the source edge alpha.
      ctx.globalCompositeOperation = 'destination-in';
      this.drawSource(ctx, definition, scale);
      ctx.globalCompositeOperation = 'source-over';
      this.variants.set(key, canvas);
      return canvas;
    } catch {
      this.fail();
      return null;
    }
  }

  private drawSource(
    ctx: CanvasRenderingContext2D,
    definition: TankPartDefinition,
    scale: number,
  ): void {
    const source = definition.source;
    ctx.drawImage(
      this.image,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      definition.width * scale,
      definition.height * scale,
    );
  }

  private cacheKey(
    kit: TankKitId,
    slot: TankPartSlot,
    color: string,
    scale = 1,
  ): string {
    return `${kit}:${slot}:${color}:${normalizeRenderScale(scale)}`;
  }

  private fail(): void {
    if (this.currentState === 'failed') return;
    this.clearLoadTimeout();
    this.currentState = 'failed';
    this.variants.clear();
    this.paintedSlots.clear();
  }

  private clearLoadTimeout(): void {
    if (this.loadTimeout === null) return;
    globalThis.clearTimeout(this.loadTimeout);
    this.loadTimeout = null;
  }
}
