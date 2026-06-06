import type { PlayerAction } from '@shared/types/PlayerAction';

/** Optional seed for the handler's tracked aim state. */
export interface InputHandlerOptions {
  /** Initial angle (degrees) the active tank starts at. Default 45. */
  initialAngle?: number;
  /** Initial power (0–100) the active tank starts at. Default 50. */
  initialPower?: number;
  /** Degrees changed per ArrowLeft/ArrowRight event. Default 2. */
  angleStep?: number;
  /** Power units changed per ArrowUp/ArrowDown event. Default 2. */
  powerStep?: number;
}

/**
 * Aim limits, mirrored from GameEngine's clamps (SPEC §6: angle 0=right..180=left,
 * power 0–100). The engine re-clamps authoritatively; we clamp our locally-tracked
 * value so held-key repeat does not drift past the bounds and emit redundant actions.
 */
const ANGLE_MIN = 0;
const ANGLE_MAX = 180;
const POWER_MIN = 0;
const POWER_MAX = 100;

const DEFAULT_ANGLE = 45;
const DEFAULT_POWER = 50;
const DEFAULT_ANGLE_STEP = 2;
const DEFAULT_POWER_STEP = 2;

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * InputHandler translates keyboard events into PlayerActions (SPEC §8):
 *   ← / →  adjust angle, ↑ / ↓ adjust power, Space / Enter fire.
 *
 * CONTRACT NOTE FOR INTEGRATOR — set_angle / set_power carry ABSOLUTE values
 * (see shared/src/types/PlayerAction.ts). This handler therefore owns the
 * authoritative-from-the-input-side aim state: it keeps a running `angle` and
 * `power`, mutates them per key event, clamps to the engine's bounds, and emits
 * the resulting ABSOLUTE value. Seed it via InputHandlerOptions.initialAngle /
 * initialPower so it matches whatever the active tank starts at (engine default
 * is 45 / 50). Held arrow keys auto-repeat via the browser's native keydown
 * repeat, so holding a key steps continuously. preventDefault is called on the
 * arrows and Space/Enter so the page does not scroll or activate focused UI.
 *
 * Actions are forwarded to the supplied emit callback, which the caller (main.ts)
 * wires to client.sendAction.
 */
export class InputHandler {
  private readonly target: HTMLElement;
  private readonly emit: (action: PlayerAction) => void;

  private readonly angleStep: number;
  private readonly powerStep: number;

  /** Locally-tracked absolute aim state (the engine re-clamps on apply). */
  private angle: number;
  private power: number;

  private attached = false;

  constructor(
    target: HTMLElement,
    emit: (action: PlayerAction) => void,
    options: InputHandlerOptions = {},
  ) {
    this.target = target;
    this.emit = emit;
    this.angle = clamp(options.initialAngle ?? DEFAULT_ANGLE, ANGLE_MIN, ANGLE_MAX);
    this.power = clamp(options.initialPower ?? DEFAULT_POWER, POWER_MIN, POWER_MAX);
    this.angleStep = options.angleStep ?? DEFAULT_ANGLE_STEP;
    this.powerStep = options.powerStep ?? DEFAULT_POWER_STEP;
  }

  /**
   * Reset the locally-tracked aim to a known state (e.g. on turn change, so the
   * next player's arrows start from their tank's current angle/power). Does not
   * emit — purely re-seeds the handler's mirror.
   */
  setAim(angle: number, power: number): void {
    this.angle = clamp(angle, ANGLE_MIN, ANGLE_MAX);
    this.power = clamp(power, POWER_MIN, POWER_MAX);
  }

  /** Attach DOM event listeners. Idempotent. */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    // Keyboard is captured at the window level so the canvas does not need focus.
    window.addEventListener('keydown', this.handleKeyDown);
    this.target.addEventListener('mousedown', this.handleMouse);
  }

  /** Remove DOM event listeners. Idempotent. */
  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('mousedown', this.handleMouse);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.adjustAngle(-this.angleStep);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.adjustAngle(this.angleStep);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.adjustPower(this.powerStep);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.adjustPower(-this.powerStep);
        break;
      case ' ':
      case 'Spacebar': // legacy key name
      case 'Enter':
        event.preventDefault();
        this.emit({ type: 'fire' });
        break;
      default:
        break;
    }
  };

  private adjustAngle(delta: number): void {
    const next = clamp(this.angle + delta, ANGLE_MIN, ANGLE_MAX);
    if (next === this.angle) return; // already at bound — skip redundant emit
    this.angle = next;
    this.emit({ type: 'set_angle', angle: this.angle });
  }

  private adjustPower(delta: number): void {
    const next = clamp(this.power + delta, POWER_MIN, POWER_MAX);
    if (next === this.power) return; // already at bound — skip redundant emit
    this.power = next;
    this.emit({ type: 'set_power', power: this.power });
  }

  // Mouse is unused in MVP0 (aim is keyboard-only); reserved for future drag-aim.
  private handleMouse = (_event: MouseEvent): void => {
    /* no-op in MVP0 */
  };
}
