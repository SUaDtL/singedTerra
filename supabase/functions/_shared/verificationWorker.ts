import { acquireVerificationComputeLease, confirmVerificationComputeLease, releaseEndedVerificationComputeLease,
  type VerificationLeaseRequest, type VerificationComputeLease, type VerificationLeaseRpc, type VerificationLeaseAdmission } from './verificationComputeLease.ts'

/** Native synchronous execution. This module does not create/terminate workers,
 * interrupt replay, or acknowledge remote death. Elapsed time is an acceptance
 * gate; the shared database cooldown covers uncertain unreturned invocations. */
export const NATIVE_VERIFICATION_ACCEPTANCE_MS = 1000
export interface NativeVerificationDependencies {
  readonly rpc: VerificationLeaseRpc
  readonly wallNow?: () => number
  readonly now?: () => number
  readonly setup: () => unknown
  readonly replay: (setup: unknown) => unknown
  /** Return validated evidence, or null for deterministic invalidity. Work-limit
   * evidence can be a valid terminal non-awarding result for fenced finalization. */
  readonly validate: (result: unknown) => unknown
  /** Map only known deterministic replay exceptions; unknown exceptions stay
   * unavailable. This predicate is synchronous and included in elapsed time. */
  readonly isInvalidReplayError?: (error: unknown) => boolean
  /** Dispatch the fenced database operation directly. All evidence preparation
   * belongs in validate; do not insert asynchronous work before this dispatch. */
  readonly finalize: (evidence: unknown, lease: VerificationComputeLease) => Promise<unknown>
  readonly onInvalid?: (lease: VerificationComputeLease) => Promise<boolean>
}
type NativeResult = Exclude<VerificationLeaseAdmission, { kind: 'lease' }>
  | Readonly<{ kind: 'completed'; value: unknown; elapsedMs: number }>
  | Readonly<{ kind: 'replay_invalid'; elapsedMs: number }>
  | Readonly<{ kind: 'unavailable'; reason: string; elapsedMs?: number }>
export type NativeVerificationResult = NativeResult & Readonly<{ cleanup: 'not_needed' | 'released' | 'not_current' | 'unavailable' | 'retained' }>

function thenable(value: unknown): boolean {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { then?: unknown }).then === 'function'
}
class UncertainNativeExecution extends Error {}
function finalization(value: unknown): value is { ok: true; value: unknown } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Reflect.ownKeys(value).length === 2 && Object.hasOwn(value, 'ok') && Object.hasOwn(value, 'value')
    && (value as { ok: unknown }).ok === true
    && (value as { value: unknown }).value !== null && (value as { value: unknown }).value !== undefined
}

export async function runNativeVerification(request: VerificationLeaseRequest, dependencies: NativeVerificationDependencies): Promise<NativeVerificationResult> {
  const admission = await acquireVerificationComputeLease(request, dependencies.rpc, dependencies.wallNow)
  if (admission.kind !== 'lease') return Object.freeze({ ...admission, cleanup: 'not_needed' })
  const lease = admission.lease
  let ended = true
  const synchronous = (operation: () => unknown): unknown => {
    ended = false
    let value: unknown
    try { value = operation() }
    catch (error) { ended = true; throw error }
    try {
      if (thenable(value)) throw new UncertainNativeExecution()
    } catch { throw new UncertainNativeExecution() }
    ended = true
    return value
  }
  const now = dependencies.now ?? (() => performance.now())
  const execute = async (): Promise<NativeResult> => {
    const current = await confirmVerificationComputeLease(lease, dependencies.rpc)
    if (current !== 'current') return { kind: 'unavailable', reason: current === 'lost' ? 'fence_lost' : 'lease_unavailable' }
    let start: number
    let evidence: unknown
    let stage: 'setup' | 'replay' | 'validation' = 'setup'
    try {
      start = now()
      if (!Number.isFinite(start) || start < 0) return { kind: 'unavailable', reason: 'clock_unavailable' }
      const setup = synchronous(dependencies.setup)
      stage = 'replay'
      const replayed = synchronous(() => dependencies.replay(setup))
      stage = 'validation'
      evidence = synchronous(() => dependencies.validate(replayed))
    } catch (error) {
      if (error instanceof UncertainNativeExecution) return { kind: 'unavailable', reason: 'asynchronous_replay_forbidden' }
      // A synchronous throw ended this invocation. No raw details are returned.
      ended = true
      if (stage !== 'replay' || !dependencies.isInvalidReplayError) return { kind: 'unavailable', reason: 'execution_unavailable' }
      try {
        const invalid = synchronous(() => dependencies.isInvalidReplayError!(error))
        if (invalid !== true) return { kind: 'unavailable', reason: 'execution_unavailable' }
      } catch (classificationError) { return { kind: 'unavailable', reason: classificationError instanceof UncertainNativeExecution
        ? 'asynchronous_replay_forbidden' : 'execution_unavailable' } }
      evidence = null
    }
    // No await occurs between this last acceptance check and dispatch below.
    const elapsedMs = now() - start!
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return { kind: 'unavailable', reason: 'clock_unavailable' }
    if (elapsedMs >= NATIVE_VERIFICATION_ACCEPTANCE_MS) return { kind: 'unavailable', reason: 'acceptance_deadline', elapsedMs }
    if (evidence === null || evidence === undefined) {
      if (dependencies.onInvalid && await dependencies.onInvalid(lease) !== true)
        return { kind: 'unavailable', reason: 'rejection_unavailable', elapsedMs }
      return { kind: 'replay_invalid', elapsedMs }
    }
    const committed = await dependencies.finalize(evidence, lease)
    return finalization(committed) ? { kind: 'completed', value: committed.value, elapsedMs }
      : { kind: 'unavailable', reason: 'finalization_unavailable', elapsedMs }
  }
  let result: NativeResult
  try { result = await execute() }
  catch { result = { kind: 'unavailable', reason: 'execution_unavailable' } }
  const cleanup = ended ? await releaseEndedVerificationComputeLease(lease, dependencies.rpc) : 'retained'
  // An immutable successful receipt remains successful if cleanup later fails.
  return Object.freeze({ ...result, cleanup })
}
