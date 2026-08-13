import type { SupabaseClient } from '@supabase/supabase-js'
import type { VerifiedHumanFire } from '@shared/net/verifiedDuel'
import type { VerifiedDeploymentServerReceipt } from './verifiedDeployment'
import {
  PRODUCTION_DIAGNOSTIC_CHECKS,
  validateVerifiedReplayProbeResponse,
  type ProductionDiagnosticDescriptor,
  type RegisteredDiagnosticId,
} from './ProductionDiagnosticsRegistry'

export { PRODUCTION_DIAGNOSTIC_CHECKS, validateVerifiedReplayProbeResponse }
export type { RegisteredDiagnosticId }

type DiagnosticDescriptor = ProductionDiagnosticDescriptor
export type ProductionDiagnosticPublicDetails = ReturnType<
  ProductionDiagnosticDescriptor['projectPublicDetails']
>

export interface VerifiedReplayFixtureResult {
  readonly phase: 'GAME_OVER'
  readonly winner: 'p1' | 'p2'
  readonly winnerTeam: 2 | null
  readonly turn: number
  readonly actionCount: number
  readonly tickCount: number
  readonly maxTurnTickCount: number
}

export interface VerifiedReplayProbeResponse {
  readonly ok: true
  readonly probeVersion: 1
  readonly engineVersion: 1
  readonly rulesetVersion: 3
  readonly fixtures: {
    readonly maximumLifecycle: VerifiedReplayFixtureResult & { readonly winner: 'p2'; readonly winnerTeam: 2; readonly turn: 13; readonly actionCount: 15; readonly tickCount: 448; readonly maxTurnTickCount: 34 }
    readonly maximumTurn: VerifiedReplayFixtureResult & { readonly winner: 'p1'; readonly winnerTeam: null; readonly turn: 3; readonly actionCount: 4; readonly tickCount: 293; readonly maxTurnTickCount: 198 }
  }
}

export interface VerifiedReplayPublicDetails {
  readonly ok: true
  readonly probeVersion: 1
  readonly engineVersion: 1
  readonly rulesetVersion: 3
  readonly fixtures: {
    readonly maximumLifecycle: VerifiedReplayFixtureResult
    readonly maximumTurn: VerifiedReplayFixtureResult
  }
}

export type DiagnosticResultCode =
  | 'ok'
  | 'request_failed'
  | 'invalid_response'
  | 'invalid_check'
  | 'timeout'
  | 'run_in_progress'
  | 'not_authenticated'
  | 'disposed'

export type DiagnosticCheckResult =
  | {
      readonly id: RegisteredDiagnosticId
      readonly label: string
      readonly status: 'PASS'
      readonly code: 'ok'
      readonly details: ProductionDiagnosticPublicDetails
    }
  | {
      readonly id: RegisteredDiagnosticId
      readonly label: string
      readonly status: 'FAIL'
      readonly code: Exclude<DiagnosticResultCode, 'ok'>
    }

export type ProductionDiagnosticsReadiness =
  | 'unavailable'
  | 'loading'
  | 'anonymous'
  | 'authenticated-error'
  | 'authenticated'
  | 'signed-out'

export type ProductionDiagnosticsState =
  | { readonly status: 'IDLE' }
  | { readonly status: 'RUNNING' }
  | ProductionDiagnosticsTerminalState
  | DiagnosticCheckResult
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticated-error' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'disposed' }

export interface CompletionRetryAwardProof {
  readonly outcome: 'win' | 'loss' | 'draw'
  readonly verifiedXp: 100 | 200
  readonly matchesDelta: number
  readonly winsDelta: number
  readonly totalXpDelta: number
}

export type PagesProvenanceState =
  | { readonly status: 'idle' | 'RUNNING' }
  | { readonly status: 'PASS'; readonly sha: string; readonly runId: string }
  | { readonly status: 'FAIL'; readonly code: 'request_failed' | 'invalid_response' | 'timeout' | 'run_in_progress' | 'not_authenticated' | 'disposed' }

