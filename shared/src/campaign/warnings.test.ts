import { describe, expect, it } from 'vitest'
import { buildBitmap } from '../engine/Terrain.ts'
import { createCampaignGameEngine } from './initialization.ts'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from './combatProfiles.ts'
import {
  createCampaignAnnouncedStrike,
  findCampaignWarningResponses,
  resolveCampaignStrikeDamage,
  resolveCampaignWarningBoundary,
} from './warnings.ts'

const strike = () => createCampaignAnnouncedStrike({
  id: 'warning-1', sourceObjectId: 'relay', sourceSpawnId: 'p2',
  announcedAtHumanCommitment: 1, dueAfterHumanCommitment: 2,
  targetX: 500, maxDamage: 35, damageReach: 55, craterRadius: 24,
})

describe('campaign announced strikes', () => {
  it('owns a fixed visible target and explicit due human commitment', () => {
    const warning = strike()
    expect(warning).toMatchObject({
      id: 'warning-1', targetX: 500, visibleReach: 55,
      dueHumanCommitment: 2, status: 'pending',
    })
    expect(Object.isFrozen(warning)).toBe(true)
    expect(resolveCampaignWarningBoundary({
      warning, completedHumanCommitments: 1, sourceAlive: true,
    })).toMatchObject({ status: 'pending', targetX: 500 })
    expect(resolveCampaignWarningBoundary({
      warning, completedHumanCommitments: 2, sourceAlive: true,
    })).toMatchObject({ status: 'due', targetX: 500 })
  })

  it('cancels an unfired strike when its authored source is destroyed', () => {
    expect(resolveCampaignWarningBoundary({
      warning: strike(), completedHumanCommitments: 2, sourceAlive: false,
    })).toMatchObject({ status: 'canceled', fired: false })
  })

  it('uses the announced reach as the actual linear damage reach', () => {
    const warning = strike()
    expect(resolveCampaignStrikeDamage(warning, 500)).toBe(35)
    expect(resolveCampaignStrikeDamage(warning, 527.5)).toBeCloseTo(17.5)
    expect(resolveCampaignStrikeDamage(warning, 555)).toBe(0)
    expect(resolveCampaignStrikeDamage(warning, 556)).toBe(0)
  })

  it('does not certify an on-screen gap that legal fuel cannot reach', () => {
    const terrain = buildBitmap(new Uint16Array(1200).fill(300))
    expect(findCampaignWarningResponses({
      warning: strike(), tank: { x: 500, y: 300, width: 28, fuel: 40 }, terrain,
      objects: [], guaranteedShieldCharges: 0, guaranteedSourceShot: false,
    })).toEqual([])
    expect(findCampaignWarningResponses({
      warning: strike(), tank: { x: 500, y: 300, width: 28, fuel: 80 }, terrain,
      objects: [], guaranteedShieldCharges: 0, guaranteedSourceShot: false,
    })).toContainEqual(expect.objectContaining({ kind: 'move', safe: true }))
  })

  it('certifies only legal responses supplied by guaranteed equipment', () => {
    const terrain = buildBitmap(new Uint16Array(1200).fill(300))
    const responses = findCampaignWarningResponses({
      warning: strike(), tank: { x: 500, y: 300, width: 28, fuel: 0 }, terrain,
      objects: [], guaranteedShieldCharges: 1, guaranteedSourceShot: true,
    })
    expect(responses).toEqual([
      { kind: 'shield', safe: true },
      { kind: 'destroy-source', sourceObjectId: 'relay', safe: true },
    ])
  })

  it('cancels in the real engine when the response shot destroys the relay before impact', () => {
    const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
    const encounter = {
        kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
        encounterId: 'warning-fixture', combatProfileId: profile.profileId,
        combatProfileVersion: profile.profileVersion, contentDigest: 'e'.repeat(64), seed: 4301,
        terrain: {
          kind: 'height-control-points', version: 1, width: 1200, bitmapHeight: 600,
          floorY: 400, points: [{ x: 0, y: 300 }, { x: 1199, y: 300 }],
        },
        spawns: [
          { id: 'p1', role: 'human', x: 200, hull: 100,
            equipment: ['baby_missile', 'missile', 'shield'] },
          { id: 'p2', role: 'defender', x: 900, hull: 100,
            equipment: ['baby_missile', 'missile'] },
        ],
        objects: [{ id: 'relay', kind: 'relay', x: 500, width: 44, height: 36, health: 35 }],
        objective: { kind: 'eliminate', protectedObjectIds: [] },
        warning: { kind: 'announced-strike', sourceObjectId: 'relay', sourceSpawnId: 'p2' },
      } as const
    const engine = createCampaignGameEngine({
      encounter,
      combatProfile: profile,
    })
    expect(engine.getState().campaign?.warning).toMatchObject({ targetX: 200, status: 'pending' })
    for (const action of [
      { type: 'select_weapon', weapon: 'missile' },
      { type: 'set_angle', angle: 30 },
      { type: 'set_power', power: 44 },
      { type: 'fire' },
    ] as const) expect(engine.applyAction(action)).toBe(true)
    let ticks = 0
    while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
      if (ticks++ >= 2_000) throw new Error('warning cancellation settlement exceeded bound')
      engine.tick()
    }
    expect(engine.getState().campaign?.objects?.find(({ id }) => id === 'relay')?.alive).toBe(false)
    expect(engine.getState().campaign?.warning).toMatchObject({
      targetX: 200, status: 'canceled', fired: false,
    })
    expect(engine.getState().tanks.find(({ id }) => id === 'p1')?.health).toBe(100)

    const shieldEngine = createCampaignGameEngine({ encounter, combatProfile: profile })
    expect(shieldEngine.applyAction({ type: 'use_shield', weapon: 'shield' })).toBe(true)
    const shielded = shieldEngine.getState().tanks.find(({ id }) => id === 'p1')
    expect(shieldEngine.getState().campaign?.warning).toMatchObject({
      targetX: 200, status: 'fired', fired: true,
    })
    expect(shielded).toMatchObject({ health: 100, shieldHp: 55 })
    expect(shieldEngine.getState().campaign?.settledOutcome?.damage.components)
      .toContainEqual(expect.objectContaining({
        damageKind: 'shield', amount: 35, source: { kind: 'hazard', id: 'warning-1' },
      }))
    expect(shieldEngine.getState().terrainVersion).toBeGreaterThan(0)
  })
})
