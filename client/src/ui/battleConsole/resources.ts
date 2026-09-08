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

function emptySnapshot(): Record<BattleConsoleResourceClass, number> {
  return Object.fromEntries(
    battleConsoleResourceClasses.map((resourceClass) => [resourceClass, 0]),
  ) as Record<BattleConsoleResourceClass, number>;
}

/**
 * Observable, generation-local resource ownership.
 *
 * Every acquisition returns one idempotent lease. Destroying a generation
 * releases the leases it owns; late async completions cannot acquire against a
 * closed ledger and therefore cannot resurrect Pixi or semantic resources.
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
    if (!this.#closed) {
      this.#closed = true;
      for (const lease of [...this.#leases]) lease.release();
    }
    return this.snapshot();
  }
}

export function resourcesAreZero(snapshot: BattleConsoleResourceSnapshot): boolean {
  return battleConsoleResourceClasses.every((resourceClass) => snapshot[resourceClass] === 0);
}
