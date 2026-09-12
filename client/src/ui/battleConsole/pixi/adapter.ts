import 'pixi.js/unsafe-eval';
import type { Application, Texture } from 'pixi.js';
import type { ResponsiveLayoutProjection } from '../projection';
import type { BattleConsolePresentationState } from '../types';
import type { BattleConsoleResourceLease, BattleConsoleResourceLedger } from '../resources';
import {
  BATTLE_CONSOLE_ASSET_MODES,
  battleConsoleChromeUrl,
  battleConsoleDynamicUrl,
  createBattleConsoleChromeScene,
  type BattleConsoleChromeScene,
  type BattleConsoleTextureSet,
} from './scene';

function primePixiProbeCaches(pixi: typeof import('pixi.js')): void {
  const browserAdapter = pixi.DOMAdapter.get();
  let contextLost = false;
  const probeContext = {
    COMPILE_STATUS: 1,
    FRAGMENT_SHADER: 2,
    HIGH_FLOAT: 3,
    MAX_TEXTURE_IMAGE_UNITS: 4,
    compileShader() {},
    createShader: () => ({}),
    deleteShader() {},
    getExtension: (name: string) => name === 'WEBGL_lose_context'
      ? { loseContext: () => { contextLost = true; } }
      : null,
    getParameter: () => 8,
    getShaderParameter: () => true,
    getShaderPrecisionFormat: () => ({ precision: 1 }),
    isContextLost: () => contextLost,
    shaderSource() {},
  };
  const probeAdapter = {
    ...browserAdapter,
    createCanvas: () => ({ getContext: () => probeContext }),
  } as unknown as typeof browserAdapter;

  pixi.DOMAdapter.set(probeAdapter);
  try {
    const existing = pixi.getTestContext();
    const existingCanvas = existing?.canvas;
    if (existingCanvas instanceof HTMLCanvasElement) {
      existing.getExtension('WEBGL_lose_context')?.loseContext();
      pixi.getTestContext();
    }
    pixi.getMaxFragmentPrecision();
    pixi.getMaxTexturesPerBatch();
  } finally {
    pixi.DOMAdapter.set(browserAdapter);
  }
}

export interface BattleConsolePixiAdapter {
  readonly scene: BattleConsoleChromeScene;
  project(layout: ResponsiveLayoutProjection, state?: BattleConsolePresentationState): void;
  destroy(): Promise<void>;
}

export interface BattleConsolePixiAdapterOptions {
  readonly state?: BattleConsolePresentationState;
  readonly host: HTMLElement;
  readonly layout: ResponsiveLayoutProjection;
  readonly resources: BattleConsoleResourceLedger;
  readonly isCurrentGeneration: () => boolean;
  readonly onContextLoss: () => void;
}

