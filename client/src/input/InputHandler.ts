import type { PlayerAction } from '@shared/types/PlayerAction';
import { WEAPONS } from '@shared/engine/WeaponSystem';
import type { WeaponType } from '@shared/engine/WeaponSystem';
import { clamp } from '@shared/engine/math';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';
import { MAX_MOVE_DELTA, isValidMoveDelta } from '@shared/engine/Movement';

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
  /** Live game-state gate for direct canvas aim. Defaults to enabled. */
  canDirectAim?: () => boolean;
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

/**
 * The implemented weapon roster, in stable WeaponSystem key order. Q cycles
 * forward through ONLY these (SPEC §4.5: MVP1 ships Baby Missile + Missile); the
 * stubbed weapons are skipped. The first entry (baby_missile) is the engine's
 * default selected weapon, so our locally-tracked index starts there.
 */
const IMPLEMENTED_WEAPONS: WeaponType[] = (Object.keys(WEAPONS) as WeaponType[])
  .filter((type) => WEAPONS[type].implemented);

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
  private readonly emit: (action: PlayerAction) => void;

  private readonly angleStep: number;
  private readonly powerStep: number;
  private readonly canDirectAim: () => boolean;

  /** Locally-tracked absolute aim state (the engine re-clamps on apply). */
  private angle: number;
  private power: number;

  /**
   * Index into IMPLEMENTED_WEAPONS for the locally-tracked selected weapon. Starts
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
    emit: (action: PlayerAction) => void,
    options: InputHandlerOptions = {},
  ) {
    this.target = target;
    this.emit = emit;
    this.angle = clamp(options.initialAngle ?? DEFAULT_ANGLE, ANGLE_MIN, ANGLE_MAX);
    this.power = clamp(options.initialPower ?? DEFAULT_POWER, POWER_MIN, POWER_MAX);
    this.angleStep = options.angleStep ?? DEFAULT_ANGLE_STEP;
    this.powerStep = options.powerStep ?? DEFAULT_POWER_STEP;
    this.canDirectAim = options.canDirectAim ?? (() => true);
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
   * purely re-seeds the mirror. A weapon outside the implemented roster (should
   * not happen for a live tank) leaves the cursor unchanged.
   */
  setWeapon(weapon: WeaponType): void {
    const idx = IMPLEMENTED_WEAPONS.indexOf(weapon);
    if (idx >= 0) this.weaponIndex = idx;
  }

  // ----- Touch-control entry points (called by on-screen stepper buttons) -----
  // These are thin public wrappers over the private mutators so the HUD's touch
  // strip can drive the same aim-state machine as keyboard events. The caller
  // (main.ts) is responsible for gating them when an AI holds the turn.

  /** Adjust aim angle by `delta` degrees (positive = more left / higher angle). */
  stepAngle(delta: number): void { this.adjustAngle(delta); }

  /** Adjust power by `delta` units (positive = more power). */
  stepPower(delta: number): void { this.adjustPower(delta); }

  /** Emit one bounded, discrete tank movement commitment. */
  stepMove(delta: number): void {
    if (isValidMoveDelta(delta)) this.emit({ type: 'move', delta });
  }

  /** Advance weapon selection forward one slot (wrapping). */
  nextWeapon(): void { this.cycleWeapon(); }

  /** Emit a fire or use_shield action for the currently selected weapon. */
  triggerFire(): void {
    this.emit(
      IMPLEMENTED_WEAPONS[this.weaponIndex] === 'shield'
        ? { type: 'use_shield' }
        : { type: 'fire' },
    );
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
      'button.st-hud__primary-action, button[data-command-action="fire-space"], button[data-command-action="fire-enter"]',
    );

    // Non-text controls retain focus after a click. Keep Space global for
    // those controls, but let text entry and the dedicated Fire button retain
    // native behavior so the latter cannot emit a duplicate action.
    if (nativeControl && (!isSpaceKey || isTextEntry || isDedicatedFireControl)) {
      return;
    }
    if (isSpaceKey) {
      event.preventDefault();
      this.emit(
        IMPLEMENTED_WEAPONS[this.weaponIndex] === 'shield'
          ? { type: 'use_shield' }
          : { type: 'fire' },
      );
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
        if (!event.repeat) this.stepMove(-MAX_MOVE_DELTA);
        break;
      case 'd':
      case 'D':
        event.preventDefault();
        if (!event.repeat) this.stepMove(MAX_MOVE_DELTA);
        break;
      case 'Enter':
        event.preventDefault();
        // The shield is a defensive "weapon": firing it RAISES the field and ends
        // the turn (use_shield) rather than launching a projectile.
        this.emit(
          IMPLEMENTED_WEAPONS[this.weaponIndex] === 'shield'
            ? { type: 'use_shield' }
            : { type: 'fire' },
        );
        break;
      case 'q':
      case 'Q':
        event.preventDefault();
        this.cycleWeapon();
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

  /**
   * Advance to the next implemented weapon (wrapping) and emit its ABSOLUTE type
   * via select_weapon. We track the index locally so successive presses step
   * deterministically through IMPLEMENTED_WEAPONS regardless of engine echo.
   */
  private cycleWeapon(): void {
    if (IMPLEMENTED_WEAPONS.length === 0) return; // defensive — roster is never empty
    this.weaponIndex = (this.weaponIndex + 1) % IMPLEMENTED_WEAPONS.length;
    const weapon = IMPLEMENTED_WEAPONS[this.weaponIndex];
    if (weapon === undefined) return;
    this.emit({ type: 'select_weapon', weapon });
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
    this.applyPointerAim(event);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    if (!this.directAimEnabled || !this.canDirectAim()) {
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
   * down, hence -dy); power = drag distance / FULL_POWER_DRAG_PX.
   */
  private applyPointerAim(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    const rect = this.target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const mx = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const my = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    const dx = mx - this.activeTankX;
    const dy = my - this.activeTankY;
    let deg = (Math.atan2(-dy, dx) * 180) / Math.PI; // upper hemisphere => 0..180
    if (deg < 0) deg = 0; // clamp a below-horizontal drag up to flat
    const power = (Math.hypot(dx, dy) / FULL_POWER_DRAG_PX) * POWER_MAX;
    this.setAngleAbsolute(deg);
    this.setPowerAbsolute(power);
  }

  /** Set angle to an ABSOLUTE value (clamped), emitting only on a real change. */
  private setAngleAbsolute(angle: number): void {
    const next = clamp(Math.round(angle), ANGLE_MIN, ANGLE_MAX);
    if (next === this.angle) return;
    this.angle = next;
    this.emit({ type: 'set_angle', angle: this.angle });
  }

  /** Set power to an ABSOLUTE value (clamped), emitting only on a real change. */
  private setPowerAbsolute(power: number): void {
    const next = clamp(Math.round(power), POWER_MIN, POWER_MAX);
    if (next === this.power) return;
    this.power = next;
    this.emit({ type: 'set_power', power: this.power });
  }
}
