import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleAbandonVerifiedChallenge } from './index.ts'
import { VERIFIED_CHALLENGE_CQ1 } from '../../../shared/src/net/verifiedChallenge.ts'
import { projectChallengeStatus } from '../_shared/verifiedChallengeStatus.ts'
const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const descriptor = { ...VERIFIED_CHALLENGE_CQ1, accountId, sessionId,
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' }
const abandoned = { ok: true, descriptor, status: 'abandoned', computeAttempts: 0, boundTranscript: null, receipt: null }
const request = new Request('https://example.test')
const transcript = [{ angle: 32, power: 100 }]
const completedAt = '2026-09-13T12:01:00.000000Z'
const ledger = { verifiedMatches: 0, verifiedWins: 0, replayXp: 0, challengeXp: 0, totalXp: 0, medals: [] }
const receipt = { sessionId, accountId, editionId: 'cq1', transcript, outcome: 'objective_cleared',
  disposition: 'awarded', xpGranted: 200, completedAt, careerBeforeLedger: ledger,
  careerAfterLedger: { ...ledger, challengeXp: 200, totalXp: 200, medals: [{
    entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification', rewardVersion: 1, xp: 200, sessionId, awardedAt: completedAt,
  }] } }
Deno.test('abandon is owner scoped and preserves repeated terminal states and original completed award evidence', async () => {
  for (const data of [abandoned, abandoned, { ...abandoned, status: 'expired' },
    { ...abandoned, status: 'invalid', computeAttempts: 1, boundTranscript: transcript },
    { ...abandoned, status: 'verification_unavailable', computeAttempts: 3, boundTranscript: transcript },
    { ...abandoned, status: 'completed', computeAttempts: 1, boundTranscript: transcript, receipt }]) {
    const calls: unknown[] = []
    const response = await handleAbandonVerifiedChallenge({ sessionId }, request, accountId, { abandon: (args) => {
      calls.push(args); return Promise.resolve({ data, error: null })
    } })
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { responseVersion: 1, ...projectChallengeStatus(data, accountId, sessionId) })
    assertEquals(calls, [{ p_account_id: accountId, p_session_id: sessionId }])
  }
})
Deno.test('abandon validates exact request and rejects impossible active success or foreign evidence', async () => {
  let calls = 0
  for (const body of [null, {}, { sessionId: 'bad' }, { sessionId, accountId }, { sessionId, force: true }]) {
    assertEquals((await handleAbandonVerifiedChallenge(body, request, accountId, { abandon: () => {
      calls++; return Promise.resolve({ data: abandoned, error: null })
    } })).status, 400)
  }
  assertEquals(calls, 0)
  for (const data of [null, { ...abandoned, status: 'active' }, { ...abandoned, extra: 'private' },
    { ...abandoned, descriptor: { ...descriptor, accountId: sessionId } },
    { ...abandoned, status: 'completed', computeAttempts: 1, boundTranscript: transcript, receipt: { ...receipt, sessionId: accountId } }]) {
    const response = await handleAbandonVerifiedChallenge({ sessionId }, request, accountId, { abandon: () => Promise.resolve({ data, error: null }) })
    assertEquals(response.status, 503)
    assertEquals(await response.json(), { responseVersion: 1, error: 'verification_unavailable' })
  }
})
Deno.test('abandon sanitizes failures and exposes only owner-scoped not-found errors', async () => {
  for (const [data, error, status, expected] of [
    [{ ok: false, error: 'challenge_not_found' }, null, 404, 'challenge_not_found'],
    [{ ok: false, error: 'private' }, null, 503, 'verification_unavailable'],
    [abandoned, { message: 'private' }, 503, 'verification_unavailable'],
  ] as const) {
    const response = await handleAbandonVerifiedChallenge({ sessionId }, request, accountId, { abandon: () => Promise.resolve({ data, error }) })
    assertEquals(response.status, status)
    assertEquals(await response.json(), { responseVersion: 1, error: expected })
  }
  assertEquals((await handleAbandonVerifiedChallenge({ sessionId }, request, accountId, { abandon: () => { throw Error('private') } })).status, 503)
})