/** Lazy-loads Pixi and publishes a canvas only for the still-current generation. */
export async function createBattleConsolePixiAdapter({
  state,
  host,
  layout,
  resources,
  isCurrentGeneration,
  onContextLoss,
}: BattleConsolePixiAdapterOptions): Promise<BattleConsolePixiAdapter | null> {
  const pendingImport = resources.acquire('pendingImports');
  const pendingPromise = resources.acquire('pendingPromises');
  let applicationLease: BattleConsoleResourceLease | null = null;
  let canvasLease: BattleConsoleResourceLease | null = null;
  let contextLease: BattleConsoleResourceLease | null = null;
  let controllerLease: BattleConsoleResourceLease | null = null;
  let textureLease: BattleConsoleResourceLease | null = null;
  let app: Application | null = null;
  let loadedPixi: typeof import('pixi.js') | undefined;
  const loadedTextures: Array<{ url: string; texture: Texture }> = [];
  let scene: BattleConsoleChromeScene | null = null;
  let ownershipTransferred = false;

  const releasePartialState = async (pixi = loadedPixi) => {
    scene?.destroy();
    scene = null;
    if (app) {
      try {
        // Pixi destroys its renderer, but Chromium can otherwise retain the
        // detached zero-sized canvas through the still-live WebGL context.
        // Explicit context loss releases that native back-reference first.
        const context = app.canvas.getContext('webgl2') ?? app.canvas.getContext('webgl');
        context?.getExtension('WEBGL_lose_context')?.loseContext();
        app.destroy(true, { children: true, texture: false, textureSource: false });
      } catch {
        // Initialization may have rejected before Pixi installed a renderer.
      }
      app = null;
    }
    if (pixi) {
      for (const { url, texture } of loadedTextures.splice(0).reverse()) {
        try {
          await pixi.Assets.unload(url);
        } catch {
          texture.destroy(true);
        }
      }
    }
    textureLease?.release();
    contextLease?.release();
    canvasLease?.release();
    controllerLease?.release();
    applicationLease?.release();
  };

  try {
    const pixi = await import('pixi.js');
    loadedPixi = pixi;
    pendingImport.release();
    if (!isCurrentGeneration() || resources.closed) return null;

    // Prime Pixi's module-level capability caches with a non-DOM probe so its
    // internal getTestContext singleton cannot retain a detached zero-size
    // canvas after the compositor generation is destroyed.
    primePixiProbeCaches(pixi);

    // Pixi's deprecated no-option Batcher fallback creates and module-caches a
    // probe WebGL context. Eight texture units is the WebGL 1 guaranteed floor;
    // setting the fallback avoids that permanent probe while renderer-owned
    // batchers still receive the device-specific limit through BatcherPipe.
    pixi.Batcher.defaultOptions.maxTextures = 8;

    app = new pixi.Application();
    applicationLease = resources.acquire('pixiApplications');
    await app.init({
      width: layout.cssWidth,
      height: layout.cssHeight,
      resolution: layout.devicePixelRatio,
      autoDensity: true,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
      preference: 'webgl',
    });
    if (!isCurrentGeneration() || resources.closed) {
      await releasePartialState(pixi);
      return null;
    }

    // Pixi's worker capability probe uses a blob Worker that strict CSP blocks
    // without emitting a rejection, so the default texture load can hang forever.
    if (!pixi.loadTextures.config) {
      throw new Error('Pixi texture loader configuration is unavailable');
    }
    pixi.loadTextures.config.preferWorkers = false;
    const textureEntries = [] as Array<readonly [ResponsiveLayoutProjection['mode'], Texture, Texture]>;
    for (const mode of BATTLE_CONSOLE_ASSET_MODES) {
      const staticUrl = battleConsoleChromeUrl(import.meta.env.BASE_URL, mode);
      const dynamicUrl = battleConsoleDynamicUrl(import.meta.env.BASE_URL, mode);
      const staticTexture = await pixi.Assets.load<Texture>(staticUrl);
      loadedTextures.push({ url: staticUrl, texture: staticTexture });
      const dynamicTexture = await pixi.Assets.load<Texture>(dynamicUrl);
      loadedTextures.push({ url: dynamicUrl, texture: dynamicTexture });
      textureEntries.push([mode, staticTexture, dynamicTexture]);
    }
    if (!isCurrentGeneration() || resources.closed) {
      await releasePartialState(pixi);
      return null;
    }

    textureLease = resources.acquire('textures');
    controllerLease = resources.acquire('pixiControllers');
    canvasLease = resources.acquire('canvases');
    contextLease = resources.acquire('gpuContexts');
    const textures = Object.fromEntries(textureEntries.map(([mode, staticTexture, dynamicTexture]) => [
      mode,
      { static: staticTexture, dynamic: dynamicTexture },
    ])) as BattleConsoleTextureSet;
    scene = createBattleConsoleChromeScene(pixi, textures);
    scene.project(layout, state);
    app.stage.addChild(scene.root);
    app.canvas.className = 'battle-console-pixi-canvas';
    app.canvas.dataset['battleConsolePixi'] = '';
    app.canvas.setAttribute('aria-hidden', 'true');
    app.canvas.tabIndex = -1;
    app.canvas.style.pointerEvents = 'none';
    host.replaceChildren(app.canvas);
    app.render();

    let destroyed = false;
    const mountedApp = app;
    const mountedScene = scene;
    let handleContextLoss: (event: Event) => void;
    const destroyMounted = async () => {
      if (destroyed) return;
      destroyed = true;
      mountedApp.canvas.removeEventListener('webglcontextlost', handleContextLoss);
      ownershipTransferred = false;
      await releasePartialState(pixi);
    };
    handleContextLoss = (event: Event) => {
      event.preventDefault();
      if (destroyed) return;
      void destroyMounted().finally(onContextLoss);
    };
    mountedApp.canvas.addEventListener('webglcontextlost', handleContextLoss, { once: true });
    ownershipTransferred = true;
    let mountedLayout = layout;

    return {
      scene: mountedScene,
      project(nextLayout, nextState) {
        if (destroyed) return;
        const geometryChanged = mountedLayout.mode !== nextLayout.mode
          || mountedLayout.cssWidth !== nextLayout.cssWidth
          || mountedLayout.cssHeight !== nextLayout.cssHeight
          || mountedLayout.devicePixelRatio !== nextLayout.devicePixelRatio;
        if (geometryChanged) {
          mountedApp.renderer.resize(nextLayout.cssWidth, nextLayout.cssHeight);
          mountedApp.renderer.resolution = nextLayout.devicePixelRatio;
          mountedLayout = nextLayout;
        }
        mountedScene.project(nextLayout, nextState);
        mountedApp.render();
      },
      destroy: destroyMounted,
    };
  } catch (error) {
    await releasePartialState();
    throw error;
  } finally {
    pendingImport.release();
    pendingPromise.release();
    if (!ownershipTransferred && app) await releasePartialState();
  }
}
