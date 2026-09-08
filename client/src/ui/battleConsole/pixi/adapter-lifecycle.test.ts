// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectResponsiveLayout } from '../projection';
import { BattleConsoleResourceLedger, resourcesAreZero } from '../resources';
import { createBattleConsolePixiAdapter } from './adapter';

const runtime = vi.hoisted(() => ({
  application: null as null | { canvas: HTMLCanvasElement; destroyed: boolean; loseContext: ReturnType<typeof vi.fn> },
  rejectTexture: true,
  rejectTextureAt: 0,
  textureConfig: { preferWorkers: true },
  loadedUrls: [] as string[],
  unloadedUrls: [] as string[],
  batcherDefaultOptions: {} as { maxTextures?: number },
  domAdapter: { createCanvas: vi.fn(() => document.createElement('canvas')) },
  activeDomAdapter: null as null | { createCanvas: (...args: unknown[]) => unknown },
  domAdapterSet: vi.fn(),
  getTestContext: vi.fn(() => ({ isContextLost: () => false })),
  getMaxFragmentPrecision: vi.fn(() => 'mediump'),
  getMaxTexturesPerBatch: vi.fn(() => 8),
}));

vi.mock('pixi.js', () => ({
  DOMAdapter: {
    get: () => runtime.activeDomAdapter ?? runtime.domAdapter,
    set: (adapter: { createCanvas: (...args: unknown[]) => unknown }) => {
      runtime.activeDomAdapter = adapter;
      runtime.domAdapterSet(adapter);
    },
  },
  getTestContext: runtime.getTestContext,
  getMaxFragmentPrecision: runtime.getMaxFragmentPrecision,
  getMaxTexturesPerBatch: runtime.getMaxTexturesPerBatch,
  Application: class {
    readonly stage = { addChild: vi.fn() };
    readonly canvas = document.createElement('canvas');
    readonly renderer = { resize: vi.fn(), resolution: 1 };
    destroyed = false;
    readonly loseContext = vi.fn();

    constructor() {
      vi.spyOn(this.canvas, 'getContext').mockImplementation(((contextId: string) => (
        contextId === 'webgl2'
          ? { getExtension: () => ({ loseContext: this.loseContext }) }
          : null
      )) as HTMLCanvasElement['getContext']);
      runtime.application = this;
    }

    async init() {}
    render() {}
    destroy() {
      this.destroyed = true;
    }
  },
  Assets: {
    load: vi.fn(async (url: string) => {
      runtime.loadedUrls.push(url);
      if (runtime.textureConfig.preferWorkers) {
        throw new Error('worker image path must be disabled before texture load');
      }
      if (runtime.rejectTexture || runtime.loadedUrls.length === runtime.rejectTextureAt) throw new Error('texture load failed');
      return { source: { url }, destroy: vi.fn() };
    }),
    unload: vi.fn(async (url: string) => { runtime.unloadedUrls.push(url); }),
  },
  loadTextures: { config: runtime.textureConfig },
  Batcher: { defaultOptions: runtime.batcherDefaultOptions },
  Container: class {
    label = '';
    eventMode = 'auto';
    interactiveChildren = true;
    readonly position = { set: vi.fn() };
    readonly scale = { set: vi.fn() };
    addChild() {}
    destroy() {}
  },
  Sprite: class {
    label = '';
    eventMode = 'auto';
    width = 0;
    height = 0;
    constructor(readonly options: { texture: unknown }) {}
  },
  Rectangle: class {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly width: number,
      readonly height: number,
    ) {}
  },
  Texture: class {
    constructor(readonly options: { source: unknown; frame: unknown }) {}
  },
}));

