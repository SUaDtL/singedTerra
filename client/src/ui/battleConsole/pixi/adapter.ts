import 'pixi.js/unsafe-eval';
import type { Application, Texture } from 'pixi.js';
import type { ResponsiveLayoutProjection } from '../projection';
import type { BattleConsolePresentationState } from '../types';
import {
  BattleConsoleResourceWaiterSet,
  type BattleConsoleResourceLease,
  type BattleConsoleResourceLedger,
} from '../resources';
import {
  BATTLE_CONSOLE_ASSET_MODES,
  battleConsoleChromeUrl,
  battleConsoleDynamicUrl,
  createBattleConsoleChromeScene,
  type BattleConsoleChromeScene,
  type BattleConsoleTextureSet,
} from './scene';

const DEFAULT_DECORATION_TIMEOUT_MS = 8_000;

type PixiModule = typeof import('pixi.js');

interface ClaimedPixiApplication {
  readonly pixi: PixiModule;
  readonly app: Application;
}

interface PixiApplicationAdmission {
  claim(eligible: boolean): ClaimedPixiApplication | null;
}

interface SharedPixiApplicationAdmission {
  readonly waiters: BattleConsoleResourceWaiterSet<PixiApplicationAdmission>;
  status: 'pending' | 'settled';
  app: Application | null;
}

type TextureLoadStatus = 'pending' | 'fulfilled';

interface SharedTextureLoad {
  readonly key: string;
  readonly waiters: BattleConsoleResourceWaiterSet<readonly Texture[]>;
  status: TextureLoadStatus;
  textures: readonly Texture[] | null;
}

// Pixi Assets is a process-owned cache and has no per-request AbortSignal. Keep
// one fixed asset request and one completion pair; generations attach removable
// waiters without retaining one Promise callback per abandoned match.
let sharedTextureLoad: SharedTextureLoad | null = null;
let sharedApplicationAdmission: SharedPixiApplicationAdmission | null = null;

function terminalAdmissionError(
  message: string,
  name: 'AbortError' | 'TimeoutError',
): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function destroyPixiApplication(app: Application): void {
  try {
    app.destroy(true, { children: true, texture: false, textureSource: false });
  } catch {
    // Pixi can reject before assigning its renderer. A late initialized app is
    // destroyed only after init settles, when the renderer is available.
  }
}

function clearSharedApplicationAdmission(record: SharedPixiApplicationAdmission): void {
  if (sharedApplicationAdmission === record) sharedApplicationAdmission = null;
}

function getSharedApplicationAdmission(): SharedPixiApplicationAdmission {
  if (sharedApplicationAdmission?.status === 'pending') return sharedApplicationAdmission;
  if (sharedApplicationAdmission) {
    throw new Error('Battle-console Pixi application admission is being transferred');
  }

  const record: SharedPixiApplicationAdmission = {
    waiters: new BattleConsoleResourceWaiterSet<PixiApplicationAdmission>(),
    status: 'pending',
    app: null,
  };
  sharedApplicationAdmission = record;

  // import() and Application.init() expose no AbortSignal. One process-owned
  // operation absorbs that uncancellable work while generations attach only
  // removable waiters. The neutral size avoids retaining generation layout.
  void (async () => {
    let pixi: PixiModule | null = null;
    try {
      pixi = await import('pixi.js');
      if (record.waiters.size === 0) {
        record.status = 'settled';
        clearSharedApplicationAdmission(record);
        return;
      }

      const app = new pixi.Application();
      record.app = app;
      await app.init({
        width: 1,
        height: 1,
        resolution: 1,
        autoDensity: true,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        preference: 'webgl',
      });

      record.status = 'settled';
      let reservations = record.waiters.size;
      let claimed = false;
      const admission: PixiApplicationAdmission = {
        claim(eligible) {
          if (reservations <= 0) return null;
          reservations -= 1;
          let result: ClaimedPixiApplication | null = null;
          if (eligible && !claimed && record.app && pixi) {
            claimed = true;
            result = { pixi, app: record.app };
            record.app = null;
          }
          if (claimed || reservations === 0) {
            clearSharedApplicationAdmission(record);
          }
          if (!claimed && reservations === 0 && record.app) {
            const unclaimed = record.app;
            record.app = null;
            destroyPixiApplication(unclaimed);
          }
          return result;
        },
      };

      if (reservations === 0) {
        const unclaimed = record.app;
        record.app = null;
        clearSharedApplicationAdmission(record);
        if (unclaimed) destroyPixiApplication(unclaimed);
        return;
      }
      // Resolving removes waiters synchronously, but reservations stay owned
      // until each async consumer either claims or explicitly relinquishes.
      clearSharedApplicationAdmission(record);
      record.waiters.resolve(admission);
    } catch (error) {
      record.status = 'settled';
      record.waiters.reject(error);
      const failed = record.app;
      record.app = null;
      clearSharedApplicationAdmission(record);
      if (failed) destroyPixiApplication(failed);
    }
  })();

  return record;
}

