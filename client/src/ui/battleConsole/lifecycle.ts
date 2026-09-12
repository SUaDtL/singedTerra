import {
  battleConsoleResourceClasses,
  BattleConsoleResourceLedger,
  type BattleConsoleResourceSnapshot,
} from './resources';
import type { ResponsiveLayoutProjection } from './projection';
import type {
  BattleConsoleMountModule,
  BattleConsoleMountedGeneration,
  BattleConsoleMountRequest,
} from './mount';
import type {
  BattleConsoleLifecycleStatus,
  BattleConsolePresentationState,
} from './types';

class GenerationGuard {
  #generation = 0;
  #active: number | null = null;

  start(): number {
    this.#generation += 1;
    this.#active = this.#generation;
    return this.#generation;
  }

  invalidate(): void {
    this.#active = null;
  }

  isCurrent(generation: number): boolean {
    return this.#active === generation;
  }
}

export type BattleConsoleLifecycleEnterRequest = Omit<BattleConsoleMountRequest, 'generationToken'>;

export interface BattleConsoleLifecycleEntryResult {
  readonly generation: number;
  readonly committed: boolean;
  readonly status: BattleConsoleLifecycleStatus;
  readonly resources: BattleConsoleResourceSnapshot;
}

export interface BattleConsoleLifecycleSnapshot {
  readonly activeGeneration: number | null;
  readonly status: BattleConsoleLifecycleStatus;
  readonly resources: BattleConsoleResourceSnapshot;
}

export interface BattleConsoleLifecycleController {
  enter(request: BattleConsoleLifecycleEnterRequest): Promise<BattleConsoleLifecycleEntryResult>;
  restart(request: BattleConsoleLifecycleEnterRequest): Promise<BattleConsoleLifecycleEntryResult>;
  update(state: BattleConsolePresentationState, layout: ResponsiveLayoutProjection): void;
  destroy(): Promise<BattleConsoleResourceSnapshot>;
  snapshot(): BattleConsoleLifecycleSnapshot;
}

export interface BattleConsoleLifecycleDependencies {
  readonly loadMount?: () => Promise<BattleConsoleMountModule>;
}

interface ActiveGeneration {
  readonly generation: number;
  readonly resources: BattleConsoleResourceLedger;
  current: boolean;
  mounted: BattleConsoleMountedGeneration | null;
  mounting: Promise<BattleConsoleMountedGeneration | null> | null;
  cleanup: Promise<BattleConsoleResourceSnapshot> | null;
}

const zeroResourceSnapshot = Object.freeze(Object.fromEntries(
  battleConsoleResourceClasses.map((resourceClass) => [resourceClass, 0]),
)) as BattleConsoleResourceSnapshot;

/** Production lifecycle trigger API; P-08 connects real battle enter/leave routes to it. */
export function createBattleConsoleLifecycle({
  loadMount = () => import('./mount'),
}: BattleConsoleLifecycleDependencies = {}): BattleConsoleLifecycleController {
  let generationCounter = 0;
  let active: ActiveGeneration | null = null;
  let status: BattleConsoleLifecycleStatus = 'unmounted';
  let lastResources = zeroResourceSnapshot;
  let cleanupBarrier: Promise<void> = Promise.resolve();

  const cleanupGeneration = (generation: ActiveGeneration): Promise<BattleConsoleResourceSnapshot> => {
    generation.current = false;
    generation.cleanup ??= (async () => {
      try {
        // A mount can already own DOM and shared Pixi assets before returning.
        // Let its stale-generation cleanup finish before another mount reuses them.
        const mounted = generation.mounted ?? await generation.mounting?.catch(() => null);
        if (mounted) await mounted.destroy();
      } finally {
        lastResources = generation.resources.close();
      }
      return lastResources;
    })();
    return generation.cleanup;
  };

  const invalidateActive = (nextStatus: BattleConsoleLifecycleStatus): Promise<void> => {
    const predecessor = active;
    active = null;
    status = nextStatus;
    if (predecessor) {
      cleanupBarrier = Promise.all([cleanupBarrier, cleanupGeneration(predecessor)]).then(() => undefined);
    }
    return cleanupBarrier;
  };

  const enter = async (
    request: BattleConsoleLifecycleEnterRequest,
  ): Promise<BattleConsoleLifecycleEntryResult> => {
    const generation = ++generationCounter;
    const predecessorCleanup = invalidateActive('loading');
    await predecessorCleanup;

    if (generation !== generationCounter) {
      return Object.freeze({
        generation,
        committed: false,
        status: 'destroyed',
        resources: lastResources,
      });
    }

    const resources = new BattleConsoleResourceLedger();
    const record: ActiveGeneration = {
      generation,
      resources,
      current: true,
      mounted: null,
      mounting: null,
      cleanup: null,
    };
    active = record;
    const pendingImport = resources.acquire('pendingImports');
    const pendingPromise = resources.acquire('pendingPromises');
    const loadResource = resources.acquire('loadResources');

    try {
      const mountModule = await loadMount();
      pendingImport.release();
      loadResource.release();
      if (!record.current || active !== record || resources.closed) {
        pendingPromise.release();
        lastResources = resources.close();
        return Object.freeze({ generation, committed: false, status: 'destroyed', resources: lastResources });
      }

      record.mounting = mountModule.mountBattleConsoleGeneration({
        ...request,
        generationToken: {
          generation,
          resources,
          isCurrent: () => record.current && active === record && !resources.closed,
        },
      });
      const mounted = await record.mounting;
      pendingPromise.release();

      if (!record.current || active !== record || resources.closed || !mounted) {
        if (record.cleanup) await record.cleanup;
        else if (mounted) await mounted.destroy();
        lastResources = resources.close();
        return Object.freeze({ generation, committed: false, status: 'destroyed', resources: lastResources });
      }

      record.mounted = mounted;
      status = mounted.status;
      return Object.freeze({
        generation,
        committed: true,
        status,
        resources: resources.snapshot(),
      });
    } catch {
      pendingImport.release();
      pendingPromise.release();
      loadResource.release();
      record.current = false;
      const failedCurrentGeneration = generation === generationCounter && active === record;
      if (failedCurrentGeneration) active = null;
      lastResources = resources.close();
      if (failedCurrentGeneration) status = 'fallback';
      return Object.freeze({
        generation,
        committed: false,
        status: failedCurrentGeneration ? 'fallback' : 'destroyed',
        resources: lastResources,
      });
    }
  };

  return Object.freeze({
    enter,
    restart: enter,
    update(
      nextState: BattleConsolePresentationState,
      nextLayout: ResponsiveLayoutProjection,
    ) {
      if (!active?.current || !active.mounted) return;
      active.mounted.update(nextState, nextLayout);
      status = active.mounted.status;
    },
    async destroy() {
      generationCounter += 1;
      await invalidateActive('destroyed');
      return lastResources;
    },
    snapshot() {
      return Object.freeze({
        activeGeneration: active?.current ? active.generation : null,
        status: active?.mounted?.status ?? status,
        resources: active?.resources.snapshot() ?? lastResources,
      });
    },
  });
}
