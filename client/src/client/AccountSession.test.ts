import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountSession,
  createSupabaseAccountBackend,
  type AccountBackend,
  type AccountSummary,
  type AccountState,
} from './AccountSession'

type AssertTrue<T extends true> = T
type IsRequiredKey<T, K extends keyof T> = {} extends Pick<T, K> ? false : true
type _accountSummaryProgressionFieldsAreRequired = [
  AssertTrue<IsRequiredKey<AccountSummary, 'progressionVersion'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'totalXp'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'level'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'levelXp'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'nextLevelXp'>>,
]
type _accountSummaryVersionIsLiteralOne = AssertTrue<AccountSummary['progressionVersion'] extends 1 ? true : false>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function backend(overrides: Partial<AccountBackend> = {}): AccountBackend {
  return {
    restoreUser: vi.fn(async () => null),
    subscribe: vi.fn(() => vi.fn()),
    signUp: vi.fn(async () => ({ id: 'user-1' })),
    signIn: vi.fn(async () => ({ id: 'user-1' })),
    signOut: vi.fn(async () => undefined),
    loadProfile: vi.fn(async () => ({ id: 'user-1', displayName: 'Ranger', summary: null })),
    ...overrides,
  }
}

describe('createSupabaseAccountBackend', () => {
  it('forwards exact signup fields and maps the owner profile without retaining credentials', async () => {
    const signUp = vi.fn(async () => ({
      data: { user: { id: 'user-7' }, session: { user: { id: 'user-7' } } },
      error: null,
    }))
    const single = vi.fn(async () => ({
      data: { id: 'user-7', display_name: 'Ash Walker' },
      error: null,
    }))
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    const client = {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signUp,
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({ select })),
      functions: {
        invoke: vi.fn(async () => ({ data: null, error: { message: 'summary unavailable' } })),
      },
    }
    const gateway = createSupabaseAccountBackend(client as never)

    const user = await gateway.signUp({
      displayName: ' Ash Walker ',
      email: 'ash@example.test',
      password: 'not-a-real-secret',
    })
    const profile = await gateway.loadProfile(user.id)

    expect(signUp).toHaveBeenCalledWith({
      email: 'ash@example.test',
      password: 'not-a-real-secret',
      options: { data: { display_name: 'Ash Walker' } },
    })
    expect(client.from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('id, display_name')
    expect(eq).toHaveBeenCalledWith('id', 'user-7')
    expect(profile).toEqual({ id: 'user-7', displayName: 'Ash Walker', summary: null })
  })

  it.each([
    ['non-boundary progress', {
      matchesPlayed: 2,
      wins: 1,
      progressionVersion: 1,
      totalXp: 300,
      level: 1,
      levelXp: 300,
      nextLevelXp: 500,
    }],
    ['level boundary', {
      matchesPlayed: 4,
      wins: 1,
      progressionVersion: 1,
      totalXp: 500,
      level: 2,
      levelXp: 0,
      nextLevelXp: 500,
    }],
  ] as const)('loads an exact %s summary through the authenticated client without a request body', async (_label, summary) => {
    const invoke = vi.fn(async (..._args: unknown[]) => ({
      data: summary,
      error: null,
    }))
    const client = {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'user-7', display_name: 'Ash Walker' },
              error: null,
            })),
          })),
        })),
      })),
      functions: { invoke },
    }
    const gateway = createSupabaseAccountBackend(client as never)

    await expect(gateway.loadProfile('user-7')).resolves.toEqual({
      id: 'user-7',
      displayName: 'Ash Walker',
      summary,
    })
    expect(invoke.mock.calls).toEqual([['account_summary']])
  })

  const validSummary = {
    matchesPlayed: 7,
    wins: 3,
    progressionVersion: 1,
    totalXp: 1000,
    level: 3,
    levelXp: 0,
    nextLevelXp: 500,
  }

  it.each([
    ['returned function error', { data: null, error: { message: 'summary unavailable' } }],
    ['an unknown progression version', { data: { ...validSummary, progressionVersion: 2 }, error: null }],
    ['a missing summary key', { data: { matchesPlayed: 7, wins: 3, progressionVersion: 1, totalXp: 1000, level: 3, levelXp: 0 }, error: null }],
    ['an extra summary key', { data: { ...validSummary, userId: 'user-7' }, error: null }],
    ['a fractional match count', {
      data: { matchesPlayed: 7.5, wins: 3, progressionVersion: 1, totalXp: 1050, level: 3, levelXp: 50, nextLevelXp: 500 },
      error: null,
    }],
    ['a fractional win count', {
      data: { matchesPlayed: 7, wins: 1.5, progressionVersion: 1, totalXp: 850, level: 2, levelXp: 350, nextLevelXp: 500 },
      error: null,
    }],
    ['a negative win count', {
      data: { matchesPlayed: 7, wins: -1, progressionVersion: 1, totalXp: 600, level: 2, levelXp: 100, nextLevelXp: 500 },
      error: null,
    }],
    ['an unsafe match count and derived total', {
      data: {
        matchesPlayed: Number.MAX_SAFE_INTEGER,
        wins: 0,
        progressionVersion: 1,
        totalXp: Number.MAX_SAFE_INTEGER * 100,
        level: Math.floor((Number.MAX_SAFE_INTEGER * 100) / 500) + 1,
        levelXp: (Number.MAX_SAFE_INTEGER * 100) % 500,
        nextLevelXp: 500,
      },
      error: null,
    }],
    ['a NaN total XP', { data: { ...validSummary, totalXp: Number.NaN }, error: null }],
    ['an infinite level', { data: { ...validSummary, level: Number.POSITIVE_INFINITY }, error: null }],
    ['wins above matches', {
      data: { matchesPlayed: 7, wins: 8, progressionVersion: 1, totalXp: 1500, level: 4, levelXp: 0, nextLevelXp: 500 },
      error: null,
    }],
    ['an inconsistent total XP', { data: { ...validSummary, totalXp: 999 }, error: null }],
    ['an incorrect level', { data: { ...validSummary, level: 2 }, error: null }],
    ['an incorrect current-level XP', { data: { ...validSummary, levelXp: 1 }, error: null }],
    ['an incorrect next-level XP', { data: { ...validSummary, nextLevelXp: 499 }, error: null }],
  ])('preserves the owner profile with a null summary for %s', async (_label, response) => {
    const client = {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'user-7', display_name: 'Ash Walker' },
              error: null,
            })),
          })),
        })),
      })),
      functions: { invoke: vi.fn(async () => response) },
    }
    const gateway = createSupabaseAccountBackend(client as never)

    await expect(gateway.loadProfile('user-7')).resolves.toEqual({
      id: 'user-7',
      displayName: 'Ash Walker',
      summary: null,
    })
  })

  it('preserves the owner profile when summary invocation throws', async () => {
    const client = {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'user-7', display_name: 'Ash Walker' },
              error: null,
            })),
          })),
        })),
      })),
      functions: {
        invoke: vi.fn(async () => { throw new Error('summary transport failed') }),
      },
    }
    const gateway = createSupabaseAccountBackend(client as never)

    await expect(gateway.loadProfile('user-7')).resolves.toEqual({
      id: 'user-7',
      displayName: 'Ash Walker',
      summary: null,
    })
  })

  it('bounds a stalled optional summary so profile restoration and sign-out remain usable', async () => {
    vi.useFakeTimers()
    const summaryStarted = deferred<void>()
    const signOut = vi.fn(async () => ({ error: null }))
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-7' } } },
          error: null,
        })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut,
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'user-7', display_name: 'Ash Walker' },
              error: null,
            })),
          })),
        })),
      })),
      functions: {
        invoke: vi.fn(() => {
          summaryStarted.resolve(undefined)
          return new Promise<never>(() => undefined)
        }),
      },
    }
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => createSupabaseAccountBackend(client as never),
    })

    try {
      const initializing = session.initialize()
      await summaryStarted.promise
      expect(vi.getTimerCount()).toBe(1)

      await vi.runAllTimersAsync()
      await initializing
      expect(session.state).toEqual({
        status: 'authenticated',
        busy: false,
        error: '',
        profile: { id: 'user-7', displayName: 'Ash Walker', summary: null },
      })

      await session.signOut()
      expect(signOut).toHaveBeenCalledOnce()
      expect(session.state).toEqual({ status: 'anonymous', busy: false, error: '' })
    } finally {
      session.dispose()
      vi.useRealTimers()
    }
  })

  it('maps restored and changed Supabase sessions and unsubscribes the listener', async () => {
    const unsubscribe = vi.fn()
    let onAuthStateChange: ((_event: string, session: { user: { id: string } } | null) => void) | undefined
    const getSession = vi.fn(async () => ({
      data: { session: { user: { id: 'restored-user' } } },
      error: null,
    }))
    const client = {
      auth: {
        getSession,
        onAuthStateChange: vi.fn((callback) => {
          onAuthStateChange = callback
          return { data: { subscription: { unsubscribe } } }
        }),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(),
    }
    const gateway = createSupabaseAccountBackend(client as never)
    const changed: Array<{ id: string } | null> = []

    expect(await gateway.restoreUser()).toEqual({ id: 'restored-user' })
    const stop = gateway.subscribe((user) => changed.push(user))
    onAuthStateChange?.('SIGNED_IN', { user: { id: 'changed-user' } })
    onAuthStateChange?.('SIGNED_OUT', null)
    stop()

    expect(changed).toEqual([{ id: 'changed-user' }, null])
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('maps password sign-in and sign-out through the Supabase auth adapter', async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: 'signed-in-user' } },
      error: null,
    }))
    const signOut = vi.fn(async () => ({ error: null }))
    const client = {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signUp: vi.fn(),
        signInWithPassword,
        signOut,
      },
      from: vi.fn(),
    }
    const gateway = createSupabaseAccountBackend(client as never)

    await expect(gateway.signIn({
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })).resolves.toEqual({ id: 'signed-in-user' })
    await expect(gateway.signOut()).resolves.toBeUndefined()

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('rejects incomplete auth responses and malformed profile rows', async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: { message: 'restore failed' } })),
        onAuthStateChange: vi.fn(),
        signUp: vi.fn(async () => ({ data: { user: { id: 'user-1' }, session: null }, error: null })),
        signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: null })),
        signOut: vi.fn(async () => ({ error: { message: 'sign-out failed' } })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'user-1', display_name: 7 }, error: null })),
          })),
        })),
      })),
    }
    const gateway = createSupabaseAccountBackend(client as never)

    await expect(gateway.restoreUser()).rejects.toThrow('restore failed')
    await expect(gateway.signUp({
      displayName: 'Ranger',
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })).rejects.toThrow('automatic sign-in')
    await expect(gateway.signIn({
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })).rejects.toThrow('did not return an account')
    await expect(gateway.signOut()).rejects.toThrow('sign-out failed')
    await expect(gateway.loadProfile('user-1')).rejects.toThrow('profile is unavailable')
  })
})

