import type { PlayerAction } from '@shared/types/PlayerAction';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import { clamp } from '@shared/engine/math';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';
import { MAX_MOVE_DELTA, isValidMoveDelta } from '@shared/engine/Movement';
import { DEFAULT_POWER_CAP } from '@shared/engine/Tank';
import {
  FULL_GAME_INPUT_CAPABILITIES,
  inputAllowsWeapon,
  inputWeaponRosterFor,
} from '../client/inputCapabilities';
import type { GameInputCapabilities } from '../client/GameClient';

/** Optional seed for the handler's tracked aim state. */
export interface InputHandlerOptions {
  /** Commands and bounds admitted by the active game mode. Defaults to ordinary play. */
  capabilities?: GameInputCapabilities;
  /** Initial angle (degrees) the active tank starts at. Default 45. */
  initialAngle?: number;
  /** Initial power the active tank starts at. Default 50. */
  initialPower?: number;
  /** Active tank power ceiling. Default is the engine's baseline cap. */
  powerCap?: number;
  /** Degrees changed per ArrowLeft/ArrowRight event. Default 2. */
  angleStep?: number;
  /** Power units changed per ArrowUp/ArrowDown event. Default 2. */
  powerStep?: number;
  /** Live game-state gate for direct canvas aim. Defaults to enabled. */
  canDirectAim?: () => boolean;
  /** Live presentation gate for every combat command. Defaults to enabled. */
  canHandleCommand?: () => boolean;
}

/**
 * Aim limits, mirrored from GameEngine's clamps (SPEC §6: angle 0=right..180=left,
 * power 0–the active tank cap). The engine re-clamps authoritatively; we clamp our locally-tracked
 * value so held-key repeat does not drift past the bounds and emit redundant actions.
 */
function isShieldWeapon(type: WeaponType): boolean {
  return type === 'shield' || type === 'heavy_shield';
}

const DEFAULT_ANGLE = 45;
const DEFAULT_POWER = 50;
const DEFAULT_ANGLE_STEP = 2;
const DEFAULT_POWER_STEP = 2;

