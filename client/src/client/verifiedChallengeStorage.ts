import {
  parseVerifiedChallengeDescriptor,
  parseVerifiedChallengeTranscript,
  type VerifiedChallengeDescriptor,
  type VerifiedChallengeHumanFire,
} from '@shared/net/verifiedChallenge'

export const VERIFIED_CHALLENGE_STORAGE_KEY = 'singedterra:verified-challenge:cq1'
export const VERIFIED_CHALLENGE_STORAGE_VERSION = 1 as const
export const VERIFIED_CHALLENGE_STORAGE_MAX_BYTES = 4_096

type SynchronousStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface RecoveredVerifiedChallenge {
  readonly descriptor: VerifiedChallengeDescriptor
  readonly transcript: readonly VerifiedChallengeHumanFire[]
  readonly completionPending: boolean
}

interface StoredVerifiedChallenge extends RecoveredVerifiedChallenge {
  readonly storageVersion: 1
  readonly editionId: 'cq1'
  readonly accountId: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function parseTranscript(value: unknown): readonly VerifiedChallengeHumanFire[] | null {
  if (Array.isArray(value) && value.length === 0) return Object.freeze([])
  return parseVerifiedChallengeTranscript(value)
}

function sameDescriptor(left: unknown, right: unknown): boolean {
  const first = parseVerifiedChallengeDescriptor(left)
  const second = parseVerifiedChallengeDescriptor(right)
  return Boolean(first && second && JSON.stringify(first) === JSON.stringify(second))
}

function recovery(value: StoredVerifiedChallenge): RecoveredVerifiedChallenge {
  return Object.freeze({
    descriptor: value.descriptor,
    transcript: value.transcript,
    completionPending: value.completionPending,
  })
}

/** One fixed-edition, account-bound recovery record. No reward facts are stored locally. */
export class VerifiedChallengeStorage {
  constructor(private readonly storage: SynchronousStorage = localStorage) {}

  begin(accountId: string, descriptor: VerifiedChallengeDescriptor): boolean {
    const accepted = parseVerifiedChallengeDescriptor(descriptor)
    if (!accepted || accepted.accountId !== accountId || accepted.editionId !== 'cq1') return false
    const existing = this.read()
    if (existing && existing.accountId !== accountId) return false
    if (existing && existing.accountId === accountId && sameDescriptor(existing.descriptor, accepted)) return true
    return this.write({
      storageVersion: VERIFIED_CHALLENGE_STORAGE_VERSION,
      editionId: 'cq1',
      accountId,
      descriptor: accepted,
      transcript: Object.freeze([]),
      completionPending: false,
    })
  }

  recover(accountId: string, descriptor?: VerifiedChallengeDescriptor): RecoveredVerifiedChallenge | null {
    const stored = this.read()
    if (!stored || stored.accountId !== accountId || stored.descriptor.accountId !== accountId
      || (descriptor !== undefined && !sameDescriptor(stored.descriptor, descriptor))) return null
    return recovery(stored)
  }

  recordAcceptedFire(
    accountId: string,
    descriptor: VerifiedChallengeDescriptor,
    value: VerifiedChallengeHumanFire,
  ): boolean {
    const stored = this.readBound(accountId, descriptor)
    const fire = parseVerifiedChallengeTranscript([value])?.[0] ?? null
    if (!stored || stored.completionPending || !fire
      || stored.transcript.length >= stored.descriptor.limits.humanSalvos) return false
    return this.write({ ...stored, transcript: Object.freeze([...stored.transcript, fire]) })
  }

  markCompletionPending(accountId: string, descriptor: VerifiedChallengeDescriptor): boolean {
    const stored = this.readBound(accountId, descriptor)
    if (!stored || stored.transcript.length === 0) return false
    return this.write({ ...stored, completionPending: true })
  }

  bindServerTranscript(
    accountId: string,
    descriptor: VerifiedChallengeDescriptor,
    transcript: readonly VerifiedChallengeHumanFire[],
  ): boolean {
    const stored = this.readBound(accountId, descriptor)
    const accepted = parseVerifiedChallengeTranscript(transcript)
    if (!stored || !accepted) return false
    return this.write({ ...stored, transcript: accepted, completionPending: true })
  }

  clearAccount(accountId: string): void {
    try {
      const stored = this.read()
      if (stored?.accountId === accountId) this.storage.removeItem(VERIFIED_CHALLENGE_STORAGE_KEY)
    } catch {
      // Unavailable storage cannot retain trusted client state.
    }
  }

  clearSession(accountId: string, sessionId: string): void {
    try {
      const stored = this.read()
      if (stored?.accountId === accountId && stored.descriptor.sessionId === sessionId) {
        this.storage.removeItem(VERIFIED_CHALLENGE_STORAGE_KEY)
      }
    } catch {
      // Best-effort cleanup only.
    }
  }

  private readBound(accountId: string, descriptor: VerifiedChallengeDescriptor): StoredVerifiedChallenge | null {
    const stored = this.read()
    return stored && stored.accountId === accountId && sameDescriptor(stored.descriptor, descriptor) ? stored : null
  }

  private read(): StoredVerifiedChallenge | null {
    let raw: string | null
    try {
      raw = this.storage.getItem(VERIFIED_CHALLENGE_STORAGE_KEY)
    } catch {
      return null
    }
    if (raw === null) return null
    if (new TextEncoder().encode(raw).byteLength > VERIFIED_CHALLENGE_STORAGE_MAX_BYTES) {
      this.remove()
      return null
    }
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      this.remove()
      return null
    }
    if (!record(value) || !exactKeys(value, [
      'storageVersion', 'editionId', 'accountId', 'descriptor', 'transcript', 'completionPending',
    ]) || value.storageVersion !== VERIFIED_CHALLENGE_STORAGE_VERSION || value.editionId !== 'cq1'
      || typeof value.accountId !== 'string' || typeof value.completionPending !== 'boolean') {
      this.remove()
      return null
    }
    const descriptor = parseVerifiedChallengeDescriptor(value.descriptor)
    const transcript = parseTranscript(value.transcript)
    if (!descriptor || descriptor.accountId !== value.accountId || !transcript
      || (value.completionPending && transcript.length === 0)) {
      this.remove()
      return null
    }
    return Object.freeze({
      storageVersion: VERIFIED_CHALLENGE_STORAGE_VERSION,
      editionId: 'cq1',
      accountId: value.accountId,
      descriptor,
      transcript,
      completionPending: value.completionPending,
    })
  }

  private write(value: StoredVerifiedChallenge): boolean {
    const serialized = JSON.stringify(value)
    if (new TextEncoder().encode(serialized).byteLength > VERIFIED_CHALLENGE_STORAGE_MAX_BYTES) return false
    try {
      this.storage.setItem(VERIFIED_CHALLENGE_STORAGE_KEY, serialized)
      return true
    } catch {
      return false
    }
  }

  private remove(): void {
    try { this.storage.removeItem(VERIFIED_CHALLENGE_STORAGE_KEY) } catch { /* best effort */ }
  }
}
