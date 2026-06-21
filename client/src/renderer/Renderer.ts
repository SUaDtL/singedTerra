import type { GameState, ExplosionEvent, ExplosionStyle } from '@shared/types/GameState';
import { CANVAS_WIDTH, CANVAS_HEIGHT, surfaceAt } from '@shared/engine/Terrain';
import { TANK_WIDTH, TANK_HEIGHT } from '@shared/engine/Tank';
import { getWeapon } from '@shared/engine/WeaponSystem';
import { launchVelocity, GRAVITY, WIND_FACTOR } from '@shared/engine/Physics';
import { fireActiveEdge, bettyHopCount, isOobFizzle } from './audioEdges';

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
import { skyGradient, ACCENT, TERRAIN } from '../ui/theme';
import { flashIntensity, scorchAlpha } from './explosionFx';
import { damageTier } from './tankFx';

/** Mirror TankRenderer's barrel geometry so muzzle FX sit at the VISUAL tip:
 *  pivot at (x, y − TREAD_HEIGHT(6) − BODY_HEIGHT(10)), barrel length 22. */
const BARREL_VISUAL_LEN = 22;
const TANK_BODY_TOP_OFFSET = 16;

/**
 * Frames to keep redrawing after the renderer last spawned a transient effect
 * (debris/smoke/sparks/floating damage text). Must be >= the longest particle
 * lifetime spawned by EffectsRenderer (≈70 frames) so the idle-skip gate never
 * stops redrawing while a particle is still alive. Conservative on purpose. */
const EFFECTS_BUSY_FRAMES = 80;

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
  /**
   * A bouncing-betty projectile hopped off terrain this frame.
   * Called once per bounce tick (i.e. once when `bounces` decrements by 1).
   */
  onHop(): void;
  /**
   * The napalm fire field changed active state.  `active = true` means fire
   * just appeared (0 → >0); `active = false` means it just died out (>0 → 0).
   * The audio layer should start or stop a looping crackle accordingly.
   */
  onFireActive(active: boolean): void;
  /**
   * A projectile flew off-screen (OOB miss): it was present last frame, is
   * absent this frame, and produced no new explosion.  Emit a soft fizzle.
   */
  onMiss(): void;
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
  /**
   * `color` parsed to an [r,g,b] triple ONCE at spawn, so the per-frame draw never
   * re-runs the regex/hex parse (cluster/MIRV puts 7+ bursts on-screen at once, each
   * drawn every frame for its whole life). Identical visuals — just cached.
   */
  rgb: [number, number, number];
  /** White-hot core ([r,g,b]), derived from `rgb` once at spawn (drawn every frame). */
  core: [number, number, number];
  /** Lifetime of this burst in frames (from the firing weapon). */
  lifeFrames: number;
  /** Visual flavor: 'blast' (expanding rings) vs 'cluster' (punchier flash). */
  style: ExplosionStyle;
  /** Frames elapsed since spawn. */
  age: number;
}

/**
 * Client-side crater scorch decal. Rendered as a darkened ring at the blast
 * centre; fades out over lifeFrames. Never touches the terrain bitmap —
 * purely cosmetic overlay.
 */
interface Scorch {
  cx: number;
  cy: number;
  /** Draw radius ≈ 0.6 × blast radius so it fits inside the crater. */
  radius: number;
  lifeFrames: number;
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
  /** Client-side crater scorch decals (render-only; never touch terrain bitmap). */
  private scorches: Scorch[] = [];
  /** Deep-terrain RGB for the scorch ring fill, parsed once (not per frame). */
  private readonly scorchRgb = parseColor(TERRAIN.deep);

  /** Current screen-shake magnitude (px), decays each frame. Client-only juice. */
  private shake = 0;

  /**
   * Frame count remaining during which transient EffectsRenderer particles
   * (debris/smoke/sparks/floating text) may still be on-screen. Set to
   * EFFECTS_BUSY_FRAMES every time this renderer spawns any effect, and decremented
   * once per render(); while > 0 the idle-skip gate ({@link isAnimating}) keeps
   * redrawing. We track it here rather than querying EffectsRenderer so this file
   * (Cluster B) stays self-contained; EFFECTS_BUSY_FRAMES covers the longest particle
   * lifetime (≈70 frames), so the cap is conservative — it can only over-draw, never
   * freeze a live particle.
   */
  private effectsBusy = 0;
  /** Honor reduced-motion: when true, no screen-shake. */
  private readonly reduceMotion: boolean;

