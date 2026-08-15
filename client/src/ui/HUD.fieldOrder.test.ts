import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import type { GameState } from '@shared/types/GameState'
import type { FieldOrder } from '../client/fieldOrder'
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

describe('HUD Field Order', () => {
  it.each([
    [{
      id: 'first-strike', title: 'First Strike', instruction: 'Damage the CPU within your first three salvos.',
      progress: { salvosRemaining: 1 }, result: null,
    } as const, 'First Strike · Damage the CPU within your first three salvos. · 1 salvo remaining'],
    [{
      id: 'fire-for-effect', title: 'Fire for Effect', instruction: 'Damage the CPU on two separate human salvos.',
      progress: { damagedSalvos: 1, requiredDamagedSalvos: 2 }, result: null,
    } as const, 'Fire for Effect · Damage the CPU on two separate human salvos. · 1 of 2 damaging salvos'],
    [{
      id: 'hold-the-field', title: 'Hold the Field', instruction: 'Win the duel.',
      progress: { awaitingWinner: true }, result: null,
    } as const, 'Hold the Field · Win the duel. · Awaiting duel outcome'],
  ] satisfies ReadonlyArray<readonly [FieldOrder, string]>)('shows one public verified-only %s cue without adding an interactive control', (order, expected) => {
    const { root, hud } = mount()

    hud.setFieldOrder(order)

    const cue = root.querySelector<HTMLElement>('[data-ui="field-order"]')!
    expect(cue.textContent).toBe(expected)
    expect(cue.getAttribute('role')).toBe('status')
    expect(cue.querySelectorAll('button,a,input,select,textarea')).toHaveLength(0)
  })

  it.each([
    [{
      id: 'first-strike', title: 'First Strike', instruction: 'Damage the CPU within your first three salvos.',
      progress: { salvosRemaining: 0 }, result: { status: 'achieved', achievedOnSalvo: 3 },
    } as const, 'First Strike achieved — CPU damaged on salvo 3.'],
    [{
      id: 'fire-for-effect', title: 'Fire for Effect', instruction: 'Damage the CPU on two separate human salvos.',
      progress: { damagedSalvos: 1, requiredDamagedSalvos: 2 }, result: { status: 'missed', damagedSalvos: 1 },
    } as const, 'Fire for Effect not achieved — CPU was damaged on 1 of 2 required human salvos.'],
    [{
      id: 'hold-the-field', title: 'Hold the Field', instruction: 'Win the duel.',
      progress: { awaitingWinner: true }, result: { status: 'achieved' },
    } as const, 'Hold the Field achieved — duel won.'],
  ] satisfies ReadonlyArray<readonly [FieldOrder, string]>)('adds the terminal %s result to the existing After Action Report without changing its actions', (order, expected) => {
    const { modal, hud, state } = mount()
    state.phase = 'GAME_OVER'
    state.winner = state.tanks[0]!.id
    hud.setFieldOrder(order)

    revealReport(hud, state)

    const report = modal.querySelector<HTMLElement>('.st-hud__overlay--victory')!
    expect(report.textContent).toContain(expected)
    expect([...report.querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(['Play again', 'Main Menu'])
  })

  it('retires all order language outside an active verified deployment', () => {
    const { root, modal, hud, state } = mount()
    hud.setFieldOrder({
      id: 'first-strike', title: 'First Strike', instruction: 'Damage the CPU within your first three salvos.',
      progress: { salvosRemaining: 2 }, result: { status: 'achieved', achievedOnSalvo: 1 },
    })
    hud.setFieldOrder(null)
    state.phase = 'GAME_OVER'
    state.winner = state.tanks[0]!.id
    revealReport(hud, state)

    expect(root.querySelector('[data-ui="field-order"]')).toBeNull()
    expect(modal.querySelector('.st-hud__overlay--victory')?.textContent).not.toContain('First Strike')
  })

  it('renders only the public Field Order projection', () => {
    const { root, hud } = mount()
    hud.setFieldOrder({
      id: 'hold-the-field', title: 'Hold the Field', instruction: 'Win the duel.',
      progress: { awaitingWinner: true }, result: null,
      descriptor: 'private-session', accountId: 'private-account', reward: 'bonus XP',
    } as FieldOrder)

    expect(root.textContent).toContain('Hold the Field')
    expect(root.textContent).not.toMatch(/private-session|private-account|bonus XP/)
  })
})
