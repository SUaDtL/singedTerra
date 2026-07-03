import type { ProjectileState } from '@shared/types/GameState';
import { BOOM } from '../ui/theme';
import { RingBuffer } from './ringBuffer';

/** White-hot core radius (px). */
const CORE_RADIUS = 3;
/** Soft ember glow halo radius (px). */
const GLOW_RADIUS = 9;

/**
 * How many position samples to keep in each slot's history ring buffer.
 * At 60fps this is ~500ms of trail — long enough to trace a visible arc
 * through the apex of a high-angle shot without becoming visual noise.
 */
const TRAIL_HISTORY = 30;

/**
 * Maximum squared distance (px²) between successive positions allowed before
 * a slot is treated as a new/different projectile and its history is reset.
 * An airburst split or a fresh projectile after resolution will jump far more
 * than one physics step, so this threshold cleanly separates continuation from
 * discontinuity. One physics tick at power-100 is roughly 20–25 px; 100² = 10000
 * is safely above that while staying below any airburst teleport.
 */
const DISCONTINUITY_SQ = 100 * 100;

/** Radius of the oldest (most faded) smoke puff (px). */
const SMOKE_RADIUS_MAX = 5;
/** Radius of the newest (freshest) smoke puff, just behind the shell (px). */
const SMOKE_RADIUS_MIN = 1.5;

/**
 * ProjectileRenderer draws every in-flight projectile during the FIRING phase
 * (SPEC §7 layer 4): a glowing shell (ember halo + white-hot core) with a
 * position-history smoke trail tracing the TRUE arc the shell has flown.
 *
 * The trail is maintained entirely in this renderer — never serialized, never
 * shared with the engine, never affects determinism. It is keyed by array index
 * (slot) and reset whenever a slot's new position jumps far from the previous
 * sample (signalling an airburst split or a fresh projectile), so split
 * submunitions each start their own clean trail without smearing across the
 * parent's history.
 *
 * Multiple projectiles can be live at once (airburst / funky submunitions fan
 * down together), so this draws the whole array.
 */
export class ProjectileRenderer {
  /**
   * Per-slot ring buffers of recent (x, y) samples.
   * Index i corresponds to state.projectiles[i] for the current frame.
   *
   * Each frame, before drawing, we push the current position into the matching
   * slot's buffer. If the slot didn't exist (array grew after a split) or the
   * position jump is too large (discontinuity), we reset the buffer and start
   * fresh so split submunitions get a clean trail.
   */
  private readonly slots: Map<number, RingBuffer> = new Map();

  /** Called by Renderer.reset() between games/rounds to wipe all trail state. */
  clear(): void {
    this.slots.forEach((rb) => rb.clear());
    this.slots.clear();
  }

  draw(ctx: CanvasRenderingContext2D, projectiles: ProjectileState[]): void {
    // Drop slots whose index is now beyond the live array length (resolved
    // projectiles whose slot will never be refilled this game).
    for (const idx of this.slots.keys()) {
      if (idx >= projectiles.length) {
        this.slots.delete(idx);
      }
    }

    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      const rb = this.getOrResetSlot(i, p.x, p.y);
      rb.push({ x: p.x, y: p.y });
      this.drawOne(ctx, p, rb);
    }
  }

  /**
   * Return the ring buffer for slot `idx`. If the slot is new OR the supplied
   * (x, y) is too far from the last recorded position (discontinuity — airburst
   * split, new projectile after resolution), reset the buffer so the fresh
   * projectile gets a clean trail.
   */
  private getOrResetSlot(idx: number, x: number, y: number): RingBuffer {
    let rb = this.slots.get(idx);
    if (rb === undefined) {
      rb = new RingBuffer(TRAIL_HISTORY);
      this.slots.set(idx, rb);
      return rb;
    }
    // Check for discontinuity: compare against the most recent sample.
    if (rb.length > 0) {
      let lastX = 0;
      let lastY = 0;
      // Walk the entire buffer to find the last item (forEach visits oldest→newest).
      rb.forEach((pt) => { lastX = pt.x; lastY = pt.y; });
      const dx = x - lastX;
      const dy = y - lastY;
      if (dx * dx + dy * dy > DISCONTINUITY_SQ) {
        rb.clear(); // split detected — start a fresh trail for this slot
      }
    }
    return rb;
  }

  /** Draw a single projectile: position-history smoke trail + ember glow + white-hot core. */
  private drawOne(
    ctx: CanvasRenderingContext2D,
    projectile: ProjectileState,
    history: RingBuffer,
  ): void {
    const { x, y } = projectile;

    ctx.save();

    // --- Smoke trail: fading puffs from oldest (tail) to newest (near shell) ---
    const count = history.length;
    if (count > 1) {
      history.forEach((pt, i) => {
        // i=0 is oldest, i=count-1 is newest.
        // Skip the very newest sample (that's the shell itself, drawn below).
        if (i === count - 1) return;

        const t = i / (count - 1); // 0 = oldest, 1 = newest
        // Fade: oldest puffs are almost invisible, newest are clearly visible.
        const alpha = 0.06 + 0.28 * t;
        // Size: oldest are larger (dispersed), newest are tighter.
        const r = SMOKE_RADIUS_MAX - (SMOKE_RADIUS_MAX - SMOKE_RADIUS_MIN) * t;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(255, 180, 90, 1)`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.globalAlpha = 1;

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
