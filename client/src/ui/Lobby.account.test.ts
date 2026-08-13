import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountCredentials,
  AccountMode,
  AccountState,
} from '../client/AccountSession'
import type {
  VerifiedDeploymentReceipt,
  VerifiedDeploymentStart,
} from '../client/verifiedDeployment'
import type {
  DiagnosticCheckResult,
  ProductionDiagnostics,
  ProductionDiagnosticsReadiness,
  ProductionDiagnosticsState,
} from '../client/ProductionDiagnostics'
import {
  createProductionDiagnostics,
  observeVerifiedCompletionResponseForDiagnostics,
} from '../client/ProductionDiagnostics'
import { Lobby, type AccountSessionPort, type LobbyConfig } from './Lobby'

class FakeAccountSession implements AccountSessionPort {
  state: AccountState
  readonly initialize = vi.fn(async () => undefined)
  readonly submit = vi.fn(async (_mode: AccountMode, _credentials: AccountCredentials) => undefined)
  readonly signOut = vi.fn(async () => undefined)
  readonly refresh = vi.fn(async () => undefined)
  readonly startVerifiedDeployment = vi.fn(async (): Promise<VerifiedDeploymentStart | null> => verifiedStart)
  readonly abandonVerifiedDeployment = vi.fn(async () => true)
  readonly completeVerifiedDeployment = vi.fn(async (): Promise<VerifiedDeploymentReceipt | null> => verifiedReceipt)
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

const verifiedSessionId = '00000000-0000-4000-8000-000000000061'

const verifiedStart: VerifiedDeploymentStart = {
  resumed: false,
  descriptor: {
    sessionId: verifiedSessionId,
    expiresAt: '2026-08-12T13:30:00.000Z',
    contractVersion: 1,
    engineVersion: 1,
    rulesetVersion: 3,
    limits: {
      humanSalvos: 6,
      cpuSalvos: 6,
      angle: { min: 0, max: 180 },
      power: { min: 0, max: 100 },
    },
    config: {
      seed: 17,
      options: {
        maxPlayers: 2,
        maxWind: 6,
        gravity: 0.15,
        walls: 'open',
        hazards: 'none',
        rounds: 1,
        interestRate: 0,
        suddenDeathTurn: 0,
        armsLevel: 0,
        starterWeaponFalloff: 'decisive',
        teamMode: false,
        players: [
          { name: 'Ranger', color: '#e8554d' },
          { name: 'CPU 1', color: '#3f78b8', ai: 'hard' },
        ],
      },
    },
  },
}

const verifiedReceipt: VerifiedDeploymentReceipt = {
  result: { sessionId: verifiedSessionId, won: true, outcome: 'win', verifiedXp: 200 },
  progression: {
    evidence: 'verified_replay_v1',
    prior: {
      evidence: 'verified_replay_v1', matchesPlayed: 0, wins: 0, progressionVersion: 1,
      totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500,
    },
    current: {
      evidence: 'verified_replay_v1', matchesPlayed: 1, wins: 1, progressionVersion: 1,
      totalXp: 200, level: 1, levelXp: 200, nextLevelXp: 500,
    },
  },
}

const DIAGNOSTIC_ID = 'verified-replay-runtime' as const
const DIAGNOSTIC_LABEL = 'Verified replay runtime'

class FakeProductionDiagnostics implements ProductionDiagnostics {
  state: ProductionDiagnosticsState = { status: 'loading' }
  completionRetryProbe = { status: 'idle' as const }
  pagesProvenance = { status: 'idle' as const }
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
  readonly armCompletionRetryProbe = vi.fn(() => true)
  readonly runPagesProvenance = vi.fn(async () => ({ status: 'PASS' as const, sha: 'a'.repeat(40), runId: '1' }))
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

function authenticatedState(): Extract<AccountState, { status: 'authenticated' }> {
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
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
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

  it('cancels an armed completion fault when authenticated account identity changes directly', () => {
    window.history.replaceState(null, '', '/pregame?diagnostics=1')
    const root = document.createElement('div')
    document.body.append(root)
    let account!: FakeAccountSession
    const diagnostics = createProductionDiagnostics({ functions: { invoke: vi.fn() } } as never)
    const lobby = createLobbyWithDiagnostics(
      root,
      (onChange) => {
        account = new FakeAccountSession(onChange, authenticatedState())
        return account
      },
      () => diagnostics,
    )
    lobby.show()
    expect(diagnostics.armCompletionRetryProbe()).toBe(true)

    account.emit({
      ...authenticatedState(),
      profile: { ...authenticatedState().profile, id: 'user-2' },
    })

    expect(diagnostics.completionRetryProbe).toEqual({ status: 'idle' })
    expect(observeVerifiedCompletionResponseForDiagnostics(
      verifiedSessionId,
      [{ angle: 37, power: 64 }],
      verifiedReceipt,
    )).toBe(false)
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

  it('prefills online create and join identity from an initially authenticated profile', () => {
    const root = document.createElement('div')
    const lobby = new Lobby(
      root,
      vi.fn(),
      (onChange) => new FakeAccountSession(onChange, authenticatedState()),
    )
    lobby.show()

    button(root, 'Play Online').click()
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Ranger')

    button(root, 'Join with a code').click()
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Ranger')
  })

  it('adopts a later authenticated profile but never overwrites a player-edited online name', () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange)
      return account
    })
    lobby.show()
    button(root, 'Play Online').click()
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('')

    account.emit(authenticatedState())
    const name = root.querySelector<HTMLInputElement>('.lobby-name')!
    expect(name.value).toBe('Ranger')
    name.value = 'Room Ranger'
    name.dispatchEvent(new Event('input', { bubbles: true }))

    account.emit({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger Prime', summary: null },
    })
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Room Ranger')

    account.emit({ status: 'anonymous', busy: false, error: '' })
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Room Ranger')
  })

