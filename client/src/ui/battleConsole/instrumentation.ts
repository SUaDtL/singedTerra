export interface BattleConsoleWorkMeasurement {
  readonly renders: number;
  readonly resizes: number;
  readonly allocations: number;
}

export interface InvalidationInput {
  readonly changedFields: readonly string[];
}

const ZERO_WORK: BattleConsoleWorkMeasurement = Object.freeze({
  renders: 0,
  resizes: 0,
  allocations: 0,
});

export const invalidationPolicy = Object.freeze({
  measure({ changedFields }: InvalidationInput): BattleConsoleWorkMeasurement {
    const uniqueFields = new Set(changedFields);
    if (uniqueFields.size === 0) return ZERO_WORK;
    return Object.freeze({
      renders: 1,
      resizes: uniqueFields.has('layoutMode') ? 1 : 0,
      allocations: 0,
    });
  },
});

export class BattleConsoleInstrumentation {
  #renders = 0;
  #resizes = 0;
  #allocations = 0;

  record(input: InvalidationInput): BattleConsoleWorkMeasurement {
    const work = invalidationPolicy.measure(input);
    this.#renders += work.renders;
    this.#resizes += work.resizes;
    this.#allocations += work.allocations;
    return work;
  }

  snapshot(): BattleConsoleWorkMeasurement {
    return Object.freeze({
      renders: this.#renders,
      resizes: this.#resizes,
      allocations: this.#allocations,
    });
  }
}
