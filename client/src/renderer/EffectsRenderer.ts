import { TERRAIN, BOOM, ACCENT } from '../ui/theme';

/**
 * EffectsRenderer — transient client-only "juice": terrain debris + dust on
 * blasts, muzzle sparks on launch, and floating damage / K.O. text. PURE
 * PRESENTATION: it is fed by the Renderer from authoritative state (ExplosionEvent
 * radius/position, per-tank health deltas) and never touches `shared/` — so it
 * cannot affect deterministic hot-seat/networked lockstep. `Math.random()` is fine
 * here (only the LOOK jitters; the engine's state is the deterministic source).
 *
 * Reduced-motion: particle effects are suppressed, but damage/K.O. TEXT still
 * shows (it is informational feedback, not decoration) — just without the rise.
 */

const DEBRIS_GRAVITY = 0.32; // px/frame², visual only
const SPARK_GRAVITY = 0.12;

interface Debris { x: number; y: number; vx: number; vy: number; size: number; color: string; rot: number; vr: number; age: number; life: number; }
interface Smoke { x: number; y: number; vy: number; r: number; grow: number; alpha: number; age: number; life: number; }
interface Spark { x: number; y: number; vx: number; vy: number; color: string; age: number; life: number; }
interface FloatText { x: number; y: number; vy: number; text: string; color: string; size: number; age: number; life: number; }

export class EffectsRenderer {
  private debris: Debris[] = [];
  private smoke: Smoke[] = [];
  private sparks: Spark[] = [];
  private texts: FloatText[] = [];
  private readonly reduce: boolean;

  constructor(reduceMotion: boolean) {
    this.reduce = reduceMotion;
  }

  private rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  /** Blast ejecta: a brown debris fountain + ground dust + bright sparks. */
  spawnExplosion(cx: number, cy: number, radius: number, _color: string): void {
    if (this.reduce) return;
    const palette = [TERRAIN.top, TERRAIN.mid, TERRAIN.rim, TERRAIN.deep];
    const chunks = Math.round(Math.min(16, Math.max(5, radius / 3.5)));
    for (let i = 0; i < chunks; i++) {
      const a = this.rand(-Math.PI, 0); // upward hemisphere (screen up = -y)
      const speed = this.rand(1.5, 3 + radius * 0.05);
      this.debris.push({
        x: cx, y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - this.rand(0.5, 2), // extra upward kick
        size: this.rand(1.5, 3.5),
        color: palette[i % palette.length],
        rot: this.rand(0, Math.PI), vr: this.rand(-0.3, 0.3),
        age: 0, life: this.rand(28, 56),
      });
    }
    const sparkCount = Math.round(Math.min(20, radius / 2.5));
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
  spawnMuzzle(x: number, y: number, angleDeg: number, _color: string): void {
    if (this.reduce) return;
    const base = Math.atan2(-Math.sin((angleDeg * Math.PI) / 180), Math.cos((angleDeg * Math.PI) / 180));
    for (let i = 0; i < 8; i++) {
      const a = base + this.rand(-0.4, 0.4);
      const speed = this.rand(2.5, 5.5);
      this.sparks.push({
        x, y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        color: i % 2 ? BOOM.core : ACCENT.ember,
        age: 0, life: this.rand(6, 12),
      });
    }
    this.smoke.push({ x, y, vy: -0.25, r: 4, grow: 0.5, alpha: 0.22, age: 0, life: 26 });
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

  /** Advance every particle one frame; cull the dead. Call once per frame. */
  update(): void {
    for (const d of this.debris) { d.vy += DEBRIS_GRAVITY; d.x += d.vx; d.y += d.vy; d.rot += d.vr; d.age++; }
    for (const s of this.sparks) { s.vy += SPARK_GRAVITY; s.x += s.vx; s.y += s.vy; s.age++; }
    for (const m of this.smoke) { m.y += m.vy; m.r += m.grow; m.age++; }
    for (const t of this.texts) { t.y += t.vy; t.age++; }
    if (this.debris.length) this.debris = this.debris.filter((d) => d.age < d.life);
    if (this.sparks.length) this.sparks = this.sparks.filter((s) => s.age < s.life);
    if (this.smoke.length) this.smoke = this.smoke.filter((m) => m.age < m.life);
    if (this.texts.length) this.texts = this.texts.filter((t) => t.age < t.life);
  }

  /** Paint all live effects. Draw order: smoke → debris → sparks → text (front). */
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.debris.length && !this.smoke.length && !this.sparks.length && !this.texts.length) return;
    ctx.save();

    for (const m of this.smoke) {
      ctx.globalAlpha = m.alpha * (1 - m.age / m.life);
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
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
}
