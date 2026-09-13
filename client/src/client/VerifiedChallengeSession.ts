import type {
  VerifiedChallengeDescriptor,
  VerifiedChallengeHumanFire,
  VerifiedChallengeReceipt,
} from '@shared/net/verifiedChallenge'
import {
  VerifiedChallengeTransportError,
  type VerifiedChallengeStartResponse,
  type VerifiedChallengeStatusResponse,
} from './verifiedChallenge'
import { VerifiedChallengeStorage } from './verifiedChallengeStorage'

export interface VerifiedChallengeSessionTransport {
  start(): Promise<VerifiedChallengeStartResponse>
  get(sessionId: string): Promise<VerifiedChallengeStatusResponse>
  abandon(sessionId: string): Promise<VerifiedChallengeStatusResponse>
  complete(sessionId: string, transcript: readonly VerifiedChallengeHumanFire[]): Promise<VerifiedChallengeReceipt>
}

interface ChallengeDetails {
  readonly descriptor: VerifiedChallengeDescriptor
  readonly transcript: readonly VerifiedChallengeHumanFire[]
  readonly computeAttempts: number
}

export type VerifiedChallengeRetryReason = 'pending' | 'busy' | 'rate-limited' | 'timeout' | 'unavailable'
export type VerifiedChallengeRetryIntent = 'refresh' | 'complete' | 'abandon'
export type VerifiedChallengeStartFailureReason = 'disabled' | 'busy' | 'rate-limited' | 'unauthorized'
  | 'incompatible' | 'timeout' | 'unavailable'

export type VerifiedChallengeSessionState =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'start-unavailable'; readonly reason: VerifiedChallengeStartFailureReason;
      readonly retryAfterSeconds: number | null }
  | ({ readonly status: 'active' | 'completion-pending' } & ChallengeDetails)
  | ({ readonly status: 'retryable'; readonly reason: VerifiedChallengeRetryReason;
      readonly retryAfterSeconds: number | null; readonly retryIntent: VerifiedChallengeRetryIntent } & ChallengeDetails)
  | ({ readonly status: 'expired' | 'abandoned' | 'invalid' | 'verification_unavailable' } & ChallengeDetails)
  | { readonly status: 'completed'; readonly descriptor: VerifiedChallengeDescriptor;
      readonly receipt: VerifiedChallengeReceipt }

const EMPTY = Object.freeze([]) as readonly VerifiedChallengeHumanFire[]

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function retryReason(error: unknown): { reason: VerifiedChallengeRetryReason; retryAfterSeconds: number | null } {
  if (!(error instanceof VerifiedChallengeTransportError)) return { reason: 'unavailable', retryAfterSeconds: null }
  if (error.code === 'verification_busy') return { reason: 'busy', retryAfterSeconds: error.retryAfterSeconds }
  if (error.status === 429) return { reason: 'rate-limited', retryAfterSeconds: error.retryAfterSeconds }
  if (error.code === 'request_timeout') return { reason: 'timeout', retryAfterSeconds: null }
  return { reason: 'unavailable', retryAfterSeconds: null }
}

function startFailure(error: unknown): {
  reason: VerifiedChallengeStartFailureReason
  retryAfterSeconds: number | null
} {
  if (!(error instanceof VerifiedChallengeTransportError)) return { reason: 'unavailable', retryAfterSeconds: null }
  if (error.code === 'challenge_starts_disabled') return { reason: 'disabled', retryAfterSeconds: null }
  if (error.code === 'verification_busy') return { reason: 'busy', retryAfterSeconds: error.retryAfterSeconds }
  if (error.status === 429) return { reason: 'rate-limited', retryAfterSeconds: error.retryAfterSeconds }
  if (error.status === 401) return { reason: 'unauthorized', retryAfterSeconds: null }
  if (error.code === 'active_challenge_incompatible') return { reason: 'incompatible', retryAfterSeconds: null }
  if (error.code === 'request_timeout') return { reason: 'timeout', retryAfterSeconds: null }
  return { reason: 'unavailable', retryAfterSeconds: null }
}

