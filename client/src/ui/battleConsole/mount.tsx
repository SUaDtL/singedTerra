import { render } from 'preact';
import styles from './BattleConsole.module.css';
import { BattleConsoleRoot, type BattleConsoleClassNames } from './BattleConsoleRoot';
import { createBattleConsolePixiAdapter, type BattleConsolePixiAdapter } from './pixi/adapter';
import type { BattleConsolePortalHosts } from './portals';
import type { ResponsiveLayoutProjection } from './projection';
import { battleConsolePresentationStatesEqual } from './projectState';
import type {
  BattleConsoleResourceLease,
  BattleConsoleResourceLedger,
  BattleConsoleResourceSnapshot,
} from './resources';
import type {
  BattleConsoleLifecycleStatus,
  BattleConsolePresentationState,
  BattleConsoleIntent,
} from './types';

function requiredModuleClass(name: string): string {
  const className = styles[name];
  if (!className) throw new Error(`Missing battle-console CSS Module class: ${name}`);
  return className;
}

const battleConsoleClassNames: BattleConsoleClassNames = Object.freeze({
  root: requiredModuleClass('root'),
  inline: requiredModuleClass('inline'),
  portal: requiredModuleClass('portal'),
  semanticNode: requiredModuleClass('semanticNode'),
  weaponIcon: requiredModuleClass('weaponIcon'),
});

export interface BattleConsoleGenerationToken {
  readonly generation: number;
  readonly resources: BattleConsoleResourceLedger;
  isCurrent(): boolean;
}

export interface BattleConsoleMountRequest {
  readonly semanticHost: HTMLElement;
  readonly pixiHost: HTMLElement;
  readonly portalHosts?: BattleConsolePortalHosts;
  readonly initialState: BattleConsolePresentationState;
  readonly dispatch: (intent: BattleConsoleIntent) => void;
  readonly layout: ResponsiveLayoutProjection;
  readonly generationToken: BattleConsoleGenerationToken;
}

export interface BattleConsoleMountedGeneration {
  readonly generation: number;
  readonly status: Extract<BattleConsoleLifecycleStatus, 'ready' | 'fallback'>;
  snapshot(): BattleConsoleResourceSnapshot;
  update(state: BattleConsolePresentationState, layout: ResponsiveLayoutProjection): void;
  destroy(): Promise<BattleConsoleResourceSnapshot>;
}

export interface BattleConsoleMountModule {
  mountBattleConsoleGeneration(
    request: BattleConsoleMountRequest,
  ): Promise<BattleConsoleMountedGeneration | null>;
}

function responsiveLayoutsEqual(
  left: ResponsiveLayoutProjection,
  right: ResponsiveLayoutProjection,
): boolean {
  return left === right || (
    left.mode === right.mode
    && left.scale === right.scale
    && left.cssWidth === right.cssWidth
    && left.cssHeight === right.cssHeight
    && left.backingWidth === right.backingWidth
    && left.backingHeight === right.backingHeight
    && left.devicePixelRatio === right.devicePixelRatio
    && left.cssGeometryChangesWithDpr === right.cssGeometryChangesWithDpr
    && left.landmarkCount === right.landmarkCount
    && left.socketCount === right.socketCount
  );
}

/**
 * Publishes the generation's sole semantic owner before starting optional Pixi
 * decoration. State and layout updates remain live throughout that async work.
 */
