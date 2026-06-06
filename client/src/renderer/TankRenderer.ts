import type { TankState } from '@shared/types/GameState';

/** Tank body dimensions (logical canvas px). */
const BODY_WIDTH = 24;
const BODY_HEIGHT = 10;
/** Trapezoid tread sits under the body. */
const TREAD_HEIGHT = 6;
const TREAD_OVERHANG = 4;
/** Barrel pivots at the top-center of the body. */
const BARREL_LENGTH = 22;
const BARREL_WIDTH = 3;

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
  draw(ctx: CanvasRenderingContext2D, tank: TankState): void {
    const { x, y, color, angle } = tank;

    // Vertical layout (y grows downward; base sits on the surface at y).
    const treadBottom = y;
    const treadTop = treadBottom - TREAD_HEIGHT;
    const bodyBottom = treadTop;
    const bodyTop = bodyBottom - BODY_HEIGHT;

    // --- Tread: trapezoid wider at the bottom for a tank-like stance. ---
    ctx.beginPath();
    ctx.moveTo(x - BODY_WIDTH / 2 - TREAD_OVERHANG, treadBottom);
    ctx.lineTo(x + BODY_WIDTH / 2 + TREAD_OVERHANG, treadBottom);
    ctx.lineTo(x + BODY_WIDTH / 2, treadTop);
    ctx.lineTo(x - BODY_WIDTH / 2, treadTop);
    ctx.closePath();
    ctx.fillStyle = '#333333';
    ctx.fill();

    // --- Body: rectangle. ---
    ctx.fillStyle = color;
    ctx.fillRect(x - BODY_WIDTH / 2, bodyTop, BODY_WIDTH, BODY_HEIGHT);

    // --- Barrel: rotatable line from the body's top-center along the
    // aim vector (cos θ, -sin θ). Visibly rotates as tank.angle changes. ---
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
    ctx.strokeStyle = color;
    ctx.stroke();
    // Reset to avoid leaking line state to subsequent draws.
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
  }

  /** Convenience: draw every tank in turn. */
  drawAll(ctx: CanvasRenderingContext2D, tanks: TankState[]): void {
    for (const tank of tanks) {
      this.draw(ctx, tank);
    }
  }
}
