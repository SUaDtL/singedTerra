import type { ProjectileState } from '@shared/types/GameState';
import { BOOM } from '../ui/theme';

/** White-hot core radius (px). */
const CORE_RADIUS = 3;
/** Soft ember glow halo radius (px). */
const GLOW_RADIUS = 9;
/** Length of the comet trail drawn behind the shell, opposite velocity (px). */
const TRAIL_LENGTH = 24;

/**
 * ProjectileRenderer draws every in-flight projectile during the FIRING phase
 * (SPEC §7 layer 4): a glowing shell (ember halo + white-hot core) with a tapered
 * comet trail along its velocity. No-op when no projectiles are in flight.
 *
 * The trail is velocity-aligned (not position history) so it behaves identically
 * in hot-seat and networked replay — no per-frame state to keep, nothing that
 * could differ between clients. Multiple projectiles can be live at once (airburst
 * / funky submunitions fan down together), so this draws the whole array.
 */
export class ProjectileRenderer {
  draw(ctx: CanvasRenderingContext2D, projectiles: ProjectileState[]): void {
    for (const p of projectiles) {
      this.drawOne(ctx, p);
    }
  }

  /** Draw a single projectile: comet trail + ember glow + white-hot core. */
  private drawOne(ctx: CanvasRenderingContext2D, projectile: ProjectileState): void {
    const { x, y, vx, vy } = projectile;
    const speed = Math.hypot(vx, vy);

    ctx.save();
    // Comet trail: gradient fading from transparent ember (tail) to gold (shell).
    if (speed > 0) {
      const ux = vx / speed;
      const uy = vy / speed;
      const tailX = x - ux * TRAIL_LENGTH;
      const tailY = y - uy * TRAIL_LENGTH;
      const grad = ctx.createLinearGradient(tailX, tailY, x, y);
      grad.addColorStop(0, 'rgba(255, 122, 31, 0)');
      grad.addColorStop(0.7, 'rgba(255, 122, 31, 0.45)');
      grad.addColorStop(1, 'rgba(255, 210, 63, 0.9)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    // Ember glow halo.
    const halo = ctx.createRadialGradient(x, y, 0, x, y, GLOW_RADIUS);
    halo.addColorStop(0, 'rgba(255, 210, 63, 0.75)');
    halo.addColorStop(1, 'rgba(255, 122, 31, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, GLOW_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // White-hot core.
    ctx.fillStyle = BOOM.core;
    ctx.beginPath();
    ctx.arc(x, y, CORE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
