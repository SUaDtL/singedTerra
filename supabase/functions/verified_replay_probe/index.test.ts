import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import * as probeModule from './index.ts'
import type { VerifiedReplayProbeDependencies } from './index.ts'
import { VERIFIED_REPLAY_PROBE_FIXTURES } from '../_shared/verifiedReplayProbeFixture.ts'
import { VerifiedReplayError } from '../_shared/verifiedMatchReplay.ts'
import { withCors } from '../_shared/mod.ts'
import challengeCorpus from '../../../scripts/checks/fixtures/verified_challenge_workload.json' with { type: 'json' }
import { CQ1_ARTIFACT_SHA256, CQ1_MANIFEST_INTEGRITY } from '../../../shared/src/verified/challengeArtifacts.ts'

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
    challengeReplay?: (...args: unknown[]) => unknown
    rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
    wallNow?: () => number
    nativeNow?: () => number
    logger?: (message: string, context: Record<string, unknown>) => void
  },
) => Response | Promise<Response>

const invokeProbe = handleVerifiedReplayProbe as unknown as ProbeHandler

function challengeRequest(query = 'mode=cq1&fixture=first-clear', authorization = 'Bearer accepted-token'): Request {
  return new Request('https://example.test/verified_replay_probe?' + query, {
    method: 'POST', headers: { authorization },
  })
}

Deno.test('cq1 production wrapper keeps no-body admission and exposes the bounded busy cooldown', async () => {
  const test = authenticatedDependencies()
  let ipChecks = 0
  const wrapped = probeModule.createVerifiedReplayProbeHandler((_handler, options) => withCors(
    (body, req) => Promise.resolve(invokeProbe(body, req, { ...test.dependencies,
      rpc: async (name, args) => name === 'acquire_verification_compute_lease'
        ? { data: { ok: false, error: 'verification_busy', retryAfter: 410 }, error: null }
        : test.dependencies.rpc(name, args),
    })), options, { rateLimit: { bumpRateLimit: async () => { ipChecks++; return { data: 1, error: null } } } },
  ))
  const bodyRequest = new Request(challengeRequest(), { headers: { authorization: 'Bearer accepted-token', 'content-type': 'application/json' },
    body: JSON.stringify({ transcript: [{ angle: 32, power: 100 }] }) })
  const rejected = await wrapped(bodyRequest)
  assertEquals(rejected.status, 400)
  assertEquals(await rejected.json(), { error: 'Request body not allowed' })
  assertEquals(test.calls, [])
  const busy = await wrapped(challengeRequest())
  assertEquals(busy.status, 503)
  assertEquals(await busy.json(), { error: 'probe_unavailable' })
  assertEquals(busy.headers.get('Retry-After'), '410')
  assertEquals(busy.headers.get('Access-Control-Expose-Headers'), 'Retry-After')
  assertEquals(ipChecks, 2)
})

Deno.test('cq1 probe rejects unknown, duplicate, oversized, or extensible selectors before authentication', async () => {
  for (const query of ['mode=cq2&fixture=first-clear', 'mode=cq1', 'fixture=first-clear', 'mode=cq1&fixture=unknown',
    'mode=cq1&fixture=first-clear&mode=cq1', 'mode=cq1&fixture=first-clear&fixture=third-clear',
    'mode=cq1&fixture=first-clear&transcript=[]', 'mode=cq1&fixture=first-clear&seed=42',
    'mode=cq1&fixture=' + 'a'.repeat(129)]) {
    const test = authenticatedDependencies()
    let authCalls = 0
    test.dependencies.supabase.auth.getUser = async () => { authCalls++; throw Error('must not authenticate') }
    const response = await invokeProbe({}, challengeRequest(query), test.dependencies)
    assertEquals(response.status, 400)
    assertEquals(await response.json(), { error: 'invalid_probe_request' })
    assertEquals(authCalls, 0)
    assertEquals(test.calls, [])
  }
})

