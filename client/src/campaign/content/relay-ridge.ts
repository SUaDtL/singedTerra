import { ASH_ROAD_EPISODE } from './episode'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import type { PlayerAction } from '@shared/types/PlayerAction'
import type { WeaponType } from '@shared/engine/WeaponSystem'

const encounter = ASH_ROAD_EPISODE.encounters.find(
  ({ encounterId }) => encounterId === 'relay-ridge',
)!

export const RELAY_RIDGE_FIXTURE = Object.freeze({
  encounter,
  combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
})

function turn(
  actorId: 'p1' | 'p2',
  role: 'player' | 'enemy-ai',
  weapon: WeaponType,
  angle: number,
  power: number,
) {
  return Object.freeze({
    actorId,
    role,
    plan: Object.freeze({ weapon, angle, power }),
    actions: Object.freeze([
      Object.freeze({ type: 'select_weapon', weapon }),
      Object.freeze({ type: 'set_angle', angle }),
      Object.freeze({ type: 'set_power', power }),
      Object.freeze(weapon === 'shield'
        ? { type: 'use_shield', weapon: 'shield' }
        : { type: 'fire' }),
    ] as PlayerAction[]),
  })
}

export const RELAY_RIDGE_TRANSCRIPTS = Object.freeze({
  relay: Object.freeze({
    id: 'relay',
    turns: Object.freeze([
      turn('p1', 'player', 'cluster_bomb', 10, 80),
      turn('p2', 'enemy-ai', 'cluster_bomb', 170.91735347989015, 94.21690496578813),
      turn('p1', 'player', 'cluster_bomb', 14, 96),
    ]),
    expected: Object.freeze({ humanHealth: 100, warningStatus: 'canceled', relayHealth: 0 }),
  }),
  direct: Object.freeze({
    id: 'direct',
    turns: Object.freeze([
      turn('p1', 'player', 'missile', 64, 88),
      turn('p2', 'enemy-ai', 'cluster_bomb', 150.91735347989015, 74.21690496578813),
      turn('p1', 'player', 'missile', 36, 72),
    ]),
    expected: Object.freeze({
      humanHealth: 65, warningStatus: 'fired', relayHealth: 1.05263157894737,
    }),
  }),
  footing: Object.freeze({
    id: 'footing',
    turns: Object.freeze([
      turn('p1', 'player', 'sandhog', 68, 94),
      turn('p2', 'enemy-ai', 'shield', 135, 50),
      turn('p1', 'player', 'sandhog', 72, 94),
    ]),
    expected: Object.freeze({
      humanHealth: 65, warningStatus: 'fired', relayHealth: 1.05263157894737,
      openingGunY: 280, firstSettledGunY: 307, finalGunY: 381,
    }),
  }),
})
