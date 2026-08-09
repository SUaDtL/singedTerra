import type { SupabaseClient, User } from '@supabase/supabase-js'
import { hasSupabaseConfig } from '../lib/supabaseConfig'

export type AccountMode = 'sign-in' | 'create'

export interface AccountCredentials {
  displayName?: string
  email: string
  password: string
}

export interface AccountSummary {
  matchesPlayed: number
  wins: number
  progressionVersion: 1
  totalXp: number
  level: number
  levelXp: number
  nextLevelXp: number
}

export interface AccountProfile {
  id: string
  displayName: string
  summary: AccountSummary | null
}

export type AccountState =
  | { status: 'unavailable' | 'loading' | 'anonymous'; busy: boolean; error: string }
  | { status: 'authenticated'; busy: boolean; error: string; profile: AccountProfile }
  | { status: 'authenticated-error'; busy: boolean; error: string; userId: string }

interface AccountUser {
  id: string
}

export interface AccountBackend {
  restoreUser(): Promise<AccountUser | null>
  subscribe(onUser: (user: AccountUser | null) => void): () => void
  signUp(credentials: Required<AccountCredentials>): Promise<AccountUser>
  signIn(credentials: Pick<AccountCredentials, 'email' | 'password'>): Promise<AccountUser>
  signOut(): Promise<void>
  loadProfile(userId: string): Promise<AccountProfile>
}

export interface AccountSessionOptions {
  isConfigured?: () => boolean
  loadBackend?: () => Promise<AccountBackend>
}

const ACCOUNT_SUMMARY_TIMEOUT_MS = 5_000

function withAccountSummaryTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      reject(new Error('Account summary request timed out.'))
    }, ACCOUNT_SUMMARY_TIMEOUT_MS)
    void operation.then(
      (value) => {
        globalThis.clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function throwSupabaseError(error: { message?: string } | null): void {
  if (error) throw new Error(error.message?.trim() || 'Account request failed.')
}

function accountUser(user: User | null): AccountUser | null {
  return user ? { id: user.id } : null
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function accountSummary(value: unknown): AccountSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value)
  const summaryKeys = [
    'matchesPlayed',
    'wins',
    'progressionVersion',
    'totalXp',
    'level',
    'levelXp',
    'nextLevelXp',
  ] as const
  if (keys.length !== summaryKeys.length || !summaryKeys.every((key) => keys.includes(key))) return null
  const {
    matchesPlayed,
    wins,
    progressionVersion,
    totalXp,
    level,
    levelXp,
    nextLevelXp,
  } = value as Record<string, unknown>
  if (
    !isSafeNonnegativeInteger(matchesPlayed)
    || !isSafeNonnegativeInteger(wins)
    || !isSafeNonnegativeInteger(progressionVersion)
    || !isSafeNonnegativeInteger(totalXp)
    || !isSafeNonnegativeInteger(level)
    || !isSafeNonnegativeInteger(levelXp)
    || !isSafeNonnegativeInteger(nextLevelXp)
    || wins > matchesPlayed
  ) return null
  const expectedTotalXp = matchesPlayed * 100 + wins * 100
  const expectedLevel = Math.floor(expectedTotalXp / 500) + 1
  const expectedLevelXp = expectedTotalXp % 500
  if (
    !Number.isSafeInteger(expectedTotalXp)
    || progressionVersion !== 1
    || totalXp !== expectedTotalXp
    || level !== expectedLevel
    || levelXp !== expectedLevelXp
    || nextLevelXp !== 500
  ) return null
  return { matchesPlayed, wins, progressionVersion, totalXp, level, levelXp, nextLevelXp }
}

export function createSupabaseAccountBackend(client: SupabaseClient): AccountBackend {
  return {
    async restoreUser() {
      const { data, error } = await client.auth.getSession()
      throwSupabaseError(error)
      return accountUser(data.session?.user ?? null)
    },

    subscribe(onUser) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        onUser(accountUser(session?.user ?? null))
      })
      return () => { data.subscription.unsubscribe() }
    },

    async signUp(credentials) {
      const { data, error } = await client.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: { data: { display_name: credentials.displayName.trim() } },
      })
      throwSupabaseError(error)
      if (!data.user || !data.session) {
        throw new Error('Account created, but automatic sign-in is unavailable.')
      }
      return { id: data.user.id }
    },

    async signIn(credentials) {
      const { data, error } = await client.auth.signInWithPassword(credentials)
      throwSupabaseError(error)
      if (!data.user) throw new Error('Sign-in did not return an account.')
      return { id: data.user.id }
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      throwSupabaseError(error)
    },

    async loadProfile(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name')
        .eq('id', userId)
        .single()
      throwSupabaseError(error)
      const row = data as { id?: unknown; display_name?: unknown } | null
      if (!row || typeof row.id !== 'string' || typeof row.display_name !== 'string') {
        throw new Error('Account profile is unavailable.')
      }
      let summary: AccountSummary | null = null
      try {
        const result = await withAccountSummaryTimeout(
          client.functions.invoke('account_summary'),
        )
        if (!result.error) summary = accountSummary(result.data)
      } catch {
        // The owner profile remains usable when the optional summary is unavailable.
      }
      return { id: row.id, displayName: row.display_name, summary }
    },
  }
}

