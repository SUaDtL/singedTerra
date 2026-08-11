import type { VerifiedReplayPublicDetails } from './ProductionDiagnostics'

const VERIFIED_REPLAY_RESPONSE_CONTRACT = {
  ok: true,
  probeVersion: 1,
  engineVersion: 1,
  rulesetVersion: 3,
  fixtures: {
    maximumLifecycle: {
      phase: 'GAME_OVER', winner: 'p2', winnerTeam: 2, turn: 13,
      actionCount: 15, tickCount: 448, maxTurnTickCount: 34,
    },
    maximumTurn: {
      phase: 'GAME_OVER', winner: 'p1', winnerTeam: null, turn: 3,
      actionCount: 4, tickCount: 293, maxTurnTickCount: 198,
    },
  },
} as const

const VERIFIED_REPLAY_PUBLIC_DETAILS: VerifiedReplayPublicDetails = Object.freeze({
  ok: true,
  probeVersion: 1,
  engineVersion: 1,
  rulesetVersion: 3,
  fixtures: Object.freeze({
    maximumLifecycle: Object.freeze({
      phase: 'GAME_OVER', winner: 'p2', winnerTeam: 2, turn: 13,
      actionCount: 15, tickCount: 448, maxTurnTickCount: 34,
    }),
    maximumTurn: Object.freeze({
      phase: 'GAME_OVER', winner: 'p1', winnerTeam: null, turn: 3,
      actionCount: 4, tickCount: 293, maxTurnTickCount: 198,
    }),
  }),
})

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function matchesExactDataContract(value: unknown, expected: unknown): boolean {
  if (typeof expected === 'number') {
    return typeof value === 'number' && Number.isSafeInteger(value) && Object.is(value, expected)
  }
  if (expected === null || typeof expected !== 'object') return Object.is(value, expected)
  if (!isPlainRecord(value) || !isPlainRecord(expected)) return false

  const expectedKeys = Reflect.ownKeys(expected)
  const valueKeys = Reflect.ownKeys(value)
  if (valueKeys.length !== expectedKeys.length || valueKeys.some((key) => !expectedKeys.includes(key))) {
    return false
  }

  for (const key of expectedKeys) {
    const valueDescriptor = Object.getOwnPropertyDescriptor(value, key)
    const expectedDescriptor = Object.getOwnPropertyDescriptor(expected, key)
    if (
      !valueDescriptor
      || !valueDescriptor.enumerable
      || !('value' in valueDescriptor)
      || !expectedDescriptor
      || !('value' in expectedDescriptor)
      || !matchesExactDataContract(valueDescriptor.value, expectedDescriptor.value)
    ) return false
  }
  return true
}

export const validateVerifiedReplayProbeResponse = (value: unknown): boolean => {
  try {
    return matchesExactDataContract(value, VERIFIED_REPLAY_RESPONSE_CONTRACT)
  } catch {
    return false
  }
}

const projectVerifiedReplayPublicDetails = (): VerifiedReplayPublicDetails => {
  return Object.freeze({
    ...VERIFIED_REPLAY_PUBLIC_DETAILS,
    fixtures: Object.freeze({
      maximumLifecycle: Object.freeze({ ...VERIFIED_REPLAY_PUBLIC_DETAILS.fixtures.maximumLifecycle }),
      maximumTurn: Object.freeze({ ...VERIFIED_REPLAY_PUBLIC_DETAILS.fixtures.maximumTurn }),
    }),
  })
}

Object.freeze(validateVerifiedReplayProbeResponse)
Object.freeze(projectVerifiedReplayPublicDetails)

const VERIFIED_REPLAY_RUNTIME_ID = 'verified-replay-runtime' as const

const CHECKS = [
  Object.freeze({
    id: VERIFIED_REPLAY_RUNTIME_ID,
    label: 'Verified replay runtime',
    functionName: 'verified_replay_probe',
    validateResponse: validateVerifiedReplayProbeResponse,
    projectPublicDetails: projectVerifiedReplayPublicDetails,
  }),
] as const

export const PRODUCTION_DIAGNOSTIC_CHECKS = Object.freeze(CHECKS)

export type RegisteredDiagnosticId = typeof PRODUCTION_DIAGNOSTIC_CHECKS[number]['id']
export type ProductionDiagnosticDescriptor = (typeof PRODUCTION_DIAGNOSTIC_CHECKS)[number]
