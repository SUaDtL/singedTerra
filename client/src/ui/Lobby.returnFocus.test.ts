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
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === label)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`)
  return match
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

  it('returns to the selected practice and online surfaces without forcing Local Battle', () => {
    const { lobby } = createLobby(root)
    const background = document.createElement('button')
    document.body.append(background)
    lobby.show()
    button(root, 'Local Battle').click()
    button(root, 'Practice vs CPU').click()
    lobby.hide()
    background.focus()

    lobby.show({ focusLobby: true })
    expect(document.activeElement).toBe(button(root, 'Practice vs CPU'))

    button(root, 'Back to deployment choices').click()
    button(root, 'Play Online').click()
    lobby.hide()
    background.focus()
    lobby.show({ focusLobby: true })
    expect(document.activeElement).toBe(button(root, 'Create operation'))
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
    expect(document.activeElement).toBe(button(root, 'Local Battle'))
  })
})