  /** Optional gameplay-feel event sink (audio). Wired by main.ts; may stay null. */
  private events: RenderEventSink | null = null;
  /** Tracks FIRING so a launch event fires once per shot, not once per frame. */
  private wasFiring = false;

  // ---- per-frame audio signal tracking ----------------------------------------
  /** Fire-field length last frame (for fireActiveEdge edge detection). */
  private prevFireLen = 0;
  /**
   * Bounces value for each projectile seen last frame, keyed by index (0..N-1).
   * Because there is no stable projectile id, we key by slot index — the same
   * heuristic used by the smoke-trail (ProjectileRenderer).  A new projectile
   * appearing at slot 0 will have prevBounces = 0 (Map miss → 0), which is the
   * same as the "no prior bounce" baseline, so the first frame of a betty shot
   * never spuriously emits a hop tick (bounces goes 0 → MAX_BOUNCES, an
   * increase, which bettyHopCount ignores).
   */
  private readonly prevBounces = new Map<number, number>();
  /** Whether a projectile was in flight last frame (for OOB fizzle detection). */
  private hadProjectileLastFrame = false;

  /** Transient visual juice: debris, smoke, sparks, floating damage text. */
  private readonly effects: EffectsRenderer;
  /** Per-tank health last frame, to detect damage for floating numbers. */
  private readonly prevHealth = new Map<string, number>();
  /**
   * Per-tank smoke-emit countdown. When this hits 0 for a low-HP alive tank,
   * one wispy puff is emitted and the counter resets. Prevents continuous
   * particle flood while keeping the damage smoke as a recognisable wisp.
   * Cleared in reset() alongside prevHealth.
   */
  private readonly smokeThrottle = new Map<string, number>();

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

  /**
   * Reset all PER-GAME visual state. The Renderer is a page-level singleton reused
   * across games (a fresh GameEngine — with its own explosionSeq restarting at 0 — is
   * built per game), so without this the previous game's state leaks. Most importantly
   * `lastSeenExplosionId` keeps its high-water mark while the new engine's explosion ids
   * restart at 1, so every early explosion of the next same-tab game fails the
   * `id > lastSeenExplosionId` dedupe and its boom / shake / debris / damage-numbers /
   * bloom are ALL silently dropped — the V1 juice vanishing on restart/rematch. Also
   * clears the stale last-shot crosshair, per-tank health deltas, shake, and FIRING
   * latch, and invalidates the terrain offscreen cache (which is ALSO keyed on the
   * per-engine terrainVersion — if game #1's final version equals game #2's initial
   * one, the cache would blit game #1's stale terrain until the next deformation).
   * Call on every new game. Client-only — touches no engine/replayed state.
   */
  reset(): void {
    this.bursts.length = 0;
    this.scorches.length = 0;
    this.lastSeenExplosionId = 0;
    this.lastImpact = null;
    this.prevHealth.clear();
    this.smokeThrottle.clear();
    this.shake = 0;
    this.effectsBusy = 0;
    this.wasFiring = false;
    this.effects.clear();
    this.projectile.clear();
    this.terrain.markDirty(); // force a terrain rebuild next frame (version may collide)
    // Audio signal tracking: reset per-frame bookkeeping and stop any sustained
    // napalm crackle so a stuck loop can't survive across rounds or games.
    this.prevFireLen = 0;
    this.prevBounces.clear();
    this.hadProjectileLastFrame = false;
    this.events?.onFireActive(false); // tell audio to stop the sustained crackle
  }

