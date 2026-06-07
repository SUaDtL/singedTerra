import type { GameState, ExplosionEvent, ExplosionStyle } from '@shared/types/GameState';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@shared/engine/Terrain';
import { TerrainRenderer } from './TerrainRenderer';
import { TankRenderer } from './TankRenderer';
import { ProjectileRenderer } from './ProjectileRenderer';
import { HUDRenderer } from './HUDRenderer';
import { skyGradient, ACCENT } from '../ui/theme';

/** Fixed pixel-star field (x, y) in the upper indigo sky — deterministic. */
const STARS: ReadonlyArray<readonly [number, number]> = [
  [60, 36], [142, 64], [232, 28], [300, 72], [388, 40],
  [520, 34], [612, 24], [700, 58], [760, 44], [180, 96],
  [440, 88], [560, 100], [668, 90],
];

/**
 * One live explosion burst — purely client-side visual state.
 *
 * Every visual property here is derived from the authoritative
 * {@link ExplosionEvent} attributes (size=radius, color, duration, style) rather
 * than hardcoded constants. This is the key architectural goal: all explosion
 * DRAWING is centralized in {@link Renderer.drawExplosions}, and per-weapon look
 * is governed entirely by the event attributes — so a future weapon needs only
 * new attribute values (a new color/radius/durationFrames/style in its
 * WeaponDefinition), never new draw code here.
 */
interface Burst {
  cx: number;
  cy: number;
  radius: number;
  /** CSS color string for this burst (from the firing weapon). */
  color: string;
  /** Lifetime of this burst in frames (from the firing weapon). */
  lifeFrames: number;
  /** Visual flavor: 'blast' (expanding rings) vs 'cluster' (punchier flash). */
  style: ExplosionStyle;
  /** Frames elapsed since spawn. */
  age: number;
}

/** Parse a CSS color (hex or rgb()) into [r,g,b] 0..255 for shading math. */
function parseColor(color: string): [number, number, number] {
  const hex = color.trim();
  if (hex[0] === '#') {
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (!Number.isNaN(n) && h.length === 6) {
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    }
  }
  const m = hex.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p));
    if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  }
  // Fallback: warm orange (matches the legacy blast palette).
  return [255, 140, 30];
}

