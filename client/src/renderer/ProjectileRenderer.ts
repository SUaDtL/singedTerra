import type { ProjectileState } from '@shared/types/GameState';
import { BOOM, hexToRgb } from '../ui/theme';
import {
  getProjectileVisualProfile,
  type ProjectileVisualProfile,
} from './projectileVisuals';
import { getProjectileGroundShadow } from './projectileGroundShadow';
import { getProjectileMotionStreak } from './projectileMotionStreak';
import { RingBuffer } from './ringBuffer';

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

interface ProjectileSlot {
  history: RingBuffer;
  weaponType: ProjectileState['weaponType'];
  hasSplit: boolean;
  burrowing: boolean;
  age: number;
}

/**
 * ProjectileRenderer draws every in-flight projectile during the FIRING phase
 * (SPEC §7 layer 4): a weapon-signature payload with a position-history trail
 * tracing the TRUE arc the shell has flown.
 *
 * The trail is maintained entirely in this renderer — never serialized, never
 * shared with the engine, never affects determinism. Array indices are only
 * frame-local slots, so count changes clear the bounded history set before
 * children split or survivors compact. Stable-count slots also reset on weapon,
 * split-state, age-rewind, or large-position discontinuities.
 *
 * Multiple projectiles can be live at once (airburst / funky submunitions fan
 * down together), so this draws the whole array.
 */
export class ProjectileRenderer {
  constructor(private readonly reduceMotion = false) {}

  /**
   * Per-slot ring buffers of recent (x, y) samples.
   * Index i corresponds to state.projectiles[i] for the current frame.
   *
   * Each frame, before drawing, we push the current position into the matching
   * slot's buffer. Count and semantic identity transitions reset histories so
   * one payload can never inherit another payload's trail.
   */
  private readonly slots: Map<number, ProjectileSlot> = new Map();
  private previousProjectileCount = 0;

  /** Called by Renderer.reset() between games/rounds to wipe all trail state. */
  clear(): void {
    this.slots.forEach((slot) => slot.history.clear());
    this.slots.clear();
    this.previousProjectileCount = 0;
  }

  /**
   * Paint present-position depth cues onto the live terrain.
   *
   * Stateless by design: shadows derive only from this frame's projectile position
   * and terrain column, so they cannot inherit trail identity or affect replay.
   */
  drawGroundShadows(
    ctx: CanvasRenderingContext2D,
    projectiles: ProjectileState[],
    terrain: Uint8Array,
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (const projectile of projectiles) {
      if (projectile.burrowTicksRemaining !== undefined) continue;
      const cue = getProjectileGroundShadow(projectile, terrain);
      if (cue === null) continue;

      ctx.save();
      // Sink the ellipse one pixel into the first solid row so it reads on the
      // terrain face instead of hovering in the air immediately above it.
      ctx.translate(cue.x, cue.groundY + 1);
      ctx.scale(cue.radiusX, cue.radiusY);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, 'rgba(7, 3, 12, 0.86)');
      gradient.addColorStop(0.55, 'rgba(7, 3, 12, 0.5)');
      gradient.addColorStop(1, 'rgba(7, 3, 12, 0)');
      ctx.globalAlpha = cue.alpha;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, projectiles: ProjectileState[]): void {
    // Array indices are not stable identities: split children replace their
    // parent in-place and survivors compact left as siblings resolve. Restart
    // the small local trail set on any count transition so no payload inherits
    // another payload's history.
    if (projectiles.length !== this.previousProjectileCount) {
      this.slots.forEach((slot) => slot.history.clear());
      this.slots.clear();
      this.previousProjectileCount = projectiles.length;
    }

    for (const [i, p] of projectiles.entries()) {
      const rb = this.getOrResetSlot(i, p);
      rb.push({ x: p.x, y: p.y });
      this.drawOne(ctx, p, rb);
    }
  }

