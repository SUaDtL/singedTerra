import type {
  GameState,
  ExplosionEvent,
  ExplosionStyle,
  TankState,
} from '@shared/types/GameState';
import type { BattlefieldWorldId, WallMode } from '@shared/types/GameOptions';
import { CANVAS_WIDTH, CANVAS_HEIGHT, surfaceAt } from '@shared/engine/Terrain';
import { TANK_WIDTH, TANK_HEIGHT, BARREL_LENGTH, barrelTip } from '@shared/engine/Tank';
import { getWeapon } from '@shared/engine/WeaponSystem';
import { GRAVITY } from '@shared/engine/Physics';
import { fireActiveEdge, bettyHopCount, isOobFizzle } from './audioEdges';

import { TerrainRenderer } from './TerrainRenderer';
import { TankRenderer, type TankRenderPose } from './TankRenderer';
import { ProjectileRenderer } from './ProjectileRenderer';
import { HUDRenderer } from './HUDRenderer';
import { EffectsRenderer } from './EffectsRenderer';
import { MobilityEffectsRenderer } from './MobilityEffectsRenderer';
import {
  MOBILITY_SIGNATURE_PROFILES,
  observeMobilitySignature,
  type MobilityPoseSample,
} from './mobilitySignatures';
import { skyGradient, ACCENT, TERRAIN } from '../ui/theme';
import { flashIntensity, scorchAlpha } from './explosionFx';
import { damageTier } from './tankFx';
import { IMPACT_KICK_MAX, impactKick } from './impactKick';
import { impactHitStopFrames } from './impactHitStop';
import {
  getExplosionVisualProfile,
  type ExplosionVisualProfile,
} from './explosionVisuals';
import { getBlastLightProfile } from './blastLighting';
import { getMuzzleVisualProfile } from './muzzleVisuals';
import { TANK_RECOIL_FRAMES, tankRecoilPose } from './tankRecoil';
import {
  getWindGustVisualProfile,
  type WindGustVisualProfile,
} from './windGustVisuals';
import {
  getImpactDepthParallax,
  type ImpactDepthParallax,
} from './impactDepthParallax';
import { getNapalmFirelightPools } from './napalmFirelight';
import { AtmosphereCloudLayer } from './atmosphereClouds';
import { buildLaunchGuide, getAimGuideMode } from './aimGuide';
import {
  coalesceImpactMaterial,
  type ImpactMaterialBatch,
} from '../feel/impactMaterial';
import {
  consumeWallContacts,
  drawSidewalls,
  type WallContactVisual,
} from './sidewallVisuals';
import { BattlefieldBackdrop } from './BattlefieldBackdrop';
import { ExplosionArt } from './ExplosionArt';
import { ImpactMonitorPainter } from './ImpactMonitorPainter';
import { WorldAtmosphereLayer } from './worldAtmosphere';
import {
  getImpactMonitorGeometry,
  selectImpactMonitorFocus,
  type ImpactMonitorOffset,
} from './impactMonitor';

/** Shared barrel geometry keeps muzzle FX at the visual tip. */
/**
 * Frames to keep redrawing after the renderer last spawned a transient effect
 * (debris/smoke/sparks/floating damage text). Must be >= the longest particle
 * lifetime spawned by EffectsRenderer (≈70 frames) so the idle-skip gate never
 * stops redrawing while a particle is still alive. Conservative on purpose. */
const EFFECTS_BUSY_FRAMES = 80;

/** Fraction of directional recoil retained after each rendered frame. */
const IMPACT_KICK_DECAY = 0.72;
/** Stop sub-pixel recoil once its vector is visually negligible. */
const IMPACT_KICK_EPSILON = 0.12;
/** Existing random screen-shake cap in logical canvas pixels per axis. */
const SCREEN_SHAKE_MAX = 9;
/** Covers the maximum composed kick + random shake, with one spare pixel. */
const WORLD_TRANSLATION_MARGIN = SCREEN_SHAKE_MAX + IMPACT_KICK_MAX + 1;
/** Bound additive work and overdraw for multi-warhead detonations. */
const MAX_LOCAL_BLAST_LIGHTS = 3;
/** Stable fail-closed/rest profile for a camera displacement of zero. */
const REST_DEPTH_PARALLAX = getImpactDepthParallax({ x: 0, y: 0 })!;

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
  onExplosion(radius: number, impact: ImpactMaterialBatch | null): void;
  /** A projectile contacted one of the configured energy rails. */
  onWallImpact?(side: 'left' | 'right', walls: WallMode): void;
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

/** Fixed y lanes avoid allocating or accumulating particles per rendered frame. */
const WIND_GUST_LANES: ReadonlyArray<number> = [
  70, 96, 126, 158, 192, 226, 260, 294, 82, 142, 246,
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
 * WeaponDefinition) plus one exhaustive client profile entry.
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
  /** Weapon-specific, bounded presentation data derived once at event consumption. */
  visual: ExplosionVisualProfile;
  /** Eligibility is snapshotted at admission so a live burst never swaps style. */
  authored: boolean;
  /** Frames elapsed since spawn. */
  age: number;
}

interface TankRecoil {
  readonly tankId: string;
  readonly angle: number;
  readonly launchWeight: number;
  readonly round: number;
  age: number;
}

