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
const DIAGNOSTIC_LABEL = 'Verified replay runtime'

class FakeProductionDiagnostics implements ProductionDiagnostics {
  state: ProductionDiagnosticsState = { status: 'loading' }
  readonly runChecks = vi.fn(async (): Promise<DiagnosticCheckResult> => {
    const result: DiagnosticCheckResult = {
      id: DIAGNOSTIC_ID,
      label: DIAGNOSTIC_LABEL,
      status: 'FAIL',
      code: 'request_failed',
    }
    this.state = result
    return result
  })
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
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

  it('does not construct or expose diagnostics for inactive or malformed URL activation', () => {
    for (const value of ['0', 'true', '01', '']) {
      window.history.replaceState(null, '', `/pregame?diagnostics=${value}`)
      const root = document.createElement('div')
      const diagnosticsFactory = vi.fn(() => new FakeProductionDiagnostics())
      const lobby = createLobbyWithDiagnostics(
        root,
        (onChange) => new FakeAccountSession(onChange),
        diagnosticsFactory,
      )

      lobby.show()

      expect(diagnosticsFactory).not.toHaveBeenCalled()
      expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
      expect([...root.querySelectorAll('button')].some((candidate) => /diagnostic/i.test(candidate.textContent ?? ''))).toBe(false)
      root.replaceChildren()
    }
  })

  it('activates only on diagnostics=1 and maps account readiness into the modal', () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1')
    const root = document.createElement('div')
    document.body.append(root)
    let account!: FakeAccountSession
    const diagnostics = new FakeProductionDiagnostics()
    const diagnosticsFactory = vi.fn(() => diagnostics)
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => {
        account = new FakeAccountSession(onChange, { status: 'loading', busy: true, error: '' })
        return account
      },
      diagnosticsFactory,
    )

    lobby.show()

    expect(diagnosticsFactory).toHaveBeenCalledOnce()
    expect(diagnostics.setReadiness).toHaveBeenLastCalledWith('loading')
    expect(root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] .production-diagnostics')?.dataset.diagnosticsState).toBe('loading')

    account.emit({ status: 'anonymous', busy: false, error: '' })
    expect(diagnostics.setReadiness).toHaveBeenLastCalledWith('anonymous')
    expect(root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] .production-diagnostics')?.dataset.diagnosticsState).toBe('anonymous')
    expect(root.textContent).toContain('Open Account')

    account.emit({ status: 'authenticated-error', busy: false, error: 'redacted', userId: 'user-1' })
    expect(diagnostics.setReadiness).toHaveBeenLastCalledWith('authenticated-error')
    expect(root.textContent).toContain('Review Account')

