import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import { VERIFIED_CHALLENGE_CQ1, type VerifiedChallengeDescriptor } from '@shared/net/verifiedChallenge'
import type { VerifiedChallengeClientResult } from '../client/VerifiedChallengeClient'
import { HUD } from './HUD'

const descriptor = Object.freeze({ ...VERIFIED_CHALLENGE_CQ1,
  accountId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  admittedAt: '2026-09-13T12:00:00.000000Z', expiresAt: '2026-09-13T12:30:00.000000Z' }) as VerifiedChallengeDescriptor
const shot = Object.freeze({ angle: 32, power: 100 })
const result = Object.freeze({ editionId: 'cq1', seed: 42, terminal: 'objective_cleared',
  humanSalvos: 1, cpuSalvos: 0, humanHealth: 100, cpuHealth: 72, liveTicks: 118,
  cpuSimulationTicks: 0, maximumProbeCount: 0, transcript: [shot], events: [] }) as VerifiedChallengeClientResult

function mountHud() {
  const app = document.createElement('main')
  app.id = 'app'
  const root = document.createElement('aside')
  const overlay = document.createElement('div')
  const rail = document.createElement('div')
  const modal = document.createElement('div')
  app.append(root, overlay, rail, modal)
  document.body.append(app)
  return { hud: new HUD(root, overlay, modal, rail), root, modal }
}

afterEach(() => { document.body.innerHTML = '' })

describe('HUD verified challenge presentation', () => {
  it('keeps active status in the match ledger and uses the dedicated early-result dialog', async () => {
    const { hud, root, modal } = mountHud()
    const onReturn = vi.fn()
    hud.onVerifiedChallengeReturn(onReturn)
    hud.setVerifiedChallenge({
      session: { status: 'active', descriptor, transcript: [], computeAttempts: 0 },
      result: null,
    })
    expect(root.querySelector('[data-ui="verified-challenge-status"]')?.textContent)
      .toContain('0 / 3 salvos')
    expect(modal.querySelector<HTMLElement>('[data-ui="verified-challenge-report"]')?.hidden).toBe(true)

    hud.setVerifiedChallenge({
      session: { status: 'active', descriptor, transcript: [shot], computeAttempts: 0 },
      result,
    })
    const challenge = modal.querySelector<HTMLElement>('[data-ui="verified-challenge-report"]')
    const ordinary = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')
    expect(challenge?.hidden).toBe(false)
    expect(challenge?.textContent).toContain('Objective cleared locally')
    expect(ordinary?.classList.contains('st-hud__overlay--hidden')).toBe(true)
    expect(ordinary?.textContent).not.toContain('Objective cleared locally')

    const returnButton = [...challenge!.querySelectorAll('button')]
      .find((button) => button.textContent === 'Return to preparation')
    returnButton?.click()
    expect(onReturn).toHaveBeenCalledOnce()
    await hud.destroy()
  })

  it('routes only the dedicated verification retry and clears both challenge surfaces', async () => {
    const { hud, root, modal } = mountHud()
    const onRetry = vi.fn()
    hud.onVerifiedChallengeRetry(onRetry)
    hud.setVerifiedChallenge({
      session: { status: 'retryable', descriptor, transcript: [shot], computeAttempts: 1,
        reason: 'unavailable', retryAfterSeconds: null, retryIntent: 'complete' },
      result,
    })
    const challenge = modal.querySelector<HTMLElement>('[data-ui="verified-challenge-report"]')!
    const retry = [...challenge.querySelectorAll('button')]
      .find((button) => button.textContent === 'Retry verification') as HTMLButtonElement
    expect(retry.disabled).toBe(false)
    retry.click()
    expect(onRetry).toHaveBeenCalledOnce()

    hud.setVerifiedChallenge(null)
    expect(challenge.hidden).toBe(true)
    expect(root.querySelector<HTMLElement>('[data-ui="verified-challenge-status"]')?.hidden).toBe(true)
    await hud.destroy()
  })

  it('suppresses the ordinary GAME_OVER report while challenge presentation is owned', async () => {
    vi.useFakeTimers()
    const { hud, modal } = mountHud()
    hud.setVerifiedChallenge({
      session: { status: 'active', descriptor, transcript: [shot], computeAttempts: 0 },
      result,
    })
    const state = new GameEngine({ maxPlayers: 2, seed: 42,
      players: [{ name: 'Commander', color: '#e84d4d' }, { name: 'CPU', color: '#4d8ce8' }] }).getState()
    state.phase = 'GAME_OVER'
    state.winner = state.tanks[0]!.id
    hud.update(state)
    hud.notifyTerminalImpactComplete()
    vi.advanceTimersByTime(1_000)

    expect(modal.querySelector<HTMLElement>('[data-ui="verified-challenge-report"]')?.hidden).toBe(false)
    expect(modal.querySelector<HTMLElement>('.st-hud__overlay--victory')
      ?.classList.contains('st-hud__overlay--hidden')).toBe(true)
    await hud.destroy()
    vi.useRealTimers()
  })
})
