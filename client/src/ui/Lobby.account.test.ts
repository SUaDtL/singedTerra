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
  readonly recordHotSeatMatch = vi.fn(async () => ({
    prior: {
      progressionVersion: 1 as const,
      totalXp: 0,
      level: 1,
      levelXp: 0,
      nextLevelXp: 500,
    },
    current: {
      progressionVersion: 1 as const,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
    },
  }))

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
    password.value = 'fixture'
    form.requestSubmit()

    expect(account.submit).toHaveBeenCalledOnce()
    expect(account.submit).toHaveBeenCalledWith('sign-in', {
      email: 'ranger@example.test',
      password: 'fixture',
    })
    expect(password.value).toBe('')
  })

  it('opens account access above the lobby and restores the masthead trigger on close', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })
    document.body.append(root)
    lobby.show()

    const trigger = button(root, 'Account')
    trigger.click()
    await Promise.resolve()

    const overlay = root.querySelector<HTMLElement>('.lobby-overlay')
    const dialog = overlay?.querySelector<HTMLElement>('[role="dialog"]')
    expect(overlay?.parentElement).toBe(root)
    expect(dialog?.getAttribute('aria-label')).toBe('Player account')
    expect(root.querySelector('.lobby-deployment__masthead .account-panel--open')).toBeNull()
    expect(document.activeElement).toBe(overlay?.querySelector('.lobby-overlay__close'))

    overlay?.querySelector<HTMLButtonElement>('.lobby-overlay__close')?.click()
    expect(document.activeElement).toBe(button(root, 'Account'))
    expect(account.initialize).toHaveBeenCalledOnce()
    root.remove()
  })

  it('keeps focus inside account access when switching credential modes', () => {
    const root = document.createElement('div')
    const lobby = new Lobby(root, vi.fn(), (onChange) => new FakeAccountSession(onChange))
    document.body.append(root)
    lobby.show()

    button(root, 'Account').click()
    button(root, 'Create account').click()
    expect(document.activeElement).toBe(root.querySelector('input[name="displayName"]'))

    button(root, 'Sign in').click()
    expect(document.activeElement).toBe(root.querySelector('input[type="email"]'))
    root.remove()
  })

  it('keeps focus inside account access after a session-state render', () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })
    document.body.append(root)
    lobby.show()

    button(root, 'Account').click()
    account.emit({ status: 'anonymous', busy: true, error: '' })

    expect(document.activeElement).toBe(root.querySelector('input[type="email"]'))
    account.emit({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: null },
    })
    expect(document.activeElement).toBe(button(root, 'Sign out'))
    button(root, 'Close').click()
    expect(root.querySelector<HTMLElement>('.lobby-card')?.hasAttribute('inert')).toBe(false)
    root.remove()
  })

  it('re-renders authenticated state, signs out, and preserves ordinary lobby controls', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })
    document.body.append(root)
    lobby.show()

    account.emit({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: null },
    })

    const accountTrigger = button(root, 'Commander Ranger')
    expect(accountTrigger.getAttribute('aria-expanded')).toBe('false')
    expect(button(root, 'Local Battle')).toBeTruthy()
    expect(button(root, 'Play Online')).toBeTruthy()
    accountTrigger.click()
    await Promise.resolve()
    const openTrigger = button(root, 'Commander Ranger')
    expect(openTrigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(root.querySelector('.lobby-overlay__close'))
    button(root, 'Close').click()
    const restoredTrigger = button(root, 'Commander Ranger')
    expect(restoredTrigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(restoredTrigger)
    restoredTrigger.click()
    button(root, 'Sign out').click()
    expect(account.signOut).toHaveBeenCalledOnce()
    root.remove()
  })

  it('delegates a progression refresh to the persistent account owner', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })

    await lobby.refreshAccount()

    expect(account.refresh).toHaveBeenCalledOnce()
  })

  it('delegates one hot-seat result to the persistent account owner', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })
    const result = {
      matchId: '00000000-0000-4000-8000-000000000071',
      won: true,
    }

    await expect(lobby.recordHotSeatMatch(result)).resolves.toMatchObject({
      prior: { totalXp: 0 },
      current: { totalXp: 200 },
    })

    expect(account.recordHotSeatMatch).toHaveBeenCalledWith(result)
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
    button(root, 'Local Battle').click()
    expect(button(root, 'Deploy local battle')).toBeTruthy()
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
