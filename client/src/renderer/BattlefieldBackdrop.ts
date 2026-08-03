import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import {
  normalizeBattlefieldWorldId,
  type BattlefieldWorldId,
} from '@shared/types/GameOptions';

export interface BattlefieldWorld {
  readonly id: 'ember-dusk' | 'obsidian-caldera' | 'glassstorm-expanse';
  readonly name: string;
  readonly asset: string;
  readonly terrainMaterialAsset: string;
  readonly terrainPalette: TerrainPalette;
}

export interface TerrainPalette {
  readonly rim: string;
  readonly mid: string;
  readonly deep: string;
  readonly bandSurface: string;
  readonly bandMid: string;
  readonly bandDeep: string;
  readonly bevelShadow: string;
}

export const BATTLEFIELD_WORLDS: readonly BattlefieldWorld[] = Object.freeze([
  Object.freeze({
    id: 'ember-dusk',
    name: 'Ember Dusk',
    asset: 'art/battlefield-backdrop.webp',
    terrainMaterialAsset: 'art/terrain-material.webp',
    terrainPalette: Object.freeze({
      rim: '#7a4f2e',
      mid: '#3c2516',
      deep: '#1d120b',
      bandSurface: '#5a3a22',
      bandMid: '#3d2d1a',
      bandDeep: '#2a1e2e',
      bevelShadow: '#0c0716',
    }),
  }),
  Object.freeze({
    id: 'obsidian-caldera',
    name: 'Obsidian Caldera',
    asset: 'art/battlefield-obsidian-caldera.webp',
    terrainMaterialAsset: 'art/terrain-material-obsidian-caldera.webp',
    terrainPalette: Object.freeze({
      rim: '#4b5963',
      mid: '#29343c',
      deep: '#12191f',
      bandSurface: '#101820',
      bandMid: '#26323a',
      bandDeep: '#161d26',
      bevelShadow: '#080c10',
    }),
  }),
  Object.freeze({
    id: 'glassstorm-expanse',
    name: 'Glassstorm Expanse',
    asset: 'art/battlefield-glassstorm-expanse.webp',
    terrainMaterialAsset: 'art/terrain-material-glassstorm-expanse.webp',
    terrainPalette: Object.freeze({
      rim: '#c5d4d6',
      mid: '#61727d',
      deep: '#33424f',
      bandSurface: '#80949c',
      bandMid: '#536773',
      bandDeep: '#334a5a',
      bevelShadow: '#182936',
    }),
  }),
]);

/**
 * Stable presentation-only world choice derived from authoritative terrain.
 *
 * Sampling a co-prime stride covers both air and ground rows without hashing the
 * full terrain bitmap. This never enters simulation or replay state; it only makes
 * clients that began from identical terrain choose the same panorama.
 */
export function selectBattlefieldWorld(
  terrain: Uint8Array,
  requestedWorld?: unknown,
): BattlefieldWorld {
  const explicitId = normalizeBattlefieldWorldId(requestedWorld);
  if (explicitId !== undefined) {
    return BATTLEFIELD_WORLDS.find((world) => world.id === explicitId)!;
  }
  let hash = 2_166_136_261;
  for (let index = 0; index < terrain.length; index += 257) {
    hash = Math.imul(hash ^ terrain[index]!, 16_777_619);
  }
  hash = Math.imul(hash ^ terrain.length, 16_777_619);
  return BATTLEFIELD_WORLDS[(hash >>> 0) % BATTLEFIELD_WORLDS.length]!;
}

export { normalizeBattlefieldWorldId };

export type BattlefieldBackdropState = 'loading' | 'ready' | 'failed';
export type BackdropImageFactory = () => HTMLImageElement;

function createBrowserImage(): HTMLImageElement {
  return new Image();
}

function assetUrl(baseUrl: string, asset: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${asset}`;
}

interface SourceCrop {
  sx: number;
  sy: number;
  width: number;
  height: number;
}

export function centeredCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): SourceCrop {
  const sourceRatio = sourceWidth / sourceHeight;
  const destinationRatio = destinationWidth / destinationHeight;
  if (sourceRatio > destinationRatio) {
    const width = sourceHeight * destinationRatio;
    return {
      sx: (sourceWidth - width) / 2,
      sy: 0,
      width,
      height: sourceHeight,
    };
  }
  const height = sourceWidth / destinationRatio;
  return {
    sx: 0,
    sy: (sourceHeight - height) / 2,
    width: sourceWidth,
    height,
  };
}

/**
 * Owns one selected panorama for the current game.
 *
 * Selection is frozen until reset(), so mutable crater pixels cannot switch the
 * world. Loading and failures deliberately return false from draw(): the caller
 * keeps painting the complete procedural atmosphere until the asset is ready.
 */
export class BattlefieldBackdrop {
  private image: HTMLImageElement | null = null;
  private currentWorld: BattlefieldWorld | null = null;
  private currentState: BattlefieldBackdropState = 'loading';
  private pendingFirstDraw = false;
  private generation = 0;

  constructor(
    private readonly createImage: BackdropImageFactory = createBrowserImage,
    private readonly baseUrl: string = import.meta.env.BASE_URL,
  ) {}

  get selectedWorld(): BattlefieldWorld | null {
    return this.currentWorld;
  }

  get state(): BattlefieldBackdropState {
    return this.currentState;
  }

  get isSettled(): boolean {
    return (
      this.currentState === 'failed'
      || (this.currentState === 'ready' && !this.pendingFirstDraw)
    );
  }

  select(terrain: Uint8Array, requestedWorld?: BattlefieldWorldId | unknown): BattlefieldWorld {
    if (this.currentWorld !== null) return this.currentWorld;

    const world = selectBattlefieldWorld(terrain, requestedWorld);
    const image = this.createImage();
    const generation = ++this.generation;
    this.currentWorld = world;
    this.image = image;
    this.currentState = 'loading';
    this.pendingFirstDraw = false;

    image.onload = () => {
      if (generation !== this.generation || image !== this.image) return;
      const { naturalWidth: width, naturalHeight: height } = image;
      const isValid = (
        Number.isFinite(width)
        && Number.isFinite(height)
        && width > 0
        && height > 0
        && width === height * 2
      );
      this.currentState = isValid ? 'ready' : 'failed';
      this.pendingFirstDraw = isValid;
    };
    image.onerror = () => {
      if (generation !== this.generation || image !== this.image) return;
      this.currentState = 'failed';
      this.pendingFirstDraw = false;
    };
    image.src = assetUrl(this.baseUrl, world.asset);
    return world;
  }

  reset(): void {
    this.generation++;
    this.image = null;
    this.currentWorld = null;
    this.currentState = 'loading';
    this.pendingFirstDraw = false;
  }

  draw(ctx: CanvasRenderingContext2D, overscan = 0): boolean {
    if (this.currentState !== 'ready' || this.image === null) return false;
    const x = overscan === 0 ? 0 : -overscan;
    const y = overscan === 0 ? 0 : -overscan / 2;
    const destinationWidth = CANVAS_WIDTH + overscan * 2;
    const destinationHeight = CANVAS_HEIGHT + overscan;
    const crop = centeredCoverCrop(
      this.image.naturalWidth,
      this.image.naturalHeight,
      destinationWidth,
      destinationHeight,
    );
    ctx.drawImage(
      this.image,
      crop.sx,
      crop.sy,
      crop.width,
      crop.height,
      x,
      y,
      destinationWidth,
      destinationHeight,
    );
    this.pendingFirstDraw = false;
    return true;
  }
}
