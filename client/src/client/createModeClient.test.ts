import { describe, expect, it } from 'vitest'
import { ASH_ROAD_COMBAT_PROFILE_REFERENCE, resolveCampaignCombatProfile } from '@shared/campaign/combatProfiles'
import type { GameClient } from './GameClient'
import { ASH_ROAD_EPISODE } from '../campaign/content/episode'
import { createModeClient, type ClientConstructionSetup } from './createModeClient'

const campaignDescriptor = Object.freeze({
  encounter: ASH_ROAD_EPISODE.encounters[0]!,
  combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
})

function campaignSetup(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'hotseat',
    experience: 'campaign',
    campaign: campaignDescriptor,
    players: [
      { name: 'Ranger', color: '#e84d4d' },
      { name: 'Defender', color: '#4d8ce8', ai: 'hard' },
    ],
    playerNames: ['Ranger', 'Defender'],
    ...overrides,
  } as unknown as ClientConstructionSetup
}

describe('createModeClient campaign acquisition', () => {
  it('keeps transport hot-seat while returning the dedicated campaign GameClient', async () => {
    const client: GameClient = await createModeClient(campaignSetup())
    const campaignClient = client as GameClient & { readonly ownsCpuExecution?: boolean }

    expect(client.constructor.name).toBe('CampaignClient')
    expect(campaignClient.ownsCpuExecution).toBe(true)
    client.stop()
  })

  it('fails closed before acquiring resources for missing, invalid, or mixed campaign launch data', async () => {
    const cases = [
    ['invalid experience', { experience: 'corrupt', campaign: undefined }],
    ['null experience', { experience: null, campaign: undefined }],
    ['missing descriptor', { campaign: undefined }],
    ['null descriptor', { campaign: null }],
    ['invalid descriptor', { campaign: {} }],
    ['forged resolved profile', { campaign: {
      ...campaignDescriptor,
      combatProfile: {
        ...campaignDescriptor.combatProfile,
        contentDigest: 'f'.repeat(64),
      },
    } }],
    ['reordered profile choices', { campaign: {
      ...campaignDescriptor,
      combatProfile: {
        ...campaignDescriptor.combatProfile,
        choices: [
          campaignDescriptor.combatProfile.choices[1],
          campaignDescriptor.combatProfile.choices[0],
          ...campaignDescriptor.combatProfile.choices.slice(2),
        ],
      },
    } }],
    ['changed profile choice', { campaign: {
      ...campaignDescriptor,
      combatProfile: {
        ...campaignDescriptor.combatProfile,
        choices: campaignDescriptor.combatProfile.choices.map((choice, index) =>
          index === 1 ? 'nuke' : choice),
      },
    } }],
    ['profile id mismatch', { campaign: {
      ...campaignDescriptor,
      combatProfile: {
        ...campaignDescriptor.combatProfile,
        profileId: 'ash-road-forged',
      },
    } }],
    ['profile version mismatch', { campaign: {
      ...campaignDescriptor,
      combatProfile: {
        ...campaignDescriptor.combatProfile,
        profileVersion: 2,
      },
    } }],
    ['invalid carried loadout', { campaign: {
      ...campaignDescriptor,
      humanLoadout: { hull: 101, ammunition: [] },
    } }],
    ['network room id', { roomId: 'room-1' }],
    ['network room code', { roomCode: 'ASH-ROAD' }],
    ['network player id', { playerId: 'p1' }],
    ['network seat token', { token: 'seat-token' }],
    ['verified deployment', { verifiedDeployment: { descriptor: {} } }],
    ['verified challenge', { verifiedChallenge: { descriptor: {} } }],
    ['public seed challenge', { publicSeedChallenge: { seed: 17 } }],
    ] as const
    const acquired: string[] = []
    const unrelatedErrors: string[] = []

    for (const [label, override] of cases) {
      try {
        const client = await createModeClient(campaignSetup(override))
        acquired.push(label)
        client.stop()
      } catch (error) {
        if (!(error instanceof Error) || !/campaign/i.test(error.message)) {
          unrelatedErrors.push(`${label}: ${String(error)}`)
        }
      }
    }

    expect({ acquired, unrelatedErrors }).toEqual({ acquired: [], unrelatedErrors: [] })
  })
})
