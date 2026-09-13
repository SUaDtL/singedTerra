import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERIFIED_CHALLENGE_CQ1, type VerifiedChallengeDescriptor, type VerifiedChallengeReceipt } from '@shared/net/verifiedChallenge'
import { projectVerifiedCareer } from '@shared/net/verifiedCareer'
import type { VerifiedChallengeSessionState } from '../client/VerifiedChallengeSession'
import type { VerifiedChallengeClientResult } from '../client/VerifiedChallengeClient'
import { VerifiedChallengeView, projectVerifiedChallengeView } from './VerifiedChallengeView'

const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const descriptor = Object.freeze({ ...VERIFIED_CHALLENGE_CQ1, accountId, sessionId,
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' }) as VerifiedChallengeDescriptor
const shot = Object.freeze({ angle: 32, power: 100 })
const localResult = Object.freeze({ editionId: 'cq1', seed: 42, terminal: 'objective_cleared',
  humanSalvos: 1, cpuSalvos: 0, humanHealth: 100, cpuHealth: 72, liveTicks: 118,
  cpuSimulationTicks: 0, maximumProbeCount: 0, transcript: [shot], events: [] }) as VerifiedChallengeClientResult
const emptyCareer = projectVerifiedCareer({ verifiedMatches: 0, verifiedWins: 0, replayXp: 0,
  challengeXp: 0, totalXp: 0, medals: [] })!
const awardedCareer = projectVerifiedCareer({ verifiedMatches: 0, verifiedWins: 0, replayXp: 0,
  challengeXp: 200, totalXp: 200, medals: [{ entitlementId: 'crosswind-qualification',
    medalId: 'crosswind-qualification', xp: 200, rewardVersion: 1, sessionId,
    awardedAt: '2026-09-13T12:01:00.000000Z' }] })!

function active(transcript = [] as readonly typeof shot[]): VerifiedChallengeSessionState {
  return { status: 'active', descriptor, transcript, computeAttempts: 0 }
}

function receipt(disposition: 'awarded' | 'already_owned' | 'not_awarded'): VerifiedChallengeReceipt {
  const owned = disposition === 'already_owned'
  const before = owned ? awardedCareer : emptyCareer
  const after = disposition === 'awarded' ? awardedCareer : before
  return {
    evidence: 'verified_challenge_cq1', sessionId, accountId, editionId: 'cq1',
    transcript: disposition === 'not_awarded' ? [shot, shot, shot] : [shot],
    outcome: disposition === 'not_awarded' ? 'objective_not_cleared' : 'objective_cleared',
    disposition, xpGranted: disposition === 'awarded' ? 200 : 0,
    completedAt: '2026-09-13T12:01:00.000000Z', careerBefore: before, careerAfter: after,
  }
}

function mount() {
  const app = document.createElement('main')
  const statusHost = document.createElement('aside')
  const modalHost = document.createElement('div')
  const other = document.createElement('button')
  other.textContent = 'Other control'
  app.append(statusHost, other, modalHost)
  document.body.append(app)
  const onRetry = vi.fn()
  const onReturn = vi.fn()
  const view = new VerifiedChallengeView({ host: modalHost, statusHost, onRetry, onReturn,
    focusFallback: () => other })
  return { app, statusHost, modalHost, other, view, onRetry, onReturn }
}

describe('VerifiedChallengeView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('keeps an active qualification in the match ledger without opening a result dialog', () => {
    const projection = projectVerifiedChallengeView({ session: active(), result: null })
    expect(projection.open).toBe(false)
    expect(projection.status).toContain('Crosswind Qualification')
    expect(projection.status).toContain('0 / 3 salvos')

    const mounted = mount()
    mounted.view.update({ session: active(), result: null })
    expect(mounted.view.root.hidden).toBe(true)
    expect(mounted.view.statusRoot.hidden).toBe(false)
    expect(mounted.view.statusRoot.textContent).toContain('Damage the CPU')
  })

  it('labels an early local objective clear as awaiting verification and grants nothing locally', () => {
    const mounted = mount()
    mounted.view.update({ session: active([shot]), result: localResult })

    expect(mounted.view.root.hidden).toBe(false)
    expect(mounted.view.root.textContent).toContain('Objective cleared locally')
    expect(mounted.view.root.textContent).toContain('server receipt is required')
    expect(mounted.view.root.textContent).toContain('Reward status unconfirmed')
    expect(mounted.view.root.textContent).not.toContain('wins')
    expect(mounted.other.inert).toBe(true)

    const returnButton = [...mounted.view.root.querySelectorAll('button')]
      .find((button) => button.textContent === 'Return to preparation')
    returnButton?.click()
    expect(mounted.onReturn).toHaveBeenCalledOnce()
  })

  it('shows completion pending without fabricating a reward', () => {
    const projection = projectVerifiedChallengeView({
      session: { status: 'completion-pending', descriptor, transcript: [shot], computeAttempts: 1 },
      result: localResult,
    })
    expect(projection.title).toBe('Objective cleared locally')
    expect(projection.message).toContain('Verification pending')
    expect(projection.message).toContain('Awaiting a verified receipt')
    expect(projection.reward).toBe('Reward status unconfirmed.')
    expect(projection.retry).toBeNull()
  })

  it('counts down a bounded busy retry before enabling the action', () => {
    const mounted = mount()
    mounted.view.update({
      session: { status: 'retryable', descriptor, transcript: [shot], computeAttempts: 1,
        reason: 'busy', retryAfterSeconds: 2, retryIntent: 'complete' },
      result: localResult,
    })
    const retry = [...mounted.view.root.querySelectorAll('button')]
      .find((button) => button.textContent === 'Retry verification') as HTMLButtonElement
    expect(retry.disabled).toBe(true)
    expect(mounted.view.root.textContent).toContain('Retry available in 00:02')
    expect(mounted.view.root.textContent).toContain('Reward status is unconfirmed until the server receipt is recovered')
    vi.advanceTimersByTime(2_000)
    expect(retry.disabled).toBe(false)
    expect(mounted.view.root.textContent).toContain('Retry available now')
    retry.click()
    expect(mounted.onRetry).toHaveBeenCalledOnce()
  })

  it.each([
    ['awarded', 'Crosswind Qualification verified', 'Crosswind Qualification medal', '+200 verified career XP'],
    ['already_owned', 'Crosswind Qualification verified', 'Medal already owned', '+0 XP'],
    ['not_awarded', 'Qualification not cleared', 'No medal awarded', '+0 XP'],
  ] as const)('renders the exact %s receipt disposition', (disposition, title, medal, reward) => {
    const completedReceipt = receipt(disposition)
    const projection = projectVerifiedChallengeView({
      session: { status: 'completed', descriptor, receipt: completedReceipt },
      result: localResult,
    })
    expect(projection.title).toBe(title)
    expect(projection.medal).toBe(medal)
    expect(projection.reward).toBe(reward)
    expect(projection.message).toContain(disposition === 'already_owned' ? 'Repeat clear' : disposition === 'awarded'
      ? 'First clear awarded' : 'objective was not cleared')
  })

  it.each([
    ['expired', 'Qualification expired'],
    ['verification_unavailable', 'Verification unavailable'],
    ['invalid', 'Qualification unavailable'],
    ['abandoned', 'Qualification abandoned'],
  ] as const)('states that %s grants no reward', (status, title) => {
    const projection = projectVerifiedChallengeView({
      session: { status, descriptor, transcript: [shot], computeAttempts: 1 },
      result: localResult,
    })
    expect(projection.title).toBe(title)
    expect(projection.reward).toBe('No verified reward is confirmed.')
  })
})
