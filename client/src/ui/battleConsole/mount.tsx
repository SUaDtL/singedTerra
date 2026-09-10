import { render } from 'preact';
import retirementContract from '../../../../.codearbiter/contracts/battle-console/ownership/retirement.json';
import styleScopeContract from '../../../../.codearbiter/contracts/battle-console/topology/style-scope.json';
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

/**
 * Locked migration closure used by the product verifier. The large contract
 * payload remains tree-shakeable because runtime mounting never reads it.
 */
export const retirementManifest = Object.freeze({
  records: retirementContract.records,
  behaviorSelectorPaths: Object.freeze([]),
  cssModulePath: styleScopeContract.replacement.cssModulePath,
  globalSelectors: styleScopeContract.globalHostRules.selectorAllowlist,
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
 * Commits one generation-scoped Preact root and its optional inert Pixi layer.
 * A stale token can never publish DOM, dispatch an intent, or retain resources.
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
  let pixi: BattleConsolePixiAdapter | null = null;
  let state = initialState;
  let projectedLayout = layout;
  let status: Extract<BattleConsoleLifecycleStatus, 'ready' | 'fallback'> = 'ready';
  let destroyPromise: Promise<BattleConsoleResourceSnapshot> | null = null;
  const surface = semanticHost.parentElement?.hasAttribute('data-battle-console-surface')
    ? semanticHost.parentElement
    : null;

  const publishSurfaceStatus = (nextStatus: BattleConsoleLifecycleStatus) => {
    if (!surface) return;
    surface.dataset['battleConsoleGeneration'] = String(generationToken.generation);
    surface.dataset['battleConsoleReady'] = nextStatus === 'ready' || nextStatus === 'fallback' ? 'true' : 'false';
    surface.dataset['battleConsoleTexturesReady'] = nextStatus === 'ready' || nextStatus === 'fallback' ? 'true' : 'false';
    surface.dataset['battleConsoleRetiredRecords'] = String(retirementContract.records.length);
    surface.dataset['battleConsolePendingResources'] = nextStatus === 'loading' ? '1' : '0';
  };

  const guardedDispatch = (intent: BattleConsoleIntent) => {
    if (generationToken.isCurrent() && !resources.closed) dispatch(intent);
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
    publishSurfaceStatus('destroyed');
    render(null, semanticHost);
    await pixi?.destroy();
    pixi = null;
    pixiHost.replaceChildren();
    for (const lease of semanticLeases) lease.release();
    return resources.close();
  };

  try {
    publishSurfaceStatus('loading');
    semanticLeases.push(
      resources.acquire('preactRoots'),
      resources.acquire('portalOwners'),
      resources.acquire('portalOwners'),
      resources.acquire('semanticKeySets'),
      resources.acquire('intentBridges'),
      resources.acquire('controllerAdapters'),
    );
    renderSemanticRoot('loading');

    try {
      pixi = await createBattleConsolePixiAdapter({
        state,
        host: pixiHost,
        layout,
        resources,
        isCurrentGeneration: () => generationToken.isCurrent(),
        onContextLoss: () => {
          if (!generationToken.isCurrent() || resources.closed) return;
          pixi = null;
          pixiHost.replaceChildren();
          status = 'fallback';
          renderSemanticRoot(status);
          publishSurfaceStatus(status);
        },
      });
    } catch (error) {
      console.error('[battle-console] Pixi chrome entered semantic fallback', error);
      pixi = null;
      pixiHost.replaceChildren();
      status = 'fallback';
    }

    if (!generationToken.isCurrent() || resources.closed) {
      await destroyOwnedResources();
      return null;
    }

    renderSemanticRoot(status);
    publishSurfaceStatus(status);
    return {
      generation: generationToken.generation,
      get status() {
        return status;
      },
      snapshot: () => resources.snapshot(),
      update(nextState, nextLayout) {
        if (!generationToken.isCurrent() || resources.closed) return;
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
  } catch (error) {
    await destroyOwnedResources();
    throw error;
  }
}
