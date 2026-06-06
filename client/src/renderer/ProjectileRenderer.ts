import type { ProjectileState } from '@shared/types/GameState';

/** Visual radius of the projectile dot (px). */
const PROJECTILE_RADIUS = 3;
/** Length of the short motion trail drawn behind the projectile (px). */
const TRAIL_LENGTH = 12;

/**
 * ProjectileRenderer draws the in-flight projectile during the FIRING phase
 * (SPEC §7 layer 4): a small filled dot with a short motion trail pointing
 * back along its velocity. No-op when there is no projectile in flight.
 *
 * The explosion burst is client-only visual state animated elsewhere; this
 * renderer only draws the authoritative projectile from GameState.
 */
export class ProjectileRenderer {
  draw(ctx: CanvasRenderingContext2D, projectile: ProjectileState | null): void {
    if (projectile === null) return;

    const { x, y, vx, vy } = projectile;

    // Short trail pointing opposite the velocity vector. Skip when stationary.
    const speed = Math.hypot(vx, vy);
    if (speed > 0) {
      const tailX = x - (vx / speed) * TRAIL_LENGTH;
      const tailY = y - (vy / speed) * TRAIL_LENGTH;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 200, 120, 0.6)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }

    // Projectile dot.
    ctx.save();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(x, y, PROJECTILE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
