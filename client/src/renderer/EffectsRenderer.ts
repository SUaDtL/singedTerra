import { TERRAIN, BOOM, ACCENT } from '../ui/theme';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/engine/Terrain';
import { advanceDebris, type DebrisMotion } from './debrisMotion';
import type { MuzzleVisualProfile } from './muzzleVisuals';
import { getArmorHitVisualProfile } from './armorHitVisuals';
import type { ExplosionImpactType } from '@shared/types/GameState';

/**
 * EffectsRenderer — transient client-only "juice": terrain debris + dust on
 * blasts, muzzle sparks on launch, and floating damage / K.O. text. PURE
 * PRESENTATION: it is fed by the Renderer from authoritative state (ExplosionEvent
 * radius/position, per-tank health deltas, read-only terrain bitmap). It never
 * mutates shared state, so it cannot affect deterministic hot-seat/networked
 * lockstep. `Math.random()` is fine
 * here (only the LOOK jitters; the engine's state is the deterministic source).
 *
 * Reduced-motion: particle effects are suppressed, but damage/K.O. TEXT still
 * shows (it is informational feedback, not decoration) — just without the rise.
 */

const DEBRIS_GRAVITY = 0.32; // px/frame², visual only
const SPARK_GRAVITY = 0.12;

interface Debris extends DebrisMotion { color: string; age: number; life: number; }
interface Smoke { x: number; y: number; vy: number; r: number; grow: number; alpha: number; age: number; life: number; }
interface Spark { x: number; y: number; vx: number; vy: number; color: string; age: number; life: number; }
interface FloatText { x: number; y: number; vy: number; text: string; color: string; size: number; age: number; life: number; }
interface ShieldImpact { x: number; y: number; strength: number; age: number; life: number; }
interface ArmorHit {
  tankId: string;
  x: number;
  y: number;
  color: string;
  strength: number;
  radius: number;
  age: number;
  life: number;
}
interface MuzzleFlash {
  x: number;
  y: number;
  angle: number;
  profile: MuzzleVisualProfile;
  age: number;
  life: number;
}

export class EffectsRenderer {
  private debris: Debris[] = [];
  private smoke: Smoke[] = [];
  private sparks: Spark[] = [];
  private texts: FloatText[] = [];
  private shieldImpacts: ShieldImpact[] = [];
  private armorHits: ArmorHit[] = [];
  private muzzleFlashes: MuzzleFlash[] = [];
  private readonly reduce: boolean;

  constructor(reduceMotion: boolean) {
    this.reduce = reduceMotion;
  }

  /** Drop ALL transient particles immediately — called on a game reset so the next
   *  game starts with a clean field (no debris/smoke/sparks/damage-text carried over
   *  from the previous game on the page-singleton renderer). */
  clear(): void {
    this.debris.length = 0;
    this.smoke.length = 0;
    this.sparks.length = 0;
    this.texts.length = 0;
    this.shieldImpacts.length = 0;
    this.armorHits.length = 0;
    this.muzzleFlashes.length = 0;
  }

