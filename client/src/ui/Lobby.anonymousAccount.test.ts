import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountCredentials,
  AccountMode,
  AccountState,
} from '../client/AccountSession'
import type {
  DiagnosticCheckResult,
  ProductionDiagnostics,
  ProductionDiagnosticsReadiness,
  ProductionDiagnosticsState,
} from '../client/ProductionDiagnostics'
import { Lobby, type AccountSessionPort } from './Lobby'

class FakeAccountSession implements AccountSessionPort {
  state: AccountState
  readonly initialize = vi.fn(async () => undefined)
  readonly submit = vi.fn(async (_mode: AccountMode, _credentials: AccountCredentials) => undefined)
  readonly signOut = vi.fn(async () => undefined)
  readonly refresh = vi.fn(async () => undefined)
  readonly recordHotSeatMatch = vi.fn(async () => null)

  constructor(
    private readonly onChange: (state: AccountState) => void,
    initialState: AccountState = { status: 'anonymous', busy: false, error: '' },
  ) {
    this.state = initialState
  }

  emit(state: AccountState): void {
    this.state = state
    this.onChange(state)
  }
}

const DIAGNOSTIC_ID = 'verified-replay-runtime' as const

class FakeProductionDiagnostics implements ProductionDiagnostics {
  state: ProductionDiagnosticsState = { status: 'anonymous' }
  readonly runChecks = vi.fn(async (): Promise<DiagnosticCheckResult> => ({
    id: DIAGNOSTIC_ID,
    label: 'Verified replay runtime',
    status: 'FAIL',
    code: 'request_failed',
  }))
  readonly setReadiness = vi.fn((readiness: ProductionDiagnosticsReadiness) => {
    if (readiness !== 'authenticated') this.state = { status: readiness }
    else if (this.state.status !== 'PASS' && this.state.status !== 'FAIL') this.state = { status: 'IDLE' }
  })
  readonly dispose = vi.fn(() => {
    this.state = { status: 'disposed' }
  })
}

type DiagnosticsFactory = () => ProductionDiagnostics | Promise<ProductionDiagnostics>
type LobbyWithDiagnostics = new (
  root: HTMLElement,
  onReady: (config: unknown) => void,
  createAccountSession: (onChange: (state: AccountState) => void) => AccountSessionPort,
  createDiagnostics: DiagnosticsFactory,
) => Lobby

function createLobbyWithDiagnostics(
  root: HTMLElement,
  accountFactory: (onChange: (state: AccountState) => void) => AccountSessionPort,
  diagnosticsFactory: DiagnosticsFactory,
): Lobby {
  // Keep Task 7 executable as runtime RED while T8 introduces the fourth seam.
  const Constructor = Lobby as unknown as LobbyWithDiagnostics
  return new Constructor(root, vi.fn(), accountFactory, diagnosticsFactory)
}

function authenticatedState(): AccountState {
  return {
    status: 'authenticated',
    busy: false,
    error: '',
    profile: { id: 'user-1', displayName: 'Ranger', summary: null },
  }
}

let initialUrl = ''

beforeEach(() => {
  initialUrl = window.location.href
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', initialUrl)
  document.body.replaceChildren()
})

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

  it.each([
    ['anonymous', { status: 'anonymous', busy: false, error: '' } satisfies AccountState],
    ['authenticated error', { status: 'authenticated-error', busy: false, error: 'redacted', userId: 'user-1' } satisfies AccountState],
  ])('opens the existing account overlay for %s without losing diagnostics intent', async (_label, initialState) => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1&keep=1#deck')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => new FakeAccountSession(onChange, initialState),
      () => diagnostics,
    )

    lobby.show()
    const diagnosticsOverlay = root.querySelector<HTMLElement>('[aria-label="Production diagnostics"]')
    if (!diagnosticsOverlay) throw new Error('Missing diagnostics overlay')
    const accountButton = [...diagnosticsOverlay.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent === 'Open Account' || candidate.textContent === 'Review Account')
    if (!accountButton) throw new Error('Missing diagnostics account handoff')
    accountButton.click()

    expect(root.querySelector('[aria-label="Player account"]')).not.toBeNull()
    expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
    expect(root.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(window.location.search).toContain('diagnostics=1')
    expect(diagnostics.dispose).not.toHaveBeenCalled()

    const accountClose = root.querySelector<HTMLButtonElement>('[aria-label="Player account"] .lobby-overlay__close')
    if (!accountClose) throw new Error('Missing account overlay close control')
    accountClose.click()
    expect(root.querySelector('[aria-label="Production diagnostics"]')).not.toBeNull()
    expect(root.querySelector('[aria-label="Player account"]')).toBeNull()
    expect(root.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    await Promise.resolve()
    const lobbyBackground = [...root.children].find((child): child is HTMLElement => (
      child instanceof HTMLElement && !child.classList.contains('lobby-overlay')
    ))
    expect(lobbyBackground?.inert).toBe(true)
  })

  it('maps an authenticated-to-anonymous transition to signed-out and returns to diagnostics after sign-in', () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1')
    const root = document.createElement('div')
    document.body.append(root)
    let account!: FakeAccountSession
    const diagnostics = new FakeProductionDiagnostics()
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => {
        account = new FakeAccountSession(onChange, authenticatedState())
        return account
      },
      () => diagnostics,
    )

    lobby.show()
    expect(root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] .production-diagnostics')?.dataset.diagnosticsState).toBe('IDLE')
    account.emit({ status: 'anonymous', busy: false, error: '' })
    expect(diagnostics.setReadiness).toHaveBeenLastCalledWith('signed-out')
    expect(root.textContent).toContain('Account signed out')

    const accountAction = [...root.querySelectorAll<HTMLButtonElement>('[aria-label="Production diagnostics"] button')]
      .find((candidate) => candidate.textContent === 'Open Account' || candidate.textContent === 'Review Account')
    if (!accountAction) throw new Error('Missing account handoff control')
    accountAction.click()
    expect(root.querySelector('[aria-label="Player account"]')).not.toBeNull()
    account.emit(authenticatedState())
    const accountClose = root.querySelector<HTMLButtonElement>('[aria-label="Player account"] .lobby-overlay__close')
    if (!accountClose) throw new Error('Missing account overlay close control')
    accountClose.click()

    expect(root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] .production-diagnostics')?.dataset.diagnosticsState).toBe('IDLE')
    expect(diagnostics.dispose).not.toHaveBeenCalled()
    expect(root.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  })

  it('preserves ordinary account and lobby behavior when diagnostics is inactive', () => {
    window.history.replaceState(null, '', '/pregame?keep=1')
    const root = document.createElement('div')
    const diagnosticsFactory = vi.fn(() => new FakeProductionDiagnostics())
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => new FakeAccountSession(onChange),
      diagnosticsFactory,
    )

    lobby.show()
    expect(diagnosticsFactory).not.toHaveBeenCalled()
    expect(button(root, 'Local Battle')).toBeTruthy()
    expect(button(root, 'Play Online')).toBeTruthy()
    button(root, 'Account').click()
    expect(root.querySelector('[aria-label="Player account"]')).not.toBeNull()
    expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
  })
})
