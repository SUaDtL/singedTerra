export const TERRAIN_MATERIAL_ASSET = 'art/terrain-material.webp';
export const TERRAIN_MATERIAL_SIZE = 256;
export const TERRAIN_MATERIAL_LOAD_TIMEOUT_MS = 5_000;

const MATERIAL_MASK = TERRAIN_MATERIAL_SIZE - 1;
const SIGNED_LUMINANCE_MAX = 127;

export type TerrainMaterialState = 'idle' | 'loading' | 'ready' | 'failed';
export type TerrainMaterialImageFactory = () => HTMLImageElement;
export type TerrainMaterialCanvasFactory = () => HTMLCanvasElement;

export interface TerrainMaterialSampler {
  readonly isSettled: boolean;
  readonly needsApplication: boolean;
  sample(x: number, y: number): number;
  acknowledgeApplied(): void;
  select(asset: string): void;
  reset(): void;
}

function createBrowserImage(): HTMLImageElement {
  return new Image();
}

function createBrowserCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function assetUrl(baseUrl: string, asset: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${asset}`;
}

/**
 * Decodes one project-bound rock tile into a compact signed luminance field.
 * Sampling is allocation-free and wraps by a power-of-two mask.
 */
export class TerrainMaterial implements TerrainMaterialSampler {
  private image: HTMLImageElement | null = null;
  private currentState: TerrainMaterialState = 'idle';
  private luminance: Int8Array | null = null;
  private pendingApplication = false;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(
    private readonly createImage: TerrainMaterialImageFactory = createBrowserImage,
    private readonly createCanvas: TerrainMaterialCanvasFactory =
      createBrowserCanvas,
    private readonly baseUrl: string = import.meta.env.BASE_URL,
  ) {}

  select(asset: string): void {
    if (this.image !== null) return;

    const image = this.createImage();
    const generation = ++this.generation;
    this.image = image;
    this.currentState = 'loading';
    this.luminance = null;
    this.pendingApplication = false;
    image.onload = () => {
      if (!this.isCurrent(image, generation) || this.currentState !== 'loading') {
        return;
      }
      const { naturalWidth: width, naturalHeight: height } = image;
      if (
        width !== TERRAIN_MATERIAL_SIZE
        || height !== TERRAIN_MATERIAL_SIZE
      ) {
        this.fail(image, generation);
        return;
      }

      try {
        const canvas = this.createCanvas();
        canvas.width = TERRAIN_MATERIAL_SIZE;
        canvas.height = TERRAIN_MATERIAL_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null) {
          this.fail(image, generation);
          return;
        }
        ctx.drawImage(
          image,
          0,
          0,
          TERRAIN_MATERIAL_SIZE,
          TERRAIN_MATERIAL_SIZE,
        );
        const pixels = ctx.getImageData(
          0,
          0,
          TERRAIN_MATERIAL_SIZE,
          TERRAIN_MATERIAL_SIZE,
        ).data;
        const sampleCount = TERRAIN_MATERIAL_SIZE * TERRAIN_MATERIAL_SIZE;
        let luminanceTotal = 0;
        let luminanceSquaredTotal = 0;
        for (let index = 0; index < sampleCount; index++) {
          const offset = index * 4;
          const value = (
            pixels[offset]! * 0.2126
            + pixels[offset + 1]! * 0.7152
            + pixels[offset + 2]! * 0.0722
          );
          luminanceTotal += value;
          luminanceSquaredTotal += value * value;
        }
        const mean = luminanceTotal / sampleCount;
        const variance = (
          luminanceSquaredTotal / sampleCount - mean * mean
        );
        // Centre the authored field around its own exposure so it adds grain
        // instead of globally brightening or darkening the terrain palette.
        const contrastScale = Math.max(
          Math.sqrt(Math.max(variance, 0)) * 2.5,
          1,
        );
        const luminance = new Int8Array(sampleCount);
        for (let index = 0; index < luminance.length; index++) {
          const offset = index * 4;
          const value = (
            pixels[offset]! * 0.2126
            + pixels[offset + 1]! * 0.7152
            + pixels[offset + 2]! * 0.0722
          );
          const normalized = Math.max(
            -1,
            Math.min(1, (value - mean) / contrastScale),
          );
          luminance[index] = Math.round(
            normalized * SIGNED_LUMINANCE_MAX,
          );
        }
        this.luminance = luminance;
        this.clearLoadTimeout();
        this.currentState = 'ready';
        this.pendingApplication = true;
      } catch {
        this.fail(image, generation);
      }
    };
    image.onerror = () => this.fail(image, generation);
    this.loadTimeout = globalThis.setTimeout(
      () => this.fail(image, generation),
      TERRAIN_MATERIAL_LOAD_TIMEOUT_MS,
    );
    image.src = assetUrl(this.baseUrl, asset);
  }

  reset(): void {
    this.generation++;
    this.clearLoadTimeout();
    this.image = null;
    this.luminance = null;
    this.pendingApplication = false;
    this.currentState = 'idle';
  }

  get state(): TerrainMaterialState {
    return this.currentState;
  }

  get needsApplication(): boolean {
    return this.pendingApplication;
  }

  get isSettled(): boolean {
    return (
      this.currentState === 'idle'
      || this.currentState === 'failed'
      || (this.currentState === 'ready' && !this.pendingApplication)
    );
  }

  sample(x: number, y: number): number {
    if (this.luminance === null) return 0;
    const wrappedX = Math.floor(x) & MATERIAL_MASK;
    const wrappedY = Math.floor(y) & MATERIAL_MASK;
    return (
      this.luminance[wrappedY * TERRAIN_MATERIAL_SIZE + wrappedX]!
      / SIGNED_LUMINANCE_MAX
    );
  }

  acknowledgeApplied(): void {
    if (this.currentState === 'ready') this.pendingApplication = false;
  }

  private isCurrent(image: HTMLImageElement, generation: number): boolean {
    return generation === this.generation && image === this.image;
  }

  private fail(image: HTMLImageElement, generation: number): void {
    if (!this.isCurrent(image, generation) || this.currentState !== 'loading') {
      return;
    }
    this.clearLoadTimeout();
    this.luminance = null;
    this.pendingApplication = false;
    this.currentState = 'failed';
  }

  private clearLoadTimeout(): void {
    if (this.loadTimeout === null) return;
    globalThis.clearTimeout(this.loadTimeout);
    this.loadTimeout = null;
  }
}
