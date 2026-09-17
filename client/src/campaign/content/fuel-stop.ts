import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import type { PlayerAction } from '@shared/types/PlayerAction'
import { ASH_ROAD_EPISODE } from './episode'

export const FUEL_STOP_IDS = Object.freeze({
  encounter: 'fuel-stop',
  profile: 'ash-road-v1',
  human: 'p1',
  defender: 'p2',
  refinery: 'refinery',
  drums: Object.freeze(['drum-a', 'drum-b'] as const),
} as const)

const encounter = ASH_ROAD_EPISODE.encounters.find(
  ({ encounterId }) => encounterId === FUEL_STOP_IDS.encounter,
)
if (!encounter) throw new Error('Ash Road is missing its Fuel Stop encounter')

const combatProfile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
if (encounter.combatProfileId !== combatProfile.profileId
  || encounter.combatProfileVersion !== combatProfile.profileVersion) {
  throw new Error('Fuel Stop and the Ash Road combat profile disagree')
}

export const FUEL_STOP_FIXTURE = Object.freeze({ encounter, combatProfile })

export interface FuelStopTranscriptTurn {
  readonly actorId: 'p1' | 'p2'
  readonly owner: 'player' | 'enemy-ai'
  readonly actions: readonly PlayerAction[]
  readonly settlementTicks: number
}

export interface FuelStopTranscript {
  readonly id: 'preserve' | 'detonation'
  readonly turns: readonly FuelStopTranscriptTurn[]
  readonly expected: Readonly<{
    terrainChecksum: string
    terrainVersion: number
    humanHealth: number
    defenderHealth: number
    refineryHealth: number
    drumHealth: readonly [number, number]
    activatedDrumIds: readonly string[]
  }>
}

function turn(
  actorId: FuelStopTranscriptTurn['actorId'],
  owner: FuelStopTranscriptTurn['owner'],
  weapon: 'napalm' | 'missile' | 'cluster_bomb',
  angle: number,
  power: number,
  settlementTicks: number,
): FuelStopTranscriptTurn {
  return Object.freeze({
    actorId,
    owner,
    actions: Object.freeze([
      Object.freeze({ type: 'select_weapon', weapon }),
      Object.freeze({ type: 'set_angle', angle }),
      Object.freeze({ type: 'set_power', power }),
      Object.freeze({ type: 'fire' }),
    ] satisfies PlayerAction[]),
    settlementTicks,
  })
}

function transcript(input: FuelStopTranscript): FuelStopTranscript {
  return Object.freeze({
    ...input,
    turns: Object.freeze([...input.turns]),
    expected: Object.freeze({
      ...input.expected,
      drumHealth: Object.freeze([...input.expected.drumHealth]) as readonly [number, number],
      activatedDrumIds: Object.freeze([...input.expected.activatedDrumIds]),
    }),
  })
}

/**
 * Retained legal actions selected against the authored Fuel Stop definition.
 * Enemy rows match the real hard-AI plan used by CampaignClient (work budget 4,
 * derived personality). The test recomputes those rows before applying them.
 */
export const FUEL_STOP_TRANSCRIPTS = Object.freeze({
  preserve: transcript({
    id: 'preserve',
    turns: [
      turn('p1', 'player', 'napalm', 19, 76, 148),
      turn('p2', 'enemy-ai', 'cluster_bomb', 121.110796936322, 68.07412087395787, 123),
      turn('p1', 'player', 'napalm', 44, 74, 171),
    ],
    expected: {
      terrainChecksum: 'fnv1a32:6ea970c5',
      terrainVersion: 15,
      humanHealth: 48.571199141904266,
      defenderHealth: 0,
      refineryHealth: 100,
      drumHealth: [20, 20],
      activatedDrumIds: [],
    },
  }),
  detonation: transcript({
    id: 'detonation',
    turns: [
      turn('p1', 'player', 'missile', 24, 74, 64),
      turn('p2', 'enemy-ai', 'cluster_bomb', 113.110796936322, 77.07412087395787, 141),
      turn('p1', 'player', 'missile', 44, 84, 112),
    ],
    expected: {
      terrainChecksum: 'fnv1a32:5f5eeb4c',
      terrainVersion: 23,
      humanHealth: 53.58402066526687,
      defenderHealth: 0,
      refineryHealth: 100,
      drumHealth: [0, 0],
      activatedDrumIds: ['drum-a', 'drum-b'],
    },
  }),
} as const)