const loadDefaultBackend = async (): Promise<AccountBackend> => {
  const { supabase } = await import('../lib/supabase')
  return createSupabaseAccountBackend(supabase)
}

function safeError(error: unknown): string {
  void error
  return 'Account request failed. Try again.'
}

function normalizeCredentials(
  mode: AccountMode,
  credentials: AccountCredentials,
): { ok: true; value: Required<AccountCredentials> } | { ok: false; error: string } {
  const displayName = credentials.displayName?.trim() ?? ''
  const email = credentials.email.trim()
  if (mode === 'create' && (displayName.length < 1 || displayName.length > 24)) {
    return { ok: false, error: 'Enter a display name between 1 and 24 characters.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  if (credentials.password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' }
  }
  return {
    ok: true,
    value: { displayName, email, password: credentials.password },
  }
}

export class AccountSession {
  private current: AccountState = {
    status: 'unavailable',
    busy: false,
    error: '',
  }
  private readonly isConfigured: () => boolean
  private readonly loadBackend: () => Promise<AccountBackend>
  private backend: AccountBackend | null = null
  private initializePromise: Promise<void> | null = null
  private unsubscribe: (() => void) | null = null
  private generation = 0
  private refreshGeneration = 0
  private authLoads = 0
  private disposed = false

  constructor(
    private readonly onChange: (state: AccountState) => void,
    options: AccountSessionOptions = {},
  ) {
    this.isConfigured = options.isConfigured ?? (() => hasSupabaseConfig())
    this.loadBackend = options.loadBackend ?? loadDefaultBackend
  }

  get state(): AccountState {
    return this.current
  }

  initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise
    this.initializePromise = this.initializeOnce()
    return this.initializePromise
  }

  private async initializeOnce(): Promise<void> {
    if (!this.isConfigured()) {
      this.update({ status: 'unavailable', busy: false, error: '' })
      return
    }
    this.update({ status: 'loading', busy: true, error: '' })
    const operation = ++this.generation
    try {
      const backend = await this.loadBackend()
      if (!this.isCurrent(operation)) return
      this.backend = backend
      this.unsubscribe = backend.subscribe((user) => {
        void this.applyAuthUser(user)
      })
      const user = await backend.restoreUser()
      if (!this.isCurrent(operation)) return
      await this.applyAuthUser(user, operation)
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.update({ status: 'anonymous', busy: false, error: safeError(error) })
      }
    }
  }

  async submit(mode: AccountMode, credentials: AccountCredentials): Promise<void> {
    await this.initialize()
    if (!this.backend || this.current.busy || this.disposed) return
    const normalized = normalizeCredentials(mode, credentials)
    if (!normalized.ok) {
      this.update({ status: 'anonymous', busy: false, error: normalized.error })
      return
    }
    this.update({ status: 'anonymous', busy: true, error: '' })
    const operation = ++this.generation
    try {
      const user = mode === 'create'
        ? await this.backend.signUp(normalized.value)
        : await this.backend.signIn({
            email: normalized.value.email,
            password: normalized.value.password,
          })
      if (!this.isCurrent(operation)) return
      await this.applyAuthUser(user, operation)
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.update({ status: 'anonymous', busy: false, error: safeError(error) })
      }
    }
  }

  async signOut(): Promise<void> {
    await this.initialize()
    if (!this.backend || this.current.busy || this.disposed) return
    this.update({ ...this.current, busy: true, error: '' })
    const operation = ++this.generation
    try {
      await this.backend.signOut()
      if (this.isCurrent(operation)) {
        this.update({ status: 'anonymous', busy: false, error: '' })
      }
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.update({ ...this.current, busy: false, error: safeError(error) })
      }
    }
  }

  async refresh(): Promise<void> {
    await this.initialize()
    if (
      !this.backend
      || this.disposed
      || this.authLoads > 0
      || this.current.status !== 'authenticated'
      || this.current.busy
    ) return
    const prior = this.current
    const authOperation = this.generation
    const operation = ++this.refreshGeneration
    try {
      const profile = await this.backend.loadProfile(prior.profile.id)
      if (
        this.isCurrent(authOperation)
        && operation === this.refreshGeneration
        && this.authLoads === 0
        && this.current.status === 'authenticated'
        && !this.current.busy
        && this.current.profile.id === prior.profile.id
      ) {
        this.update({ status: 'authenticated', busy: false, error: '', profile })
      }
    } catch {
      // Refresh is opportunistic. Keep the last trusted profile visible when the
      // optional summary read is unavailable; a later match/auth event can retry.
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private async applyAuthUser(user: AccountUser | null, operation = ++this.generation): Promise<void> {
    if (!this.isCurrent(operation)) return
    if (!user) {
      this.update({ status: 'anonymous', busy: false, error: '' })
      return
    }
    this.authLoads += 1
    try {
      const profile = await this.backend?.loadProfile(user.id)
      if (profile && this.isCurrent(operation)) {
        this.update({ status: 'authenticated', busy: false, error: '', profile })
      }
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.update({
          status: 'authenticated-error',
          busy: false,
          error: safeError(error),
          userId: user.id,
        })
      }
    } finally {
      this.authLoads -= 1
    }
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && operation === this.generation
  }

  private update(next: AccountState): void {
    if (this.disposed) return
    this.current = next
    this.onChange(next)
  }
}
