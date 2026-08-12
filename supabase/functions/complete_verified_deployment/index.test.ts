import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  createCompleteVerifiedDeploymentHandler,
  handleCompleteVerifiedDeployment,
} from './index.ts'
import { buildVerifiedDeploymentConfig, handleStartVerifiedDeployment } from '../start_verified_deployment/index.ts'
import { handleAbandonVerifiedDeployment } from '../abandon_verified_deployment/index.ts'

const userId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '33333333-3333-4333-8333-333333333333'
const sessionId = '22222222-2222-4222-8222-222222222222'
const transcript = [{ angle: 90, power: 100 }]

const config = {
  seed: 17,
  options: {
    maxPlayers: 2, maxWind: 6, gravity: 0.15, walls: 'open', hazards: 'none',
    rounds: 1, interestRate: 0, suddenDeathTurn: 0, armsLevel: 0,
    starterWeaponFalloff: 'decisive', teamMode: false,
    players: [
      { name: 'Ash Walker', color: '#e8554d' },
      { name: 'CPU 1', color: '#3f78b8', ai: 'hard' },
    ],
  },
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    session_id: sessionId,
    user_id: userId,
    config,
    contract_version: 1,
    engine_version: 1,
    ruleset_version: 3,
    status: 'active',
    expires_at: '2026-08-11T12:30:00.000Z',
    transcript: null,
    won: null,
    outcome: null,
    verified_xp: null,
    prior_verified_matches: null,
    prior_verified_wins: null,
    prior_total_xp: null,
    current_verified_matches: null,
    current_verified_wins: null,
    current_total_xp: null,
    result_created_at: null,
    ...overrides,
  }
}

function replayResult(overrides: Record<string, unknown> = {}) {
  return {
    seed: 17,
    outcome: 'human_win',
    winnerId: 'p1',
    reason: 'terminal',
    humanSalvos: 1,
    cpuSalvos: 1,
    liveTicks: 391,
    cpuSimulationTicks: 240,
    maximumProbeCount: 35,
    transcript,
    ...overrides,
  }
}

function dependencies(options: {
  context?: Record<string, unknown>
  contextRows?: unknown
  complete?: Record<string, unknown> | null
  completeRows?: unknown
  errorAt?: string
} = {}) {
  const calls: Array<{ name: string; args: unknown }> = []
  const supabase = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args })
      if (options.errorAt === name) return { data: null, error: { message: `${name}:${userId}` } }
      if (name === 'verified_deployment_completion_context') return { data: options.contextRows ?? [context(options.context)], error: null }
      if (name === 'complete_verified_deployment') return {
        data: options.completeRows ?? (options.complete === null ? null : [{
          session_id: sessionId,
          user_id: userId,
          transcript,
          won: true,
          outcome: 'win',
          verified_xp: 200,
          prior_verified_matches: 0,
          prior_verified_wins: 0,
          prior_total_xp: 0,
          current_verified_matches: 1,
          current_verified_wins: 1,
          current_total_xp: 200,
          created_at: '2026-08-11T12:01:00.000Z',
          ...options.complete,
        }]),
        error: null,
      }
      throw new Error(`unexpected RPC ${name}`)
    },
  }
  return { supabase, calls }
}

Deno.test('completion rejects non-exact bodies, UUIDs, and forbidden client authority before storage or replay', async () => {
  for (const body of [
    undefined,
    {},
    { sessionId },
    { transcript },
    { sessionId: 'not-a-uuid', transcript },
    { sessionId, transcript, outcome: 'win' },
    { sessionId, transcript: [{ angle: 90, power: 100, cpu: true }] },
    { sessionId, transcript: [{ angle: 90, power: 101 }] },
    { sessionId, transcript: [] },
  ]) {
    const test = dependencies()
    let replayed = 0
    const response = await handleCompleteVerifiedDeployment(body, new Request('https://x.test'), userId, {
      supabase: test.supabase as never,
      replay: () => { replayed += 1; return replayResult() as never },
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      logger: () => undefined,
    })
    assertEquals(response.status, 400)
    assertEquals([test.calls, replayed], [[], 0])
  }
})

