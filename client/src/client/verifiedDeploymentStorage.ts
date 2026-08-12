import type { VerifiedHumanFire } from '@shared/net/verifiedDuel'
import {
  parseVerifiedDeploymentDescriptor,
  parseVerifiedHumanFire,
  parseVerifiedTranscript,
  sameVerifiedDeploymentDescriptor,
  type VerifiedDeploymentDescriptor,
} from './verifiedDeployment'

export const VERIFIED_DEPLOYMENT_STORAGE_KEY = 'singedterra:verified-deployment'
export const VERIFIED_DEPLOYMENT_STORAGE_VERSION = 2 as const
export const VERIFIED_DEPLOYMENT_STORAGE_MAX_BYTES = 8_192
const VERIFIED_DEPLOYMENT_STORAGE_MAX_RECORDS = 4

type SynchronousStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface RecoveredVerifiedDeployment {
  readonly descriptor: VerifiedDeploymentDescriptor
  readonly transcript: readonly VerifiedHumanFire[]
  readonly terminal: boolean
}

type StoredVerifiedDeployment = RecoveredVerifiedDeployment

interface StoredVerifiedDeploymentEnvelope {
  readonly storageVersion: 2
  readonly deployments: readonly StoredVerifiedDeployment[]
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

function freezeRecovery(value: StoredVerifiedDeployment): RecoveredVerifiedDeployment {
  return Object.freeze({
    descriptor: value.descriptor,
    transcript: value.transcript,
    terminal: value.terminal,
  })
}

export class VerifiedDeploymentStorage {
  constructor(
    private readonly storage: SynchronousStorage = localStorage,
    private readonly now: () => number = Date.now,
  ) {}

  begin(descriptor: VerifiedDeploymentDescriptor): boolean {
    const accepted = parseVerifiedDeploymentDescriptor(descriptor)
    if (!accepted || Date.parse(accepted.expiresAt) <= this.now()) {
      return false
    }
    const retained = this.read().filter((entry) => entry.descriptor.sessionId !== accepted.sessionId)
    return this.write([...retained, {
      descriptor: accepted,
      transcript: Object.freeze([]),
      terminal: false,
    }])
  }

  recover(currentOwnerDescriptor: VerifiedDeploymentDescriptor): RecoveredVerifiedDeployment | null {
    const expected = parseVerifiedDeploymentDescriptor(currentOwnerDescriptor)
    if (!expected) return null
    if (Date.parse(expected.expiresAt) <= this.now()) {
      this.clear(expected)
      return null
    }
    const stored = this.read().find((entry) => sameVerifiedDeploymentDescriptor(entry.descriptor, expected))
    if (!stored) return null
    return freezeRecovery(stored)
  }

  recordAcceptedFire(
    descriptor: VerifiedDeploymentDescriptor,
    value: VerifiedHumanFire,
  ): boolean {
    const stored = this.recover(descriptor)
    const fire = parseVerifiedHumanFire(value)
    if (!stored || stored.terminal || !fire || stored.transcript.length >= stored.descriptor.limits.humanSalvos) {
      return false
    }
    return this.replace({
      descriptor: stored.descriptor,
      transcript: Object.freeze([...stored.transcript, fire]),
      terminal: false,
    })
  }

  markTerminal(descriptor: VerifiedDeploymentDescriptor): boolean {
    const stored = this.recover(descriptor)
    if (!stored || stored.transcript.length === 0) return false
    return this.replace({
      descriptor: stored.descriptor,
      transcript: stored.transcript,
      terminal: true,
    })
  }

  clear(descriptor?: VerifiedDeploymentDescriptor): void {
    try {
      if (!descriptor) {
        this.storage.removeItem(VERIFIED_DEPLOYMENT_STORAGE_KEY)
        return
      }
      const remaining = this.read().filter((entry) => entry.descriptor.sessionId !== descriptor.sessionId)
      if (remaining.length === 0) this.storage.removeItem(VERIFIED_DEPLOYMENT_STORAGE_KEY)
      else this.write(remaining)
    } catch {
      // Recovery is best-effort; unavailable browser storage stays fail-closed.
    }
  }

  private read(): readonly StoredVerifiedDeployment[] {
    let raw: string | null
    try {
      raw = this.storage.getItem(VERIFIED_DEPLOYMENT_STORAGE_KEY)
    } catch {
      return Object.freeze([])
    }
    if (raw === null) return Object.freeze([])
    if (new TextEncoder().encode(raw).byteLength > VERIFIED_DEPLOYMENT_STORAGE_MAX_BYTES) {
      this.clear()
      return Object.freeze([])
    }
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      this.clear()
      return Object.freeze([])
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.clear()
      return Object.freeze([])
    }
    const envelope = value as Record<string, unknown>
    if (!exactKeys(envelope, ['storageVersion', 'deployments'])
      || envelope.storageVersion !== VERIFIED_DEPLOYMENT_STORAGE_VERSION
      || !Array.isArray(envelope.deployments)
      || envelope.deployments.length > VERIFIED_DEPLOYMENT_STORAGE_MAX_RECORDS) {
      this.clear()
      return Object.freeze([])
    }
    const deployments: StoredVerifiedDeployment[] = []
    const sessionIds = new Set<string>()
    for (const candidate of envelope.deployments) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        this.clear()
        return Object.freeze([])
      }
      const record = candidate as Record<string, unknown>
      if (!exactKeys(record, ['descriptor', 'transcript', 'terminal']) || typeof record.terminal !== 'boolean') {
        this.clear()
        return Object.freeze([])
      }
      const descriptor = parseVerifiedDeploymentDescriptor(record.descriptor)
      const transcript = parseVerifiedTranscript(record.transcript)
      if (!descriptor || !transcript || sessionIds.has(descriptor.sessionId)
        || (record.terminal && transcript.length === 0)) {
        this.clear()
        return Object.freeze([])
      }
      sessionIds.add(descriptor.sessionId)
      if (Date.parse(descriptor.expiresAt) > this.now()) {
        deployments.push(Object.freeze({ descriptor, transcript, terminal: record.terminal }))
      }
    }
    if (deployments.length !== envelope.deployments.length) {
      if (deployments.length === 0) this.clear()
      else this.write(deployments)
    }
    return Object.freeze(deployments)
  }

  private replace(value: StoredVerifiedDeployment): boolean {
    const records = this.read().filter((entry) => entry.descriptor.sessionId !== value.descriptor.sessionId)
    return this.write([...records, value])
  }

  private write(deployments: readonly StoredVerifiedDeployment[]): boolean {
    if (deployments.length > VERIFIED_DEPLOYMENT_STORAGE_MAX_RECORDS) return false
    const envelope: StoredVerifiedDeploymentEnvelope = Object.freeze({
      storageVersion: VERIFIED_DEPLOYMENT_STORAGE_VERSION,
      deployments: Object.freeze([...deployments]),
    })
    const serialized = JSON.stringify(envelope)
    if (new TextEncoder().encode(serialized).byteLength > VERIFIED_DEPLOYMENT_STORAGE_MAX_BYTES) {
      this.clear()
      return false
    }
    try {
      this.storage.setItem(VERIFIED_DEPLOYMENT_STORAGE_KEY, serialized)
      return true
    } catch {
      return false
    }
  }
}