/** Account-bound client lifecycle. Only a parsed server receipt represents a reward. */
export class VerifiedChallengeSession {
  private current: VerifiedChallengeSessionState = Object.freeze({ status: 'idle' as const })
  private accountIdentity: string | null
  private generation = 0
  private operation = 0
  private retryNotBefore = 0

  constructor(
    private readonly transport: VerifiedChallengeSessionTransport,
    private readonly storage: VerifiedChallengeStorage,
    private readonly authenticatedAccountId: () => string | null,
    private readonly now: () => number = Date.now,
  ) {
    this.accountIdentity = authenticatedAccountId()
  }

  get state(): VerifiedChallengeSessionState { return this.current }

  /** Seconds remaining in a server-directed retry cooldown. Zero means retry is currently permitted. */
  get retryDelaySeconds(): number {
    if ((this.current.status !== 'start-unavailable' && this.current.status !== 'retryable')
      || this.retryNotBefore <= this.now()) return 0
    return Math.ceil((this.retryNotBefore - this.now()) / 1_000)
  }

  syncAccount(): boolean {
    const next = this.authenticatedAccountId()
    if (next === this.accountIdentity) return false
    const previous = this.accountIdentity
    this.accountIdentity = next
    this.generation += 1
    this.operation += 1
    this.retryNotBefore = 0
    if (previous) this.storage.clearAccount(previous)
    this.current = Object.freeze({ status: 'idle' as const })
    return true
  }

  /** Project the local deadline synchronously before handing active play to the engine.
   * Pending completion remains recoverable because the server may already hold its receipt. */
  projectDeadline(): VerifiedChallengeSessionState {
    this.syncAccount()
    if (this.current.status === 'active' && this.expired(this.current.descriptor)) {
      this.nextOperation()
      this.current = Object.freeze({ ...this.current, status: 'expired' as const })
    }
    return this.current
  }

  async start(): Promise<VerifiedChallengeSessionState> {
    this.syncAccount()
    if (this.current.status === 'starting' || this.current.status === 'active'
      || this.current.status === 'completion-pending' || this.current.status === 'retryable') return this.current
    if (this.current.status === 'start-unavailable' && this.retryDelaySeconds > 0) return this.current
    const accountId = this.accountIdentity
    if (!accountId) return this.current
    const generation = this.generation
    const operation = this.nextOperation()
    this.retryNotBefore = 0
    this.current = Object.freeze({ status: 'starting' as const })
    let started: VerifiedChallengeStartResponse
    try {
      started = await this.transport.start()
    } catch (error) {
      if (this.stillCurrent(accountId, generation, operation)) {
        const failure = startFailure(error)
        this.setRetryCooldown(failure.retryAfterSeconds)
        this.current = Object.freeze({ status: 'start-unavailable' as const, ...failure })
      }
      return this.current
    }
    if (!this.stillCurrent(accountId, generation, operation)) return this.current
    if (started.descriptor.accountId !== accountId) {
      this.current = Object.freeze({ status: 'idle' as const })
      return this.current
    }
    if (this.expired(started.descriptor)) {
      this.current = Object.freeze({ status: 'expired' as const, descriptor: started.descriptor,
        transcript: EMPTY, computeAttempts: 0 })
      return this.current
    }
    const recovered = this.storage.recover(accountId, started.descriptor)
    if (!recovered && !this.storage.begin(accountId, started.descriptor)) {
      this.current = Object.freeze({ status: 'start-unavailable' as const,
        reason: 'unavailable' as const, retryAfterSeconds: null })
      return this.current
    }
    const local = recovered ?? this.storage.recover(accountId, started.descriptor)
    if (!local) return this.current = Object.freeze({ status: 'idle' as const })
    this.current = local.completionPending
      ? this.retryable(started.descriptor, local.transcript, 0, 'pending', null, 'complete')
      : this.active(started.descriptor, local.transcript, 0)
    if (started.resumed) await this.refresh()
    return this.current
  }

