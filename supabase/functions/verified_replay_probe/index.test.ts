import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import * as probeModule from './index.ts'
import type { VerifiedReplayProbeDependencies } from './index.ts'
import { VERIFIED_REPLAY_PROBE_FIXTURES } from '../_shared/verifiedReplayProbeFixture.ts'
import { VerifiedReplayError } from '../_shared/verifiedMatchReplay.ts'
import { withCors } from '../_shared/mod.ts'

const { handleVerifiedReplayProbe } = probeModule

type ProbeSupabase = NonNullable<VerifiedReplayProbeDependencies['supabase']>
const PROBE_SUPABASE_IS_AUTH_ONLY: keyof ProbeSupabase extends 'auth'
  ? ('auth' extends keyof ProbeSupabase ? true : false)
  : false = true
void PROBE_SUPABASE_IS_AUTH_ONLY

type ProbeHandler = (
  body: unknown,
  req: Request,
  dependencies: {
    supabase: { auth: { getUser: (token: string) => Promise<unknown> } }
    replay?: (...args: unknown[]) => unknown
    logger?: (message: string, context: Record<string, unknown>) => void
  },
) => Response | Promise<Response>

const invokeProbe = handleVerifiedReplayProbe as unknown as ProbeHandler

function request(authorization = ''): Request {
  return new Request('https://example.test/verified_replay_probe', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

const EXPECTED_PROBE_RESPONSE = {
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
}

function authenticatedDependencies() {
  let tableCalls = 0
  let rpcCalls = 0
  const supabase = {
    auth: {
      getUser: async (token: string) => ({
        data: { user: token === 'accepted-token' ? { id: 'account-user-id' } : null },
        error: token === 'accepted-token' ? null : { message: 'rejected' },
      }),
    },
    from: () => {
      tableCalls += 1
      throw new Error('probe must not access tables')
    },
    rpc: () => {
      rpcCalls += 1
      throw new Error('probe must not call RPCs')
    },
  }
  return {
    dependencies: { supabase },
    storageCalls: () => ({ tableCalls, rpcCalls }),
  }
}

Deno.test('verified replay probe exports one callable request handler', () => {
  assertEquals(typeof handleVerifiedReplayProbe, 'function')
})

Deno.test('verified replay probe wrapper factory consumes the exact no-body and rate-limit configuration', () => {
  const calls: unknown[][] = []
  const sentinel = async () => new Response('sentinel')
  const factory = (probeModule as Record<string, unknown>).createVerifiedReplayProbeHandler
  assertEquals(typeof factory, 'function')

  const created = (factory as (wrap: (...args: unknown[]) => unknown) => unknown)(
    (...args: unknown[]) => {
      calls.push(args)
      return sentinel
    },
  )

  assertEquals(created, sentinel)
  assertEquals(calls.length, 1)
  assertEquals(calls[0]?.[0], handleVerifiedReplayProbe)
  assertEquals(calls[0]?.[1], {
    bodyMode: 'none',
    rateLimit: 'verified_replay_probe',
  })
})

Deno.test('verified replay probe startup registers the exact configured exported handler', () => {
  const register = (probeModule as Record<string, unknown>).registerVerifiedReplayProbe
  assertEquals(typeof register, 'function')
  const registered: unknown[] = []

  ;(register as (serve: (handler: unknown) => void) => void)((handler) => {
    registered.push(handler)
  })

  assertEquals(registered, [probeModule.serveVerifiedReplayProbe])
})

Deno.test('verified replay probe top-level startup gate registers only for the main module', () => {
  const start = (probeModule as Record<string, unknown>).startVerifiedReplayProbe
  assertEquals(typeof start, 'function')
  const registrations: string[] = []
  const register = () => registrations.push('registered')

  ;(start as (isMain: boolean, register: () => void) => void)(false, register)
  assertEquals(registrations, [])
  ;(start as (isMain: boolean, register: () => void) => void)(true, register)
  assertEquals(registrations, ['registered'])
})

Deno.test('verified replay probe configured wrapper rate-limits then rejects a body before auth or replay', async () => {
  const factory = (probeModule as Record<string, unknown>).createVerifiedReplayProbeHandler
  let limiterCalls = 0
  const serve = (factory as (wrap: (...args: unknown[]) => unknown) => unknown)(
    ((handler: Parameters<typeof withCors>[0], opts: Parameters<typeof withCors>[1]) =>
      withCors(handler, opts, {
        rateLimit: { bumpRateLimit: async () => {
          limiterCalls += 1
          return { data: 1, error: null }
        } },
      })) as unknown as (...args: unknown[]) => unknown,
  )
  const response = await (serve as (request: Request) => Promise<Response>)(new Request(
    'https://example.test/verified_replay_probe',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript: [] }),
    },
  ))
  assertEquals(limiterCalls, 1)
  assertEquals(response.status, 400)
  assertEquals(await response.json(), { error: 'Request body not allowed' })
})

Deno.test('verified replay probe rejects every unvalidated Bearer before replay', async () => {
  const authTokens: string[] = []
  let replayCalls = 0
  const dependencies = {
    supabase: {
      auth: {
        getUser: async (token: string) => {
          authTokens.push(token)
          return { data: { user: null }, error: { message: 'rejected' } }
        },
      },
    },
    replay: () => {
      replayCalls += 1
      throw new Error('replay must not run')
    },
  }

  for (const authorization of ['', 'Basic token', 'Bearer two tokens', 'Bearer first, Bearer second']) {
    const response = await invokeProbe(undefined, request(authorization), dependencies)
    assertEquals(response.status, 401)
    assertEquals(await response.json(), { error: 'unauthorized' })
  }
  const rejected = await invokeProbe(undefined, request('Bearer rejected-token'), dependencies)
  assertEquals(rejected.status, 401)
  assertEquals(await rejected.json(), { error: 'unauthorized' })
  assertEquals(authTokens, ['rejected-token'])
  assertEquals(replayCalls, 0)
})