Deno.test('completion validates owner, lifecycle, expiry, and versioned server config before replay or mutation', async () => {
  for (const row of [
    context({ user_id: otherUserId }),
    context({ status: 'abandoned' }),
    context({ status: 'expired' }),
    context({ status: 'active', expires_at: '2026-08-11T11:59:59.999Z' }),
    context({ contract_version: 2 }),
    context({ engine_version: 2 }),
    context({ ruleset_version: 2 }),
    context({ config: { seed: 109 } }),
    context({ config: { ...config, options: { ...config.options, maxWind: 7 } } }),
    context({ config: { ...config, options: { ...config.options, players: [{ name: 'Ash Walker', color: '#e8554d' }, { name: 'CPU 1', color: '#3f78b8', ai: 'hard' }], forbidden: true } } }),
  ]) {
    const test = dependencies({ context: row })
    let replayed = 0
    const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
      supabase: test.supabase as never,
      replay: () => { replayed += 1; return replayResult() as never },
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      logger: () => undefined,
    })
    assertEquals(response.status, 409)
    assertEquals(test.calls.map((call) => call.name), ['verified_deployment_completion_context'])
    assertEquals(replayed, 0)
  }
})

Deno.test('completion refuses completion-context cardinality and malformed or widened rows before replay', async () => {
  for (const rows of [
    [],
    [context(), context()],
    [null],
    [{ ...context(), unexpected: true }],
    [{ ...context(), expires_at: 'not-a-date' }],
    [{ ...context(), status: 'active', transcript: transcript }],
    [context({ status: 'completed', transcript, won: true, outcome: 'win', verified_xp: 200, result_created_at: 'not-a-date' })],
  ]) {
    const test = dependencies({ contextRows: rows })
    let replayed = 0
    const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
      supabase: test.supabase as never,
      replay: () => { replayed += 1; return replayResult() as never },
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      logger: () => undefined,
    })
    assertEquals(response.status, 409)
    assertEquals([test.calls.map((call) => call.name), replayed], [['verified_deployment_completion_context'], 0])
  }
})

Deno.test('completion independently replays server seed, maps the deterministic result, and atomically stores only canonical evidence', async () => {
  const test = dependencies()
  const replayCalls: unknown[] = []
  const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
    supabase: test.supabase as never,
    replay: (seed: number, evidence: unknown) => { replayCalls.push([seed, evidence]); return replayResult({ outcome: 'human_win', reason: 'alive' }) as never },
    now: () => new Date('2026-08-11T12:00:00.000Z'),
  })
  assertEquals(response.status, 200)
  assertEquals(replayCalls, [[17, transcript]])
  assertEquals(test.calls, [
    { name: 'verified_deployment_completion_context', args: { p_user_id: userId, p_session_id: sessionId } },
    { name: 'complete_verified_deployment', args: { p_user_id: userId, p_session_id: sessionId, p_transcript: transcript, p_won: true, p_outcome: 'win', p_verified_xp: 200 } },
  ])
  assertEquals(await response.json(), {
    result: { sessionId, won: true, outcome: 'win', verifiedXp: 200 },
    progression: {
      evidence: 'verified_replay_v1',
      prior: { matchesPlayed: 0, wins: 0, totalXp: 0 },
      current: { matchesPlayed: 1, wins: 1, totalXp: 200 },
    },
  })
})

