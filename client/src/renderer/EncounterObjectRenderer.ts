import type { CampaignObjectState } from '@shared/campaign/objects';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { ashRoadAsset, type AshRoadAssetId } from '../assets/campaign/manifest';

export interface EncounterViewport {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly zoom: number;
}

export interface EncounterHitRegion {
  readonly id: string;
  readonly kind: CampaignObjectState['kind'];
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface EncounterRenderFrame {
  readonly objectIds: readonly string[];
  readonly hitRegions: readonly EncounterHitRegion[];
  readonly assetState: 'loading' | 'ready' | 'failed';
  readonly animationPending: boolean;
  readonly view: Readonly<{
    scale: number;
    offsetX: number;
    offsetY: number;
  }>;
}

export interface EncounterObjectRendererOptions {
  readonly createImage?: () => HTMLImageElement;
  /** Aggregate renderers use this so ordinary play never requests campaign art. */
  readonly deferAssetLoad?: boolean;
  readonly reducedMotion?: boolean;
  readonly onVisualReady?: () => void;
}

const MAX_VISUAL_ZOOM = 2;
const DECORATIVE_MOTION_FRAMES = 24;
const OBJECT_ASSET_IDS = Object.freeze({
  'supply-drum': 'drum',
  protected: 'refinery',
  relay: 'relay',
  cache: 'cache',
} as const satisfies Record<CampaignObjectState['kind'], AshRoadAssetId>);

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function projectView(viewport: EncounterViewport): EncounterRenderFrame['view'] {
  const width = positiveFinite(viewport.width, CANVAS_WIDTH);
  const height = positiveFinite(viewport.height, CANVAS_HEIGHT);
  const fitScale = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
  const zoom = Math.min(MAX_VISUAL_ZOOM, positiveFinite(viewport.zoom, 1));
  const scale = positiveFinite(fitScale * zoom, 1);
  return Object.freeze({
    scale,
    offsetX: (width - CANVAS_WIDTH * scale) / 2,
    offsetY: (height - CANVAS_HEIGHT * scale) / 2,
  });
}

function projectHitRegion(
  object: CampaignObjectState,
  view: EncounterRenderFrame['view'],
): EncounterHitRegion {
  return Object.freeze({
    id: object.id,
    kind: object.kind,
    left: view.offsetX + object.collisionBounds.left * view.scale,
    right: view.offsetX + object.collisionBounds.right * view.scale,
    top: view.offsetY + object.collisionBounds.top * view.scale,
    bottom: view.offsetY + object.collisionBounds.bottom * view.scale,
  });
}

function formatHealth(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/u, '');
}