/** Logical-px drag distance from the tank that maps to full power (100). Tunable. */
const FULL_POWER_DRAG_PX = 280;

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
  private readonly emit: (action: PlayerAction) => boolean | void;

  private readonly angleStep: number;
  private readonly powerStep: number;
  private readonly canDirectAim: () => boolean;
  private readonly canHandleCommand: () => boolean;
  private readonly capabilities: GameInputCapabilities;

  /** Locally-tracked absolute aim state (the engine re-clamps on apply). */
  private angle: number;
  private power: number;
  private powerCap: number;

  /**
   * Index into the active capability roster for the locally-tracked selected weapon. Starts
   * at 0 (baby_missile, the engine default) so Q advances deterministically.
   */
  private weaponIndex = 0;

  private attached = false;

  /** Active tank's LOGICAL (canvas-space) barrel-origin position, fed by main.ts
   *  each frame, so direct pointer aim derives angle/power relative to the tank. */
  private activeTankX = 0;
  private activeTankY = 0;
  private tankPosKnown = false;
  private activeTankOwnerId: string | null = null;
  private directAimEnabled = true;
  /** Pointer that currently owns direct aim, or null when no gesture is active. */
  private activePointerId: number | null = null;

  constructor(
    target: HTMLElement,
    emit: (action: PlayerAction) => boolean | void,
    options: InputHandlerOptions = {},
  ) {
    this.target = target;
    this.emit = emit;
    this.capabilities = options.capabilities ?? FULL_GAME_INPUT_CAPABILITIES;
    this.angle = clamp(
      options.initialAngle ?? DEFAULT_ANGLE,
      this.capabilities.angle.min,
      this.capabilities.angle.max,
    );
    this.powerCap = this.normalizedPowerCap(options.powerCap);
    this.power = clamp(
      options.initialPower ?? DEFAULT_POWER,
      this.capabilities.power.min,
      this.powerCap,
    );
    this.angleStep = options.angleStep ?? DEFAULT_ANGLE_STEP;
    this.powerStep = options.powerStep ?? DEFAULT_POWER_STEP;
    this.canDirectAim = options.canDirectAim ?? (() => true);
    this.canHandleCommand = options.canHandleCommand ?? (() => true);
  }

  /**
   * Reset the locally-tracked aim to a known state (e.g. on turn change, so the
   * next player's arrows start from their tank's current angle/power). Does not
   * emit — purely re-seeds the handler's mirror.
   */
  setAim(angle: number, power: number): void {
    this.angle = clamp(angle, this.capabilities.angle.min, this.capabilities.angle.max);
    this.power = clamp(power, this.capabilities.power.min, this.powerCap);
  }

  /** Refresh the active tank's cap without emitting. Legal selected power is preserved. */
  setPowerCap(powerCap: number): void {
    this.powerCap = this.normalizedPowerCap(powerCap);
    this.power = clamp(this.power, this.capabilities.power.min, this.powerCap);
  }

  /** Feed the active tank's LOGICAL (canvas-space) barrel-origin position so direct
   *  pointer aim can derive angle (direction) + power (distance). Called by
   *  main.ts each frame; purely informational — never emits. */
  setActiveTankScreenPos(x: number, y: number, ownerId?: string): void {
    if (ownerId !== undefined && ownerId !== this.activeTankOwnerId) {
      this.clearActivePointer(true);
      this.activeTankOwnerId = ownerId;
    }
    this.activeTankX = x;
    this.activeTankY = y;
    this.tankPosKnown = true;
  }

  /** Enable direct canvas aim for the current eligible turn; disabling cancels
   *  any held contact before another state or player can inherit it. */
  setDirectAimEnabled(enabled: boolean): void {
    this.directAimEnabled = enabled;
    if (!enabled) this.clearActivePointer(true);
  }

  /**
   * Re-seed the locally-tracked weapon cursor to match a tank's currently
   * selected weapon (e.g. on turn change, so the next Q advances from THIS
   * player's weapon rather than whoever cycled last — the cursor is otherwise
   * shared by the single handler across all hot-seat players). Does not emit —
   * purely re-seeds the mirror. A weapon outside the active mode roster leaves
   * the cursor unchanged.
   */
  setWeapon(weapon: WeaponType): void {
    if (!inputAllowsWeapon(this.capabilities, weapon)) return;
    const idx = inputWeaponRosterFor(this.capabilities).indexOf(weapon);
    if (idx >= 0) this.weaponIndex = idx;
  }

  // ----- Touch-control entry points (called by on-screen stepper buttons) -----
  // These are thin public wrappers over the private mutators so the HUD's touch
  // strip can drive the same aim-state machine as keyboard events. The caller
  // (main.ts) is responsible for gating them when an AI holds the turn.

  /** Adjust aim angle by `delta` degrees (positive = more left / higher angle). */
  stepAngle(delta: number): void {
    if (this.canHandleCommand()) this.adjustAngle(delta);
  }

  /** Adjust power by `delta` units (positive = more power). */
  stepPower(delta: number): void {
    if (this.canHandleCommand()) this.adjustPower(delta);
  }

  /** Emit one bounded, discrete tank movement commitment. */
  stepMove(delta: number): void {
    if (this.canHandleCommand() && this.capabilities.movement && isValidMoveDelta(delta)) {
      this.emit({ type: 'move', delta });
    }
  }

  /** Advance weapon selection forward one slot (wrapping). */
  nextWeapon(): void {
    if (this.canHandleCommand() && this.capabilities.weaponCycling) this.cycleWeapon();
  }

  /** Emit a fire or use_shield action for the currently selected weapon. */
  triggerFire(): void {
    if (!this.canHandleCommand()) return;
    this.emitPrimaryAction();
  }

  /** Attach DOM event listeners. Idempotent. */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    // Keyboard is captured at the window level so the canvas does not need focus.
    // Capture before focused HUD descendants can stop propagation (for example,
    // a composite control handling its own Space key). Target gating below still
    // preserves native text entry and dedicated Fire-button activation.
    window.addEventListener('keydown', this.handleKeyDown, { capture: true });
    this.target.addEventListener('pointerdown', this.handlePointerDown);
    this.target.addEventListener('pointermove', this.handlePointerMove);
    this.target.addEventListener('pointerup', this.handlePointerUp);
    this.target.addEventListener('pointercancel', this.handlePointerCancel);
    this.target.addEventListener('lostpointercapture', this.handleLostPointerCapture);
  }

  /** Remove DOM event listeners. Idempotent. */
  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown, { capture: true });
    this.target.removeEventListener('pointerdown', this.handlePointerDown);
    this.target.removeEventListener('pointermove', this.handlePointerMove);
    this.target.removeEventListener('pointerup', this.handlePointerUp);
    this.target.removeEventListener('pointercancel', this.handlePointerCancel);
    this.target.removeEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.clearActivePointer(true);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const targetElement = event.target instanceof Element ? event.target : null;
    const nativeControl = targetElement?.closest(
      'button, input, select, textarea, a[href], [contenteditable="true"]',
    );
    const isSpaceKey = event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space';
    const isTextEntry = targetElement?.closest('input, textarea, [contenteditable="true"]');
    const isDedicatedFireControl = targetElement?.closest(
      'button[data-battle-console-action="fire"], button[data-command-action="fire-space"], button[data-command-action="fire-enter"]',
    );

    // Non-text controls retain focus after a click. Keep Space global for
    // those controls, but let text entry and the dedicated Fire button retain
    // native behavior so the latter cannot emit a duplicate action.
    if (nativeControl && (!isSpaceKey || isTextEntry || isDedicatedFireControl)) {
      return;
    }
    if (!this.canHandleCommand()) return;
    if (isSpaceKey) {
      event.preventDefault();
      this.emitPrimaryAction();
      return;
    }
    switch (event.key) {
      case 'ArrowLeft':
        // angle 0=right..180=left, so swinging the barrel LEFT INCREASES the angle.
        event.preventDefault();
        this.adjustAngle(this.angleStep);
        break;
      case 'ArrowRight':
        // swinging the barrel RIGHT DECREASES the angle (toward 0=right).
        event.preventDefault();
        this.adjustAngle(-this.angleStep);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.adjustPower(this.powerStep);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.adjustPower(-this.powerStep);
        break;
      case 'a':
      case 'A':
        event.preventDefault();
        if (!event.repeat && this.capabilities.movement) this.stepMove(-MAX_MOVE_DELTA);
        break;
      case 'd':
      case 'D':
        event.preventDefault();
        if (!event.repeat && this.capabilities.movement) this.stepMove(MAX_MOVE_DELTA);
        break;
      case 'Enter':
        event.preventDefault();
        this.emitPrimaryAction();
        break;
      case 'q':
      case 'Q':
        event.preventDefault();
        if (this.capabilities.weaponCycling) this.cycleWeapon();
        break;
      default:
        break;
    }
  };

  private adjustAngle(delta: number): void {
    const next = clamp(
      this.angle + delta,
      this.capabilities.angle.min,
      this.capabilities.angle.max,
    );
    if (next === this.angle) return; // already at bound — skip redundant emit
    this.angle = next;
    this.emit({ type: 'set_angle', angle: this.angle });
  }

  private adjustPower(delta: number): void {
    const next = clamp(this.power + delta, this.capabilities.power.min, this.powerCap);
    if (next === this.power) return; // already at bound — skip redundant emit
    this.power = next;
    this.emit({ type: 'set_power', power: this.power });
  }

  /**
   * Advance to the next admitted weapon (wrapping) and emit its ABSOLUTE type via
   * select_weapon. A definitive rejection leaves the local cursor unchanged.
   */
  private cycleWeapon(): void {
    if (!this.capabilities.weaponCycling) return;
    const roster = inputWeaponRosterFor(this.capabilities);
    if (roster.length === 0) return;
    const nextIndex = (this.weaponIndex + 1) % roster.length;
    const weapon = roster[nextIndex];
    if (weapon === undefined) return;
    if (this.emit({ type: 'select_weapon', weapon }) !== false) this.weaponIndex = nextIndex;
  }

  // ----- Direct pointer aim (mouse, pen, and touch) -------------------------
  // Point from the tank: direction sets angle and distance sets power. The same
  // absolute actions pass through main.ts's local-turn gate. It NEVER fires.

  private handlePointerDown = (event: PointerEvent): void => {
    if (
      this.activePointerId !== null ||
      !this.tankPosKnown ||
      !this.directAimEnabled ||
      !this.canDirectAim() ||
      !this.canHandleCommand() ||
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }
    event.preventDefault();
    this.activePointerId = event.pointerId;
    try {
      this.target.setPointerCapture?.(event.pointerId);
    } catch {
      // Without capture, a target-local tail is not guaranteed. Fail closed so
      // a vanished contact cannot permanently own every later gesture.
      this.activePointerId = null;
      return;
    }
    // Pointer aim is the explicit return to the battlefield after a HUD action.
    // Make the canvas programmatically focusable without adding it to Tab order,
    // then transfer focus so subsequent gameplay keys are not owned by the stale
    // Armory/settings button that restored focus when its dialog closed.
    if (!this.target.hasAttribute('tabindex')) this.target.tabIndex = -1;
    this.target.focus({ preventScroll: true });
    this.applyPointerAim(event);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    if (!this.directAimEnabled || !this.canDirectAim() || !this.canHandleCommand()) {
      this.clearActivePointer(true);
      return;
    }
    event.preventDefault();
    this.applyPointerAim(event);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.clearActivePointer(true);
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.clearActivePointer(true);
  };

  private handleLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.clearActivePointer(false);
  };

  private clearActivePointer(releaseCapture: boolean): void {
    const pointerId = this.activePointerId;
    if (pointerId === null) return;
    this.activePointerId = null;
    if (!releaseCapture) return;
    try {
      if (this.target.hasPointerCapture?.(pointerId)) {
        this.target.releasePointerCapture?.(pointerId);
      }
    } catch {
      // Native lostpointercapture can race explicit cleanup; ownership is clear.
    }
  }

  /**
   * Map the pointer to LOGICAL canvas coords and emit aim from its aim vector.
   * getBoundingClientRect() returns the DISPLAYED (CSS-zoomed) size, so dividing by
   * it maps to [0,1] across the canvas regardless of the #app zoom — then scale up
   * to logical px. Angle = direction from the tank (0=right, 90=up; screen y is
   * down, hence -dy); power = drag distance / FULL_POWER_DRAG_PX. The supported
   * upper-hemisphere arc projects a below-left drag to 180 and a below-right drag
   * to 0. The exact pivot and straight-down tie choose the right boundary (0).
   */
  private applyPointerAim(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    const rect = this.target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const mx = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const my = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    const dx = mx - this.activeTankX;
    const dy = my - this.activeTankY;
    const deg = dy > 0
      ? (dx < 0 ? 180 : 0)
      : Math.abs((Math.atan2(-dy, dx) * 180) / Math.PI);
    const power = (Math.hypot(dx, dy) / FULL_POWER_DRAG_PX) * this.powerCap;
    this.setAngleAbsolute(deg);
    this.setPowerAbsolute(power);
  }

  /** Set angle to an ABSOLUTE value (clamped), emitting only on a real change. */
  private setAngleAbsolute(angle: number): void {
    const next = clamp(
      Math.round(angle),
      this.capabilities.angle.min,
      this.capabilities.angle.max,
    );
    if (next === this.angle) return;
    this.angle = next;
    this.emit({ type: 'set_angle', angle: this.angle });
  }

  /** Set power to an ABSOLUTE value (clamped), emitting only on a real change. */
  private setPowerAbsolute(power: number): void {
    const next = clamp(Math.round(power), this.capabilities.power.min, this.powerCap);
    if (next === this.power) return;
    this.power = next;
    this.emit({ type: 'set_power', power: this.power });
  }

  private normalizedPowerCap(powerCap: number | undefined): number {
    const requested = powerCap === undefined || !Number.isFinite(powerCap)
      ? DEFAULT_POWER_CAP
      : powerCap;
    return Math.min(
      this.capabilities.power.max,
      Math.max(this.capabilities.power.min, requested),
    );
  }

  private emitPrimaryAction(): void {
    if (this.capabilities.primaryAction === 'fire') {
      this.emit({ type: 'fire' });
      return;
    }
    const roster = inputWeaponRosterFor(this.capabilities);
    const selectedWeapon = roster[this.weaponIndex];
    if (selectedWeapon === undefined) return;
    this.emit(
      isShieldWeapon(selectedWeapon)
        ? { type: 'use_shield' }
        : { type: 'fire' },
    );
  }
}
