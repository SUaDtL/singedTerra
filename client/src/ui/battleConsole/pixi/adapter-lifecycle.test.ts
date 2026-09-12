// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { projectResponsiveLayout } from '../projection';
import { BattleConsoleResourceLedger, resourcesAreZero } from '../resources';
import {
  createBattleConsolePixiAdapter,
  getBattleConsolePixiAssetLoadDiagnostics,
} from './adapter';

const runtime = vi.hoisted(() => {
  let resolveModule!: () => void;
  const moduleReady = new Promise<void>((resolveReady) => { resolveModule = resolveReady; });
  let resolveAssets!: (value: Record<string, unknown>) => void;
  const nativePromise = new Promise<Record<string, unknown>>((resolveReady) => {
    resolveAssets = resolveReady;
  });
  const trackedPromise = {
    then(onFulfilled: (value: Record<string, unknown>) => unknown, onRejected: (reason: unknown) => unknown) {
      runtime.thenRegistrations += 1;
      return nativePromise.then(onFulfilled, onRejected);
    },
  };
  return {
    moduleLoads: 0,
    moduleReady,
    resolveModule,
    applications: [] as Array<{
      canvas: HTMLCanvasElement;
      destroyed: boolean;
      contextListeners: number;
      destroyArgs: unknown[];
    }>,
    assetLoad: vi.fn((urls: string[]) => {
      if (runtime.rejectNextAssetLoad) {
        runtime.rejectNextAssetLoad = false;
        return Promise.reject(new Error('texture load failed'));
      }
      return trackedPromise;
    }),
    rejectNextAssetLoad: true,
    denyWebGl: false,
    initCalls: 0,
    initGate: null as Promise<void> | null,
    initDelayMs: 0,
    textureConfig: { preferWorkers: true },
    domAdapterSet: vi.fn(),
    getTestContext: vi.fn(),
    getMaxFragmentPrecision: vi.fn(),
    getMaxTexturesPerBatch: vi.fn(),
    thenRegistrations: 0,
    resolveAssets,
  };
});

vi.mock('pixi.js', async () => {
  runtime.moduleLoads += 1;
  await runtime.moduleReady;
  return {
    DOMAdapter: { set: runtime.domAdapterSet },
    getTestContext: runtime.getTestContext,
    getMaxFragmentPrecision: runtime.getMaxFragmentPrecision,
    getMaxTexturesPerBatch: runtime.getMaxTexturesPerBatch,
    Batcher: { defaultOptions: {} },
    Application: class {
      readonly stage = { addChild: vi.fn() };
      readonly canvas = document.createElement('canvas');
      readonly renderer = { resize: vi.fn(), resolution: 1 };
      destroyed = false;
      contextListeners = 0;
      destroyArgs: unknown[] = [];

      constructor() {
        runtime.applications.push(this);
        const add = this.canvas.addEventListener.bind(this.canvas);
        const remove = this.canvas.removeEventListener.bind(this.canvas);
        this.canvas.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
          if (type === 'webglcontextlost') this.contextListeners += 1;
          add(type, listener, options);
        }) as typeof this.canvas.addEventListener;
        this.canvas.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
          if (type === 'webglcontextlost') this.contextListeners -= 1;
          remove(type, listener, options);
        }) as typeof this.canvas.removeEventListener;
      }

      async init() {
        runtime.initCalls += 1;
        if (runtime.denyWebGl) throw new Error('WebGL unavailable');
        if (runtime.initDelayMs > 0) {
          await new Promise<void>((resolveReady) => setTimeout(resolveReady, runtime.initDelayMs));
        }
        if (runtime.initGate) await runtime.initGate;
      }
      render() {}
      destroy(...args: unknown[]) {
        this.destroyed = true;
        this.destroyArgs = args;
      }
    },
    Assets: { load: runtime.assetLoad, unload: vi.fn() },
    loadTextures: { config: runtime.textureConfig },
    Container: class {
      label = '';
      eventMode = 'auto';
      interactiveChildren = true;
      visible = true;
      alpha = 1;
      readonly position = { set: vi.fn() };
      readonly scale = { set: vi.fn(), x: 1 };
      addChild() {}
      destroy() {}
    },
    Sprite: class {
      label = '';
      eventMode = 'auto';
      width = 0;
      height = 0;
      visible = true;
      alpha = 1;
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
  };
});

const urls = [
  '/art/battle-console-integrated/static-chrome.png',
  '/art/battle-console-integrated/canonical-pixi-layer.png',
  '/art/battle-console-integrated/static-chrome-standard.png',
  '/art/battle-console-integrated/canonical-pixi-layer-standard.png',
  '/art/battle-console-integrated/static-chrome-compact.png',
  '/art/battle-console-integrated/canonical-pixi-layer-compact.png',
];

async function flushMicrotasks(count = 20): Promise<void> {
  for (let index = 0; index < count; index++) await Promise.resolve();
}

function deferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolveReady) => { resolvePromise = resolveReady; });
  return { promise, resolve: resolvePromise };
}

