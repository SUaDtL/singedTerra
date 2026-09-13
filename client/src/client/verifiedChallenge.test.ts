import { describe, expect, it, vi } from 'vitest'
import { VERIFIED_CHALLENGE_CQ1 } from '@shared/net/verifiedChallenge'
import { projectVerifiedCareer } from '@shared/net/verifiedCareer'
import {
  VerifiedChallengeTransport,
  VerifiedChallengeTransportError,
  parseVerifiedChallengeStatusResponse,
} from './verifiedChallenge'

const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const transcript = Object.freeze([{ angle: 32, power: 100 }])
const descriptor = Object.freeze({
  ...VERIFIED_CHALLENGE_CQ1,
  accountId,
  sessionId,
  admittedAt: '2026-09-13T12:00:00.000000Z',
  expiresAt: '2026-09-13T12:30:00.000000Z',
})
const before = projectVerifiedCareer({ verifiedMatches: 0, verifiedWins: 0, replayXp: 0,
  challengeXp: 0, totalXp: 0, medals: [] })!
const completedAt = '2026-09-13T12:01:00.000000Z'
const after = projectVerifiedCareer({ verifiedMatches: 0, verifiedWins: 0, replayXp: 0,
  challengeXp: 200, totalXp: 200, medals: [{ entitlementId: 'crosswind-qualification',
    medalId: 'crosswind-qualification', xp: 200, rewardVersion: 1,
    sessionId, awardedAt: completedAt }] })
const receipt = Object.freeze({ evidence: 'verified_challenge_cq1', sessionId, accountId, editionId: 'cq1',
  transcript, outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200, completedAt,
  careerBefore: before, careerAfter: after })

describe('verified challenge wire contract', () => {
  it('sends only the fixed cq1 request bodies and accepts exact versioned envelopes', async () => {
    const invoke = vi.fn(async (operation: string, _body: Readonly<Record<string, unknown>>) => operation === 'start_verified_challenge'
      ? { status: 200, data: { responseVersion: 1, descriptor, resumed: false } }
      : operation === 'get_verified_challenge'
        ? { status: 200, data: { responseVersion: 1, descriptor, status: 'active', computeAttempts: 0,
            boundTranscript: null, receipt: null } }
        : operation === 'abandon_verified_challenge'
          ? { status: 200, data: { responseVersion: 1, descriptor, status: 'abandoned', computeAttempts: 0,
              boundTranscript: null, receipt: null } }
          : { status: 200, data: { responseVersion: 1, receipt } })
    const transport = new VerifiedChallengeTransport(invoke)

    await expect(transport.start()).resolves.toEqual({ descriptor, resumed: false })
    await expect(transport.get(sessionId)).resolves.toMatchObject({ status: 'active', descriptor })
    await expect(transport.abandon(sessionId)).resolves.toMatchObject({ status: 'abandoned', descriptor })
    await expect(transport.complete(sessionId, transcript)).resolves.toEqual(receipt)
    expect(invoke.mock.calls.map(([operation, body]) => [operation, body])).toEqual([
      ['start_verified_challenge', { trialId: 'crosswind-qualification', supportedDescriptorVersions: [1] }],
      ['get_verified_challenge', { sessionId }],
      ['abandon_verified_challenge', { sessionId }],
      ['complete_verified_challenge', { sessionId, transcript }],
    ])
  })

  it('rejects extra fields, inconsistent status facts, and receipts bound to another session', () => {
    const active = { responseVersion: 1, descriptor, status: 'active', computeAttempts: 0,
      boundTranscript: null, receipt: null }
    expect(parseVerifiedChallengeStatusResponse(active)).not.toBeNull()
    expect(parseVerifiedChallengeStatusResponse({ ...active, extra: true })).toBeNull()
    expect(parseVerifiedChallengeStatusResponse({ ...active, computeAttempts: 1 })).toBeNull()
    expect(parseVerifiedChallengeStatusResponse({ ...active, status: 'completed', computeAttempts: 1,
      boundTranscript: transcript, receipt: { ...receipt, sessionId: '33333333-3333-4333-8333-333333333333' } })).toBeNull()
  })

  it('surfaces only bounded typed failures and a valid busy retry interval', async () => {
    const busy = new VerifiedChallengeTransport(async () => ({ status: 503,
      data: { responseVersion: 1, error: 'verification_busy', retryAfter: 410 },
      headers: { get: (name: string) => name.toLowerCase() === 'retry-after' ? '410' : null } }))
    await expect(busy.start()).rejects.toMatchObject({ code: 'verification_busy', status: 503, retryAfterSeconds: 410 })

    const forged = new VerifiedChallengeTransport(async () => ({ status: 503,
      data: { responseVersion: 1, error: 'private stack trace', extra: true } }))
    const error = await forged.start().catch((caught) => caught)
    expect(error).toBeInstanceOf(VerifiedChallengeTransportError)
    expect(error).toMatchObject({ code: 'verification_unavailable', status: 503, retryAfterSeconds: null })
    expect(String(error)).not.toContain('private stack')
  })

  it('rejects busy envelopes unless the bounded body and Retry-After header agree exactly', async () => {
    for (const response of [
      { status: 503, data: { responseVersion: 1, error: 'verification_busy', retryAfter: 409 },
        headers: { get: () => '410' } },
      { status: 503, data: { responseVersion: 1, error: 'verification_busy', retryAfter: 0 },
        headers: { get: () => '0' } },
      { status: 503, data: { responseVersion: 1, error: 'verification_busy', retryAfter: 410, extra: true },
        headers: { get: () => '410' } },
      { status: 503, data: { responseVersion: 1, error: 'verification_unavailable', retryAfter: 410 },
        headers: { get: () => '410' } },
    ]) {
      const transport = new VerifiedChallengeTransport(async () => response)
      await expect(transport.start()).rejects.toMatchObject({
        code: 'verification_unavailable', status: 503, retryAfterSeconds: null,
      })
    }
  })
})