interface WindGust {
  readonly profile: Readonly<WindGustVisualProfile>;
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
    if (h.length === 3) {
      const r = h.charAt(0);
      const g = h.charAt(1);
      const b = h.charAt(2);
      h = `${r}${r}${g}${g}${b}${b}`;
    }
    const n = parseInt(h, 16);
    if (!Number.isNaN(n) && h.length === 6) {
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    }
  }
  const m = hex.match(/rgba?\(([^)]+)\)/i);
  const channels = m?.[1];
  if (channels) {
    const [r, g, b] = channels.split(',').map((part) => parseFloat(part));
    if (r !== undefined && g !== undefined && b !== undefined) return [r, g, b];
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
  private readonly projectile: ProjectileRenderer;
  private readonly hud = new HUDRenderer();
  /** One project-bound panorama; procedural sky art remains its full fallback. */
  private readonly battlefieldBackdrop = new BattlefieldBackdrop();
  /** Fixed, selected-world atmosphere painted behind the battlefield itself. */
  private readonly worldAtmosphere: WorldAtmosphereLayer;
  /** Fail-soft authored conventional-blast atlas; special families stay procedural. */
  private readonly explosionArt = new ExplosionArt();
  /** Reusable screen-space tactical inset; all gameplay remains in world space. */
  private readonly impactMonitor = new ImpactMonitorPainter();
  /** Cached static far-sky art; impact parallax moves the completed layer. */
  private readonly atmosphereClouds = new AtmosphereCloudLayer();

  /** Cached sky gradient, rebuilt only on (re)size. */
  private skyGradient: CanvasGradient | null = null;
  private sunGradient: CanvasGradient | null = null;

  /** Live explosion bursts (client-only visual state). */
  private bursts: Burst[] = [];
  /** Highest explosion id already turned into a burst (dedupe). */
  private lastSeenExplosionId = 0;
  private lastSeenWallImpactId = 0;
  private wallContacts: WallContactVisual[] = [];
  /** Client-side crater scorch decals (render-only; never touch terrain bitmap). */
  private scorches: Scorch[] = [];
  /** Deep-terrain RGB for the scorch ring fill, parsed once (not per frame). */
  private readonly scorchRgb = parseColor(TERRAIN.deep);

  /** Current screen-shake magnitude (px), decays each frame. Client-only juice. */
  private shake = 0;
  /** Blast-origin-aware world translation, decayed independently from random shake. */
  private kickX = 0;
  private kickY = 0;
  /** Pre-impact canvas holds remaining; simulation and DOM HUD continue normally. */
  private impactHoldFrames = 0;

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
  /** Local chassis kick for the most recent visible living shooter. */
  private tankRecoil: TankRecoil | null = null;
  /** One bounded sky transition for the most recently observed aiming turn. */
  private windGust: WindGust | null = null;
  /** `(round, turn)` key prevents per-frame snapshots from retriggering the gust. */
  private windTurnKey: string | null = null;

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
  /** Bounded under-tank movement signatures; never alters authoritative state. */
  private readonly mobilityEffects: MobilityEffectsRenderer;
  /** Last observed authoritative pose for each tank, used only for presentation. */
  private readonly prevMobilityPoses = new Map<string, MobilityPoseSample>();
  /** Per-tank health last frame, to detect damage for floating numbers. */
  private readonly prevHealth = new Map<string, number>();
  /** Per-tank shield pool last frame, to detect fully absorbed damage. */
  private readonly prevShieldHp = new Map<string, number>();
  /** Round whose shield pool samples populate prevShieldHp. */
  private shieldBaselineRound: number | null = null;
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
  /** Effective gravity for the current authoritative turn, supplied by main. */
  private aimGuideGravity = GRAVITY;
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
    this.worldAtmosphere = new WorldAtmosphereLayer(this.reduceMotion);
    this.projectile = new ProjectileRenderer(this.reduceMotion);
    this.effects = new EffectsRenderer(this.reduceMotion);
    this.mobilityEffects = new MobilityEffectsRenderer(this.reduceMotion);
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
  setAimGuide(visible: boolean, gravity = GRAVITY): void {
    this.showAimGuide = visible;
    this.aimGuideGravity = Number.isFinite(gravity) && gravity > 0 ? gravity : GRAVITY;
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
    this.lastSeenWallImpactId = 0;
    this.wallContacts ??= [];
    this.wallContacts.length = 0;
    this.lastImpact = null;
    this.prevHealth.clear();
    this.prevMobilityPoses.clear();
    this.prevShieldHp.clear();
    this.shieldBaselineRound = null;
    this.smokeThrottle.clear();
    this.shake = 0;
    this.kickX = 0;
    this.kickY = 0;
    this.impactHoldFrames = 0;
    this.effectsBusy = 0;
    this.wasFiring = false;
    this.tankRecoil = null;
    this.windGust = null;
    this.windTurnKey = null;
    this.effects.clear();
    this.mobilityEffects.clear();
    this.projectile.clear();
    this.battlefieldBackdrop?.reset?.();
    this.worldAtmosphere?.reset?.();
    this.terrain?.reset?.(); // retire selected material and force a fresh terrain cache
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
    this.consumeWallImpacts(state);

    // Emit a launch event once per shot when a turn enters FIRING. Cluster shells
    // split mid-flight without re-entering FIRING, so this fires exactly once/shot.
    const firing = state.phase === 'FIRING';
    if (firing && !this.wasFiring) {
      this.events?.onLaunch();
      this.spawnMuzzleFlash(state);
    }
    this.wasFiring = firing;
    this.trackWindGust(state);

    // --- Per-frame audio signal pass -------------------------------------------
    // All edge-detection runs here, after consumeExplosion (so explosionIdBefore
    // vs lastSeenExplosionId reliably reflects whether a new explosion appeared).
    if (this.events) {
      this.emitAudioSignals(state, explosionIdBefore);
    }

    // Large-impact hit-stop: consume and signal the authoritative explosion once,
    // then leave the already-painted pre-impact canvas untouched for a bounded
    // presentation beat. Engine ticks, replay, networking, and the DOM HUD are not
    // paused; renderer-owned effect ages wait so the whole impact package releases
    // together on the next painted frame.
    if (this.impactHoldFrames > 0) {
      this.impactHoldFrames--;
      return;
    }

    // Floating damage numbers + K.O. flourish from per-tank health deltas (juice),
    // then advance all transient particles one frame.
    this.trackDamage(state);
    this.trackMobility(state);
    this.mobilityEffects.update();
    this.effects.update(state.terrain);

    // Tick down the transient-effects busy window. trackDamage / consumeExplosion /
    // spawnMuzzleFlash (re)set it whenever they spawn particles; once it hits 0 and
    // nothing else is live, the idle-skip gate (isAnimating) may skip future frames.
    if (this.effectsBusy > 0) this.effectsBusy--;

    const ctx = this.ctx;

    // Screen-shake (juice): a decaying random offset applied to the WHOLE world
    // (not the DOM HUD, which stays readable). Triggered by detonations.
    let sx = this.kickX;
    let sy = this.kickY;
    if (Math.hypot(this.kickX, this.kickY) > IMPACT_KICK_EPSILON) {
      this.kickX *= IMPACT_KICK_DECAY;
      this.kickY *= IMPACT_KICK_DECAY;
    } else {
      this.kickX = 0;
      this.kickY = 0;
    }
    if (this.shake > 0.2) {
      sx += (Math.random() * 2 - 1) * this.shake;
      sy += (Math.random() * 2 - 1) * this.shake;
      this.shake *= 0.85;
    } else {
      this.shake = 0;
    }

    const depth = getImpactDepthParallax({ x: sx, y: sy }) ?? REST_DEPTH_PARALLAX;
    // 1. Far atmosphere and middle ridges own isolated, partial transforms.
    this.drawSky(depth);
    this.worldAtmosphere?.draw?.(ctx);
    this.worldAtmosphere?.advance?.();

    // 1.5 Turn-start wind ribbons share the middle-distance ridge transform.
    ctx.save();
    ctx.translate(depth.middle.x, depth.middle.y);
    this.drawWindGusts();
    ctx.restore();
    this.advanceWindGust();

    // 2–5.6 The destructible battlefield keeps the full camera recoil.
    ctx.save();
    ctx.translate(depth.world.x, depth.world.y);

    // 2.0 Buried tanks (#15): draw BEFORE the terrain so the risen dirt paints over
    // them — they read as submerged rather than sitting on top of the mound that buried
    // them. A surface beacon (below) keeps them findable. (Almost always empty.)
    // Keep every buried silhouette under the terrain, including a tank killed
    // while trapped. Otherwise its retained dead row would pop a wreck above the
    // dirt on the death frame. Only living buried tanks receive a surface beacon.
    const buried = state.tanks.filter((t) => t.buried);
    if (buried.length > 0) this.tanks.drawAll(ctx, buried);

    // 2. Terrain. The TerrainRenderer keeps its own offscreen canvas and blits
    // it (alpha-composited over the sky) on every draw(), rebuilding the
    // offscreen only when the bitmap actually changes — so no per-frame
    // markDirty() is needed here.
    this.terrain.draw(ctx, state.terrain, state.terrainVersion);

    // 2.5 Terrain-projected shell shadows. These present-position depth cues sit
    // above the destructible terrain but below visible tanks and payload glyphs.
    this.projectile.drawGroundShadows(ctx, state.projectiles, state.terrain);

    // Legal movement signatures lie on the terrain under each visible chassis.
    this.mobilityEffects.draw(ctx);

    // 3. Tanks (active player emphasised). Buried tanks were painted under the terrain
    // above, so draw only the visible (non-buried) ones here.
    const visible = buried.length > 0
      ? state.tanks.filter((t) => !t.buried)
      : state.tanks;
    const tankPose = this.currentTankRecoilPose(state, visible);
    if (tankPose) {
      this.tanks.drawAll(ctx, visible, state.activePlayerId, tankPose);
    } else {
      this.tanks.drawAll(ctx, visible, state.activePlayerId);
    }
    this.advanceTankRecoil();

    // 3.0 Buried beacons: a small surface marker over each trapped tank so the player
    // can see where to dig it out (the body itself is hidden under the dirt).
    for (const t of buried) {
      if (!t.alive) continue;
      this.tanks.drawBuriedMarker(ctx, t.x, surfaceAt(state.terrain, t.x), t.color);
    }

    // 3.5 Shield force fields — a depleting ring of particles around any shielded
    // tank (drawn over tanks so it reads as a bubble around them).
    this.drawShields(state);

    // 4. Projectiles (no-op when none / not FIRING). May be several at once
    // (an airburst shell splits into multiple submunitions in flight).
    this.projectile.draw(ctx, state.projectiles);
    drawSidewalls(
      ctx,
      state.walls ?? 'open',
      this.wallContacts,
      this.reduceMotion,
    );
    for (const contact of this.wallContacts) contact.age++;
    this.wallContacts = this.wallContacts.filter((contact) => contact.age < 18);

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
    this.drawImpactMonitor(depth.world);
    this.hud.draw(ctx, state);
  }

  /** Freeze one complete deterministic world from the client's pristine terrain. */
  selectBattlefieldWorld(terrain: Uint8Array, requestedWorld?: BattlefieldWorldId): void {
    const world = requestedWorld === undefined
      ? this.battlefieldBackdrop?.select?.(terrain)
      : this.battlefieldBackdrop?.select?.(terrain, requestedWorld);
    if (world) {
      this.terrain?.selectWorld?.(world);
      this.worldAtmosphere?.select?.(world);
    }
  }

  /** Copy the strongest live detonation after all world transforms are restored. */
  private drawImpactMonitor(worldOffset: Readonly<ImpactMonitorOffset>): void {
    if (this.bursts.length === 0) return;
    const focus = selectImpactMonitorFocus(this.bursts);
    if (focus === null) return;
    const geometry = getImpactMonitorGeometry(focus, worldOffset);
    if (geometry === null) return;
    this.impactMonitor?.draw(this.ctx, geometry, false);
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
    // State snapshots keep arriving while idle. Redraw them until the one
    // asynchronous image load settles so a cached/static turn cannot freeze on
    // the procedural fallback forever. Failed and ready loads both release idle.
    if (this.battlefieldBackdrop?.isSettled === false) return true;
    if (this.worldAtmosphere?.isActive) return true;
    if (this.explosionArt?.isSettled === false) return true;
    // The terrain material follows the same first-applied-frame contract. Once
    // ready, TerrainRenderer rebuilds its version cache exactly once.
    if (this.terrain?.isMaterialSettled === false) return true;
    // Living tanks follow the same first-painted-frame contract. Wreck-only
    // scenes never spin solely for an asset that has no eligible consumer.
    if (
      this.tanks?.isChassisArtSettled === false
      && state.tanks.some((tank) => tank.alive)
    ) return true;
    if (this.bursts.length > 0) return true;
    if (this.scorches.length > 0) return true;
    if ((this.wallContacts?.length ?? 0) > 0) return true;
    if (state.fire.length > 0) return true;
    if (state.projectiles.length > 0) return true;
    if (this.shake > 0) return true;
    if (this.kickX !== 0 || this.kickY !== 0) return true;
    if (this.impactHoldFrames > 0) return true;
    if (this.effectsBusy > 0) return true;
    if (this.mobilityEffects.isActive) return true;
    // A networked action can update the roster or a tank during an otherwise
    // static PLAYER_TURN. Wake one frame so trackMobility can prune/baseline it.
    if (this.hasPendingMobilitySignature(state)) return true;
    if (this.tankRecoil != null) return true;
    if (this.windGust != null) return true;
    // Continuous damage smoke keeps emitting while any tank sits in the damaged tier,
    // so that is a live animation that must keep redrawing (and keep trackDamage's
    // throttle advancing) until the tank heals/dies/is buried.
    for (const tank of state.tanks) {
      if (tank.alive && !tank.buried && damageTier(tank.health) === 'damaged') return true;
    }
    return false;
  }

  /**
   * Observe the existing authoritative turn/wind tuple once. A current turn seen
   * after reconnect may still receive its one local cue; non-PLAYER_TURN snapshots
   * never consume the key while a shot is already in flight.
   */
  private trackWindGust(state: GameState): void {
    if (
      state.phase !== 'PLAYER_TURN'
      || !Number.isFinite(state.round)
      || !Number.isFinite(state.turn)
    ) return;
    const key = `${state.round}:${state.turn}`;
    if (key === this.windTurnKey) return;
    this.windTurnKey = key;
    this.windGust = this.reduceMotion
      ? null
      : (() => {
          const profile = getWindGustVisualProfile(state.wind);
          return profile === null ? null : { profile, age: 0 };
        })();
  }

  /** Draw fixed, wrapped sky ribbons without creating a particle collection. */
  private drawWindGusts(): void {
    const gust = this.windGust;
    if (gust == null) return;
    const { profile, age } = gust;
    const ctx = this.ctx;
    const margin = 80;
    const wrapWidth = CANVAS_WIDTH + margin * 2;
    const fade = Math.min(1, (age + 1) / 8, (profile.life - age) / 12);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(255, 238, 194, 0.95)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.8 + profile.strength * 1.2;

    for (let i = 0; i < profile.streakCount; i++) {
      const rawHead = 90 + i * 137 + profile.direction * age * profile.speed;
      const headX = ((rawHead % wrapWidth) + wrapWidth) % wrapWidth - margin;
      const y = WIND_GUST_LANES[i];
      if (y === undefined) break;
      const tailX = headX - profile.direction * profile.length;
      const bendX = headX - profile.direction * profile.length * 0.52;
      const bendY = y + Math.sin(age * 0.22 + i * 0.9)
        * 4 * (0.5 + profile.strength * 0.5);

      ctx.globalAlpha = profile.alpha * fade * (0.65 + (i % 3) * 0.175);
      ctx.beginPath();
      ctx.moveTo(tailX, y);
      ctx.quadraticCurveTo(bendX, bendY, headX, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private advanceWindGust(): void {
    const gust = this.windGust;
    if (gust == null) return;
    gust.age++;
    if (gust.age >= gust.profile.life) this.windGust = null;
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
    for (const [i, p] of state.projectiles.entries()) {
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
    let strongestNewKick = { x: 0, y: 0 };
    const newEvents: ExplosionEvent[] = [];
    for (const ex of events) {
      if (ex.id > this.lastSeenExplosionId) {
        this.lastSeenExplosionId = ex.id;
        newEvents.push(ex);
        // Parse the burst color ONCE here (not per draw frame): a cluster/MIRV puts
        // many bursts on-screen simultaneously, each re-drawn every frame of its life.
        const rgb = parseColor(ex.color);
        const visual = getExplosionVisualProfile(ex);
        this.bursts.push({
          cx: ex.cx,
          cy: ex.cy,
          radius: ex.radius,
          color: ex.color,
          rgb,
          core: lighten(rgb, 0.75), // white-hot center, derived once
          lifeFrames: ex.durationFrames,
          style: ex.style,
          visual,
          authored: (
            !this.reduceMotion
            && visual.family === 'conventional'
            && this.explosionArt?.state === 'ready'
          ),
          age: 0,
        });
        // Juice: bigger blast => bigger kick (capped). Reduced-motion = none.
        if (!this.reduceMotion) {
          this.shake = Math.min(
            SCREEN_SHAKE_MAX,
            Math.max(this.shake, ex.radius * 0.14),
          );
          const kick = impactKick(
            ex.cx,
            ex.cy,
            ex.radius,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
          );
          if (
            Math.hypot(kick.x, kick.y)
            > Math.hypot(strongestNewKick.x, strongestNewKick.y)
          ) {
            strongestNewKick = kick;
          }
        }
        // Ejecta: terrain debris + dust + sparks at the blast (reduced-motion = none).
        this.effects.spawnExplosion(
          ex.cx,
          ex.cy,
          ex.radius,
          ex.color,
          ex.impactType,
        );
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
      this.impactHoldFrames = Math.max(
        this.impactHoldFrames,
        impactHitStopFrames(maxNewRadius, this.reduceMotion),
      );
      if (Math.hypot(strongestNewKick.x, strongestNewKick.y) > 0) {
        // Arbitration is local to THIS event batch. A later, weaker heavy blast
        // still gets its own directional response instead of being masked by a
        // stronger kick left over from an earlier frame.
        this.kickX = strongestNewKick.x;
        this.kickY = strongestNewKick.y;
      }
      this.events?.onExplosion(
        maxNewRadius,
        coalesceImpactMaterial(newEvents),
      );
      // Ejecta particles (debris/smoke/sparks) outlive the burst itself, so keep the
      // idle-skip gate redrawing until they can no longer be on-screen.
      this.effectsBusy = EFFECTS_BUSY_FRAMES;
    }
  }

  /** Admit monotonic engine wall contacts once and coalesce their audio edge. */
  private consumeWallImpacts(state: GameState): void {
    this.wallContacts ??= [];
    this.lastSeenWallImpactId ??= 0;
    const batch = consumeWallContacts(
      state.wallImpacts ?? [],
      this.lastSeenWallImpactId,
    );
    this.lastSeenWallImpactId = batch.lastSeenId;
    for (const contact of batch.contacts) {
      this.wallContacts.push({ ...contact, age: 0 });
    }
    if (batch.audio) {
      this.events?.onWallImpact?.(batch.audio.side, state.walls ?? 'open');
    }
  }

  /**
   * Spawn muzzle sparks at the active shooter's shared barrel tip so the flash sits
   * exactly at the visual barrel end. Purely cosmetic; reduced-motion suppresses it
   * inside FX.
   */
  private spawnMuzzleFlash(state: GameState): void {
    this.tankRecoil = null;
    const shooter = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!shooter) return;
    const { x: px, y: py } = barrelTip(shooter, BARREL_LENGTH);
    const profile = getMuzzleVisualProfile(state.projectiles[0]?.weaponType);
    this.effects.spawnMuzzle(px, py, shooter.angle, profile);
    if (!this.reduceMotion && shooter.alive && !shooter.buried) {
      this.tankRecoil = {
        tankId: shooter.id,
        angle: shooter.angle,
        launchWeight: profile.scale,
        round: state.round,
        age: 0,
      };
    }
    this.effectsBusy = EFFECTS_BUSY_FRAMES; // muzzle sparks live a few frames
  }

  private currentTankRecoilPose(
    state: GameState,
    tanks: readonly TankState[],
  ): TankRenderPose | undefined {
    const recoil = this.tankRecoil;
    if (recoil == null) return undefined;
    if (state.round !== recoil.round) {
      this.tankRecoil = null;
      return undefined;
    }
    const shooter = tanks.find((tank) => tank.id === recoil.tankId);
    if (!shooter?.alive || shooter.buried) return undefined;
    const offset = tankRecoilPose(recoil.angle, recoil.launchWeight, recoil.age);
    if (offset === null) return undefined;
    return {
      tankId: recoil.tankId,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  }

  private advanceTankRecoil(): void {
    if (this.tankRecoil == null) return;
    this.tankRecoil.age++;
    if (this.tankRecoil.age >= TANK_RECOIL_FRAMES) this.tankRecoil = null;
  }

  /**
   * Observe authoritative tank poses without feeding anything back into gameplay.
   * Every snapshot becomes the next baseline, including rejected transitions, so a
   * reconnect, round change, burial, or teleport cannot leave a stale trail behind.
   */
  private trackMobility(state: GameState): void {
    const presentTankIds = new Set(state.tanks.map((tank) => tank.id));
    for (const tankId of this.prevMobilityPoses.keys()) {
      if (!presentTankIds.has(tankId)) this.prevMobilityPoses.delete(tankId);
    }
    for (const tank of state.tanks) {
      const current = this.mobilityPose(tank, state.round);
      const event = observeMobilitySignature(this.prevMobilityPoses.get(tank.id), current);
      this.prevMobilityPoses.set(tank.id, current);

      // Reduced motion has no residual work: do not create a burst or lengthen
      // the renderer busy window. The observer still rebases every live snapshot.
      if (event == null || this.reduceMotion) continue;
      this.mobilityEffects.spawn(event);
      this.effectsBusy = Math.max(
        this.effectsBusy,
        MOBILITY_SIGNATURE_PROFILES[event.kit].lifeFrames,
      );
    }
  }

  /** Check the render gate without consuming the next pose observation. */
  private hasPendingMobilitySignature(state: GameState): boolean {
    if (
      this.prevMobilityPoses.size !== state.tanks.length
      || state.tanks.some((tank) => !this.prevMobilityPoses.has(tank.id))
    ) return true;
    return state.tanks.some((tank) => observeMobilitySignature(
      this.prevMobilityPoses.get(tank.id),
      this.mobilityPose(tank, state.round),
    ) != null);
  }

  private mobilityPose(tank: TankState, round: number): MobilityPoseSample {
    return {
      tankId: tank.id,
      round,
      x: tank.x,
      y: tank.y,
      alive: tank.alive,
      buried: tank.buried,
      kit: tank.loadout?.treads ?? 'foundry',
      color: tank.color,
    };
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

    // New rounds rebuild tanks with shieldHp=0 without invoking the per-game reset.
    // Re-baseline so prior-round charge cannot masquerade as an absorbed hit.
    if (this.shieldBaselineRound !== state.round) {
      this.prevShieldHp.clear();
      this.shieldBaselineRound = state.round;
    }

    for (const tank of state.tanks) {
      const prev = this.prevHealth.get(tank.id);
      if (prev !== undefined && tank.health < prev - 0.01) {
        const damage = prev - tank.health;
        this.effects.spawnDamage(tank.x, tank.y - 30, damage);
        if (tank.alive && tank.health > 0 && !tank.buried) {
          this.effects.spawnArmorHit(
            tank.id,
            tank.x,
            tank.y - TANK_HEIGHT / 2,
            damage,
            tank.color,
          );
        }
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

      const prevShield = this.prevShieldHp.get(tank.id);
      if (
        prevShield !== undefined
        && prevShield > 0
        && tank.shieldHp < prevShield - 0.01
      ) {
        this.effects.spawnShieldImpact(
          tank.x,
          tank.y - TANK_HEIGHT / 2,
          prevShield - tank.shieldHp,
        );
        this.effectsBusy = EFFECTS_BUSY_FRAMES;
      }
      this.prevShieldHp.set(tank.id, tank.shieldHp);

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

  /** Draw the bounded, physics-honest launch hint with a distance fade. */
  private drawAimGuide(state: GameState): void {
    const tank = state.tanks.find((t) => t.id === state.activePlayerId);
    if (!tank || !tank.alive) return;
    const mode = getAimGuideMode(
      state,
      tank,
      this.showAimGuide,
      this.aimGuideEnabled,
    );
    if (mode === 'none') return;

    const points = buildLaunchGuide(state, tank, this.aimGuideGravity);
    if (points.length === 0) return;

    const ctx = this.ctx;
    const cumulative = [0];
    for (let index = 1; index < points.length; index++) {
      cumulative.push(
        cumulative[index - 1]!
        + Math.hypot(
          points[index]!.x - points[index - 1]!.x,
          points[index]!.y - points[index - 1]!.y,
        ),
      );
    }
    const totalLength = cumulative.at(-1) || 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = ACCENT.gold;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (let index = 1; index < points.length; index++) {
      const progress = (
        cumulative[index - 1]! + cumulative[index]!
      ) / (2 * totalLength);
      ctx.globalAlpha = 0.22 * (1 - progress) ** 1.35 + 0.01;
      ctx.beginPath();
      ctx.moveTo(points[index - 1]!.x, points[index - 1]!.y);
      ctx.lineTo(points[index]!.x, points[index]!.y);
      ctx.stroke();
    }

    for (const [index, point] of points.entries()) {
      const progress = cumulative[index]! / totalLength;
      ctx.globalAlpha = 0.62 * (1 - progress) ** 1.5 + 0.015;
      ctx.fillStyle = ACCENT.gold;
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 0 ? 1.8 : 1.45, 0, Math.PI * 2);
      ctx.fill();
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
   * Future weapons add one exhaustive profile entry while this pipeline stays centralized.
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
      const grow = t < GROW ? t / GROW : 1;
      const r = b.visual.reachRadius * grow;
      if (r > 0) {
        // Full opacity while growing, then ease the fade across the long tail.
        const fade = t < GROW ? 1 : 1 - (t - GROW) / (1 - GROW);
        const base = b.rgb;   // parsed once at spawn (see consumeExplosion)
        const core = b.core;  // white-hot center, derived once at spawn
        const grad = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r);
        grad.addColorStop(0, `rgba(${core[0] | 0}, ${core[1] | 0}, ${core[2] | 0}, ${fade})`);
        const coreStop = b.visual.reachRadius > 0
          ? b.visual.coreRadius / b.visual.reachRadius
          : 0;
        grad.addColorStop(coreStop, `rgba(${core[0] | 0}, ${core[1] | 0}, ${core[2] | 0}, ${fade * 0.96})`);
        grad.addColorStop(0.68, `rgba(${base[0] | 0}, ${base[1] | 0}, ${base[2] | 0}, ${fade * 0.92})`);
        grad.addColorStop(1, `rgba(${base[0] | 0}, ${base[1] | 0}, ${base[2] | 0}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (b.visual.family === 'earth' || b.visual.family === 'incendiary') {
          ctx.ellipse(
            b.cx,
            b.cy,
            r,
            r * b.visual.verticalScale,
            0,
            0,
            Math.PI * 2,
          );
        } else {
          ctx.arc(b.cx, b.cy, r, 0, Math.PI * 2);
        }
        ctx.fill();

        let authoredDrawn = false;
        if (b.authored) {
          authoredDrawn = this.explosionArt?.draw(
            ctx,
            b.cx,
            b.cy,
            r,
            t,
          ) ?? false;
          // Lock the whole burst to one visual family after a paint failure.
          // This avoids a procedural/authored flicker if the context recovers.
          if (!authoredDrawn) b.authored = false;
        }
        if (!authoredDrawn) this.drawExplosionSignature(b, r, grow, fade);
      }
      b.age++;
    }
    ctx.restore();

    // Drop bursts that have outlived their own (per-event) lifetime.
    this.bursts = this.bursts.filter((b) => b.age < b.lifeFrames);
  }

  /** Draw weapon-family detail strictly inside the shared style-aware reach. */
  private drawExplosionSignature(
    b: Burst,
    reach: number,
    grow: number,
    fade: number,
  ): void {
    const ctx = this.ctx;
    const { visual, rgb: base, core } = b;
    const detailRadius = visual.detailRadius * grow;
    const hot = `rgba(${core[0] | 0}, ${core[1] | 0}, ${core[2] | 0}, ${fade})`;
    const accent = `rgba(${base[0] | 0}, ${base[1] | 0}, ${base[2] | 0}, ${fade * 0.9})`;

    if (visual.family === 'conventional') {
      // Pixel shrapnel retains the original readable Scorched-Earth baseline.
      ctx.fillStyle = hot;
      const pad = Math.SQRT2 * 1.5;
      const d = Math.max(0, Math.min(detailRadius, reach - pad));
      for (let i = 0; i < visual.detailCount; i++) {
        const a = (i / visual.detailCount) * Math.PI * 2;
        const jagged = 0.72 + 0.28 * (((i * 7) % visual.detailCount) / visual.detailCount);
        const px = b.cx + Math.cos(a) * d * jagged;
        const py = b.cy + Math.sin(a) * d * jagged;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      return;
    }

    if (visual.family === 'nuclear') {
      // Contained thermal rings around the white-hot core.
      const incomingAlpha = ctx.globalAlpha;
      ctx.strokeStyle = hot;
      ctx.lineWidth = Math.max(1.5, Math.min(3, reach * 0.035));
      for (let i = 1; i <= visual.detailCount; i++) {
        ctx.globalAlpha = incomingAlpha * fade * (1 - (i - 1) * 0.18);
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, detailRadius * (i / visual.detailCount), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = incomingAlpha;
      return;
    }

    if (visual.family === 'earth') {
      // Uneven dust lobes: their centers plus radius stay inside reach.
      const lobeRadius = reach * 0.12;
      const centerRadius = Math.min(detailRadius, reach - lobeRadius);
      ctx.fillStyle = accent;
      for (let i = 0; i < visual.detailCount; i++) {
        const a = Math.PI + (i / Math.max(1, visual.detailCount - 1)) * Math.PI;
        const stagger = 0.72 + (i % 3) * 0.12;
        ctx.beginPath();
        ctx.arc(
          b.cx + Math.cos(a) * centerRadius * stagger,
          b.cy + Math.sin(a) * centerRadius * visual.verticalScale * stagger,
          lobeRadius,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      return;
    }

    if (visual.family === 'incendiary') {
      // A low ignition pool with contained flame tongues that hand off to drawFire().
      ctx.fillStyle = hot;
      const baseY = b.cy + reach * visual.verticalScale * 0.28;
      const count = visual.detailCount;
      for (let i = 0; i < count; i++) {
        const f = count === 1 ? 0.5 : i / (count - 1);
        const x = b.cx + (f * 2 - 1) * reach * 0.62;
        const maxHeight = Math.sqrt(Math.max(0, reach * reach - (x - b.cx) ** 2));
        const tipY = b.cy - maxHeight * (0.58 + (i % 2) * 0.18);
        const half = reach * 0.055;
        ctx.beginPath();
        ctx.moveTo(x - half, baseY);
        ctx.lineTo(x, tipY);
        ctx.lineTo(x + half, baseY);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    if (visual.family === 'scatter') {
      // One crisp pressure ring plus compact pixel fragments.
      ctx.strokeStyle = hot;
      ctx.lineWidth = Math.max(1, Math.min(2, reach * 0.04));
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, detailRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = hot;
      const pad = Math.SQRT2;
      const d = Math.max(0, Math.min(detailRadius * 0.88, reach - pad));
      for (let i = 0; i < visual.detailCount; i++) {
        const a = (i / visual.detailCount) * Math.PI * 2 + 0.4;
        const px = b.cx + Math.cos(a) * d;
        const py = b.cy + Math.sin(a) * d;
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      return;
    }

    if (visual.family === 'funky') {
      // Alternating full-reach and core vertices form a contained angular star.
      ctx.fillStyle = accent;
      ctx.beginPath();
      for (let i = 0; i < visual.detailCount * 2; i++) {
        const a = -Math.PI / 2 + (i / (visual.detailCount * 2)) * Math.PI * 2;
        const d = i % 2 === 0 ? reach : visual.coreRadius * grow;
        const x = b.cx + Math.cos(a) * d;
        const y = b.cy + Math.sin(a) * d;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }

    // Bouncing Betty: two hard mine rings and four contained cardinal fragments.
    ctx.strokeStyle = hot;
    ctx.lineWidth = Math.max(1, Math.min(2, reach * 0.04));
    for (const scale of [0.62, 1]) {
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, detailRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = hot;
    const size = Math.min(3, reach * 0.1);
    const d = Math.min(detailRadius * 0.78, Math.max(0, reach - Math.SQRT2 * size));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.fillRect(
        b.cx + Math.cos(a) * d - size / 2,
        b.cy + Math.sin(a) * d - size / 2,
        size,
        size,
      );
    }
  }

  /**
   * Weapon-colored local illumination plus a full-canvas headline exposure flash.
   *
   * Uses `globalCompositeOperation = 'lighter'` so it brightens whatever is already
   * on the canvas without washing it to white (additive mode clamps at white
   * naturally). The flash intensity is computed by the pure helper {@link flashIntensity}
   * (age 0 of the strongest burst) and decays quickly so it complements the
   * existing DOM bloom in main.ts rather than doubling it.
   *
   * Gated by !reduceMotion. No-op when there are no live bursts.
   */
  private drawFlash(): void {
    if (this.reduceMotion || this.bursts.length === 0) return;

    // Rank on a fresh candidate array: the authoritative burst order remains untouched.
    const localLights = this.bursts
      .map((burst) => ({
        burst,
        light: getBlastLightProfile({
          family: burst.visual.family,
          reachRadius: burst.visual.reachRadius,
          age: burst.age,
          lifeFrames: burst.lifeFrames,
        }),
      }))
      .filter(({ light }) => light.radius > 0 && light.alpha > 0)
      .sort((a, b) => (
        b.light.radius * b.light.alpha - a.light.radius * a.light.alpha
      ))
      .slice(0, MAX_LOCAL_BLAST_LIGHTS);

    // Find the burst with the largest radius among live bursts (the headline blast).
    let strongest: Burst | null = null;
    for (const b of this.bursts) {
      if (strongest === null || b.radius > strongest.radius) strongest = b;
    }
    if (!strongest) return;

    const headlineAlpha = flashIntensity(
      strongest.age,
      strongest.lifeFrames,
      strongest.radius,
    );
    if (localLights.length === 0 && headlineAlpha <= 0) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const { burst, light } of localLights) {
      const [r, g, b] = burst.rgb;
      const gradient = ctx.createRadialGradient(
        burst.cx,
        burst.cy,
        0,
        burst.cx,
        burst.cy,
        light.radius,
      );
      gradient.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 1)`);
      gradient.addColorStop(0.38, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0.52)`);
      gradient.addColorStop(1, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0)`);
      ctx.globalAlpha = light.alpha;
      ctx.fillStyle = gradient;
      ctx.fillRect(
        burst.cx - light.radius,
        burst.cy - light.radius,
        light.radius * 2,
        light.radius * 2,
      );
    }

    if (headlineAlpha > 0) {
      ctx.globalAlpha = headlineAlpha;
      // Preserve the original warm near-white whole-field exposure cue.
      ctx.fillStyle = ACCENT.sunCore;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

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

    // Pass 1: neighboring cells share bounded elliptical light pools. This
    // replaces one glow rectangle per column with at most eight gradients while
    // bathing the battlefield beneath the unchanged flames.
    if (
      state.terrain instanceof Uint8Array
      && state.terrain.length === CANVAS_WIDTH * CANVAS_HEIGHT
    ) {
      ctx.globalCompositeOperation = 'lighter';
      for (const pool of getNapalmFirelightPools(fire)) {
        const sy = surfaceFor(Math.round(pool.centerX));
        if (!Number.isFinite(sy) || sy < 0 || sy >= CANVAS_HEIGHT) continue;

        ctx.save();
        ctx.translate(pool.centerX, sy - 6);
        ctx.scale(pool.radiusX, pool.radiusY);
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        glow.addColorStop(0, 'rgba(255, 210, 63, 0.92)');
        glow.addColorStop(0.42, 'rgba(255, 90, 31, 0.58)');
        glow.addColorStop(1, 'rgba(255, 90, 31, 0)');
        ctx.globalAlpha = pool.alpha;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
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

  private drawSky(
    depth: Readonly<ImpactDepthParallax> = REST_DEPTH_PARALLAX,
  ): void {
    const ctx = this.ctx;
    if (this.skyGradient === null) {
      this.skyGradient = skyGradient(ctx, 0, CANVAS_HEIGHT);
    }

    ctx.save();
    ctx.translate(depth.far.x, depth.far.y);
    ctx.fillStyle = this.skyGradient;
    // Oversized by the composed shake + kick bound so no backdrop strip is exposed.
    const m = WORLD_TRANSLATION_MARGIN;
    ctx.fillRect(-m, -m, CANVAS_WIDTH + 2 * m, CANVAS_HEIGHT + 2 * m);
    const backdropDrawn = this.battlefieldBackdrop?.draw(ctx, m) ?? false;
    this.drawStars();
    if (!backdropDrawn) this.drawCloudBanks();
    this.drawSun();
    this.drawHorizonHaze();
    ctx.restore();

    if (!backdropDrawn) {
      ctx.save();
      ctx.translate(depth.middle.x, depth.middle.y);
      this.drawDistantRidges();
      ctx.restore();
    }
  }

  /** Pixel stars in the upper indigo band (crisp little squares). */
  private drawStars(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = ACCENT.sunCore;
    for (const [sx, sy] of STARS) ctx.fillRect(sx, sy, 2, 2);
    ctx.restore();
  }

  /** Cached cel-shaded ash shelves keep the panoramic sky dimensional at rest. */
  private drawCloudBanks(): void {
    this.atmosphereClouds.draw(this.ctx);
  }

  /** A low, soft sun glow on the horizon (partly occluded by terrain hills). */
  private drawSun(): void {
    const ctx = this.ctx;
    const cx = CANVAS_WIDTH * 0.5;
    const cy = CANVAS_HEIGHT * 0.66;
    const r = 78;
    // The sun gradient is invariant (fixed position + theme colors) but drawSky ->
    // drawSun runs every frame; cache it instead of rebuilding a CanvasGradient per
    // frame (perf-006), mirroring skyGradient.
    if (this.sunGradient === null) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, ACCENT.sunCore);
      g.addColorStop(0.5, ACCENT.sun);
      g.addColorStop(1, 'rgba(255, 122, 31, 0)');
      this.sunGradient = g;
    }
    const g = this.sunGradient;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Thin ember haze separates the sky from foreground terrain without adding noise. */
  private drawHorizonHaze(): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 252, 0, 432);
    g.addColorStop(0, 'rgba(255, 210, 63, 0)');
    g.addColorStop(0.46, 'rgba(255, 122, 31, 0.10)');
    g.addColorStop(0.72, 'rgba(142, 47, 83, 0.08)');
    g.addColorStop(1, 'rgba(22, 13, 46, 0)');

    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 252, CANVAS_WIDTH, 180);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = ACCENT.sunCore;
    ctx.lineWidth = 1;
    for (let y = 304; y <= 376; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y - 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Muted far ridgelines add depth behind the destructible foreground terrain. */
  private drawDistantRidges(): void {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = 'rgba(22, 13, 46, 0.30)';
    ctx.beginPath();
    ctx.moveTo(0, 366);
    ctx.lineTo(92, 336);
    ctx.lineTo(168, 354);
    ctx.lineTo(286, 321);
    ctx.lineTo(390, 348);
    ctx.lineTo(502, 323);
    ctx.lineTo(612, 358);
    ctx.lineTo(724, 329);
    ctx.lineTo(842, 350);
    ctx.lineTo(950, 318);
    ctx.lineTo(1064, 346);
    ctx.lineTo(1162, 322);
    ctx.lineTo(CANVAS_WIDTH, 360);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineTo(0, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 122, 31, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, 388);
    ctx.lineTo(118, 365);
    ctx.lineTo(238, 384);
    ctx.lineTo(366, 356);
    ctx.lineTo(520, 390);
    ctx.lineTo(654, 360);
    ctx.lineTo(792, 382);
    ctx.lineTo(914, 352);
    ctx.lineTo(1048, 378);
    ctx.lineTo(1188, 356);
    ctx.lineTo(CANVAS_WIDTH, 386);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineTo(0, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
