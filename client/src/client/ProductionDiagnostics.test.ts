import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRODUCTION_DIAGNOSTIC_CHECKS,
  cancelVerifiedCompletionResponseDiagnostic,
  createProductionDiagnostics,
  observeVerifiedCompletionResponseForDiagnostics,
  verifiedCompletionDiagnosticHasPrivateMaterial,
  projectPersistedCompletionRetryProbe,
  productionDiagnosticsReceiptForState,
  validatePagesDeploymentProvenance,
  validateVerifiedReplayProbeResponse,
} from './ProductionDiagnostics'
import type { VerifiedDeploymentServerReceipt } from './verifiedDeployment'

const EXACT_VERIFIED_REPLAY_RESPONSE = {
  ok: true,
  probeVersion: 1,
  engineVersion: 1,
  rulesetVersion: 3,
  fixtures: {
    maximumLifecycle: {
      phase: 'GAME_OVER',
      winner: 'p2',
      winnerTeam: 2,
      turn: 13,
      actionCount: 15,
      tickCount: 448,
      maxTurnTickCount: 34,
    },
    maximumTurn: {
      phase: 'GAME_OVER',
      winner: 'p1',
      winnerTeam: null,
      turn: 3,
      actionCount: 4,
      tickCount: 293,
      maxTurnTickCount: 198,
    },
    verifiedDuel: {
      seed: 17,
      outcome: 'human_win',
      winnerId: 'p1',
      reason: 'health',
      humanSalvos: 6,
      cpuSalvos: 6,
      liveTicks: 625,
      cpuSimulationTicks: 24564,
      maximumProbeCount: 59,
      transcript: Array.from({ length: 6 }, () => ({ angle: 0, power: 5 })),
    },
  },
} as const

type MutableResponse = Record<string, any>
type Diagnostics = ReturnType<typeof createProductionDiagnostics>
type ProductionDiagnosticsReceipt = NonNullable<ReturnType<typeof productionDiagnosticsReceiptForState>>

const NON_AUTHENTICATED_READINESS = [
  'loading',
  'unavailable',
  'anonymous',
  'authenticated-error',
  'signed-out',
] as const

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function copyExactResponse(): MutableResponse {
  return structuredClone(EXACT_VERIFIED_REPLAY_RESPONSE) as Record<string, any>
}

function diagnosticsClient(response: unknown = EXACT_VERIFIED_REPLAY_RESPONSE) {
  const invoke = vi.fn(async () => ({ data: response, error: null }))
  return {
    client: { functions: { invoke } },
    invoke,
  }
}

function containsForbiddenPublicValue(
  value: unknown,
  forbidden: readonly string[],
  seen = new Set<object>(),
): boolean {
  if (typeof value === 'string') return forbidden.some((needle) => value.includes(needle))
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false
  if (seen.has(value)) return false
  seen.add(value)

  for (const key of Reflect.ownKeys(value)) {
    const keyText = typeof key === 'symbol' ? `${String(key)} ${key.description ?? ''}` : key
    if (forbidden.some((needle) => keyText.includes(needle))) return true
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor) continue
    if ('value' in descriptor && containsForbiddenPublicValue(descriptor.value, forbidden, seen)) return true
    if (descriptor.get && containsForbiddenPublicValue(descriptor.get, forbidden, seen)) return true
    if (descriptor.set && containsForbiddenPublicValue(descriptor.set, forbidden, seen)) return true
  }
  return false
}

function expectRecursivelyFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return
  if (seen.has(value)) return
  seen.add(value)

  expect(Object.isFrozen(value)).toBe(true)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    expect(descriptor).toBeDefined()
    expect(descriptor?.configurable).toBe(false)
    if (!descriptor) continue
    if ('writable' in descriptor) expect(descriptor.writable).toBe(false)
    if ('value' in descriptor) expectRecursivelyFrozen(descriptor.value, seen)
  }
}

function compileTimeOnlyTypeAssertions(diagnostics: Diagnostics): void {
  if (false) {
    // @ts-expect-error diagnostics accepts no operator-selected check or endpoint
    void diagnostics.runChecks('arbitrary-endpoint')
    // @ts-expect-error the compile-time registry is readonly
    PRODUCTION_DIAGNOSTIC_CHECKS.push({
      id: 'arbitrary-endpoint',
      label: 'Arbitrary endpoint',
      functionName: 'arbitrary_endpoint',
    })
  }
}

void compileTimeOnlyTypeAssertions

describe('ProductionDiagnostics registry', () => {
  it('contains exactly the reviewed verified-replay runtime check', () => {
    expect(PRODUCTION_DIAGNOSTIC_CHECKS).toEqual([
      {
        id: 'verified-replay-runtime',
        label: 'Verified replay runtime',
        functionName: 'verified_replay_probe',
        validateResponse: validateVerifiedReplayProbeResponse,
        projectPublicDetails: expect.any(Function),
      },
    ])
    expect(Object.isFrozen(PRODUCTION_DIAGNOSTIC_CHECKS)).toBe(true)
  })

  it('recursively freezes the registry and makes every descriptor field fixed', () => {
    expectRecursivelyFrozen(PRODUCTION_DIAGNOSTIC_CHECKS)

    const [descriptor] = PRODUCTION_DIAGNOSTIC_CHECKS
    expect(descriptor).toBeDefined()
    expect(Object.getOwnPropertyDescriptors(descriptor)).toEqual({
      id: {
        value: 'verified-replay-runtime',
        writable: false,
        enumerable: true,
        configurable: false,
      },
      label: {
        value: 'Verified replay runtime',
        writable: false,
        enumerable: true,
        configurable: false,
      },
      functionName: {
        value: 'verified_replay_probe',
        writable: false,
        enumerable: true,
        configurable: false,
      },
      validateResponse: {
        value: validateVerifiedReplayProbeResponse,
        writable: false,
        enumerable: true,
        configurable: false,
      },
      projectPublicDetails: {
        value: descriptor?.projectPublicDetails,
        writable: false,
        enumerable: true,
        configurable: false,
      },
    })
    expect(Reflect.set(PRODUCTION_DIAGNOSTIC_CHECKS, 0, descriptor)).toBe(false)
    expect(Reflect.set(descriptor, 'id', 'arbitrary-endpoint')).toBe(false)
    expect(Reflect.set(descriptor, 'label', 'Arbitrary endpoint')).toBe(false)
    expect(Reflect.set(descriptor, 'functionName', 'arbitrary_endpoint')).toBe(false)
    expect(descriptor).toEqual({
      id: 'verified-replay-runtime',
      label: 'Verified replay runtime',
      functionName: 'verified_replay_probe',
      validateResponse: validateVerifiedReplayProbeResponse,
      projectPublicDetails: descriptor?.projectPublicDetails,
    })
  })
})

