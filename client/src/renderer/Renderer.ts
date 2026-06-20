import type { GameState, ExplosionEvent, ExplosionStyle } from '@shared/types/GameState';
import { CANVAS_WIDTH, CANVAS_HEIGHT, surfaceAt } from '@shared/engine/Terrain';
import { TANK_WIDTH, TANK_HEIGHT } from '@shared/engine/Tank';
import { getWeapon } from '@shared/engine/WeaponSystem';
import { launchVelocity, GRAVITY, WIND_FACTOR } from '@shared/engine/Physics';

/** Aim guide length in ticks. DELIBERATELY SHORT: it shows launch direction +
 *  relative power (and which way the wind bends the opening arc), but stops long
 *  before the landing point — so reading wind/gravity over distance stays the
 *  player's skill and the guide can't trivialize aiming (per design constraint). */
const AIM_GUIDE_TICKS = 16;
import { TerrainRenderer } from './TerrainRenderer';
import { TankRenderer } from './TankRenderer';
import { ProjectileRenderer } from './ProjectileRenderer';
import { HUDRenderer } from './HUDRenderer';
import { EffectsRenderer } from './EffectsRenderer';
import { skyGradient, ACCENT } from '../ui/theme';

/** Mirror TankRenderer's barrel geometry so muzzle FX sit at the VISUAL tip:
 *  pivot at (x, y − TREAD_HEIGHT(6) − BODY_HEIGHT(10)), barrel length 22. */
const BARREL_VISUAL_LEN = 22;
const TANK_BODY_TOP_OFFSET = 16;

/**
 * Optional sink the renderer emits gameplay-feel events to (audio, etc.). Kept as
 * a thin interface so the renderer stays DECOUPLED from the AudioEngine — main.ts
 * wires an adapter. Both hooks are presentation-only and derive from the same
 * authoritative state the renderer already consumes, so they never affect the
 * deterministic engine.
 */
export interface RenderEventSink {
  /** A shot just launched (a turn transitioned into FIRING). */
  onLaunch(): void;
  /** One or more new detonations appeared this frame; `radius` is the largest. */
  onExplosion(radius: number): void;
}

/** Fixed pixel-star field (x, y) in the upper indigo sky — deterministic. Spans
 *  the full 1200px width so the widened field (Phase 0) has no bare sky. */
