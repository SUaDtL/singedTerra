import { CANVAS_WIDTH } from '@shared/engine/Terrain';
import type { FireCell } from '@shared/types/GameState';

/** Maximum contiguous burning columns represented by one glow lobe. */
export const FIRELIGHT_CHUNK_COLUMNS = 32;
/** Hard ceiling on radial gradients emitted by the fire pass per frame. */
export const FIRELIGHT_MAX_POOLS = 8;
/** Remaining-life value at which presentation intensity reaches its cap. */
export const FIRELIGHT_FULL_LIFE = 36;

export interface NapalmFirelightPool {
  readonly startX: number;
  readonly endX: number;
  readonly centerX: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly alpha: number;
  readonly intensity: number;
}

interface ValidCell {
  readonly x: number;
  readonly life: number;
}

function poolFor(cells: readonly ValidCell[]): Readonly<NapalmFirelightPool> {
  const startX = cells[0].x;
  const endX = cells[cells.length - 1].x;
  let peakLife = 0;
  for (const cell of cells) peakLife = Math.max(peakLife, cell.life);

  const intensity = Math.min(1, peakLife / FIRELIGHT_FULL_LIFE);
  const columns = endX - startX + 1;
  return Object.freeze({
    startX,
    endX,
    centerX: (startX + endX) / 2,
    radiusX: Math.min(56, 18 + columns * 1.15),
    radiusY: 16 + intensity * 24,
    alpha: 0.03 + intensity * 0.15,
    intensity,
  });
}

/**
 * Convert deterministic fire columns into a small set of bounded light lobes.
 *
 * The helper is presentation-only: it tolerates unsorted/duplicate input,
 * never mutates the engine snapshot, and skips malformed cells independently.
 */
export function getNapalmFirelightPools(
  fire: readonly FireCell[],
): ReadonlyArray<Readonly<NapalmFirelightPool>> {
  if (!Array.isArray(fire) || fire.length === 0) return Object.freeze([]);

  const lifeByX = new Map<number, number>();
  for (const candidate of fire as readonly unknown[]) {
    if (
      candidate === null
      || typeof candidate !== 'object'
      || !('x' in candidate)
      || !('life' in candidate)
    ) continue;
    const { x, life } = candidate as Partial<FireCell>;
    if (
      !Number.isInteger(x)
      || (x as number) < 0
      || (x as number) >= CANVAS_WIDTH
      || !Number.isFinite(life)
      || (life as number) <= 0
    ) continue;
    lifeByX.set(x as number, Math.max(lifeByX.get(x as number) ?? 0, life as number));
  }

  const valid = [...lifeByX]
    .sort(([a], [b]) => a - b)
    .map(([x, life]) => ({ x, life }));
  if (valid.length === 0) return Object.freeze([]);

  const pools: Array<Readonly<NapalmFirelightPool>> = [];
  let chunk: ValidCell[] = [];
  for (const cell of valid) {
    const previous = chunk[chunk.length - 1];
    if (
      chunk.length > 0
      && (cell.x !== previous.x + 1 || chunk.length === FIRELIGHT_CHUNK_COLUMNS)
    ) {
      pools.push(poolFor(chunk));
      chunk = [];
    }
    chunk.push(cell);
  }
  if (chunk.length > 0) pools.push(poolFor(chunk));

  const selected = pools.length <= FIRELIGHT_MAX_POOLS
    ? pools
    : pools
      .slice()
      .sort((a, b) => (
        b.intensity - a.intensity
        || b.radiusX - a.radiusX
        || a.centerX - b.centerX
      ))
      .slice(0, FIRELIGHT_MAX_POOLS)
      .sort((a, b) => a.centerX - b.centerX);
  return Object.freeze(selected.slice());
}