Deno.test('cq1 probe publishes each of the 21 exact retained samples with bounded timing and honest identity metadata', async () => {
  assertEquals(challengeCorpus.scenarios.length, 21)
  for (const fixture of challengeCorpus.scenarios) {
    const test = authenticatedDependencies()
    let clockCalls = 0
    const response = await invokeProbe({}, challengeRequest('mode=cq1&fixture=' + fixture.id), {
      ...test.dependencies, nativeNow: () => clockCalls++ === 0 ? 10 : 52.5,
      replay: () => { throw Error('legacy fixtures must not execute') },
    })
    assertEquals(response.status, 200)
    const text = await response.text()
    assertEquals(text.length < 5000, true)
    const body = JSON.parse(text)
    assertEquals(body, { ok: true, probeVersion: 1, mode: 'cq1', fixtureVersion: 1, fixtureId: fixture.id,
      artifactSha256: CQ1_ARTIFACT_SHA256, artifactIdentity: 'static-registry', manifestIntegrity: CQ1_MANIFEST_INTEGRITY,
      acceptanceLimitMs: 1000, executionModel: 'synchronous-acceptance-gate',
      sample: { result: fixture.result, work: fixture.work }, nativeElapsedMs: 42.5, cleanup: 'released' })
    assertEquals(clockCalls, 2)
    for (const secret of [accountId, workerId, 'accepted-token', 'totalXp', 'reward', 'entitlement']) assertEquals(text.includes(secret), false)
    assertEquals(test.storageCalls(), { tableCalls: 0, rpcCalls: 0 })
  }
})

Deno.test('cq1 probe shares authentication, account rate, busy cooldown and pre-execution fence refusals', async () => {
  for (const mode of ['unauthorized', 'limited', 'rate_error', 'busy', 'malformed_lease', 'lost'] as const) {
    const test = authenticatedDependencies()
    let replays = 0
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (name === 'bump_rate_limit' && mode === 'limited') return { data: 11, error: null }
      if (name === 'bump_rate_limit' && mode === 'rate_error') return { data: null, error: { message: 'private' } }
      if (name === 'acquire_verification_compute_lease' && mode === 'busy') return { data: { ok: false, error: 'verification_busy', retryAfter: 410 }, error: null }
      if (name === 'acquire_verification_compute_lease' && mode === 'malformed_lease') return { data: {}, error: null }
      if (name === 'verification_compute_lease_is_current' && mode === 'lost') return { data: false, error: null }
      return test.dependencies.rpc(name, args)
    }
    const response = await invokeProbe({}, challengeRequest(undefined, mode === 'unauthorized' ? '' : 'Bearer accepted-token'), {
      ...test.dependencies, rpc, challengeReplay: () => { replays++; return {} },
    })
    assertEquals(response.status, mode === 'unauthorized' ? 401 : mode === 'limited' ? 429 : 503)
    assertEquals(replays, 0)
    const text = await response.text()
    assertEquals(text.includes('private'), false)
    assertEquals(text.includes('sample'), false)
    if (mode === 'busy') {
      assertEquals(response.headers.get('Retry-After'), '410')
      assertEquals(response.headers.get('Access-Control-Expose-Headers'), 'Retry-After')
      assertEquals(JSON.parse(text), { error: 'probe_unavailable' })
    }
    if (mode === 'unauthorized') assertEquals(test.calls, [])
  }
})

Deno.test('cq1 probe rejects late or malformed evidence before final dispatch and retains uncertain execution cooldown', async () => {
  for (const mode of ['late', 'late_serialization', 'on_time', 'final_lost', 'cleanup', 'thenable', 'then_getter', 'throw', 'extra', 'missing', 'counter'] as const) {
    const test = authenticatedDependencies()
    let clock = 0
    let checks = 0
    let releases = 0
    const fixture = challengeCorpus.scenarios[0]
    const expected = { result: fixture.result, work: fixture.work }
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (name === 'verification_compute_lease_is_current' && ++checks === 2 && mode === 'final_lost') return { data: false, error: null }
      if (name === 'release_verification_compute_lease') { releases++; if (mode === 'cleanup') throw Error('private') }
      return test.dependencies.rpc(name, args)
    }
    const response = await invokeProbe({}, challengeRequest(), { ...test.dependencies, rpc, nativeNow: () => clock,
      challengeReplay: () => {
        if (mode === 'late') clock = 1000
        if (mode === 'on_time') clock = 999
        if (mode === 'thenable') return { then() {} }
        if (mode === 'then_getter') return { get then() { throw Error('uncertain private') } }
        if (mode === 'throw') throw Error('private accepted-token')
        if (mode === 'late_serialization') return { toJSON() { clock = 1000; return expected } }
        if (mode === 'extra') return { ...expected, private: 'accepted-token' }
        if (mode === 'missing') return { result: fixture.result }
        if (mode === 'counter') return { ...expected, work: { ...fixture.work, totalUnits: 0 } }
        return expected
      } })
    const accepted = mode === 'on_time' || mode === 'cleanup'
    assertEquals(response.status, accepted ? 200 : 503)
    const body = await response.json()
    if (!accepted) {
      assertEquals(Object.keys(body).sort(), ['cleanup', 'error', 'failure', 'fixtureId', 'mode', 'nativeElapsedMs'])
      assertEquals(body.error, 'probe_unavailable')
      assertEquals(JSON.stringify(body).includes('private'), false)
      assertEquals(body.sample, undefined)
    }
    if (mode === 'late' || mode === 'late_serialization') {
      assertEquals(body.failure, 'acceptance_deadline')
      assertEquals(body.nativeElapsedMs, 1000)
    }
    if (['extra', 'missing', 'counter'].includes(mode)) assertEquals(body.failure, 'fixture_mismatch')
    assertEquals(releases, mode === 'thenable' || mode === 'then_getter' ? 0 : 1)
    assertEquals(checks, ['on_time', 'final_lost', 'cleanup'].includes(mode) ? 2 : 1)
    assertEquals(body.cleanup, mode === 'thenable' || mode === 'then_getter' ? 'retained' : mode === 'cleanup' ? 'unavailable' : 'released')
  }
})

