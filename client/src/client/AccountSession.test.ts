import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountSession,
  createSupabaseAccountBackend,
  type AccountBackend,
  type AccountSummary,
  type AccountState,
} from './AccountSession'
import type {
  VerifiedDeploymentDescriptor,
  VerifiedDeploymentServerReceipt,
  VerifiedDeploymentStart,
} from './verifiedDeployment'

type AssertTrue<T extends true> = T
type IsRequiredKey<T, K extends keyof T> = {} extends Pick<T, K> ? false : true
type _accountSummaryProgressionFieldsAreRequired = [
  AssertTrue<IsRequiredKey<AccountSummary, 'progressionVersion'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'totalXp'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'level'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'levelXp'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'nextLevelXp'>>,
  AssertTrue<IsRequiredKey<AccountSummary, 'verifiedProgression'>>,
]
type _accountSummaryVersionIsLiteralOne = AssertTrue<AccountSummary['progressionVersion'] extends 1 ? true : false>

const verifiedZeroProgression = {
  evidence: 'verified_replay_v1' as const,
  matchesPlayed: 0,
  wins: 0,
  progressionVersion: 1 as const,
  totalXp: 0,
  level: 1,
  levelXp: 0,
  nextLevelXp: 500,
}

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
    recordHotSeatMatch: vi.fn(async () => true),
    startVerifiedDeployment: vi.fn(async () => verifiedStart),
    abandonVerifiedDeployment: vi.fn(async () => true),
    completeVerifiedDeployment: vi.fn(async () => verifiedServerReceipt),
    ...overrides,
  }
}

const verifiedSessionId = '00000000-0000-4000-8000-000000000061'

const verifiedDescriptor: VerifiedDeploymentDescriptor = {
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
}

const verifiedStart: VerifiedDeploymentStart = {
  resumed: false,
  descriptor: verifiedDescriptor,
}

const verifiedServerReceipt: VerifiedDeploymentServerReceipt = {
  result: { sessionId: verifiedSessionId, won: true, outcome: 'win', verifiedXp: 200 },
  progression: {
    evidence: 'verified_replay_v1',
    prior: { matchesPlayed: 0, wins: 0, totalXp: 0 },
    current: { matchesPlayed: 1, wins: 1, totalXp: 200 },
  },
}

function exactSummary(
  verified = verifiedZeroProgression,
  casual: Pick<AccountSummary, 'matchesPlayed' | 'wins'> = { matchesPlayed: 0, wins: 0 },
): AccountSummary {
  const totalXp = casual.matchesPlayed * 100 + casual.wins * 100
  return {
    matchesPlayed: casual.matchesPlayed,
    wins: casual.wins,
    progressionVersion: 1,
    totalXp,
    level: Math.floor(totalXp / 500) + 1,
    levelXp: totalXp % 500,
    nextLevelXp: 500,
    verifiedProgression: verified,
  }
}

