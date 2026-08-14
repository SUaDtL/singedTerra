import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import type { GameState } from '@shared/types/GameState'
import type { FirstStrikeObjective } from '../client/firstStrikeObjective'
import { HUD } from './HUD'

function mount(): { root: HTMLElement; modal: HTMLElement; hud: HUD; state: GameState } {
  document.body.innerHTML = '<aside id="hud"></aside><div id="overlay"></div><div id="modal"></div>'
  const root = document.querySelector<HTMLElement>('#hud')!
  const overlay = document.querySelector<HTMLElement>('#overlay')!
  const modal = document.querySelector<HTMLElement>('#modal')!
  const hud = new HUD(root, overlay, modal, overlay)
  const state = new GameEngine({
    players: [{ name: 'Commander', color: '#e84d4d' }, { name: 'CPU', color: '#4d8ce8', ai: 'hard' }],
    maxPlayers: 2,
    seed: 17,
  }).getState()
  hud.update(state)
  return { root, modal, hud, state }
}

function revealReport(hud: HUD, state: GameState): void {
  hud.update(state)
  hud.notifyTerminalImpactComplete()
  vi.advanceTimersByTime(420)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelector('#st-hud-style')?.remove()
  vi.useRealTimers()
})

describe('HUD First Strike objective', () => {
  it('shows a compact verified-only progress cue without adding an interactive control', () => {
    const { root, hud } = mount()
    const objective: FirstStrikeObjective = { status: 'active', salvosRemaining: 1 }

    hud.setFirstStrikeObjective(objective)

    const cue = root.querySelector<HTMLElement>('[data-ui="first-strike-objective"]')!
    expect(cue.textContent).toContain('First Strike')
    expect(cue.textContent).toContain('1 salvo remaining')
    expect(cue.getAttribute('role')).toBe('status')
    expect(cue.querySelectorAll('button,a,input,select,textarea')).toHaveLength(0)
  })

  it.each([
    [{ status: 'achieved', achievedOnSalvo: 3 } as const, 'First Strike achieved — CPU damaged on salvo 3.'],
    [{ status: 'missed' } as const, 'First Strike missed — CPU was not damaged in the first 3 salvos.'],
  ])('adds the terminal %s result to the existing After Action Report without changing its actions', (objective, expected) => {
    const { modal, hud, state } = mount()
    state.phase = 'GAME_OVER'
    state.winner = state.tanks[0]!.id
    hud.setFirstStrikeObjective(objective)

    revealReport(hud, state)

    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!
    expect(report.textContent).toContain(expected)
    expect([...report.querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(['Play again', 'Main Menu'])
  })

  it('retires all objective language outside an active verified deployment', () => {
    const { root, modal, hud, state } = mount()
    hud.setFirstStrikeObjective({ status: 'achieved', achievedOnSalvo: 1 })
    hud.setFirstStrikeObjective(null)
    state.phase = 'GAME_OVER'
    state.winner = state.tanks[0]!.id
    revealReport(hud, state)

    expect(root.querySelector('[data-ui="first-strike-objective"]')).toBeNull()
    expect(modal.querySelector('.st-hud__overlay--victory')?.textContent).not.toContain('First Strike')
  })
})
