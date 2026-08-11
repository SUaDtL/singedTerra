import type { SupabaseClient } from '@supabase/supabase-js'
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
}

export interface ProductionDiagnostics {
  readonly state: ProductionDiagnosticsState
  runChecks(): Promise<DiagnosticCheckResult>
  setReadiness(readiness: ProductionDiagnosticsReadiness): void
  dispose(): void
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
      if (nextReadiness === 'authenticated') {
        const wasAuthenticated = readiness === 'authenticated'
        readiness = nextReadiness
        if (!activeRun && !wasAuthenticated) state = READINESS_STATES.authenticated
        return
      }

      if (readiness === nextReadiness && state.status === nextReadiness && !activeRun) return
      readiness = nextReadiness
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
    },
  }
}
