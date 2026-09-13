import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { projectChallengeStatus } from './verifiedChallengeStatus.ts'
import { VERIFIED_CHALLENGE_CQ1 } from '../../../shared/src/net/verifiedChallenge.ts'
const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const descriptor = { ...VERIFIED_CHALLENGE_CQ1, accountId, sessionId,
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' }
const fresh = { ok: true, descriptor, status: 'active', computeAttempts: 0, boundTranscript: null, receipt: null }
const transcript = [{ angle: 32, power: 100 }]
const completedAt = '2026-09-13T12:01:00.000000Z'
const ledger = { verifiedMatches: 0, verifiedWins: 0, replayXp: 0, challengeXp: 0, totalXp: 0, medals: [] }
const receipt = { sessionId, accountId, editionId: 'cq1', transcript, outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200,
  completedAt, careerBeforeLedger: ledger, careerAfterLedger: { ...ledger, challengeXp: 200, totalXp: 200,
    medals: [{ entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification', xp: 200, rewardVersion: 1, sessionId, awardedAt: completedAt }] } }
Deno.test('status projects owner-bound fresh/resumable/terminal states without replay', () => {
  assertEquals(projectChallengeStatus(fresh, accountId, sessionId), { descriptor, status: 'active', computeAttempts: 0, boundTranscript: null, receipt: null })
  for (const status of ['active', 'expired', 'abandoned', 'invalid', 'verification_unavailable']) {
    const data = { ...fresh, status, computeAttempts: 3, boundTranscript: transcript }
    assertEquals(projectChallengeStatus(data, accountId, sessionId)?.status, status)
  }
  const data = { ...fresh, status: 'completed', computeAttempts: 1, boundTranscript: transcript, receipt }
  const projected = projectChallengeStatus(data, accountId, sessionId)
  assert(projected?.receipt)
  assertEquals(projected.receipt.xpGranted, 200)
  assertEquals(projected.receipt.careerAfter.totalXp, 200)
  assertEquals('careerAfterLedger' in projected.receipt, false)
  // Immutable completed evidence stays readable independent of wall-clock expiry.
  assertEquals(projectChallengeStatus(data, accountId, sessionId), projected)
})
Deno.test('status refuses wrong owner/session, partial receipts, impossible counters and mismatched canonical transcripts', () => {
  for (const invalid of [{ ...fresh, extra: true }, { ...fresh, status: 'unknown' }, { ...fresh, computeAttempts: 4 },
    { ...fresh, computeAttempts: 1 }, { ...fresh, boundTranscript: transcript }, { ...fresh, status: 'completed' },
    { ...fresh, receipt }, { ...fresh, status: 'invalid' }, { ...fresh, status: 'verification_unavailable', computeAttempts: 1, boundTranscript: transcript },
    { ...fresh, status: 'completed', computeAttempts: 1, boundTranscript: [{ angle: 0, power: 0 }], receipt }]) {
    assertEquals(projectChallengeStatus(invalid, accountId, sessionId), null)
  }
  assertEquals(projectChallengeStatus(fresh, sessionId, sessionId), null)
  assertEquals(projectChallengeStatus(fresh, accountId, accountId), null)
})
