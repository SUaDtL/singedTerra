import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERIFIED_CHALLENGE_CQ1, type VerifiedChallengeReceipt } from '@shared/net/verifiedChallenge'
import { projectVerifiedCareer } from '@shared/net/verifiedCareer'
import { VerifiedChallengeTransportError } from '../client/verifiedChallenge'
import {
  VerifiedChallengeSession,
  type VerifiedChallengeSessionTransport,
} from '../client/VerifiedChallengeSession'
import { VerifiedChallengeStorage } from '../client/verifiedChallengeStorage'
import type { VerifiedCareerState } from '../client/verifiedCareer'
import type {
  AccountCredentials,
  AccountMode,
  AccountState,
} from '../client/AccountSession'
import type { VerifiedDeploymentReceipt, VerifiedDeploymentStart } from '../client/verifiedDeployment'
import { Lobby, type AccountSessionPort, type LobbyConfig } from './Lobby'

const accountId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const descriptor = Object.freeze({
  ...VERIFIED_CHALLENGE_CQ1,
  accountId,
  sessionId,
  admittedAt: '2026-09-13T12:00:00.000000Z',
  expiresAt: '2026-09-13T12:30:00.000000Z',
})
const zeroCareer = projectVerifiedCareer({
  verifiedMatches: 0, verifiedWins: 0, replayXp: 0, challengeXp: 0, totalXp: 0, medals: [],
})!
const completedAt = '2026-09-13T12:05:00.000000Z'
const awardedCareer = projectVerifiedCareer({
  verifiedMatches: 0, verifiedWins: 0, replayXp: 0, challengeXp: 200, totalXp: 200,
  medals: [{
    entitlementId: 'crosswind-qualification', medalId: 'crosswind-qualification', xp: 200,
    rewardVersion: 1, awardedAt: completedAt, sessionId,
  }],
})!
const fire = Object.freeze({ angle: 32, power: 100 })
const receipt = Object.freeze({
  evidence: 'verified_challenge_cq1', sessionId, accountId, editionId: 'cq1',
  transcript: Object.freeze([fire]), outcome: 'objective_cleared', disposition: 'awarded', xpGranted: 200,
  completedAt, careerBefore: zeroCareer, careerAfter: awardedCareer,
}) as VerifiedChallengeReceipt

class FakeAccountSession implements AccountSessionPort {
  state: AccountState = {
    status: 'authenticated', busy: false, error: '',
    profile: { id: accountId, displayName: 'Ranger', summary: null },
  }
  verifiedCareer?: VerifiedCareerState
  readonly initialize = vi.fn(async () => undefined)
  readonly submit = vi.fn(async (_mode: AccountMode, _credentials: AccountCredentials) => undefined)
  readonly signOut = vi.fn(async () => undefined)
  readonly refresh = vi.fn(async () => undefined)
  readonly refreshVerifiedCareer = vi.fn(async () => undefined)
  readonly recordHotSeatMatch = vi.fn(async () => null)
  readonly startVerifiedDeployment = vi.fn(async (): Promise<VerifiedDeploymentStart | null> => null)
  readonly abandonVerifiedDeployment = vi.fn(async () => false)
  readonly completeVerifiedDeployment = vi.fn(async (): Promise<VerifiedDeploymentReceipt | null> => null)
  private careerListener: ((state: VerifiedCareerState) => void) | null = null

  constructor(career: VerifiedCareerState = { status: 'unavailable', accountId }) {
    this.verifiedCareer = career
  }

  subscribeVerifiedCareer(listener: (state: VerifiedCareerState) => void): () => void {
    this.careerListener = listener
    return () => { this.careerListener = null }
  }

