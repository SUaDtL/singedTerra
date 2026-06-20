import type { TankState } from '@shared/types/GameState';
import { TANK, ACCENT, lightenHex, darkenHex } from '../ui/theme';
import { damageTier } from './tankFx';

/** Tank body dimensions (logical canvas px). */
const BODY_WIDTH = 24;
const BODY_HEIGHT = 10;
/** Top highlight band height (lighter shade of the body colour). */
const HIGHLIGHT_HEIGHT = 3;
/** Trapezoid tread sits under the body. */
const TREAD_HEIGHT = 6;
const TREAD_OVERHANG = 4;
/** Barrel pivots at the top-center of the body. */
const BARREL_LENGTH = 22;
const BARREL_WIDTH = 4;

/**
 * TankRenderer draws a single tank: geometric rect body, trapezoid tread,
 * and a rotatable barrel line (SPEC §7). Colored per-player.
 *
 * Coordinate convention: tank.y is the surface y (canvas y grows downward);
 * the tank's base (bottom of the tread) sits at tank.y, body stacks upward.
 * Angle is degrees with 0 = right, 90 = up; the barrel unit vector is
 * (cos θ, -sin θ) (−sin because screen up is −y).
 */
export class TankRenderer {
  draw(ctx: CanvasRenderingContext2D, tank: TankState, active = false): void {
    const { x, y, color, angle } = tank;

    // Vertical layout (y grows downward; base sits on the surface at y).
    const treadBottom = y;
    const treadTop = treadBottom - TREAD_HEIGHT;
    const bodyBottom = treadTop;
    const bodyTop = bodyBottom - BODY_HEIGHT;

    // --- Active-player emphasis: a soft gold ground-glow UNDER the tank. ---
    if (active) {
      const glow = ctx.createRadialGradient(x, treadBottom, 0, x, treadBottom, 28);
      glow.addColorStop(0, 'rgba(255, 210, 63, 0.38)');
      glow.addColorStop(1, 'rgba(255, 210, 63, 0)');
      ctx.save();
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, treadBottom, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Tread: trapezoid wider at the bottom for a tank-like stance. ---
    ctx.beginPath();
    ctx.moveTo(x - BODY_WIDTH / 2 - TREAD_OVERHANG, treadBottom);
    ctx.lineTo(x + BODY_WIDTH / 2 + TREAD_OVERHANG, treadBottom);
    ctx.lineTo(x + BODY_WIDTH / 2, treadTop);
    ctx.lineTo(x - BODY_WIDTH / 2, treadTop);
    ctx.closePath();
    ctx.fillStyle = TANK.tread;
    ctx.fill();

    // --- Body: base colour, a darker grounding line at the bottom, and a
    // lighter highlight band across the top (the banner's lit-edge look). ---
    const left = x - BODY_WIDTH / 2;
    ctx.fillStyle = darkenHex(color, 0.28);
    ctx.fillRect(left, bodyTop, BODY_WIDTH, BODY_HEIGHT);
    ctx.fillStyle = color;
    ctx.fillRect(left, bodyTop, BODY_WIDTH, BODY_HEIGHT - 2);
    ctx.fillStyle = lightenHex(color, 0.4);
    ctx.fillRect(left, bodyTop, BODY_WIDTH, HIGHLIGHT_HEIGHT);

    // --- Barrel: rotatable line from the body's top-center along the aim
    // vector (cos θ, -sin θ), in a lightened shade so it reads off the body. ---
    const rad = (angle * Math.PI) / 180;
    const pivotX = x;
    const pivotY = bodyTop;
    const tipX = pivotX + Math.cos(rad) * BARREL_LENGTH;
    const tipY = pivotY - Math.sin(rad) * BARREL_LENGTH;

    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(tipX, tipY);
    ctx.lineWidth = BARREL_WIDTH;
    ctx.lineCap = 'round';
    ctx.strokeStyle = lightenHex(color, 0.45);
    ctx.stroke();
    // Reset to avoid leaking line state to subsequent draws.
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';

    // --- Damage-state scorch overlay (render-only; keyed on authoritative health). ---
    // When the tank is alive and below the damage threshold, overlay the body with
    // a dark semi-transparent wash and a few char marks to read as "battle damage".
    if (tank.alive && damageTier(tank.health) === 'damaged') {
      ctx.save();
      // Proportional darkness: deeper scorch as health approaches zero.
      // health 33 → alpha 0.15;  health 1 → alpha 0.50.
      const scorchStrength = 1 - (tank.health / 33);
      const bodyAlpha = 0.15 + scorchStrength * 0.35;
      ctx.globalAlpha = bodyAlpha;
      ctx.fillStyle = '#1a0d00';
      ctx.fillRect(left, bodyTop, BODY_WIDTH, BODY_HEIGHT);

      // Diagonal char mark — two short dark scratches across the body.
      ctx.globalAlpha = bodyAlpha * 0.9;
      ctx.strokeStyle = '#0d0600';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(left + 4, bodyTop + 2);
      ctx.lineTo(left + 10, bodyTop + BODY_HEIGHT - 2);
      ctx.moveTo(left + BODY_WIDTH - 4, bodyTop + 2);
      ctx.lineTo(left + BODY_WIDTH - 10, bodyTop + BODY_HEIGHT - 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      ctx.restore();
    }

    // --- Active-player chevron above the body (gold). ---
    if (active) {
      const cy = bodyTop - 13;
      ctx.fillStyle = ACCENT.gold;
      ctx.beginPath();
      ctx.moveTo(x - 5, cy);
      ctx.lineTo(x + 5, cy);
      ctx.lineTo(x, cy + 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Convenience: draw every tank in turn, emphasising the active one. */
  drawAll(
    ctx: CanvasRenderingContext2D,
    tanks: TankState[],
    activeId?: string,
  ): void {
    for (const tank of tanks) {
      this.draw(ctx, tank, tank.id === activeId);
    }
  }

  /**
   * Surface beacon over a BURIED tank (#15). The tank body itself is painted UNDER the
   * terrain (the renderer draws buried tanks before the terrain layer, so the risen dirt
   * covers them — they read as submerged). This marker sits ON TOP of the dirt so the
   * player can still see a trapped tank's position + owner and knows to dig it out.
   * `surfaceY` is the dirt top at the tank's column.
   */
  drawBuriedMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    surfaceY: number,
    color: string,
  ): void {
    ctx.save();
    // A small colored dome poking out of the dirt, dark-outlined for contrast.
    ctx.beginPath();
    ctx.arc(x, surfaceY, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = darkenHex(color, 0.45);
    ctx.stroke();
    // An up-chevron above it — a "dig me out" cue in the player's lit color.
    ctx.beginPath();
    ctx.moveTo(x - 4, surfaceY - 8);
    ctx.lineTo(x + 4, surfaceY - 8);
    ctx.lineTo(x, surfaceY - 14);
    ctx.closePath();
    ctx.fillStyle = lightenHex(color, 0.5);
    ctx.fill();
    ctx.restore();
  }
}
