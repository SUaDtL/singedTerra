import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerifiedDeploymentDescriptor } from './verifiedDeployment'
import {
  VERIFIED_DEPLOYMENT_STORAGE_KEY,
  VerifiedDeploymentStorage,
} from './verifiedDeploymentStorage'

const sessionId = '00000000-0000-4000-8000-000000000061'

const descriptor: VerifiedDeploymentDescriptor = {
  sessionId,
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

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
    raw: (key = VERIFIED_DEPLOYMENT_STORAGE_KEY) => values.get(key) ?? null,
  }
}

describe('VerifiedDeploymentStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('persists the exact bounded descriptor and rewrites after every accepted human fire', () => {
    const backing = memoryStorage()
    const storage = new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:00:00.000Z'))

    expect(storage.begin(descriptor)).toBe(true)
    expect(storage.recordAcceptedFire(descriptor, { angle: 37, power: 64 })).toBe(true)
    expect(storage.recordAcceptedFire(descriptor, { angle: 91, power: 100 })).toBe(true)

    expect(backing.setItem).toHaveBeenCalledTimes(3)
    expect(JSON.parse(backing.raw()!)).toEqual({
      storageVersion: 2,
      deployments: [{
        descriptor,
        transcript: [
          { angle: 37, power: 64 },
          { angle: 91, power: 100 },
        ],
        terminal: false,
      }],
    })
    expect(new TextEncoder().encode(backing.raw()!).byteLength).toBeLessThanOrEqual(2_048)
    expect(backing.raw()).not.toMatch(/bearer|token|password|email|userId|account-private-id/i)
  })

  it('reconstructs only against the same current Auth-owned server descriptor and deeply freezes it', () => {
    const backing = memoryStorage()
    const first = new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:00:00.000Z'))
    first.begin(descriptor)
    first.recordAcceptedFire(descriptor, { angle: 37, power: 64 })

    const recovered = new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:05:00.000Z'))
      .recover(descriptor)

    expect(recovered).toEqual({
      descriptor,
      transcript: [{ angle: 37, power: 64 }],
      terminal: false,
    })
    expect(Object.isFrozen(recovered)).toBe(true)
    expect(Object.isFrozen(recovered?.descriptor.config.options.players)).toBe(true)
    expect(Object.isFrozen(recovered?.transcript[0])).toBe(true)
  })

  it('retains the exact accepted transcript when terminal completion must be retried', () => {
    const backing = memoryStorage()
    const storage = new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:00:00.000Z'))
    storage.begin(descriptor)
    storage.recordAcceptedFire(descriptor, { angle: 37, power: 64 })
    storage.recordAcceptedFire(descriptor, { angle: 91, power: 100 })

    expect(storage.markTerminal(descriptor)).toBe(true)
    expect(new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:10:00.000Z')).recover(descriptor))
      .toEqual({
        descriptor,
        transcript: [{ angle: 37, power: 64 }, { angle: 91, power: 100 }],
        terminal: true,
      })
  })

  it.each([
    ['corrupt JSON', '{'],
    ['widened envelope', JSON.stringify({ storageVersion: 2, deployments: [{ descriptor, transcript: [], terminal: false }], token: 'private' })],
    ['unknown storage version', JSON.stringify({ storageVersion: 1, deployments: [{ descriptor, transcript: [], terminal: false }] })],
    ['unknown contract version', JSON.stringify({ storageVersion: 2, deployments: [{ descriptor: { ...descriptor, contractVersion: 2 }, transcript: [], terminal: false }] })],
    ['unknown engine version', JSON.stringify({ storageVersion: 2, deployments: [{ descriptor: { ...descriptor, engineVersion: 2 }, transcript: [], terminal: false }] })],
    ['unknown ruleset version', JSON.stringify({ storageVersion: 2, deployments: [{ descriptor: { ...descriptor, rulesetVersion: 4 }, transcript: [], terminal: false }] })],
    ['widened transcript fire', JSON.stringify({ storageVersion: 2, deployments: [{ descriptor, transcript: [{ angle: 37, power: 64, cpu: true }], terminal: false }] })],
    ['lost terminal transcript', JSON.stringify({ storageVersion: 2, deployments: [{ descriptor, transcript: [], terminal: true }] })],
  ])('clears and refuses %s', (_label, raw) => {
    const backing = memoryStorage()
    backing.setItem(VERIFIED_DEPLOYMENT_STORAGE_KEY, raw)

    expect(new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:00:00.000Z')).recover(descriptor))
      .toBeNull()
    expect(backing.raw()).toBeNull()
  })

  it('clears an expired descriptor and never reconstructs it for completion', () => {
    const backing = memoryStorage()
    const storage = new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:00:00.000Z'))
    storage.begin(descriptor)
    storage.recordAcceptedFire(descriptor, { angle: 37, power: 64 })
    storage.markTerminal(descriptor)

    expect(new VerifiedDeploymentStorage(backing, () => Date.parse(descriptor.expiresAt)).recover(descriptor))
      .toBeNull()
    expect(backing.raw()).toBeNull()
  })

  it('keeps mismatched sessions isolated so two switched accounts can recover their own deployment', () => {
    const backing = memoryStorage()
    const storage = new VerifiedDeploymentStorage(backing, () => Date.parse('2026-08-12T13:00:00.000Z'))
    storage.begin(descriptor)
    storage.recordAcceptedFire(descriptor, { angle: 37, power: 64 })
    const otherOwnerDescriptor = {
      ...descriptor,
      sessionId: '00000000-0000-4000-8000-000000000062',
    } as const

    expect(storage.recover(otherOwnerDescriptor)).toBeNull()
    expect(storage.begin(otherOwnerDescriptor)).toBe(true)
    expect(storage.recordAcceptedFire(otherOwnerDescriptor, { angle: 91, power: 80 })).toBe(true)
    expect(storage.recover(otherOwnerDescriptor)?.transcript).toEqual([{ angle: 91, power: 80 }])
    expect(storage.recover(descriptor)?.transcript).toEqual([{ angle: 37, power: 64 }])
  })

  it('fails closed when synchronous browser storage is unavailable', () => {
    const unavailable = {
      getItem: vi.fn(() => { throw new Error('raw private-mode failure') }),
      setItem: vi.fn(() => { throw new Error('raw quota failure') }),
      removeItem: vi.fn(() => { throw new Error('raw removal failure') }),
    }
    const storage = new VerifiedDeploymentStorage(unavailable, () => Date.parse('2026-08-12T13:00:00.000Z'))

    expect(storage.begin(descriptor)).toBe(false)
    expect(storage.recover(descriptor)).toBeNull()
    expect(() => storage.clear()).not.toThrow()
  })
})