  private rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  /** Blast ejecta whose material follows the authoritative collision surface. */
  spawnExplosion(
    cx: number,
    cy: number,
    radius: number,
    color: string,
    impactType?: ExplosionImpactType,
  ): void {
    if (impactType === 'tank') {
      this.texts.push({
        x: cx,
        y: cy - Math.min(18, radius * 0.35),
        vy: this.reduce ? 0 : -0.4,
        text: 'DIRECT HIT',
        color: BOOM.core,
        size: 13 + Math.min(5, radius * 0.06),
        age: 0,
        life: 42,
      });
    }
    if (this.reduce) return;
    const armor = impactType === 'tank';
    const palette = armor
      ? ['#f1eadc', '#aca79d', '#746f67', color]
      : [TERRAIN.top, TERRAIN.mid, TERRAIN.rim, TERRAIN.deep];
    const chunks = armor
      ? Math.round(Math.min(8, Math.max(3, radius / 7)))
      : Math.round(Math.min(16, Math.max(5, radius / 3.5)));
    for (let i = 0; i < chunks; i++) {
      const a = this.rand(-Math.PI, 0); // upward hemisphere (screen up = -y)
      const speed = this.rand(1.5, 3 + radius * 0.05);
      this.debris.push({
        x: cx, y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - this.rand(0.5, 2), // extra upward kick
        size: armor ? this.rand(1, 2.5) : this.rand(1.5, 3.5),
        color: palette[i % palette.length] ?? color,
        rot: this.rand(0, Math.PI), vr: this.rand(-0.3, 0.3),
        landed: false,
        age: 0, life: this.rand(28, 56),
      });
    }
    const sparkCount = armor
      ? Math.round(Math.min(22, Math.max(8, radius / 2)))
      : Math.round(Math.min(20, radius / 2.5));
    for (let i = 0; i < sparkCount; i++) {
      const a = this.rand(0, Math.PI * 2);
      const speed = this.rand(2, 5);
      this.sparks.push({
        x: cx, y: cy,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 1,
        color: i % 2 ? BOOM.core : ACCENT.gold,
        age: 0, life: this.rand(8, 16),
      });
    }
    const puffs = Math.round(this.rand(2, 4));
    for (let i = 0; i < puffs; i++) {
      this.smoke.push({
        x: cx + this.rand(-radius * 0.4, radius * 0.4),
        y: cy - this.rand(0, radius * 0.3),
        vy: -this.rand(0.2, 0.5), r: radius * 0.3, grow: this.rand(0.3, 0.6),
        alpha: this.rand(0.16, 0.28), age: 0, life: this.rand(36, 70),
      });
    }
  }

  /** A short cone of sparks + a wisp of smoke at the barrel tip on firing. */
  spawnMuzzle(
    x: number,
    y: number,
    angleDeg: number,
    profile: Readonly<MuzzleVisualProfile>,
  ): void {
    if (this.reduce) return;
    const base = Math.atan2(
      -Math.sin((angleDeg * Math.PI) / 180),
      Math.cos((angleDeg * Math.PI) / 180),
    );
    const flashProfile = { ...profile };
    this.muzzleFlashes.push({
      x,
      y,
      angle: base,
      profile: flashProfile,
      age: 0,
      life: flashProfile.life,
    });
    for (let i = 0; i < profile.sparkCount; i++) {
      const a = base + this.rand(-profile.spread, profile.spread);
      const speed = this.rand(profile.speedMin, profile.speedMax);
      this.sparks.push({
        x, y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        color: i % 2 ? BOOM.core : profile.accent,
        age: 0, life: this.rand(6, 12),
      });
    }
    this.smoke.push({
      x,
      y,
      vy: -0.25,
      r: 3.5 * profile.scale,
      grow: 0.42,
      alpha: 0.18,
      age: 0,
      life: 22 + profile.life,
    });
  }

  /** A rising "-NN" above a struck tank (always shown; rise suppressed on reduce). */
  spawnDamage(x: number, y: number, amount: number, color = BOOM.core): void {
    const n = Math.round(amount);
    if (n <= 0) return;
    this.texts.push({
      x, y, vy: this.reduce ? 0 : -0.55, text: `-${n}`, color,
      size: 13 + Math.min(10, n * 0.12), age: 0, life: 52,
    });
  }

  /**
   * Make a surviving tank's authoritative health loss read on the chassis itself.
   * Repeated ticks refresh one per-tank flash without spawning another spark fan.
   */
  spawnArmorHit(
    tankId: string,
    x: number,
    y: number,
    amount: number,
    color: string,
  ): void {
    if (
      this.reduce
      || tankId.length === 0
      || !Number.isFinite(x)
      || !Number.isFinite(y)
      || color.length === 0
    ) return;
    const profile = getArmorHitVisualProfile(amount);
    if (profile === null) return;

    const existing = this.armorHits.find((hit) => hit.tankId === tankId);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.color = color;
      existing.strength = Math.max(existing.strength, profile.strength);
      existing.radius = Math.max(existing.radius, profile.radius);
      // Renderer advances effects before drawing them. Start one step before
      // age zero so the spawn frame is painted at full strength and `life`
      // remains the number of rendered frames, not update calls.
      existing.age = -1;
      existing.life = profile.life;
      return;
    }

