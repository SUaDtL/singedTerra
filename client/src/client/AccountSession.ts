import type { SupabaseClient, User } from '@supabase/supabase-js'
import { hasSupabaseConfig } from '../lib/supabaseConfig'
import {
  earnedHotSeatMatchXp,
  type HotSeatMatchResult,
  type HotSeatProgressionReceipt,
} from './hotSeatProgression'
import { postOnceWithRetry } from './retry'
import {
  parseVerifiedDeploymentAbandonResponse,
  parseVerifiedDeploymentCompletionResponse,
  parseVerifiedDeploymentDescriptor,
  parseVerifiedDeploymentStartResponse,
  parseVerifiedTranscript,
  normalizeVerifiedDeploymentSessionId,
  type VerifiedDeploymentProgressionCounts,
  type VerifiedDeploymentProgressionSnapshot,
  type VerifiedDeploymentReceipt,
  type VerifiedDeploymentServerReceipt,
  type VerifiedDeploymentStart,
} from './verifiedDeployment'
import type { VerifiedHumanFire } from '@shared/net/verifiedDuel'
import { observeVerifiedCompletionResponseForDiagnostics } from './ProductionDiagnostics'

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
  verifiedProgression: VerifiedAccountProgression
}

export interface VerifiedAccountProgression {
  evidence: 'verified_replay_v1'
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
  recordHotSeatMatch(result: HotSeatMatchResult): Promise<boolean>
  startVerifiedDeployment(): Promise<VerifiedDeploymentStart>
  abandonVerifiedDeployment(sessionId: string): Promise<boolean>
  completeVerifiedDeployment(
    sessionId: string,
    transcript: readonly VerifiedHumanFire[],
  ): Promise<VerifiedDeploymentServerReceipt>
}

export interface AccountSessionOptions {
  isConfigured?: () => boolean
  loadBackend?: () => Promise<AccountBackend>
}

const ACCOUNT_SUMMARY_TIMEOUT_MS = 5_000
const VERIFIED_DEPLOYMENT_TIMEOUT_MS = 5_000

function withBoundedAccountTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
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

function withAccountSummaryTimeout<T>(operation: Promise<T>): Promise<T> {
  return withBoundedAccountTimeout(
    operation,
    ACCOUNT_SUMMARY_TIMEOUT_MS,
    'Account summary request timed out.',
  )
}