describe('R10 supported Pixi lifecycle', () => {
  beforeAll(() => {
    runtime.applications.length = 0;
  });

  it('keeps one import operation and detaches every abandoned generation while the module is held', async () => {
    try {
      for (let generation = 0; generation < 200; generation++) {
        const resources = new BattleConsoleResourceLedger();
        const controller = new AbortController();
        let outcome = 'pending';
        const pending = createBattleConsolePixiAdapter({
          host: document.createElement('div'),
          layout: projectResponsiveLayout('wide', 1),
          resources,
          isCurrentGeneration: () => !controller.signal.aborted,
          onContextLoss: vi.fn(),
          signal: controller.signal,
          decorationTimeoutMs: 60_000,
        });
        void pending.then(
          () => { outcome = 'fulfilled'; },
          (error: unknown) => { outcome = error instanceof Error ? error.name : 'rejected'; },
        );
        await flushMicrotasks();
        controller.abort();
        await flushMicrotasks();
        expect(outcome).toBe('AbortError');
        await pending.catch(() => undefined);
        expect(resourcesAreZero(resources.snapshot())).toBe(true);
      }
      expect(runtime.moduleLoads).toBe(1);
      expect(runtime.applications).toHaveLength(0);
    } finally {
      runtime.resolveModule();
      await flushMicrotasks(40);
    }
    expect(runtime.applications).toHaveLength(0);
  });

  it('uses renderer initialization for capability denial without fake global probes', async () => {
    runtime.denyWebGl = true;
    const resources = new BattleConsoleResourceLedger();
    await expect(createBattleConsolePixiAdapter({
      host: document.createElement('div'),
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss: vi.fn(),
    })).rejects.toThrow('WebGL unavailable');
    runtime.denyWebGl = false;

    expect(runtime.domAdapterSet).not.toHaveBeenCalled();
    expect(runtime.getTestContext).not.toHaveBeenCalled();
    expect(runtime.getMaxFragmentPrecision).not.toHaveBeenCalled();
    expect(runtime.getMaxTexturesPerBatch).not.toHaveBeenCalled();
    expect(runtime.assetLoad).not.toHaveBeenCalled();
    expect(runtime.applications.at(-1)).toMatchObject({ destroyed: true, contextListeners: 0 });
    expect(resourcesAreZero(resources.snapshot())).toBe(true);
  });

  it('keeps one initialization operation while generations abort and destroys the unclaimed late app', async () => {
    const gate = deferred();
    runtime.initGate = gate.promise;
    const applicationStart = runtime.applications.length;
    const initStart = runtime.initCalls;
    try {
      for (let generation = 0; generation < 200; generation++) {
        const resources = new BattleConsoleResourceLedger();
        const controller = new AbortController();
        let outcome = 'pending';
        const pending = createBattleConsolePixiAdapter({
          host: document.createElement('div'),
          layout: projectResponsiveLayout('wide', 1),
          resources,
          isCurrentGeneration: () => !controller.signal.aborted,
          onContextLoss: vi.fn(),
          signal: controller.signal,
          decorationTimeoutMs: 60_000,
        });
        void pending.then(
          () => { outcome = 'fulfilled'; },
          (error: unknown) => { outcome = error instanceof Error ? error.name : 'rejected'; },
        );
        await flushMicrotasks();
        controller.abort();
        await flushMicrotasks();
        expect(outcome).toBe('AbortError');
        await pending.catch(() => undefined);
        expect(resourcesAreZero(resources.snapshot())).toBe(true);
      }
      expect(runtime.applications.length - applicationStart).toBe(1);
      expect(runtime.initCalls - initStart).toBe(1);
      expect(runtime.applications.at(-1)?.destroyed).toBe(false);
    } finally {
      runtime.initGate = null;
      gate.resolve();
      await flushMicrotasks(40);
    }
    expect(runtime.applications.at(-1)?.destroyed).toBe(true);
  });

  it('destroys an admission whose generation aborts after resolution but before its continuation claims', async () => {
    const gate = deferred();
    const controller = new AbortController();
    const resources = new BattleConsoleResourceLedger();
    const host = document.createElement('div');
    runtime.initGate = gate.promise;
    let outcome = 'pending';
    const pending = createBattleConsolePixiAdapter({
      host,
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => !controller.signal.aborted,
      onContextLoss: vi.fn(),
      signal: controller.signal,
      decorationTimeoutMs: 60_000,
    });
    void pending.then(
      () => { outcome = 'fulfilled'; },
      (error: unknown) => { outcome = error instanceof Error ? error.name : 'rejected'; },
    );
    await flushMicrotasks();

    gate.resolve();
    queueMicrotask(() => queueMicrotask(() => controller.abort()));
    try {
      await flushMicrotasks(40);
      expect(outcome).toBe('AbortError');
      await pending.catch(() => undefined);
      expect(host.childElementCount).toBe(0);
      expect(runtime.applications.at(-1)?.destroyed).toBe(true);
      expect(resourcesAreZero(resources.snapshot())).toBe(true);
    } finally {
      runtime.initGate = null;
      controller.abort();
      await pending.catch(() => undefined);
    }
  });

  it('disables worker-backed image probing before the fixed strict-CSP load and cleans up rejection', async () => {
    runtime.textureConfig.preferWorkers = true;
    const resources = new BattleConsoleResourceLedger();
    await expect(createBattleConsolePixiAdapter({
      host: document.createElement('div'),
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss: vi.fn(),
    })).rejects.toThrow('texture load failed');

    expect(runtime.textureConfig.preferWorkers).toBe(false);
    expect(runtime.assetLoad).toHaveBeenCalledTimes(1);
    expect(runtime.assetLoad).toHaveBeenCalledWith(urls);
    expect(runtime.applications.at(-1)).toMatchObject({ destroyed: true, contextListeners: 0 });
    expect(resourcesAreZero(resources.snapshot())).toBe(true);
  });

  it('installs Pixi static CSP synchronizers before renderer initialization', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'adapter.ts'), 'utf8');
    const cspImport = source.indexOf("import 'pixi.js/unsafe-eval'");
    const pixiImport = source.indexOf("import('pixi.js')");

    expect(cspImport).toBeGreaterThanOrEqual(0);
    expect(pixiImport).toBeGreaterThanOrEqual(0);
    expect(cspImport).toBeLessThan(pixiImport);
  });

  it('uses one total deadline across initialization and texture admission', async () => {
    vi.useFakeTimers();
    runtime.initDelayMs = 6;
    const resources = new BattleConsoleResourceLedger();
    const controller = new AbortController();
    let outcome = 'pending';
    const pending = createBattleConsolePixiAdapter({
      host: document.createElement('div'),
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss: vi.fn(),
      signal: controller.signal,
      decorationTimeoutMs: 10,
    });
    void pending.then(
      () => { outcome = 'fulfilled'; },
      (error: unknown) => { outcome = error instanceof Error ? error.name : 'rejected'; },
    );
    try {
      await vi.advanceTimersByTimeAsync(6);
      expect(runtime.assetLoad).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3);
      expect(outcome).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toBe('TimeoutError');
      await pending.catch(() => undefined);
      expect(getBattleConsolePixiAssetLoadDiagnostics()).toMatchObject({ status: 'pending', waiters: 0 });
      expect(runtime.applications.at(-1)).toMatchObject({ destroyed: true, contextListeners: 0 });
      expect(resourcesAreZero(resources.snapshot())).toBe(true);
    } finally {
      controller.abort();
      await pending.catch(() => undefined);
      runtime.initDelayMs = 0;
      vi.useRealTimers();
    }
  });

  it('keeps one fixed shared load and no generation waiters across hundreds of aborted sessions', async () => {
    const abandonedHosts: HTMLElement[] = [];
    for (let generation = 0; generation < 200; generation++) {
      const resources = new BattleConsoleResourceLedger();
      const controller = new AbortController();
      const host = document.createElement('div');
      abandonedHosts.push(host);
      const pending = createBattleConsolePixiAdapter({
        host,
        layout: projectResponsiveLayout('wide', 1),
        resources,
        isCurrentGeneration: () => !controller.signal.aborted,
        onContextLoss: vi.fn(),
        signal: controller.signal,
        decorationTimeoutMs: 60_000,
      });
      await vi.waitFor(
        () => expect(getBattleConsolePixiAssetLoadDiagnostics().waiters).toBe(1),
        { interval: 1, timeout: 100 },
      );
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(getBattleConsolePixiAssetLoadDiagnostics().waiters).toBe(0);
      expect(resourcesAreZero(resources.snapshot())).toBe(true);
    }

    expect(runtime.assetLoad).toHaveBeenCalledTimes(2);
    expect(runtime.assetLoad).toHaveBeenLastCalledWith(urls);
    expect(runtime.thenRegistrations).toBe(1);
    expect(runtime.applications.every((app) => app.destroyed && app.contextListeners === 0)).toBe(true);
    expect(abandonedHosts.every((host) => host.childElementCount === 0)).toBe(true);
  });

  it('mounts only a current waiter after shared completion and releases the context-loss listener', async () => {
    const entries = Object.fromEntries(urls.map((url) => [url, { source: { url } }]));
    runtime.resolveAssets(entries);
    await vi.waitFor(() => expect(getBattleConsolePixiAssetLoadDiagnostics().status).toBe('fulfilled'));
    expect(document.querySelectorAll('.battle-console-pixi-canvas')).toHaveLength(0);

    const resources = new BattleConsoleResourceLedger();
    const host = document.createElement('div');
    const onContextLoss = vi.fn();
    const adapter = await createBattleConsolePixiAdapter({
      host,
      layout: projectResponsiveLayout('wide', 1),
      resources,
      isCurrentGeneration: () => true,
      onContextLoss,
    });
    const app = runtime.applications.at(-1)!;
    expect(adapter).not.toBeNull();
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(app.contextListeners).toBe(1);

    app.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await vi.waitFor(() => expect(onContextLoss).toHaveBeenCalledOnce());
    expect(app).toMatchObject({ destroyed: true, contextListeners: 0 });
    expect(resourcesAreZero(resources.snapshot())).toBe(true);
  });
});
