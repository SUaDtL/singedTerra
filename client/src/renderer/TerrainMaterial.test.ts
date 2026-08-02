import { describe, expect, it, vi } from 'vitest';
import {
  TERRAIN_MATERIAL_ASSET,
  TERRAIN_MATERIAL_LOAD_TIMEOUT_MS,
  TerrainMaterial,
  type TerrainMaterialCanvasFactory,
  type TerrainMaterialImageFactory,
} from './TerrainMaterial';

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

function texturePixels(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 128;
    pixels[offset + 1] = 128;
    pixels[offset + 2] = 128;
    pixels[offset + 3] = 255;
  }
  pixels.set([255, 255, 255, 255], 0);
  pixels.set([0, 0, 0, 255], 4);
  pixels.set([32, 32, 32, 255], (256 * 256 - 1) * 4);
  return pixels;
}

describe('TerrainMaterial', () => {
  it('allocates nothing until one selected asset is requested', () => {
    const image = controlledImage();
    let allocations = 0;
    let assignedSrc = '';
    Object.defineProperty(image, 'src', {
      get: () => assignedSrc,
      set: (value: string) => {
        assignedSrc = value;
      },
    });
    const material = new TerrainMaterial(
      () => {
        allocations++;
        return image as unknown as HTMLImageElement;
      },
      vi.fn(),
      '/singedTerra/',
    );

    expect(allocations).toBe(0);
    expect(material.state).toBe('idle');

    material.select('art/terrain-material-glassstorm-expanse.webp');
    material.select('art/terrain-material.webp');

    expect(allocations).toBe(1);
    expect(assignedSrc).toBe(
      '/singedTerra/art/terrain-material-glassstorm-expanse.webp',
    );
  });

  it('retires stale callbacks across reset and a fresh selection', () => {
    const images = [controlledImage(), controlledImage()];
    const createCanvas = vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: texturePixels() }),
      }),
    }) as unknown as HTMLCanvasElement);
    const material = new TerrainMaterial(
      () => images.shift() as unknown as HTMLImageElement,
      createCanvas,
      '/',
    );
    const first = images[0]!;
    material.select('art/terrain-material.webp');
    material.reset();
    const second = images[0]!;
    material.select('art/terrain-material-obsidian-caldera.webp');

    first.naturalWidth = 256;
    first.naturalHeight = 256;
    first.onload?.();

    expect(material.state).toBe('loading');
    expect(createCanvas).not.toHaveBeenCalled();

    second.naturalWidth = 256;
    second.naturalHeight = 256;
    second.onload?.();

    expect(material.state).toBe('ready');
    expect(createCanvas).toHaveBeenCalledOnce();
  });

  it('ignores retired load and error handlers for a reused image object (kills the generation-token guard)', () => {
    const image = controlledImage();
    const createCanvas = vi.fn();
    const material = new TerrainMaterial(
      () => image as unknown as HTMLImageElement,
      createCanvas,
      '/',
    );

    material.select('art/terrain-material.webp');
    const retiredLoad = image.onload;
    const retiredError = image.onerror;
    material.reset();
    material.select('art/terrain-material-obsidian-caldera.webp');

    retiredLoad?.();
    retiredError?.();

    expect(material.state).toBe('loading');
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('cancels a retired timeout before it can affect the new generation (kills timeout cleanup)', () => {
    vi.useFakeTimers();
    try {
      const images = [controlledImage(), controlledImage()];
      const clearTimeout = vi.spyOn(globalThis, 'clearTimeout');
      const material = new TerrainMaterial(
        () => images.shift() as unknown as HTMLImageElement,
        vi.fn(),
        '/',
      );

      material.select('art/terrain-material.webp');
      vi.advanceTimersByTime(1);
      material.reset();
      material.select('art/terrain-material-obsidian-caldera.webp');
      vi.advanceTimersByTime(TERRAIN_MATERIAL_LOAD_TIMEOUT_MS - 1);

      expect(clearTimeout).toHaveBeenCalled();
      expect(material.state).toBe('loading');
      material.reset();
      clearTimeout.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('decodes once, resolves through the Vite base, and wraps samples', () => {
    const image = controlledImage();
    const pixels = texturePixels();
    const drawImage = vi.fn();
    const getImageData = vi.fn(() => ({ data: pixels }));
    let imageAllocations = 0;
    let canvasAllocations = 0;
    let handlersAttachedBeforeSrc = false;
    let assignedSrc = '';
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
    const createImage: TerrainMaterialImageFactory = () => {
      imageAllocations++;
      return image as unknown as HTMLImageElement;
    };
    const createCanvas: TerrainMaterialCanvasFactory = () => {
      canvasAllocations++;
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, getImageData }),
      } as unknown as HTMLCanvasElement;
    };
    const material = new TerrainMaterial(
      createImage,
      createCanvas,
      '/singedTerra/',
    );
    material.select(TERRAIN_MATERIAL_ASSET);

    expect(imageAllocations).toBe(1);
    expect(canvasAllocations).toBe(0);
    expect(handlersAttachedBeforeSrc).toBe(true);
    expect(assignedSrc).toBe('/singedTerra/art/terrain-material.webp');
    expect(material.state).toBe('loading');
    expect(material.isSettled).toBe(false);
    expect(material.needsApplication).toBe(false);
    expect(material.sample(0, 0)).toBe(0);

    image.naturalWidth = 256;
    image.naturalHeight = 256;
    image.onload?.();

    expect(canvasAllocations).toBe(1);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 256, 256);
    expect(getImageData).toHaveBeenCalledWith(0, 0, 256, 256);
    expect(material.state).toBe('ready');
    expect(material.needsApplication).toBe(true);
    expect(material.isSettled).toBe(false);
    expect(material.sample(0, 0)).toBeCloseTo(1, 4);
    expect(material.sample(256, 256)).toBeCloseTo(1, 4);
    expect(material.sample(1, 0)).toBeCloseTo(-1, 4);
    expect(material.sample(-1, -1)).toBeLessThan(-0.7);
    expect(material.sample(27, 42)).toBeGreaterThanOrEqual(-1);
    expect(material.sample(27, 42)).toBeLessThanOrEqual(1);

    material.acknowledgeApplied();

    expect(material.needsApplication).toBe(false);
    expect(material.isSettled).toBe(true);
  });

  it.each([
    {
      name: 'network or decode failure',
      settle(image: ControlledImage): void {
        image.onerror?.();
      },
    },
    {
      name: 'wrong dimensions',
      settle(image: ControlledImage): void {
        image.naturalWidth = 512;
        image.naturalHeight = 256;
        image.onload?.();
      },
    },
  ])('fails closed for $name', ({ settle }) => {
    const image = controlledImage();
    const createImage: TerrainMaterialImageFactory = () =>
      image as unknown as HTMLImageElement;
    const createCanvas = vi.fn();
    const material = new TerrainMaterial(createImage, createCanvas, '/');
    material.select(TERRAIN_MATERIAL_ASSET);

    settle(image);

    expect(material.state).toBe('failed');
    expect(material.isSettled).toBe(true);
    expect(material.needsApplication).toBe(false);
    expect(material.sample(0, 0)).toBe(0);
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('fails closed when decoded pixels cannot be read', () => {
    const image = controlledImage();
    const material = new TerrainMaterial(
      () => image as unknown as HTMLImageElement,
      () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: () => {
            throw new Error('tainted');
          },
        }),
      }) as unknown as HTMLCanvasElement,
      '/',
    );
    material.select(TERRAIN_MATERIAL_ASSET);

    image.naturalWidth = 256;
    image.naturalHeight = 256;
    image.onload?.();

    expect(material.state).toBe('failed');
    expect(material.isSettled).toBe(true);
    expect(material.sample(0, 0)).toBe(0);
  });

  it('fails closed when a decode canvas has no 2D context', () => {
    const image = controlledImage();
    const material = new TerrainMaterial(
      () => image as unknown as HTMLImageElement,
      () => ({
        width: 0,
        height: 0,
        getContext: () => null,
      }) as unknown as HTMLCanvasElement,
      '/',
    );
    material.select(TERRAIN_MATERIAL_ASSET);

    image.naturalWidth = 256;
    image.naturalHeight = 256;
    image.onload?.();

    expect(material.state).toBe('failed');
    expect(material.isSettled).toBe(true);
    expect(material.sample(0, 0)).toBe(0);
  });

  it('times out a pending load and ignores a late decode', () => {
    vi.useFakeTimers();
    try {
      const image = controlledImage();
      const createCanvas = vi.fn();
      const material = new TerrainMaterial(
        () => image as unknown as HTMLImageElement,
        createCanvas,
        '/',
      );
      material.select(TERRAIN_MATERIAL_ASSET);

      expect(material.state).toBe('loading');
      expect(material.isSettled).toBe(false);

      vi.advanceTimersByTime(TERRAIN_MATERIAL_LOAD_TIMEOUT_MS);

      expect(material.state).toBe('failed');
      expect(material.isSettled).toBe(true);

      image.naturalWidth = 256;
      image.naturalHeight = 256;
      image.onload?.();

      expect(material.state).toBe('failed');
      expect(material.isSettled).toBe(true);
      expect(createCanvas).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