  /**
   * Return the ring buffer for slot `idx`, resetting on semantic identity, age,
   * or position discontinuities.
   */
  private getOrResetSlot(idx: number, projectile: ProjectileState): RingBuffer {
    let slot = this.slots.get(idx);
    if (slot === undefined) {
      slot = {
        history: new RingBuffer(TRAIL_HISTORY),
        weaponType: projectile.weaponType,
        hasSplit: projectile.hasSplit,
        burrowing: projectile.burrowTicksRemaining !== undefined,
        age: projectile.age,
      };
      this.slots.set(idx, slot);
      return slot.history;
    }

    const identityChanged = slot.weaponType !== projectile.weaponType
      || slot.hasSplit !== projectile.hasSplit
      || slot.burrowing !== (projectile.burrowTicksRemaining !== undefined)
      || projectile.age < slot.age;
    if (identityChanged) {
      slot.history.clear();
    } else if (slot.history.length > 0) {
      let lastX = 0;
      let lastY = 0;
      // Walk the entire buffer to find the last item (forEach visits oldest→newest).
      slot.history.forEach((pt) => { lastX = pt.x; lastY = pt.y; });
      const dx = projectile.x - lastX;
      const dy = projectile.y - lastY;
      if (dx * dx + dy * dy > DISCONTINUITY_SQ) {
        slot.history.clear(); // discontinuity: start a fresh trail for this slot
      }
    }
    slot.weaponType = projectile.weaponType;
    slot.hasSplit = projectile.hasSplit;
    slot.burrowing = projectile.burrowTicksRemaining !== undefined;
    slot.age = projectile.age;
    return slot.history;
  }