Deno.test('completion maps CPU win and cap draw from replay rather than accepting client outcome or totals', async () => {
  for (const [outcome, expected] of [
    ['cpu_win', { won: false, outcome: 'loss', verifiedXp: 100, wins: 0, totalXp: 100 }],
    ['draw', { won: false, outcome: 'draw', verifiedXp: 100, wins: 0, totalXp: 100 }],
  ] as const) {
    const test = dependencies({ complete: {
      won: expected.won,
      outcome: expected.outcome,
      verified_xp: expected.verifiedXp,
      current_verified_wins: expected.wins,
      current_total_xp: expected.totalXp,
    } })
    const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
      supabase: test.supabase as never,
      replay: () => replayResult({ outcome, reason: 'total_damage' }) as never,
      now: () => new Date('2026-08-11T12:00:00.000Z'),
    })
    assertEquals(response.status, 200)
    assertEquals((await response.json()).result, { sessionId, won: expected.won, outcome: expected.outcome, verifiedXp: expected.verifiedXp })
  }
})

Deno.test('completed same-evidence retry returns the immutable receipt without replay and refuses conflicts', async () => {
  const completed = context({
    status: 'completed', transcript, won: true, outcome: 'win', verified_xp: 200,
    prior_verified_matches: 3, prior_verified_wins: 1, prior_total_xp: 400,
    current_verified_matches: 4, current_verified_wins: 2, current_total_xp: 600,
    result_created_at: '2026-08-11T12:01:00.000Z',
  })
  const retry = dependencies({ context: completed })
  let replayed = 0
  const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
    supabase: retry.supabase as never,
    replay: () => { replayed += 1; return replayResult() as never },
    now: () => new Date('2026-08-11T12:00:00.000Z'),
  })
  assertEquals(response.status, 200)
  assertEquals(replayed, 0)
  assertEquals(retry.calls.map((call) => call.name), ['verified_deployment_completion_context'])
  assertEquals(await response.json(), {
    result: { sessionId, won: true, outcome: 'win', verifiedXp: 200 },
    progression: {
      evidence: 'verified_replay_v1',
      prior: { matchesPlayed: 3, wins: 1, totalXp: 400 },
      current: { matchesPlayed: 4, wins: 2, totalXp: 600 },
    },
  })

  const conflict = dependencies({ context: completed })
  const conflictResponse = await handleCompleteVerifiedDeployment({ sessionId, transcript: [{ angle: 91, power: 100 }] }, new Request('https://x.test'), userId, {
    supabase: conflict.supabase as never,
    replay: () => { throw new Error('must not replay') },
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    logger: () => undefined,
  })
  assertEquals(conflictResponse.status, 409)
  assertEquals(conflict.calls.map((call) => call.name), ['verified_deployment_completion_context'])
})

Deno.test('completion rejects widened, conflicting, or non-singleton atomic result rows without an award receipt', async () => {
  for (const rows of [
    [],
    [{ session_id: sessionId, user_id: otherUserId, transcript, won: true, outcome: 'win', verified_xp: 200 }],
    [{ session_id: otherUserId, user_id: userId, transcript, won: true, outcome: 'win', verified_xp: 200 }],
    [{ session_id: sessionId, user_id: userId, transcript: [{ angle: 91, power: 100 }], won: true, outcome: 'win', verified_xp: 200 }],
    [{ session_id: sessionId, user_id: userId, transcript, won: false, outcome: 'loss', verified_xp: 100 }],
    [{ session_id: sessionId, user_id: userId, transcript, won: true, outcome: 'win', verified_xp: 200, internal: true }],
    [{ session_id: sessionId, user_id: userId, transcript, won: true, outcome: 'win', verified_xp: 200, created_at: 'not-a-date' }],
    [
      { session_id: sessionId, user_id: userId, transcript, won: true, outcome: 'win', verified_xp: 200 },
      { session_id: sessionId, user_id: userId, transcript, won: true, outcome: 'win', verified_xp: 200 },
    ],
  ]) {
    const test = dependencies({ completeRows: rows })
    const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
      supabase: test.supabase as never,
      replay: () => replayResult() as never,
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      logger: () => undefined,
    })
    assertEquals(response.status, 409)
    assertEquals(test.calls.map((call) => call.name), ['verified_deployment_completion_context', 'complete_verified_deployment'])
  }
})