describe('AccountSession', () => {
  let states: AccountState[]

  beforeEach(() => {
    states = []
  })

  it('keeps unconfigured boot unavailable without loading Supabase', async () => {
    const loadBackend = vi.fn(async () => backend())
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => false,
      loadBackend,
    })

    await session.initialize()

    expect(loadBackend).not.toHaveBeenCalled()
    expect(session.state).toEqual({ status: 'unavailable', busy: false, error: '' })
  })

  it('restores a configured owner profile and subscribes once', async () => {
    const unsubscribe = vi.fn()
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      subscribe: vi.fn(() => unsubscribe),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })

    await session.initialize()
    await session.initialize()

    expect(source.restoreUser).toHaveBeenCalledOnce()
    expect(source.subscribe).toHaveBeenCalledOnce()
    expect(source.loadProfile).toHaveBeenCalledWith('user-1')
    expect(session.state).toEqual({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: null },
    })
    session.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('validates account input before touching the backend', async () => {
    const source = backend()
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await session.submit('create', {
      displayName: ' ',
      email: 'not-email',
      password: 'short',
    })

    expect(source.signUp).not.toHaveBeenCalled()
    expect(session.state.error).toBe('Enter a display name between 1 and 24 characters.')
  })

  it.each([
    {
      label: 'an overlong display name',
      credentials: { displayName: 'x'.repeat(25), email: 'ranger@example.test', password: 'valid-password' },
      error: 'Enter a display name between 1 and 24 characters.',
    },
    {
      label: 'a malformed email',
      credentials: { displayName: 'Ranger', email: 'not-email', password: 'valid-password' },
      error: 'Enter a valid email address.',
    },
    {
      label: 'a short password',
      credentials: { displayName: 'Ranger', email: 'ranger@example.test', password: 'short' },
      error: 'Password must be at least 8 characters.',
    },
  ])('rejects $label independently before account creation', async ({ credentials, error }) => {
    const source = backend()
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await session.submit('create', credentials)

    expect(source.signUp).not.toHaveBeenCalled()
    expect(session.state.error).toBe(error)
  })

  it.each(['A', 'x'.repeat(24)])('accepts display-name boundary %s', async (displayName) => {
    const source = backend()
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await session.submit('create', {
      displayName,
      email: 'ranger@example.test',
      password: 'valid-password',
    })

    expect(source.signUp).toHaveBeenCalledOnce()
  })

  it('creates an authenticated profile and never retains the password in state', async () => {
    const source = backend()
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await session.submit('create', {
      displayName: ' Ranger ',
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })

    expect(source.signUp).toHaveBeenCalledWith({
      displayName: 'Ranger',
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    expect(session.state.status).toBe('authenticated')
    expect(JSON.stringify(states)).not.toContain('not-a-real-secret')
  })

  it('signs in, signs out, and returns to anonymous state', async () => {
    const source = backend()
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await session.submit('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    await session.signOut()

    expect(source.signIn).toHaveBeenCalledWith({
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    expect(source.signOut).toHaveBeenCalledOnce()
    expect(session.state).toEqual({ status: 'anonymous', busy: false, error: '' })
  })

  it('rejects duplicate in-flight submissions and exposes only a bounded error', async () => {
    const pending = deferred<{ id: string }>()
    const source = backend({ signIn: vi.fn(() => pending.promise) })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    const first = session.submit('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    await session.submit('sign-in', {
      email: 'ranger@example.test',
      password: 'second-secret',
    })
    pending.resolve({ id: 'user-1' })
    await first

    expect(source.signIn).toHaveBeenCalledOnce()
    expect(JSON.stringify(states)).not.toContain('second-secret')
  })

  it('maps backend failures to an error without leaking submitted credentials', async () => {
    const source = backend({
      signIn: vi.fn(async () => { throw new Error('backend echoed not-a-real-secret') }),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await session.submit('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })

    expect(session.state.error).toBe('Account request failed. Try again.')
    expect(JSON.stringify(session.state)).not.toContain('not-a-real-secret')
  })

  it('keeps an authenticated user able to sign out when profile loading fails', async () => {
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      loadProfile: vi.fn(async () => { throw new Error('profile unavailable') }),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })

    await session.initialize()

    expect(session.state).toEqual({
      status: 'authenticated-error',
      busy: false,
      error: 'Account request failed. Try again.',
      userId: 'user-1',
    })
    await session.signOut()
    expect(source.signOut).toHaveBeenCalledOnce()
    expect(session.state.status).toBe('anonymous')
  })

  it('preserves authenticated state with a bounded error when sign-out fails', async () => {
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      signOut: vi.fn(async () => { throw new Error('sensitive backend detail') }),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await session.signOut()

    expect(session.state).toEqual({
      status: 'authenticated',
      busy: false,
      error: 'Account request failed. Try again.',
      profile: { id: 'user-1', displayName: 'Ranger', summary: null },
    })
  })

  it('surfaces initialization failure without retaining backend detail', async () => {
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => { throw new Error('sensitive initialization detail') },
    })

    await session.initialize()

    expect(session.state).toEqual({
      status: 'anonymous',
      busy: false,
      error: 'Account request failed. Try again.',
    })
  })

  it('lets a newer auth event supersede an in-flight restored user', async () => {
    let onUser: ((user: { id: string } | null) => void) | undefined
    const restored = deferred<{ id: string } | null>()
    const source = backend({
      restoreUser: vi.fn(() => restored.promise),
      subscribe: vi.fn((callback) => {
        onUser = callback
        return vi.fn()
      }),
      loadProfile: vi.fn(async (userId) => ({ id: userId, displayName: userId, summary: null })),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    const initializing = session.initialize()
    await Promise.resolve()

    onUser?.({ id: 'new-user' })
    restored.resolve({ id: 'stale-user' })
    await initializing
    await vi.waitFor(() => expect(session.state.status).toBe('authenticated'))

    expect(source.loadProfile).toHaveBeenCalledWith('new-user')
    expect(source.loadProfile).not.toHaveBeenCalledWith('stale-user')
  })

  it('refreshes profile state from auth events', async () => {
    let onUser: ((user: { id: string } | null) => void) | undefined
    const source = backend({
      subscribe: vi.fn((callback) => {
        onUser = callback
        return vi.fn()
      }),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    onUser?.({ id: 'user-1' })

    await vi.waitFor(() => {
      expect(session.state.status).toBe('authenticated')
    })
    expect(source.loadProfile).toHaveBeenCalledWith('user-1')
  })

  it('refreshes the currently authenticated profile on demand', async () => {
    const loadProfile = vi.fn<AccountBackend['loadProfile']>(async () => ({ id: 'user-1', displayName: 'Ranger', summary: null }))
    const source = backend({ loadProfile })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()
    await session.submit('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    loadProfile.mockResolvedValueOnce({
      id: 'user-1',
      displayName: 'Ranger',
      summary: {
        matchesPlayed: 2,
        wins: 1,
        progressionVersion: 1,
        totalXp: 300,
        level: 1,
        levelXp: 300,
        nextLevelXp: 500,
      },
    })

    await session.refresh()

    expect(source.loadProfile).toHaveBeenLastCalledWith('user-1')
    expect(session.state).toMatchObject({
      status: 'authenticated',
      profile: { summary: { matchesPlayed: 2, totalXp: 300 } },
    })
  })

  it('does not let an in-flight refresh overwrite sign-out', async () => {
    const loadProfile = vi.fn<AccountBackend['loadProfile']>(async () => ({ id: 'user-1', displayName: 'Ranger', summary: null }))
    const source = backend({ loadProfile })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()
    await session.submit('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    const refreshed = deferred<{ id: string; displayName: string; summary: null }>()
    loadProfile.mockImplementationOnce(() => refreshed.promise)

    const refreshing = session.refresh()
    await Promise.resolve()
    await session.signOut()
    refreshed.resolve({ id: 'user-1', displayName: 'Stale Ranger', summary: null })
    await refreshing

    expect(session.state).toEqual({ status: 'anonymous', busy: false, error: '' })
  })

  it('does not let refresh supersede a sign-out that already started', async () => {
    const signingOut = deferred<void>()
    const loadProfile = vi.fn<AccountBackend['loadProfile']>(async () => ({
      id: 'user-1', displayName: 'Ranger', summary: null,
    }))
    const source = backend({
      loadProfile,
      signOut: vi.fn(() => signingOut.promise),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()
    await session.submit('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })

    const signOut = session.signOut()
    await Promise.resolve()
    await session.refresh()
    signingOut.resolve()
    await signOut

    expect(loadProfile).toHaveBeenCalledTimes(1)
    expect(session.state).toEqual({ status: 'anonymous', busy: false, error: '' })
  })

  it('does not let refresh supersede a newer auth-user profile load', async () => {
    let onUser: ((user: { id: string } | null) => void) | undefined
    const newProfile = deferred<{ id: string; displayName: string; summary: null }>()
    const loadProfile = vi.fn<AccountBackend['loadProfile']>(async (userId) => {
      if (userId === 'user-2') return newProfile.promise
      return { id: 'user-1', displayName: 'Ranger', summary: null }
    })
    const source = backend({
      subscribe: vi.fn((callback) => {
        onUser = callback
        return vi.fn()
      }),
      loadProfile,
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()
    onUser?.({ id: 'user-1' })
    await vi.waitFor(() => expect(session.state.status).toBe('authenticated'))

    onUser?.({ id: 'user-2' })
    await Promise.resolve()
    await session.refresh()
    newProfile.resolve({ id: 'user-2', displayName: 'New Ranger', summary: null })
    await vi.waitFor(() => {
      expect(session.state).toMatchObject({
        status: 'authenticated',
        profile: { id: 'user-2', displayName: 'New Ranger' },
      })
    })

    expect(loadProfile.mock.calls.map(([userId]) => userId)).toEqual(['user-1', 'user-2'])
  })

  it('does not let a stale auth-event profile load overwrite sign-out', async () => {
    let onUser: ((user: { id: string } | null) => void) | undefined
    const profile = deferred<{ id: string; displayName: string; summary: null }>()
    const source = backend({
      subscribe: vi.fn((callback) => {
        onUser = callback
        return vi.fn()
      }),
      loadProfile: vi.fn(() => profile.promise),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    onUser?.({ id: 'user-1' })
    await Promise.resolve()
    await session.signOut()
    profile.resolve({ id: 'user-1', displayName: 'Stale Ranger', summary: null })
    await Promise.resolve()

    expect(session.state).toEqual({ status: 'anonymous', busy: false, error: '' })
  })

  it('does not emit a stale profile after disposal', async () => {
    let onUser: ((user: { id: string } | null) => void) | undefined
    const profile = deferred<{ id: string; displayName: string; summary: null }>()
    const source = backend({
      subscribe: vi.fn((callback) => {
        onUser = callback
        return vi.fn()
      }),
      loadProfile: vi.fn(() => profile.promise),
    })
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()
    onUser?.({ id: 'user-1' })
    await Promise.resolve()
    const beforeDispose = states.length

    session.dispose()
    profile.resolve({ id: 'user-1', displayName: 'Stale Ranger', summary: null })
    await Promise.resolve()

    expect(states).toHaveLength(beforeDispose)
  })
})
