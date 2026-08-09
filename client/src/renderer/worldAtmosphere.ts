import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import type {
  BattlefieldWorld,
  WorldAtmosphereProfile,
} from './BattlefieldBackdrop';

export const WORLD_ATMOSPHERE_MAX_MARKS = 28;
export const WORLD_ATMOSPHERE_ARRIVAL_FRAMES = 72;

export interface WorldAtmosphereMark {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly speed: number;
  readonly drift: number;
  readonly phase: number;
}

function hashUnit(worldId: string, index: number, channel: number): number {
  let hash = 2_166_136_261;
  for (let offset = 0; offset < worldId.length; offset++) {
    hash = Math.imul(hash ^ worldId.charCodeAt(offset), 16_777_619);
  }
  hash = Math.imul(hash ^ index, 16_777_619);
  hash = Math.imul(hash ^ channel, 16_777_619);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function rangeValue(
  worldId: string,
  index: number,
  channel: number,
  range: readonly [number, number],
): number {
  return range[0] + (range[1] - range[0]) * hashUnit(worldId, index, channel);
}

function wrapCoordinate(value: number, limit: number): number {
  return ((value % limit) + limit) % limit;
}

/**
 * Derives immutable, presentation-only marks from a selected world. The result
 * stays bounded independently of future catalog data.
 */
export function createWorldAtmosphereField(
  worldId: string,
  profile: WorldAtmosphereProfile,
): readonly WorldAtmosphereMark[] {
  const requested = Number.isFinite(profile.count) ? Math.floor(profile.count) : 0;
  const count = Math.max(0, Math.min(WORLD_ATMOSPHERE_MAX_MARKS, requested));
  const marks: WorldAtmosphereMark[] = [];

  for (let index = 0; index < count; index++) {
    marks.push(Object.freeze({
      x: hashUnit(worldId, index, 0) * CANVAS_WIDTH,
      y: hashUnit(worldId, index, 1) * CANVAS_HEIGHT,
      size: rangeValue(worldId, index, 2, profile.size),
      speed: rangeValue(worldId, index, 3, profile.speed),
      drift: rangeValue(worldId, index, 4, profile.drift),
      phase: hashUnit(worldId, index, 5) * Math.PI * 2,
    }));
  }

  return Object.freeze(marks);
}

const EMPTY_FIELD: readonly WorldAtmosphereMark[] = Object.freeze([]);

/** Owns one selected world's presentation-only atmosphere for a match. */
export class WorldAtmosphereLayer {
  private selectedId: BattlefieldWorld['id'] | null = null;
  private profile: WorldAtmosphereProfile | null = null;
  private field: readonly WorldAtmosphereMark[] = EMPTY_FIELD;
  private currentFrame = 0;
  private arrivalAge = 0;

  constructor(private readonly reducedMotion: boolean) {}

  get selectedWorldId(): BattlefieldWorld['id'] | null {
    return this.selectedId;
  }

  get marks(): readonly WorldAtmosphereMark[] {
    return this.field;
  }

  get frame(): number {
    return this.currentFrame;
  }

  get isActive(): boolean {
    return !this.reducedMotion
      && this.profile !== null
      && this.arrivalAge < WORLD_ATMOSPHERE_ARRIVAL_FRAMES;
  }

  select(world: BattlefieldWorld): void {
    if (this.selectedId !== null) return;
    this.selectedId = world.id;
    this.profile = world.atmosphere;
    this.field = createWorldAtmosphereField(world.id, world.atmosphere);
    this.currentFrame = 0;
    this.arrivalAge = 0;
  }

  reset(): void {
    this.selectedId = null;
    this.profile = null;
    this.field = EMPTY_FIELD;
    this.currentFrame = 0;
    this.arrivalAge = 0;
  }

  advance(): void {
    if (this.profile === null || this.reducedMotion) return;
    this.currentFrame++;
    this.arrivalAge = Math.min(
      WORLD_ATMOSPHERE_ARRIVAL_FRAMES,
      this.arrivalAge + 1,
    );
  }

  draw(ctx: CanvasRenderingContext2D): boolean {
    const profile = this.profile;
    if (profile === null) return false;

    const frame = this.reducedMotion ? 0 : this.currentFrame;
    ctx.save();
    if (profile.motif === 'embers') {
      ctx.fillStyle = profile.color;
      for (const mark of this.field) {
        const x = wrapCoordinate(mark.x + mark.drift * frame, CANVAS_WIDTH);
        const y = wrapCoordinate(mark.y - mark.speed * frame, CANVAS_HEIGHT);
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.arc(x, y, mark.size * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.68;
        ctx.beginPath();
        ctx.arc(x, y, mark.size, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (profile.motif === 'ash') {
      ctx.fillStyle = profile.color;
      for (const mark of this.field) {
        const x = wrapCoordinate(
          mark.x + Math.sin(mark.phase + frame * 0.015) * mark.drift * 80,
          CANVAS_WIDTH,
        );
        const y = wrapCoordinate(mark.y + mark.speed * frame, CANVAS_HEIGHT);
        const half = mark.size / 2;
        ctx.globalAlpha = 0.34;
        ctx.beginPath();
        ctx.moveTo(x - half, y);
        ctx.lineTo(x, y - half);
        ctx.lineTo(x + half, y);
        ctx.lineTo(x, y + half);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = profile.color;
      ctx.lineWidth = 1;
      for (const mark of this.field) {
        const x = wrapCoordinate(mark.x + mark.speed * frame * 2, CANVAS_WIDTH);
        const y = wrapCoordinate(mark.y + mark.drift * frame * 2, CANVAS_HEIGHT);
        const halfLength = mark.size * 0.42;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - halfLength, y + halfLength * 0.45);
        ctx.lineTo(x + halfLength, y - halfLength * 0.45);
        ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  }
}
