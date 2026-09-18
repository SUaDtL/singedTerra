import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountCredentials,
  AccountMode,
  AccountState,
} from '../client/AccountSession'
import type { FetchedRoom } from '../client/LobbyTransport'
import type { VerifiedCareerState } from '../client/verifiedCareer'
import type {
  VerifiedDeploymentReceipt,
  VerifiedDeploymentStart,
} from '../client/verifiedDeployment'
import { writeSession } from '../lib/sessionDescriptor'
import { Lobby, type AccountSessionPort } from './Lobby'

class FakeAccountSession implements AccountSessionPort {
  state: AccountState = { status: 'anonymous', busy: false, error: '' }
  verifiedCareer: VerifiedCareerState = { status: 'unavailable', accountId: null }
  readonly initialize = vi.fn(async () => undefined)
  readonly submit = vi.fn(async (_mode: AccountMode, _credentials: AccountCredentials) => undefined)
  readonly signOut = vi.fn(async () => undefined)
  readonly refresh = vi.fn(async () => undefined)
  readonly recordHotSeatMatch = vi.fn(async () => null)
  readonly startVerifiedDeployment = vi.fn(async (): Promise<VerifiedDeploymentStart | null> => null)
  readonly abandonVerifiedDeployment = vi.fn(async () => false)
  readonly completeVerifiedDeployment = vi.fn(async (): Promise<VerifiedDeploymentReceipt | null> => null)
  private careerListener: ((state: VerifiedCareerState) => void) | null = null

  constructor(private readonly accountListener: (state: AccountState) => void) {}

  subscribeVerifiedCareer(listener: (state: VerifiedCareerState) => void): () => void {
    this.careerListener = listener
    return () => { this.careerListener = null }
  }

  emitAccount(): void {
    this.accountListener(this.state)
  }

  emitCareer(): void {
    this.careerListener?.(this.verifiedCareer)
  }
}

