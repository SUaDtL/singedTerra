import type { WallImpactEvent } from '@shared/types/GameState';
import type { WallMode } from '@shared/types/GameOptions';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';

export interface WallContactVisual extends WallImpactEvent {
  age: number;
}

export interface WallContactBatch {
  lastSeenId: number;
  contacts: WallImpactEvent[];
  audio: WallImpactEvent | null;
}

/** Admit only unseen monotonic contacts and coalesce their audio to the latest. */
export function consumeWallContacts(
  events: readonly Readonly<WallImpactEvent>[],
  lastSeenId: number,
): WallContactBatch {
  const contacts = events
    .filter((event) => (
      Number.isFinite(event.id)
      && event.id > lastSeenId
      && Number.isFinite(event.x)
      && Number.isFinite(event.y)
      && (event.side === 'left' || event.side === 'right')
    ))
    .map((event) => ({ ...event }));
  let nextId = lastSeenId;
  for (const contact of contacts) nextId = Math.max(nextId, contact.id);
  return {
    lastSeenId: nextId,
    contacts,
    audio: contacts.at(-1) ?? null,
  };
}

/** Static rule rails plus short event-driven contact accents. */
export function drawSidewalls(
  ctx: CanvasRenderingContext2D,
  walls: WallMode,
  contacts: readonly Readonly<WallContactVisual>[],
  reduceMotion = false,
): void {
  if (walls === 'open') return;

  const isWrap = walls === 'wrap';
  const isConcrete = walls === 'concrete';

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = isWrap
    ? 'rgba(199, 112, 255, 0.92)'
    : isConcrete
      ? 'rgba(255, 190, 74, 0.96)'
      : 'rgba(104, 226, 255, 0.92)';
  ctx.shadowColor = isWrap
    ? 'rgba(173, 73, 255, 0.82)'
    : isConcrete
      ? 'rgba(255, 166, 36, 0.84)'
      : 'rgba(73, 197, 255, 0.78)';
  ctx.shadowBlur = 9;
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 7]);
  for (const x of [3, CANVAS_WIDTH - 3]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (!reduceMotion) {
    ctx.fillStyle = isWrap
      ? 'rgba(245, 218, 255, 0.96)'
      : isConcrete
        ? 'rgba(255, 236, 176, 0.98)'
        : 'rgba(225, 251, 255, 0.96)';
    for (const contact of contacts) {
      const life = 18;
      if (contact.age < 0 || contact.age >= life) continue;
      ctx.globalAlpha = (1 - contact.age / life) ** 2;
      const halfHeight = 9 + contact.age * 1.6;
      const exitX = contact.side === 'left' ? 0 : CANVAS_WIDTH - 7;
      ctx.fillRect(exitX, contact.y - halfHeight, 7, halfHeight * 2);
      if (isWrap) {
        const entryX = contact.side === 'left' ? CANVAS_WIDTH - 7 : 0;
        ctx.fillRect(entryX, contact.y - halfHeight, 7, halfHeight * 2);
      }
    }
  }
  ctx.restore();
}
