import type { TankState } from '@shared/types/GameState';

/**
 * TankRenderer draws a single tank: geometric rect body, trapezoid tread,
 * and a rotatable barrel line (SPEC §7). Colored per-player.
 */
export class TankRenderer {
  draw(_ctx: CanvasRenderingContext2D, _tank: TankState): void {
    throw new Error('TankRenderer.draw not implemented');
  }
}