describe('verified completion retry diagnostic', () => {
  const sessionId = '00000000-0000-4000-8000-000000000061'
  const transcript = [{ angle: 37, power: 64 }] as const
  const receipt: VerifiedDeploymentServerReceipt = {
    result: { sessionId, won: true, outcome: 'win', verifiedXp: 200 },
    progression: {
      evidence: 'verified_replay_v1',
      prior: { matchesPlayed: 2, wins: 1, totalXp: 300 },
      current: { matchesPlayed: 3, wins: 2, totalXp: 500 },
    },
  }

  afterEach(() => {
    cancelVerifiedCompletionResponseDiagnostic()
  })

  it('arms only for an authenticated operator and remains inert otherwise', () => {
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never, {
      readiness: 'anonymous',
    })

    expect(diagnostics.armCompletionRetryProbe()).toBe(false)
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(false)

    diagnostics.setReadiness('authenticated')
    expect(diagnostics.armCompletionRetryProbe()).toBe(true)
    expect(diagnostics.completionRetryProbe.status).toBe('armed')
  })

  it('runs the same-origin Pages provenance check without credentials and includes its bounded receipt', async () => {
    vi.useFakeTimers()
    const { client, invoke } = diagnosticsClient()
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      sha: 'ad9be483282e359c0022913226ea8ddc11f7df1f',
      runId: '31655039048',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const diagnostics = createProductionDiagnostics(client as never, {
      fetch,
      baseUrl: 'https://suadtl.github.io/singedTerra/',
    })

    const result = await diagnostics.runPagesProvenance()

    expect(invoke).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(
      'https://suadtl.github.io/singedTerra/deploy-meta.json',
      {
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      },
    )
    expect(result).toEqual({
      status: 'PASS',
      sha: 'ad9be483282e359c0022913226ea8ddc11f7df1f',
      runId: '31655039048',
    })
    expect(diagnostics.pagesProvenance).toEqual(result)
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it.each([
    ['short SHA', { sha: 'ad9be48', runId: '31655039048' }],
    ['non-decimal run ID', { sha: 'a'.repeat(40), runId: 'run-1' }],
    ['widened metadata', { sha: 'a'.repeat(40), runId: '1', branch: 'main' }],
  ])('rejects Pages provenance with %s', (_label, value) => {
    expect(validatePagesDeploymentProvenance(value)).toBe(false)
  })

  it('discards one parsed response, verifies an identical retry, and projects the one-award delta', () => {
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never)
    expect(diagnostics.armCompletionRetryProbe()).toBe(true)

    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(true)
    expect(diagnostics.completionRetryProbe).toEqual({
      status: 'response-discarded',
      expected: {
        outcome: 'win',
        verifiedXp: 200,
        matchesDelta: 1,
        winsDelta: 1,
        totalXpDelta: 200,
      },
    })
    expect(verifiedCompletionDiagnosticHasPrivateMaterial()).toBe(true)

    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(false)
    expect(diagnostics.completionRetryProbe).toEqual({
      status: 'PASS',
      sameEvidence: true,
      sameReceipt: true,
      award: {
        outcome: 'win',
        verifiedXp: 200,
        matchesDelta: 1,
        winsDelta: 1,
        totalXpDelta: 200,
      },
    })
    expect(verifiedCompletionDiagnosticHasPrivateMaterial()).toBe(false)
  })

  it('fails closed when the retry evidence differs and never discards another response', () => {
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never)
    diagnostics.armCompletionRetryProbe()
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(true)

    expect(observeVerifiedCompletionResponseForDiagnostics(
      sessionId,
      [{ angle: 38, power: 64 }],
      receipt,
    )).toBe(false)
    expect(diagnostics.completionRetryProbe).toEqual({ status: 'FAIL', code: 'evidence_mismatch' })
    expect(verifiedCompletionDiagnosticHasPrivateMaterial()).toBe(false)
  })

  it('refuses to cancel after the one response was already discarded', () => {
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never)
    expect(diagnostics.armCompletionRetryProbe()).toBe(true)
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(true)

    expect(diagnostics.cancelCompletionRetryProbe()).toBe(false)
    expect(diagnostics.completionRetryProbe.status).toBe('response-discarded')
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(false)
    expect(diagnostics.completionRetryProbe.status).toBe('PASS')
  })

  it('fails closed and persists failure when identical evidence returns a different valid receipt', () => {
    sessionStorage.removeItem('singed-terra:production-diagnostics:completion-retry:v1')
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never)
    diagnostics.armCompletionRetryProbe()
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(true)
    const changedReceipt: VerifiedDeploymentServerReceipt = {
      ...receipt,
      progression: {
        ...receipt.progression,
        prior: { matchesPlayed: 3, wins: 2, totalXp: 500 },
        current: { matchesPlayed: 4, wins: 3, totalXp: 700 },
      },
    }

    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, changedReceipt)).toBe(false)
    expect(diagnostics.completionRetryProbe).toEqual({ status: 'FAIL', code: 'receipt_mismatch' })
    expect(verifiedCompletionDiagnosticHasPrivateMaterial()).toBe(false)
    expect(JSON.parse(sessionStorage.getItem('singed-terra:production-diagnostics:completion-retry:v1') ?? 'null'))
      .toEqual({ status: 'FAIL', code: 'receipt_mismatch' })
    sessionStorage.removeItem('singed-terra:production-diagnostics:completion-retry:v1')
  })

  it.each(['anonymous', 'signed-out', 'authenticated-error'] as const)(
    'cancels an armed response loss when readiness becomes %s',
    (readiness) => {
      const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never)
      expect(diagnostics.armCompletionRetryProbe()).toBe(true)

      diagnostics.setReadiness(readiness)

      expect(diagnostics.completionRetryProbe).toEqual({ status: 'idle' })
      expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(false)
    },
  )

  it('cancels discarded-response evidence on sign-out and refuses to reset an active proof', () => {
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never)
    expect(diagnostics.armCompletionRetryProbe()).toBe(true)
    expect(diagnostics.armCompletionRetryProbe()).toBe(false)
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(true)
    expect(diagnostics.armCompletionRetryProbe()).toBe(false)

    diagnostics.setReadiness('signed-out')

    expect(diagnostics.completionRetryProbe).toEqual({ status: 'idle' })
    diagnostics.setReadiness('authenticated')
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(false)
  })

  it('hydrates one exact secret-free terminal PASS after a same-tab module reload', async () => {
    sessionStorage.removeItem('singed-terra:production-diagnostics:completion-retry:v1')
    const beforeReload = createProductionDiagnostics(diagnosticsClient().client as never)
    expect(beforeReload.armCompletionRetryProbe()).toBe(true)
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(true)
    expect(observeVerifiedCompletionResponseForDiagnostics(sessionId, transcript, receipt)).toBe(false)
    expect(sessionStorage.getItem('singed-terra:production-diagnostics:completion-retry:v1')).not.toBeNull()
    vi.resetModules()
    const fresh = await import('./ProductionDiagnostics')

    const diagnostics = fresh.createProductionDiagnostics(diagnosticsClient().client as never)

    expect(diagnostics.completionRetryProbe).toEqual({
      status: 'PASS',
      sameEvidence: true,
      sameReceipt: true,
      award: { outcome: 'win', verifiedXp: 200, matchesDelta: 1, winsDelta: 1, totalXpDelta: 200 },
    })
    sessionStorage.removeItem('singed-terra:production-diagnostics:completion-retry:v1')
  })

  it.each([
    ['multiple matches', { outcome: 'win', verifiedXp: 200, matchesDelta: 2, winsDelta: 1, totalXpDelta: 200 }],
    ['wrong win delta', { outcome: 'loss', verifiedXp: 100, matchesDelta: 1, winsDelta: 1, totalXpDelta: 100 }],
    ['wrong XP delta', { outcome: 'draw', verifiedXp: 100, matchesDelta: 1, winsDelta: 0, totalXpDelta: 0 }],
    ['wrong outcome XP', { outcome: 'win', verifiedXp: 100, matchesDelta: 1, winsDelta: 1, totalXpDelta: 100 }],
  ] as const)('rejects a persisted PASS with %s', async (_label, award) => {
    expect(projectPersistedCompletionRetryProbe({
      status: 'PASS', sameEvidence: true, sameReceipt: true, award,
    })).toBeUndefined()
    sessionStorage.setItem('singed-terra:production-diagnostics:completion-retry:v1', JSON.stringify({
      status: 'PASS', sameEvidence: true, sameReceipt: true, award,
    }))
    vi.resetModules()
    const fresh = await import('./ProductionDiagnostics')

    const diagnostics = fresh.createProductionDiagnostics(diagnosticsClient().client as never)

    expect(diagnostics.completionRetryProbe).toEqual({ status: 'idle' })
    sessionStorage.removeItem('singed-terra:production-diagnostics:completion-retry:v1')
  })

})