Deno.test('cq1 probe selects a fixed retained fixture without changing the default probe contract', async () => {
  const { dependencies, calls, storageCalls } = authenticatedDependencies()
  const response = await invokeProbe({}, new Request('https://example.test/verified_replay_probe?mode=cq1&fixture=first-clear', {
    method: 'POST', headers: { authorization: 'Bearer accepted-token' },
  }), { ...dependencies, nativeNow: () => 0, replay: () => { throw Error('legacy replay must not run') } })
  assertEquals(response.status, 200)
  const body = await response.json()
  assertEquals(body.mode, 'cq1')
  assertEquals(body.fixtureId, 'first-clear')
  assertEquals(body.sample.result.terminal, 'objective_cleared')
  assertEquals(storageCalls(), { tableCalls: 0, rpcCalls: 0 })
  assertEquals(calls.map(({ name }) => name), ['bump_rate_limit', 'acquire_verification_compute_lease',
    'verification_compute_lease_is_current', 'verification_compute_lease_is_current', 'release_verification_compute_lease'])
  assertEquals(calls[1].args.p_endpoint, 'verified_replay_probe')
  assertEquals(calls[1].args.p_descriptor_binding, 'probe-v1')
  assertEquals(calls[1].args.p_session_id, null)
})
const accountId = '11111111-1111-4111-8111-111111111111'
const workerId = '44444444-4444-4444-8444-444444444444'
const wallNow = () => Date.parse('2026-08-11T12:00:00.000Z')

