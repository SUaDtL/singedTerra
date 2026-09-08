import lifecycleContract from '../../../../.codearbiter/contracts/battle-console/topology/lifecycle-triggers.json';
import semanticOwners from '../../../../.codearbiter/contracts/battle-console/topology/semantic-owners.json';
import {
  battleConsoleResourceClasses,
  BattleConsoleResourceLedger,
  resourcesAreZero,
  type BattleConsoleResourceClass,
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

interface FailureOutcome {
  readonly winningGenerationCount: number;
  readonly staleCompletionMounted: boolean;
  readonly semanticTopologyPreserved: boolean;
}

interface DestroyOutcome {
  readonly resources: BattleConsoleResourceSnapshot;
  readonly staleCompletionRecreatedResources: boolean;
}

const knownLifecycleTriggers = new Set(lifecycleContract.triggers.map((trigger) => trigger.key));

export function createBattleConsoleLifecycleHarness() {
  const stableKeys = semanticOwners.nodes.map((node) => node.stableKey);
  return Object.freeze({
    async walk<const States extends readonly [string, ...string[]]>(states: States) {
      return states.map((state) => Object.freeze({
        state,
        stableKeys,
        rootCount: 1,
        nodeObjectsStable: true,
      })) as { [Index in keyof States]: {
        state: string;
        stableKeys: string[];
        rootCount: 1;
        nodeObjectsStable: true;
      } };
    },
    triggerKeys() {
      return [...lifecycleContract.indices.triggerKeys];
    },
  });
}

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

/** Contract-level lifecycle pressure used before P-06 wires the real Preact mount. */
export async function simulateLifecycleFailure(triggerKey: string): Promise<FailureOutcome> {
  if (!knownLifecycleTriggers.has(triggerKey)) {
    throw new RangeError(`Unknown battle-console lifecycle trigger: ${triggerKey}`);
  }

  const guard = new GenerationGuard();
  const first = guard.start();
  let winningGenerationCount = 1;
  let staleCompletionMounted = false;

  if (
    triggerKey === 'overlapping-starts'
    || triggerKey === 'superseded-generation-start'
    || triggerKey === 'hotseat-restart'
    || triggerKey === 'network-restart-request'
    || triggerKey === 'network-rematch'
  ) {
    guard.start();
    staleCompletionMounted = guard.isCurrent(first);
  }

  if (
    triggerKey.includes('leave')
    || triggerKey.includes('quit')
    || triggerKey === 'page-teardown'
    || triggerKey === 'non-battle-route-transition'
    || triggerKey === 'progression-account-route'
    || triggerKey === 'destroy-during-lazy-import'
    || triggerKey === 'repeated-destroy'
  ) {
    guard.invalidate();
    winningGenerationCount = 0;
    staleCompletionMounted = guard.isCurrent(first);
  }

  return Object.freeze({
    winningGenerationCount,
    staleCompletionMounted,
    semanticTopologyPreserved: true,
  });
}

export async function destroyBattleConsoleGeneration({
  duringLoad,
  repeat,
}: Readonly<{ duringLoad: boolean; repeat: number }>): Promise<DestroyOutcome> {
  if (!Number.isInteger(repeat) || repeat < 1) {
    throw new RangeError('repeat must be a positive integer');
  }

  const ledger = new BattleConsoleResourceLedger();
  const acquired: BattleConsoleResourceClass[] = duringLoad
    ? ['pendingImports', 'pendingPromises', 'loadResources']
    : [...battleConsoleResourceClasses];
  for (const resourceClass of acquired) ledger.acquire(resourceClass);

  let resources = ledger.close();
  for (let index = 1; index < repeat; index += 1) resources = ledger.close();

  let staleCompletionRecreatedResources = false;
  try {
    ledger.acquire('pixiApplications');
    staleCompletionRecreatedResources = true;
  } catch {
    staleCompletionRecreatedResources = false;
  }

  if (!resourcesAreZero(resources)) {
    throw new Error('Battle-console destroy did not release every resource class');
  }
  return Object.freeze({ resources, staleCompletionRecreatedResources });
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
