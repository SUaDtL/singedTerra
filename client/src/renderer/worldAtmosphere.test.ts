import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_WORLDS } from './BattlefieldBackdrop';
import {
  WORLD_ATMOSPHERE_ARRIVAL_FRAMES,
  WORLD_ATMOSPHERE_MAX_MARKS,
  WorldAtmosphereLayer,
  createWorldAtmosphereField,
} from './worldAtmosphere';

function paintContext(): CanvasRenderingContext2D {
  return {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
  } as unknown as CanvasRenderingContext2D;
}

function countingPaintContext(): {
  readonly ctx: CanvasRenderingContext2D;
  readonly counts: { arcs: number; fills: number; lines: number; strokes: number };
} {
  const counts = { arcs: 0, fills: 0, lines: 0, strokes: 0 };
  return {
    counts,
    ctx: {
      ...paintContext(),
      arc() { counts.arcs++; },
      lineTo() { counts.lines++; },
      fill() { counts.fills++; },
      stroke() { counts.strokes++; },
    } as unknown as CanvasRenderingContext2D,
  };
}

describe('world atmosphere field', () => {
  it('creates a stable, distinct immutable field for each selected world', () => {
    const fields = BATTLEFIELD_WORLDS.map((world) => createWorldAtmosphereField(
      world.id,
      world.atmosphere,
    ));

    expect(createWorldAtmosphereField(
      BATTLEFIELD_WORLDS[0]!.id,
      BATTLEFIELD_WORLDS[0]!.atmosphere,
    )).toEqual(fields[0]);
    expect(new Set(fields.map((field) => JSON.stringify(field))).size).toBe(3);
    for (const field of fields) {
      expect(Object.isFrozen(field)).toBe(true);
      expect(field.length).toBeGreaterThan(0);
      expect(field.length).toBeLessThanOrEqual(WORLD_ATMOSPHERE_MAX_MARKS);
      expect(field.every((mark) => Object.isFrozen(mark))).toBe(true);
    }
  });

  it('caps an oversized profile at the presentation mark budget', () => {
    const ember = BATTLEFIELD_WORLDS[0]!;

    expect(createWorldAtmosphereField(ember.id, {
      ...ember.atmosphere,
      count: WORLD_ATMOSPHERE_MAX_MARKS + 1,
    })).toHaveLength(WORLD_ATMOSPHERE_MAX_MARKS);
  });
});

describe('WorldAtmosphereLayer', () => {
  it('freezes one selected field and settles after a finite arrival flourish', () => {
    const layer = new WorldAtmosphereLayer(false);
    const [ember, obsidian] = BATTLEFIELD_WORLDS;

    layer.select(ember!);
    const originalField = layer.marks;
    layer.select(obsidian!);
    expect(layer.selectedWorldId).toBe('ember-dusk');
    expect(layer.marks).toBe(originalField);
    expect(layer.draw(paintContext())).toBe(true);

    for (let frame = 0; frame < WORLD_ATMOSPHERE_ARRIVAL_FRAMES; frame++) {
      layer.advance();
    }

    expect(layer.isActive).toBe(false);
    expect(layer.marks).toBe(originalField);
  });

  it('keeps reduced-motion atmosphere static and resettable', () => {
    const layer = new WorldAtmosphereLayer(true);
    layer.select(BATTLEFIELD_WORLDS[2]!);

    layer.advance();
    expect(layer.isActive).toBe(false);
    expect(layer.frame).toBe(0);
    expect(layer.draw(paintContext())).toBe(true);

    layer.reset();
    expect(layer.selectedWorldId).toBeNull();
    expect(layer.marks).toEqual([]);
  });

  it('paints distinct ember, ash, and crystal motifs', () => {
    const [ember, ash, crystal] = BATTLEFIELD_WORLDS;
    const emberPaint = countingPaintContext();
    const ashPaint = countingPaintContext();
    const crystalPaint = countingPaintContext();

    const emberLayer = new WorldAtmosphereLayer(false);
    emberLayer.select(ember!);
    emberLayer.draw(emberPaint.ctx);

    const ashLayer = new WorldAtmosphereLayer(false);
    ashLayer.select(ash!);
    ashLayer.draw(ashPaint.ctx);

    const crystalLayer = new WorldAtmosphereLayer(false);
    crystalLayer.select(crystal!);
    crystalLayer.draw(crystalPaint.ctx);

    expect(emberPaint.counts.arcs).toBeGreaterThan(0);
    expect(emberPaint.counts.fills).toBeGreaterThan(0);
    expect(ashPaint.counts.lines).toBeGreaterThan(0);
    expect(ashPaint.counts.fills).toBeGreaterThan(0);
    expect(crystalPaint.counts.lines).toBeGreaterThan(0);
    expect(crystalPaint.counts.strokes).toBeGreaterThan(0);
  });
});