Deno.test('verified replay probe contains a thrown Auth lookup as a generic 401 before replay', async () => {
  let replayCalls = 0
  const response = await invokeProbe(
    undefined,
    request('Bearer accepted-shape'),
    {
      supabase: {
        auth: {
          getUser: () => {
            throw new Error('raw auth transport failure')
          },
        },
      },
      replay: () => {
        replayCalls += 1
        throw new Error('replay must not run')
      },
    },
  )

  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'unauthorized' })
  assertEquals(replayCalls, 0)
})

Deno.test('verified replay probe returns the exact legacy and maximum-workload duel result', async () => {
  const test = authenticatedDependencies()
  const response = await invokeProbe(
    undefined,
    request('Bearer accepted-token'),
    test.dependencies,
  )

  assertEquals(response.status, 200)
  assertEquals(await response.json(), EXPECTED_PROBE_RESPONSE)
})

Deno.test('verified replay probe invokes both exact production fixtures and returns their replay results', async () => {
  const calls: unknown[][] = []
  const sentinels = [
    { phase: 'GAME_OVER', winner: 'sentinel-one' },
    { phase: 'GAME_OVER', winner: 'sentinel-two' },
  ]
  const test = authenticatedDependencies()
  const response = await invokeProbe(
    undefined,
    request('Bearer accepted-token'),
    {
      ...test.dependencies,
      replay: (...args: unknown[]) => {
        calls.push(args)
        return sentinels[calls.length - 1]
      },
    },
  )

  assertEquals(response.status, 200)
  const payload = await response.json()
  assertEquals(payload.fixtures, {
    maximumLifecycle: sentinels[0],
    maximumTurn: sentinels[1],
    verifiedDuel: EXPECTED_PROBE_RESPONSE.fixtures.verifiedDuel,
  })
  assertEquals(calls.length, 2)
  if (calls[0]?.[0] !== VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle.config) {
    throw new Error('maximumLifecycle must use the exact reviewed config reference')
  }
  if (calls[0]?.[1] !== VERIFIED_REPLAY_PROBE_FIXTURES.maximumLifecycle.transcript) {
    throw new Error('maximumLifecycle must use the exact reviewed transcript reference')
  }
  if (calls[1]?.[0] !== VERIFIED_REPLAY_PROBE_FIXTURES.maximumTurn.config) {
    throw new Error('maximumTurn must use the exact reviewed config reference')
  }
  if (calls[1]?.[1] !== VERIFIED_REPLAY_PROBE_FIXTURES.maximumTurn.transcript) {
    throw new Error('maximumTurn must use the exact reviewed transcript reference')
  }
})

Deno.test('verified replay probe performs no domain storage operation and exposes no account data', async () => {
  const test = authenticatedDependencies()
  const response = await invokeProbe(
    undefined,
    request('Bearer accepted-token'),
    test.dependencies,
  )

  assertEquals(response.status, 200)
  const payload = await response.json()
  assertEquals(test.storageCalls(), { tableCalls: 0, rpcCalls: 0 })
  for (const forbidden of [
    'account-user-id',
    'accepted-token',
    'userId',
    'durationMs',
    'totalXp',
    'rank',
    'reward',
    'entitlement',
  ]) {
    assertEquals(JSON.stringify(payload).includes(forbidden), false)
  }
})

Deno.test('verified replay probe maps replay failures to one credential-free response and bounded log', async () => {
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const test = authenticatedDependencies()
  const response = await invokeProbe(
    undefined,
    request('Bearer accepted-token'),
    {
      ...test.dependencies,
      replay: () => {
        throw new Error('raw replay failure accepted-token account-user-id')
      },
      logger: (message, context) => logs.push({ message, context }),
    },
  )

  assertEquals(response.status, 500)
  assertEquals(await response.json(), { error: 'probe_unavailable' })
  assertEquals(logs, [{
    message: 'verified_replay_probe: replay failed',
    context: { stage: 'replay', code: 'unexpected' },
  }])
  assertEquals(JSON.stringify(logs).includes('accepted-token'), false)
  assertEquals(JSON.stringify(logs).includes('account-user-id'), false)
  assertEquals(JSON.stringify(logs).includes('raw replay failure'), false)
})

Deno.test('verified replay probe logs only the safe VerifiedReplayError code', async () => {
  const logs: Array<{ message: string; context: Record<string, unknown> }> = []
  const test = authenticatedDependencies()
  const response = await invokeProbe(
    undefined,
    request('Bearer accepted-token'),
    {
      ...test.dependencies,
      replay: () => {
        throw new VerifiedReplayError('tick_limit')
      },
      logger: (message, context) => logs.push({ message, context }),
    },
  )

  assertEquals(response.status, 500)
  assertEquals(await response.json(), { error: 'probe_unavailable' })
  assertEquals(logs, [{
    message: 'verified_replay_probe: replay failed',
    context: { stage: 'replay', code: 'tick_limit' },
  }])
})
