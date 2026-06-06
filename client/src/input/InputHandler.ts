import type { PlayerAction } from '@shared/types/PlayerAction';

/**
 * InputHandler translates keyboard/mouse events into PlayerActions.
 * Per SPEC §8: ← → adjust angle, ↑ ↓ adjust power, space fires, a key
 * cycles weapons. Actions are forwarded to the supplied emit callback,
 * which the caller wires to a GameClient.sendAction.
 */
export class InputHandler {
  private readonly target: HTMLElement;
  private readonly emit: (action: PlayerAction) => void;

  constructor(target: HTMLElement, emit: (action: PlayerAction) => void) {
    this.target = target;
    this.emit = emit;
  }

  /** Attach DOM event listeners. */
  attach(): void {
    throw new Error('InputHandler.attach not implemented');
  }

  /** Remove DOM event listeners. */
  detach(): void {
    throw new Error('InputHandler.detach not implemented');
  }

  private handleKeyDown = (_event: KeyboardEvent): void => {
    throw new Error('InputHandler.handleKeyDown not implemented');
  };

  private handleMouse = (_event: MouseEvent): void => {
    throw new Error('InputHandler.handleMouse not implemented');
  };
}