    account.emit(authenticatedState())
    expect(diagnostics.setReadiness).toHaveBeenLastCalledWith('authenticated')
    expect(root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] .production-diagnostics')?.dataset.diagnosticsState).toBe('IDLE')
  })

  it('waits for authenticated readiness, autoruns once, and survives account rerenders', async () => {
    window.history.replaceState(null, '', '/pregame?keep=1&diagnostics=1&autorun=1#deck')
    const root = document.createElement('div')
    document.body.append(root)
    let account!: FakeAccountSession
    const diagnostics = new FakeProductionDiagnostics()
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => {
        account = new FakeAccountSession(onChange, { status: 'loading', busy: true, error: '' })
        return account
      },
      () => diagnostics,
    )

    lobby.show()
    expect(diagnostics.runChecks).not.toHaveBeenCalled()

    account.emit(authenticatedState())
    await vi.waitFor(() => expect(diagnostics.runChecks).toHaveBeenCalledOnce())
    expect(diagnostics.runChecks).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(
      root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] [data-diagnostics-state]')
        ?.dataset.diagnosticsState,
    ).toBe('FAIL'))

    account.emit(authenticatedState())
    account.emit(authenticatedState())
    await Promise.resolve()
    expect(diagnostics.runChecks).toHaveBeenCalledOnce()
    expect(diagnostics.state.status).toBe('FAIL')
    expect(root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] [data-diagnostics-state]')
      ?.dataset.diagnosticsState).toBe('FAIL')
  })

  it('cancels a pending autorun when diagnostics closes and restores focus to a live lobby control', () => {
    window.history.replaceState(null, '', '/pregame?keep=1&diagnostics=1&autorun=1#deck')
    const root = document.createElement('div')
    document.body.append(root)
    let account!: FakeAccountSession
    const diagnostics = new FakeProductionDiagnostics()
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => {
        account = new FakeAccountSession(onChange, { status: 'loading', busy: true, error: '' })
        return account
      },
      () => diagnostics,
    )

    lobby.show()
    const detachedControl = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent === 'Local Battle')
    if (!detachedControl) throw new Error('Missing Local Battle control')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    root.querySelector<HTMLButtonElement>('[aria-label="Production diagnostics"] .lobby-overlay__close')?.click()
    account.emit(authenticatedState())

    expect(diagnostics.runChecks).not.toHaveBeenCalled()
    expect(diagnostics.dispose).toHaveBeenCalledOnce()
    expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
    expect(root.querySelectorAll('[role="dialog"]')).toHaveLength(0)
    expect(root.querySelector('.lobby-card')?.hasAttribute('inert')).toBe(false)
    expect(detachedControl.isConnected).toBe(false)
    expect(document.activeElement).toBe([...root.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Local Battle'))
    expect(window.location.pathname).toBe('/pregame')
    expect(window.location.search).toBe('?keep=1')
    expect(window.location.hash).toBe('#deck')
    expect(replaceState).toHaveBeenCalledOnce()
  })

  it('supports a pending lazy diagnostics factory without duplicate overlays or base-card replacement', async () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    let resolveFactory!: (value: ProductionDiagnostics) => void
    const factoryPromise = new Promise<ProductionDiagnostics>((resolve) => { resolveFactory = resolve })
    const diagnosticsFactory = vi.fn(() => factoryPromise)
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => new FakeAccountSession(onChange, authenticatedState()),
      diagnosticsFactory,
    )

    lobby.show()
    expect(diagnosticsFactory).toHaveBeenCalledOnce()
    resolveFactory(diagnostics)

    await vi.waitFor(() => expect(root.querySelector('[aria-label="Production diagnostics"]')).not.toBeNull())
    expect(root.querySelectorAll('.lobby-card')).toHaveLength(1)
    expect(root.querySelectorAll('.lobby-overlay')).toHaveLength(1)
    expect(root.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  })

  it('disposes a lazy diagnostics instance that resolves after the console closes', async () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1&keep=1')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    const factory = deferred<ProductionDiagnostics>()
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => new FakeAccountSession(onChange, authenticatedState()),
      () => factory.promise,
    )

    lobby.show()
    button(root, 'Close').click()
    factory.resolve(diagnostics)
    await Promise.resolve()
    await Promise.resolve()

    expect(diagnostics.dispose).toHaveBeenCalledOnce()
    expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
    expect(window.location.search).toBe('?keep=1')
  })

  it('ignores a diagnostics run rejection after close and keeps the console disposed', async () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1&keep=1')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    const run = deferred<DiagnosticCheckResult>()
    diagnostics.runChecks.mockImplementationOnce(() => {
      diagnostics.state = { status: 'RUNNING' }
      return run.promise
    })
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => new FakeAccountSession(onChange, authenticatedState()),
      () => diagnostics,
    )

    lobby.show()
    button(root, 'Run checks').click()
    button(root, 'Close').click()
    run.reject(new Error('late-run-secret'))
    await Promise.resolve()
    await Promise.resolve()

    expect(diagnostics.dispose).toHaveBeenCalledOnce()
    expect(diagnostics.state).toEqual({ status: 'disposed' })
    expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
    expect(window.location.search).toBe('?keep=1')
  })

  it.each(['resolve', 'reject'] as const)('ignores a pending clipboard %s after close', async (settlement) => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1&keep=1')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    diagnostics.state = {
      id: DIAGNOSTIC_ID,
      label: DIAGNOSTIC_LABEL,
      status: 'FAIL',
      code: 'request_failed',
    }
    const copy = deferred<void>()
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => copy.promise) },
    })

    try {
      const lobby = createLobbyWithDiagnostics(
        root,
        (onChange) => new FakeAccountSession(onChange, authenticatedState()),
        () => diagnostics,
      )
      lobby.show()
      button(root, 'Copy receipt').click()
      button(root, 'Close').click()
      if (settlement === 'resolve') copy.resolve()
      else copy.reject(new Error('late-clipboard-secret'))
      await Promise.resolve()
      await Promise.resolve()

      expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
      expect(root.textContent).not.toContain('Receipt copied')
      expect(root.textContent).not.toContain('Receipt copy failed')
      expect(window.location.search).toBe('?keep=1')
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
      else delete (navigator as unknown as { clipboard?: unknown }).clipboard
    }
  })

  it('reports clipboard rejection locally without changing the terminal receipt', async () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    diagnostics.state = { id: DIAGNOSTIC_ID, label: DIAGNOSTIC_LABEL, status: 'FAIL', code: 'request_failed' }
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error('clipboard-secret') }) },
    })

    try {
      const lobby = createLobbyWithDiagnostics(
        root,
        (onChange) => new FakeAccountSession(onChange, authenticatedState()),
        () => diagnostics,
      )
      lobby.show()
      button(root, 'Copy receipt').click()
      await vi.waitFor(() => expect(root.textContent).toContain('Receipt copy failed'))
      expect(diagnostics.state).toMatchObject({ status: 'FAIL', code: 'request_failed' })
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
      else delete (navigator as unknown as { clipboard?: unknown }).clipboard
    }
  })

  it('closes and disposes diagnostics even when history replacement throws', () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => new FakeAccountSession(onChange, authenticatedState()),
      () => diagnostics,
    )
    lobby.show()
    vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => { throw new Error('history failure') })

    button(root, 'Close').click()

    expect(diagnostics.dispose).toHaveBeenCalledOnce()
    expect(root.querySelector('[aria-label="Production diagnostics"]')).toBeNull()
  })

  it('wires the manual run and copies only the sanitized receipt through the lobby integration', async () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1')
    const root = document.createElement('div')
    document.body.append(root)
    const diagnostics = new FakeProductionDiagnostics()
    const writeText = vi.fn(async (_text: string) => undefined)
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    try {
      const lobby = createLobbyWithDiagnostics(
        root,
        (onChange) => new FakeAccountSession(onChange, authenticatedState()),
        () => diagnostics,
      )

      lobby.show()
      const run = root.querySelector<HTMLButtonElement>('.production-diagnostics__run')
      if (!run) throw new Error('Missing diagnostics run control')
      run.click()

      await vi.waitFor(() => expect(diagnostics.runChecks).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(
        root.querySelector<HTMLElement>('[aria-label="Production diagnostics"] .production-diagnostics')
          ?.dataset.diagnosticsState,
      ).toBe('FAIL'))

      const copy = root.querySelector<HTMLButtonElement>('.production-diagnostics__copy')
      if (!copy) throw new Error('Missing diagnostics copy control')
      copy.click()

      expect(writeText).toHaveBeenCalledOnce()
      expect(writeText).toHaveBeenCalledWith(JSON.stringify({
        schemaVersion: 1,
        overall: 'FAIL',
        results: [{
          id: DIAGNOSTIC_ID,
          label: DIAGNOSTIC_LABEL,
          status: 'FAIL',
          code: 'request_failed',
        }],
      }, null, 2))
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
      } else {
        delete (navigator as unknown as { clipboard?: unknown }).clipboard
      }
    }
  })
})