  /** Draw a single frame for the given state. */
  render(state: GameState): void {
    // Snapshot the explosion high-water mark BEFORE consumeExplosion advances it,
    // so the OOB fizzle detector can tell whether a new explosion appeared this frame.
    const explosionIdBefore = this.lastSeenExplosionId;

    this.consumeExplosion(state);

    // Emit a launch event once per shot when a turn enters FIRING. Cluster shells
    // split mid-flight without re-entering FIRING, so this fires exactly once/shot.
    const firing = state.phase === 'FIRING';
    if (firing && !this.wasFiring) {
      this.events?.onLaunch();
      this.spawnMuzzleFlash(state);
    }
    this.wasFiring = firing;

    // --- Per-frame audio signal pass -------------------------------------------
    // All edge-detection runs here, after consumeExplosion (so explosionIdBefore
    // vs lastSeenExplosionId reliably reflects whether a new explosion appeared).
    if (this.events) {
      this.emitAudioSignals(state, explosionIdBefore);
    }

    // Floating damage numbers + K.O. flourish from per-tank health deltas (juice),
    // then advance all transient particles one frame.
    this.trackDamage(state);
    this.effects.update();

    // Tick down the transient-effects busy window. trackDamage / consumeExplosion /
    // spawnMuzzleFlash (re)set it whenever they spawn particles; once it hits 0 and
    // nothing else is live, the idle-skip gate (isAnimating) may skip future frames.
    if (this.effectsBusy > 0) this.effectsBusy--;

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

    // 5.1 Canvas light-flash: full-screen additive brightening at the blast centre,
    // scaled to the largest live burst radius.  Gated by !reduceMotion.
    this.drawFlash();

    // 5.2 Scorch decals: darkened crater rings that linger after the fireball fades.
    // Render-only — never touch the terrain bitmap.
    this.drawScorches();

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
   * Idle-skip gate (perf): is anything on-screen still capable of VISIBLY changing
   * this frame purely from existing renderer/game state? main.ts calls this to skip
   * the full redraw of an otherwise-static PLAYER_TURN scene (sky + sun + tanks at
   * 60fps drains battery on low-end/mobile). Conservative by design — it returns
   * true whenever in doubt, and main.ts also forces a redraw on any input/aim change
   * and on the first frame after a teardown/reset. It NEVER gates FIRING/RESOLVING.
   *
   * Returns true when:
   *   - phase is FIRING or RESOLVING (projectile in flight / shot resolving), OR
   *   - any live explosion burst, lingering scorch decal, or active napalm fire, OR
   *   - screen-shake is still decaying, OR
   *   - transient effect particles may still be on-screen (effectsBusy window), OR
   *   - a damaged-tier alive tank is emitting continuous smoke (perpetual juice).
   * When NONE hold, the scene is static and the frame can be safely skipped.
   */
  isAnimating(state: GameState): boolean {
    if (state.phase === 'FIRING' || state.phase === 'RESOLVING') return true;
    if (this.bursts.length > 0) return true;
    if (this.scorches.length > 0) return true;
    if (state.fire.length > 0) return true;
    if (state.projectiles.length > 0) return true;
    if (this.shake > 0) return true;
    if (this.effectsBusy > 0) return true;
    // Continuous damage smoke keeps emitting while any tank sits in the damaged tier,
    // so that is a live animation that must keep redrawing (and keep trackDamage's
    // throttle advancing) until the tank heals/dies/is buried.
    for (const tank of state.tanks) {
      if (tank.alive && !tank.buried && damageTier(tank.health) === 'damaged') return true;
    }
    return false;
  }

  /**
   * Run all per-frame audio edge detectors and emit to the event sink.
   * Called once per render() after consumeExplosion so the explosion high-water
   * mark is already updated.  Modifies prevFireLen, prevBounces, and
   * hadProjectileLastFrame for the NEXT frame's edge detection.
   *
   * @param state            Current game state.
   * @param explosionIdBefore  lastSeenExplosionId captured BEFORE consumeExplosion ran.
   */
  private emitAudioSignals(state: GameState, explosionIdBefore: number): void {
    const sink = this.events;
    if (!sink) return;

    // 1. Napalm crackle: fire-field length edge.
    const curFireLen = state.fire.length;
    const fireEdge = fireActiveEdge(this.prevFireLen, curFireLen);
    if (fireEdge === 'start') sink.onFireActive(true);
    else if (fireEdge === 'stop') sink.onFireActive(false);
    this.prevFireLen = curFireLen;

    // 2. Bouncing-betty hop ticks: per-projectile bounces decrement.
    // Keyed by slot index; new projectiles in a slot start at 0 (Map miss),
    // so the first frame of a betty (bounces spikes up from 0) is ignored by
    // bettyHopCount (increase → 0 ticks).
    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i];
      const prev = this.prevBounces.get(i) ?? 0;
      const ticks = bettyHopCount(prev, p.bounces);
      for (let t = 0; t < ticks; t++) sink.onHop();
      this.prevBounces.set(i, p.bounces);
    }
    // Drop stale entries for slots that no longer exist (projectile resolved).
    if (this.prevBounces.size > state.projectiles.length) {
      for (const key of this.prevBounces.keys()) {
        if (key >= state.projectiles.length) this.prevBounces.delete(key);
      }
    }

