import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleGetVerifiedChallenge } from './index.ts'
import { VERIFIED_CHALLENGE_CQ1 } from '../../../shared/src/net/verifiedChallenge.ts'
import { projectChallengeStatus } from '../_shared/verifiedChallengeStatus.ts'
import { createChallengeRequestHandler } from '../_shared/verifiedChallenge.ts'

const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const descriptor = { ...VERIFIED_CHALLENGE_CQ1, accountId, sessionId,
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' }
const fresh = { ok: true, descriptor, status: 'active', computeAttempts: 0, boundTranscript: null, receipt: null }
const request = new Request('https://example.test')
const transcript = [{ angle: 32, power: 100 }]
const ledger = { verifiedMatches: 3, verifiedWins: 1, replayXp: 400, challengeXp: 0, totalXp: 400, medals: [] }
const receipt = { sessionId, accountId, editionId: 'cq1', transcript, outcome: 'work_limit',
  disposition: 'not_awarded', xpGranted: 0, completedAt: '2026-09-13T12:01:00.000000Z',
  careerBeforeLedger: ledger, careerAfterLedger: ledger }

Deno.test('get returns owner-scoped resumable and historical completed evidence without compute admission', async () => {
  for (const data of [fresh, { ...fresh, computeAttempts: 1, boundTranscript: transcript },
    { ...fresh, status: 'completed', computeAttempts: 1, boundTranscript: transcript, receipt },
    { ...fresh, status: 'verification_unavailable', computeAttempts: 3, boundTranscript: transcript }]) {
    const calls: unknown[] = []
    const response = await handleGetVerifiedChallenge({ sessionId }, request, accountId, { get: (args) => {
      calls.push(args); return Promise.resolve({ data, error: null })
    } })
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { responseVersion: 1, ...projectChallengeStatus(data, accountId, sessionId) })
    assertEquals(calls, [{ p_account_id: accountId, p_session_id: sessionId }])
  }
})
Deno.test('get refuses extra request fields and malformed or foreign stored evidence', async () => {
  let calls = 0
  for (const body of [null, [], {}, { sessionId: 'bad' }, { sessionId, accountId }, { sessionId, transcript }]) {
    assertEquals((await handleGetVerifiedChallenge(body, request, accountId, { get: () => {
      calls++; return Promise.resolve({ data: fresh, error: null })
    } })).status, 400)
  }
  assertEquals(calls, 0)
  for (const data of [null, { ...fresh, token: 'private' }, { ...fresh, descriptor: { ...descriptor, accountId: sessionId } },
    { ...fresh, descriptor: { ...descriptor, sessionId: accountId } },
    { ...fresh, status: 'completed', computeAttempts: 1, boundTranscript: transcript, receipt: { ...receipt, xpGranted: 200 } },
    { ...fresh, status: 'completed', computeAttempts: 1, boundTranscript: [{ angle: 0, power: 0 }], receipt }]) {
    const response = await handleGetVerifiedChallenge({ sessionId }, request, accountId, { get: () => Promise.resolve({ data, error: null }) })
    assertEquals(response.status, 503)
    assertEquals(await response.json(), { responseVersion: 1, error: 'verification_unavailable' })
  }
})
Deno.test('get hides storage errors and uniformly maps absent or foreign sessions to not found', async () => {
  for (const [data, error, status, expected] of [
    [{ ok: false, error: 'challenge_not_found' }, null, 404, 'challenge_not_found'],
    [{ ok: false, error: 'private' }, null, 503, 'verification_unavailable'],
    [fresh, { message: 'private' }, 503, 'verification_unavailable'],
  ] as const) {
    const response = await handleGetVerifiedChallenge({ sessionId }, request, accountId, { get: () => Promise.resolve({ data, error }) })
    assertEquals(response.status, status)
    assertEquals(await response.json(), { responseVersion: 1, error: expected })
  }
  assertEquals((await handleGetVerifiedChallenge({ sessionId }, request, accountId, { get: () => { throw Error('private') } })).status, 503)
})
Deno.test('get transport requires auth and enforces the 128-byte JSON limit before storage', async () => {
  const calls: unknown[] = []
  const serve = createChallengeRequestHandler((body, req, owner) => handleGetVerifiedChallenge(body, req, owner, {
    get: (args) => { calls.push(args); return Promise.resolve({ data: fresh, error: null }) },
  }), 'get_verified_challenge', 128, { authenticate: async () => accountId, bumpRateLimit: () => Promise.resolve({ data: 1, error: null }) })
  const make = (body: string, auth = true) => new Request('https://example.test', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer test' } : {}) }, body })
  assertEquals((await serve(make(JSON.stringify({ sessionId }), false))).status, 401)
  assertEquals((await serve(make(' '.repeat(129)))).status, 400)
  assertEquals(calls.length, 0)
  assertEquals((await serve(make(JSON.stringify({ sessionId })))).status, 200)
  assertEquals(calls, [{ p_account_id: accountId, p_session_id: sessionId }])
})
