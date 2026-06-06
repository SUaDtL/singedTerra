import type { GameState } from '@shared/types/GameState';

/**
 * HUD is an HTML/CSS overlay (SPEC §8), NOT canvas-drawn. MVP0 keeps it minimal:
 * a small angle + power readout for the active tank, written into the #hud DOM
 * container layered over the canvas. Health bars / wind / weapon arrive in MVP1.
 */
export class HUD {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** Update the overlay to reflect the latest game state. */
  update(state: GameState): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!tank) {
      this.root.textContent = '';
      return;
    }
    // Minimal, text-only readout in the DOM (never on the canvas).
    this.root.textContent =
      `Angle: ${Math.round(tank.angle)}°   ` +
      `Power: ${Math.round(tank.power)}`;
  }
}