Deno.test('completion rejects malformed immutable progression projections from atomic storage', async () => {
  for (const complete of [
    { current_total_xp: 199 },
    { prior_verified_matches: 1, current_verified_matches: 1 },
    { prior_verified_wins: 1, current_verified_wins: 3 },
    { prior_total_xp: 200, current_total_xp: 600 },
    { current_verified_matches: '1' },
    { progression_owner: userId },
  ]) {
    const test = dependencies({ complete })
    const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
      supabase: test.supabase as never,
      replay: () => replayResult() as never,
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      logger: () => undefined,
    })
    assertEquals(response.status, 409)
    assertEquals(await response.json(), { error: 'verified_deployment_unavailable' })
    assertEquals(test.calls.map((call) => call.name), ['verified_deployment_completion_context', 'complete_verified_deployment'])
  }
})

Deno.test('same-account completions keep immutable result-specific progression ordering across devices', async () => {
  const first = dependencies({ complete: {
    prior_verified_matches: 4, prior_verified_wins: 2, prior_total_xp: 600,
    current_verified_matches: 5, current_verified_wins: 3, current_total_xp: 800,
  } })
  const firstResponse = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
    supabase: first.supabase as never,
    replay: () => replayResult() as never,
    now: () => new Date('2026-08-11T12:00:00.000Z'),
  })
  assertEquals((await firstResponse.json()).progression, {
    evidence: 'verified_replay_v1',
    prior: { matchesPlayed: 4, wins: 2, totalXp: 600 },
    current: { matchesPlayed: 5, wins: 3, totalXp: 800 },
  })

  const secondSessionId = '55555555-5555-4555-8555-555555555555'
  const second = dependencies({
    context: { session_id: secondSessionId },
    complete: {
      session_id: secondSessionId,
      prior_verified_matches: 5, prior_verified_wins: 3, prior_total_xp: 800,
      current_verified_matches: 6, current_verified_wins: 4, current_total_xp: 1000,
    },
  })
  const secondResponse = await handleCompleteVerifiedDeployment({ sessionId: secondSessionId, transcript }, new Request('https://x.test'), userId, {
    supabase: second.supabase as never,
    replay: () => replayResult() as never,
    now: () => new Date('2026-08-11T12:00:00.000Z'),
  })
  assertEquals((await secondResponse.json()).progression, {
    evidence: 'verified_replay_v1',
    prior: { matchesPlayed: 5, wins: 3, totalXp: 800 },
    current: { matchesPlayed: 6, wins: 4, totalXp: 1000 },
  })
  assertEquals([...first.calls, ...second.calls].some((call) => call.name === 'verified_progression_summary'), false)
})

Deno.test('completion fails generically without mutation after replay failure and without a partial receipt after storage failure', async () => {
  const replayFailure = dependencies()
  const replayResponse = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
    supabase: replayFailure.supabase as never,
    replay: () => { throw new Error('private physics state') },
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    logger: () => undefined,
  })
  assertEquals(replayResponse.status, 409)
  assertEquals(replayFailure.calls.map((call) => call.name), ['verified_deployment_completion_context'])

  const storageFailure = dependencies({ errorAt: 'complete_verified_deployment' })
  const storageResponse = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
    supabase: storageFailure.supabase as never,
    replay: () => replayResult() as never,
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    logger: () => undefined,
  })
  assertEquals(storageResponse.status, 409)
  assertEquals(await storageResponse.json(), { error: 'verified_deployment_unavailable' })
  assertEquals(storageFailure.calls.map((call) => call.name), ['verified_deployment_completion_context', 'complete_verified_deployment'])
})