function drawObjectBody(
  context: CanvasRenderingContext2D,
  object: CampaignObjectState,
): void {
  const { left, right, top, bottom } = object.collisionBounds;
  const width = right - left;
  const height = bottom - top;
  context.globalAlpha = object.alive ? 1 : 0.48;
  context.lineWidth = 2;

  switch (object.kind) {
    case 'supply-drum':
      context.fillStyle = object.alive ? '#b7422a' : '#413633';
      context.strokeStyle = '#f5c86a';
      context.fillRect(left, top, width, height);
      context.strokeRect(left, top, width, height);
      context.beginPath();
      context.moveTo(left, top + height * 0.28);
      context.lineTo(right, top + height * 0.28);
      context.moveTo(left, bottom - height * 0.28);
      context.lineTo(right, bottom - height * 0.28);
      context.stroke();
      break;
    case 'protected':
      context.fillStyle = object.alive ? '#68757a' : '#343b3e';
      context.strokeStyle = '#d9edf2';
      context.fillRect(left, top + height * 0.22, width, height * 0.78);
      context.strokeRect(left, top + height * 0.22, width, height * 0.78);
      context.beginPath();
      context.moveTo(left, top + height * 0.22);
      context.lineTo(left + width * 0.24, top);
      context.lineTo(right - width * 0.24, top);
      context.lineTo(right, top + height * 0.22);
      context.closePath();
      context.fill();
      context.stroke();
      break;
    case 'cache':
      context.fillStyle = object.alive ? '#746238' : '#3a3528';
      context.strokeStyle = '#f1d684';
      context.fillRect(left, top, width, height);
      context.strokeRect(left, top, width, height);
      context.beginPath();
      context.moveTo(left, top + height * 0.36);
      context.lineTo(right, top + height * 0.36);
      context.stroke();
      break;
    case 'relay':
      context.strokeStyle = object.alive ? '#9be7ff' : '#56666b';
      context.fillStyle = object.alive ? '#294955' : '#313a3d';
      context.fillRect(left + width * 0.36, top + height * 0.28, width * 0.28, height * 0.72);
      context.strokeRect(left + width * 0.36, top + height * 0.28, width * 0.28, height * 0.72);
      context.beginPath();
      context.moveTo(left, bottom);
      context.lineTo(left + width / 2, top);
      context.lineTo(right, bottom);
      context.stroke();
      break;
  }

  if (object.alive && object.maxHealth > 0) {
    const healthRatio = Math.max(0, Math.min(1, object.health / object.maxHealth));
    context.fillStyle = 'rgba(8, 13, 16, 0.82)';
    context.fillRect(left, top - 7, width, 4);
    context.fillStyle = healthRatio > 0.35 ? '#82d98b' : '#ff795f';
    context.fillRect(left, top - 7, width * healthRatio, 4);
    context.fillStyle = '#f5fbff';
    context.font = '10px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.fillText(
      `${formatHealth(object.health)} / ${formatHealth(object.maxHealth)}`,
      left + width / 2,
      top - 9,
    );
  }
  context.globalAlpha = 1;
}

function drawObjectStateMark(
  context: CanvasRenderingContext2D,
  object: CampaignObjectState,
): void {
  const { left, right, top, bottom } = object.collisionBounds;
  const width = right - left;
  const height = bottom - top;
  if (!object.alive) {
    context.globalAlpha = 0.9;
    context.strokeStyle = '#f5c86a';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(left + width * 0.16, top + height * 0.18);
    context.lineTo(right - width * 0.16, bottom - height * 0.12);
    context.moveTo(right - width * 0.16, top + height * 0.18);
    context.lineTo(left + width * 0.16, bottom - height * 0.12);
    context.stroke();
  } else if (object.maxHealth > 0 && object.health / object.maxHealth <= 0.5) {
    context.globalAlpha = 0.92;
    context.strokeStyle = '#1a1210';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(left + width * 0.58, top + height * 0.18);
    context.lineTo(left + width * 0.43, top + height * 0.48);
    context.lineTo(left + width * 0.61, top + height * 0.72);
    context.lineTo(left + width * 0.46, bottom - height * 0.08);
    context.stroke();
  }
  context.globalAlpha = 1;
}

/**
 * Canvas-owned rendering and hit projection for non-seat campaign objects.
 * Engine collision bounds and canonical IDs remain the only geometry source;
 * authored art is optional decoration over a complete code-native silhouette.
 */
export class EncounterObjectRenderer {
  private readonly images = new Map<CampaignObjectState['kind'], HTMLImageElement>();
  private readonly assetStates = new Map<
    CampaignObjectState['kind'], EncounterRenderFrame['assetState']
  >();
  private assetStateValue: EncounterRenderFrame['assetState'] = 'loading';
  private decorationFrame = 0;
  private decorationFramesRemaining: number;
  private destroyed = false;
  private readonly createImage: () => HTMLImageElement;
  private readonly reducedMotion: boolean;
  private readonly onVisualReady: () => void;

  constructor(options: EncounterObjectRendererOptions = {}) {
    this.createImage = options.createImage ?? (() => new Image());
    this.reducedMotion = options.reducedMotion ?? false;
    this.decorationFramesRemaining = this.reducedMotion ? 0 : DECORATIVE_MOTION_FRAMES;
    this.onVisualReady = options.onVisualReady ?? (() => undefined);
    if (!options.deferAssetLoad) {
      for (const kind of Object.keys(OBJECT_ASSET_IDS) as CampaignObjectState['kind'][]) {
        this.beginAssetLoad(kind);
      }
    }
  }

  get isSettled(): boolean {
    return this.assetStateValue !== 'loading';
  }

