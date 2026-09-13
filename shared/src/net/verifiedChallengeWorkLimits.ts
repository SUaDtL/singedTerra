import type { VerificationWorkLimits } from '../engine/VerificationWorkBudget.ts'

/** cq1 internal source-work limits v1. No request/descriptor overrides exist.
 * Derivation: docs/compatibility/cq1-work-limits.md. These finite logical-work
 * caps do not certify affordable elapsed time; admission stays disabled until
 * strict corpus timing and separately authorized hosted resource proof pass. */
const limits = {
  engineTicks: 30055, cpuProbes: 120, cpuCandidates: 480,
  sweepSegments: 60110, sweepSamples: 751375, collisionChecks: 781430,
  terrainCells: 93382502, terrainSteps: 282672, engineSteps: 1689583,
  allocatedBytes: 87438792, copiedBytes: 86400000,
} as const
export const VERIFIED_CHALLENGE_WORK_LIMITS: VerificationWorkLimits = Object.freeze({
  ...limits, totalUnits: Object.values(limits).reduce((sum, count) => sum + count, 0),
})
