import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handleVerifiedCareerSummary } from './index.ts'
import { projectVerifiedCareer } from '../../../shared/src/net/verifiedCareer.ts'
const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const request = new Request('https://example.test')
const ledger = { verifiedMatches: 3, verifiedWins: 1, replayXp: 400, challengeXp: 0, totalXp: 400, medals: [] }
Deno.test('career summary projects only the authenticated account verified ledgers and versioned rank', async () => {
  for (const data of [{ ...ledger, verifiedMatches: 0, verifiedWins: 0, replayXp: 0, totalXp: 0 }, ledger,
    { ...ledger, challengeXp: 200, totalXp: 600, medals: [{ entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification',
      rewardVersion: 1, xp: 200, sessionId, awardedAt: '2026-09-13T12:00:00.000000Z' }] }]) {
    const calls: unknown[] = []
    const response = await handleVerifiedCareerSummary({}, request, accountId, { snapshot: (args) => {
      calls.push(args); return Promise.resolve({ data, error: null })
    } })
    assertEquals(response.status, 200)
    assertEquals(await response.json(), { responseVersion: 1, career: projectVerifiedCareer(data) })
    assertEquals(calls, [{ p_account_id: accountId }])
  }
})
Deno.test('career requires exact empty request and refuses malformed totals or unverified XP', async () => {
  let calls = 0
  for (const body of [null, [], { accountId }, { sessionId }, { xp: 100 }]) {
    assertEquals((await handleVerifiedCareerSummary(body, request, accountId, { snapshot: () => {
      calls++; return Promise.resolve({ data: ledger, error: null })
    } })).status, 400)
  }
  assertEquals(calls, 0)
  for (const data of [null, {}, { ...ledger, accountId }, { ...ledger, totalXp: 999 }, { ...ledger, replayXp: '400' },
    { ...ledger, verifiedWins: 4 }, { ...ledger, casualXp: 200 }, { ...ledger, challengeXp: 200, totalXp: 600 },
    { ...ledger, verifiedMatches: Number.MAX_SAFE_INTEGER }]) {
    const response = await handleVerifiedCareerSummary({}, request, accountId, { snapshot: () => Promise.resolve({ data, error: null }) })
    assertEquals(response.status, 503)
    assertEquals(await response.json(), { responseVersion: 1, error: 'verification_unavailable' })
  }
})
Deno.test('career storage failures fail closed without exposing internal details', async () => {
  const response = await handleVerifiedCareerSummary({}, request, accountId, {
    snapshot: () => Promise.resolve({ data: ledger, error: { message: 'private' } }),
  })
  assertEquals(response.status, 503)
  assertEquals(await response.json(), { responseVersion: 1, error: 'verification_unavailable' })
  const thrown = await handleVerifiedCareerSummary({}, request, accountId, { snapshot: () => { throw Error('private') } })
  assertEquals(thrown.status, 503)
  assertEquals(await thrown.json(), { responseVersion: 1, error: 'verification_unavailable' })
})