  /** Recover is explicit and never allocates a challenge. */
  async recover(): Promise<VerifiedChallengeSessionState> {
    this.syncAccount()
    const accountId = this.accountIdentity
    if (!accountId) return this.current
    const local = this.storage.recover(accountId)
    if (!local) return this.current = Object.freeze({ status: 'idle' as const })
    this.current = local.completionPending
      ? this.retryable(local.descriptor, local.transcript, 0, 'pending', null, 'complete')
      : this.active(local.descriptor, local.transcript, 0)
    return this.refresh()
  }

  recordAcceptedFire(value: VerifiedChallengeHumanFire): boolean {
    if (this.syncAccount() || this.current.status !== 'active' || !this.accountIdentity) return false
    this.nextOperation()
    if (this.expired(this.current.descriptor)) {
      this.current = Object.freeze({ ...this.current, status: 'expired' as const })
      return false
    }
    if (!this.storage.recordAcceptedFire(this.accountIdentity, this.current.descriptor, value)) return false
    const recovered = this.storage.recover(this.accountIdentity, this.current.descriptor)
    if (!recovered) return false
    this.current = this.active(this.current.descriptor, recovered.transcript, this.current.computeAttempts)
    return true
  }

  async refresh(): Promise<VerifiedChallengeSessionState> {
    this.syncAccount()
    const details = this.details()
    const accountId = this.accountIdentity
    if (!details || !accountId) return this.current
    const completionPending = this.storage.recover(accountId, details.descriptor)?.completionPending === true
    const generation = this.generation
    const operation = this.nextOperation()
    try {
      const status = await this.transport.get(details.descriptor.sessionId)
      if (!this.stillCurrent(accountId, generation, operation)) return this.current
      return this.applyStatus(accountId, details, status, 'refresh')
    } catch (error) {
      if (this.stillCurrent(accountId, generation, operation)) {
        if (error instanceof VerifiedChallengeTransportError && (error.status === 404 || error.status === 409)) {
          this.storage.clearSession(accountId, details.descriptor.sessionId)
          this.current = Object.freeze({ ...details, status: 'invalid' as const })
        } else if (this.expired(details.descriptor) && !completionPending) {
          this.current = Object.freeze({ ...details, status: 'expired' as const })
        } else {
          const retry = retryReason(error)
          this.current = this.retryable(details.descriptor, details.transcript, details.computeAttempts,
            retry.reason, retry.retryAfterSeconds, completionPending ? 'complete' : 'refresh')
        }
      }
      return this.current
    }
  }

  async complete(): Promise<VerifiedChallengeSessionState> {
    this.syncAccount()
    const details = this.details()
    const accountId = this.accountIdentity
    if (!details || !accountId || details.transcript.length === 0
      || (this.current.status !== 'active' && this.current.status !== 'retryable')) return this.current
    if (this.expired(details.descriptor)) {
      return this.current = Object.freeze({ ...details, status: 'expired' as const })
    }
    const operation = this.nextOperation()
    if (!this.storage.markCompletionPending(accountId, details.descriptor)) {
      return this.current = this.retryable(details.descriptor, details.transcript, details.computeAttempts,
        'unavailable', null, 'refresh')
    }
    this.current = Object.freeze({ ...details, status: 'completion-pending' as const })
    const generation = this.generation
    try {
      const receipt = await this.transport.complete(details.descriptor.sessionId, details.transcript)
      if (!this.stillCurrent(accountId, generation, operation)) return this.current
      if (receipt.accountId !== accountId || receipt.sessionId !== details.descriptor.sessionId
        || !same(receipt.transcript, details.transcript)) {
        this.current = this.retryable(details.descriptor, details.transcript, details.computeAttempts,
          'unavailable', null, 'complete')
        return this.current
      }
      this.storage.clearSession(accountId, details.descriptor.sessionId)
      this.current = Object.freeze({ status: 'completed' as const, descriptor: details.descriptor, receipt })
    } catch (error) {
      if (this.stillCurrent(accountId, generation, operation)) {
        if (error instanceof VerifiedChallengeTransportError && (error.status === 404 || error.status === 409)) {
          this.storage.clearSession(accountId, details.descriptor.sessionId)
          this.current = Object.freeze({ ...details, status: 'invalid' as const })
        } else {
          const retry = retryReason(error)
          this.current = this.retryable(details.descriptor, details.transcript, details.computeAttempts,
            retry.reason, retry.retryAfterSeconds, 'complete')
        }
      }
    }
    return this.current
  }