function request(authorization = ''): Request {
  return new Request('https://example.test/verified_replay_probe', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

const EXPECTED_PROBE_RESPONSE = {
  ok: true,
  probeVersion: 1,
  engineVersion: 2,
  rulesetVersion: 4,
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
      tickCount: 266,
      maxTurnTickCount: 171,
    },
    verifiedDuel: {
      seed: 17,
      outcome: 'human_win',
      winnerId: 'p1',
      reason: 'health',
      humanSalvos: 6,
      cpuSalvos: 6,
      liveTicks: 632,
      cpuSimulationTicks: 24155,
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
        data: { user: token === 'accepted-token' ? { id: accountId } : null },
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
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const rpc = async (name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> => {
    calls.push({ name, args })
    if (name === 'bump_rate_limit') return { data: 1, error: null }
    if (name === 'acquire_verification_compute_lease') return { data: { ok: true, workerId, fence: 9,
      endpoint: 'verified_replay_probe', sessionId: null, descriptorBinding: 'probe-v1',
      expiresAt: '2026-08-11T12:00:10.000Z', uncertainUntil: '2026-08-11T12:06:50.000Z' }, error: null }
    if (name === 'verification_compute_lease_is_current' || name === 'release_verification_compute_lease') return { data: true, error: null }
    throw Error('unexpected control RPC')
  }
  return {
    dependencies: { supabase, rpc, wallNow },
    calls,
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
  let rpcCalls = 0
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
    rpc: async () => { rpcCalls++; throw Error('must not admit before authentication') },
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
  assertEquals(rpcCalls, 0)
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
    accountId,
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

Deno.test('probe uses one account-scoped admission and exact current fence around all three fixtures', async () => {
  const test = authenticatedDependencies()
  const response = await invokeProbe(undefined, request('Bearer accepted-token'), test.dependencies)
  assertEquals(response.status, 200)
  const fence = { p_account_id: accountId, p_endpoint: 'verified_replay_probe', p_session_id: null,
    p_descriptor_binding: 'probe-v1', p_worker_id: workerId, p_fence: 9 }
  assertEquals(test.calls, [
    { name: 'bump_rate_limit', args: { p_bucket: 'verified_account:verified_replay_probe:' + accountId, p_window: Math.floor(wallNow() / 60000) } },
    { name: 'acquire_verification_compute_lease', args: { p_account_id: accountId, p_endpoint: 'verified_replay_probe',
      p_session_id: null, p_descriptor_binding: 'probe-v1', p_transcript: null } },
    { name: 'verification_compute_lease_is_current', args: fence },
    { name: 'verification_compute_lease_is_current', args: fence },
    { name: 'release_verification_compute_lease', args: { p_account_id: accountId, p_worker_id: workerId, p_fence: 9 } },
  ])
})

Deno.test('probe fails closed on account rate storage and cooldown before executing a fixture', async () => {
  for (const mode of ['limited', 'rate_error', 'rate_throw', 'busy', 'malformed_lease', 'lost'] as const) {
    const test = authenticatedDependencies()
    let replays = 0
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (name === 'bump_rate_limit' && mode === 'limited') return { data: 11, error: null }
      if (name === 'bump_rate_limit' && mode === 'rate_error') return { data: null, error: { message: 'private' } }
      if (name === 'bump_rate_limit' && mode === 'rate_throw') throw Error('private')
      if (name === 'acquire_verification_compute_lease' && mode === 'busy') return { data: { ok: false, error: 'verification_busy', retryAfter: 410 }, error: null }
      if (name === 'acquire_verification_compute_lease' && mode === 'malformed_lease') return { data: {}, error: null }
      if (name === 'verification_compute_lease_is_current' && mode === 'lost') return { data: false, error: null }
      return test.dependencies.rpc(name, args)
    }
    const response = await invokeProbe(undefined, request('Bearer accepted-token'), { ...test.dependencies, rpc,
      replay: () => { replays++; return {} } })
    assertEquals(response.status, mode === 'limited' ? 429 : 503)
    assertEquals(replays, 0)
    assertEquals(await response.json(), { error: mode === 'limited' ? 'rate_limited' : 'probe_unavailable' })
    if (mode === 'busy') assertEquals(response.headers.get('Retry-After'), '410')
  }
})

Deno.test('probe rejects elapsed1000ms and final fence loss, retains uncertain execution, and tolerates ended-call cleanup failure', async () => {
  for (const mode of ['late', 'late_serialization', 'on_time', 'final_lost', 'final_error', 'cleanup', 'thenable', 'then_getter'] as const) {
    const test = authenticatedDependencies()
    let checks = 0
    let clock = 0
    let releases = 0
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (name === 'verification_compute_lease_is_current' && ++checks === 2) {
        if (mode === 'final_lost') return { data: false, error: null }
        if (mode === 'final_error') return { data: null, error: { message: 'private' } }
      }
      if (name === 'release_verification_compute_lease') { releases++; if (mode === 'cleanup') throw Error('private') }
      return test.dependencies.rpc(name, args)
    }
    const response = await invokeProbe(undefined, request('Bearer accepted-token'), { ...test.dependencies, rpc, nativeNow: () => clock,
      replay: () => {
        if (mode === 'late') clock = 1000
        if (mode === 'on_time') clock = 999
        if (mode === 'thenable') return Promise.resolve({})
        if (mode === 'then_getter') return { get then() { throw Error('uncertain getter') } }
        if (mode === 'late_serialization') return { toJSON() { clock = 1000; return {} } }
        return {}
      } })
    assertEquals(response.status, mode === 'cleanup' || mode === 'on_time' ? 200 : 503)
    assertEquals(releases, mode === 'thenable' || mode === 'then_getter' ? 0 : 1)
    assertEquals(checks, ['late', 'late_serialization', 'thenable', 'then_getter'].includes(mode) ? 1 : 2)
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
