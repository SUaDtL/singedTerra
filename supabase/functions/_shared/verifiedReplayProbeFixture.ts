export const VERIFIED_REPLAY_PROBE_VERSION = 1
export const VERIFIED_REPLAY_PROBE_ENGINE_VERSION = 1
export const VERIFIED_REPLAY_PROBE_RULESET_VERSION = 3

const BASE_OPTIONS = {
  seed: 0x7a17b00c,
  maxWind: 10,
  gravity: 0.15,
  walls: 'open',
  hazards: 'none',
  interestRate: 0,
  suddenDeathTurn: 0,
  armsLevel: 4,
  starterWeaponFalloff: 'decisive',
} as const

const MISSILE = {
  type: 'fire',
  angle: 90,
  power: 8,
  weapon: 'missile',
} as const

const maximumLifecycleConfig = {
  engineVersion: VERIFIED_REPLAY_PROBE_ENGINE_VERSION,
  rulesetVersion: VERIFIED_REPLAY_PROBE_RULESET_VERSION,
  options: {
    ...BASE_OPTIONS,
    players: [
      { name: 'P1', color: '#e84d4d', team: 1 },
      { name: 'P2', color: '#4d8ce8', team: 2 },
      { name: 'P3', color: '#4de884', team: 1 },
      { name: 'P4', color: '#e8c44d', team: 2 },
    ],
    maxPlayers: 4,
    rounds: 3,
    teamMode: true,
  },
} as const

const maximumTurnConfig = {
  engineVersion: VERIFIED_REPLAY_PROBE_ENGINE_VERSION,
  rulesetVersion: VERIFIED_REPLAY_PROBE_RULESET_VERSION,
  options: {
    ...BASE_OPTIONS,
    players: [
      { name: 'P1', color: '#e84d4d' },
      { name: 'P2', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    rounds: 1,
    teamMode: false,
  },
} as const

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}

export const VERIFIED_REPLAY_PROBE_FIXTURES = deepFreeze({
  maximumLifecycle: {
    config: maximumLifecycleConfig,
    transcript: [
      ...Array.from({ length: 7 }, () => MISSILE),
      { type: 'next_round' as const },
      ...Array.from({ length: 7 }, () => MISSILE),
    ],
  },
  maximumTurn: {
    config: maximumTurnConfig,
    transcript: [
      { type: 'fire' as const, angle: 25, power: 14, weapon: 'bouncing_betty' },
      MISSILE,
      MISSILE,
      MISSILE,
    ],
  },
  verifiedDuel: {
    seed: 17,
    transcript: Array.from({ length: 6 }, () => ({ angle: 0, power: 5 } as const)),
  },
} as const)