  it('tracks profile changes while derived and clears account presentation data on sign-out', () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    lobby.show()
    button(root, 'Play Online').click()

    account.emit({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger Prime', summary: null },
    })
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Ranger Prime')

    account.emit({ status: 'anonymous', busy: false, error: '' })
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('')
  })

  it('clears a profile-derived name when authenticated profile ownership becomes uncertain', () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    lobby.show()
    button(root, 'Play Online').click()
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Ranger')

    account.emit({
      status: 'authenticated-error',
      busy: false,
      error: 'Profile unavailable.',
      userId: 'user-2',
    })

    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('')
  })

  it.each([
    ['loading', { status: 'loading', busy: false, error: '' }],
    ['unavailable', { status: 'unavailable', busy: false, error: '' }],
    ['anonymous', { status: 'anonymous', busy: false, error: '' }],
    ['authenticated-error', {
      status: 'authenticated-error', busy: false, error: 'Profile unavailable.', userId: 'user-2',
    }],
  ] as const)('clears profile-derived identity for %s without clearing a user override', (_label, nextState) => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    lobby.show()
    button(root, 'Play Online').click()
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Ranger')

    account.emit(nextState)
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('')

    account.emit(authenticatedState())
    const name = root.querySelector<HTMLInputElement>('.lobby-name')!
    name.value = 'Chosen Ranger'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    account.emit(nextState)
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe('Chosen Ranger')
  })

  it('shows an over-limit account name intact so the player can correct it explicitly', () => {
    const root = document.createElement('div')
    const displayName = 'Commander Longname 1234'
    const lobby = new Lobby(root, vi.fn(), (onChange) => new FakeAccountSession(onChange, {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName, summary: null },
    }))
    lobby.show()
    button(root, 'Play Online').click()

    expect(displayName.length).toBeGreaterThan(20)
    expect(root.querySelector<HTMLInputElement>('.lobby-name')?.value).toBe(displayName)
  })

  it('owns the active countdown and derives exact five-minute and one-minute warnings from server expiry', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })

    await expect(lobby.startVerifiedDeployment(Date.parse('2026-08-12T13:24:59.999Z')))
      .resolves.toEqual(verifiedStart)
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'active',
      transcript: [],
      deadline: { remainingMs: 300_001, warning: 'none', acceptsInput: true, canComplete: true },
    })

    lobby.refreshVerifiedDeploymentDeadline(Date.parse('2026-08-12T13:25:00.000Z'))
    expect(lobby.verifiedDeployment).toMatchObject({ status: 'active', deadline: { warning: 'five-minutes' } })
    lobby.refreshVerifiedDeploymentDeadline(Date.parse('2026-08-12T13:29:00.000Z'))
    expect(lobby.verifiedDeployment).toMatchObject({ status: 'active', deadline: { warning: 'one-minute' } })
    expect(account.startVerifiedDeployment).toHaveBeenCalledOnce()
  })

  it('retains terminal evidence and retries completion only before expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:00:00.000Z'))
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      account.completeVerifiedDeployment
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(verifiedReceipt)
      return account
    })
    await lobby.startVerifiedDeployment(Date.parse('2026-08-12T13:00:00.000Z'))
    expect(lobby.recordVerifiedDeploymentFire(
      { angle: 37, power: 64 },
      Date.parse('2026-08-12T13:01:00.000Z'),
    )).toBe(true)

    await expect(lobby.completeVerifiedDeployment(Date.parse('2026-08-12T13:10:00.000Z')))
      .resolves.toBeNull()
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'retryable',
      transcript: [{ angle: 37, power: 64 }],
      error: 'Verification is pending. Retry before the deployment deadline.',
    })
    expect(JSON.parse(localStorage.getItem('singedterra:verified-deployment')!)).toMatchObject({
      storageVersion: 2,
      deployments: [{
        transcript: [{ angle: 37, power: 64 }],
        terminal: true,
      }],
    })

    await expect(lobby.retryVerifiedDeploymentCompletion(Date.parse('2026-08-12T13:20:00.000Z')))
      .resolves.toEqual(verifiedReceipt)
    expect(lobby.verifiedDeployment).toEqual({ status: 'verified', receipt: verifiedReceipt })
    expect(account.completeVerifiedDeployment).toHaveBeenCalledTimes(2)
    expect(account.completeVerifiedDeployment).toHaveBeenNthCalledWith(
      1,
      verifiedSessionId,
      [{ angle: 37, power: 64 }],
    )
  })

  it('freezes a failed deferred completion when Date.now crosses expiry during the request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:29:59.000Z'))
    const completion = deferred<VerifiedDeploymentReceipt | null>()
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      account.completeVerifiedDeployment.mockReturnValueOnce(completion.promise)
      return account
    })
    await lobby.startVerifiedDeployment()
    expect(lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 })).toBe(true)

    const pending = lobby.completeVerifiedDeployment()
    await Promise.resolve()
    expect(lobby.verifiedDeployment.status).toBe('completion-pending')
    vi.setSystemTime(Date.parse(verifiedStart.descriptor.expiresAt))
    completion.resolve(null)

    await expect(pending).resolves.toBeNull()
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'expired',
      transcript: [{ angle: 37, power: 64 }],
      deadline: { remainingMs: 0, warning: 'expired', acceptsInput: false, canComplete: false },
      choices: ['continue-casual', 'return-to-battery'],
    })
    await expect(lobby.retryVerifiedDeploymentCompletion()).resolves.toBeNull()
    expect(account.completeVerifiedDeployment).toHaveBeenCalledOnce()
  })

  it('freezes a failed deferred abandon when Date.now crosses expiry during the request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:29:59.000Z'))
    const abandonment = deferred<boolean>()
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      account.abandonVerifiedDeployment
        .mockReturnValueOnce(abandonment.promise)
        .mockResolvedValue(false)
      return account
    })
    await lobby.startVerifiedDeployment()
    expect(lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 })).toBe(true)

    const pending = lobby.abandonVerifiedDeployment()
    await Promise.resolve()
    vi.setSystemTime(Date.parse(verifiedStart.descriptor.expiresAt))
    abandonment.resolve(false)

    await expect(pending).resolves.toBe(false)
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'expired',
      transcript: [{ angle: 37, power: 64 }],
      deadline: { remainingMs: 0, warning: 'expired', acceptsInput: false, canComplete: false },
      choices: ['continue-casual', 'return-to-battery'],
    })
    await expect(lobby.abandonVerifiedDeployment()).resolves.toBe(false)
    expect(account.abandonVerifiedDeployment).toHaveBeenCalledOnce()
  })

  it('freezes verified input and completion at expiry with only explicit casual or Battery choices', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    await lobby.startVerifiedDeployment(Date.parse('2026-08-12T13:00:00.000Z'))
    expect(lobby.recordVerifiedDeploymentFire(
      { angle: 37, power: 64 },
      Date.parse('2026-08-12T13:01:00.000Z'),
    )).toBe(true)

    lobby.refreshVerifiedDeploymentDeadline(Date.parse(verifiedStart.descriptor.expiresAt))
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'expired',
      transcript: [{ angle: 37, power: 64 }],
      deadline: { remainingMs: 0, warning: 'expired', acceptsInput: false, canComplete: false },
      choices: ['continue-casual', 'return-to-battery'],
    })
    expect(lobby.recordVerifiedDeploymentFire(
      { angle: 91, power: 100 },
      Date.parse(verifiedStart.descriptor.expiresAt),
    )).toBe(false)
    await expect(lobby.completeVerifiedDeployment(Date.parse(verifiedStart.descriptor.expiresAt)))
      .resolves.toBeNull()
    expect(account.completeVerifiedDeployment).not.toHaveBeenCalled()

    expect(lobby.continueVerifiedDeploymentCasually()).toBe(true)
    expect(lobby.verifiedDeployment).toEqual({ status: 'casual' })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBeNull()
  })

  it('returns an expired deployment to the Battery only through the explicit choice', async () => {
    const root = document.createElement('div')
    const lobby = new Lobby(
      root,
      vi.fn(),
      (onChange) => new FakeAccountSession(onChange, authenticatedState()),
    )
    await lobby.startVerifiedDeployment(Date.parse('2026-08-12T13:00:00.000Z'))
    lobby.refreshVerifiedDeploymentDeadline(Date.parse(verifiedStart.descriptor.expiresAt))

    expect(lobby.returnVerifiedDeploymentToBattery()).toBe(true)
    expect(lobby.verifiedDeployment).toEqual({ status: 'idle' })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBeNull()
  })

  it('freezes an owner deployment across sign-out or account switch and never completes it as the new account', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    await lobby.startVerifiedDeployment(Date.parse('2026-08-12T13:00:00.000Z'))
    lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 }, Date.parse('2026-08-12T13:01:00.000Z'))

    account.emit({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-2', displayName: 'Other Ranger', summary: null },
    })

    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'frozen',
      descriptor: verifiedStart.descriptor,
      transcript: [{ angle: 37, power: 64 }],
      error: 'Return to the deployment owner account to resume verification.',
    })
    expect(localStorage.getItem('singedterra:verified-deployment')).not.toBeNull()
    await expect(lobby.completeVerifiedDeployment(Date.parse('2026-08-12T13:10:00.000Z')))
      .resolves.toBeNull()
    expect(account.completeVerifiedDeployment).not.toHaveBeenCalled()
  })

  it('recovers account A after account B refreshes and starts a separate deployment', async () => {
    const ownerDescriptor = verifiedStart.descriptor
    const otherDescriptor = {
      ...ownerDescriptor,
      sessionId: '00000000-0000-4000-8000-000000000062',
      config: { ...ownerDescriptor.config, seed: 42 as const },
    }
    const ownerRoot = document.createElement('div')
    let ownerAccount!: FakeAccountSession
    const ownerLobby = new Lobby(ownerRoot, vi.fn(), (onChange) => {
      ownerAccount = new FakeAccountSession(onChange, authenticatedState())
      return ownerAccount
    })
    await ownerLobby.startVerifiedDeployment(Date.parse('2026-08-12T13:00:00.000Z'))
    expect(ownerLobby.recordVerifiedDeploymentFire(
      { angle: 37, power: 64 },
      Date.parse('2026-08-12T13:01:00.000Z'),
    )).toBe(true)

    const otherRoot = document.createElement('div')
    let otherAccount!: FakeAccountSession
    const otherLobby = new Lobby(otherRoot, vi.fn(), (onChange) => {
      otherAccount = new FakeAccountSession(onChange, {
        status: 'authenticated', busy: false, error: '',
        profile: { id: 'user-2', displayName: 'Other Ranger', summary: null },
      })
      otherAccount.startVerifiedDeployment.mockResolvedValue({
        resumed: false,
        descriptor: otherDescriptor,
      })
      return otherAccount
    })
    await otherLobby.startVerifiedDeployment(Date.parse('2026-08-12T13:02:00.000Z'))
    expect(otherLobby.recordVerifiedDeploymentFire(
      { angle: 91, power: 80 },
      Date.parse('2026-08-12T13:03:00.000Z'),
    )).toBe(true)

    const refreshedOwnerRoot = document.createElement('div')
    let refreshedOwnerAccount!: FakeAccountSession
    const refreshedOwnerLobby = new Lobby(refreshedOwnerRoot, vi.fn(), (onChange) => {
      refreshedOwnerAccount = new FakeAccountSession(onChange, authenticatedState())
      refreshedOwnerAccount.startVerifiedDeployment.mockResolvedValue({
        resumed: true,
        descriptor: ownerDescriptor,
      })
      return refreshedOwnerAccount
    })
    await refreshedOwnerLobby.startVerifiedDeployment(Date.parse('2026-08-12T13:04:00.000Z'))

    expect(refreshedOwnerLobby.verifiedDeployment).toMatchObject({
      status: 'active',
      descriptor: ownerDescriptor,
      transcript: [{ angle: 37, power: 64 }],
    })
    expect(otherLobby.verifiedDeployment).toMatchObject({
      status: 'active',
      descriptor: otherDescriptor,
      transcript: [{ angle: 91, power: 80 }],
    })
  })

  it('revalidates and unfreezes only the rightful owner with the exact resumed server descriptor', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:00:00.000Z'))
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    await lobby.startVerifiedDeployment()
    lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 })
    const persisted = localStorage.getItem('singedterra:verified-deployment')

    account.emit({
      status: 'authenticated', busy: false, error: '',
      profile: { id: 'user-2', displayName: 'Other Ranger', summary: null },
    })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBe(persisted)
    account.startVerifiedDeployment.mockResolvedValueOnce({ ...verifiedStart, resumed: true })
    vi.setSystemTime(Date.parse('2026-08-12T13:10:00.000Z'))
    account.emit(authenticatedState())
    await Promise.resolve()
    await Promise.resolve()

    expect(account.startVerifiedDeployment).toHaveBeenCalledTimes(2)
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'active',
      descriptor: verifiedStart.descriptor,
      transcript: [{ angle: 37, power: 64 }],
      deadline: { remainingMs: 1_200_000, warning: 'none', acceptsInput: true, canComplete: true },
    })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBe(persisted)
  })

  it.each([
    ['session', { ...verifiedStart.descriptor, sessionId: '00000000-0000-4000-8000-000000000062' }],
    ['config', { ...verifiedStart.descriptor, config: { ...verifiedStart.descriptor.config, seed: 42 } }],
    ['version', { ...verifiedStart.descriptor, engineVersion: 2 }],
    ['expiry', { ...verifiedStart.descriptor, expiresAt: '2026-08-12T13:31:00.000Z' }],
  ])('keeps the rightful owner frozen when fresh resume has a mismatched %s identity', async (_label, descriptor) => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:00:00.000Z'))
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    await lobby.startVerifiedDeployment()
    lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 })
    const persisted = localStorage.getItem('singedterra:verified-deployment')
    account.emit({
      status: 'authenticated', busy: false, error: '',
      profile: { id: 'user-2', displayName: 'Other Ranger', summary: null },
    })
    account.startVerifiedDeployment.mockResolvedValueOnce({ resumed: true, descriptor } as never)
    account.emit(authenticatedState())
    await Promise.resolve()
    await Promise.resolve()

    expect(account.startVerifiedDeployment).toHaveBeenCalledTimes(2)
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'frozen',
      descriptor: verifiedStart.descriptor,
      transcript: [{ angle: 37, power: 64 }],
      error: 'Return to the deployment owner account to resume verification.',
    })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBe(persisted)
  })

  it('keeps the rightful owner frozen and contains a fresh resume error', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:00:00.000Z'))
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    await lobby.startVerifiedDeployment()
    lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 })
    const persisted = localStorage.getItem('singedterra:verified-deployment')
    account.emit({
      status: 'authenticated', busy: false, error: '',
      profile: { id: 'user-2', displayName: 'Other Ranger', summary: null },
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    account.startVerifiedDeployment.mockRejectedValueOnce(
      new Error('supabase echoed Bearer private-token and user id'),
    )
    account.emit(authenticatedState())
    await Promise.resolve()
    await Promise.resolve()

    expect(account.startVerifiedDeployment).toHaveBeenCalledTimes(2)
    expect(lobby.verifiedDeployment).toMatchObject({
      status: 'frozen',
      descriptor: verifiedStart.descriptor,
      transcript: [{ angle: 37, power: 64 }],
      error: 'Return to the deployment owner account to resume verification.',
    })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBe(persisted)
    expect(log).not.toHaveBeenCalled()
  })

  it('refuses unsupported descriptor versions before persistence or completion', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      account.startVerifiedDeployment.mockResolvedValue({
        ...verifiedStart,
        descriptor: { ...verifiedStart.descriptor, contractVersion: 2 },
      } as never)
      return account
    })

    await expect(lobby.startVerifiedDeployment(Date.parse('2026-08-12T13:00:00.000Z')))
      .resolves.toBeNull()
    expect(lobby.verifiedDeployment).toEqual({
      status: 'failed',
      error: 'Verified deployment is unavailable. Try again.',
    })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBeNull()
    await expect(lobby.completeVerifiedDeployment(Date.parse('2026-08-12T13:10:00.000Z')))
      .resolves.toBeNull()
    expect(account.completeVerifiedDeployment).not.toHaveBeenCalled()
  })

  it('abandons only the exact active owner session and clears local recovery after acceptance', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:00:00.000Z'))
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    await lobby.startVerifiedDeployment(Date.parse('2026-08-12T13:00:00.000Z'))
    lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 }, Date.parse('2026-08-12T13:01:00.000Z'))

    await expect(lobby.abandonVerifiedDeployment()).resolves.toBe(true)
    expect(account.abandonVerifiedDeployment).toHaveBeenCalledWith(verifiedSessionId)
    expect(lobby.verifiedDeployment).toEqual({ status: 'idle' })
    expect(localStorage.getItem('singedterra:verified-deployment')).toBeNull()
  })

  it.each([
    { status: 'anonymous', busy: false, error: '' },
    { status: 'loading', busy: false, error: '' },
    { status: 'unavailable', busy: false, error: '' },
    { status: 'authenticated-error', busy: false, error: 'Account unavailable.', userId: 'user-1' },
  ] as const)('keeps casual deployment but exposes no false verified launch for $status', (state) => {
    const root = document.createElement('div')
    const lobby = new Lobby(
      root,
      vi.fn(),
      (onChange) => new FakeAccountSession(onChange, state),
    )
    lobby.show()
    button(root, 'Local Battle').click()

    expect(button(root, 'Deploy local battle').disabled).toBe(false)
    expect(root.querySelector('.lobby-verified-deployment')).toBeNull()
    expect([...root.querySelectorAll('button')].some((candidate) =>
      candidate.textContent?.toLowerCase().includes('verified deployment'))).toBe(false)
  })

  it('launches authenticated verified play from the server descriptor without identity re-entry or local-setting leakage', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:00:00.000Z'))
    const root = document.createElement('div')
    const onReady = vi.fn<(config: LobbyConfig) => void>()
    let account!: FakeAccountSession
    const lobby = new Lobby(root, onReady, (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    const localSettings = (lobby as unknown as { settings: Record<string, string> }).settings
    Object.assign(localSettings, {
      maxWind: '10', gravity: '0.4', walls: 'wrap', hazards: 'sinkholes', seed: '999',
      rounds: '9', interestRate: '0.5', suddenDeathTurn: '2', armsLevel: '4', teamMode: 'true',
    })
    lobby.show()
    button(root, 'Local Battle').click()

    const verified = root.querySelector<HTMLElement>('.lobby-verified-deployment')!
    expect(verified.querySelector('input')).toBeNull()
    expect(verified.textContent).toContain('Commander Ranger versus deterministic CPU')
    button(root, 'Start verified deployment').click()
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce())

    expect(account.startVerifiedDeployment).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledWith({
      mode: 'hotseat',
      players: verifiedStart.descriptor.config.options.players,
      playerNames: ['Ranger', 'CPU 1'],
      settings: {
        seed: 17,
        maxWind: 6,
        gravity: 0.15,
        walls: 'open',
        hazards: 'none',
        rounds: 1,
        interestRate: 0,
        suddenDeathTurn: 0,
        armsLevel: 0,
        teamMode: false,
        rulesetVersion: 3,
      },
      verifiedDeployment: {
        descriptor: verifiedStart.descriptor,
        transcript: [],
      },
    })
  })

  it('offers one recovered resume and requires explicit abandon confirmation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-08-12T13:00:00.000Z'))
    const root = document.createElement('div')
    const onReady = vi.fn<(config: LobbyConfig) => void>()
    let account!: FakeAccountSession
    const lobby = new Lobby(root, onReady, (onChange) => {
      account = new FakeAccountSession(onChange, authenticatedState())
      return account
    })
    await lobby.startVerifiedDeployment()
    expect(lobby.recordVerifiedDeploymentFire({ angle: 37, power: 64 })).toBe(true)
    lobby.show()
    button(root, 'Local Battle').click()

    expect(root.querySelector('.lobby-verified-deployment')?.textContent)
      .toContain('Recovered 1 of 6 human salvos.')
    button(root, 'Resume verified deployment').click()
    expect(onReady.mock.calls[0]?.[0].verifiedDeployment?.transcript)
      .toEqual([{ angle: 37, power: 64 }])

    button(root, 'Abandon verified deployment').click()
    expect(account.abandonVerifiedDeployment).not.toHaveBeenCalled()
    expect(button(root, 'Confirm abandon')).toBeInstanceOf(HTMLButtonElement)
    button(root, 'Keep deployment').click()
    expect(account.abandonVerifiedDeployment).not.toHaveBeenCalled()
    button(root, 'Abandon verified deployment').click()
    button(root, 'Confirm abandon').click()
    await vi.waitFor(() => {
      expect(account.abandonVerifiedDeployment).toHaveBeenCalledOnce()
      expect(root.querySelector('.lobby-verified-deployment')?.textContent)
        .toContain('Start verified deployment')
    })
  })

  it('keeps an authenticated busy state disabled and contains launch refusal copy', async () => {
    const root = document.createElement('div')
    let account!: FakeAccountSession
    const lobby = new Lobby(root, vi.fn(), (onChange) => {
      account = new FakeAccountSession(onChange, {
        ...authenticatedState(),
        busy: true,
      })
      return account
    })
    lobby.show()
    button(root, 'Local Battle').click()

    expect(button(root, 'Verified deployment busy').disabled).toBe(true)
    expect(button(root, 'Deploy local battle').disabled).toBe(false)
    expect(account.startVerifiedDeployment).not.toHaveBeenCalled()

    account.emit(authenticatedState())
    account.startVerifiedDeployment.mockRejectedValueOnce(
      new Error('Bearer private-token database detail'),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    button(root, 'Start verified deployment').click()
    await vi.waitFor(() => expect(root.querySelector('.lobby-verified-deployment')?.textContent)
      .toContain('Verified deployment is unavailable. Try again.'))
    expect(root.textContent).not.toContain('private-token')
    expect(consoleError).not.toHaveBeenCalled()
  })
})