function remainingDecorationTime(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function claimSharedApplication(
  resources: BattleConsoleResourceLedger,
  signal: AbortSignal,
  deadline: number,
  isCurrentGeneration: () => boolean,
): Promise<ClaimedPixiApplication | null> {
  const record = getSharedApplicationAdmission();
  const admission = await record.waiters.wait({
    resources,
    signal,
    timeoutMs: remainingDecorationTime(deadline),
    description: 'Battle-console Pixi renderer admission',
  });
  const timedOut = Date.now() >= deadline;
  const eligible = !signal.aborted
    && !timedOut
    && !resources.closed
    && isCurrentGeneration();
  const claimed = admission.claim(eligible);
  if (signal.aborted) {
    throw terminalAdmissionError('Battle-console Pixi renderer admission was cancelled', 'AbortError');
  }
  if (timedOut) {
    throw terminalAdmissionError('Battle-console Pixi renderer admission exceeded its deadline', 'TimeoutError');
  }
  return claimed;
}

export function getBattleConsolePixiAssetLoadDiagnostics(): Readonly<{
  status: 'idle' | TextureLoadStatus;
  waiters: number;
}> {
  return Object.freeze({
    status: sharedTextureLoad?.status ?? 'idle',
    waiters: sharedTextureLoad?.waiters.size ?? 0,
  });
}

function textureUrls(baseUrl: string): readonly string[] {
  return Object.freeze(BATTLE_CONSOLE_ASSET_MODES.flatMap((mode) => [
    battleConsoleChromeUrl(baseUrl, mode),
    battleConsoleDynamicUrl(baseUrl, mode),
  ]));
}

function normalizeLoadedTextures(
  urls: readonly string[],
  loaded: unknown,
): readonly Texture[] {
  if (Array.isArray(loaded)) {
    if (loaded.length !== urls.length) throw new Error('Pixi returned an incomplete battle-console texture set');
    return loaded as Texture[];
  }
  if (!loaded || typeof loaded !== 'object') {
    throw new Error('Pixi returned an invalid battle-console texture set');
  }
  return urls.map((url) => {
    const texture = (loaded as Record<string, Texture>)[url];
    if (!texture) throw new Error(`Pixi omitted battle-console texture: ${url}`);
    return texture;
  });
}

function getSharedTextureLoad(
  pixi: typeof import('pixi.js'),
  urls: readonly string[],
): SharedTextureLoad {
  const key = urls.join('\n');
  if (sharedTextureLoad?.key === key) return sharedTextureLoad;
  if (sharedTextureLoad?.status === 'pending') {
    throw new Error('Battle-console asset identity changed while the shared load was pending');
  }

  if (!pixi.loadTextures.config) {
    throw new Error('Pixi texture loader configuration is unavailable');
  }
  // Pixi's blob-worker capability probe conflicts with the shipped strict CSP.
  // Browser image loading is supported and remains lazy through Assets.
  pixi.loadTextures.config.preferWorkers = false;

  const record: SharedTextureLoad = {
    key,
    waiters: new BattleConsoleResourceWaiterSet<readonly Texture[]>(),
    status: 'pending',
    textures: null,
  };
  sharedTextureLoad = record;

  let request: PromiseLike<unknown>;
  try {
    request = pixi.Assets.load([...urls]) as PromiseLike<unknown>;
  } catch (error) {
    if (sharedTextureLoad === record) sharedTextureLoad = null;
    throw error;
  }
  void request.then(
    (loaded) => {
      try {
        const textures = normalizeLoadedTextures(urls, loaded);
        record.textures = textures;
        record.status = 'fulfilled';
        record.waiters.resolve(textures);
      } catch (error) {
        record.waiters.reject(error);
        if (sharedTextureLoad === record) sharedTextureLoad = null;
      }
    },
    (error) => {
      record.waiters.reject(error);
      if (sharedTextureLoad === record) sharedTextureLoad = null;
    },
  );
  return record;
}

async function waitForSharedTextures(
  pixi: typeof import('pixi.js'),
  urls: readonly string[],
  resources: BattleConsoleResourceLedger,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<readonly Texture[]> {
  const record = getSharedTextureLoad(pixi, urls);
  if (record.status === 'fulfilled') return record.textures!;
  return record.waiters.wait({
    resources,
    signal,
    timeoutMs,
    description: 'Battle-console texture decoration',
  });
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
  readonly signal?: AbortSignal;
  readonly decorationTimeoutMs?: number;
}

/** Lazy-loads Pixi and publishes a canvas only for the still-current generation. */
export async function createBattleConsolePixiAdapter({
  state,
  host,
  layout,
  resources,
  isCurrentGeneration,
  onContextLoss,
  signal = new AbortController().signal,
  decorationTimeoutMs = DEFAULT_DECORATION_TIMEOUT_MS,
}: BattleConsolePixiAdapterOptions): Promise<BattleConsolePixiAdapter | null> {
  const decorationDeadline = Date.now() + Math.max(0, decorationTimeoutMs);
  let applicationLease: BattleConsoleResourceLease | null = null;
  let canvasLease: BattleConsoleResourceLease | null = null;
  let contextLease: BattleConsoleResourceLease | null = null;
  let controllerLease: BattleConsoleResourceLease | null = null;
  let textureLease: BattleConsoleResourceLease | null = null;
  let app: Application | null = null;
  let scene: BattleConsoleChromeScene | null = null;
  let ownershipTransferred = false;
  let contextLossListener: ((event: Event) => void) | null = null;

  const releasePartialState = async () => {
    if (app && contextLossListener) {
      app.canvas.removeEventListener('webglcontextlost', contextLossListener);
      contextLossListener = null;
    }
    scene?.destroy();
    scene = null;
    if (app) {
      destroyPixiApplication(app);
      app = null;
    }
    textureLease?.release();
    textureLease = null;
    contextLease?.release();
    contextLease = null;
    canvasLease?.release();
    canvasLease = null;
    controllerLease?.release();
    controllerLease = null;
    applicationLease?.release();
    applicationLease = null;
  };

  try {
    const claimed = await claimSharedApplication(
      resources,
      signal,
      decorationDeadline,
      isCurrentGeneration,
    );
    if (!claimed) return null;
    const { pixi } = claimed;
    app = claimed.app;
    applicationLease = resources.acquire('pixiApplications');
    app.renderer.resize(layout.cssWidth, layout.cssHeight);
    app.renderer.resolution = layout.devicePixelRatio;
    if (!isCurrentGeneration() || resources.closed || signal.aborted) {
      await releasePartialState();
      return null;
    }

    const urls = textureUrls(import.meta.env.BASE_URL);
    const loadedTextures = await waitForSharedTextures(
      pixi,
      urls,
      resources,
      signal,
      remainingDecorationTime(decorationDeadline),
    );
    if (!isCurrentGeneration() || resources.closed || signal.aborted) {
      await releasePartialState();
      return null;
    }

    const textureEntries = BATTLE_CONSOLE_ASSET_MODES.map((mode, index) => [
      mode,
      loadedTextures[index * 2]!,
      loadedTextures[index * 2 + 1]!,
    ] as const);
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
    const destroyMounted = async () => {
      if (destroyed) return;
      destroyed = true;
      ownershipTransferred = false;
      await releasePartialState();
    };
    contextLossListener = (event: Event) => {
      event.preventDefault();
      if (destroyed) return;
      void destroyMounted().finally(onContextLoss);
    };
    mountedApp.canvas.addEventListener('webglcontextlost', contextLossListener, { once: true });
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
    if (!ownershipTransferred && app) await releasePartialState();
  }
}
