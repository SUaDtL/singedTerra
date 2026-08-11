import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRODUCTION_DIAGNOSTIC_CHECKS,
  createProductionDiagnostics,
  productionDiagnosticsReceiptForState,
  validateVerifiedReplayProbeResponse,
} from './ProductionDiagnostics'

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
