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

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`)
  return match
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

  it('switches an existing create-account overlay to sign-in mode with email focus', () => {
    const root = document.createElement('div')
    const lobby = new Lobby(root, vi.fn(), (onChange) => new FakeAccountSession(onChange))
    document.body.append(root)
    lobby.show()

    button(root, 'Account').click()
    button(root, 'Create account').click()
    expect(root.querySelector('.account-panel__header strong')?.textContent).toBe('Create account')
    expect(root.querySelector('input[name="displayName"]')).not.toBeNull()

    lobby.showAccountSignIn()

    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Player account')
    expect(root.querySelector('.account-panel__header strong')?.textContent).toBe('Sign in')
    expect(button(root, 'Sign in').getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector('input[name="displayName"]')).toBeNull()
    expect(root.querySelector('input[type="email"]')).toBe(document.activeElement)
    root.remove()
  })
})
