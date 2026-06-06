import type { GameState } from '@shared/types/GameState';

/**
 * HUD is an HTML/CSS overlay (SPEC §8), not canvas-drawn. It renders player
 * name + health bars, wind indicator, active weapon, angle, power, and the
 * fire button into a DOM container layered over the canvas.
 */
export class HUD {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** Update the overlay to reflect the latest game state. */
  update(_state: GameState): void {
    throw new Error('HUD.update not implemented');
  }
}