  async retry(): Promise<VerifiedChallengeSessionState> {
    if (this.syncAccount() || this.current.status !== 'retryable' || !this.accountIdentity) return this.current
    if (this.retryDelaySeconds > 0) return this.current
    this.retryNotBefore = 0
    if (this.current.retryIntent === 'refresh') return this.refresh()
    if (this.current.retryIntent === 'abandon') return this.abandon()
    const accountId = this.accountIdentity
    const generation = this.generation
    const details = this.current
    const operation = this.nextOperation()
    this.current = Object.freeze({ status: 'completion-pending' as const,
      descriptor: details.descriptor, transcript: details.transcript, computeAttempts: details.computeAttempts })
    let status: VerifiedChallengeStatusResponse
    try {
      status = await this.transport.get(details.descriptor.sessionId)
    } catch (error) {
      if (this.stillCurrent(accountId, generation, operation)) {
        if (error instanceof VerifiedChallengeTransportError && (error.status === 404 || error.status === 409)) {
          this.storage.clearSession(accountId, details.descriptor.sessionId)
          this.current = Object.freeze({ ...details, status: 'invalid' as const })
        } else {
          const retry = retryReason(error)
          this.current = this.retryable(details.descriptor, details.transcript, details.computeAttempts,
            retry.reason, retry.retryAfterSeconds, 'complete')
        }
      }
      return this.current
    }
    if (!this.stillCurrent(accountId, generation, operation)) return this.current
    const applied = this.applyStatus(accountId, details, status, 'complete')
    return status.status === 'active' && same(status.descriptor, details.descriptor)
      && (applied.status === 'active' || applied.status === 'retryable')
      ? this.complete()
      : applied
  }

  async abandon(): Promise<VerifiedChallengeSessionState> {
    this.syncAccount()
    const details = this.details()
    const accountId = this.accountIdentity
    if (!details || !accountId) return this.current
    const generation = this.generation
    const operation = this.nextOperation()
    try {
      const status = await this.transport.abandon(details.descriptor.sessionId)
      if (!this.stillCurrent(accountId, generation, operation)) return this.current
      return this.applyStatus(accountId, details, status, 'abandon')
    } catch (error) {
      if (this.stillCurrent(accountId, generation, operation)) {
        if (error instanceof VerifiedChallengeTransportError && (error.status === 404 || error.status === 409)) {
          this.storage.clearSession(accountId, details.descriptor.sessionId)
          this.current = Object.freeze({ ...details, status: 'invalid' as const })
        } else {
          const retry = retryReason(error)
          this.current = this.retryable(details.descriptor, details.transcript, details.computeAttempts,
            retry.reason, retry.retryAfterSeconds, 'abandon')
        }
      }
      return this.current
    }
  }