  /** Draw a single projectile: weapon-colored history trail, glow, and payload glyph. */
  private drawOne(
    ctx: CanvasRenderingContext2D,
    projectile: ProjectileState,
    history: RingBuffer,
  ): void {
    const { x, y } = projectile;
    const profile = getProjectileVisualProfile(projectile);
    const burrowing = projectile.burrowTicksRemaining !== undefined;

    ctx.save();

    // --- Weapon-colored trail: faded/dispersed tail to tight, bright head ---
    const count = history.length;
    if (count > 1 && (!burrowing || !this.reduceMotion)) {
      history.forEach((pt, i) => {
        // i=0 is oldest, i=count-1 is newest.
        // Skip the very newest sample (that's the shell itself, drawn below).
        if (i === count - 1) return;

        // The newest history item is the shell and is skipped, so the preceding
        // puff owns the profile's exact "new" endpoint.
        const t = count > 2 ? i / (count - 2) : 0;
        const alpha = profile.trailAlphaOld
          + (profile.trailAlphaNew - profile.trailAlphaOld) * t;
        const r = profile.trailRadiusMax
          - (profile.trailRadiusMax - profile.trailRadiusMin) * t;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = profile.accent;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (!burrowing || !this.reduceMotion) {
      this.drawMotionStreak(ctx, projectile, profile);
    }
    ctx.globalAlpha = 1;

    // Weapon-colored halo.
    const [red, green, blue] = hexToRgb(profile.accent);
    const halo = ctx.createRadialGradient(x, y, 0, x, y, profile.glowRadius);
    halo.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0.82)`);
    halo.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, profile.glowRadius, 0, Math.PI * 2);
    ctx.fill();

    this.drawSilhouette(ctx, x, y, profile);

    ctx.restore();
  }

  /**
   * Paint one stateless velocity ribbon behind the live payload. Unlike history,
   * this is readable on launch and immediately after a split resets slot state.
   */
  private drawMotionStreak(
    ctx: CanvasRenderingContext2D,
    projectile: Readonly<ProjectileState>,
    profile: Readonly<ProjectileVisualProfile>,
  ): void {
    if (!Number.isFinite(projectile.x) || !Number.isFinite(projectile.y)) return;
    const streak = getProjectileMotionStreak(
      projectile.vx,
      projectile.vy,
      profile.coreRadius,
    );
    if (streak === null) return;

    const tailX = projectile.x + streak.tailOffsetX;
    const tailY = projectile.y + streak.tailOffsetY;
    const headX = projectile.x + streak.headOffsetX;
    const headY = projectile.y + streak.headOffsetY;
    const [red, green, blue] = hexToRgb(profile.accent);
    const gradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
    gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0)`);
    gradient.addColorStop(0.6, `rgba(${red}, ${green}, ${blue}, 0.5)`);
    gradient.addColorStop(1, profile.accent);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';

    ctx.globalAlpha = streak.alpha * 0.6;
    ctx.lineWidth = streak.width;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    ctx.globalAlpha = streak.alpha;
    ctx.lineWidth = Math.max(1, streak.width * 0.32);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();
    ctx.restore();
  }

  /** Draw the compact payload glyph in local, velocity-oriented coordinates. */
  private drawSilhouette(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    profile: ProjectileVisualProfile,
  ): void {
    const r = profile.coreRadius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(profile.rotation);
    ctx.fillStyle = BOOM.core;
    ctx.strokeStyle = profile.accent;
    ctx.lineWidth = Math.max(1, r * 0.28);
    ctx.lineCap = 'round';

    switch (profile.silhouette) {
      case 'shell':
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.2, r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'heavy':
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.45, r * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = profile.accent;
        ctx.fillRect(-r * 0.55, -r * 0.82, r * 0.34, r * 1.64);
        break;

      case 'nuclear':
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
        ctx.stroke();
        break;

      case 'earth':
        ctx.fillStyle = profile.accent;
        ctx.beginPath();
        ctx.moveTo(r * 1.15, 0);
        ctx.lineTo(r * 0.35, r * 0.9);
        ctx.lineTo(-r * 0.9, r * 0.65);
        ctx.lineTo(-r * 1.05, -r * 0.35);
        ctx.lineTo(r * 0.15, -r);
        ctx.closePath();
        ctx.fill();
        break;

      case 'mine':
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 1.25, 0);
        ctx.lineTo(r * 1.25, 0);
        ctx.moveTo(0, -r * 1.25);
        ctx.lineTo(0, r * 1.25);
        ctx.stroke();
        break;

      case 'napalm':
        ctx.fillStyle = profile.accent;
        ctx.beginPath();
        ctx.moveTo(r * 1.5, 0);
        ctx.bezierCurveTo(r * 0.35, -r * 1.05, -r, -r * 0.8, -r * 1.15, 0);
        ctx.bezierCurveTo(-r, r * 0.8, r * 0.35, r * 1.05, r * 1.5, 0);
        ctx.closePath();
        ctx.fill();
        break;

      case 'airburst':
        ctx.beginPath();
        ctx.moveTo(r * 1.5, 0);
        ctx.lineTo(0, r * 0.82);
        ctx.lineTo(-r * 1.15, 0);
        ctx.lineTo(0, -r * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = profile.accent;
        ctx.fillRect(-r * 0.2, -r * 0.82, r * 0.4, r * 1.64);
        break;

      case 'drill':
        // A bright conical bit with three cutting flutes. It stays readable as
        // a machine rather than another round shell while rotating with travel.
        ctx.fillStyle = profile.accent;
        ctx.beginPath();
        ctx.moveTo(r * 1.65, 0);
        ctx.lineTo(r * 0.35, r * 0.82);
        ctx.lineTo(-r * 1.05, r * 0.62);
        ctx.lineTo(-r * 1.05, -r * 0.62);
        ctx.lineTo(r * 0.35, -r * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = BOOM.core;
        ctx.beginPath();
        for (const offset of [-0.55, 0, 0.55]) {
          ctx.moveTo(-r * 0.82 + r * offset, -r * 0.62);
          ctx.lineTo(-r * 0.2 + r * offset, r * 0.62);
        }
        ctx.stroke();
        break;

      case 'submunition':
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 1.45, 0);
        ctx.lineTo(-r * 0.65, 0);
        ctx.moveTo(-r * 1.05, -r * 0.65);
        ctx.lineTo(-r * 0.65, 0);
        ctx.lineTo(-r * 1.05, r * 0.65);
        ctx.stroke();
        break;
    }

    ctx.restore();
  }
}
