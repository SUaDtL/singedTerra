import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { runNativeVerification } from './verificationWorker.ts'
import type { VerificationLeaseRequest } from './verificationComputeLease.ts'

const request: VerificationLeaseRequest = { accountId: '12345678-1234-4234-8234-123456789abc', endpoint: 'complete_verified_challenge',
  sessionId: '87654321-1234-4234-8234-123456789abc', descriptorBinding: 'cq1', transcript: [{ angle: 45, power: 70 }] }
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = []; let time = 10
  const dependencies = {
    wallNow: () => Date.parse('2026-09-13T12:00:00Z'), now: () => time,
    rpc: async (name: string): Promise<{ error: unknown; data: unknown }> => {
      calls.push(name)
      return { error: null, data: name === 'acquire_verification_compute_lease' ? {
        ok: true, workerId: '11111111-1111-4111-8111-111111111111', fence: 7,
        endpoint: request.endpoint, sessionId: request.sessionId, descriptorBinding: 'cq1',
        expiresAt: '2026-09-13T12:00:10Z', uncertainUntil: '2026-09-13T12:06:50Z',
      } : true }
    },
    setup: (): unknown => { calls.push('setup'); time += 100; return { seed: 42 } },
    replay: (_setup: unknown): unknown => { calls.push('replay'); time += 700; return { terminal: 'objective_cleared' } },
    validate: (raw: unknown) => { calls.push('validate'); time += 100; return raw },
    finalize: async (_evidence: unknown, lease: { fence: number }) => {
      calls.push('finalize'); assertEquals(lease.fence, 7); time += 5000
      return { ok: true, value: { receipt: 'committed' } }
    },
    ...overrides,
  }
  return { calls, dependencies, setTime(value: number) { time = value } }
}

Deno.test('native execution measures setup/replay/validation and dispatches accepted fenced finalize before ended release', async () => {
  const f = fixture()
  assertEquals<unknown>(await runNativeVerification(request, f.dependencies), { kind: 'completed', value: { receipt: 'committed' }, elapsedMs: 900, cleanup: 'released' })
  assertEquals(f.calls, ['acquire_verification_compute_lease', 'verification_compute_lease_is_current', 'setup', 'replay', 'validate', 'finalize', 'release_verification_compute_lease'])
})

Deno.test('native acceptance check dispatches finalization in the same synchronous turn', async () => {
  let microtaskRan = false
  const f = fixture({ validate: (raw: unknown) => { queueMicrotask(() => { microtaskRan = true }); return raw },
    finalize: async () => { assertEquals(microtaskRan, false); return { ok: true, value: 'committed' } } })
  assertEquals((await runNativeVerification(request, f.dependencies) as { kind: string }).kind, 'completed')
  assertEquals(microtaskRan, true)
})

Deno.test('native acceptance is strict below1000 including setup and validation; late success never finalizes', async () => {
  for (const elapsed of [999.999, 1000, 1000.001, 1200]) {
    const f = fixture()
    f.dependencies.validate = (raw) => { f.calls.push('validate'); f.setTime(10 + elapsed); return raw }
    const result = await runNativeVerification(request, f.dependencies) as { kind: string; elapsedMs: number }
    assertEquals(result.kind, elapsed < 1000 ? 'completed' : 'unavailable')
    assertEquals(result.elapsedMs, elapsed)
    assertEquals(f.calls.includes('finalize'), elapsed < 1000)
    assertEquals(f.calls.at(-1), 'release_verification_compute_lease')
  }
  for (const phase of ['setup', 'replay', 'validate'] as const) {
    const f = fixture()
    f.dependencies[phase] = () => { f.setTime(1500); return { late: true } }
    assertEquals((await runNativeVerification(request, f.dependencies) as { kind: string }).kind, 'unavailable')
    assert(!f.calls.includes('finalize'))
  }
})