  private applyStatus(
    accountId: string,
    local: ChallengeDetails,
    status: VerifiedChallengeStatusResponse,
    retryIntent: VerifiedChallengeRetryIntent,
  ): VerifiedChallengeSessionState {
    if (status.descriptor.accountId !== accountId || !same(status.descriptor, local.descriptor)) {
      return this.current = this.retryable(local.descriptor, local.transcript, local.computeAttempts,
        'unavailable', null, retryIntent)
    }
    if (status.status === 'completed') {
      if (!status.receipt) {
        return this.current = this.retryable(local.descriptor, local.transcript, local.computeAttempts,
          'unavailable', null, retryIntent)
      }
      this.storage.clearSession(accountId, local.descriptor.sessionId)
      return this.current = Object.freeze({ status: 'completed' as const,
        descriptor: status.descriptor, receipt: status.receipt })
    }
    if (status.status !== 'active') {
      this.storage.clearSession(accountId, local.descriptor.sessionId)
      return this.current = Object.freeze({ status: status.status, descriptor: status.descriptor,
        transcript: status.boundTranscript ?? local.transcript, computeAttempts: status.computeAttempts })
    }
    if (status.boundTranscript) {
      if (local.transcript.length > 0 && !same(local.transcript, status.boundTranscript)) {
        this.storage.clearSession(accountId, local.descriptor.sessionId)
        return this.current = Object.freeze({ status: 'invalid' as const, descriptor: status.descriptor,
          transcript: local.transcript, computeAttempts: status.computeAttempts })
      }
      if (!this.storage.bindServerTranscript(accountId, status.descriptor, status.boundTranscript)) {
        return this.current = this.retryable(local.descriptor, local.transcript, status.computeAttempts,
          'unavailable', null, retryIntent)
      }
      return this.current = this.retryable(status.descriptor, status.boundTranscript,
        status.computeAttempts, 'pending', null, 'complete')
    }
    const recovered = this.storage.recover(accountId, status.descriptor)
    const transcript = recovered?.transcript ?? local.transcript
    return this.current = recovered?.completionPending
      ? this.retryable(status.descriptor, transcript, status.computeAttempts, 'pending', null, 'complete')
      : this.active(status.descriptor, transcript, status.computeAttempts)
  }

  private details(): ChallengeDetails | null {
    const state = this.current
    if (state.status === 'active' || state.status === 'completion-pending' || state.status === 'retryable'
      || state.status === 'expired' || state.status === 'abandoned' || state.status === 'invalid'
      || state.status === 'verification_unavailable') return state
    return null
  }

  private active(
    descriptor: VerifiedChallengeDescriptor,
    transcript: readonly VerifiedChallengeHumanFire[],
    computeAttempts: number,
  ): VerifiedChallengeSessionState {
    this.retryNotBefore = 0
    return Object.freeze({ status: 'active' as const, descriptor, transcript, computeAttempts })
  }

  private retryable(
    descriptor: VerifiedChallengeDescriptor,
    transcript: readonly VerifiedChallengeHumanFire[],
    computeAttempts: number,
    reason: VerifiedChallengeRetryReason,
    retryAfterSeconds: number | null,
    retryIntent: VerifiedChallengeRetryIntent,
  ): VerifiedChallengeSessionState {
    this.setRetryCooldown(retryAfterSeconds)
    return Object.freeze({ status: 'retryable' as const, descriptor, transcript,
      computeAttempts, reason, retryAfterSeconds, retryIntent })
  }

  private setRetryCooldown(retryAfterSeconds: number | null): void {
    this.retryNotBefore = retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)
      ? this.now() + Math.max(0, retryAfterSeconds) * 1_000
      : 0
  }

  private nextOperation(): number { return ++this.operation }

  private stillCurrent(accountId: string, generation: number, operation: number): boolean {
    return operation === this.operation && generation === this.generation && this.accountIdentity === accountId
      && this.authenticatedAccountId() === accountId
  }

  private expired(descriptor: VerifiedChallengeDescriptor): boolean {
    const expiresAt = Date.parse(descriptor.expiresAt)
    return !Number.isFinite(expiresAt) || expiresAt <= this.now()
  }
}