    // 3. OOB fizzle: projectile gone this frame with no new explosion.
    const hasProjectile = state.projectiles.length > 0;
    const newExplosion = this.lastSeenExplosionId > explosionIdBefore;
    if (isOobFizzle(this.hadProjectileLastFrame, hasProjectile, newExplosion)) {
      sink.onMiss();
    }
    this.hadProjectileLastFrame = hasProjectile;
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
        // Parse the burst color ONCE here (not per draw frame): a cluster/MIRV puts
        // many bursts on-screen simultaneously, each re-drawn every frame of its life.
        const rgb = parseColor(ex.color);
        this.bursts.push({
          cx: ex.cx,
          cy: ex.cy,
          radius: ex.radius,
          color: ex.color,
          rgb,
          core: lighten(rgb, 0.75), // white-hot center, derived once
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
        // Crater scorch decal: a darkened ring that lingers at the impact point,
        // purely client-side (never writes the terrain bitmap). Radius is kept
        // slightly inside the blast so it reads as a charred crater floor.
        // Lifetime is 3× the burst life so the scorch outlasts the fireball.
        this.scorches.push({
          cx: ex.cx,
          cy: ex.cy,
          radius: ex.radius * 0.6,
          lifeFrames: ex.durationFrames * 3,
          age: 0,
        });
        if (ex.radius > maxNewRadius) maxNewRadius = ex.radius;
        anyNew = true;
      }
    }
    if (anyNew) {
      this.events?.onExplosion(maxNewRadius);
      // Ejecta particles (debris/smoke/sparks) outlive the burst itself, so keep the
      // idle-skip gate redrawing until they can no longer be on-screen.
      this.effectsBusy = EFFECTS_BUSY_FRAMES;
    }
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
    this.effectsBusy = EFFECTS_BUSY_FRAMES; // muzzle sparks live a few frames
  }

  /**
   * Float a damage number over any tank whose health dropped since last frame, and
   * a K.O. flourish + wreck burst when it dies. Health INCREASES (round resets) are
   * ignored. The map persists across games/rounds but only triggers on a strict drop,
   * so a reset to full health silently re-baselines without a spurious number.
   *
   * Also drives continuous damage smoke for low-HP alive tanks: a wispy puff is
   * emitted every SMOKE_INTERVAL frames (throttled so it's a wisp, not a fog).
   * Suppressed automatically when reduceMotion is set inside EffectsRenderer.
   */
  private trackDamage(state: GameState): void {
    /** Frames between damage-smoke puffs per tank (≈ 10 puffs/second at 60fps). */
    const SMOKE_INTERVAL = 6;

    for (const tank of state.tanks) {
      const prev = this.prevHealth.get(tank.id);
      if (prev !== undefined && tank.health < prev - 0.01) {
        this.effects.spawnDamage(tank.x, tank.y - 30, prev - tank.health);
        if (tank.health <= 0 && prev > 0) {
          this.effects.spawnKill(tank.x, tank.y - 18);
          // Turret-pop + wreck debris burst on the alive→dead transition.
          this.effects.spawnWreck(tank.x, tank.y, tank.color);
        }
        // Floating damage text / K.O. flourish / wreck debris linger past this frame;
        // keep the idle-skip gate redrawing until they expire.
        this.effectsBusy = EFFECTS_BUSY_FRAMES;
      }
      this.prevHealth.set(tank.id, tank.health);

      // Continuous damage smoke for low-HP alive tanks (throttled per-tank).
      if (tank.alive && !tank.buried && damageTier(tank.health) === 'damaged') {
        const countdown = this.smokeThrottle.get(tank.id) ?? 0;
        if (countdown <= 0) {
          this.effects.emitDamageSmoke(tank.x, tank.y);
          this.smokeThrottle.set(tank.id, SMOKE_INTERVAL);
        } else {
          this.smokeThrottle.set(tank.id, countdown - 1);
        }
      } else {
        // Reset the counter when the tank is no longer in the damaged tier
        // (healed, died, or buried) so smoke stops immediately.
        this.smokeThrottle.delete(tank.id);
      }
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
        const base = b.rgb;   // parsed once at spawn (see consumeExplosion)
        const core = b.core;  // white-hot center, derived once at spawn
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
   * Full-canvas additive light-flash keyed to the freshest/strongest live burst.
   *
   * Uses `globalCompositeOperation = 'lighter'` so it brightens whatever is already
   * on the canvas without washing it to white (additive mode clamps at white
   * naturally). The flash intensity is computed by the pure helper {@link flashIntensity}
   * (age 0 of the strongest burst) and decays quickly so it complements the
   * existing DOM bloom in main.ts rather than doubling it.
   *
   * Gated by !reduceMotion.  No-op when there are no live bursts.
   */
  private drawFlash(): void {
    if (this.reduceMotion || this.bursts.length === 0) return;

    // Find the burst with the largest radius among live bursts (the "headline" blast).
    let strongest: Burst | null = null;
    for (const b of this.bursts) {
      if (strongest === null || b.radius > strongest.radius) strongest = b;
    }
    if (!strongest) return;

    const alpha = flashIntensity(strongest.age, strongest.lifeFrames, strongest.radius);
    if (alpha <= 0) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    // A warm near-white for the flash colour (suncore palette tone).
    ctx.fillStyle = ACCENT.sunCore;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /**
   * Crater scorch decals: darkened rings drawn at blast impact points that linger
   * after the fireball has faded, reinforcing the sense of scorched earth.
   *
   * Each decal is a concentric ring (outer filled with TERRAIN.deep tinted down,
   * inner cleared back toward the burst color) that fades out via {@link scorchAlpha}.
   * Purely client-side cosmetic; never reads or writes the terrain bitmap.
   *
   * Under reduceMotion the ring is held at a constant alpha (the continuous
   * alpha-fade IS motion, so it is suppressed); the decal still ages and is culled
   * at end of life. Otherwise it fades out smoothly.
   */
  private drawScorches(): void {
    if (this.scorches.length === 0) return;
    const ctx = this.ctx;
    const [dr, dg, db] = this.scorchRgb;

    ctx.save();
    for (const s of this.scorches) {
      const alpha = this.reduceMotion ? 0.6 : scorchAlpha(s.age, s.lifeFrames);
      if (alpha <= 0 || s.radius <= 0) { s.age++; continue; }

      // Outer dark ring (the scorched rim).
      const outerR = s.radius;
      const innerR = s.radius * 0.45;
      const grad = ctx.createRadialGradient(s.cx, s.cy, innerR, s.cx, s.cy, outerR);
      grad.addColorStop(0, `rgba(${dr | 0}, ${dg | 0}, ${db | 0}, 0)`);
      grad.addColorStop(0.4, `rgba(${dr | 0}, ${dg | 0}, ${db | 0}, ${(alpha * 0.6).toFixed(4)})`);
      grad.addColorStop(1, `rgba(${dr | 0}, ${dg | 0}, ${db | 0}, ${(alpha * 0.85).toFixed(4)})`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, outerR, 0, Math.PI * 2);
      ctx.fill();
      s.age++;
    }
    ctx.restore();

    // Cull fully faded decals.
    this.scorches = this.scorches.filter((s) => s.age < s.lifeFrames);
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

    // Memoize the per-column surface for THIS frame: surfaceAt is an O(H) top-down
    // scan, and each burning column is queried twice below (glow pass + flame pass),
    // often with adjacent cells sharing a column. Compute each column's surface once
    // here and reuse it in both passes (render-only; the engine's surfaceAt is untouched).
    const surfaceByColumn = new Map<number, number>();
    const surfaceFor = (x: number): number => {
      let sy = surfaceByColumn.get(x);
      if (sy === undefined) {
        sy = surfaceAt(state.terrain, x);
        surfaceByColumn.set(x, sy);
      }
      return sy;
    };

    ctx.save();

    // Pass 1: a soft ember glow hugging the ground (additive warmth under the
    // flames), one low wide blob per cell — cheap and reads as a fire pool.
    ctx.globalCompositeOperation = 'lighter';
    for (const cell of fire) {
      const sy = surfaceFor(cell.x);
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
      const sy = surfaceFor(cell.x);
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