export type CompletionRetryProbeState =
  | { readonly status: 'idle' }
  | { readonly status: 'armed' }
  | { readonly status: 'response-discarded'; readonly expected: CompletionRetryAwardProof }
  | {
      readonly status: 'PASS'
      readonly sameEvidence: true
      readonly sameReceipt: true
      readonly award: CompletionRetryAwardProof
    }
  | { readonly status: 'FAIL'; readonly code: 'evidence_mismatch' | 'receipt_mismatch' }

type BoundedDiagnosticFailureCode = Exclude<DiagnosticResultCode, 'ok'>

export interface ProductionDiagnosticsPassReceiptResult {
  readonly id: RegisteredDiagnosticId
  readonly label: string
  readonly status: 'PASS'
  readonly code: 'ok'
  readonly details: ProductionDiagnosticPublicDetails
}

export interface ProductionDiagnosticsFailReceiptResult {
  readonly id: RegisteredDiagnosticId
  readonly label: string
  readonly status: 'FAIL'
  readonly code: BoundedDiagnosticFailureCode
  readonly details?: never
}

export type ProductionDiagnosticsTerminalState = DiagnosticCheckResult & {
  readonly results: readonly DiagnosticCheckResult[]
}

export type ProductionDiagnosticsReceipt =
  | {
      readonly schemaVersion: 1
      readonly overall: 'PASS'
      readonly results: readonly ProductionDiagnosticsPassReceiptResult[]
    }
  | {
      readonly schemaVersion: 1
      readonly overall: 'FAIL'
      readonly results: readonly (ProductionDiagnosticsPassReceiptResult | ProductionDiagnosticsFailReceiptResult)[]
    }

function boundedDiagnosticFailureCode(value: unknown): BoundedDiagnosticFailureCode {
  switch (value) {
    case 'request_failed':
    case 'invalid_response':
    case 'invalid_check':
    case 'timeout':
    case 'run_in_progress':
    case 'not_authenticated':
    case 'disposed':
      return value
    default:
      return 'invalid_response'
  }
}

export function productionDiagnosticsReceiptForState(
  state: ProductionDiagnosticsState,
): ProductionDiagnosticsReceipt | undefined {
  if (state.status !== 'PASS' && state.status !== 'FAIL') return undefined

  const candidateResults = 'results' in state && Array.isArray(state.results)
    ? state.results
    : [state]
  const isAggregateState = 'results' in state && Array.isArray(state.results)
  const results = PRODUCTION_DIAGNOSTIC_CHECKS.map((check) => {
    const candidate = isAggregateState ? candidateResults.find((result) => {
      try { return result?.id === check.id } catch { return false }
    }) : candidateResults[0]
    if (candidate?.status === 'PASS') {
      return Object.freeze({
        id: check.id,
        label: check.label,
        status: 'PASS' as const,
        code: 'ok' as const,
        details: check.projectPublicDetails(),
      })
    }
    return Object.freeze({
      id: check.id,
      label: check.label,
      status: 'FAIL' as const,
      code: boundedDiagnosticFailureCode(candidate?.status === 'FAIL' ? candidate.code : 'invalid_response'),
    })
  })
  const overall = results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL'
  return Object.freeze({
    schemaVersion: 1,
    overall,
    results: Object.freeze(results),
  }) as ProductionDiagnosticsReceipt
}

export interface ProductionDiagnosticsOptions {
  readonly readiness?: ProductionDiagnosticsReadiness
  readonly fetch?: typeof globalThis.fetch
  readonly baseUrl?: string
}

export interface ProductionDiagnostics {
  readonly state: ProductionDiagnosticsState
  readonly completionRetryProbe: CompletionRetryProbeState
  readonly pagesProvenance: PagesProvenanceState
  runChecks(): Promise<DiagnosticCheckResult>
  runPagesProvenance(): Promise<PagesProvenanceState>
  armCompletionRetryProbe(): boolean
  cancelCompletionRetryProbe(): boolean
  setReadiness(readiness: ProductionDiagnosticsReadiness): void
  dispose(): void
}

