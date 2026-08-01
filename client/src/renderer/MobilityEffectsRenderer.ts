import {
  MOBILITY_SIGNATURE_PROFILES,
  isMobilitySignatureAlive,
  mobilitySignatureProgress,
  type MobilitySignatureEvent,
  type MobilitySignatureProfile,
} from './mobilitySignatures';

interface MobilitySignatureBurst {
  readonly event: MobilitySignatureEvent;
  readonly profile: MobilitySignatureProfile;
  age: number;
}

/** Bounded, deterministic under-tank movement signatures. Presentation only. */
export class MobilityEffectsRenderer {
  private signatures: MobilitySignatureBurst[] = [];

  constructor(private readonly reduceMotion: boolean) {}

  get isActive(): boolean {
    return this.signatures.length > 0;
  }

  spawn(event: MobilitySignatureEvent): void {
    if (this.reduceMotion) return;
    this.signatures.push({
      event: { ...event },
      profile: MOBILITY_SIGNATURE_PROFILES[event.kit],
      age: 0,
    });
  }

  update(): void {
    if (this.reduceMotion) return;
    for (const signature of this.signatures) signature.age++;
    this.signatures = this.signatures.filter((signature) =>
      isMobilitySignatureAlive(signature.age, signature.profile.lifeFrames));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.reduceMotion) return;
    for (const signature of this.signatures) this.drawSignature(ctx, signature);
  }

  clear(): void {
    this.signatures.length = 0;
  }

  private drawSignature(ctx: CanvasRenderingContext2D, signature: MobilitySignatureBurst): void {
    const { event, profile } = signature;
    const progress = mobilitySignatureProgress(signature.age, profile.lifeFrames);
    const alpha = 0.52 * (1 - progress);
    const trailStart = event.x - event.direction * profile.trailLength;
    const groundY = event.y + 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = event.color;
    ctx.strokeStyle = profile.accent;

    switch (profile.motif) {
      case 'tread':
        this.drawTreads(ctx, trailStart, groundY, event.direction, profile);
        break;
      case 'stride':
        this.drawStride(ctx, trailStart, groundY, event.direction, profile);
        break;
      case 'hover':
        this.drawHover(ctx, event.x, groundY - profile.lift, event.direction, profile);
        break;
      case 'wheel':
        this.drawWheels(ctx, trailStart, groundY - profile.lift, event.direction, profile);
        break;
    }
    ctx.restore();
  }

  private drawTreads(ctx: CanvasRenderingContext2D, startX: number, y: number, direction: -1 | 1, profile: MobilitySignatureProfile): void {
    for (let mark = 0; mark < profile.markCount; mark++) {
      const x = startX + direction * mark * 5;
      ctx.fillRect(x - 2, y, 4, 2);
      ctx.strokeRect(x - 2, y, 4, 2);
    }
  }

  private drawStride(ctx: CanvasRenderingContext2D, startX: number, y: number, direction: -1 | 1, profile: MobilitySignatureProfile): void {
    for (let mark = 0; mark < profile.markCount; mark++) {
      const x = startX + direction * mark * 6;
      ctx.fillRect(x - 3, y - profile.lift / 3, 3, 2);
      ctx.fillRect(x + 1, y + profile.lift / 3, 3, 2);
      ctx.strokeRect(x - 3, y - profile.lift / 3, 3, 2);
      ctx.strokeRect(x + 1, y + profile.lift / 3, 3, 2);
    }
  }

  private drawHover(ctx: CanvasRenderingContext2D, x: number, y: number, direction: -1 | 1, profile: MobilitySignatureProfile): void {
    ctx.beginPath();
    ctx.arc(x - direction * profile.trailLength / 3, y, profile.lift, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + profile.lift / 2);
    ctx.lineTo(x - direction * profile.trailLength, y + profile.lift / 2);
    ctx.stroke();
  }

  private drawWheels(ctx: CanvasRenderingContext2D, startX: number, y: number, direction: -1 | 1, profile: MobilitySignatureProfile): void {
    for (let mark = 0; mark < profile.markCount; mark++) {
      const x = startX + direction * mark * 7;
      ctx.fillRect(x - 1, y - 1, 2, 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - direction * 2, y + 3);
      ctx.lineTo(x - direction * 6, y + 5);
      ctx.stroke();
    }
  }
}
