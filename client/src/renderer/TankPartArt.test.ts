import { describe, expect, it, vi } from 'vitest';
import type { TankState } from '@shared/types/GameState';

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}
import {
  DEFAULT_TANK_LOADOUT,
  type TankLoadout,
} from '@shared/types/TankLoadout';
import {
  TANK_PART_ATLAS_HEIGHT,
  TANK_PART_ATLAS_WIDTH,
  TANK_PART_SLOTS,
  tankPartDefinition,
  tankBarrelMount,
} from './tankPartCatalog';
import {
  TANK_PART_LOAD_TIMEOUT_MS,
  TankPartArt,
  type TankPartCanvasFactory,
  type TankPartImageFactory,
} from './TankPartArt';

interface ControlledImage {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

function controlledImage(): ControlledImage {
  return {
    src: '',
    naturalWidth: 0,
    naturalHeight: 0,
    onload: null,
    onerror: null,
  };
}

function tank(loadout: TankLoadout = { ...DEFAULT_TANK_LOADOUT }): TankState {
  return {
    x: 240,
    y: 410,
    angle: 42,
    color: '#d65cff',
    loadout,
  } as TankState;
}

function settleValid(image: ControlledImage): void {
  image.naturalWidth = TANK_PART_ATLAS_WIDTH;
  image.naturalHeight = TANK_PART_ATLAS_HEIGHT;
  image.onload?.();
}

function canvasFactory(): {
  factory: TankPartCanvasFactory;
  canvases: HTMLCanvasElement[];
  contexts: Array<{
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    composites: string[];
  }>;
} {
  const canvases: HTMLCanvasElement[] = [];
  const contexts: Array<{
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    composites: string[];
  }> = [];
  const factory: TankPartCanvasFactory = () => {
    const composites: string[] = [];
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const context = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage,
      fillRect,
      set globalCompositeOperation(value: string) {
        composites.push(value);
      },
      set fillStyle(_value: string) {},
      set globalAlpha(_value: number) {},
    };
    contexts.push({ drawImage, fillRect, composites });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    canvases.push(canvas);
    return canvas;
  };
  return { factory, canvases, contexts };
}

