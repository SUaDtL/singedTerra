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

describe('Lobby account composition', () => {
  it('initializes the account owner and delegates sign-in credentials once', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })

    lobby.show()
    expect(account.initialize).toHaveBeenCalledOnce()
    button(root, 'Account').click()
    const form = root.querySelector('form.account-panel__form')
    const email = root.querySelector<HTMLInputElement>('input[type="email"]')
    const password = root.querySelector<HTMLInputElement>('input[type="password"]')
    if (!(form instanceof HTMLFormElement) || !email || !password) throw new Error('Missing sign-in form')
    email.value = 'ranger@example.test'
    password.value = 'not-a-real-secret'
    form.requestSubmit()

    expect(account.submit).toHaveBeenCalledOnce()
    expect(account.submit).toHaveBeenCalledWith('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    expect(password.value).toBe('')
  })

  it('re-renders authenticated state, signs out, and preserves ordinary lobby controls', () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })
    lobby.show()

    account.emit({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: null },
    })

    expect(root.querySelector('.account-panel__identity')?.textContent).toContain('Ranger')
    expect(button(root, 'Hot Seat')).toBeTruthy()
    expect(button(root, 'Play Online')).toBeTruthy()
    button(root, 'Sign out').click()
    expect(account.signOut).toHaveBeenCalledOnce()
  })

  it('omits accounts when unavailable without blocking hot-seat', () => {
    const root = document.createElement('div')
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      const account = new FakeAccountSession(onChange)
      account.state = { status: 'unavailable', busy: false, error: '' }
      return account
    })

    lobby.show()

    expect(root.querySelector('.account-panel')).toBeNull()
    expect(button(root, 'Start Game')).toBeTruthy()
  })

  it('keeps the compact account affordance out of the lobby content-width rule', () => {
    const root = document.createElement('div')
    root.id = 'lobby'
    const lobby = new Lobby(root, vi.fn(), (onChange) => new FakeAccountSession(onChange))
    lobby.show()
    const panel = root.querySelector<HTMLElement>('.account-panel')
    if (!panel) throw new Error('Missing account panel')

    const style = getComputedStyle(panel)
    expect(style.width).toBe('auto')
    expect(style.maxWidth).toBe('none')
    expect(style.marginLeft).toBe('0px')
  })
})
