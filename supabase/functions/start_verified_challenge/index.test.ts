import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleStartVerifiedChallenge } from './index.ts'
import { VERIFIED_CHALLENGE_CQ1 } from '../../../shared/src/net/verifiedChallenge.ts'

const accountId = '11111111-1111-4111-8111-111111111111'
const descriptor = { ...VERIFIED_CHALLENGE_CQ1, accountId, sessionId: '22222222-2222-4222-8222-222222222222',
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' }
const body = { trialId: 'crosswind-qualification', supportedDescriptorVersions: [1] }
const request = new Request('https://example.test')

Deno.test('challenge start derives account and returns the exact authoritative descriptor and resume state', async () => {
  for (const resumed of [false, true]) {
    const calls: unknown[] = []
    const response = await handleStartVerifiedChallenge(body, request, accountId, { start: (args) => {
      calls.push(args); return Promise.resolve({ data: { ok: true, descriptor, resumed }, error: null })
    } })
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { responseVersion: 1, descriptor, resumed })
    assertEquals(calls, [{ p_account_id: accountId, p_trial_id: 'crosswind-qualification', p_supported_descriptor_versions: [1] }])
  }
})
Deno.test('challenge start refuses forged requests before RPC and malformed/foreign backend results', async () => {
  let calls = 0
  const start = () => { calls++; return Promise.resolve({ data: null, error: null }) }
  for (const invalid of [undefined, {}, { ...body, seed: 42 }, { ...body, accountId }, { ...body, supportedDescriptorVersions: [2] }]) {
    assertEquals((await handleStartVerifiedChallenge(invalid, request, accountId, { start })).status, 400)
  }
  assertEquals(calls, 0)
  for (const data of [null, { ok: true, descriptor }, { ok: true, descriptor, resumed: false, token: 'private' },
    { ok: true, descriptor: { ...descriptor, accountId: descriptor.sessionId }, resumed: false },
    { ok: true, descriptor: { ...descriptor, seed: 17 }, resumed: false }]) {
    const response = await handleStartVerifiedChallenge(body, request, accountId, { start: () => Promise.resolve({ data, error: null }) })
    assertEquals(response.status, 503)
    assertEquals(await response.json(), { responseVersion: 1, error: 'verification_unavailable' })
  }
})
Deno.test('challenge start maps only allowlisted control errors and sanitizes infrastructure failures', async () => {
  for (const [error, status] of [['challenge_starts_disabled', 503], ['active_challenge_incompatible', 409], ['private database text', 503]] as const) {
    const response = await handleStartVerifiedChallenge(body, request, accountId, { start: () => Promise.resolve({ data: { ok: false, error }, error: null }) })
    assertEquals(response.status, status)
    assertEquals(JSON.stringify(await response.json()).includes('private'), false)
  }
  const response = await handleStartVerifiedChallenge(body, request, accountId, { start: () => { throw new Error('private') } })
  assertEquals(await response.json(), { responseVersion: 1, error: 'verification_unavailable' })
})

Deno.test('challenge start refuses missing retained capability before allocating a session', async () => {
  let called = 0
  const response = await handleStartVerifiedChallenge(body, request, accountId, {
    artifact: () => { throw new Error('missing artifact') },
    start: () => { called++; return Promise.resolve({ data: { ok: true, descriptor, resumed: false }, error: null }) },
  })
  assertEquals(response.status, 503)
  assertEquals(called, 0)
})