/** Mix a base [r,g,b] toward white by t (0..1) for hotter-core shading. */
function lighten([r, g, b]: [number, number, number], t: number): [number, number, number] {
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
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
 * Explosion events are consumed from GameState.explosions (the ARRAY) by id
 * (never by presence): a burst is spawned exactly once when a new,
 * strictly-greater id appears. Since ids are strictly increasing across all
 * bomblets, a single monotonic high-water mark dedupes correctly AND spawns
 * every bomblet of a cluster in the same frame. lastExplosion is kept only as a
 * fallback. The expanding-circles animation itself lives only here, and is
 * driven entirely by the per-event attributes (radius/color/durationFrames/
 * style) — see {@link Burst}.
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

  /** Current screen-shake magnitude (px), decays each frame. Client-only juice. */
  private shake = 0;
  /** Honor reduced-motion: when true, no screen-shake. */
  private readonly reduceMotion: boolean;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D rendering context');
    this.ctx = ctx;
    this.reduceMotion =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
  }

  /** Draw a single frame for the given state. */
  render(state: GameState): void {
    this.consumeExplosion(state);
    const ctx = this.ctx;

    // Screen-shake (juice): a decaying random offset applied to the WHOLE world
    // (not the DOM HUD, which stays readable). Triggered by detonations.
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.2) {
      sx = (Math.random() * 2 - 1) * this.shake;
      sy = (Math.random() * 2 - 1) * this.shake;
      this.shake *= 0.85;
    } else {
      this.shake = 0;
    }

    ctx.save();
    ctx.translate(sx, sy);

    // 1. Sky — clears the whole canvas each frame as the base layer (oversized to
    // cover the shake offset so no backdrop bleeds in at the edges).
    this.drawSky();

    // 2. Terrain. The TerrainRenderer keeps its own offscreen canvas and blits
    // it (alpha-composited over the sky) on every draw(), rebuilding the
    // offscreen only when the bitmap actually changes — so no per-frame
    // markDirty() is needed here.
    this.terrain.draw(ctx, state.terrain);

    // 3. Tanks (active player emphasised).
    this.tanks.drawAll(ctx, state.tanks, state.activePlayerId);

    // 4. Projectiles (no-op when none / not FIRING). May be several at once
    // (an airburst shell splits into multiple submunitions in flight).
    this.projectile.draw(ctx, state.projectiles);

    // 5. Explosion particles.
    this.drawExplosions();

    ctx.restore();

    // 6. HUD slot (canvas no-op; real HUD is the DOM overlay — unshaken).
    this.hud.draw(ctx, state);
  }

  /**
   * Spawn fresh bursts for every new explosion id in GameState. Deduped by id
   * per the explosion contract — equal/lower id => already animated => skipped.
   * Iterates state.explosions (the source of truth, so all N cluster bomblets
   * animate); falls back to lastExplosion if the array is empty. cx may be
   * off-canvas for edge cluster bomblets — that's tolerated (we just draw it).
   */
  private consumeExplosion(state: GameState): void {
    const events: readonly ExplosionEvent[] =
      state.explosions.length > 0
        ? state.explosions
        : state.lastExplosion !== null
          ? [state.lastExplosion]
          : [];
    for (const ex of events) {
      if (ex.id > this.lastSeenExplosionId) {
        this.lastSeenExplosionId = ex.id;
        this.bursts.push({
          cx: ex.cx,
          cy: ex.cy,
          radius: ex.radius,
          color: ex.color,
          lifeFrames: ex.durationFrames,
          style: ex.style,
          age: 0,
        });
        // Juice: bigger blast => bigger kick (capped). Reduced-motion = none.
        if (!this.reduceMotion) {
          this.shake = Math.min(9, Math.max(this.shake, ex.radius * 0.14));
        }
      }
    }
  }

  /**
   * Advance + paint each live burst as a solid fireball. ALL explosion drawing is
   * centralized here; the look of each burst is governed purely by its event
   * attributes:
   *   - radius      -> burst size
   *   - color       -> fireball color (white-hot core derived by lightening it)
   *   - lifeFrames  -> per-burst lifetime (how long the blast lingers)
   *   - style       -> 'blast' fills wider; 'cluster' a touch smaller per bomblet
   * Future weapons therefore need only new attribute values, never new code.
   *
   * Pacing: a two-phase fireball — pop to full size over the first ~18% of life,
   * then HOLD at full size and fade out across the remainder. This makes the
   * blast linger and read as a solid fireball (Scorched-Earth style) over its
   * full durationFrames, instead of the old thin rings whose flash was gone in a
   * fraction of the lifetime.
   */
  private drawExplosions(): void {
    if (this.bursts.length === 0) return;
    const ctx = this.ctx;
    const GROW = 0.18; // fraction of life spent expanding to full size

    ctx.save();
    for (const b of this.bursts) {
      const t = b.age / b.lifeFrames; // 0..1 progress over this burst's life
      const reach = b.style === 'cluster' ? 1.4 : 1.8;
      const grow = t < GROW ? t / GROW : 1;
      const r = b.radius * reach * grow;
      if (r > 0) {
        // Full opacity while growing, then ease the fade across the long tail.
        const fade = t < GROW ? 1 : 1 - (t - GROW) / (1 - GROW);
        const base = parseColor(b.color);
        const core = lighten(base, 0.75); // white-hot center
        const grad = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r);
        grad.addColorStop(0, `rgba(${core[0] | 0}, ${core[1] | 0}, ${core[2] | 0}, ${fade})`);
        grad.addColorStop(0.55, `rgba(${base[0] | 0}, ${base[1] | 0}, ${base[2] | 0}, ${fade * 0.92})`);
        grad.addColorStop(1, `rgba(${base[0] | 0}, ${base[1] | 0}, ${base[2] | 0}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, r, 0, Math.PI * 2);
        ctx.fill();

        // 16-bit shrapnel: pixel squares radiating out (the banner's boom spokes),
        // fading with the burst. Deterministic per-spoke length for a jagged look.
        const spokes = b.style === 'cluster' ? 6 : 9;
        ctx.fillStyle = `rgba(${core[0] | 0}, ${core[1] | 0}, ${core[2] | 0}, ${fade})`;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2 + (b.style === 'cluster' ? 0.4 : 0);
          const d = r * (0.62 + 0.38 * (((i * 7) % spokes) / spokes));
          const px = b.cx + Math.cos(a) * d;
          const py = b.cy + Math.sin(a) * d;
          ctx.fillRect((px - 1.5) | 0, (py - 1.5) | 0, 3, 3);
        }
      }
      b.age++;
    }
    ctx.restore();

    // Drop bursts that have outlived their own (per-event) lifetime.
    this.bursts = this.bursts.filter((b) => b.age < b.lifeFrames);
  }

  private drawSky(): void {
    const ctx = this.ctx;
    if (this.skyGradient === null) {
      this.skyGradient = skyGradient(ctx, 0, CANVAS_HEIGHT);
    }
    ctx.fillStyle = this.skyGradient;
    // Oversized by SHAKE_MARGIN so the shake offset never reveals the backdrop.
    const m = 12;
    ctx.fillRect(-m, -m, CANVAS_WIDTH + 2 * m, CANVAS_HEIGHT + 2 * m);
    this.drawStars();
    this.drawSun();
  }

  /** Pixel stars in the upper indigo band (crisp little squares). */
  private drawStars(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = ACCENT.sunCore;
    for (const [sx, sy] of STARS) ctx.fillRect(sx, sy, 2, 2);
    ctx.restore();
  }

  /** A low, soft sun glow on the horizon (partly occluded by terrain hills). */
  private drawSun(): void {
    const ctx = this.ctx;
    const cx = CANVAS_WIDTH * 0.5;
    const cy = CANVAS_HEIGHT * 0.66;
    const r = 78;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, ACCENT.sunCore);
    g.addColorStop(0.5, ACCENT.sun);
    g.addColorStop(1, 'rgba(255, 122, 31, 0)');
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