describe('verified-replay-runtime contract', () => {
  it('uses the browser-managed Supabase invocation with no body or manual headers', async () => {
    const { client, invoke } = diagnosticsClient()
    const diagnostics = createProductionDiagnostics(client as never)

    await diagnostics.runChecks()

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0]).toEqual(['verified_replay_probe'])
  })

  it('accepts the exact versioned hosted replay-probe response', () => {
    expect(validateVerifiedReplayProbeResponse(EXACT_VERIFIED_REPLAY_RESPONSE)).toBe(true)
  })

  it.each([
    ['a wrong root ok flag', (response: MutableResponse) => { response.ok = false }],
    ['a missing root ok flag', (response: MutableResponse) => { delete response.ok }],
    ['a wrong probe version', (response: MutableResponse) => { response.probeVersion = 2 }],
    ['a wrong engine version', (response: MutableResponse) => { response.engineVersion = 2 }],
    ['a wrong ruleset version', (response: MutableResponse) => { response.rulesetVersion = 2 }],
    ['a wrong maximumLifecycle phase', (response: MutableResponse) => { response.fixtures.maximumLifecycle.phase = 'PLAYER_TURN' }],
    ['a wrong maximumTurn phase', (response: MutableResponse) => { response.fixtures.maximumTurn.phase = 'PLAYER_TURN' }],
    ['a wrong maximumLifecycle winner', (response: MutableResponse) => { response.fixtures.maximumLifecycle.winner = 'p1' }],
    ['a wrong maximumTurn winner', (response: MutableResponse) => { response.fixtures.maximumTurn.winner = 'p2' }],
    ['a wrong maximumLifecycle winnerTeam', (response: MutableResponse) => { response.fixtures.maximumLifecycle.winnerTeam = 1 }],
    ['a wrong maximumTurn winnerTeam', (response: MutableResponse) => { response.fixtures.maximumTurn.winnerTeam = 2 }],
    ['a wrong maximumLifecycle turn', (response: MutableResponse) => { response.fixtures.maximumLifecycle.turn = 12 }],
    ['a wrong maximumTurn turn', (response: MutableResponse) => { response.fixtures.maximumTurn.turn = 2 }],
    ['a wrong maximumLifecycle actionCount', (response: MutableResponse) => { response.fixtures.maximumLifecycle.actionCount = 14 }],
    ['a wrong maximumTurn actionCount', (response: MutableResponse) => { response.fixtures.maximumTurn.actionCount = 3 }],
    ['a wrong maximumLifecycle tickCount', (response: MutableResponse) => { response.fixtures.maximumLifecycle.tickCount = 447 }],
    ['a wrong maximumTurn tickCount', (response: MutableResponse) => { response.fixtures.maximumTurn.tickCount = 292 }],
    ['a wrong maximumLifecycle maxTurnTickCount', (response: MutableResponse) => { response.fixtures.maximumLifecycle.maxTurnTickCount = 33 }],
    ['a wrong maximumTurn maxTurnTickCount', (response: MutableResponse) => { response.fixtures.maximumTurn.maxTurnTickCount = 197 }],
    ['a missing fixture field', (response: MutableResponse) => { delete response.fixtures.maximumTurn.maxTurnTickCount }],
    ['an extra root field', (response: MutableResponse) => { response.requestEcho = 'operator-controlled' }],
    ['an extra fixture field', (response: MutableResponse) => { response.fixtures.maximumLifecycle.progression = 99 }],
    ['an unsafe tick count', (response: MutableResponse) => { response.fixtures.maximumTurn.tickCount = Number.MAX_SAFE_INTEGER + 1 }],
    ['a widened duel salvo cap', (response: MutableResponse) => { response.fixtures.verifiedDuel.cpuSalvos = 7 }],
    ['an awarding probe field', (response: MutableResponse) => { response.fixtures.verifiedDuel.xpAwarded = 200 }],
  ])('routes %s through runChecks() as invalid_response', async (_label, mutate) => {
    const response = copyExactResponse()
    mutate(response)
    const { client } = diagnosticsClient(response)
    const diagnostics = createProductionDiagnostics(client as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({
      id: 'verified-replay-runtime',
      status: 'FAIL',
      code: 'invalid_response',
    })
  })
})

