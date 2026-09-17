import { ASH_ROAD_EPISODE } from './episode'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import type { PlayerAction } from '@shared/types/PlayerAction'

const encounter = ASH_ROAD_EPISODE.encounters.find(
  ({ encounterId }) => encounterId === 'high-road',
)!

export const HIGH_ROAD_FIXTURE = Object.freeze({
  encounter,
  combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
})

export interface HighRoadTranscriptTurn {
  readonly actorId: 'p1' | 'p2'
  readonly role: 'player' | 'enemy-ai'
  readonly actions: readonly PlayerAction[]
}

function fireTurn(
  actorId: 'p1' | 'p2',
  role: HighRoadTranscriptTurn['role'],
  weapon: 'baby_missile' | 'missile' | 'cluster_bomb',
  angle: number,
  power: number,
): HighRoadTranscriptTurn {
  return Object.freeze({
    actorId,
    role,
    actions: Object.freeze([
      Object.freeze({ type: 'select_weapon', weapon }),
      Object.freeze({ type: 'set_angle', angle }),
      Object.freeze({ type: 'set_power', power }),
      Object.freeze({ type: 'fire' }),
    ] as PlayerAction[]),
  })
}

export const HIGH_ROAD_TRANSCRIPTS = Object.freeze({
  eliminate: Object.freeze({
    id: 'eliminate',
    turns: Object.freeze([
      fireTurn('p1', 'player', 'cluster_bomb', 21, 78),
      fireTurn('p2', 'enemy-ai', 'missile', 170.56672680424526, 94.57852579019963),
      fireTurn('p1', 'player', 'missile', 19, 78),
    ]),
    expected: Object.freeze({
      resultReason: 'objective', humanHealth: 100, defenderHealth: 0,
      pumpHealth: 40, relayHealth: 0, warningStatus: 'canceled',
    }),
  }),
  survive: Object.freeze({
    id: 'survive',
    turns: Object.freeze([
      Object.freeze({
        actorId: 'p1', role: 'player',
        actions: Object.freeze([{ type: 'use_shield', weapon: 'shield' }] as PlayerAction[]),
      }),
      fireTurn('p2', 'enemy-ai', 'cluster_bomb', 139.56672680424526, 75.57852579019963),
      fireTurn('p1', 'player', 'baby_missile', 180, 100),
      fireTurn('p2', 'enemy-ai', 'cluster_bomb', 137.26611971808597, 79.70642210394143),
      fireTurn('p1', 'player', 'baby_missile', 180, 100),
    ]),
    expected: Object.freeze({
      resultReason: 'limit', humanHealth: 53.773443118020296, defenderHealth: 100,
      pumpHealth: 95.54545454545455, relayHealth: 35, warningStatus: 'fired',
    }),
  }),
})