export async function mountBattleConsoleGeneration({
  semanticHost,
  pixiHost,
  portalHosts,
  initialState,
  dispatch,
  layout,
  generationToken,
}: BattleConsoleMountRequest): Promise<BattleConsoleMountedGeneration | null> {
  const { resources } = generationToken;
  if (!generationToken.isCurrent() || resources.closed) return null;

  const semanticLeases: BattleConsoleResourceLease[] = [];
  const decorationController = new AbortController();
  let pixi: BattleConsolePixiAdapter | null = null;
  let state = initialState;
  let projectedLayout = layout;
  let status: Extract<BattleConsoleLifecycleStatus, 'ready' | 'fallback'> = 'ready';
  let texturesReady = false;
  let decorationPending = true;
  let destroyed = false;
  let destroyPromise: Promise<BattleConsoleResourceSnapshot> | null = null;
  let decorationPromise: Promise<void> = Promise.resolve();
  const surface = semanticHost.parentElement?.hasAttribute('data-battle-console-surface')
    ? semanticHost.parentElement
    : null;

  const publishSurfaceStatus = (nextStatus: BattleConsoleLifecycleStatus) => {
    if (!surface) return;
    surface.dataset['battleConsoleGeneration'] = String(generationToken.generation);
    surface.dataset['battleConsoleReady'] = nextStatus === 'ready' || nextStatus === 'fallback' ? 'true' : 'false';
    surface.dataset['battleConsoleTexturesReady'] = texturesReady ? 'true' : 'false';
    surface.dataset['battleConsolePendingResources'] = decorationPending ? '1' : '0';
  };

  const guardedDispatch = (intent: BattleConsoleIntent) => {
    if (generationToken.isCurrent() && !resources.closed && !destroyed) dispatch(intent);
  };
  const renderSemanticRoot = (nextStatus: BattleConsoleLifecycleStatus) => {
    render(
      <BattleConsoleRoot
        state={state}
        lifecycleStatus={nextStatus}
        dispatch={guardedDispatch}
        portalHosts={portalHosts}
        classNames={battleConsoleClassNames}
        layoutMode={projectedLayout.mode}
        scale={projectedLayout.scale}
      />,
      semanticHost,
    );
  };
  const destroyOwnedResources = async (): Promise<BattleConsoleResourceSnapshot> => {
    if (!destroyed) {
      destroyed = true;
      resources.close();
      decorationController.abort();
      decorationPending = false;
      texturesReady = false;
      publishSurfaceStatus('destroyed');
      render(null, semanticHost);
      await decorationPromise;
      await pixi?.destroy();
      pixi = null;
      pixiHost.replaceChildren();
      for (const lease of semanticLeases) lease.release();
    }
    return resources.snapshot();
  };

  try {
    semanticLeases.push(
      resources.acquire('preactRoots'),
      resources.acquire('portalOwners'),
      resources.acquire('portalOwners'),
      resources.acquire('semanticKeySets'),
      resources.acquire('intentBridges'),
      resources.acquire('controllerAdapters'),
    );
    renderSemanticRoot(status);
    publishSurfaceStatus(status);

    const mounted: BattleConsoleMountedGeneration = {
      generation: generationToken.generation,
      get status() {
        return status;
      },
      snapshot: () => resources.snapshot(),
      update(nextState, nextLayout) {
        if (!generationToken.isCurrent() || resources.closed || destroyed) return;
        const stateChanged = !battleConsolePresentationStatesEqual(state, nextState);
        const layoutChanged = !responsiveLayoutsEqual(projectedLayout, nextLayout);
        if (!stateChanged && !layoutChanged) return;
        state = nextState;
        projectedLayout = nextLayout;
        pixi?.project(projectedLayout, state);
        renderSemanticRoot(status);
      },
      destroy() {
        destroyPromise ??= destroyOwnedResources();
        return destroyPromise;
      },
    };

    decorationPromise = (async () => {
      try {
        const candidate = await createBattleConsolePixiAdapter({
          state,
          host: pixiHost,
          layout: projectedLayout,
          resources,
          signal: decorationController.signal,
          isCurrentGeneration: () => generationToken.isCurrent() && !destroyed,
          onContextLoss: () => {
            if (!generationToken.isCurrent() || resources.closed || destroyed) return;
            pixi = null;
            pixiHost.replaceChildren();
            texturesReady = false;
            decorationPending = false;
            status = 'fallback';
            renderSemanticRoot(status);
            publishSurfaceStatus(status);
          },
        });
        if (!candidate || !generationToken.isCurrent() || resources.closed || destroyed) {
          await candidate?.destroy();
          return;
        }
        candidate.project(projectedLayout, state);
        pixi = candidate;
        texturesReady = true;
      } catch (error) {
        if (generationToken.isCurrent() && !resources.closed && !destroyed) {
          console.error('[battle-console] Pixi chrome entered semantic fallback', error);
          pixiHost.replaceChildren();
          status = 'fallback';
          renderSemanticRoot(status);
        }
      } finally {
        decorationPending = false;
        if (!destroyed) publishSurfaceStatus(status);
      }
    })();

    return mounted;
  } catch (error) {
    await destroyOwnedResources();
    throw error;
  }
}
