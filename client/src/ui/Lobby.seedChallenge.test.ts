import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Lobby, type LobbyConfig } from './Lobby'

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent === label)
  if (!found) throw new Error(`Expected ${label}`)
  return found
}

describe('Lobby seed challenge receiver', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    root = document.createElement('div')
    root.id = 'lobby'
    document.body.append(root)
  })

  afterEach(() => {
    history.replaceState(null, '', '/')
    root.remove()
    document.head.querySelector('#lobby-style')?.remove()
    vi.restoreAllMocks()
  })

  it.each([
    ['ST1-LL-4E2', 'Last Light Siege', 'Hold the Field · Win the duel.', 5690],
    ['ST1-CW-16', 'Crosswind Range', 'First Strike · Damage the CPU within your first three salvos.', 42],
    ['ST1-CR-16', 'Caldera Run', 'Set the Position · Change firing position, then damage the CPU with your first salvo.', 42],
    ['ST1-LA-16', 'Lean Arsenal', 'Make It Count · Win the best-of-three duel with Level 0 restocks only.', 42],
  ] as const)('renders and explicitly starts %s', (code, title, objective, seed) => {
    history.replaceState(null, '', `/singedTerra/#challenge=${code}`)
    const onReady = vi.fn<(config: LobbyConfig) => void>()
    const lobby = new Lobby(root, onReady)
    lobby.show()

    const callout = root.querySelector<HTMLElement>('[data-ui="seed-challenge"]')!
    expect(callout.querySelector('[data-ui="seed-challenge-kicker"]')?.textContent).toBe('SEED CHALLENGE')
    expect(callout.querySelector('[data-ui="seed-challenge-operation"]')?.textContent).toBe(title)
    expect(callout.querySelector('[data-ui="seed-challenge-objective"]')?.textContent).toBe(objective)
    expect(callout.querySelector('[data-ui="seed-challenge-seed"]')?.textContent).toBe(`Seed · ${seed}`)
    expect(onReady).not.toHaveBeenCalled()

    button(root, 'Start challenge vs CPU').click()

    expect(onReady).toHaveBeenCalledOnce()
    expect(onReady.mock.calls[0]?.[0]).toMatchObject({
      mode: 'hotseat',
      settings: { seed },
      quickOperation: { title },
      publicSeedChallenge: { seed, origin: 'imported-public-challenge' },
    })
    expect(onReady.mock.calls[0]?.[0].players).toHaveLength(2)
    expect(onReady.mock.calls[0]?.[0].players[1]?.ai).toBe('medium')
  })

  it('shows one inert generic failure without echoing or starting malformed input', () => {
    history.replaceState(null, '', '/singedTerra/#challenge=ST1-LL-%31%36')
    const onReady = vi.fn<(config: LobbyConfig) => void>()
    const lobby = new Lobby(root, onReady)
    lobby.show()

    const message = root.querySelector<HTMLElement>('[data-ui="seed-challenge-error"]')
    expect(message?.textContent).toBe('This seed challenge is invalid or no longer supported.')
    expect(message?.textContent).not.toContain('%31%36')
    expect(root.textContent).not.toContain('Start challenge vs CPU')
    expect(onReady).not.toHaveBeenCalled()
    expect(root.textContent).toContain('Quick Duel vs CPU')
  })

  it('keeps a live room query in the existing Online join route', () => {
    history.replaceState(null, '', '/singedTerra/?join=ABCD#challenge=ST1-LL-16')
    const lobby = new Lobby(root, vi.fn())
    lobby.show()

    expect(root.querySelector<HTMLInputElement>('.lobby-code-input')?.value).toBe('ABCD')
    expect(root.querySelector('[data-ui="seed-challenge"]')).toBeNull()
    expect(root.textContent).not.toContain('Start challenge vs CPU')
  })
})