describe('ProductionDiagnostics redaction', () => {
  it('collapses provider failures to request_failed without retaining the raw message', async () => {
    const secret = 'account-bearer-secret'
    const rawProviderMessage = `provider rejected ${secret}`
    const providerError = Object.create(null) as Record<PropertyKey, unknown>
    const providerMessageSymbol = Symbol('provider-message')
    Object.defineProperty(providerError, 'message', {
      value: rawProviderMessage,
      enumerable: false,
    })
    Object.defineProperty(providerError, providerMessageSymbol, {
      value: rawProviderMessage,
      enumerable: false,
    })
    const invoke = vi.fn(async () => ({
      data: null,
      error: providerError,
    }))
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({
      id: 'verified-replay-runtime',
      status: 'FAIL',
      code: 'request_failed',
    })
    expect(containsForbiddenPublicValue(result, [secret, rawProviderMessage, 'provider rejected'])).toBe(false)
  })

  it('collapses a secret-bearing widened response to invalid_response without exposing it', async () => {
    const secret = 'refresh-token-secret'
    const response = copyExactResponse()
    const secretSymbol = Symbol('refresh-token-secret')
    Object.defineProperty(response, 'credential', { value: secret, enumerable: false })
    Object.defineProperty(response, secretSymbol, { value: secret, enumerable: false })
    const { client } = diagnosticsClient(response)
    const diagnostics = createProductionDiagnostics(client as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({
      id: 'verified-replay-runtime',
      status: 'FAIL',
      code: 'invalid_response',
    })
    expect(containsForbiddenPublicValue(result, [secret])).toBe(false)
  })
})

describe('ProductionDiagnostics resolved invocation boundary', () => {
  it.each([
    ['a null envelope', () => null],
    ['an undefined envelope', () => undefined],
    ['an array envelope', () => ['provider raw secret']],
  ])('collapses %s through runChecks() as request_failed without retaining raw values', async (_label, envelope) => {
    const secret = 'provider raw secret'
    const rawMessage = `transport rejected ${secret}`
    const invoke = vi.fn(async () => envelope())
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({
      id: 'verified-replay-runtime',
      status: 'FAIL',
      code: 'request_failed',
    })
    expect(containsForbiddenPublicValue(result, [secret, rawMessage])).toBe(false)
  })

  it.each([
    ['a throwing error accessor', 'error'],
    ['a throwing data accessor', 'data'],
  ])('collapses %s through runChecks() without exposing its thrown message', async (_label, property) => {
    const secret = 'accessor-bearer-secret'
    const rawMessage = `provider accessor exploded ${secret}`
    const envelope = Object.create(null) as Record<string, unknown>
    Object.defineProperty(envelope, property, {
      enumerable: true,
      get() {
        throw new Error(rawMessage)
      },
    })
    if (property === 'data') {
      Object.defineProperty(envelope, 'error', { value: null, enumerable: true })
    }
    const invoke = vi.fn(async () => envelope)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({
      id: 'verified-replay-runtime',
      status: 'FAIL',
      code: 'request_failed',
    })
    expect(containsForbiddenPublicValue(result, [secret, rawMessage, 'provider accessor exploded'])).toBe(false)
  })
})

describe('ProductionDiagnostics exact-object boundary', () => {
  it.each([
    ['a root expected field getter', (response: MutableResponse) => {
      Object.defineProperty(response, 'ok', {
        enumerable: true,
        get: () => true,
      })
    }],
    ['a nested expected field getter', (response: MutableResponse) => {
      Object.defineProperty(response.fixtures.maximumTurn, 'tickCount', {
        enumerable: true,
        get: () => 293,
      })
    }],
  ])('rejects %s through runChecks()', async (_label, mutate) => {
    const response = copyExactResponse()
    mutate(response)
    const { client } = diagnosticsClient(response)
    const diagnostics = createProductionDiagnostics(client as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({ status: 'FAIL', code: 'invalid_response' })
  })

  it.each([
    ['a nested non-enumerable extra', (response: MutableResponse) => {
      Object.defineProperty(response.fixtures.maximumLifecycle, 'secret', {
        value: 'nested non-enumerable secret',
        enumerable: false,
      })
    }],
    ['a nested symbol extra', (response: MutableResponse) => {
      Object.defineProperty(response.fixtures.maximumLifecycle, Symbol('nested-secret'), {
        value: 'nested symbol secret',
        enumerable: false,
      })
    }],
  ])('rejects %s through runChecks()', async (_label, mutate) => {
    const response = copyExactResponse()
    mutate(response)
    const { client } = diagnosticsClient(response)
    const diagnostics = createProductionDiagnostics(client as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({ status: 'FAIL', code: 'invalid_response' })
  })
})

describe('ProductionDiagnostics mutation-proof projection', () => {
  it('does not let a stateful Proxy smuggle a changed value into PASS details', async () => {
    const secret = 'proxy-reread-secret'
    const response = copyExactResponse()
    let tickCountReads = 0
    const maximumTurn = new Proxy(response.fixtures.maximumTurn, {
      get(target, property, receiver) {
        if (property === 'tickCount') {
          tickCountReads += 1
          return tickCountReads === 1 ? 293 : secret
        }
        return Reflect.get(target, property, receiver)
      },
    })
    response.fixtures.maximumTurn = maximumTurn
    const { client } = diagnosticsClient(response)
    const diagnostics = createProductionDiagnostics(client as never)

    const result = await diagnostics.runChecks()

    expect(tickCountReads).toBeLessThanOrEqual(1)
    expect(result).toMatchObject({ status: 'PASS', code: 'ok' })
    if (result.status === 'PASS') {
      expect(result.details.fixtures.maximumTurn.tickCount).toBe(293)
    }
    expect(containsForbiddenPublicValue(result, [secret])).toBe(false)
  })

  it('returns only a detached recursive frozen projection that survives source mutation', async () => {
    const response = copyExactResponse()
    const { client } = diagnosticsClient(response)
    const diagnostics = createProductionDiagnostics(client as never)

    const result = await diagnostics.runChecks()

    expect(result.status).toBe('PASS')
    if (result.status !== 'PASS') return
    const details = result.details
    const snapshot = structuredClone(details)

    expect(details).toEqual({
      ok: true,
      probeVersion: 1,
      engineVersion: 1,
      rulesetVersion: 3,
      fixtures: {
        maximumLifecycle: EXACT_VERIFIED_REPLAY_RESPONSE.fixtures.maximumLifecycle,
        maximumTurn: EXACT_VERIFIED_REPLAY_RESPONSE.fixtures.maximumTurn,
        verifiedDuel: EXACT_VERIFIED_REPLAY_RESPONSE.fixtures.verifiedDuel,
      },
    })
    expect(Reflect.ownKeys(details)).toEqual([
      'ok',
      'probeVersion',
      'engineVersion',
      'rulesetVersion',
      'fixtures',
    ])
    expectRecursivelyFrozen(details)
    expect(details).not.toBe(response)
    expect(details.fixtures).not.toBe(response.fixtures)
    expect(details.fixtures.maximumLifecycle).not.toBe(response.fixtures.maximumLifecycle)
    expect(details.fixtures.maximumTurn).not.toBe(response.fixtures.maximumTurn)
    expect(details.fixtures.verifiedDuel).not.toBe(response.fixtures.verifiedDuel)
    expect(details.fixtures.verifiedDuel!.transcript).not.toBe(response.fixtures.verifiedDuel.transcript)

    response.fixtures.maximumLifecycle.tickCount = 999
    response.fixtures.maximumTurn.phase = 'PLAYER_TURN'
    response.fixtures.maximumTurn.requestEcho = 'source-only-secret'

    expect(details).toEqual(snapshot)
    expect(containsForbiddenPublicValue(details, ['source-only-secret'])).toBe(false)
  })
})

describe('ProductionDiagnostics schema-v1 receipt projector', () => {
  const passState = {
    id: 'verified-replay-runtime',
    label: 'Verified replay runtime',
    status: 'PASS',
    code: 'ok',
    details: EXACT_VERIFIED_REPLAY_RESPONSE,
  } as const
  const failState = {
    id: 'verified-replay-runtime',
    label: 'Verified replay runtime',
    status: 'FAIL',
    code: 'request_failed',
  } as const

  it('returns the exact typed schema-v1 PASS receipt', () => {
    const receipt: ProductionDiagnosticsReceipt | undefined = productionDiagnosticsReceiptForState(passState)

    expect(receipt).toEqual({
      schemaVersion: 1,
      overall: 'PASS',
      results: [{
        id: 'verified-replay-runtime',
        label: 'Verified replay runtime',
        status: 'PASS',
        code: 'ok',
        details: EXACT_VERIFIED_REPLAY_RESPONSE,
      }],
    })
  })

  it.each([
    'request_failed',
    'invalid_response',
    'invalid_check',
    'timeout',
    'run_in_progress',
    'not_authenticated',
    'disposed',
  ] as const)('returns an exact schema-v1 FAIL receipt for bounded code %s', (code) => {
    const receipt = productionDiagnosticsReceiptForState({ ...failState, code })

    expect(receipt).toEqual({
      schemaVersion: 1,
      overall: 'FAIL',
      results: [{
        id: 'verified-replay-runtime',
        label: 'Verified replay runtime',
        status: 'FAIL',
        code,
      }],
    })
  })

  it('maps an unknown widened FAIL code to invalid_response', () => {
    const receipt = productionDiagnosticsReceiptForState({
      ...failState,
      code: 'operator-secret-code' as never,
    })

    expect(receipt?.results[0]).toMatchObject({
      status: 'FAIL',
      code: 'invalid_response',
    })
  })

  it.each([
    { status: 'IDLE' },
    { status: 'RUNNING' },
    { status: 'loading' },
    { status: 'unavailable' },
    { status: 'anonymous' },
    { status: 'authenticated-error' },
    { status: 'signed-out' },
    { status: 'disposed' },
  ] as const)('returns no receipt for nonterminal state $status', (state) => {
    expect(productionDiagnosticsReceiptForState(state)).toBeUndefined()
  })

  it('returns a detached recursively frozen PASS receipt from a fully poisoned widened state', () => {
    const hostileState = {
      ...passState,
      id: 'id-primitive-secret-sentinel',
      label: 'label-primitive-secret-sentinel',
      code: 'code-primitive-secret-sentinel',
      topLevelSecretKey: 'top-level-secret-value',
      details: {
        ok: 'ok-primitive-secret-sentinel',
        probeVersion: 91001,
        engineVersion: 91002,
        rulesetVersion: 91003,
        detailsSecretKey: 'details-secret-value',
        fixtures: {
          maximumLifecycle: {
            phase: 'maximum-lifecycle-phase-secret-sentinel',
            winner: 'maximum-lifecycle-winner-secret-sentinel',
            winnerTeam: 91101,
            turn: 91102,
            actionCount: 91103,
            tickCount: 91104,
            maxTurnTickCount: 91105,
            lifecycleFixtureSecretKey: 'lifecycle-fixture-secret-value',
          },
          maximumTurn: {
            phase: 'maximum-turn-phase-secret-sentinel',
            winner: 'maximum-turn-winner-secret-sentinel',
            winnerTeam: 92101,
            turn: 92102,
            actionCount: 92103,
            tickCount: 92104,
            maxTurnTickCount: 92105,
            maximumTurnFixtureSecretKey: 'maximum-turn-fixture-secret-value',
          },
        },
      },
    } as never

    const receipt = productionDiagnosticsReceiptForState(hostileState)

    expect(receipt).toEqual(productionDiagnosticsReceiptForState(passState))
    expect(receipt).not.toBe(hostileState)
    expect(receipt?.results[0]?.details).not.toBe((hostileState as { details?: unknown }).details)
    const snapshot = structuredClone(receipt)
    ;(hostileState as { details: { fixtures: { maximumTurn: { tickCount: number } } } }).details.fixtures.maximumTurn.tickCount = 99999
    expect(receipt).toEqual(snapshot)
    if (receipt) expectRecursivelyFrozen(receipt)
  })
})

describe('ProductionDiagnostics lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the current Pages provenance run locked when a superseded request settles late', async () => {
    const stale = deferred<Response>()
    const current = deferred<Response>()
    const fetch = vi.fn()
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => current.promise)
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never, {
      fetch,
      baseUrl: 'https://suadtl.github.io/singedTerra/',
    })
    const first = diagnostics.runPagesProvenance()
    diagnostics.setReadiness('anonymous')
    diagnostics.setReadiness('authenticated')
    const second = diagnostics.runPagesProvenance()

    stale.resolve(new Response(JSON.stringify({ sha: 'a'.repeat(40), runId: '1' })))
    await first

    await expect(diagnostics.runPagesProvenance()).resolves.toEqual({
      status: 'FAIL',
      code: 'run_in_progress',
    })
    expect(fetch).toHaveBeenCalledTimes(2)

    current.resolve(new Response(JSON.stringify({ sha: 'b'.repeat(40), runId: '2' })))
    await expect(second).resolves.toMatchObject({ status: 'PASS', runId: '2' })
  })

  it('times out a stalled Pages provenance request at the exact boundary and ignores its late response', async () => {
    const stalled = deferred<Response>()
    const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => stalled.promise)
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never, {
      fetch,
      baseUrl: 'https://suadtl.github.io/singedTerra/',
    })
    const run = diagnostics.runPagesProvenance()
    const signal = fetch.mock.calls[0]?.[1]?.signal

    await vi.advanceTimersByTimeAsync(9_999)
    expect(diagnostics.pagesProvenance).toEqual({ status: 'RUNNING' })
    await vi.advanceTimersByTimeAsync(1)
    await expect(run).resolves.toEqual({ status: 'FAIL', code: 'timeout' })
    expect(diagnostics.pagesProvenance).toEqual({ status: 'FAIL', code: 'timeout' })
    expect(vi.getTimerCount()).toBe(0)
    expect(signal?.aborted).toBe(true)

    stalled.resolve(new Response(JSON.stringify({ sha: 'c'.repeat(40), runId: '3' })))
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.pagesProvenance).toEqual({ status: 'FAIL', code: 'timeout' })
  })

  it('cancels a multibyte Pages response stream as soon as its UTF-8 body exceeds 4096 bytes', async () => {
    const cancel = vi.fn()
    const multibyteOverflow = new TextEncoder().encode('€'.repeat(1_366))
    expect(multibyteOverflow.byteLength).toBe(4_098)
    expect('€'.repeat(1_366).length).toBeLessThan(4_096)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(multibyteOverflow.slice(0, 4_095))
        controller.enqueue(multibyteOverflow.slice(4_095))
      },
      cancel,
    })
    const fetch = vi.fn(async () => new Response(body, { status: 200 }))
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never, {
      fetch,
      baseUrl: 'https://suadtl.github.io/singedTerra/',
    })

    await expect(diagnostics.runPagesProvenance()).resolves.toEqual({
      status: 'FAIL', code: 'invalid_response',
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('accepts an exact 4096-byte Pages stream without cancelling it', async () => {
    const cancel = vi.fn()
    const exact = new TextEncoder().encode(
      `${JSON.stringify({ sha: 'd'.repeat(40), runId: '4' })}${' '.repeat(4_096 - 62)}`,
    )
    expect(exact.byteLength).toBe(4_096)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(exact)
        controller.close()
      },
      cancel,
    })
    const diagnostics = createProductionDiagnostics(diagnosticsClient().client as never, {
      fetch: vi.fn(async () => new Response(body, { status: 200 })),
      baseUrl: 'https://suadtl.github.io/singedTerra/',
    })

    await expect(diagnostics.runPagesProvenance()).resolves.toEqual({
      status: 'PASS', sha: 'd'.repeat(40), runId: '4',
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves an active duplicate immediately as run_in_progress without invoking or changing state', async () => {
    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn(() => request.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const firstRun = diagnostics.runChecks()
    const runningState = structuredClone(diagnostics.state)

    await expect(diagnostics.runChecks()).resolves.toMatchObject({ status: 'FAIL', code: 'run_in_progress' })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(diagnostics.state).toEqual(runningState)
    request.resolve({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    await expect(firstRun).resolves.toMatchObject({ status: 'PASS' })
  })

  it('starts a post-timeout run as RUNNING and ignores stale resolve and reject before PASS', async () => {
    const staleResolve = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const current = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn().mockImplementationOnce(() => staleResolve.promise).mockImplementationOnce(() => current.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const oldRun = diagnostics.runChecks()
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(oldRun).resolves.toMatchObject({ status: 'FAIL', code: 'timeout' })

    const newRun = diagnostics.runChecks()
    expect(diagnostics.state).toMatchObject({ status: 'RUNNING' })
    staleResolve.resolve({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.state).toMatchObject({ status: 'RUNNING' })
    current.resolve({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    const currentResult = await newRun
    expect(currentResult).toMatchObject({ status: 'PASS' })
    expect(diagnostics.state).toEqual(currentResult)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('ignores a late rejection from a stale superseded transport promise', async () => {
    const stale = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const current = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn().mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => current.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const oldRun = diagnostics.runChecks()
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(oldRun).resolves.toMatchObject({ status: 'FAIL', code: 'timeout' })
    const newRun = diagnostics.runChecks()
    stale.reject(new Error('late stale rejection'))
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.state).toMatchObject({ status: 'RUNNING' })
    current.resolve({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    await expect(newRun).resolves.toMatchObject({ status: 'PASS' })
    expect(diagnostics.state).toMatchObject({ status: 'PASS' })
  })

  it('settles pending sign-out once as not_authenticated and ignores a late rejection and new calls', async () => {
    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn(() => request.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never, { readiness: 'authenticated' })
    const pending = diagnostics.runChecks()
    diagnostics.setReadiness('signed-out')
    await expect(pending).resolves.toMatchObject({ status: 'FAIL', code: 'not_authenticated' })
    expect(diagnostics.state).toMatchObject({ status: 'signed-out' })
    request.reject(new Error('late rejection'))
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.state).toMatchObject({ status: 'signed-out' })
    await expect(diagnostics.runChecks()).resolves.toMatchObject({ status: 'FAIL', code: 'not_authenticated' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('settles pending disposal once as disposed and ignores a late rejection and new calls', async () => {
    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn(() => request.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const pending = diagnostics.runChecks()
    diagnostics.dispose()
    await expect(pending).resolves.toMatchObject({ status: 'FAIL', code: 'disposed' })
    expect(diagnostics.state).toMatchObject({ status: 'disposed' })
    request.reject(new Error('late rejection'))
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.state).toMatchObject({ status: 'disposed' })
    await expect(diagnostics.runChecks()).resolves.toMatchObject({ status: 'FAIL', code: 'disposed' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('keeps the timeout pending at 9,999ms and settles only at +1ms', async () => {
    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn(() => request.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const pending = diagnostics.runChecks()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(diagnostics.state).toMatchObject({ status: 'RUNNING' })
    let settled = false
    void pending.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toMatchObject({ status: 'FAIL', code: 'timeout' })
    request.reject(new Error('late rejection'))
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.state).toMatchObject({ status: 'FAIL', code: 'timeout' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it.each(NON_AUTHENTICATED_READINESS)('publishes initial %s readiness and refuses to invoke', async (readiness) => {
    const { client, invoke } = diagnosticsClient()
    const diagnostics = createProductionDiagnostics(client as never, { readiness })

    expect(diagnostics.state).toEqual({ status: readiness })
    await expect(diagnostics.runChecks()).resolves.toMatchObject({
      status: 'FAIL',
      code: 'not_authenticated',
    })
    expect(invoke).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(NON_AUTHENTICATED_READINESS)('replaces a prior PASS receipt with exact %s readiness', async (readiness) => {
    const { client } = diagnosticsClient()
    const diagnostics = createProductionDiagnostics(client as never)

    await expect(diagnostics.runChecks()).resolves.toMatchObject({ status: 'PASS' })
    diagnostics.setReadiness(readiness)

    expect(diagnostics.state).toEqual({ status: readiness })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(NON_AUTHENTICATED_READINESS)('replaces a prior FAIL receipt with exact %s readiness', async (readiness) => {
    const { client } = diagnosticsClient(null)
    const diagnostics = createProductionDiagnostics(client as never)

    await expect(diagnostics.runChecks()).resolves.toMatchObject({
      status: 'FAIL',
      code: 'invalid_response',
    })
    diagnostics.setReadiness(readiness)

    expect(diagnostics.state).toEqual({ status: readiness })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(NON_AUTHENTICATED_READINESS)('invalidates active work promptly when readiness becomes %s', async (readiness) => {
    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn(() => request.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const pending = diagnostics.runChecks()

    diagnostics.setReadiness(readiness)

    await expect(pending).resolves.toMatchObject({ status: 'FAIL', code: 'not_authenticated' })
    expect(diagnostics.state).toEqual({ status: readiness })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(NON_AUTHENTICATED_READINESS)('recovers from %s to authenticated IDLE and permits a fresh run', async (readiness) => {
    const { client, invoke } = diagnosticsClient()
    const diagnostics = createProductionDiagnostics(client as never, { readiness })

    diagnostics.setReadiness('authenticated')

    expect(diagnostics.state).toEqual({ status: 'IDLE' })
    await expect(diagnostics.runChecks()).resolves.toMatchObject({ status: 'PASS' })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps disposal terminal and idempotent', async () => {
    const { client, invoke } = diagnosticsClient()
    const diagnostics = createProductionDiagnostics(client as never)

    diagnostics.dispose()
    diagnostics.dispose()
    diagnostics.setReadiness('authenticated')

    expect(diagnostics.state).toEqual({ status: 'disposed' })
    await expect(diagnostics.runChecks()).resolves.toMatchObject({
      status: 'FAIL',
      code: 'disposed',
    })
    expect(invoke).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a late resolve after sign-out without changing the signed-out state', async () => {
    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn(() => request.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const pending = diagnostics.runChecks()

    diagnostics.setReadiness('signed-out')
    await expect(pending).resolves.toMatchObject({ status: 'FAIL', code: 'not_authenticated' })
    request.resolve({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    await vi.advanceTimersByTimeAsync(0)

    expect(diagnostics.state).toEqual({ status: 'signed-out' })
  })

  it('ignores a late resolve after disposal without changing the disposed state', async () => {
    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invoke = vi.fn(() => request.promise)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)
    const pending = diagnostics.runChecks()

    diagnostics.dispose()
    await expect(pending).resolves.toMatchObject({ status: 'FAIL', code: 'disposed' })
    request.resolve({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    await vi.advanceTimersByTimeAsync(0)

    expect(diagnostics.state).toEqual({ status: 'disposed' })
  })

  it('collapses a synchronous provider throw to request_failed and clears its timer', async () => {
    const secret = 'synchronous-provider-secret'
    const invoke = vi.fn(() => {
      throw new Error(secret)
    })
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({ status: 'FAIL', code: 'request_failed' })
    expect(diagnostics.state).toEqual(result)
    expect(containsForbiddenPublicValue(result, [secret])).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('collapses a hostile thenable rejection to request_failed safely', async () => {
    const secret = 'hostile-thenable-secret'
    const hostileThenable = {
      then(_resolve: unknown, reject: (reason: unknown) => void) {
        reject(new Error(secret))
      },
    }
    const invoke = vi.fn(() => hostileThenable)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)

    const result = await diagnostics.runChecks()

    expect(result).toMatchObject({ status: 'FAIL', code: 'request_failed' })
    expect(diagnostics.state).toEqual(result)
    expect(containsForbiddenPublicValue(result, [secret])).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves no timers after immediate success, failure, or readiness invalidation', async () => {
    const successClient = diagnosticsClient()
    const successDiagnostics = createProductionDiagnostics(successClient.client as never)
    await expect(successDiagnostics.runChecks()).resolves.toMatchObject({ status: 'PASS' })
    expect(vi.getTimerCount()).toBe(0)

    const failureClient = diagnosticsClient(null)
    const failureDiagnostics = createProductionDiagnostics(failureClient.client as never)
    await expect(failureDiagnostics.runChecks()).resolves.toMatchObject({
      status: 'FAIL',
      code: 'invalid_response',
    })
    expect(vi.getTimerCount()).toBe(0)

    const request = deferred<{ data: typeof EXACT_VERIFIED_REPLAY_RESPONSE; error: null }>()
    const invalidationInvoke = vi.fn(() => request.promise)
    const invalidationDiagnostics = createProductionDiagnostics({ functions: { invoke: invalidationInvoke } } as never)
    const pending = invalidationDiagnostics.runChecks()
    invalidationDiagnostics.setReadiness('anonymous')
    await expect(pending).resolves.toMatchObject({ status: 'FAIL', code: 'not_authenticated' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('makes repeated readiness transitions idempotent', () => {
    const { client } = diagnosticsClient()
    const diagnostics = createProductionDiagnostics(client as never, { readiness: 'loading' })

    diagnostics.setReadiness('loading')
    diagnostics.setReadiness('loading')
    expect(diagnostics.state).toEqual({ status: 'loading' })
    diagnostics.setReadiness('anonymous')
    diagnostics.setReadiness('anonymous')
    expect(diagnostics.state).toEqual({ status: 'anonymous' })
    diagnostics.setReadiness('authenticated')
    diagnostics.setReadiness('authenticated')
    expect(diagnostics.state).toEqual({ status: 'IDLE' })
  })

  it.each([
    ['PASS', EXACT_VERIFIED_REPLAY_RESPONSE],
    ['FAIL', null],
  ] as const)('preserves a terminal %s receipt across repeated authenticated readiness', async (status, response) => {
    const { client } = diagnosticsClient(response)
    const diagnostics = createProductionDiagnostics(client as never)

    await diagnostics.runChecks()
    const terminalState = diagnostics.state
    const terminalReceipt = productionDiagnosticsReceiptForState(terminalState)
    expect(terminalState.status).toBe(status)

    diagnostics.setReadiness('authenticated')
    diagnostics.setReadiness('authenticated')

    expect(diagnostics.state).toBe(terminalState)
    expect(productionDiagnosticsReceiptForState(diagnostics.state)).toEqual(terminalReceipt)
  })
})