function withVerifiedDeploymentTimeout<T>(operation: Promise<T>): Promise<T> {
  return withBoundedAccountTimeout(
    operation,
    VERIFIED_DEPLOYMENT_TIMEOUT_MS,
    'Verified deployment request timed out.',
  )
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

function progressionFields(value: unknown): Omit<AccountSummary, 'verifiedProgression'> | null {
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

function verifiedProgression(value: unknown): VerifiedAccountProgression | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { evidence, ...progression } = value as Record<string, unknown>
  if (evidence !== 'verified_replay_v1') return null
  const parsed = progressionFields(progression)
  return parsed ? { evidence, ...parsed } : null
}

function accountSummary(value: unknown): AccountSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const { verifiedProgression: rawVerified, ...casual } = record
  const parsed = progressionFields(casual)
  if (!parsed) return null
  const verified = verifiedProgression(rawVerified)
  return verified ? { ...parsed, verifiedProgression: verified } : null
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

    async recordHotSeatMatch(result) {
      const { data, error } = await client.functions.invoke('record_hotseat_match', {
        body: result,
      })
      throwSupabaseError(error)
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Hot-seat result was not accepted.')
      }
      const response = data as Record<string, unknown>
      if (
        Object.keys(response).length !== 2
        || response.ok !== true
        || typeof response.recorded !== 'boolean'
      ) {
        throw new Error('Hot-seat result was not accepted.')
      }
      return response.recorded
    },

    async startVerifiedDeployment() {
      const result = await withVerifiedDeploymentTimeout(
        client.functions.invoke('start_verified_deployment'),
      )
      if (result.error) throw new Error('Verified deployment is unavailable.')
      const parsed = parseVerifiedDeploymentStartResponse(result.data)
      if (!parsed) throw new Error('Verified deployment is unavailable.')
      return parsed
    },

    async abandonVerifiedDeployment(sessionId) {
      const result = await withVerifiedDeploymentTimeout(
        client.functions.invoke('abandon_verified_deployment', {
          body: { sessionId },
        }),
      )
      if (result.error) throw new Error('Verified deployment is unavailable.')
      const parsed = parseVerifiedDeploymentAbandonResponse(result.data)
      if (!parsed || parsed.sessionId !== sessionId.toLowerCase()) {
        throw new Error('Verified deployment is unavailable.')
      }
      return true
    },

    async completeVerifiedDeployment(sessionId, transcript) {
      const canonical = parseVerifiedTranscript(transcript, false)
      if (!canonical) throw new Error('Verified deployment is unavailable.')
      const result = await withVerifiedDeploymentTimeout(
        client.functions.invoke('complete_verified_deployment', {
          body: { sessionId, transcript: canonical },
        }),
      )
      if (result.error) throw new Error('Verified deployment is unavailable.')
      const parsed = parseVerifiedDeploymentCompletionResponse(result.data)
      if (!parsed || parsed.result.sessionId !== sessionId.toLowerCase()) {
        throw new Error('Verified deployment is unavailable.')
      }
      if (observeVerifiedCompletionResponseForDiagnostics(sessionId, canonical, parsed)) {
        throw new Error('Verified deployment is unavailable.')
      }
      return parsed
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

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function exactVerifiedStart(value: unknown): VerifiedDeploymentStart | null {
  if (!exactRecord(value, ['resumed', 'descriptor']) || typeof value.resumed !== 'boolean') return null
  const descriptor = parseVerifiedDeploymentDescriptor(value.descriptor)
  return descriptor ? Object.freeze({ resumed: value.resumed, descriptor }) : null
}

function progressionSnapshot(
  counts: VerifiedDeploymentProgressionCounts,
): VerifiedDeploymentProgressionSnapshot | null {
  const totalXp = counts.matchesPlayed * 100 + counts.wins * 100
  if (!Number.isSafeInteger(counts.matchesPlayed) || counts.matchesPlayed < 0
    || !Number.isSafeInteger(counts.wins) || counts.wins < 0 || counts.wins > counts.matchesPlayed
    || !Number.isSafeInteger(counts.totalXp) || counts.totalXp !== totalXp) return null
  return Object.freeze({
    evidence: 'verified_replay_v1',
    matchesPlayed: counts.matchesPlayed,
    wins: counts.wins,
    progressionVersion: 1,
    totalXp,
    level: Math.floor(totalXp / 500) + 1,
    levelXp: totalXp % 500,
    nextLevelXp: 500,
  })
}

function containsVerifiedProgression(
  actual: VerifiedAccountProgression,
  expected: VerifiedDeploymentProgressionSnapshot,
): boolean {
  return actual.evidence === expected.evidence
    && actual.matchesPlayed >= expected.matchesPlayed
    && actual.wins >= expected.wins
    && actual.progressionVersion === expected.progressionVersion
    && actual.totalXp >= expected.totalXp
    && actual.totalXp === actual.matchesPlayed * 100 + actual.wins * 100
    && actual.level === Math.floor(actual.totalXp / 500) + 1
    && actual.levelXp === actual.totalXp % 500
    && actual.nextLevelXp === expected.nextLevelXp
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
  private readonly verifiedCompletionRuns = new Map<string, Promise<VerifiedDeploymentReceipt | null>>()
  private readonly verifiedCompletionReceipts = new Map<
    string,
    { readonly transcriptKey: string; readonly receipt: VerifiedDeploymentReceipt }
  >()

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
    this.clearVerifiedCompletionState()
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

  async recordHotSeatMatch(
    result: HotSeatMatchResult,
  ): Promise<HotSeatProgressionReceipt | null> {
    await this.initialize()
    if (
      !this.backend
      || this.disposed
      || this.current.status !== 'authenticated'
      || this.current.busy
    ) return null
    const backend = this.backend
    const accountGeneration = this.generation
    const accountId = this.current.profile.id
    const priorSummary = this.current.profile.summary
    try {
      const delivery = await postOnceWithRetry(
        () => backend.recordHotSeatMatch(result),
        2,
      )
      if (!delivery.ok) return null
      if (
        !this.isCurrent(accountGeneration)
        || this.current.status !== 'authenticated'
        || this.current.profile.id !== accountId
      ) return null
      await this.refresh()
      if (!delivery.value) return null
      if (
        !this.isCurrent(accountGeneration)
        || this.current.status !== 'authenticated'
        || this.current.profile.id !== accountId
      ) return null
      const summary = this.current.profile.summary
      if (!priorSummary || !summary) return null
      const expectedXp = earnedHotSeatMatchXp(result.won)
      if (summary.totalXp !== priorSummary.totalXp + expectedXp) return null
      return { prior: priorSummary, current: summary }
    } catch {
      // Match reporting is opportunistic. Preserve gameplay and the last trusted
      // account state when delivery or the follow-up summary refresh cannot complete.
      return null
    }
  }

  async startVerifiedDeployment(): Promise<VerifiedDeploymentStart | null> {
    if (!this.initializePromise) await this.initialize()
    if (!this.backend || this.disposed || this.current.status !== 'authenticated' || this.current.busy) {
      return null
    }
    const backend = this.backend
    const accountGeneration = this.generation
    const accountId = this.current.profile.id
    try {
      const start = exactVerifiedStart(await backend.startVerifiedDeployment())
      if (!start || !this.isAuthenticatedAccount(accountGeneration, accountId)) return null
      return start
    } catch {
      return null
    }
  }

  async abandonVerifiedDeployment(sessionId: string): Promise<boolean> {
    if (!this.initializePromise) await this.initialize()
    const acceptedSessionId = normalizeVerifiedDeploymentSessionId(sessionId)
    if (!acceptedSessionId || !this.backend || this.disposed
      || this.current.status !== 'authenticated' || this.current.busy) return false
    const backend = this.backend
    const accountGeneration = this.generation
    const accountId = this.current.profile.id
    try {
      const abandoned = await backend.abandonVerifiedDeployment(acceptedSessionId)
      if (!abandoned || !this.isAuthenticatedAccount(accountGeneration, accountId)) return false
      const cached = this.verifiedCompletionReceipts.get(acceptedSessionId)
      if (cached) this.verifiedCompletionReceipts.delete(acceptedSessionId)
      return true
    } catch {
      return false
    }
  }

  async completeVerifiedDeployment(
    sessionId: string,
    transcript: readonly VerifiedHumanFire[],
  ): Promise<VerifiedDeploymentReceipt | null> {
    if (!this.initializePromise) await this.initialize()
    const acceptedSessionId = normalizeVerifiedDeploymentSessionId(sessionId)
    const canonical = parseVerifiedTranscript(transcript, false)
    if (!acceptedSessionId || !canonical || !this.backend || this.disposed
      || this.current.status !== 'authenticated' || this.current.busy) return null
    const transcriptKey = JSON.stringify(canonical)
    const completed = this.verifiedCompletionReceipts.get(acceptedSessionId)
    if (completed) return completed.transcriptKey === transcriptKey ? completed.receipt : null
    const runKey = `${acceptedSessionId}:${transcriptKey}`
    const existing = this.verifiedCompletionRuns.get(runKey)
    if (existing) return existing
    const backend = this.backend
    const accountGeneration = this.generation
    const accountId = this.current.profile.id
    const run = (async (): Promise<VerifiedDeploymentReceipt | null> => {
      try {
        const serverReceipt = parseVerifiedDeploymentCompletionResponse(
          await backend.completeVerifiedDeployment(acceptedSessionId, canonical),
        )
        if (!serverReceipt || serverReceipt.result.sessionId !== acceptedSessionId
          || !this.isAuthenticatedAccount(accountGeneration, accountId)) return null
        const prior = progressionSnapshot(serverReceipt.progression.prior)
        const current = progressionSnapshot(serverReceipt.progression.current)
        const expectedWinDelta = serverReceipt.result.won ? 1 : 0
        if (!prior || !current
          || current.matchesPlayed !== prior.matchesPlayed + 1
          || current.wins !== prior.wins + expectedWinDelta
          || current.totalXp !== prior.totalXp + serverReceipt.result.verifiedXp) return null
        await this.refresh()
        if (!this.isAuthenticatedAccount(accountGeneration, accountId)) return null
        const refreshedVerified = this.current.status === 'authenticated'
          ? this.current.profile.summary?.verifiedProgression
          : undefined
        if (!refreshedVerified || !containsVerifiedProgression(refreshedVerified, current)) return null
        const receipt: VerifiedDeploymentReceipt = Object.freeze({
          result: serverReceipt.result,
          progression: Object.freeze({
            evidence: 'verified_replay_v1' as const,
            prior,
            current,
          }),
        })
        this.verifiedCompletionReceipts.set(acceptedSessionId, { transcriptKey, receipt })
        return receipt
      } catch {
        return null
      }
    })()
    this.verifiedCompletionRuns.set(runKey, run)
    try {
      return await run
    } finally {
      if (this.verifiedCompletionRuns.get(runKey) === run) this.verifiedCompletionRuns.delete(runKey)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    this.clearVerifiedCompletionState()
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private async applyAuthUser(user: AccountUser | null, operation = ++this.generation): Promise<void> {
    if (!this.isCurrent(operation)) return
    this.clearVerifiedCompletionState()
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

  private isAuthenticatedAccount(operation: number, accountId: string): boolean {
    return this.isCurrent(operation)
      && this.current.status === 'authenticated'
      && this.current.profile.id === accountId
  }

  private clearVerifiedCompletionState(): void {
    this.verifiedCompletionRuns.clear()
    this.verifiedCompletionReceipts.clear()
  }

  private update(next: AccountState): void {
    if (this.disposed) return
    this.current = next
    this.onChange(next)
  }
}
