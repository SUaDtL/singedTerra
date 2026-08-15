import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameEngine } from '@shared/engine/GameEngine'
import { HUD } from './HUD'
import type { LiveMatchSnapshot } from '../client/liveMatchDiagnostics'

function mount(): { root: HTMLElement; modal: HTMLElement; hud: HUD } {
  const app = document.createElement('main')
  const stage = document.createElement('div')
  const root = document.createElement('div')
  const overlay = document.createElement('div')
  const rail = document.createElement('div')
  const modal = document.createElement('div')
  stage.append(overlay, rail)
  app.append(stage, root, modal)
  document.body.append(app)
  const hud = new HUD(root, overlay, modal, rail)
  const state = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  }).getState()
  hud.update(state)
  return { root, modal, hud }
}

const SNAPSHOT: LiveMatchSnapshot = Object.freeze({
  schemaVersion: 1,
  mode: 'hotseat',
  execution: 'casual',
  phase: 'PLAYER_TURN',
  round: 1,
  totalRounds: 3,
  turn: 4,
  activeSeat: Object.freeze({ ordinal: 1, alive: true, health: 100 }),
  input: 'ready',
  transport: 'not-applicable',
})

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelector('#st-hud-style')?.remove()
})

describe('HUD live match diagnostics', () => {
  it('does not add a maintainer control to an ordinary battle', () => {
    const { root } = mount()

    expect(root.querySelector('[data-ui="live-match-diagnostics"]')).toBeNull()
  })

  it('opens a copyable read-only inspector and returns focus without pausing play', async () => {
    const { root, modal, hud } = mount()
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    hud.setLiveMatchDiagnostics(() => SNAPSHOT)

    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!
    expect(root.querySelector('[data-ui="live-match-diagnostics"]')).toBeNull()
    expect(root.querySelectorAll(':scope > button')).toHaveLength(1)
    menu.focus()
    menu.click()
    const trigger = modal.querySelector<HTMLButtonElement>('[data-ui="live-match-inspector-menu"]')!
    expect(trigger.textContent).toContain('Inspect live match')
    trigger.click()

    const inspector = modal.querySelector<HTMLElement>('[data-ui="live-match-inspector"]')!
    expect(inspector.getAttribute('role')).toBe('dialog')
    expect(inspector.getAttribute('aria-modal')).toBe('true')
    expect(inspector.textContent).toContain('"turn": 4')
    expect(inspector.textContent).not.toContain('Alice')
    expect(root.inert).toBe(true)

    inspector.querySelector<HTMLButtonElement>('[data-action="copy-live-match-snapshot"]')!.click()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(SNAPSHOT, null, 2))

    inspector.querySelector<HTMLButtonElement>('[data-action="close-live-match-inspector"]')!.click()
    expect(root.inert).toBe(false)
    expect(document.activeElement).toBe(menu)
  })

  it('withdraws the rendered snapshot when authenticated diagnostics access is removed', () => {
    const { root, modal, hud } = mount()
    hud.setLiveMatchDiagnostics(() => SNAPSHOT)
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!
    menu.click()
    const trigger = modal.querySelector<HTMLButtonElement>('[data-ui="live-match-inspector-menu"]')!
    trigger.click()

    const inspector = modal.querySelector<HTMLElement>('[data-ui="live-match-inspector"]')!
    expect(inspector.textContent).toContain('"turn": 4')
    hud.setLiveMatchDiagnostics(null)

    expect(inspector.classList.contains('st-hud__overlay--hidden')).toBe(true)
    expect(inspector.getAttribute('aria-hidden')).toBe('true')
    expect(inspector.querySelector('.st-hud__live-diagnostics-data')?.textContent).toBe('')
    expect(document.querySelector('[data-ui="live-match-diagnostics"]')).toBeNull()
    expect(document.querySelector('[data-ui="live-match-inspector-menu"]')).toBeNull()
  })
})
