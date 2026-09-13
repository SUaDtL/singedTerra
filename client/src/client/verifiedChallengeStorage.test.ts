import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VERIFIED_CHALLENGE_CQ1 } from '@shared/net/verifiedChallenge'
import {
  VERIFIED_CHALLENGE_STORAGE_KEY,
  VerifiedChallengeStorage,
} from './verifiedChallengeStorage'

const accountId = '11111111-1111-4111-8111-111111111111'
const otherAccountId = '33333333-3333-4333-8333-333333333333'
const descriptor = Object.freeze({ ...VERIFIED_CHALLENGE_CQ1, accountId,
  sessionId: '22222222-2222-4222-8222-222222222222',
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' })

describe('VerifiedChallengeStorage', () => {
  beforeEach(() => localStorage.clear())

  it('persists only the fixed descriptor, bounded accepted shots, and completion-pending marker', () => {
    const storage = new VerifiedChallengeStorage(localStorage)
    expect(storage.begin(accountId, descriptor)).toBe(true)
    expect(storage.recordAcceptedFire(accountId, descriptor, { angle: 32, power: 100 })).toBe(true)
    expect(storage.recordAcceptedFire(accountId, descriptor, { angle: 45, power: 70 })).toBe(true)
    expect(storage.recordAcceptedFire(accountId, descriptor, { angle: 90, power: 60 })).toBe(true)
    expect(storage.recordAcceptedFire(accountId, descriptor, { angle: 1, power: 1 })).toBe(false)
    expect(storage.markCompletionPending(accountId, descriptor)).toBe(true)

    const recovered = storage.recover(accountId)
    expect(recovered).toMatchObject({ descriptor, completionPending: true, transcript: [
      { angle: 32, power: 100 }, { angle: 45, power: 70 }, { angle: 90, power: 60 },
    ] })
    expect(Object.isFrozen(recovered)).toBe(true)
    expect(Object.isFrozen(recovered?.transcript)).toBe(true)
  })

  it('does not expose or clear one account record through another account', () => {
    const storage = new VerifiedChallengeStorage(localStorage)
    expect(storage.begin(accountId, descriptor)).toBe(true)
    expect(storage.recover(otherAccountId)).toBeNull()
    storage.clearAccount(otherAccountId)
    expect(storage.recover(accountId)?.descriptor.sessionId).toBe(descriptor.sessionId)
    expect(storage.begin(otherAccountId, { ...descriptor, accountId: otherAccountId,
      sessionId: '44444444-4444-4444-8444-444444444444' })).toBe(false)
    expect(storage.recover(accountId)?.descriptor.sessionId).toBe(descriptor.sessionId)
    storage.clearAccount(accountId)
    expect(storage.recover(accountId)).toBeNull()
  })

  it('fails closed and removes malformed or unavailable storage', () => {
    localStorage.setItem(VERIFIED_CHALLENGE_STORAGE_KEY, JSON.stringify({ storageVersion: 1,
      editionId: 'cq2', accountId, descriptor, transcript: [], completionPending: false }))
    expect(new VerifiedChallengeStorage(localStorage).recover(accountId)).toBeNull()
    expect(localStorage.getItem(VERIFIED_CHALLENGE_STORAGE_KEY)).toBeNull()

    const unavailable = { getItem: vi.fn(() => { throw new Error('private') }),
      setItem: vi.fn(() => { throw new Error('private') }), removeItem: vi.fn() }
    const storage = new VerifiedChallengeStorage(unavailable)
    expect(storage.begin(accountId, descriptor)).toBe(false)
    expect(storage.recover(accountId)).toBeNull()
  })
})