describe('P-04 Pixi adapter cleanup', () => {
  beforeEach(() => {
    runtime.application = null;
    runtime.rejectTexture = true;
    runtime.rejectTextureAt = 0;
    runtime.textureConfig.preferWorkers = true;
    runtime.loadedUrls.length = 0;
    runtime.unloadedUrls.length = 0;
    delete runtime.batcherDefaultOptions.maxTextures;
    runtime.activeDomAdapter = runtime.domAdapter;
    runtime.domAdapterSet.mockClear();
    runtime.getTestContext.mockClear();
    runtime.getMaxFragmentPrecision.mockClear();
    runtime.getMaxTexturesPerBatch.mockClear();
  });

  it('disables Pixi worker-backed image probing before loading strict-CSP chrome', async () => {
    runtime.rejectTexture = false;
    const resources = new BattleConsoleResourceLedger();
    const adapter = await createBattleConsolePixiAdapter({
      host: document.createElement('div'),
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss: vi.fn(),
    });

    expect(runtime.textureConfig.preferWorkers).toBe(false);
    expect(runtime.batcherDefaultOptions.maxTextures).toBe(8);
    expect(runtime.getTestContext).toHaveBeenCalledOnce();
    expect(runtime.getMaxFragmentPrecision).toHaveBeenCalledOnce();
    expect(runtime.getMaxTexturesPerBatch).toHaveBeenCalledOnce();
    expect(runtime.domAdapterSet).toHaveBeenCalledTimes(2);
    expect(runtime.activeDomAdapter).toBe(runtime.domAdapter);
    expect(runtime.loadedUrls).toEqual([
      '/art/battle-console-integrated/static-chrome.png',
      '/art/battle-console-integrated/canonical-pixi-layer.png',
      '/art/battle-console-integrated/static-chrome-standard.png',
      '/art/battle-console-integrated/canonical-pixi-layer-standard.png',
      '/art/battle-console-integrated/static-chrome-compact.png',
      '/art/battle-console-integrated/canonical-pixi-layer-compact.png',
    ]);
    await adapter?.destroy();
    expect(runtime.application?.loseContext).toHaveBeenCalledOnce();
    expect(runtime.unloadedUrls).toEqual([
      '/art/battle-console-integrated/canonical-pixi-layer-compact.png',
      '/art/battle-console-integrated/static-chrome-compact.png',
      '/art/battle-console-integrated/canonical-pixi-layer-standard.png',
      '/art/battle-console-integrated/static-chrome-standard.png',
      '/art/battle-console-integrated/canonical-pixi-layer.png',
      '/art/battle-console-integrated/static-chrome.png',
    ]);
  });

  it('installs Pixi static CSP synchronizers before renderer initialization', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'adapter.ts'),
      'utf8',
    );
    const cspImport = source.indexOf("import 'pixi.js/unsafe-eval'");
    const pixiImport = source.indexOf("await import('pixi.js')");

    expect(cspImport).toBeGreaterThanOrEqual(0);
    expect(cspImport).toBeLessThan(pixiImport);
  });

  it('destroys a partially initialized application and releases every lease after texture rejection', async () => {
    const resources = new BattleConsoleResourceLedger();

    await expect(createBattleConsolePixiAdapter({
      host: document.createElement('div'),
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss: vi.fn(),
    })).rejects.toThrow('texture load failed');

    expect(runtime.application?.destroyed).toBe(true);
    expect(resourcesAreZero(resources.snapshot())).toBe(true);
  });

  it('unloads successful texture acquisitions when a later texture rejects', async () => {
    runtime.rejectTexture = false;
    runtime.rejectTextureAt = 2;
    const resources = new BattleConsoleResourceLedger();
    await expect(createBattleConsolePixiAdapter({
      host: document.createElement('div'),
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss: vi.fn(),
    })).rejects.toThrow('texture load failed');
    expect(runtime.unloadedUrls).toEqual(['/art/battle-console-integrated/static-chrome.png']);
    expect(runtime.application?.destroyed).toBe(true);
    expect(resourcesAreZero(resources.snapshot())).toBe(true);
  });

  it('releases the Pixi subtree before publishing fallback after context loss', async () => {
    runtime.rejectTexture = false;
    const resources = new BattleConsoleResourceLedger();
    const onContextLoss = vi.fn();
    const adapter = await createBattleConsolePixiAdapter({
      host: document.createElement('div'),
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss,
    });

    expect(adapter).not.toBeNull();
    runtime.application?.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await vi.waitFor(() => expect(onContextLoss).toHaveBeenCalledOnce());

    expect(runtime.application?.destroyed).toBe(true);
    expect(resourcesAreZero(resources.snapshot())).toBe(true);
  });
});
