import { describe, expect, it } from 'vitest'
import { buildBitmap } from '../engine/Terrain.ts'
import { createCampaignGameEngine } from './initialization.ts'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from './combatProfiles.ts'
import {
  applyCampaignZoneDamage,
  createCampaignIncendiaryZone,
  projectCampaignZoneSurface,
  resolveCampaignZoneExposure,
} from './zones.ts'

function flatTerrain(surfaceY = 300): Uint8Array {
  const heights = new Uint16Array(1200).fill(surfaceY)
  return buildBitmap(heights)
}

const actor = Object.freeze({ id: 'p1', x: 500, y: 300, width: 28, height: 20 })

describe('campaign commitment-persistent zones', () => {
  it('skips birth and expires absolutely before B + 2N + 1 consequences', () => {
    const zone = createCampaignIncendiaryZone({
      id: 'zone-1', centerX: 500, birthCommitmentId: 3, initialRosterSize: 2,
      actorId: 'p2', rootCommitmentId: 3, radius: 48, damage: 12,
    })
    expect(zone.expiryCommitmentId).toBe(8)
    expect(resolveCampaignZoneExposure({
      zones: [zone], commitmentId: 3, actingTank: actor, terrain: flatTerrain(),
    })).toMatchObject({ damage: 0, zones: [zone] })
    expect(resolveCampaignZoneExposure({
      zones: [zone], commitmentId: 7, actingTank: actor, terrain: flatTerrain(),
    }).damage).toBe(12)
    expect(resolveCampaignZoneExposure({
      zones: [zone], commitmentId: 8, actingTank: actor, terrain: flatTerrain(),
    })).toEqual({ damage: 0, sourceZoneId: null, zones: [] })
  })

  it('applies only the highest overlapping zone once at the completed commitment', () => {
    const low = createCampaignIncendiaryZone({
      id: 'zone-low', centerX: 490, birthCommitmentId: 1, initialRosterSize: 2,
      actorId: 'p2', rootCommitmentId: 1, radius: 48, damage: 12,
    })
    const high = createCampaignIncendiaryZone({
      id: 'zone-high', centerX: 510, birthCommitmentId: 2, initialRosterSize: 2,
      actorId: 'p2', rootCommitmentId: 2, radius: 48, damage: 20,
    })
    expect(resolveCampaignZoneExposure({
      zones: [low, high], commitmentId: 3, actingTank: actor, terrain: flatTerrain(),
    })).toMatchObject({ damage: 20, sourceZoneId: 'zone-high' })
  })

  it('does not charge movement steps and samples only the final legal boundary position', () => {
    const zone = createCampaignIncendiaryZone({
      id: 'zone-1', centerX: 500, birthCommitmentId: 1, initialRosterSize: 2,
      actorId: 'p2', rootCommitmentId: 1, radius: 48, damage: 12,
    })
    const intermediateMovementPositions = [450, 470, 490, 510, 540]
    expect(intermediateMovementPositions).toHaveLength(5)
    const finalOutside = { ...actor, x: 600 }
    expect(resolveCampaignZoneExposure({
      zones: [zone], commitmentId: 2, actingTank: finalOutside, terrain: flatTerrain(),
    }).damage).toBe(0)
    expect(resolveCampaignZoneExposure({
      zones: [zone], commitmentId: 2, actingTank: actor, terrain: flatTerrain(),
    }).damage).toBe(12)
  })

  it('uses the existing damage-pool rule for shield absorption and hull overflow', () => {
    expect(applyCampaignZoneDamage({ health: 100, shieldHp: 20, damage: 12 }))
      .toEqual({ health: 100, shieldHp: 8, absorbed: 12, hullDamage: 0 })
    expect(applyCampaignZoneDamage({ health: 100, shieldHp: 5, damage: 12 }))
      .toEqual({ health: 93, shieldHp: 0, absorbed: 5, hullDamage: 7 })
  })

  it('reprojects its visible strip from current terrain rather than floating at birth height', () => {
    const zone = createCampaignIncendiaryZone({
      id: 'zone-1', centerX: 500, birthCommitmentId: 1, initialRosterSize: 2,
      actorId: 'p2', rootCommitmentId: 1, radius: 4, damage: 12,
    })
    const terrain = flatTerrain()
    expect(projectCampaignZoneSurface(zone, terrain, 4)).toEqual([
      { x: 496, y: 300 }, { x: 500, y: 300 }, { x: 504, y: 300 },
    ])
    for (let y = 280; y < 330; y += 1) terrain[y * 1200 + 500] = 0
    expect(projectCampaignZoneSurface(zone, terrain, 4)).toEqual([
      { x: 496, y: 300 }, { x: 500, y: 330 }, { x: 504, y: 300 },
    ])
  })

  it('integrates opt-in Napalm zones at commitment boundaries without changing default content', () => {
    const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
    const encounter = {
      kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
      encounterId: 'zone-fixture', combatProfileId: profile.profileId,
      combatProfileVersion: profile.profileVersion, contentDigest: 'd'.repeat(64), seed: 4201,
      terrain: {
        kind: 'height-control-points', version: 1, width: 1200, bitmapHeight: 600, floorY: 400,
        points: [
          { x: 0, y: 325 }, { x: 160, y: 305 }, { x: 372, y: 305 },
          { x: 560, y: 350 }, { x: 700, y: 305 }, { x: 850, y: 305 },
          { x: 1040, y: 325 }, { x: 1199, y: 325 },
        ],
      },
      spawns: [
        { id: 'p1', role: 'human', x: 280, hull: 100,
          equipment: ['baby_missile', 'missile', 'cluster_bomb', 'sandhog', 'napalm', 'shield'] },
        { id: 'p2', role: 'defender', x: 800, hull: 100,
          equipment: ['baby_missile', 'missile', 'cluster_bomb'] },
      ],
      objects: [],
      objective: { kind: 'eliminate', protectedObjectIds: [] },
      warning: null,
      zonePolicy: { kind: 'incendiary', radius: 48, damage: 12, maxLive: 4 },
    } as const
    const engine = createCampaignGameEngine({
      encounter,
      combatProfile: profile,
    })
    const firstTwoTurns = [
      [{ type: 'select_weapon', weapon: 'napalm' }, { type: 'set_angle', angle: 19 },
        { type: 'set_power', power: 76 }, { type: 'fire' }],
      [{ type: 'select_weapon', weapon: 'cluster_bomb' },
        { type: 'set_angle', angle: 121.110796936322 },
        { type: 'set_power', power: 68.07412087395787 }, { type: 'fire' }],
    ] as const
    for (const turn of firstTwoTurns) {
      for (const action of turn) expect(engine.applyAction(action)).toBe(true)
      let ticks = 0
      while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
        if (ticks++ >= 2_000) throw new Error('zone integration settlement exceeded bound')
        engine.tick()
      }
    }
    expect(engine.getState().campaign?.zones).toEqual([expect.objectContaining({
      id: 'zone-1', birthCommitmentId: 1, expiryCommitmentId: 6,
    })])
    expect(engine.getState().tanks.find(({ id }) => id === 'p2')?.health).toBeCloseTo(33.4, 8)
    const damage = engine.getState().campaign?.settledOutcome?.damage
    expect(damage?.hazardDamage).toBe(12)
    expect(damage?.components).toContainEqual(expect.objectContaining({
        damageKind: 'hazard', source: { kind: 'hazard', id: 'zone-1' }, amount: 12,
      }))
    const clone = engine.clone()
    expect(clone.getState()).toEqual(engine.getState())
    expect(clone.getState().campaign?.zones).not.toBe(engine.getState().campaign?.zones)

    const limitEngine = createCampaignGameEngine({
      encounter: {
        ...encounter,
        spawns: [
          encounter.spawns[0],
          {
            ...encounter.spawns[1],
            equipment: [...encounter.spawns[1].equipment, 'napalm'],
          },
        ],
        zonePolicy: { ...encounter.zonePolicy, maxLive: 1 },
      },
      combatProfile: profile,
    })
    const capacityTurns = [
      firstTwoTurns[0],
      [{ type: 'select_weapon', weapon: 'napalm' },
        { type: 'set_angle', angle: 121.110796936322 },
        { type: 'set_power', power: 68.07412087395787 }, { type: 'fire' }],
    ] as const
    for (const turn of capacityTurns) {
      for (const action of turn) expect(limitEngine.applyAction(action)).toBe(true)
      let ticks = 0
      expect(() => {
        while (limitEngine.getState().phase === 'FIRING'
          || limitEngine.getState().phase === 'RESOLVING') {
          if (ticks++ >= 2_000) throw new Error('zone limit settlement exceeded bound')
          limitEngine.tick()
        }
      }).not.toThrow()
    }
    expect(limitEngine.getState().phase).toBe('GAME_OVER')
    expect(limitEngine.getState().campaign?.result).toEqual({
      outcome: 'technical-failure', reason: 'technical-failure', code: 'zone-limit',
      reward: false, commitmentId: 2,
    })
    expect(limitEngine.getState().campaign?.effects?.technicalFailure?.code).toBe('zone-limit')
    expect(limitEngine.getState().campaign?.zones).toHaveLength(1)
  })
})
