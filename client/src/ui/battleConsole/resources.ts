export const battleConsoleResourceClasses = [
  'preactRoots',
  'portalOwners',
  'semanticKeySets',
  'effects',
  'timers',
  'refs',
  'observers',
  'domListeners',
  'intentBridges',
  'controllerAdapters',
  'pixiControllers',
  'pixiApplications',
  'canvases',
  'gpuContexts',
  'textures',
  'loaders',
  'pendingImports',
  'pendingPromises',
  'loadResources',
] as const;

export type BattleConsoleResourceClass = (typeof battleConsoleResourceClasses)[number];
export type BattleConsoleResourceSnapshot = Readonly<Record<BattleConsoleResourceClass, number>>;

export interface BattleConsoleResourceLease {
  readonly resourceClass: BattleConsoleResourceClass;
  readonly released: boolean;
  release(): void;
}

interface BattleConsoleResourceWaiter<T> {
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export interface BattleConsoleResourceWaitOptions {
  readonly resources: BattleConsoleResourceLedger;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly description: string;
}

function terminalWaitError(message: string, name: 'AbortError' | 'TimeoutError'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * A removable generation-local wait boundary around a process-owned async resource.
 * Listener, timer, and ledger ownership is released before the caller settles.
 */
export class BattleConsoleResourceWaiterSet<T> {
  readonly #waiters = new Set<BattleConsoleResourceWaiter<T>>();

  get size(): number {
    return this.#waiters.size;
  }

  wait({
    resources,
    signal,
    timeoutMs,
    description,
  }: BattleConsoleResourceWaitOptions): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(terminalWaitError(`${description} was cancelled`, 'AbortError'));
    }

    const promiseLease = resources.acquire('pendingPromises');
    const loaderLease = resources.acquire('loaders');
    const loadResourceLease = resources.acquire('loadResources');
    const listenerLease = resources.acquire('domListeners');
    const timerLease = resources.acquire('timers');

    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;
      const finish = (outcome: 'resolve' | 'reject', value: T | unknown) => {
        if (settled) return;
        settled = true;
        this.#waiters.delete(waiter);
        signal.removeEventListener('abort', abort);
        if (timer !== null) clearTimeout(timer);
        timerLease.release();
        listenerLease.release();
        loadResourceLease.release();
        loaderLease.release();
        promiseLease.release();
        if (outcome === 'resolve') resolve(value as T);
        else reject(value);
      };
      const abort = () => finish(
        'reject',
        terminalWaitError(`${description} was cancelled`, 'AbortError'),
      );
      const waiter: BattleConsoleResourceWaiter<T> = {
        resolve: (value) => finish('resolve', value),
        reject: (reason) => finish('reject', reason),
      };

      this.#waiters.add(waiter);
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish(
        'reject',
        terminalWaitError(`${description} exceeded ${timeoutMs}ms`, 'TimeoutError'),
      ), timeoutMs);
    });
  }

  resolve(value: T): void {
    for (const waiter of [...this.#waiters]) waiter.resolve(value);
  }

  reject(reason: unknown): void {
    for (const waiter of [...this.#waiters]) waiter.reject(reason);
  }
}

function emptySnapshot(): Record<BattleConsoleResourceClass, number> {
  return Object.fromEntries(
    battleConsoleResourceClasses.map((resourceClass) => [resourceClass, 0]),
  ) as Record<BattleConsoleResourceClass, number>;
}

/**
 * Observable, generation-local resource ownership.
 *
 * Every acquisition returns one idempotent lease. Destroying a generation
 * closes acquisition, while actual teardown releases the leases it owns. Late
 * async completions cannot acquire against a closed ledger and therefore cannot
 * resurrect Pixi or semantic resources. A closed snapshot stays non-zero until
 * its outstanding owners have really released their leases.
 */
export class BattleConsoleResourceLedger {
  readonly #counts = emptySnapshot();
  readonly #leases = new Set<BattleConsoleResourceLease>();
  #closed = false;

  get closed(): boolean {
    return this.#closed;
  }

  acquire(resourceClass: BattleConsoleResourceClass): BattleConsoleResourceLease {
    if (this.#closed) {
      throw new Error(`Cannot acquire ${resourceClass} for a destroyed battle-console generation`);
    }

    this.#counts[resourceClass] += 1;
    let released = false;
    const ledger = this;
    const lease: BattleConsoleResourceLease = {
      resourceClass,
      get released() {
        return released;
      },
      release() {
        if (released) return;
        released = true;
        ledger.#counts[resourceClass] -= 1;
        ledger.#leases.delete(lease);
      },
    };
    this.#leases.add(lease);
    return lease;
  }

  snapshot(): BattleConsoleResourceSnapshot {
    return Object.freeze({ ...this.#counts });
  }

  close(): BattleConsoleResourceSnapshot {
    this.#closed = true;
    return this.snapshot();
  }
}

export function resourcesAreZero(snapshot: BattleConsoleResourceSnapshot): boolean {
  return battleConsoleResourceClasses.every((resourceClass) => snapshot[resourceClass] === 0);
}