describe('TankPartArt', () => {
  it('loads one base-aware atlas and leaves fallback active until ready', () => {
    const image = controlledImage();
    let assignedSrc = '';
    let handlersAttachedBeforeSrc = false;
    Object.defineProperty(image, 'src', {
      get: () => assignedSrc,
      set: (value: string) => {
        assignedSrc = value;
        handlersAttachedBeforeSrc = (
          typeof image.onload === 'function'
          && typeof image.onerror === 'function'
        );
      },
    });
    const createImage: TankPartImageFactory = () =>
      image as unknown as HTMLImageElement;
    const harness = canvasFactory();
    const art = new TankPartArt(createImage, harness.factory, '/singedTerra/');

    expect(handlersAttachedBeforeSrc).toBe(true);
    expect(assignedSrc).toBe('/singedTerra/art/tank-parts.webp');
    expect(art.state).toBe('loading');
    expect(art.isSettled).toBe(false);
    expect(art.drawStatic(
      { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
      tank(),
    )).toBe(false);
    expect(harness.canvases).toHaveLength(0);
  });

  it('caches independently addressable tinted parts and assembles static slots', () => {
    const image = controlledImage();
    const harness = canvasFactory();
    const art = new TankPartArt(
      () => image as unknown as HTMLImageElement,
      harness.factory,
      '/',
    );
    const drawImage = vi.fn();
    settleValid(image);

    expect(art.drawStatic(
      { drawImage } as unknown as CanvasRenderingContext2D,
      tank(),
    )).toBe(true);
    expect(harness.canvases).toHaveLength(3);
    expect(drawImage).toHaveBeenCalledTimes(3);
    expect(harness.contexts.every(({ drawImage: sourceDraw }) =>
      sourceDraw.mock.calls.length === 2)).toBe(true);
    expect(harness.contexts.every(({ composites }) =>
      composites.includes('destination-in'))).toBe(true);
    expect(art.cachedSlots(tank().color)).toEqual([
      'treads',
      'hull',
      'turret',
    ]);

    expect(art.drawStatic(
      { drawImage } as unknown as CanvasRenderingContext2D,
      tank(),
    )).toBe(true);
    expect(harness.canvases).toHaveLength(3);
  });

  it('renders and caches static variants at the requested direct scale', () => {
    const image = controlledImage();
    const harness = canvasFactory();
    const art = new TankPartArt(
      () => image as unknown as HTMLImageElement,
      harness.factory,
      '/',
    );
    const subject = tank();
    const drawImage = vi.fn();
    const scale = 4;
    settleValid(image);

    expect(art.drawStatic(
      { drawImage } as unknown as CanvasRenderingContext2D,
      subject,
      scale,
    )).toBe(true);

    const staticSlots = ['treads', 'hull', 'turret'] as const;
    expect(harness.canvases.map(({ width, height }) => ({ width, height })))
      .toEqual(staticSlots.map((slot) => {
        const definition = tankPartDefinition(subject.loadout!, slot);
        return {
          width: definition.width * scale,
          height: definition.height * scale,
        };
      }));
    expect(drawImage.mock.calls.map(([, x, y]) => [x, y])).toEqual(
      staticSlots.map((slot) => {
        const definition = tankPartDefinition(subject.loadout!, slot);
        return [
          subject.x + definition.offsetX * scale,
          subject.y + definition.offsetY * scale,
        ];
      }),
    );
    expect(harness.contexts.map(({ drawImage: sourceDraw }, index) =>
      required(sourceDraw.mock.calls[0], `source draw ${index}`).slice(1))).toEqual(staticSlots.map((slot) => {
      const definition = tankPartDefinition(subject.loadout!, slot);
      return [
        definition.source.x,
        definition.source.y,
        definition.source.width,
        definition.source.height,
        0,
        0,
        definition.width * scale,
        definition.height * scale,
      ];
    }));

    expect(art.drawStatic(
      { drawImage } as unknown as CanvasRenderingContext2D,
      subject,
      scale,
    )).toBe(true);
    expect(harness.canvases).toHaveLength(3);

    expect(art.drawStatic(
      { drawImage } as unknown as CanvasRenderingContext2D,
      subject,
    )).toBe(true);
    expect(harness.canvases).toHaveLength(6);
    expect(harness.canvases.slice(3).map(({ width, height }) => ({
      width,
      height,
    }))).toEqual(staticSlots.map((slot) => {
      const definition = tankPartDefinition(subject.loadout!, slot);
      return { width: definition.width, height: definition.height };
    }));
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -2])(
    'normalizes invalid render scale %s to battlefield scale one',
    (scale) => {
      const image = controlledImage();
      const harness = canvasFactory();
      const art = new TankPartArt(
        () => image as unknown as HTMLImageElement,
        harness.factory,
        '/',
      );
      const subject = tank();
      const drawImage = vi.fn();
      settleValid(image);

      expect(art.drawStatic(
        { drawImage } as unknown as CanvasRenderingContext2D,
        subject,
        scale,
      )).toBe(true);

      const definition = tankPartDefinition(subject.loadout!, 'treads');
      expect(harness.canvases[0]).toMatchObject({
        width: definition.width,
        height: definition.height,
      });
      expect(required(drawImage.mock.calls[0], 'scaled static draw').slice(1)).toEqual([
        subject.x + definition.offsetX,
        subject.y + definition.offsetY,
      ]);
      expect(art.drawStatic(
        { drawImage } as unknown as CanvasRenderingContext2D,
        subject,
      )).toBe(true);
      expect(harness.canvases).toHaveLength(3);
    },
  );

  it('rotates the authored barrel around the shared pivot and settles', () => {
    const image = controlledImage();
    const harness = canvasFactory();
    const art = new TankPartArt(
      () => image as unknown as HTMLImageElement,
      harness.factory,
      '/',
    );
    const subject = tank();
    const mount = tankBarrelMount(subject);
    const drawImage = vi.fn();
    const translate = vi.fn();
    const rotate = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate,
      rotate,
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    settleValid(image);

    expect(art.drawBarrel(ctx, subject)).toBe(true);
    expect(translate).toHaveBeenCalledWith(mount.pivot.x, mount.pivot.y);
    expect(rotate).toHaveBeenCalledWith(mount.radians);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(required(harness.contexts[0], 'barrel source context').fillRect).not.toHaveBeenCalled();
    expect(ctx.shadowColor).toBe('#10070b');
    expect(ctx.shadowBlur).toBeGreaterThan(0);
    expect(ctx.shadowBlur).toBeLessThanOrEqual(1);
    expect(art.cachedSlots(subject.color)).toEqual(['barrel']);
    expect(art.isSettled).toBe(false);
    expect(art.drawStatic(ctx, subject)).toBe(true);
    expect(art.isSettled).toBe(true);
  });

  it('scales the authored barrel bitmap and local draw offsets around its mount', () => {
    const image = controlledImage();
    const harness = canvasFactory();
    const art = new TankPartArt(
      () => image as unknown as HTMLImageElement,
      harness.factory,
      '/',
    );
    const subject = tank();
    const definition = tankPartDefinition(subject.loadout!, 'barrel');
    const mount = tankBarrelMount(subject);
    const drawImage = vi.fn();
    const translate = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate,
      rotate: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    settleValid(image);

    expect(art.drawBarrel(ctx, subject, 4)).toBe(true);
    expect(translate).toHaveBeenCalledWith(
      subject.x + (mount.pivot.x - subject.x) * 4,
      subject.y + (mount.pivot.y - subject.y) * 4,
    );
    expect(harness.canvases[0]).toMatchObject({
      width: definition.width * 4,
      height: definition.height * 4,
    });
    expect(drawImage).toHaveBeenCalledWith(
      harness.canvases[0],
      definition.offsetX * 4,
      definition.offsetY * 4,
    );
  });

  it('reads every source row from the tank mixed-slot loadout', () => {
    const image = controlledImage();
    const harness = canvasFactory();
    const art = new TankPartArt(
      () => image as unknown as HTMLImageElement,
      harness.factory,
      '/',
    );
    const subject = tank({
      treads: 'bulwark',
      hull: 'ranger',
      turret: 'foundry',
      barrel: 'ranger',
    });
    const target = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    settleValid(image);

    expect(art.drawStatic(target, subject)).toBe(true);
    expect(art.drawBarrel(target, subject)).toBe(true);
    expect(harness.contexts.map(({ drawImage }, index) =>
      required(required(drawImage.mock.calls[0], `atlas draw ${index}`)[2], `atlas y ${index}`)))
      .toEqual(TANK_PART_SLOTS.map((slot) =>
      tankPartDefinition(subject.loadout!, slot).source.y));
  });

  it.each([
    {
      name: 'network or decode error',
      settle(image: ControlledImage): void {
        image.onerror?.();
      },
    },
    {
      name: 'wrong dimensions',
      settle(image: ControlledImage): void {
        image.naturalWidth = TANK_PART_ATLAS_WIDTH / 2;
        image.naturalHeight = TANK_PART_ATLAS_HEIGHT;
        image.onload?.();
      },
    },
  ])('fails closed for $name', ({ settle }) => {
    const image = controlledImage();
    const art = new TankPartArt(
      () => image as unknown as HTMLImageElement,
      canvasFactory().factory,
      '/',
    );
    settle(image);

    expect(art.state).toBe('failed');
    expect(art.isSettled).toBe(true);
    expect(art.cachedSlots('#fff')).toEqual([]);
    expect(TANK_PART_SLOTS).toHaveLength(4);
  });

  it('times out a pending atlas and ignores a late decode', () => {
    vi.useFakeTimers();
    try {
      const image = controlledImage();
      const art = new TankPartArt(
        () => image as unknown as HTMLImageElement,
        canvasFactory().factory,
        '/',
      );

      vi.advanceTimersByTime(TANK_PART_LOAD_TIMEOUT_MS);
      expect(art.state).toBe('failed');
      settleValid(image);
      expect(art.state).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['static', 'barrel'] as const)(
    'fails and settles after a persistent %s target-context draw error',
    (target) => {
      const image = controlledImage();
      const art = new TankPartArt(
        () => image as unknown as HTMLImageElement,
        canvasFactory().factory,
        '/',
      );
      settleValid(image);
      const throwingContext = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        drawImage: vi.fn(() => {
          throw new Error('persistent target failure');
        }),
      } as unknown as CanvasRenderingContext2D;

      expect(target === 'static'
        ? art.drawStatic(throwingContext, tank())
        : art.drawBarrel(throwingContext, tank())).toBe(false);
      expect(art.state).toBe('failed');
      expect(art.isSettled).toBe(true);
    },
  );
});