const COMPLETION_RETRY_PROBE_STORAGE_KEY = 'singed-terra:production-diagnostics:completion-retry:v1'

export function projectPersistedCompletionRetryProbe(value: unknown): CompletionRetryProbeState | undefined {
  if (!isPlainRecord(value)) return undefined
  const keys = Object.keys(value).sort()
  if (keys.length === 2 && keys[0] === 'code' && keys[1] === 'status'
    && value.status === 'FAIL'
    && (value.code === 'evidence_mismatch' || value.code === 'receipt_mismatch')) {
    return Object.freeze({ status: 'FAIL' as const, code: value.code })
  }
  if (keys.length !== 4 || keys[0] !== 'award' || keys[1] !== 'sameEvidence'
    || keys[2] !== 'sameReceipt' || keys[3] !== 'status'
    || value.status !== 'PASS' || value.sameEvidence !== true || value.sameReceipt !== true
    || !isPlainRecord(value.award)) return undefined
  const award = value.award
  const awardKeys = Object.keys(award).sort()
  if (awardKeys.length !== 5 || awardKeys[0] !== 'matchesDelta' || awardKeys[1] !== 'outcome'
    || awardKeys[2] !== 'totalXpDelta' || awardKeys[3] !== 'verifiedXp' || awardKeys[4] !== 'winsDelta'
    || (award.outcome !== 'win' && award.outcome !== 'loss' && award.outcome !== 'draw')
    || (award.verifiedXp !== 100 && award.verifiedXp !== 200)
    || award.matchesDelta !== 1
    || award.winsDelta !== (award.outcome === 'win' ? 1 : 0)
    || award.totalXpDelta !== award.verifiedXp
    || award.verifiedXp !== (award.outcome === 'win' ? 200 : 100)) return undefined
  const outcome = award.outcome as CompletionRetryAwardProof['outcome']
  const verifiedXp = award.verifiedXp as CompletionRetryAwardProof['verifiedXp']
  return Object.freeze({
    status: 'PASS' as const,
    sameEvidence: true as const,
    sameReceipt: true as const,
    award: Object.freeze({
      outcome,
      verifiedXp,
      matchesDelta: 1,
      winsDelta: outcome === 'win' ? 1 : 0,
      totalXpDelta: verifiedXp,
    }),
  })
}

function persistedCompletionRetryProbe(): CompletionRetryProbeState {
  try {
    const raw = globalThis.sessionStorage?.getItem(COMPLETION_RETRY_PROBE_STORAGE_KEY)
    if (!raw || raw.length > 2_048) return Object.freeze({ status: 'idle' as const })
    const projected = projectPersistedCompletionRetryProbe(JSON.parse(raw) as unknown)
    if (projected) return projected
  } catch {
    // Diagnostics persistence is optional; malformed or inaccessible storage is inert.
  }
  return Object.freeze({ status: 'idle' as const })
}

