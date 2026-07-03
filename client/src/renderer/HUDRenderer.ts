import type { GameState } from '@shared/types/GameState';

/**
 * HUDRenderer is intentionally a no-op canvas stub: per SPEC §8 the HUD is
 * HTML/CSS overlaid on the canvas (see ui/HUD.ts), not drawn into it. This
 * class exists for the draw-order slot only (SPEC §7 layer 6).
 */
export class HUDRenderer {
  draw(_ctx: CanvasRenderingContext2D, _state: GameState): void {
    // No-op: HUD is rendered as a DOM overlay, not on the canvas.
  }
}