const STARS: ReadonlyArray<readonly [number, number]> = [
  [60, 36], [142, 64], [232, 28], [300, 72], [388, 40],
  [520, 34], [612, 24], [700, 58], [760, 44], [180, 96],
  [440, 88], [560, 100], [668, 90],
  [820, 30], [880, 70], [944, 42], [1008, 26], [1064, 62],
  [1120, 38], [1168, 82], [840, 106], [992, 98], [1104, 112],
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

  /** Optional gameplay-feel event sink (audio). Wired by main.ts; may stay null. */
  private events: RenderEventSink | null = null;
  /** Tracks FIRING so a launch event fires once per shot, not once per frame. */
  private wasFiring = false;

  /** Transient visual juice: debris, smoke, sparks, floating damage text. */
  private readonly effects: EffectsRenderer;
  /** Per-tank health last frame, to detect damage for floating numbers. */
  private readonly prevHealth = new Map<string, number>();

  /** Set per-frame by main.ts: the LOCAL human controls the active tank this turn
   *  (so the aim guide is theirs to see, never an opponent's or a CPU's). */
  private showAimGuide = false;
  /** User master toggle (G key), persisted: aim guide on/off. */
  private aimGuideEnabled: boolean;
  /** Centre of the most recent detonation, for the last-shot ranging marker. */
  private lastImpact: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D rendering context');
    this.ctx = ctx;
    this.reduceMotion =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    this.effects = new EffectsRenderer(this.reduceMotion);
    this.aimGuideEnabled = (() => {
      try {
        return localStorage.getItem('singedterra:aimguide') !== '0';
      } catch {
        return true;
      }
    })();
  }

  /** Attach a gameplay-feel event sink (e.g. audio). The renderer emits to it but
   *  never imports it, keeping presentation layers decoupled. */
  setEvents(sink: RenderEventSink): void {
    this.events = sink;
  }

  /** main.ts sets this each turn: true only when the LOCAL human controls the
   *  active tank (hot-seat human turn, or networked + it's my id). */
  setAimGuide(visible: boolean): void {
    this.showAimGuide = visible;
  }

  /** Flip the aim-guide master toggle (G key) and persist it. Returns new state. */
  toggleAimGuide(): boolean {
    this.aimGuideEnabled = !this.aimGuideEnabled;
    try {
      localStorage.setItem('singedterra:aimguide', this.aimGuideEnabled ? '1' : '0');
    } catch {
      /* localStorage unavailable — preference just isn't persisted */
    }
    return this.aimGuideEnabled;
  }

  /** Draw a single frame for the given state. */
  render(state: GameState): void {
    this.consumeExplosion(state);

    // Emit a launch event once per shot when a turn enters FIRING. Cluster shells
    // split mid-flight without re-entering FIRING, so this fires exactly once/shot.
    const firing = state.phase === 'FIRING';
    if (firing && !this.wasFiring) {
      this.events?.onLaunch();
      this.spawnMuzzleFlash(state);
    }
    this.wasFiring = firing;

    // Floating damage numbers + K.O. flourish from per-tank health deltas (juice),
    // then advance all transient particles one frame.
    this.trackDamage(state);
    this.effects.update();

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

    // 2.0 Buried tanks (#15): draw BEFORE the terrain so the risen dirt paints over
    // them — they read as submerged rather than sitting on top of the mound that buried
    // them. A surface beacon (below) keeps them findable. (Almost always empty.)
    const buried = state.tanks.filter((t) => t.alive && t.buried);
    if (buried.length > 0) this.tanks.drawAll(ctx, buried);

    // 2. Terrain. The TerrainRenderer keeps its own offscreen canvas and blits
    // it (alpha-composited over the sky) on every draw(), rebuilding the
    // offscreen only when the bitmap actually changes — so no per-frame
    // markDirty() is needed here.
    this.terrain.draw(ctx, state.terrain, state.terrainVersion);

    // 3. Tanks (active player emphasised). Buried tanks were painted under the terrain
    // above, so draw only the visible (non-buried) ones here.
    const visible = buried.length > 0
      ? state.tanks.filter((t) => !(t.alive && t.buried))
      : state.tanks;
    this.tanks.drawAll(ctx, visible, state.activePlayerId);

    // 3.0 Buried beacons: a small surface marker over each trapped tank so the player
    // can see where to dig it out (the body itself is hidden under the dirt).
    for (const t of buried) {
      this.tanks.drawBuriedMarker(ctx, t.x, surfaceAt(state.terrain, t.x), t.color);
    }

    // 3.5 Shield force fields — a depleting ring of particles around any shielded
    // tank (drawn over tanks so it reads as a bubble around them).
    this.drawShields(state);

    // 4. Projectiles (no-op when none / not FIRING). May be several at once
    // (an airburst shell splits into multiple submunitions in flight).
    this.projectile.draw(ctx, state.projectiles);

    // 4.5 Napalm fire field — flames licking up off every burning column. Drawn
    // OVER tanks (it engulfs them) but UNDER the explosion flash.
    this.drawFire(state);

    // 5. Explosion particles.
    this.drawExplosions();

    // 5.5 Transient juice: debris/dust/sparks + floating damage text (in-world, so
    // it shakes with the scene). Drawn over blasts, under the DOM HUD.
    this.effects.draw(ctx);

    // 5.6 Aiming aids (PLAYER_TURN only): a faint last-shot ranging marker, and for
    // the locally-controlled human a LIMITED launch guide (first AIM_GUIDE_TICKS
    // ticks only — never the landing point).
    if (state.phase === 'PLAYER_TURN') {
      this.drawLastImpact();
      if (this.showAimGuide && this.aimGuideEnabled) this.drawAimGuide(state);
    }

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
    // Coalesce all NEW blasts this frame into a single audio boom at the largest
    // radius, so a 5-bomblet cluster reads as one punchy detonation, not five
    // simultaneous booms. Screen-shake still takes the max per-event as before.
    let maxNewRadius = 0;
    let anyNew = false;
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
        // Ejecta: terrain debris + dust + sparks at the blast (reduced-motion = none).
        this.effects.spawnExplosion(ex.cx, ex.cy, ex.radius, ex.color);
        // Remember the latest blast centre for the last-shot ranging marker.
        this.lastImpact = { x: ex.cx, y: ex.cy };
        if (ex.radius > maxNewRadius) maxNewRadius = ex.radius;
        anyNew = true;
      }
    }
    if (anyNew) this.events?.onExplosion(maxNewRadius);
  }

  /**
   * Spawn muzzle sparks at the active shooter's barrel tip. Mirrors TankRenderer's
   * geometry (pivot at the body top, barrel length 22) so the flash sits exactly at
   * the visual barrel end. Purely cosmetic; reduced-motion suppresses it inside FX.
   */
  private spawnMuzzleFlash(state: GameState): void {
    const shooter = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!shooter) return;
    const rad = (shooter.angle * Math.PI) / 180;
    const px = shooter.x + Math.cos(rad) * BARREL_VISUAL_LEN;
    const py = shooter.y - TANK_BODY_TOP_OFFSET - Math.sin(rad) * BARREL_VISUAL_LEN;
    this.effects.spawnMuzzle(px, py, shooter.angle, shooter.color);
  }

  /**
   * Float a damage number over any tank whose health dropped since last frame, and
   * a K.O. flourish when it dies. Health INCREASES (round resets) are ignored. The
   * map persists across games/rounds but only triggers on a strict drop, so a reset
   * to full health silently re-baselines without a spurious number.
   */
  private trackDamage(state: GameState): void {
    for (const tank of state.tanks) {
      const prev = this.prevHealth.get(tank.id);
      if (prev !== undefined && tank.health < prev - 0.01) {
        this.effects.spawnDamage(tank.x, tank.y - 30, prev - tank.health);
        if (tank.health <= 0 && prev > 0) this.effects.spawnKill(tank.x, tank.y - 18);
      }
      this.prevHealth.set(tank.id, tank.health);
    }
  }

  /**
   * A faint dotted launch guide from the active tank's barrel tip. It integrates
   * the REAL projectile step (launchVelocity + gravity + this turn's wind), so it is
   * honest — but only for AIM_GUIDE_TICKS ticks, so it reveals launch direction and
   * relative power (and the wind's opening bend) WITHOUT showing the impact point.
   * Read-only: it never touches the deterministic engine, only mirrors its math.
   */
  private drawAimGuide(state: GameState): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!tank || !tank.alive) return;
    const rad = (tank.angle * Math.PI) / 180;
    let x = tank.x + Math.cos(rad) * BARREL_VISUAL_LEN;
    let y = tank.y - TANK_BODY_TOP_OFFSET - Math.sin(rad) * BARREL_VISUAL_LEN;
    const v = launchVelocity(tank.angle, tank.power);
    let vx = v.vx;
    let vy = v.vy;
    const ctx = this.ctx;
    ctx.save();
    for (let i = 0; i < AIM_GUIDE_TICKS; i++) {
      // Mirror Physics.stepProjectile's integration exactly (room-gravity override
      // is ignored — this is a short HINT, not a precise predictor).
      vy += GRAVITY;
      vx += state.wind * WIND_FACTOR;
      x += vx;
      y += vy;
      ctx.globalAlpha = 0.55 * (1 - i / AIM_GUIDE_TICKS);
      ctx.fillStyle = ACCENT.gold;
      ctx.fillRect((x - 1.5) | 0, (y - 1.5) | 0, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** A faint crosshair at the most recent detonation so players range-find by
   *  adjustment rather than guesswork. Shown only while aiming (PLAYER_TURN). */
  private drawLastImpact(): void {
    if (!this.lastImpact) return;
    const { x, y } = this.lastImpact;
    const ctx = this.ctx;
    const r = 6;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = ACCENT.ember;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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

  /**
   * Draw the napalm fire field: a flickering flame tongue rising off every
   * burning column, plus a soft ember glow pooled along the ground. Purely
   * client-side visual state — `Math.random()` flicker is fine here (the engine's
   * `state.fire` is the authoritative, deterministic source; only the LOOK jitters).
   *
   * Each {@link import('@shared/types/GameState').FireCell} carries `life` (ticks
   * remaining); we fade a cell's flame as it dies so the field gutters out at the
   * edges. The flame top sits at the column's live terrain surface so it tracks
   * any deformation under it.
   */
  private drawFire(state: GameState): void {
    const fire = state.fire;
    if (fire.length === 0) return;
    const ctx = this.ctx;
    // Visual reference for "full" intensity — decoupled from the engine's burnTicks
    // (cells below this read as full-strength; only the dying tail fades).
    const FULL = 36;

    ctx.save();

    // Pass 1: a soft ember glow hugging the ground (additive warmth under the
    // flames), one low wide blob per cell — cheap and reads as a fire pool.
    ctx.globalCompositeOperation = 'lighter';
    for (const cell of fire) {
      const sy = surfaceAt(state.terrain, cell.x);
      const t = Math.min(1, cell.life / FULL);
      ctx.globalAlpha = 0.05 + 0.07 * t;
      ctx.fillStyle = '#ff5a1f';
      ctx.fillRect(cell.x - 4, sy - 6, 8, 8);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Pass 2: flame tongues — a jittery triangle per column (orange body), with a
    // shorter yellow-hot core. Adjacent columns merge into a wall of fire.
    for (const cell of fire) {
      const sx = cell.x;
      const sy = surfaceAt(state.terrain, cell.x);
      const t = Math.min(1, cell.life / FULL);
      const h = (9 + 15 * t) * (0.7 + Math.random() * 0.55); // flicker height
      const tip = sx + (Math.random() * 2 - 1) * 2;          // wind-licked tip

      ctx.globalAlpha = 0.45 + 0.35 * t;
      ctx.fillStyle = '#ff5a1f'; // burning orange (napalm palette)
      ctx.beginPath();
      ctx.moveTo(sx - 2.2, sy);
      ctx.lineTo(tip, sy - h);
      ctx.lineTo(sx + 2.2, sy);
      ctx.closePath();
      ctx.fill();

      const hc = h * 0.52;
      ctx.globalAlpha = 0.5 + 0.4 * t;
      ctx.fillStyle = '#ffd23f'; // hot yellow core
      ctx.beginPath();
      ctx.moveTo(sx - 1.1, sy);
      ctx.lineTo(tip, sy - hc);
      ctx.lineTo(sx + 1.1, sy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Draw the shield force field around each shielded tank: a faint bubble plus a
   * ring of dots. The shield is now an HP POOL (tank.shieldHp), so the ring shows a
   * fixed SHIELD_RING_SLOTS dots and lights them in proportion to the REMAINING
   * fraction of capacity — the player watches the ring drain smoothly as damage is
   * soaked. Purely derived from the authoritative pool — no client-side shield state.
   */
  private drawShields(state: GameState): void {
    const ctx = this.ctx;
    const capacity = getWeapon('shield').behavior?.shield?.capacity ?? 120;
    const color = getWeapon('shield').detonation.color; // shimmer blue
    const SHIELD_RING_SLOTS = 12; // visual dot count; independent of HP capacity

    for (const tank of state.tanks) {
      if (!tank.alive || tank.shieldHp <= 0) continue;
      const cx = tank.x;
      const cy = tank.y - TANK_HEIGHT / 2;
      const radius = TANK_WIDTH * 0.95;

      ctx.save();
      // Faint energy bubble.
      ctx.strokeStyle = 'rgba(122, 215, 255, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      // A soft inner glow so it reads as an energy shell, not just an outline.
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
      grad.addColorStop(0, 'rgba(122, 215, 255, 0)');
      grad.addColorStop(1, 'rgba(122, 215, 255, 0.12)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Ring slots: lit in proportion to the remaining HP fraction, dim for drained.
      // ceil so any surviving charge keeps at least one dot lit (the field is up).
      const slots = SHIELD_RING_SLOTS;
      const litCount = Math.ceil((Math.min(tank.shieldHp, capacity) / capacity) * slots);
      for (let i = 0; i < slots; i++) {
        const a = (i / slots) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(a) * radius;
        const py = cy + Math.sin(a) * radius;
        const lit = i < litCount;
        ctx.fillStyle = lit ? color : 'rgba(122, 215, 255, 0.18)';
        ctx.beginPath();
        ctx.arc(px, py, lit ? 2.4 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
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