Deno.test('completion responses and logs remain identifier-free across storage and replay failures', async () => {
  const logs: unknown[] = []
  const privateToken = 'Bearer private-completion-token'
  const response = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test', { headers: { authorization: privateToken } }), userId, {
    supabase: { rpc: async () => { throw new Error(`${privateToken}:${userId}:${sessionId}`) } } as never,
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    logger: (message, context) => logs.push([message, context]),
  })
  assertEquals(response.status, 500)
  const serialized = JSON.stringify([await response.json(), logs])
  for (const secret of [privateToken, userId, sessionId]) assertEquals(serialized.includes(secret), false)
})

Deno.test('completion wrapper uses the accepted bounded authenticated completion transport', () => {
  const calls: unknown[][] = []
  const sentinel = async () => new Response('sentinel')
  assertEquals(createCompleteVerifiedDeploymentHandler(((...args: unknown[]) => { calls.push(args); return sentinel }) as never), sentinel)
  assertEquals(calls[0]?.[1], { operation: 'complete_verified_deployment', bodyLimit: 1024 })
})

Deno.test('starts-disabled drain refuses new starts while existing resume, abandon, and completion remain operational', async () => {
  const active = new Set([sessionId, '44444444-4444-4444-8444-444444444444'])
  const abandoned = '44444444-4444-4444-8444-444444444444'
  const results = new Map<string, Record<string, unknown>>()
  const supabase = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { display_name: 'Ash Walker' }, error: null }) }) }) }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'start_verified_deployment') {
        const existing = [...active][0]
        return existing && args.p_user_id === userId
          ? { data: [{ id: existing, user_id: userId, config: buildVerifiedDeploymentConfig('Ash Walker', 17), contract_version: 1, engine_version: 1, ruleset_version: 3, status: 'active', expires_at: '2026-08-11T12:30:00.000Z', created_at: '2026-08-11T12:00:00.000Z', resumed: true }], error: null }
          : { data: null, error: { message: 'verified_deployment_starts_disabled' } }
      }
      if (name === 'abandon_verified_deployment') {
        const id = args.p_session_id as string
        if (!active.delete(id)) return { data: null, error: { message: 'not_found' } }
        return { data: [{ id, user_id: userId, status: 'abandoned' }], error: null }
      }
      if (name === 'verified_deployment_completion_context') return { data: [context({ session_id: args.p_session_id })], error: null }
      if (name === 'complete_verified_deployment') {
        const id = args.p_session_id as string
        results.set(id, {
          session_id: id, user_id: userId, transcript: args.p_transcript, won: args.p_won,
          outcome: args.p_outcome, verified_xp: args.p_verified_xp,
          prior_verified_matches: 0, prior_verified_wins: 0, prior_total_xp: 0,
          current_verified_matches: 1, current_verified_wins: 1, current_total_xp: 200,
          created_at: '2026-08-11T12:01:00.000Z',
        })
        active.delete(id)
        return { data: [results.get(id)], error: null }
      }
      throw new Error(`unexpected ${name}`)
    },
  }
  const resumed = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), userId, { supabase: supabase as never, chooseSeed: () => 17, now: () => new Date('2026-08-11T12:00:00.000Z') })
  assertEquals(resumed.status, 200)
  const newStart = await handleStartVerifiedDeployment(undefined, new Request('https://x.test'), otherUserId, { supabase: supabase as never, chooseSeed: () => 17, now: () => new Date('2026-08-11T12:00:00.000Z'), logger: () => undefined })
  assertEquals(newStart.status, 503)
  const abandonedResponse = await handleAbandonVerifiedDeployment({ sessionId: abandoned }, new Request('https://x.test'), userId, { supabase: supabase as never })
  assertEquals(abandonedResponse.status, 200)
  const completed = await handleCompleteVerifiedDeployment({ sessionId, transcript }, new Request('https://x.test'), userId, {
    supabase: supabase as never, replay: () => replayResult() as never, now: () => new Date('2026-08-11T12:00:00.000Z'),
  })
  assertEquals(completed.status, 200)
  assertEquals(results.has(sessionId), true)
})
