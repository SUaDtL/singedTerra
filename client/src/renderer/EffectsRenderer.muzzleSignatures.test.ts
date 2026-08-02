import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectsRenderer } from './EffectsRenderer';
import { getMuzzleVisualProfile, type MuzzleVisualProfile } from './muzzleVisuals';

interface FlashState {
  age: number;
  life: number;
  angle: number;
  profile: MuzzleVisualProfile;
}

interface EffectsSeam {
  muzzleFlashes: FlashState[];
  sparks: Array<{ vx: number; vy: number; color: string }>;
  smoke: unknown[];
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

interface Op {
  name: string;
  args: number[];
  fill?: unknown;
  stroke?: unknown;
  alpha?: number;
  composite?: string;
}

function context() {
  const ops: Op[] = [];
  const stack: Array<Record<string, unknown>> = [];
  const ctx = {
    fillStyle: '#caller-fill',
    strokeStyle: '#caller-stroke',
    globalAlpha: 0.64,
    globalCompositeOperation: 'source-over',
    lineWidth: 3,
    save(this: Record<string, unknown>) {
      stack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
        lineWidth: this.lineWidth,
      });
      ops.push({ name: 'save', args: [] });
    },
    restore(this: Record<string, unknown>) {
      Object.assign(this, stack.pop());
      ops.push({ name: 'restore', args: [] });
    },
    translate(...args: number[]) { ops.push({ name: 'translate', args }); },
    rotate(...args: number[]) { ops.push({ name: 'rotate', args }); },
    scale(...args: number[]) { ops.push({ name: 'scale', args }); },
    beginPath() { ops.push({ name: 'beginPath', args: [] }); },
    closePath() { ops.push({ name: 'closePath', args: [] }); },
    moveTo(...args: number[]) { ops.push({ name: 'moveTo', args }); },
    lineTo(...args: number[]) { ops.push({ name: 'lineTo', args }); },
    bezierCurveTo(...args: number[]) { ops.push({ name: 'bezierCurveTo', args }); },
    arc(...args: number[]) { ops.push({ name: 'arc', args }); },
    fillRect(this: Record<string, unknown>, ...args: number[]) {
      ops.push({
        name: 'fillRect',
        args,
        fill: this.fillStyle,
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
      });
    },
    fill(this: Record<string, unknown>) {
      ops.push({
        name: 'fill',
        args: [],
        fill: this.fillStyle,
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
      });
    },
    stroke(this: Record<string, unknown>) {
      ops.push({
        name: 'stroke',
        args: [],
        stroke: this.strokeStyle,
        alpha: this.globalAlpha as number,
        composite: this.globalCompositeOperation as string,
      });
    },
    createRadialGradient(...args: number[]) {
      const gradient = {
        addColorStop(offset: number, _color: string) {
          ops.push({ name: 'colorStop', args: [offset] });
        },
      };
      ops.push({ name: 'gradient', args, fill: gradient });
      return gradient;
    },
    strokeText() {},
    fillText() {},
    textAlign: 'start',
    textBaseline: 'alphabetic',
    font: '',
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

afterEach(() => vi.restoreAllMocks());

describe('EffectsRenderer weapon-signature muzzle flashes', () => {
  it('retains a copied bounded profile and emits profile-colored launch particles', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const renderer = new EffectsRenderer(false);
    const profile = getMuzzleVisualProfile('nuke');

    renderer.spawnMuzzle(120, 80, 45, profile);

    const seam = renderer as unknown as EffectsSeam;
    expect(seam.muzzleFlashes).toHaveLength(1);
    const flash = required(seam.muzzleFlashes[0], 'nuclear muzzle flash');
    expect(flash).toMatchObject({
      age: 0,
      life: profile.life,
      angle: -Math.PI / 4,
      profile,
    });
    expect(flash.profile).not.toBe(profile);
    expect(seam.sparks).toHaveLength(profile.sparkCount);
    expect(seam.smoke).toHaveLength(1);
  });

  it('binds exact orientation, scale, accent, and distinct family primitives to Canvas', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const renderer = new EffectsRenderer(false);
    const nuclear = getMuzzleVisualProfile('nuke');
    const flame = getMuzzleVisualProfile('hot_napalm');
    renderer.spawnMuzzle(100, 70, 30, nuclear);
    renderer.spawnMuzzle(200, 90, 120, flame);
    const { ctx, ops } = context();

    renderer.draw(ctx);

    expect(ops.filter((op) => op.name === 'translate').map((op) => op.args))
      .toEqual(expect.arrayContaining([[100, 70], [200, 90]]));
    const rotations = ops.filter((op) => op.name === 'rotate').map((op) => op.args[0]);
    expect(rotations[0]).toBeCloseTo(-Math.PI / 6);
    expect(rotations[1]).toBeCloseTo(-(2 * Math.PI) / 3);
    expect(ops.filter((op) => op.name === 'scale').map((op) => op.args))
      .toEqual(expect.arrayContaining([[nuclear.scale, nuclear.scale], [flame.scale, flame.scale]]));
    expect(ops.some((op) => op.name === 'stroke' && op.stroke === nuclear.accent)).toBe(true);
    expect(ops.some((op) => op.name === 'fill' && op.fill === flame.accent)).toBe(true);
    expect(ops.some((op) => op.name === 'arc')).toBe(true);
    expect(ops.some((op) => op.name === 'bezierCurveTo')).toBe(true);
    expect(ops.some((op) => op.composite === 'lighter')).toBe(true);
    expect(ctx.fillStyle).toBe('#caller-fill');
    expect(ctx.strokeStyle).toBe('#caller-stroke');
    expect(ctx.globalAlpha).toBe(0.64);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.lineWidth).toBe(3);
  });

  it('pins a distinguishing Canvas primitive signature for every launch motif', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const representatives = {
      needle: 'baby_missile',
      heavy: 'heavy_missile',
      nuclear: 'nuke',
      earth: 'dirt_bomb',
      mine: 'bouncing_betty',
      funky: 'funky_bomb',
      flame: 'hot_napalm',
      fan: 'deaths_head',
    } as const;
    const expected = {
      needle: [1, 2, 0, 0, 1, 2],
      heavy: [1, 2, 1, 0, 1, 2],
      nuclear: [1, 2, 0, 1, 2, 2],
      earth: [0, 0, 3, 0, 1, 1],
      mine: [2, 2, 0, 1, 2, 2],
      funky: [1, 5, 0, 0, 1, 2],
      flame: [1, 0, 0, 0, 1, 2],
      fan: [3, 3, 0, 1, 1, 1],
    } as const;

    for (const [motif, weaponType] of Object.entries(representatives)) {
      const renderer = new EffectsRenderer(false);
      renderer.spawnMuzzle(100, 80, 0, getMuzzleVisualProfile(weaponType));
      const seam = renderer as unknown as EffectsSeam;
      seam.sparks = [];
      seam.smoke = [];
      const { ctx, ops } = context();
      renderer.draw(ctx);
      const signature = [
        ops.filter((op) => op.name === 'moveTo').length,
        ops.filter((op) => op.name === 'lineTo').length,
        ops.filter((op) => op.name === 'fillRect').length,
        ops.filter((op) => op.name === 'stroke').length,
        ops.filter((op) => op.name === 'arc').length,
        ops.filter((op) => op.name === 'fill').length,
      ];
      expect(signature, motif).toEqual(expected[motif as keyof typeof expected]);
      if (motif === 'flame') {
        expect(ops.filter((op) => op.name === 'bezierCurveTo')).toHaveLength(2);
      }
      if (motif === 'fan') {
        expect(ops.filter((op) => op.name === 'moveTo')).toHaveLength(3);
      }
    }
  });

  it('causally binds representative spark count, spread, speed, and accent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    for (const weaponType of ['baby_missile', 'nuke', 'deaths_head'] as const) {
      const renderer = new EffectsRenderer(false);
      const profile = getMuzzleVisualProfile(weaponType);
      renderer.spawnMuzzle(10, 20, 0, profile);
      const sparks = (renderer as unknown as EffectsSeam).sparks;
      expect(sparks).toHaveLength(profile.sparkCount);
      const firstSpark = required(sparks[0], `first ${weaponType} spark`);
      const secondSpark = required(sparks[1], `second ${weaponType} spark`);
      expect(firstSpark.vx).toBeCloseTo(Math.cos(profile.spread) * profile.speedMax);
      expect(firstSpark.vy).toBeCloseTo(Math.sin(profile.spread) * profile.speedMax);
      expect(firstSpark.color).toBe(profile.accent);
      expect(secondSpark.color).not.toBe(profile.accent);
    }
  });

  it('ages, culls at the exact lifetime, and clears all launch state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const renderer = new EffectsRenderer(false);
    const profile = getMuzzleVisualProfile('missile');
    renderer.spawnMuzzle(20, 30, 0, profile);
    const terrain = new Uint8Array(1200 * 600);
    const seam = renderer as unknown as EffectsSeam;

    for (let i = 0; i < profile.life - 1; i++) renderer.update(terrain);
    expect(seam.muzzleFlashes).toHaveLength(1);
    renderer.update(terrain);
    expect(seam.muzzleFlashes).toHaveLength(0);

    renderer.spawnMuzzle(20, 30, 0, profile);
    renderer.clear();
    expect(seam.muzzleFlashes).toHaveLength(0);
  });

  it('suppresses flashes and particles under reduced motion', () => {
    const renderer = new EffectsRenderer(true);
    renderer.spawnMuzzle(20, 30, 0, getMuzzleVisualProfile('funky_bomb'));
    const seam = renderer as unknown as EffectsSeam;

    expect(seam.muzzleFlashes).toHaveLength(0);
    expect(seam.sparks).toHaveLength(0);
    expect(seam.smoke).toHaveLength(0);
  });
});