Deno.test('native errors refuse success; an exact returned invalid result can reject under the same deadline', async () => {
  for (const phase of ['setup', 'replay', 'validate']) {
    const f = fixture({ [phase]: () => { throw new Error('sensitive error') } })
    const result = await runNativeVerification(request, f.dependencies)
    assert(!JSON.stringify(result).includes('sensitive'))
    assertEquals((result as { kind: string }).kind, 'unavailable')
    assert(!f.calls.includes('finalize'))
    assertEquals(f.calls.at(-1), 'release_verification_compute_lease')
  }
  const invalid = fixture({ validate: () => null, onInvalid: async () => true })
  assertEquals((await runNativeVerification(request, invalid.dependencies) as { kind: string }).kind, 'replay_invalid')
  const lateInvalid = fixture({ onInvalid: async () => { throw new Error('must not dispatch') } })
  lateInvalid.dependencies.validate = () => { lateInvalid.setTime(1010); return null }
  assertEquals((await runNativeVerification(request, lateInvalid.dependencies) as { kind: string }).kind, 'unavailable')
  const known = fixture({ replay: () => { throw new Error('known_invalid') }, isInvalidReplayError: () => true, onInvalid: async () => true })
  assertEquals((await runNativeVerification(request, known.dependencies) as { kind: string }).kind, 'replay_invalid')
  assert(!known.calls.includes('finalize'))
})

Deno.test('native unknown asynchronous execution retains cooldown and never claims termination', async () => {
  for (const phase of ['setup', 'replay', 'validate']) {
    const f = fixture({ [phase]: () => Promise.resolve({ result: 'unsupported' }) })
    const result = await runNativeVerification(request, f.dependencies) as { kind: string; cleanup: string }
    assertEquals(result.kind, 'unavailable'); assertEquals(result.cleanup, 'retained')
    assert(!f.calls.includes('finalize')); assert(!f.calls.includes('release_verification_compute_lease'))
  }
  const opaque = fixture({ replay: () => Object.defineProperty({}, 'then', { get() { throw new Error('unknown execution') } }) })
  assertEquals((await runNativeVerification(request, opaque.dependencies) as { cleanup: string }).cleanup, 'retained')
  assert(!opaque.calls.includes('release_verification_compute_lease'))
})

Deno.test('native busy/current-check/clock uncertainty prevent replay and cannot become success', async () => {
  const busy = fixture({ rpc: async () => ({ data: { ok: false, error: 'verification_busy', retryAfter: 410 }, error: null }) })
  assertEquals<unknown>(await runNativeVerification(request, busy.dependencies), { kind: 'busy', retryAfter: 410, cleanup: 'not_needed' })
  assertEquals(busy.calls, [])
  for (const time of [NaN, Infinity]) {
    const f = fixture({ now: () => time })
    assertEquals((await runNativeVerification(request, f.dependencies) as { kind: string }).kind, 'unavailable')
    assert(!f.calls.includes('replay'))
  }
  const backwards = fixture(); backwards.dependencies.validate = (raw) => { backwards.setTime(9); return raw }
  assertEquals((await runNativeVerification(request, backwards.dependencies) as { kind: string }).kind, 'unavailable')
  for (const confirmation of [{ data: false, error: null }, { data: true, error: 'database failure' }]) {
    const f = fixture(); const rpc = f.dependencies.rpc
    f.dependencies.rpc = async (name) => name === 'verification_compute_lease_is_current' ? confirmation : rpc(name)
    assertEquals((await runNativeVerification(request, f.dependencies) as { kind: string }).kind, 'unavailable')
    assert(!f.calls.includes('setup')); assert(!f.calls.includes('replay')); assert(!f.calls.includes('finalize'))
    assertEquals(f.calls.at(-1), 'release_verification_compute_lease')
  }
})

Deno.test('native committed receipt survives later cleanup failure; failed finalization never claims completion', async () => {
  const f = fixture(); const rpc = f.dependencies.rpc
  f.dependencies.rpc = async (name) => name === 'release_verification_compute_lease' ? { data: false, error: 'storage unavailable' } : rpc(name)
  assertEquals<unknown>(await runNativeVerification(request, f.dependencies), { kind: 'completed', value: { receipt: 'committed' }, elapsedMs: 900, cleanup: 'unavailable' })
  for (const finalize of [async () => ({ ok: false, reason: 'fence_lost' }), async () => { throw new Error('storage') },
    async () => ({ ok: true }), async () => ({ ok: true, value: null }), async () => ({ ok: true, value: undefined })]) {
    const failed = fixture({ finalize })
    assertEquals((await runNativeVerification(request, failed.dependencies) as { kind: string }).kind, 'unavailable')
    assertEquals(failed.calls.at(-1), 'release_verification_compute_lease')
  }
})