interface LobbyInternals {
  readonly transport: {
    fetchRoom(roomId: string): Promise<FetchedRoom | null>
  }
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  let match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === label)
  if (!match && label === 'Local Battle' && root.querySelector(
    '[data-multiplayer-command-view="local-battle"]',
  )) {
    match = root.querySelector<HTMLButtonElement>('[data-command-item="local-battle"]') ?? undefined
  }
  const category = label === 'Local Battle' || label === 'Play Online'
    ? 'multiplayer'
    : label.includes('Ash Road') ? 'campaigns' : null
  if (!match && category) {
    root.querySelector<HTMLButtonElement>(
      `[data-command-surface="rail"][data-command-category="${category}"]`,
    )?.click()
    if (category === 'multiplayer') {
      const item = root.querySelector<HTMLButtonElement>(
        `[data-command-item="${label === 'Play Online' ? 'online' : 'local-battle'}"]`,
      )
      item?.click()
      if (item) return item
    }
    match = [...root.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === label)
  }
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`)
  return match
}

interface LobbyLaunchFocusContract {
  captureLaunchFocus(): unknown;
  restoreLaunchFocus(snapshot: unknown): void;
  showLaunchFailure(message: string): void;
  showNetworkRecovery(message: string, retry: () => void): void;
}

function createLobby(root: HTMLElement): { lobby: Lobby; account: FakeAccountSession } {
  let account!: FakeAccountSession
  const lobby = new Lobby(root, vi.fn(), (onChange) => {
    account = new FakeAccountSession(onChange)
    return account
  })
  return { lobby, account }
}

function activeRoom(): FetchedRoom {
  return {
    id: 'room-1',
    code: 'ABCD',
    seed: 1,
    options: {
      maxPlayers: 2, maxWind: 10, gravity: 0.15,
      rulesetVersion: 4, commandProtocolVersion: 2,
    },
    players: [{ id: 'player-1', name: 'Ranger', color: '#e84d4d', ready: true }],
    status: 'active',
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('Lobby return focus', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    history.replaceState(null, '', '/')
    root = document.createElement('div')
    root.id = 'lobby'
    document.body.append(root)
  })

  afterEach(() => {
    document.body.replaceChildren()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('focuses a visible lobby entry only when an ordinary match return requests it', () => {
    const { lobby } = createLobby(root)
    const matchLedger = document.createElement('button')
    matchLedger.textContent = 'Open match ledger'
    document.body.append(matchLedger)
    matchLedger.focus()

    lobby.show()
    expect(document.activeElement).toBe(matchLedger)

    button(root, 'Local Battle').click()
    lobby.hide()
    matchLedger.focus()
    lobby.show({ focusLobby: true })

    expect(document.activeElement).toBe(button(root, 'Local Battle'))
    matchLedger.remove()
  })

  it('keeps the returned lobby entry focused through account and career renders', () => {
    const { lobby, account } = createLobby(root)
    lobby.show()
    button(root, 'Local Battle').click()
    lobby.hide()
    lobby.show({ focusLobby: true })
    expect(document.activeElement).toBe(button(root, 'Local Battle'))

    account.emitAccount()
    expect(document.activeElement).toBe(button(root, 'Local Battle'))

    account.emitCareer()
    expect(document.activeElement).toBe(button(root, 'Local Battle'))

    const outside = document.createElement('button')
    outside.textContent = 'Outside lobby'
    document.body.append(outside)
    outside.focus()
    account.emitCareer()
    expect(document.activeElement).toBe(outside)
  })

  it('returns to the selected Local and Online workspaces without changing their owners', () => {
    const { lobby } = createLobby(root)
    const background = document.createElement('button')
    document.body.append(background)
    lobby.show()
    button(root, 'Local Battle').click()
    lobby.hide()
    background.focus()

    lobby.show({ focusLobby: true })
    expect(document.activeElement).toBe(button(root, 'Local Battle'))

    button(root, 'Play Online').click()
    lobby.hide()
    background.focus()
    lobby.show({ focusLobby: true })
    expect(document.activeElement).toBe(root.querySelector('[data-command-item="online"]'))
  })

  it('preserves selection in the genuinely focused lobby control without reclaiming outside focus', () => {
    const { lobby, account } = createLobby(root)
    lobby.show()
    button(root, 'Local Battle').click()
    const name = root.querySelector<HTMLInputElement>('.lobby-name')!
    name.value = 'Ranger'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    name.focus()
    name.setSelectionRange(1, 5, 'forward')

    account.emitCareer()

    const replacement = root.querySelector<HTMLInputElement>('.lobby-name')!
    expect(document.activeElement).toBe(replacement)
    expect([replacement.selectionStart, replacement.selectionEnd, replacement.selectionDirection])
      .toEqual([1, 5, 'forward'])

    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    account.emitCareer()
    expect(document.activeElement).toBe(outside)
  })

  it('preserves focused account and settings controls instead of reclaiming the match-return target', () => {
    const { lobby, account } = createLobby(root)
    lobby.show()
    button(root, 'Local Battle').click()
    button(root, 'Account').click()
    const email = root.querySelector<HTMLInputElement>('.lobby-overlay input[type="email"]')!
    email.focus()

    account.emitCareer()

    const replacementEmail = root.querySelector<HTMLInputElement>('.lobby-overlay input[type="email"]')!
    expect(document.activeElement).toBe(replacementEmail)

    button(root, 'Close').click()
    button(root, 'Advanced settings').click()
    const walls = root.querySelector<HTMLSelectElement>('.lobby-overlay #lobby-hotseat-walls')!
    walls.focus()
    account.emitCareer()
    expect(document.activeElement)
      .toBe(root.querySelector<HTMLSelectElement>('.lobby-overlay #lobby-hotseat-walls'))
  })

  it('keeps the returned lobby entry focused when asynchronous rejoin discovery renders', async () => {
    const { lobby } = createLobby(root)
    lobby.show()
    button(root, 'Local Battle').click()
    lobby.hide()
    writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'player-1' })
    let resolveRoom!: (room: FetchedRoom) => void
    vi.spyOn((lobby as unknown as LobbyInternals).transport, 'fetchRoom')
      .mockReturnValue(new Promise((resolve) => { resolveRoom = resolve }))

    lobby.show({ focusLobby: true })
    expect(document.activeElement).toBe(button(root, 'Local Battle'))

    resolveRoom(activeRoom())
    await flush()

    expect(root.textContent).toContain('Rejoin your game')
    expect(document.activeElement).toBe(
      root.querySelector('[data-command-item="local-battle"]'),
    )
  })

  it('restores the exact command-center control after a failed launch without changing selection', () => {
    const { lobby } = createLobby(root)
    lobby.show()
    const launchOwner = lobby as unknown as Partial<LobbyLaunchFocusContract>
    expect(launchOwner.captureLaunchFocus).toBeTypeOf('function')
    expect(launchOwner.restoreLaunchFocus).toBeTypeOf('function')
    expect(launchOwner.showLaunchFailure).toBeTypeOf('function')

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="campaigns"]',
    )?.click()
    const primary = root.querySelector<HTMLButtonElement>('[data-command-item="ash-road"]')!
    primary.focus()
    const snapshot = launchOwner.captureLaunchFocus!()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()

    launchOwner.showLaunchFailure!('Campaign progress changed in another session.')
    launchOwner.restoreLaunchFocus!(snapshot)

    expect(document.activeElement).toBe(primary)
    expect(root.querySelector('[role="alert"]')?.textContent)
      .toBe('Campaign progress changed in another session.')
    expect(root.querySelector('[data-command-item="ash-road"]')?.getAttribute('aria-current'))
      .toBe('true')
  })

  it('keeps network recovery in its initiating workspace and restores the initiating control', () => {
    const { lobby } = createLobby(root)
    lobby.show()
    button(root, 'Play Online').click()
    const createRoom = button(root, 'Create operation')
    createRoom.focus()
    const launchOwner = lobby as unknown as LobbyLaunchFocusContract
    const snapshot = launchOwner.captureLaunchFocus()

    launchOwner.showNetworkRecovery('Room acquisition failed.', vi.fn())
    launchOwner.restoreLaunchFocus(snapshot)

    expect(document.activeElement).toBe(button(root, 'Retry game recovery'))
    expect(button(root, 'Retry game recovery').isConnected).toBe(true)
  })

  it('renders failed rejoin recovery inside the selected Online command workspace', () => {
    const { lobby } = createLobby(root)
    lobby.show()
    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="multiplayer"]',
    )?.click()
    root.querySelector<HTMLButtonElement>(
      '.command-center__library-items button[data-command-item="online"]',
    )?.click()
    const launchOwner = lobby as unknown as LobbyLaunchFocusContract

    launchOwner.showNetworkRecovery('Game recovery timed out.', vi.fn())
    launchOwner.restoreLaunchFocus(null)

    expect(root.querySelector('[data-command-item="online"]')?.getAttribute('aria-current'))
      .toBe('true')
    expect(root.querySelector('[role="alert"]')?.textContent)
      .toContain('Game recovery timed out.')
    const retry = button(root, 'Retry game recovery')
    expect(retry.isConnected).toBe(true)
    expect(document.activeElement).toBe(retry)
  })

  it('reconstructs the remembered owner when a battle-originated restart fails', () => {
    const { lobby } = createLobby(root)
    lobby.show()
    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )?.click()
    lobby.hide()
    expect(root.childElementCount).toBe(0)

    const launchOwner = lobby as unknown as LobbyLaunchFocusContract
    launchOwner.showLaunchFailure('Rematch setup failed.')
    launchOwner.restoreLaunchFocus(null)

    expect(root.hidden).toBe(false)
    expect(root.querySelector('[data-command-item="first-salvo"]')?.getAttribute('aria-current'))
      .toBe('true')
    expect(root.querySelector('[data-launch-failure]')?.textContent).toBe('Rematch setup failed.')
    expect(root.contains(document.activeElement)).toBe(true)
  })
})
