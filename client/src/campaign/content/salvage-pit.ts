import { ASH_ROAD_EPISODE } from './episode'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import type { PlayerAction } from '@shared/types/PlayerAction'

const encounter = ASH_ROAD_EPISODE.encounters.find(
  ({ encounterId }) => encounterId === 'salvage-pit',
)!

export const SALVAGE_PIT_FIXTURE = Object.freeze({
  encounter,
  combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
})

function turn(
  actorId: 'p1' | 'p2' | 'p3',
  role: 'player' | 'enemy-ai',
  weapon: 'baby_missile' | 'missile' | 'cluster_bomb',
  angle: number,
  power: number,
) {
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

export const SALVAGE_PIT_TRANSCRIPTS = Object.freeze({
  preserve: Object.freeze({
    id: 'preserve',
    turns: Object.freeze([
      turn('p1', 'player', 'cluster_bomb', 16, 72),
      turn('p2', 'enemy-ai', 'cluster_bomb', 38.28657608060166, 43.85767035521567),
      turn('p3', 'enemy-ai', 'missile', 151.08649156917818, 43.73954530656338),
      turn('p1', 'player', 'missile', 16, 93),
    ]),
    expected: Object.freeze({
      humanHealth: 100, cacheHealth: 40, drumHealth: 5.4134204719321275,
    }),
  }),
  aggressive: Object.freeze({
    id: 'aggressive',
    turns: Object.freeze([
      turn('p1', 'player', 'cluster_bomb', 13, 78),
      turn('p2', 'enemy-ai', 'cluster_bomb', 27.286576080601662, 44.85767035521567),
      turn('p3', 'enemy-ai', 'missile', 154.08649156917818, 44.73954530656338),
      turn('p1', 'player', 'cluster_bomb', 13, 96),
    ]),
    expected: Object.freeze({ humanHealth: 100, cacheHealth: 0, drumHealth: 0 }),
  }),
})