  hasDecorativeMotion(objects: readonly CampaignObjectState[]): boolean {
    return this.decorationFramesRemaining > 0 && objects.some((object) => object.alive);
  }

  draw(
    context: CanvasRenderingContext2D,
    objects: readonly CampaignObjectState[],
    viewport: EncounterViewport,
    elapsedMs?: number,
  ): EncounterRenderFrame {
    if (
      objects.length > 0
      && !this.destroyed
    ) {
      for (const object of objects) {
        if (object.alive) this.beginAssetLoad(object.kind);
      }
    }
    const view = projectView(viewport);
    const objectIds = Object.freeze(objects.map((object) => object.id));
    const hitRegions = Object.freeze(objects
      .filter((object) => object.alive)
      .map((object) => projectHitRegion(object, view)));
    const animationPending = this.hasDecorativeMotion(objects);
    const animationTime = elapsedMs ?? this.decorationFrame * 16;
    this.decorationFrame += 1;
    if (animationPending) this.decorationFramesRemaining -= 1;

    context.save();
    context.translate(view.offsetX, view.offsetY);
    context.scale(view.scale, view.scale);
    for (const object of objects) {
      drawObjectBody(context, object);
      const image = this.images.get(object.kind);
      if (this.assetStates.get(object.kind) === 'ready' && image && object.alive) {
        const { left, right, top, bottom } = object.collisionBounds;
        context.drawImage(image, left, top, right - left, bottom - top);
      }
      drawObjectStateMark(context, object);
      if (animationPending && object.alive) {
        const pulse = 0.18 + 0.08 * Math.sin(animationTime / 240 + object.x * 0.01);
        const { left, right, top, bottom } = object.collisionBounds;
        context.globalAlpha = pulse;
        context.strokeStyle = '#dff7ff';
        context.lineWidth = 1.5 / positiveFinite(viewport.devicePixelRatio, 1);
        context.strokeRect(left - 2, top - 2, right - left + 4, bottom - top + 4);
        context.globalAlpha = 1;
      }
    }
    context.restore();

    return Object.freeze({
      objectIds,
      hitRegions,
      assetState: this.assetStateValue,
      animationPending,
      view,
    });
  }

  /** Cancel the old generation and lazily reacquire decoration if reused. */
  reset(): void {
    this.releaseImage();
    this.assetStateValue = 'loading';
    this.decorationFrame = 0;
    this.decorationFramesRemaining = this.reducedMotion ? 0 : DECORATIVE_MOTION_FRAMES;
    this.destroyed = false;
  }

  destroy(): void {
    this.releaseImage();
    this.assetStateValue = 'failed';
    this.destroyed = true;
  }

  private beginAssetLoad(kind: CampaignObjectState['kind']): void {
    if (this.destroyed || this.assetStates.has(kind)) return;
    let image: HTMLImageElement;
    try {
      image = this.createImage();
    } catch {
      this.assetStates.set(kind, 'failed');
      this.refreshAssetState();
      return;
    }
    this.images.set(kind, image);
    this.assetStates.set(kind, 'loading');
    this.refreshAssetState();
    image.onload = () => {
      if (this.images.get(kind) !== image || this.destroyed) return;
      this.assetStates.set(kind, 'ready');
      this.refreshAssetState();
      this.onVisualReady();
    };
    image.onerror = () => {
      if (this.images.get(kind) !== image || this.destroyed) return;
      this.assetStates.set(kind, 'failed');
      this.refreshAssetState();
      this.onVisualReady();
    };
    image.src = `${import.meta.env.BASE_URL}${ashRoadAsset(OBJECT_ASSET_IDS[kind]).path}`;
  }

  private refreshAssetState(): void {
    const states = [...this.assetStates.values()];
    this.assetStateValue = states.some((state) => state === 'loading')
      ? 'loading'
      : states.some((state) => state === 'ready') ? 'ready' : 'failed';
  }

  private releaseImage(): void {
    for (const image of this.images.values()) {
      image.onload = null;
      image.onerror = null;
    }
    this.images.clear();
    this.assetStates.clear();
  }
}