describe('createSupabaseAccountBackend', () => {
  it('invokes the bounded hot-seat result function with only match id and outcome', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, recorded: true }, error: null }))
    const gateway = createSupabaseAccountBackend({
      auth: {},
      functions: { invoke },
    } as never)

    await expect(gateway.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000071',
      won: true,
    })).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('record_hotseat_match', {
      body: {
        matchId: '00000000-0000-4000-8000-000000000071',
        won: true,
      },
    })
  })

  it.each([
    ['function error', { data: null, error: { message: 'record unavailable' } }],
    ['malformed success', { data: { ok: true, recorded: 'yes' }, error: null }],
    ['extra response authority', { data: { ok: true, recorded: true, xp: 999 }, error: null }],
  ])('rejects a %s without exposing a false progression success', async (_label, response) => {
    const gateway = createSupabaseAccountBackend({
      auth: {},
      functions: { invoke: vi.fn(async () => response) },
    } as never)

    await expect(gateway.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000071',
      won: true,
    })).rejects.toThrow()
  })

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
      verifiedProgression: {
        evidence: 'verified_replay_v1',
        matchesPlayed: 0,
        wins: 0,
        progressionVersion: 1,
        totalXp: 0,
        level: 1,
        levelXp: 0,
        nextLevelXp: 500,
      },
    }],
    ['level boundary', {
      matchesPlayed: 4,
      wins: 1,
      progressionVersion: 1,
      totalXp: 500,
      level: 2,
      levelXp: 0,
      nextLevelXp: 500,
      verifiedProgression: {
        evidence: 'verified_replay_v1',
        matchesPlayed: 0,
        wins: 0,
        progressionVersion: 1,
        totalXp: 0,
        level: 1,
        levelXp: 0,
        nextLevelXp: 500,
      },
    }],
    ['separate verified replay progression', {
      matchesPlayed: 7,
      wins: 3,
      progressionVersion: 1,
      totalXp: 1000,
      level: 3,
      levelXp: 0,
      nextLevelXp: 500,
      verifiedProgression: {
        evidence: 'verified_replay_v1',
        matchesPlayed: 4,
        wins: 1,
        progressionVersion: 1,
        totalXp: 500,
        level: 2,
        levelXp: 0,
        nextLevelXp: 500,
      },
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
    verifiedProgression: {
      evidence: 'verified_replay_v1',
      matchesPlayed: 4,
      wins: 1,
      progressionVersion: 1,
      totalXp: 500,
      level: 2,
      levelXp: 0,
      nextLevelXp: 500,
    },
  }

  it.each([
    ['returned function error', { data: null, error: { message: 'summary unavailable' } }],
    ['an unknown progression version', { data: { ...validSummary, progressionVersion: 2 }, error: null }],
    ['a missing summary key', { data: { matchesPlayed: 7, wins: 3, progressionVersion: 1, totalXp: 1000, level: 3, levelXp: 0 }, error: null }],
    ['an extra summary key', { data: { ...validSummary, userId: 'user-7' }, error: null }],
    ['a missing required verified progression cannot fall back to casual progression', {
      data: {
        matchesPlayed: 7,
        wins: 3,
        progressionVersion: 1,
        totalXp: 1000,
        level: 3,
        levelXp: 0,
        nextLevelXp: 500,
      },
      error: null,
    }],
    ['forged verified evidence', {
      data: {
        ...validSummary,
        verifiedProgression: {
          evidence: 'client_attested',
          matchesPlayed: 4,
          wins: 1,
          progressionVersion: 1,
          totalXp: 500,
          level: 2,
          levelXp: 0,
          nextLevelXp: 500,
        },
      },
      error: null,
    }],
    ['missing verified evidence', {
      data: {
        ...validSummary,
        verifiedProgression: {
          matchesPlayed: 4,
          wins: 1,
          progressionVersion: 1,
          totalXp: 500,
          level: 2,
          levelXp: 0,
          nextLevelXp: 500,
        },
      },
      error: null,
    }],
    ['a verified progression with an unknown key', {
      data: { ...validSummary, verifiedProgression: { ...validSummary.verifiedProgression, widened: true } },
      error: null,
    }],
    ['a verified progression with a missing key', {
      data: { ...validSummary, verifiedProgression: { evidence: 'verified_replay_v1', matchesPlayed: 4, wins: 1, progressionVersion: 1, totalXp: 500, level: 2, levelXp: 0 } },
      error: null,
    }],
    ['an unknown verified progression version', {
      data: { ...validSummary, verifiedProgression: { ...validSummary.verifiedProgression, progressionVersion: 2 } },
      error: null,
    }],
    ['a fractional verified match count', {
      data: { ...validSummary, verifiedProgression: { ...validSummary.verifiedProgression, matchesPlayed: 4.5, totalXp: 550, level: 2, levelXp: 50 } },
      error: null,
    }],
    ['verified wins above verified matches', {
      data: { ...validSummary, verifiedProgression: { ...validSummary.verifiedProgression, wins: 5, totalXp: 900, level: 2, levelXp: 400 } },
      error: null,
    }],
    ['inconsistent verified total XP and level arithmetic', {
      data: { ...validSummary, verifiedProgression: { ...validSummary.verifiedProgression, totalXp: 499, level: 1, levelXp: 499 } },
      error: null,
    }],
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

  it('records only for an authenticated account and refreshes its summary after success', async () => {
    const recordHotSeatMatch = vi.fn(async () => true)
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 0,
          wins: 0,
          progressionVersion: 1 as const,
          totalXp: 0,
          level: 1,
          levelXp: 0,
          nextLevelXp: 500,
          verifiedProgression: verifiedZeroProgression,
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 1,
          wins: 1,
          progressionVersion: 1 as const,
          totalXp: 200,
          level: 1,
          levelXp: 200,
          nextLevelXp: 500,
          verifiedProgression: verifiedZeroProgression,
        },
      })
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      recordHotSeatMatch,
      loadProfile,
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()
    loadProfile.mockClear()

    await expect(session.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000071',
      won: true,
    })).resolves.toEqual({
      prior: {
        matchesPlayed: 0,
        wins: 0,
        progressionVersion: 1,
        totalXp: 0,
        level: 1,
        levelXp: 0,
        nextLevelXp: 500,
        verifiedProgression: verifiedZeroProgression,
      },
      current: {
        matchesPlayed: 1,
        wins: 1,
        progressionVersion: 1,
        totalXp: 200,
        level: 1,
        levelXp: 200,
        nextLevelXp: 500,
        verifiedProgression: verifiedZeroProgression,
      },
    })
    expect(recordHotSeatMatch).toHaveBeenCalledOnce()
    expect(loadProfile).toHaveBeenCalledWith('user-1')
    expect(session.state.status === 'authenticated' && session.state.profile.summary?.totalXp).toBe(200)
  })

  it('retries one transient hot-seat result failure before refreshing progression', async () => {
    const recordHotSeatMatch = vi.fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(true)
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 0,
          wins: 0,
          progressionVersion: 1 as const,
          totalXp: 0,
          level: 1,
          levelXp: 0,
          nextLevelXp: 500,
          verifiedProgression: verifiedZeroProgression,
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 1,
          wins: 0,
          progressionVersion: 1 as const,
          totalXp: 100,
          level: 1,
          levelXp: 100,
          nextLevelXp: 500,
          verifiedProgression: verifiedZeroProgression,
        },
      })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => backend({
        restoreUser: vi.fn(async () => ({ id: 'user-1' })),
        recordHotSeatMatch,
        loadProfile,
      }),
    })
    await session.initialize()
    loadProfile.mockClear()

    await expect(session.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000073',
      won: false,
    })).resolves.toMatchObject({
      prior: { totalXp: 0, levelXp: 0 },
      current: { totalXp: 100, levelXp: 100 },
    })
    expect(recordHotSeatMatch).toHaveBeenCalledTimes(2)
    expect(loadProfile).toHaveBeenCalledOnce()
  })

  it('rejects a delayed receipt when authentication changes to a numerically compatible account', async () => {
    const delivery = deferred<boolean>()
    let onUser: ((user: { id: string } | null) => void) | undefined
    const loadProfile = vi.fn(async (userId: string) => userId === 'user-1'
      ? {
          id: 'user-1',
          displayName: 'Ranger A',
          summary: {
            matchesPlayed: 14,
            wins: 4,
            progressionVersion: 1 as const,
            totalXp: 1_800,
            level: 4,
            levelXp: 300,
            nextLevelXp: 500,
            verifiedProgression: verifiedZeroProgression,
          },
        }
      : {
          id: 'user-2',
          displayName: 'Ranger B',
          summary: {
            matchesPlayed: 15,
            wins: 5,
            progressionVersion: 1 as const,
            totalXp: 2_000,
            level: 5,
            levelXp: 0,
            nextLevelXp: 500,
            verifiedProgression: verifiedZeroProgression,
          },
        })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => backend({
        restoreUser: vi.fn(async () => ({ id: 'user-1' })),
        subscribe: vi.fn((callback) => {
          onUser = callback
          return vi.fn()
        }),
        recordHotSeatMatch: vi.fn(() => delivery.promise),
        loadProfile,
      }),
    })
    await session.initialize()

    const result = session.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000078',
      won: true,
    })
    await vi.waitFor(() => expect(onUser).toBeTypeOf('function'))
    onUser?.({ id: 'user-2' })
    await vi.waitFor(() => expect(session.state).toMatchObject({
      status: 'authenticated',
      profile: { id: 'user-2', summary: { totalXp: 2_000 } },
    }))
    delivery.resolve(true)

    await expect(result).resolves.toBeNull()
    expect(loadProfile.mock.calls.map(([userId]) => userId)).toEqual(['user-1', 'user-2'])
  })

  it('skips anonymous results and preserves authenticated state when recording fails', async () => {
    const recordHotSeatMatch = vi.fn(async () => { throw new Error('result unavailable') })
    const source = backend({ recordHotSeatMatch })
    const anonymous = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await anonymous.initialize()
    await expect(anonymous.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000071',
      won: false,
    })).resolves.toBeNull()
    expect(recordHotSeatMatch).not.toHaveBeenCalled()

    const authenticatedSource = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      recordHotSeatMatch,
    })
    const authenticated = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => authenticatedSource,
    })
    await authenticated.initialize()
    const before = authenticated.state
    await expect(authenticated.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000072',
      won: false,
    })).resolves.toBeNull()
    expect(authenticated.state).toEqual(before)
  })

  it('suppresses a progression receipt when the follow-up summary remains stale', async () => {
    const staleProfile = {
      id: 'user-1',
      displayName: 'Ranger',
      summary: {
        matchesPlayed: 0,
        wins: 0,
        progressionVersion: 1 as const,
        totalXp: 0,
        level: 1,
        levelXp: 0,
        nextLevelXp: 500,
        verifiedProgression: verifiedZeroProgression,
      },
    }
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => backend({
        restoreUser: vi.fn(async () => ({ id: 'user-1' })),
        recordHotSeatMatch: vi.fn(async () => true),
        loadProfile: vi.fn(async () => staleProfile),
      }),
    })
    await session.initialize()

    await expect(session.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000075',
      won: true,
    })).resolves.toBeNull()
    expect(session.state).toMatchObject({ status: 'authenticated', profile: staleProfile })
  })

  it('suppresses a progression receipt when no trusted pre-match summary can prove the delta', async () => {
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ranger', summary: null })
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 1,
          wins: 1,
          progressionVersion: 1 as const,
          totalXp: 200,
          level: 1,
          levelXp: 200,
          nextLevelXp: 500,
          verifiedProgression: verifiedZeroProgression,
        },
      })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => backend({
        restoreUser: vi.fn(async () => ({ id: 'user-1' })),
        recordHotSeatMatch: vi.fn(async () => true),
        loadProfile,
      }),
    })
    await session.initialize()

    await expect(session.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000076',
      won: true,
    })).resolves.toBeNull()
    expect(session.state).toMatchObject({
      status: 'authenticated',
      profile: { summary: { totalXp: 200 } },
    })
  })

  it('suppresses an idempotent replay even when the refreshed summary differs', async () => {
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 0,
          wins: 0,
          progressionVersion: 1 as const,
          totalXp: 0,
          level: 1,
          levelXp: 0,
          nextLevelXp: 500,
          verifiedProgression: verifiedZeroProgression,
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 1,
          wins: 1,
          progressionVersion: 1 as const,
          totalXp: 200,
          level: 1,
          levelXp: 200,
          nextLevelXp: 500,
          verifiedProgression: verifiedZeroProgression,
        },
      })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => backend({
        restoreUser: vi.fn(async () => ({ id: 'user-1' })),
        recordHotSeatMatch: vi.fn(async () => false),
        loadProfile,
      }),
    })
    await session.initialize()

    await expect(session.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000077',
      won: true,
    })).resolves.toBeNull()
    expect(session.state).toMatchObject({
      status: 'authenticated',
      profile: { summary: { totalXp: 200 } },
    })
  })

  it('preserves an idempotent replay result without presenting it as newly recorded', async () => {
    const gateway = createSupabaseAccountBackend({
      auth: {},
      functions: {
        invoke: vi.fn(async () => ({ data: { ok: true, recorded: false }, error: null })),
      },
    } as never)

    await expect(gateway.recordHotSeatMatch({
      matchId: '00000000-0000-4000-8000-000000000071',
      won: true,
    })).resolves.toBe(false)
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
        verifiedProgression: verifiedZeroProgression,
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

describe('verified deployment Supabase adapter', () => {
  const rawStart = {
    sessionId: verifiedSessionId,
    resumed: false,
    expiresAt: verifiedDescriptor.expiresAt,
    contractVersion: 1,
    engineVersion: 1,
    rulesetVersion: 3,
    limits: verifiedDescriptor.limits,
    config: verifiedDescriptor.config,
  }

  it('invokes start without a body and abandon/complete with only their exact accepted bodies', async () => {
    const invoke = vi.fn(async (name: string) => {
      if (name === 'start_verified_deployment') return { data: rawStart, error: null }
      if (name === 'abandon_verified_deployment') {
        return { data: { ok: true, sessionId: verifiedSessionId, status: 'abandoned' }, error: null }
      }
      return { data: verifiedServerReceipt, error: null }
    })
    const gateway = createSupabaseAccountBackend({ auth: {}, functions: { invoke } } as never)
    const transcript = [{ angle: 37, power: 64 }]

    await expect(gateway.startVerifiedDeployment()).resolves.toEqual(verifiedStart)
    await expect(gateway.abandonVerifiedDeployment(verifiedSessionId)).resolves.toBe(true)
    await expect(gateway.completeVerifiedDeployment(verifiedSessionId, transcript))
      .resolves.toEqual(verifiedServerReceipt)
    expect(invoke.mock.calls).toEqual([
      ['start_verified_deployment'],
      ['abandon_verified_deployment', { body: { sessionId: verifiedSessionId } }],
      ['complete_verified_deployment', { body: { sessionId: verifiedSessionId, transcript } }],
    ])
  })

  it.each([
    ['start', 'startVerifiedDeployment', { ...rawStart, accessToken: 'private-token' }],
    ['abandon', 'abandonVerifiedDeployment', { ok: true, sessionId: verifiedSessionId, status: 'abandoned', userId: 'private-user' }],
    ['complete', 'completeVerifiedDeployment', { ...verifiedServerReceipt, casualTotalXp: 200 }],
  ] as const)('refuses a widened %s response', async (_label, method, data) => {
    const gateway = createSupabaseAccountBackend({
      auth: {},
      functions: { invoke: vi.fn(async () => ({ data, error: null })) },
    } as never)

    const invocation = method === 'startVerifiedDeployment'
      ? gateway.startVerifiedDeployment()
      : method === 'abandonVerifiedDeployment'
        ? gateway.abandonVerifiedDeployment(verifiedSessionId)
        : gateway.completeVerifiedDeployment(verifiedSessionId, [{ angle: 37, power: 64 }])
    await expect(invocation).rejects.toThrow('Verified deployment is unavailable.')
  })

  it('bounds a stalled lifecycle invocation with safe copy', async () => {
    vi.useFakeTimers()
    const gateway = createSupabaseAccountBackend({
      auth: {},
      functions: { invoke: vi.fn(() => new Promise<never>(() => undefined)) },
    } as never)
    try {
      const pending = gateway.startVerifiedDeployment()
      let settled = false
      const observed = pending.then(
        () => ({ ok: true as const, error: null }),
        (error: unknown) => ({ ok: false as const, error }),
      ).finally(() => { settled = true })
      await vi.advanceTimersByTimeAsync(4_999)
      await Promise.resolve()
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      const result = await observed
      expect(result.ok).toBe(false)
      expect(result.error).toEqual(new Error('Verified deployment request timed out.'))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('AccountSession verified deployment lifecycle', () => {
  it('refuses loading and anonymous invocation without touching lifecycle handlers', async () => {
    const restored = deferred<{ id: string } | null>()
    const source = backend({ restoreUser: vi.fn(() => restored.promise) })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    const initializing = session.initialize()
    await Promise.resolve()
    const starting = session.startVerifiedDeployment()
    await Promise.resolve()
    expect(source.startVerifiedDeployment).not.toHaveBeenCalled()
    restored.resolve(null)
    await initializing
    await expect(starting).resolves.toBeNull()
    await expect(session.startVerifiedDeployment()).resolves.toBeNull()
    await expect(session.abandonVerifiedDeployment(verifiedSessionId)).resolves.toBe(false)
    await expect(session.completeVerifiedDeployment(verifiedSessionId, [{ angle: 37, power: 64 }]))
      .resolves.toBeNull()
    expect(source.startVerifiedDeployment).not.toHaveBeenCalled()
    expect(source.abandonVerifiedDeployment).not.toHaveBeenCalled()
    expect(source.completeVerifiedDeployment).not.toHaveBeenCalled()
  })

  it('returns the exact immutable start/resume descriptor only for the current authenticated generation', async () => {
    const first = deferred<VerifiedDeploymentStart>()
    let onUser: ((user: { id: string } | null) => void) | undefined
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      subscribe: vi.fn((callback) => { onUser = callback; return vi.fn() }),
      loadProfile: vi.fn(async (userId) => ({ id: userId, displayName: userId, summary: exactSummary() })),
      startVerifiedDeployment: vi.fn(() => first.promise),
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    const stale = session.startVerifiedDeployment()
    await Promise.resolve()
    onUser?.({ id: 'user-2' })
    await vi.waitFor(() => expect(session.state).toMatchObject({
      status: 'authenticated', profile: { id: 'user-2' },
    }))
    first.resolve(verifiedStart)
    await expect(stale).resolves.toBeNull()

    source.startVerifiedDeployment = vi.fn(async () => ({ ...verifiedStart, resumed: true }))
    await expect(session.startVerifiedDeployment()).resolves.toEqual({ ...verifiedStart, resumed: true })
  })

  it('invalidates an in-flight abandon when sign-out starts', async () => {
    const abandoned = deferred<boolean>()
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      loadProfile: vi.fn(async () => ({ id: 'user-1', displayName: 'Ranger', summary: exactSummary() })),
      abandonVerifiedDeployment: vi.fn(() => abandoned.promise),
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    const pending = session.abandonVerifiedDeployment(verifiedSessionId)
    await Promise.resolve()
    await session.signOut()
    abandoned.resolve(true)

    await expect(pending).resolves.toBe(false)
    expect(session.state.status).toBe('anonymous')
  })

  it('accepts completion once only when server arithmetic and refreshed verified progression both agree', async () => {
    const completed = deferred<VerifiedDeploymentServerReceipt>()
    const verifiedCurrent = {
      evidence: 'verified_replay_v1' as const,
      matchesPlayed: 1,
      wins: 1,
      progressionVersion: 1 as const,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
    }
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ranger', summary: exactSummary() })
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: exactSummary(verifiedCurrent, { matchesPlayed: 17, wins: 8 }),
      })
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      loadProfile,
      completeVerifiedDeployment: vi.fn(() => completed.promise),
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()
    const transcript = [{ angle: 37, power: 64 }]

    const first = session.completeVerifiedDeployment(verifiedSessionId, transcript)
    const duplicate = session.completeVerifiedDeployment(verifiedSessionId, transcript)
    await Promise.resolve()
    expect(source.completeVerifiedDeployment).toHaveBeenCalledOnce()
    completed.resolve(verifiedServerReceipt)

    const expected = {
      result: verifiedServerReceipt.result,
      progression: {
        evidence: 'verified_replay_v1',
        prior: verifiedZeroProgression,
        current: verifiedCurrent,
      },
    }
    await expect(first).resolves.toEqual(expected)
    await expect(duplicate).resolves.toEqual(expected)
    await expect(session.completeVerifiedDeployment(verifiedSessionId, transcript)).resolves.toEqual(expected)
    expect(source.completeVerifiedDeployment).toHaveBeenCalledOnce()
    expect(loadProfile).toHaveBeenCalledTimes(2)
  })

  it('never substitutes compatible casual totals for stale verified evidence', async () => {
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ranger', summary: exactSummary() })
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Ranger',
        summary: exactSummary(verifiedZeroProgression, { matchesPlayed: 1, wins: 1 }),
      })
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      loadProfile,
      completeVerifiedDeployment: vi.fn(async () => verifiedServerReceipt),
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await expect(session.completeVerifiedDeployment(verifiedSessionId, [{ angle: 37, power: 64 }]))
      .resolves.toBeNull()
    expect(session.state).toMatchObject({
      status: 'authenticated',
      profile: { summary: { totalXp: 200, verifiedProgression: verifiedZeroProgression } },
    })
  })

  it('accepts an immutable result-specific receipt when this browser began from stale verified progression', async () => {
    const staleLocal = {
      ...verifiedZeroProgression,
      matchesPlayed: 1,
      wins: 0,
      totalXp: 100,
      levelXp: 100,
    }
    const receipt = {
      result: verifiedServerReceipt.result,
      progression: {
        evidence: 'verified_replay_v1' as const,
        prior: { matchesPlayed: 2, wins: 1, totalXp: 300 },
        current: { matchesPlayed: 3, wins: 2, totalXp: 500 },
      },
    }
    const authoritativeCurrent = {
      evidence: 'verified_replay_v1' as const,
      matchesPlayed: 3,
      wins: 2,
      progressionVersion: 1 as const,
      totalXp: 500,
      level: 2,
      levelXp: 0,
      nextLevelXp: 500,
    }
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ranger', summary: exactSummary(staleLocal) })
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ranger', summary: exactSummary(authoritativeCurrent) })
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      loadProfile,
      completeVerifiedDeployment: vi.fn(async () => receipt),
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await expect(session.completeVerifiedDeployment(verifiedSessionId, [{ angle: 37, power: 64 }]))
      .resolves.toEqual({
        result: receipt.result,
        progression: {
          evidence: 'verified_replay_v1',
          prior: { evidence: 'verified_replay_v1', ...receipt.progression.prior, progressionVersion: 1, level: 1, levelXp: 300, nextLevelXp: 500 },
          current: authoritativeCurrent,
        },
      })
    expect(loadProfile).toHaveBeenCalledTimes(2)
  })

  it('does not suppress an authoritative completion receipt when the pre-match account summary is unavailable', async () => {
    const authoritativeCurrent = {
      evidence: 'verified_replay_v1' as const,
      matchesPlayed: 1,
      wins: 1,
      progressionVersion: 1 as const,
      totalXp: 200,
      level: 1,
      levelXp: 200,
      nextLevelXp: 500,
    }
    const loadProfile = vi.fn()
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ranger', summary: null })
      .mockResolvedValueOnce({ id: 'user-1', displayName: 'Ranger', summary: exactSummary(authoritativeCurrent) })
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      loadProfile,
      completeVerifiedDeployment: vi.fn(async () => verifiedServerReceipt),
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await expect(session.completeVerifiedDeployment(verifiedSessionId, [{ angle: 37, power: 64 }]))
      .resolves.toEqual({
        result: verifiedServerReceipt.result,
        progression: {
          evidence: 'verified_replay_v1',
          prior: verifiedZeroProgression,
          current: authoritativeCurrent,
        },
      })
  })

  it('discards completion when the account switches before the response and does not refresh the new owner', async () => {
    const completed = deferred<VerifiedDeploymentServerReceipt>()
    let onUser: ((user: { id: string } | null) => void) | undefined
    const loadProfile = vi.fn(async (userId: string) => ({
      id: userId,
      displayName: userId,
      summary: exactSummary(),
    }))
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      subscribe: vi.fn((callback) => { onUser = callback; return vi.fn() }),
      loadProfile,
      completeVerifiedDeployment: vi.fn(() => completed.promise),
    })
    const session = new AccountSession(() => undefined, {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    const pending = session.completeVerifiedDeployment(verifiedSessionId, [{ angle: 37, power: 64 }])
    await Promise.resolve()
    onUser?.({ id: 'user-2' })
    await vi.waitFor(() => expect(session.state).toMatchObject({ status: 'authenticated', profile: { id: 'user-2' } }))
    completed.resolve(verifiedServerReceipt)

    await expect(pending).resolves.toBeNull()
    expect(loadProfile.mock.calls.map(([userId]) => userId)).toEqual(['user-1', 'user-2'])
  })

  it('contains lifecycle failures without raw errors, tokens, or credentials in state, copy, or logs', async () => {
    const states: AccountState[] = []
    const error = 'supabase echoed Bearer private-token and password not-a-real-secret'
    const source = backend({
      restoreUser: vi.fn(async () => ({ id: 'user-1' })),
      loadProfile: vi.fn(async () => ({ id: 'user-1', displayName: 'Ranger', summary: exactSummary() })),
      startVerifiedDeployment: vi.fn(async () => { throw new Error(error) }),
      abandonVerifiedDeployment: vi.fn(async () => { throw new Error(error) }),
      completeVerifiedDeployment: vi.fn(async () => { throw new Error(error) }),
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const session = new AccountSession((state) => states.push(state), {
      isConfigured: () => true,
      loadBackend: async () => source,
    })
    await session.initialize()

    await expect(session.startVerifiedDeployment()).resolves.toBeNull()
    await expect(session.abandonVerifiedDeployment(verifiedSessionId)).resolves.toBe(false)
    await expect(session.completeVerifiedDeployment(verifiedSessionId, [{ angle: 37, power: 64 }]))
      .resolves.toBeNull()
    expect(JSON.stringify(states)).not.toContain('private-token')
    expect(JSON.stringify(states)).not.toContain('not-a-real-secret')
    expect(log).not.toHaveBeenCalled()
  })
})
