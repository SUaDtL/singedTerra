import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { projectVerifiedChallengeReceipt } from './verifiedCareer.ts'
import { projectVerifiedCareer } from '../../../shared/src/net/verifiedCareer.ts'

const sessionId = '12345678-1234-4234-8234-123456789abc'
const completedAt = '2026-09-13T12:01:00.123456Z'
const medal = { entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification', xp: 200,
  rewardVersion: 1, awardedAt: completedAt, sessionId }
const before = { verifiedMatches: 3, verifiedWins: 1, replayXp: 400, challengeXp: 0, totalXp: 400, medals: [] }
const after = { ...before, challengeXp: 200, totalXp: 600, medals: [medal] }
const internal = { sessionId, accountId: '87654321-1234-4234-8234-123456789abc', editionId: 'cq1',
  transcript: [{ angle: 45, power: 70 }], outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200,
  completedAt, careerBeforeLedger: before, careerAfterLedger: after }
const expected = { evidence: 'verified_challenge_cq1', sessionId, accountId: internal.accountId,
  editionId: 'cq1', transcript: internal.transcript, outcome: 'objective_cleared', disposition: 'awarded',
  xpGranted: 200, completedAt, careerBefore: projectVerifiedCareer(before), careerAfter: projectVerifiedCareer(after) }

Deno.test('T18 exact internal receipt projects full original career facts and strips internal ledger names', () => {
  assertEquals<unknown>(projectVerifiedChallengeReceipt(internal), expected)
  const copied = structuredClone(internal)
  const projected = projectVerifiedChallengeReceipt(copied)
  copied.careerAfterLedger.medals[0].awardedAt = 'forged'
  copied.transcript[0].angle = 0
  assertEquals<unknown>(projected, expected)
  assert(Object.isFrozen(projected))
})

Deno.test('T18 repeat and terminal failure keep identical original historical snapshots', () => {
  const repeat = { ...internal, sessionId: '11111111-1111-4111-8111-111111111111', disposition: 'already_owned', xpGranted: 0,
    completedAt: '2026-09-13T12:02:00.000000Z', careerBeforeLedger: after }
  assertEquals<unknown>(projectVerifiedChallengeReceipt(repeat), { ...expected, sessionId: repeat.sessionId,
    completedAt: repeat.completedAt, disposition: 'already_owned', xpGranted: 0, careerBefore: projectVerifiedCareer(after) })
  for (const outcome of ['terminal_without_clear', 'objective_not_cleared', 'work_limit']) {
    const transcript = outcome === 'objective_not_cleared' ? Array(3).fill({ angle: 45, power: 70 }) : internal.transcript
    const failure = { ...internal, outcome, transcript, disposition: 'not_awarded', xpGranted: 0, careerAfterLedger: before }
    assertEquals<unknown>(projectVerifiedChallengeReceipt(failure), { ...expected, outcome, disposition: 'not_awarded', xpGranted: 0,
      transcript, careerAfter: projectVerifiedCareer(before) })
  }
})

Deno.test('T18 refuses malformed internal facts and reward/identity/receipt tampering without guessing', () => {
  for (const invalid of [null, [], {}, { ...internal, extra: true }, { ...internal, responseVersion: 1 },
    { ...internal, evidence: 'verified_challenge_cq1' }, { ...internal, sessionId: 'bad' },
    { ...internal, careerBeforeLedger: { ...before, verifiedMatches: '3' } },
    { ...internal, careerBeforeLedger: { ...before, verifiedMatches: Number.MAX_SAFE_INTEGER + 1 } },
    { ...internal, careerBeforeLedger: { ...before, totalXp: 999 } },
    { ...internal, careerBeforeLedger: { ...before, casualXp: 500 } },
    { ...internal, careerAfterLedger: { ...after, medals: [] } },
    { ...internal, careerAfterLedger: { ...after, medals: [{ ...medal, sessionId: '11111111-1111-4111-8111-111111111111' }] } },
    { ...internal, careerAfterLedger: { ...after, medals: [{ ...medal, xp: 201 }] } },
    { ...internal, xpGranted: 400 }, { ...internal, disposition: 'not_awarded' },
    { ...internal, transcript: [{ angle: 45, power: 70, extra: true }] },
    { ...internal, completedAt: '2026-09-13T25:00:00Z' },
    { ...internal, careerBeforeLedger: null }, { ...internal, careerAfterLedger: null }])
    assertEquals<unknown>(projectVerifiedChallengeReceipt(invalid), null)
  for (const key of Object.keys(internal)) {
    const missing: Record<string, unknown> = { ...internal }; delete missing[key]
    assertEquals<unknown>(projectVerifiedChallengeReceipt(missing), null)
  }
})
