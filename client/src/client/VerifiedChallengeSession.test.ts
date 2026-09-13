import { describe, expect, it, vi } from 'vitest'
import { VERIFIED_CHALLENGE_CQ1, parseVerifiedChallengeDescriptor, type VerifiedChallengeReceipt } from '@shared/net/verifiedChallenge'
import { projectVerifiedCareer } from '@shared/net/verifiedCareer'
import { VerifiedChallengeSession, type VerifiedChallengeSessionTransport } from './VerifiedChallengeSession'
import { VerifiedChallengeStorage } from './verifiedChallengeStorage'
import { VerifiedChallengeTransportError } from './verifiedChallenge'

const accountA = '11111111-1111-4111-8111-111111111111'
const accountB = '33333333-3333-4333-8333-333333333333'
const sessionId = '22222222-2222-4222-8222-222222222222'
const sessionBId = '44444444-4444-4444-8444-444444444444'
const descriptor = parseVerifiedChallengeDescriptor({ ...VERIFIED_CHALLENGE_CQ1, accountId: accountA, sessionId,
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' })!
const descriptorB = Object.freeze({ ...descriptor, sessionId: sessionBId })
const transcript = Object.freeze([{ angle: 32, power: 100 }])
const before = projectVerifiedCareer({ verifiedMatches: 0, verifiedWins: 0, replayXp: 0,
  challengeXp: 0, totalXp: 0, medals: [] })!
const completedAt = '2026-09-13T12:01:00.000000Z'
const after = projectVerifiedCareer({ verifiedMatches: 0, verifiedWins: 0, replayXp: 0,
  challengeXp: 200, totalXp: 200, medals: [{ entitlementId: 'crosswind-qualification',
    medalId: 'crosswind-qualification', xp: 200, rewardVersion: 1, sessionId, awardedAt: completedAt }] })!
const receipt = Object.freeze({ evidence: 'verified_challenge_cq1', sessionId, accountId: accountA,
  editionId: 'cq1', transcript, outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200,
  completedAt, careerBefore: before, careerAfter: after }) as VerifiedChallengeReceipt
const activeStatus = Object.freeze({ descriptor, status: 'active' as const, computeAttempts: 0,
  boundTranscript: null, receipt: null })

function fixture(overrides: Partial<VerifiedChallengeSessionTransport> = {}) {
  let accountId: string | null = accountA
  const transport: VerifiedChallengeSessionTransport = {
    start: vi.fn(async () => ({ descriptor, resumed: false })),
    get: vi.fn(async () => activeStatus),
    abandon: vi.fn(async () => ({ ...activeStatus, status: 'abandoned' as const })),
    complete: vi.fn(async () => receipt),
    ...overrides,
  }
  const storage = new VerifiedChallengeStorage(localStorage)
  let now = Date.parse('2026-09-13T12:05:00.000Z')
  const session = new VerifiedChallengeSession(transport, storage, () => accountId, () => now)
  return { session, transport, storage,
    setAccount: (value: string | null) => { accountId = value },
    setNow: (value: number) => { now = value } }
}

describe('VerifiedChallengeSession', () => {
  it('allocates only on explicit start and binds accepted shots to the authenticated owner', async () => {
    localStorage.clear()
    const f = fixture()
    expect(f.transport.start).not.toHaveBeenCalled()
    await expect(f.session.start()).resolves.toMatchObject({ status: 'active', descriptor })
    expect(f.session.recordAcceptedFire({ angle: 32, power: 100 })).toBe(true)
    expect(f.session.state).toMatchObject({ status: 'active', transcript })
  })

  it('keeps disabled and timeout starts explicit without persisting a local session', async () => {
    localStorage.clear()
    const disabled = fixture({ start: vi.fn(async () => { throw new VerifiedChallengeTransportError(
      'challenge_starts_disabled', 503,
    ) }) })
    await expect(disabled.session.start()).resolves.toEqual({
      status: 'start-unavailable', reason: 'disabled', retryAfterSeconds: null,
    })
    expect(disabled.storage.recover(accountA)).toBeNull()

    const timeout = fixture({ start: vi.fn(async () => { throw new VerifiedChallengeTransportError(
      'request_timeout', 503,
    ) }) })
    await expect(timeout.session.start()).resolves.toEqual({
      status: 'start-unavailable', reason: 'timeout', retryAfterSeconds: null,
    })
  })

  it('preserves a pending transcript after a lost completion and looks up its receipt before retrying', async () => {
    localStorage.clear()
    const complete = vi.fn(async () => { throw new Error('lost response') })
    const f = fixture({ complete })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)
    await expect(f.session.complete()).resolves.toMatchObject({ status: 'retryable' })
    expect(f.storage.recover(accountA)).toMatchObject({ completionPending: true, transcript })

    const get = vi.mocked(f.transport.get)
    get.mockResolvedValueOnce({ descriptor, status: 'completed', computeAttempts: 1,
      boundTranscript: transcript, receipt })
    await expect(f.session.retry()).resolves.toMatchObject({ status: 'completed', receipt })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(f.storage.recover(accountA)).toBeNull()
  })

  it('keeps busy completion retryable with the bounded server delay', async () => {
    localStorage.clear()
    const f = fixture({ complete: vi.fn(async () => { throw new VerifiedChallengeTransportError(
      'verification_busy', 503, 410,
    ) }) })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)
    await expect(f.session.complete()).resolves.toMatchObject({
      status: 'retryable', reason: 'busy', retryAfterSeconds: 410,
    })
    expect(f.session.retryDelaySeconds).toBe(410)
    await expect(f.session.retry()).resolves.toMatchObject({ status: 'retryable', reason: 'busy' })
    expect(f.transport.get).not.toHaveBeenCalled()

    f.setNow(Date.parse('2026-09-13T12:11:50.000Z'))
    vi.mocked(f.transport.get).mockResolvedValueOnce({ descriptor, status: 'completed', computeAttempts: 1,
      boundTranscript: transcript, receipt })
    await expect(f.session.retry()).resolves.toMatchObject({ status: 'completed', receipt })
  })

  it.each(['completion', 'receipt lookup', 'reload recovery'] as const)(
    'keeps an uncertain %s recoverable when the admission expires', async (stage) => {
      localStorage.clear()
      const f = fixture({ complete: vi.fn(async () => {
        if (stage === 'completion') f.setNow(Date.parse(descriptor.expiresAt))
        throw new Error('response lost after possible server commit')
      }) })
      await f.session.start()
      f.session.recordAcceptedFire(transcript[0]!)
      await expect(f.session.complete()).resolves.toMatchObject({ status: 'retryable', retryIntent: 'complete' })
      f.setNow(Date.parse(descriptor.expiresAt))
      if (stage !== 'completion') {
        vi.mocked(f.transport.get).mockRejectedValueOnce(new Error('receipt lookup offline'))
        await expect(stage === 'reload recovery' ? f.session.recover() : f.session.retry())
          .resolves.toMatchObject({ status: 'retryable', retryIntent: 'complete' })
      }
      expect(f.storage.recover(accountA)).toMatchObject({ completionPending: true })
      vi.mocked(f.transport.get).mockResolvedValueOnce({ descriptor, status: 'completed',
        computeAttempts: 1, boundTranscript: transcript, receipt })
      await expect(f.session.retry()).resolves.toMatchObject({ status: 'completed', receipt })
      expect(f.transport.complete).toHaveBeenCalledOnce()
    },
  )

  it('refuses more local evidence once the admitted descriptor expires', async () => {
    localStorage.clear()
    const f = fixture()
    await f.session.start()
    f.setNow(Date.parse(descriptor.expiresAt))
    expect(f.session.recordAcceptedFire(transcript[0]!)).toBe(false)
    expect(f.session.state).toMatchObject({ status: 'expired', descriptor })
    expect(f.transport.complete).not.toHaveBeenCalled()
  })

  it('projects an expired active admission synchronously without expiring receipt recovery', async () => {
    localStorage.clear()
    const f = fixture({ complete: vi.fn(async () => { throw new Error('lost response') }) })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)
    await expect(f.session.complete()).resolves.toMatchObject({ status: 'retryable', retryIntent: 'complete' })

    f.setNow(Date.parse(descriptor.expiresAt))
    expect(f.session.projectDeadline()).toMatchObject({ status: 'retryable', retryIntent: 'complete' })
    vi.mocked(f.transport.get).mockResolvedValueOnce({ descriptor, status: 'completed', computeAttempts: 1,
      boundTranscript: transcript, receipt })
    await expect(f.session.retry()).resolves.toMatchObject({ status: 'completed', receipt })

    const active = fixture()
    await active.session.start()
    active.setNow(Date.parse(descriptor.expiresAt))
    expect(active.session.projectDeadline()).toMatchObject({ status: 'expired', descriptor })
  })

  it('enters terminal expiry when completion begins at the deadline', async () => {
    localStorage.clear()
    const f = fixture()
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)
    f.setNow(Date.parse(descriptor.expiresAt))

    await expect(f.session.complete()).resolves.toMatchObject({ status: 'expired', descriptor })
    expect(f.transport.complete).not.toHaveBeenCalled()
  })

  it('enters invalid and clears recovery when refresh gets a terminal lookup failure', async () => {
    localStorage.clear()
    const f = fixture({ get: vi.fn(async () => { throw new VerifiedChallengeTransportError(
      'challenge_not_found', 404,
    ) }) })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)

    await expect(f.session.refresh()).resolves.toMatchObject({ status: 'invalid', descriptor })
    expect(f.storage.recover(accountA)).toBeNull()
  })

  it('drops owner state on logout and ignores an old async response after account change', async () => {
    localStorage.clear()
    let resolveStart!: (value: { descriptor: typeof descriptor; resumed: boolean }) => void
    const pending = new Promise<{ descriptor: typeof descriptor; resumed: boolean }>((resolve) => { resolveStart = resolve })
    const f = fixture({ start: vi.fn(() => pending) })
    const starting = f.session.start()
    f.setAccount(accountB)
    expect(f.session.syncAccount()).toBe(true)
    resolveStart({ descriptor, resumed: false })
    await starting
    expect(f.session.state).toEqual({ status: 'idle' })
    expect(f.storage.recover(accountA)).toBeNull()
  })

  it('recovers an admitted session explicitly without allocating a new one', async () => {
    localStorage.clear()
    const f = fixture()
    f.storage.begin(accountA, descriptor)
    f.storage.recordAcceptedFire(accountA, descriptor, transcript[0]!)
    f.storage.markCompletionPending(accountA, descriptor)
    await expect(f.session.recover()).resolves.toMatchObject({ status: 'retryable', transcript })
    expect(f.transport.start).not.toHaveBeenCalled()
    expect(f.transport.get).toHaveBeenCalledWith(sessionId)
  })

  it('does not let a stale same-account refresh overwrite a newer completed result', async () => {
    localStorage.clear()
    let resolveGet!: (value: typeof activeStatus) => void
    const get = vi.fn(() => new Promise<typeof activeStatus>((resolve) => { resolveGet = resolve }))
    const f = fixture({ get })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)

    const refreshing = f.session.refresh()
    await expect(f.session.complete()).resolves.toMatchObject({ status: 'completed', receipt })
    resolveGet(activeStatus)
    await refreshing

    expect(f.session.state).toMatchObject({ status: 'completed', receipt })
  })

  it('does not let a stale session-A refresh overwrite a newer session B', async () => {
    localStorage.clear()
    let resolveGet!: (value: typeof activeStatus) => void
    const get = vi.fn(() => new Promise<typeof activeStatus>((resolve) => { resolveGet = resolve }))
    const start = vi.fn()
      .mockResolvedValueOnce({ descriptor, resumed: false })
      .mockResolvedValueOnce({ descriptor: descriptorB, resumed: false })
    const f = fixture({ get, start })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)

    const refreshing = f.session.refresh()
    await f.session.complete()
    await expect(f.session.start()).resolves.toMatchObject({ status: 'active', descriptor: descriptorB })
    resolveGet(activeStatus)
    await refreshing

    expect(f.session.state).toMatchObject({ status: 'active', descriptor: descriptorB })
    expect(f.storage.recover(accountA)?.descriptor.sessionId).toBe(sessionBId)
  })

  it('retries a failed read-only refresh without submitting a partial transcript', async () => {
    localStorage.clear()
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(activeStatus)
    const f = fixture({ get })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)

    await expect(f.session.refresh()).resolves.toMatchObject({ status: 'retryable' })
    expect(f.storage.recover(accountA)).toMatchObject({ completionPending: false, transcript })
    await expect(f.session.retry()).resolves.toMatchObject({ status: 'active', transcript })

    expect(get).toHaveBeenCalledTimes(2)
    expect(f.transport.complete).not.toHaveBeenCalled()
  })

  it('retries a failed abandon as abandon without submitting completion', async () => {
    localStorage.clear()
    const abandon = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...activeStatus, status: 'abandoned' as const })
    const f = fixture({ abandon })
    await f.session.start()
    f.session.recordAcceptedFire(transcript[0]!)

    await expect(f.session.abandon()).resolves.toMatchObject({ status: 'retryable' })
    await expect(f.session.retry()).resolves.toMatchObject({ status: 'abandoned' })

    expect(abandon).toHaveBeenCalledTimes(2)
    expect(f.transport.complete).not.toHaveBeenCalled()
  })
})
