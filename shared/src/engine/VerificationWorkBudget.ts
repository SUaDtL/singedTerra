/** Opt-in deterministic accounting. Infrastructure time and host memory are
 * separate limits: these units describe source work, not elapsed milliseconds.
 * Call before each unit/bulk allocation. An exhausted computation cannot resume.
 * The trusted retained-artifact adapter owns the complete limits, never a wire
 * descriptor or caller-supplied partial override. No defaults imply admission. */
export const VERIFICATION_WORK_KINDS = Object.freeze([
  'engineTicks', 'cpuProbes', 'cpuCandidates', 'sweepSegments', 'sweepSamples',
  'collisionChecks', 'terrainCells', 'terrainSteps', 'engineSteps',
  'allocatedBytes', 'copiedBytes',
] as const)
export type VerificationWorkKind = typeof VERIFICATION_WORK_KINDS[number]
export type VerificationWorkLimits = Readonly<Record<VerificationWorkKind | 'totalUnits', number>>
export type VerificationWorkSnapshot = VerificationWorkLimits

function workIndex(kind: VerificationWorkKind): number {
  switch (kind) {
    case 'terrainCells': return 6
    case 'engineTicks': return 0
    case 'cpuProbes': return 1
    case 'cpuCandidates': return 2
    case 'sweepSegments': return 3
    case 'sweepSamples': return 4
    case 'collisionChecks': return 5
    case 'terrainSteps': return 7
    case 'engineSteps': return 8
    case 'allocatedBytes': return 9
    case 'copiedBytes': return 10
    default: return -1
  }
}

export class VerificationWorkLimitError extends Error {
  readonly code = 'work_limit'
  constructor(readonly kind: VerificationWorkKind | 'totalUnits') {
    super('verification_work_limit')
    this.name = 'VerificationWorkLimitError'
  }
}

export class VerificationWorkBudget {
  private readonly limits: Float64Array
  private readonly used = new Float64Array(VERIFICATION_WORK_KINDS.length)
  private readonly totalLimit: number
  private totalUsed = 0
  private exhausted: VerificationWorkLimitError | null = null

  constructor(limits: VerificationWorkLimits) {
    const keys = [...VERIFICATION_WORK_KINDS, 'totalUnits'] as const
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)
      || Object.keys(limits).length !== keys.length
      || keys.some((key) => !Object.hasOwn(limits, key)
        || !Number.isSafeInteger(limits[key]) || limits[key] < 0)) {
      throw new Error('invalid_verification_work_limits')
    }
    this.limits = Float64Array.from(VERIFICATION_WORK_KINDS, (key) => limits[key])
    this.totalLimit = limits.totalUnits
  }

  charge(kind: VerificationWorkKind, units = 1): void {
    if (this.exhausted) throw this.exhausted
    // Numeric slots keep the millions of pixel charges off polymorphic object
    // property reads/writes. Every individual charge still checks both limits.
    const index = workIndex(kind)
    if (index < 0 || !Number.isSafeInteger(units) || units < 0)
      throw new Error('invalid_verification_work_charge')
    const failed = units > this.limits[index]! - this.used[index]! ? kind
      : units > this.totalLimit - this.totalUsed ? 'totalUnits' : null
    if (failed) {
      this.exhausted = new VerificationWorkLimitError(failed)
      throw this.exhausted
    }
    this.used[index] = this.used[index]! + units
    this.totalUsed += units
  }

  snapshot(): VerificationWorkSnapshot {
    return Object.freeze({
      ...Object.fromEntries(VERIFICATION_WORK_KINDS.map((key, index) => [key, this.used[index]!])),
      totalUnits: this.totalUsed,
    }) as VerificationWorkSnapshot
  }
}