    this.armorHits.push({
      tankId,
      x,
      y,
      color,
      strength: profile.strength,
      radius: profile.radius,
      age: -1,
      life: profile.life,
    });
    for (let i = 0; i < profile.sparkCount; i++) {
      const angle = this.rand(0, Math.PI * 2);
      const speed = this.rand(1.6, 3.4 + profile.strength);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.35,
        color: i % 3 === 0 ? color : i % 3 === 1 ? BOOM.core : ACCENT.gold,
        age: 0,
        life: this.rand(8, 14),
      });
    }
  }

  /**
   * Make authoritative shield-pool loss visible without creating synchronized FX
   * state. The numeric readout remains under reduced motion; moving rings/facets do not.
   */
  spawnShieldImpact(x: number, y: number, amount: number): void {
    const blocked = Math.round(amount);
    if (blocked <= 0) return;
    this.texts.push({
      x,
      y: y - 24,
      vy: this.reduce ? 0 : -0.45,
      text: `BLOCK ${blocked}`,
      color: '#7ad7ff',
      size: 12 + Math.min(7, blocked * 0.05),
      age: 0,
      life: 48,
    });
    if (this.reduce) return;
    this.shieldImpacts.push({
      x,
      y,
      strength: Math.min(1, Math.max(0.25, amount / 120)),
      age: 0,
      life: 28,
    });
  }

  /** A gold "K.O." flourish + spark burst when a tank dies. */
  spawnKill(x: number, y: number): void {
    this.texts.push({ x, y: y - 14, vy: this.reduce ? 0 : -0.4, text: 'K.O.', color: ACCENT.gold, size: 18, age: 0, life: 64 });
    if (this.reduce) return;
    for (let i = 0; i < 14; i++) {
      const a = this.rand(0, Math.PI * 2);
      const speed = this.rand(2, 5);
      this.sparks.push({ x, y: y - 10, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 1, color: i % 2 ? ACCENT.gold : BOOM.core, age: 0, life: this.rand(10, 20) });
    }
  }

  /**
   * Turret-pop + wreck debris burst on the alive→dead transition.
   *
   * Spawns a tight upward debris fountain (barrel/turret chunk colors) and a
   * wider smoke billow to read as the turret blowing off. The K.O. text +
   * sparkle burst from spawnKill() should be called alongside this.
   *
   * Reduced-motion: debris/smoke suppressed; only text (from spawnKill) shows.
   */
  spawnWreck(x: number, y: number, tankColor: string): void {
    if (this.reduce) return;
    // Turret chunks — tight upward cone, in the tank's own color plus dark metal.
    for (let i = 0; i < 8; i++) {
      const a = this.rand(-Math.PI * 0.85, -Math.PI * 0.15); // upper hemisphere
      const speed = this.rand(3, 7);
      this.debris.push({
        x, y: y - 10,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - this.rand(1, 3),
        size: this.rand(2.5, 5),
        color: i % 3 === 0 ? tankColor : i % 3 === 1 ? TERRAIN.deep : '#3a2a18',
        rot: this.rand(0, Math.PI), vr: this.rand(-0.5, 0.5),
        landed: false,
        age: 0, life: this.rand(40, 70),
      });
    }
    // Wide smoke billow for the blast-off.
    for (let i = 0; i < 3; i++) {
      this.smoke.push({
        x: x + this.rand(-8, 8),
        y: y - this.rand(4, 14),
        vy: -this.rand(0.4, 0.9),
        r: this.rand(6, 10),
        grow: this.rand(0.5, 1.2),
        alpha: this.rand(0.22, 0.38),
        age: 0, life: this.rand(40, 60),
      });
    }
  }

  /**
   * Emit a single wispy smoke puff above a low-HP tank (continuous damage smoke).
   *
   * Throttle call frequency at the Renderer level — this emits ONE puff per
   * call. Suppressed when reduceMotion is set (the caller must gate it).
   *
   * @param x  Tank center x.
   * @param y  Tank surface y (canvas y grows down; smoke rises above this).
   */
  emitDamageSmoke(x: number, y: number): void {
    if (this.reduce) return;
    // A thin, dark wisp — lighter than the explosion smoke so it reads as
    // simmering heat rather than a full-on blast cloud.
    this.smoke.push({
      x: x + this.rand(-4, 4),
      y: y - 14,            // start above the turret
      vy: -this.rand(0.3, 0.65),
      r: this.rand(2.5, 4.5),
      grow: this.rand(0.15, 0.35),
      alpha: this.rand(0.10, 0.18),
      age: 0, life: this.rand(28, 44),
    });
  }

  /** Advance every particle one frame; cull the dead. Call once per frame. */
  update(terrain: Uint8Array): void {
    const field = { bitmap: terrain, width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    for (const d of this.debris) {
      Object.assign(d, advanceDebris(d, field, DEBRIS_GRAVITY));
      d.age++;
    }
    for (const s of this.sparks) { s.vy += SPARK_GRAVITY; s.x += s.vx; s.y += s.vy; s.age++; }
    for (const m of this.smoke) { m.y += m.vy; m.r += m.grow; m.age++; }
    for (const t of this.texts) { t.y += t.vy; t.age++; }
    for (const impact of this.shieldImpacts) impact.age++;
    for (const hit of this.armorHits) hit.age++;
    for (const f of this.muzzleFlashes) f.age++;
    if (this.debris.length) this.debris = this.debris.filter((d) => d.age < d.life);
    if (this.sparks.length) this.sparks = this.sparks.filter((s) => s.age < s.life);
    if (this.smoke.length) this.smoke = this.smoke.filter((m) => m.age < m.life);
    if (this.texts.length) this.texts = this.texts.filter((t) => t.age < t.life);
    if (this.shieldImpacts.length) {
      this.shieldImpacts = this.shieldImpacts.filter((impact) => impact.age < impact.life);
    }
    if (this.armorHits.length) {
      this.armorHits = this.armorHits.filter((hit) => hit.age < hit.life);
    }
    if (this.muzzleFlashes.length) {
      this.muzzleFlashes = this.muzzleFlashes.filter((f) => f.age < f.life);
    }
  }

  /** Paint all live effects. Draw order: smoke → debris → sparks → text (front). */
  draw(ctx: CanvasRenderingContext2D): void {
    if (
      !this.debris.length
      && !this.smoke.length
      && !this.sparks.length
      && !this.texts.length
      && !this.shieldImpacts.length
      && !this.armorHits.length
      && !this.muzzleFlashes.length
    ) return;
    ctx.save();

    for (const m of this.smoke) {
      ctx.globalAlpha = m.alpha * (1 - m.age / m.life);
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const impact of this.shieldImpacts) this.drawShieldImpact(ctx, impact);
    ctx.globalAlpha = 1;

    for (const hit of this.armorHits) this.drawArmorHit(ctx, hit);
    ctx.globalAlpha = 1;

    for (const flash of this.muzzleFlashes) this.drawMuzzleFlash(ctx, flash);
    ctx.globalAlpha = 1;

    for (const d of this.debris) {
      const t = d.age / d.life;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    for (const s of this.sparks) {
      ctx.globalAlpha = 1 - s.age / s.life;
      ctx.fillStyle = s.color;
      ctx.fillRect((s.x - 1) | 0, (s.y - 1) | 0, 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const p = t.age / t.life;
      ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.font = `700 ${t.size | 0}px 'Trebuchet MS', system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawArmorHit(ctx: CanvasRenderingContext2D, hit: ArmorHit): void {
    const progress = Math.max(0, hit.age) / hit.life;
    const fade = (1 - progress) ** 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * (0.5 + hit.strength * 0.42);

    const glow = ctx.createRadialGradient(
      hit.x,
      hit.y,
      0,
      hit.x,
      hit.y,
      hit.radius,
    );
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    glow.addColorStop(0.38, hit.color);
    glow.addColorStop(1, 'rgba(255, 170, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hit.x, hit.y, hit.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = fade * (0.4 + hit.strength * 0.4);
    ctx.strokeStyle = '#ffe2a0';
    ctx.lineWidth = 1 + hit.strength * 1.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = 0.35 + i * 2.1 + progress * 0.4;
      const inner = hit.radius * 0.36;
      const outer = hit.radius * (0.72 + hit.strength * 0.1);
      ctx.moveTo(
        hit.x + Math.cos(angle) * inner,
        hit.y + Math.sin(angle) * inner,
      );
      ctx.lineTo(
        hit.x + Math.cos(angle) * outer,
        hit.y + Math.sin(angle) * outer,
      );
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawShieldImpact(ctx: CanvasRenderingContext2D, impact: ShieldImpact): void {
    const progress = impact.age / impact.life;
    const fade = 1 - progress;
    const outerRadius = 24 + progress * 18;
    const innerRadius = 18 + progress * 10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#7ad7ff';
    ctx.globalAlpha = fade * (0.42 + impact.strength * 0.5);
    ctx.lineWidth = 1 + impact.strength * 2;

    ctx.beginPath();
    ctx.arc(impact.x, impact.y, outerRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha *= 0.58;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, innerRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = fade * (0.34 + impact.strength * 0.36);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + progress * 0.32;
      const start = outerRadius + 2;
      const end = start + 4 + impact.strength * 4;
      ctx.moveTo(
        impact.x + Math.cos(angle) * start,
        impact.y + Math.sin(angle) * start,
      );
      ctx.lineTo(
        impact.x + Math.cos(angle) * end,
        impact.y + Math.sin(angle) * end,
      );
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawMuzzleFlash(ctx: CanvasRenderingContext2D, flash: MuzzleFlash): void {
    const { profile } = flash;
    const fade = 1 - flash.age / flash.life;
    ctx.save();
    ctx.translate(flash.x, flash.y);
    ctx.rotate(flash.angle);
    ctx.scale(profile.scale, profile.scale);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade;

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
    glow.addColorStop(0, 'rgba(255, 246, 196, 0.92)');
    glow.addColorStop(0.34, profile.accent);
    glow.addColorStop(1, 'rgba(255, 122, 31, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = profile.accent;
    ctx.strokeStyle = profile.accent;
    ctx.lineWidth = 1.5;
    switch (profile.motif) {
      case 'needle':
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        ctx.lineTo(20, 0);
        ctx.lineTo(-2, 2);
        ctx.closePath();
        ctx.fill();
        break;
      case 'heavy':
        ctx.beginPath();
        ctx.moveTo(-3, -4);
        ctx.lineTo(24, 0);
        ctx.lineTo(-3, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-1, -1.5, 15, 3);
        break;
      case 'nuclear':
        ctx.beginPath();
        ctx.moveTo(-3, -4);
        ctx.lineTo(22, 0);
        ctx.lineTo(-3, 4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'earth':
        ctx.fillRect(0, -4, 8, 8);
        ctx.fillRect(8, -2.5, 7, 5);
        ctx.fillRect(15, -1.5, 5, 3);
        break;
      case 'mine':
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(18, 0);
        ctx.moveTo(3, -6);
        ctx.lineTo(3, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(3, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'funky':
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(5, -7);
        ctx.lineTo(10, -2);
        ctx.lineTo(22, 0);
        ctx.lineTo(10, 2);
        ctx.lineTo(5, 7);
        ctx.closePath();
        ctx.fill();
        break;
      case 'flame':
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.bezierCurveTo(5, -7, 15, -5, 23, 0);
        ctx.bezierCurveTo(15, 5, 5, 7, -3, 0);
        ctx.closePath();
        ctx.fill();
        break;
      case 'fan':
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.lineTo(21, -7);
        ctx.moveTo(-2, 0);
        ctx.lineTo(24, 0);
        ctx.moveTo(-2, 0);
        ctx.lineTo(21, 7);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }
}