function persistCompletionRetryTerminal(state: CompletionRetryProbeState): void {
  if (state.status !== 'PASS' && state.status !== 'FAIL') return
  try {
    globalThis.sessionStorage?.setItem(COMPLETION_RETRY_PROBE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The live proof remains available in memory when session storage is unavailable.
  }
}

let completionRetryProbeState: CompletionRetryProbeState = persistedCompletionRetryProbe()
let completionRetryEvidence = ''
let completionRetryReceipt = ''

function clearVerifiedCompletionDiagnosticPrivateMaterial(): void {
  completionRetryEvidence = ''
  completionRetryReceipt = ''
}

export function verifiedCompletionDiagnosticHasPrivateMaterial(): boolean {
  return completionRetryEvidence.length > 0 || completionRetryReceipt.length > 0
}

export function cancelVerifiedCompletionResponseDiagnostic(): void {
  if (completionRetryProbeState.status !== 'armed'
    && completionRetryProbeState.status !== 'response-discarded') return
  clearVerifiedCompletionDiagnosticPrivateMaterial()
  completionRetryProbeState = Object.freeze({ status: 'idle' as const })
}

function completionEvidenceKey(
  sessionId: string,
  transcript: readonly VerifiedHumanFire[],
): string {
  return JSON.stringify([sessionId, transcript])
}

function completionAwardProof(receipt: VerifiedDeploymentServerReceipt): CompletionRetryAwardProof {
  const { prior, current } = receipt.progression
  return Object.freeze({
    outcome: receipt.result.outcome,
    verifiedXp: receipt.result.verifiedXp,
    matchesDelta: current.matchesPlayed - prior.matchesPlayed,
    winsDelta: current.wins - prior.wins,
    totalXpDelta: current.totalXp - prior.totalXp,
  })
}

/**
 * Production-diagnostics seam called only after the normal completion adapter
 * has received and parsed an accepted server response. Returning true asks the
 * adapter to discard that one response so the ordinary retained-evidence retry
 * path can prove server idempotency.
 */
export function observeVerifiedCompletionResponseForDiagnostics(
  sessionId: string,
  transcript: readonly VerifiedHumanFire[],
  receipt: VerifiedDeploymentServerReceipt,
): boolean {
  const evidence = completionEvidenceKey(sessionId, transcript)
  const serializedReceipt = JSON.stringify(receipt)
  if (completionRetryProbeState.status === 'armed') {
    completionRetryEvidence = evidence
    completionRetryReceipt = serializedReceipt
    completionRetryProbeState = Object.freeze({
      status: 'response-discarded' as const,
      expected: completionAwardProof(receipt),
    })
    return true
  }
  if (completionRetryProbeState.status !== 'response-discarded') return false
  if (evidence !== completionRetryEvidence) {
    clearVerifiedCompletionDiagnosticPrivateMaterial()
    completionRetryProbeState = Object.freeze({ status: 'FAIL' as const, code: 'evidence_mismatch' as const })
    persistCompletionRetryTerminal(completionRetryProbeState)
    return false
  }
  if (serializedReceipt !== completionRetryReceipt) {
    clearVerifiedCompletionDiagnosticPrivateMaterial()
    completionRetryProbeState = Object.freeze({ status: 'FAIL' as const, code: 'receipt_mismatch' as const })
    persistCompletionRetryTerminal(completionRetryProbeState)
    return false
  }
  const award = completionAwardProof(receipt)
  clearVerifiedCompletionDiagnosticPrivateMaterial()
  completionRetryProbeState = Object.freeze({
    status: 'PASS' as const,
    sameEvidence: true as const,
    sameReceipt: true as const,
    award,
  })
  persistCompletionRetryTerminal(completionRetryProbeState)
  return false
}

export function validatePagesDeploymentProvenance(
  value: unknown,
): value is { readonly sha: string; readonly runId: string } {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value).sort()
  return keys.length === 2
    && keys[0] === 'runId'
    && keys[1] === 'sha'
    && typeof value.sha === 'string'
    && /^[0-9a-f]{40}$/.test(value.sha)
    && typeof value.runId === 'string'
    && /^[1-9][0-9]*$/.test(value.runId)
}

