import type { GameState } from '@shared/types/GameState';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';
import { TerrainRenderer } from './TerrainRenderer';
import { TankRenderer } from './TankRenderer';
import { ProjectileRenderer } from './ProjectileRenderer';
import { HUDRenderer } from './HUDRenderer';

/** Sky gradient stops (top -> horizon). */
const SKY_TOP = '#1b2a4a';
const SKY_BOTTOM = '#5a78a8';

/** Explosion animation tuning (client-only visual state). */
const EXPLOSION_RING_COUNT = 20;
/** Lifetime of a burst in frames (~500ms at 60fps). */
const EXPLOSION_LIFE_FRAMES = 30;

/** One live explosion burst — purely client-side visual state. */
interface Burst {
  cx: number;
  cy: number;
  radius: number;
  /** Frames elapsed since spawn. */
  age: number;
}

/**
 * Renderer owns the Canvas 2D draw loop and orchestrates the sub-renderers.
 * Draw order (SPEC §7):
 *   1. Sky gradient (cached; redrawn each frame as the base clear)
 *   2. Terrain fill (TerrainRenderer; dirty-flag aware)
 *   3. Tanks
 *   4. Projectile (during FIRING)
 *   5. Explosion effect (client-only expanding circles, ~500ms)
 *   6. HUD overlay (HTML/CSS — see ui/HUD.ts; canvas slot is a no-op)
 *
 * Explosion events are consumed from GameState.lastExplosion by id (never by
 * presence): a burst is spawned exactly once when a new, strictly-greater id
 * appears. The expanding-circles animation itself lives only here.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrain = new TerrainRenderer();
  private readonly tanks = new TankRenderer();
  private readonly projectile = new ProjectileRenderer();
  private readonly hud = new HUDRenderer();

  /** Cached sky gradient, rebuilt only on (re)size. */
  private skyGradient: CanvasGradient | null = null;

  /** Live explosion bursts (client-only visual state). */
  private bursts: Burst[] = [];
  /** Highest explosion id already turned into a burst (dedupe). */
  private lastSeenExplosionId = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D rendering context');
    this.ctx = ctx;
  }

  /** Draw a single frame for the given state. */
  render(state: GameState): void {
    this.consumeExplosion(state);

    // 1. Sky — clears the whole canvas each frame, so terrain must repaint.
    this.drawSky();
    this.terrain.markDirty();

    // 2. Terrain.
    this.terrain.draw(this.ctx, state.terrain);

    // 3. Tanks.
    this.tanks.drawAll(this.ctx, state.tanks);

    // 4. Projectile (no-op when null / not FIRING).
    this.projectile.draw(this.ctx, state.projectile);

    // 5. Explosion particles.
    this.drawExplosions();

    // 6. HUD slot (canvas no-op; real HUD is the DOM overlay).
    this.hud.draw(this.ctx, state);
  }

  /**
   * Spawn a fresh burst iff GameState carries a new explosion id. Deduped by id
   * per the explosion contract — equal/lower id => already animated => nothing.
   */
  private consumeExplosion(state: GameState): void {
    const ex = state.lastExplosion;
    if (ex !== null && ex.id > this.lastSeenExplosionId) {
      this.lastSeenExplosionId = ex.id;
      this.bursts.push({ cx: ex.cx, cy: ex.cy, radius: ex.radius, age: 0 });
    }
  }

  /** Advance + paint each live burst as expanding, fading orange rings. */
  private drawExplosions(): void {
    if (this.bursts.length === 0) return;
    const ctx = this.ctx;

    ctx.save();
    for (const b of this.bursts) {
      const t = b.age / EXPLOSION_LIFE_FRAMES; // 0..1 progress
      const alpha = 1 - t; // fade out over life
      // Expanding concentric rings, sized by the blast radius.
      for (let i = 0; i < EXPLOSION_RING_COUNT; i++) {
        const ringFrac = (i + 1) / EXPLOSION_RING_COUNT;
        const r = b.radius * t * ringFrac * 2;
        if (r <= 0) continue;
        const ringAlpha = alpha * (1 - ringFrac) * 0.8;
        if (ringAlpha <= 0) continue;
        // Orange palette, hotter (yellow) at the core, redder at the edge.
        const hue = 40 - ringFrac * 25; // 40 (orange) -> 15 (red-orange)
        ctx.strokeStyle = `hsla(${hue}, 100%, 55%, ${ringAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      b.age++;
    }
    ctx.restore();

    // Drop expired bursts.
    this.bursts = this.bursts.filter((b) => b.age < EXPLOSION_LIFE_FRAMES);
  }

  private drawSky(): void {
    if (this.skyGradient === null) {
      const g = this.ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      g.addColorStop(0, SKY_TOP);
      g.addColorStop(1, SKY_BOTTOM);
      this.skyGradient = g;
    }
    this.ctx.fillStyle = this.skyGradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}
