import { afterEach, describe, expect, it, vi } from 'vitest'

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

afterEach(() => {
  vi.doUnmock('./ProductionDiagnosticsRegistry')
  vi.resetModules()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ProductionDiagnostics immutable registry execution', () => {
  it('contains a throwing descriptor projector as invalid_response and still settles the run', async () => {
    vi.useFakeTimers()
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    ]
    const registry = Object.freeze([
      Object.freeze({
        id: 'verified-replay-runtime',
        label: 'Verified replay runtime',
        functionName: 'verified_replay_probe',
        validateResponse: () => true,
        projectPublicDetails: () => { throw new Error('projector-secret') },
      }),
    ] as const)
    vi.doMock('./ProductionDiagnosticsRegistry', () => ({ PRODUCTION_DIAGNOSTIC_CHECKS: registry }))
    const {
      createProductionDiagnostics,
      productionDiagnosticsReceiptForState,
    } = await import('./ProductionDiagnostics')
    const diagnostics = createProductionDiagnostics({
      functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) },
    } as never)

    const result = await diagnostics.runChecks()
    expect(result).toMatchObject({
      status: 'FAIL',
      code: 'invalid_response',
      results: [{ status: 'FAIL', code: 'invalid_response' }],
    })
    expect(diagnostics.state).toMatchObject({ status: 'FAIL', code: 'invalid_response' })
    const receipt = productionDiagnosticsReceiptForState(diagnostics.state)
    expect(receipt).toMatchObject({
      overall: 'FAIL',
      results: [{ status: 'FAIL', code: 'invalid_response' }],
    })
    expect(JSON.stringify({ result, state: diagnostics.state, receipt })).not.toContain('projector-secret')
    expect(consoleSpies.flatMap((spy) => spy.mock.calls).flat().map(String).join(' '))
      .not.toContain('projector-secret')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles every descriptor sequentially with independent validation and a complete receipt', async () => {
    const registry = Object.freeze([
      Object.freeze({
        id: 'verified-replay-runtime',
        label: 'Verified replay runtime',
        functionName: 'verified_replay_probe',
        validateResponse: (value: unknown) => value === EXACT_VERIFIED_REPLAY_RESPONSE,
        projectPublicDetails: () => Object.freeze({ contract: 'verified-replay-v1' }),
      }),
      Object.freeze({
        id: 'fixture-secondary-runtime',
        label: 'Fixture secondary runtime',
        functionName: 'fixture_secondary_probe',
        validateResponse: (value: unknown) => (
          typeof value === 'object'
          && value !== null
          && Reflect.ownKeys(value).length === 2
          && (value as { kind?: unknown }).kind === 'secondary'
          && (value as { version?: unknown }).version === 7
        ),
        projectPublicDetails: () => Object.freeze({ contract: 'fixture-secondary-v7' }),
      }),
    ] as const)
    vi.doMock('./ProductionDiagnosticsRegistry', () => ({
      PRODUCTION_DIAGNOSTIC_CHECKS: registry,
    }))
    const {
      createProductionDiagnostics,
      productionDiagnosticsReceiptForState,
    } = await import('./ProductionDiagnostics')
    const { buildProductionDiagnosticsView } = await import('../ui/ProductionDiagnosticsView')
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
      .mockResolvedValueOnce({ data: { kind: 'secondary', version: 7 }, error: null })
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)

    const terminal = await diagnostics.runChecks() as typeof diagnostics.state & {
      readonly results: readonly unknown[]
    }

    expect(invoke.mock.calls).toEqual([
      ['verified_replay_probe'],
      ['fixture_secondary_probe'],
    ])
    expect(terminal).toMatchObject({ status: 'PASS' })
    expect(terminal.results).toEqual([
      expect.objectContaining({
        id: 'verified-replay-runtime',
        status: 'PASS',
        code: 'ok',
        details: { contract: 'verified-replay-v1' },
      }),
      expect.objectContaining({
        id: 'fixture-secondary-runtime',
        status: 'PASS',
        code: 'ok',
        details: { contract: 'fixture-secondary-v7' },
      }),
    ])
    expect(productionDiagnosticsReceiptForState(diagnostics.state)).toMatchObject({
      overall: 'PASS',
      results: [
        { id: 'verified-replay-runtime', status: 'PASS', details: { contract: 'verified-replay-v1' } },
        { id: 'fixture-secondary-runtime', status: 'PASS', details: { contract: 'fixture-secondary-v7' } },
      ],
    })
    expect(Object.isFrozen(terminal.results)).toBe(true)

    const onRun = vi.fn()
    const view = buildProductionDiagnosticsView({
      state: diagnostics.state,
      completionRetryProbe: diagnostics.completionRetryProbe,
      pagesProvenance: diagnostics.pagesProvenance,
      copyStatus: 'idle',
      resolveReturnFocus: () => null,
      onRun,
      onCopyReceipt: vi.fn(),
      onOpenAccount: vi.fn(),
      onArmCompletionRetryProbe: vi.fn(),
      onRunPagesProvenance: vi.fn(),
      onClose: vi.fn(),
    })
    expect([...view.querySelectorAll('.production-diagnostics__check-line')].map((line) => line.textContent)).toEqual([
      'Verified replay runtimeverified_replay_probe',
      'Fixture secondary runtimefixture_secondary_probe',
    ])
    const run = [...view.querySelectorAll('button')].find((button) => button.textContent === 'Run checks')
    run?.click()
    expect(onRun).toHaveBeenCalledOnce()
    expect(onRun).toHaveBeenCalledWith()

    invoke
      .mockResolvedValueOnce({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
      .mockResolvedValueOnce({ data: { kind: 'secondary', version: 8 }, error: null })
    const ownerFailure = await diagnostics.runChecks() as typeof diagnostics.state & {
      readonly results: readonly unknown[]
    }
    expect(ownerFailure).toMatchObject({
      status: 'FAIL',
      results: [
        { id: 'verified-replay-runtime', status: 'PASS', code: 'ok' },
        { id: 'fixture-secondary-runtime', status: 'FAIL', code: 'invalid_response' },
      ],
    })
    expect(productionDiagnosticsReceiptForState(diagnostics.state)).toMatchObject({
      overall: 'FAIL',
      results: [
        { id: 'verified-replay-runtime', status: 'PASS', details: { contract: 'verified-replay-v1' } },
        { id: 'fixture-secondary-runtime', status: 'FAIL', code: 'invalid_response' },
      ],
    })
  })

  it('isolates each descriptor timeout and continues the remaining registry in order', async () => {
    vi.useFakeTimers()
    const registry = Object.freeze([
      Object.freeze({
        id: 'verified-replay-runtime',
        label: 'Verified replay runtime',
        functionName: 'verified_replay_probe',
        validateResponse: (value: unknown) => value === EXACT_VERIFIED_REPLAY_RESPONSE,
        projectPublicDetails: () => Object.freeze({ contract: 'verified-replay-v1' }),
      }),
      Object.freeze({
        id: 'fixture-secondary-runtime',
        label: 'Fixture secondary runtime',
        functionName: 'fixture_secondary_probe',
        validateResponse: (value: unknown) => value === EXACT_VERIFIED_REPLAY_RESPONSE,
        projectPublicDetails: () => Object.freeze({ contract: 'fixture-secondary-v7' }),
      }),
    ] as const)
    vi.doMock('./ProductionDiagnosticsRegistry', () => ({ PRODUCTION_DIAGNOSTIC_CHECKS: registry }))
    const { createProductionDiagnostics } = await import('./ProductionDiagnostics')
    let resolveFirst!: (value: unknown) => void
    let resolveSecond!: (value: unknown) => void
    const first = new Promise((resolve) => { resolveFirst = resolve })
    const second = new Promise((resolve) => { resolveSecond = resolve })
    const invoke = vi.fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second)
    const diagnostics = createProductionDiagnostics({ functions: { invoke } } as never)

    const pending = diagnostics.runChecks()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(diagnostics.state).toEqual({ status: 'RUNNING' })
    resolveFirst({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.state).toEqual({ status: 'RUNNING' })
    resolveSecond({ data: EXACT_VERIFIED_REPLAY_RESPONSE, error: null })
    const terminal = await pending as typeof diagnostics.state & { readonly results: readonly unknown[] }

    expect(invoke.mock.calls).toEqual([['verified_replay_probe'], ['fixture_secondary_probe']])
    expect(terminal).toMatchObject({
      status: 'FAIL',
      results: [
        { id: 'verified-replay-runtime', status: 'FAIL', code: 'timeout' },
        { id: 'fixture-secondary-runtime', status: 'PASS', code: 'ok' },
      ],
    })
    expect(vi.getTimerCount()).toBe(0)
  })
})