async function readBoundedUtf8Body(response: Response, maximumBytes: number): Promise<string | undefined> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    bytes += value.byteLength
    if (bytes > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      return undefined
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function resultForFailure(check: DiagnosticDescriptor, code: Exclude<DiagnosticResultCode, 'ok'>): DiagnosticCheckResult {
  return Object.freeze({
    id: check.id,
    label: check.label,
    status: 'FAIL',
    code,
  })
}

function resultForSuccess(check: DiagnosticDescriptor): DiagnosticCheckResult {
  return Object.freeze({
    id: check.id,
    label: check.label,
    status: 'PASS',
    code: 'ok',
    details: check.projectPublicDetails(),
  })
}

class InvalidDiagnosticCheckError extends Error {
  readonly code = 'invalid_check' as const

  constructor() {
    super('Diagnostic check is not registered.')
    this.name = 'InvalidDiagnosticCheckError'
  }
}

type ResolvedInvocationInspection = 'valid' | 'request_failed' | 'invalid_response'

function inspectResolvedInvocation(
  check: DiagnosticDescriptor,
  value: unknown,
): ResolvedInvocationInspection {
  try {
    if (!isPlainRecord(value)) return 'request_failed'

    const errorDescriptor = Object.getOwnPropertyDescriptor(value, 'error')
    const dataDescriptor = Object.getOwnPropertyDescriptor(value, 'data')
    if (
      !errorDescriptor
      || !('value' in errorDescriptor)
      || !dataDescriptor
      || !('value' in dataDescriptor)
    ) return 'request_failed'
    if (errorDescriptor.value !== null) return 'request_failed'

    return check.validateResponse(dataDescriptor.value)
      ? 'valid'
      : 'invalid_response'
  } catch {
    return 'request_failed'
  }
}

const RUN_TIMEOUT_MS = 10_000

const READINESS_STATES = Object.freeze({
  authenticated: Object.freeze({ status: 'IDLE' as const }),
  loading: Object.freeze({ status: 'loading' as const }),
  unavailable: Object.freeze({ status: 'unavailable' as const }),
  anonymous: Object.freeze({ status: 'anonymous' as const }),
  'authenticated-error': Object.freeze({ status: 'authenticated-error' as const }),
  'signed-out': Object.freeze({ status: 'signed-out' as const }),
}) satisfies Readonly<Record<ProductionDiagnosticsReadiness, ProductionDiagnosticsState>>

type ActiveRun = {
  readonly generation: number
  check: DiagnosticDescriptor
  readonly checks: readonly DiagnosticDescriptor[]
  readonly results: DiagnosticCheckResult[]
  index: number
  readonly resolve: (result: ProductionDiagnosticsTerminalState) => void
  timer: ReturnType<typeof globalThis.setTimeout> | undefined
  settled: boolean
}

function terminalStateForResults(results: readonly DiagnosticCheckResult[]): ProductionDiagnosticsTerminalState {
  const frozenResults = Object.freeze([...results])
  const representative = frozenResults.find((result) => result.status === 'FAIL') ?? frozenResults[0]
  if (!representative) throw new Error('Production diagnostics registry must contain at least one check.')
  return Object.freeze({ ...representative, results: frozenResults }) as ProductionDiagnosticsTerminalState
}

export function createProductionDiagnostics(
  client: Pick<SupabaseClient, 'functions'>,
  options: ProductionDiagnosticsOptions = {},
): ProductionDiagnostics {
  const checks = Object.freeze([...PRODUCTION_DIAGNOSTIC_CHECKS])
  let readiness = options.readiness ?? 'authenticated'
  let state: ProductionDiagnosticsState = READINESS_STATES[readiness]
  let generation = 0
  let activeRun: ActiveRun | undefined
  let pagesProvenance: PagesProvenanceState = Object.freeze({ status: 'idle' as const })
  let pagesRunActive = false
  let pagesGeneration = 0
  const pagesFetch = options.fetch ?? globalThis.fetch
  const pagesBaseUrl = options.baseUrl ?? globalThis.location?.href ?? '/'

  const isCurrentRun = (run: ActiveRun): boolean => (
    activeRun === run && !run.settled && generation === run.generation
  )

  const settleRun = (
    run: ActiveRun,
    result: ProductionDiagnosticsTerminalState,
    publish: boolean,
  ): void => {
    if (run.settled) return
    run.settled = true
    if (run.timer !== undefined) globalThis.clearTimeout(run.timer)
    if (activeRun === run) activeRun = undefined
    generation += 1
    if (publish) state = result
    run.resolve(result)
  }

  const failureResult = (check: DiagnosticDescriptor, code: Exclude<DiagnosticResultCode, 'ok'>): DiagnosticCheckResult => (
    resultForFailure(check, code)
  )

  return {
    get state() {
      return state
    },

    get completionRetryProbe() {
      return completionRetryProbeState
    },

    get pagesProvenance() {
      return pagesProvenance
    },

    armCompletionRetryProbe() {
      if (state.status === 'disposed' || readiness !== 'authenticated') return false
      if (completionRetryProbeState.status === 'armed'
        || completionRetryProbeState.status === 'response-discarded') return false
      completionRetryEvidence = ''
      completionRetryReceipt = ''
      completionRetryProbeState = Object.freeze({ status: 'armed' as const })
      try { globalThis.sessionStorage?.removeItem(COMPLETION_RETRY_PROBE_STORAGE_KEY) } catch { /* optional */ }
      return true
    },

    cancelCompletionRetryProbe() {
      if (completionRetryProbeState.status !== 'armed') return false
      cancelVerifiedCompletionResponseDiagnostic()
      return true
    },

    runPagesProvenance() {
      if (state.status === 'disposed') {
        return Promise.resolve(Object.freeze({ status: 'FAIL' as const, code: 'disposed' as const }))
      }
      if (readiness !== 'authenticated') {
        return Promise.resolve(Object.freeze({ status: 'FAIL' as const, code: 'not_authenticated' as const }))
      }
      if (pagesRunActive) {
        return Promise.resolve(Object.freeze({ status: 'FAIL' as const, code: 'run_in_progress' as const }))
      }
      pagesRunActive = true
      pagesProvenance = Object.freeze({ status: 'RUNNING' as const })
      const runGeneration = ++pagesGeneration
      const abortController = new AbortController()
      const request = async (): Promise<PagesProvenanceState> => {
        try {
          const url = new URL('deploy-meta.json', pagesBaseUrl).href
          const response = await pagesFetch(url, {
            cache: 'no-store',
            credentials: 'omit',
            headers: { Accept: 'application/json' },
            signal: abortController.signal,
          })
          if (!response.ok) return Object.freeze({ status: 'FAIL' as const, code: 'request_failed' as const })
          const body = await readBoundedUtf8Body(response, 4_096)
          if (body === undefined) return Object.freeze({ status: 'FAIL' as const, code: 'invalid_response' as const })
          const value: unknown = JSON.parse(body)
          if (!validatePagesDeploymentProvenance(value)) {
            return Object.freeze({ status: 'FAIL' as const, code: 'invalid_response' as const })
          }
          return Object.freeze({
            status: 'PASS' as const,
            sha: value.sha as string,
            runId: value.runId as string,
          })
        } catch {
          return Object.freeze({ status: 'FAIL' as const, code: 'request_failed' as const })
        }
      }
      let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined
      const timeout = new Promise<PagesProvenanceState>((resolve) => {
        timeoutId = globalThis.setTimeout(
          () => {
            resolve(Object.freeze({ status: 'FAIL' as const, code: 'timeout' as const }))
            abortController.abort()
          },
          RUN_TIMEOUT_MS,
        )
      })
      return Promise.race([request(), timeout]).then((result) => {
        if (runGeneration === pagesGeneration && state.status !== 'disposed') {
          pagesProvenance = result
          pagesRunActive = false
        }
        return result
      }).finally(() => {
        if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
      })
    },

    runChecks() {
      const check = checks[0]
      if (!check) return Promise.reject(new InvalidDiagnosticCheckError())
      if (state.status === 'disposed') {
        return Promise.resolve(terminalStateForResults(checks.map((item) => failureResult(item, 'disposed'))))
      }
      if (state.status === 'signed-out' || readiness !== 'authenticated') {
        return Promise.resolve(terminalStateForResults(checks.map((item) => failureResult(item, 'not_authenticated'))))
      }
      if (activeRun) {
        return Promise.resolve(terminalStateForResults(checks.map((item) => failureResult(item, 'run_in_progress'))))
      }

      const runGeneration = ++generation
      let resolveRun!: (result: ProductionDiagnosticsTerminalState) => void
      const runPromise = new Promise<ProductionDiagnosticsTerminalState>((resolve) => {
        resolveRun = resolve
      })
      const run: ActiveRun = {
        generation: runGeneration,
        check,
        checks,
        results: [],
        index: 0,
        resolve: resolveRun,
        timer: undefined,
        settled: false,
      }
      activeRun = run
      state = Object.freeze({ status: 'RUNNING' as const })

      const invokeCurrentCheck = (): void => {
        const currentCheck = run.check
        const currentIndex = run.index
        run.timer = globalThis.setTimeout(() => {
          if (!isCurrentRun(run)) return
          completeFromInvocation('timeout', currentIndex, currentCheck)
        }, RUN_TIMEOUT_MS)

        try {
          const invocation = client.functions.invoke(currentCheck.functionName)
          void Promise.resolve(invocation).then(
            (value) => {
              let inspection: ResolvedInvocationInspection
              try {
                inspection = inspectResolvedInvocation(currentCheck, value)
              } catch {
                inspection = 'request_failed'
              }
              completeFromInvocation(inspection, currentIndex, currentCheck)
            },
            () => completeFromInvocation('request_failed', currentIndex, currentCheck),
          )
        } catch {
          completeFromInvocation('request_failed', currentIndex, currentCheck)
        }
      }

      const completeFromInvocation = (
        inspection: ResolvedInvocationInspection | 'timeout',
        invocationIndex: number,
        invocationCheck: DiagnosticDescriptor,
      ): void => {
        if (
          !isCurrentRun(run)
          || run.index !== invocationIndex
          || run.check !== invocationCheck
        ) return
        if (run.timer !== undefined) globalThis.clearTimeout(run.timer)
        run.timer = undefined
        let result: DiagnosticCheckResult
        try {
          result = inspection === 'valid'
            ? resultForSuccess(invocationCheck)
            : failureResult(invocationCheck, inspection)
        } catch {
          result = failureResult(invocationCheck, 'invalid_response')
        }
        run.results.push(result)
        run.index += 1
        const nextCheck = run.checks[run.index]
        if (nextCheck) {
          run.check = nextCheck
          invokeCurrentCheck()
          return
        }
        settleRun(run, terminalStateForResults(run.results), true)
      }

      invokeCurrentCheck()

      return runPromise
    },

    setReadiness(nextReadiness) {
      if (state.status === 'disposed') return
      if (nextReadiness !== 'authenticated') cancelVerifiedCompletionResponseDiagnostic()
      if (nextReadiness === 'authenticated') {
        const wasAuthenticated = readiness === 'authenticated'
        readiness = nextReadiness
        if (!activeRun && !wasAuthenticated) state = READINESS_STATES.authenticated
        return
      }

      if (readiness === nextReadiness && state.status === nextReadiness && !activeRun) return
      readiness = nextReadiness
      pagesGeneration += 1
      pagesRunActive = false
      pagesProvenance = Object.freeze({ status: 'idle' as const })
      if (activeRun) {
        settleRun(
          activeRun,
          terminalStateForResults(activeRun.checks.map((check) => failureResult(check, 'not_authenticated'))),
          false,
        )
      } else {
        generation += 1
      }
      state = READINESS_STATES[nextReadiness]
    },

    dispose() {
      if (state.status === 'disposed') return
      if (activeRun) {
        settleRun(
          activeRun,
          terminalStateForResults(activeRun.checks.map((check) => failureResult(check, 'disposed'))),
          false,
        )
      } else {
        generation += 1
      }
      state = Object.freeze({ status: 'disposed' as const })
      pagesGeneration += 1
      pagesRunActive = false
      pagesProvenance = Object.freeze({ status: 'FAIL' as const, code: 'disposed' as const })
    },
  }
}