  emitCareer(state: VerifiedCareerState): void {
    this.verifiedCareer = state
    this.careerListener?.(state)
  }
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  let found = [...root.querySelectorAll('button')].find((candidate) => candidate.textContent === label)
  if (!found && label === 'Local Battle') {
    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="multiplayer"]',
    )?.click()
    root.querySelector<HTMLButtonElement>('[data-command-item="local-battle"]')?.click()
    found = [...root.querySelectorAll('button')].find((candidate) => candidate.textContent === label)
  }
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`)
  return found
}

function fixture(
  overrides: Partial<VerifiedChallengeSessionTransport> = {},
  career: VerifiedCareerState = { status: 'unavailable', accountId },
) {
  const root = document.createElement('div')
  document.body.append(root)
  const onReady = vi.fn<(config: LobbyConfig) => void>()
  const account = new FakeAccountSession(career)
  const transport: VerifiedChallengeSessionTransport = {
    start: vi.fn(async () => ({ descriptor, resumed: false })),
    get: vi.fn(async () => ({ descriptor, status: 'active' as const, computeAttempts: 0,
      boundTranscript: null, receipt: null })),
    abandon: vi.fn(async () => ({ descriptor, status: 'abandoned' as const, computeAttempts: 0,
      boundTranscript: null, receipt: null })),
    complete: vi.fn(async () => receipt),
    ...overrides,
  }
  let now = Date.parse('2026-09-13T12:05:00.000Z')
  const session = new VerifiedChallengeSession(
    transport,
    new VerifiedChallengeStorage(localStorage),
    () => account.state.status === 'authenticated' ? account.state.profile.id : null,
    () => now,
  )
  const lobby = new Lobby(
    root,
    onReady,
    () => account,
    undefined,
    () => 42,
    () => session,
  )
  lobby.show()
  button(root, 'Local Battle').click()
  button(root, 'Verified Deployment').click()
  button(root, 'Crosswind Qualification').click()
  return { root, lobby, onReady, account, transport, session,
    setNow: (value: number) => { now = value } }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.replaceChildren()
  localStorage.clear()
})

describe('Lobby Crosswind Qualification', () => {
  it('keeps focused controls mounted while the retry countdown updates', async () => {
    vi.useFakeTimers()
    const complete = vi.fn(async () => { throw new VerifiedChallengeTransportError('verification_busy', 503, 5) })
    const { root, lobby, setNow } = fixture({ complete })
    await lobby.launchVerifiedChallenge()
    lobby.recordVerifiedChallengeFire(fire)
    await lobby.completeVerifiedChallenge()
    lobby.show({ focusVerifiedChallenge: true })
    const selected = button(root, 'Crosswind Qualification')
    selected.focus()
    setNow(Date.parse('2026-09-13T12:05:01.000Z'))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(document.activeElement).toBe(selected)
    expect(root.textContent).toContain('Retry available in 4 seconds.')
    button(root, 'Deployment orders').click()
    const deployment = button(root, 'Deployment orders')
    deployment.focus()
    setNow(Date.parse('2026-09-13T12:05:02.000Z'))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(document.activeElement).toBe(deployment)
    lobby.hide()
  })

  it('returns keyboard focus to the qualification action after the game releases its modal', () => {
    const { root, lobby } = fixture()
    lobby.hide()
    lobby.show({ focusVerifiedChallenge: true })
    expect(document.activeElement).toBe(button(root, 'Check availability and start'))
  })

  it('gives an explicit verified return target precedence over the focused preparation tab', () => {
    const { root, lobby } = fixture()

    button(root, 'Local Battle').click()
    button(root, 'Local Battle').focus()
    lobby.show({ focusVerifiedChallenge: true })
    expect(document.activeElement).toBe(button(root, 'Check availability and start'))

    button(root, 'Practice vs CPU').click()
    button(root, 'Practice vs CPU').focus()
    lobby.show({ focusVerifiedDeployment: true })
    expect(document.activeElement).toBe(button(root, 'Start verified deployment'))
  })

  it('keeps all three Hot Seat tabs and presents a separate exact trial without guessing career totals', () => {
    const { root, transport } = fixture()

    expect([...root.querySelectorAll('.lobby-hotseat-tabs > [role="tab"]')].map((tab) => tab.textContent)).toEqual([
      'Local Battle', 'Practice vs CPU', 'Verified Deployment',
    ])
    const trial = root.querySelector<HTMLElement>('[data-verified-challenge="crosswind-qualification"]')
    expect(trial?.textContent).toContain('Crosswind Qualification')
    expect(trial?.textContent).toContain('Seed 42')
    expect(trial?.textContent).toContain('Wrap walls')
    expect(trial?.textContent).toContain('Baby Missile only')
    expect(trial?.textContent).toContain('3 human salvos maximum')
    expect(trial?.textContent).toContain('First clear: Crosswind Qualification medal + 200 Verified Career XP')
    expect(trial?.textContent).toContain('Repeat clears: +0 XP')
    expect(trial?.textContent).toContain('Verified Career unavailable. No totals are estimated.')
    expect(root.querySelector('.lobby-verified-deployment')).toBeNull()
    expect(root.textContent).not.toContain('Start verified deployment')
    expect(transport.start).not.toHaveBeenCalled()
    expect(transport.get).not.toHaveBeenCalled()
  })

  it('allocates only after the explicit qualification click and emits descriptor-bound data', async () => {
    const { root, onReady, transport } = fixture()

    expect(transport.start).not.toHaveBeenCalled()
    button(root, 'Check availability and start').click()
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce())

    expect(transport.start).toHaveBeenCalledOnce()
    expect(onReady.mock.calls[0]?.[0]).toMatchObject({
      mode: 'hotseat',
      settings: { seed: 42, walls: 'wrap', maxWind: 6, gravity: 0.15, rounds: 1 },
      verifiedChallenge: { descriptor, transcript: [] },
    })
    expect(onReady.mock.calls[0]?.[0].quickOperation).toBeUndefined()
    expect(onReady.mock.calls[0]?.[0].verifiedDeployment).toBeUndefined()
  })

  it('keeps a disabled backend refusal visible and retryable without launching', async () => {
    const { root, onReady, transport } = fixture({
      start: vi.fn(async () => { throw new VerifiedChallengeTransportError('challenge_starts_disabled', 503) }),
    })

    button(root, 'Check availability and start').click()
    await vi.waitFor(() => expect(root.textContent).toContain(
      'Trial starts are currently disabled by the verified backend. No reward was granted.',
    ))

    expect(onReady).not.toHaveBeenCalled()
    expect(button(root, 'Check availability again').disabled).toBe(false)
    expect(transport.start).toHaveBeenCalledOnce()
  })

  it('disables a server-directed retry until its cooldown elapses', async () => {
    const complete = vi.fn(async () => { throw new VerifiedChallengeTransportError(
      'verification_busy', 503, 5,
    ) })
    const { root, lobby, transport, setNow } = fixture({ complete })
    await lobby.launchVerifiedChallenge()
    expect(lobby.recordVerifiedChallengeFire(fire)).toBe(true)
    await lobby.completeVerifiedChallenge()
    button(root, 'Verified Deployment').click()

    expect(root.textContent).toContain('Retry available in 5 seconds.')
    expect(button(root, 'Retry verification').disabled).toBe(true)
    await lobby.retryVerifiedChallengeCompletion()
    expect(transport.get).not.toHaveBeenCalled()

    setNow(Date.parse('2026-09-13T12:05:05.000Z'))
    button(root, 'Verified Deployment').click()
    expect(button(root, 'Retry verification').disabled).toBe(false)
  })

  it('renders only current account-bound career facts and updates through the separate subscription', () => {
    const ready = { status: 'ready', accountId, career: awardedCareer } as const
    const { root, account } = fixture({}, { status: 'loading', accountId })
    expect(root.textContent).toContain('Loading Verified Career')

    account.emitCareer(ready)
    expect(root.textContent).toContain('Verified Career · R-01 Cadet · Level 1 · 200 XP')
    expect(root.textContent).toContain('Crosswind Qualification medal earned')
    const accountTrigger = root.querySelector<HTMLButtonElement>('.account-panel__account-trigger')
    expect(accountTrigger?.textContent).toContain('R-01')
    accountTrigger?.click()
    expect(root.querySelector('.account-panel__verified-career')?.textContent).toContain('200 verified XP')

    account.emitCareer({ status: 'ready', accountId: '33333333-3333-4333-8333-333333333333', career: awardedCareer })
    expect(root.textContent).toContain('Verified Career unavailable. No totals are estimated.')
    expect(root.textContent).not.toContain('Verified Career · R-01 Cadet · Level 1 · 200 XP')
  })

  it('retains active evidence through public completion and refreshes current career separately', async () => {
    const { root, lobby, account } = fixture()
    await lobby.launchVerifiedChallenge()
    expect(lobby.recordVerifiedChallengeFire(fire)).toBe(true)

    await expect(lobby.completeVerifiedChallenge()).resolves.toMatchObject({
      status: 'completed', receipt: { disposition: 'awarded', xpGranted: 200 },
    })
    expect(account.refreshVerifiedCareer).toHaveBeenCalledOnce()
    expect(lobby.verifiedChallenge).toMatchObject({ status: 'completed', receipt })

    button(root, 'Verified Deployment').click()
    expect(root.textContent).toContain('First clear verified: medal earned and +200 XP awarded.')
  })

  it('never relaunches an expired admission and permits an explicit fresh allocation', async () => {
    const freshDescriptor = Object.freeze({
      ...descriptor,
      sessionId: '55555555-5555-4555-8555-555555555555',
      admittedAt: '2026-09-13T12:31:00.000000Z',
      expiresAt: '2026-09-13T13:01:00.000000Z',
    })
    const start = vi.fn()
      .mockResolvedValueOnce({ descriptor, resumed: false })
      .mockResolvedValueOnce({ descriptor: freshDescriptor, resumed: false })
    const { lobby, onReady, setNow } = fixture({ start })
    await lobby.launchVerifiedChallenge()
    expect(onReady.mock.calls[0]?.[0].verifiedChallenge?.descriptor.sessionId).toBe(sessionId)

    setNow(Date.parse(descriptor.expiresAt))
    await expect(lobby.launchVerifiedChallenge()).resolves.toMatchObject({
      status: 'active', descriptor: freshDescriptor,
    })
    expect(start).toHaveBeenCalledTimes(2)
    expect(onReady).toHaveBeenCalledTimes(2)
    expect(onReady.mock.calls[1]?.[0].verifiedChallenge?.descriptor.sessionId).toBe(freshDescriptor.sessionId)
  })
})
