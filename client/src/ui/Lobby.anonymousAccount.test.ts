import { describe, expect, it, vi } from 'vitest'
import type {
  AccountCredentials,
  AccountMode,
  AccountState,
} from '../client/AccountSession'
import { Lobby, type AccountSessionPort } from './Lobby'

class FakeAccountSession implements AccountSessionPort {
  state: AccountState = { status: 'anonymous', busy: false, error: '' }
  readonly initialize = vi.fn(async () => undefined)
  readonly submit = vi.fn(async (_mode: AccountMode, _credentials: AccountCredentials) => undefined)
  readonly signOut = vi.fn(async () => undefined)
  readonly refresh = vi.fn(async () => undefined)
  readonly recordHotSeatMatch = vi.fn(async () => null)

  constructor(private readonly onChange: (state: AccountState) => void) {}

  emit(state: AccountState): void {
    this.state = state
    this.onChange(state)
  }
}

describe('Lobby anonymous account handoff', () => {
  it('identifies only the literal anonymous account state', () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })

    expect(lobby.isAccountAnonymous()).toBe(true)
    account.state = { status: 'unavailable', busy: false, error: '' }
    expect(lobby.isAccountAnonymous()).toBe(false)
    account.state = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: null },
    }
    expect(lobby.isAccountAnonymous()).toBe(false)
  })

  it('opens the existing account overlay in sign-in mode with email focus', () => {
    const root = document.createElement('div')
    const lobby = new Lobby(root, vi.fn(), (onChange) => new FakeAccountSession(onChange))
    document.body.append(root)
    lobby.show()

    lobby.showAccountSignIn()

    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Player account')
    expect(root.querySelector('input[type="email"]')).toBe(document.activeElement)
    root.remove()
  })
})
