import { describe, expect, it } from 'vitest'
import { createCampaignGameEngine } from './initialization.ts'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from './combatProfiles.ts'
import {
  CAMPAIGN_TACTIC_LIMITS,
  computeCampaignTactic,
  scoreCampaignTacticOutcome,
} from './tactics.ts'

function cpuDecisionEngine() {
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
  const engine = createCampaignGameEngine({
    encounter: {
      kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
      encounterId: 'tactic-fixture', combatProfileId: profile.profileId,
      combatProfileVersion: profile.profileVersion, contentDigest: 'f'.repeat(64), seed: 4401,
      terrain: {
        kind: 'height-control-points', version: 1, width: 1200, bitmapHeight: 600,
        floorY: 400, points: [{ x: 0, y: 300 }, { x: 1199, y: 300 }],
      },
      spawns: [
        { id: 'p1', role: 'human', x: 200, hull: 100,
          equipment: ['baby_missile', 'missile', 'shield'] },
        { id: 'p2', role: 'defender', x: 900, hull: 100,
          equipment: ['baby_missile', 'missile', 'cluster_bomb'] },
      ],
      objects: [
        { id: 'refinery', kind: 'protected', x: 300, width: 44, height: 36, health: 100 },
        { id: 'relay', kind: 'relay', x: 700, width: 44, height: 36, health: 100 },
      ],
      objective: { kind: 'eliminate', protectedObjectIds: ['refinery'] },
      warning: null,
    },
    combatProfile: profile,
  })
  expect(engine.applyAction({ type: 'use_shield', weapon: 'shield' })).toBe(true)
  expect(engine.getState().activePlayerId).toBe('p2')
  return engine
}

describe('campaign objective-aware tactics', () => {
  it('is deterministic, bounded, and selects from completed real-engine clones', () => {
    const engine = cpuDecisionEngine()
    const input = {
      engine, actorId: 'p2', difficulty: 'hard' as const, generation: 7,
      isGenerationCurrent: (generation: number) => generation === 7,
    }
    const first = computeCampaignTactic(input)
    const second = computeCampaignTactic(input)
    expect(first).toEqual(second)
    expect(first.status).toBe('planned')
    expect(first.plan).not.toBeNull()
    expect(first.metrics.candidatesStarted).toBeLessThanOrEqual(CAMPAIGN_TACTIC_LIMITS.maxCandidates)
    expect(first.metrics.candidatesCompleted).toBeGreaterThan(0)
    expect(first.metrics.clones).toBe(first.metrics.candidatesStarted)

    const simulated = engine.clone()
    const plan = first.plan!
    for (const action of [
      { type: 'select_weapon', weapon: plan.weapon },
      { type: 'set_angle', angle: plan.angle },
      { type: 'set_power', power: plan.power },
      { type: 'fire' },
    ] as const) expect(simulated.applyAction(action)).toBe(true)
    let ticks = 0
    while (simulated.getState().phase === 'FIRING' || simulated.getState().phase === 'RESOLVING') {
      if (ticks++ >= CAMPAIGN_TACTIC_LIMITS.maxTicksPerCandidate) {
        throw new Error('selected campaign tactic did not settle')
      }
      simulated.tick()
    }
    expect(simulated.getState().phase).toBe('PLAYER_TURN')
    expect(simulated.getState().activePlayerId).toBe('p1')
    const human = simulated.getState().tanks.find(({ id }) => id === 'p1')!
    const refinery = simulated.getState().campaign?.objects?.find(({ id }) => id === 'refinery')!
    expect(human.health < 100 || refinery.health < 100).toBe(true)
  })

  it('prefers declared objective damage and rejects relay/self harm', () => {
    const engine = cpuDecisionEngine()
    const before = engine.getState()
    const refinery = before.campaign!.objects!.find(({ id }) => id === 'refinery')!
    const protectedDamage = {
      ...before,
      campaign: {
        ...before.campaign!,
        objects: before.campaign!.objects!.map((object) => object.id === refinery.id
          ? { ...object, health: 50 }
          : object),
      },
    }
    const humanDamage = {
      ...before,
      tanks: before.tanks.map((tank) => tank.id === 'p1' ? { ...tank, health: 90 } : tank),
    }
    const selfDamage = {
      ...before,
      tanks: before.tanks.map((tank) => tank.id === 'p2' ? { ...tank, health: 90 } : tank),
    }
    const relayDamage = {
      ...before,
      campaign: {
        ...before.campaign!,
        objects: before.campaign!.objects!.map((object) => object.id === 'relay'
          ? { ...object, health: 50 }
          : object),
      },
    }
    expect(scoreCampaignTacticOutcome(before, protectedDamage, 'p2'))
      .toBeGreaterThan(scoreCampaignTacticOutcome(before, humanDamage, 'p2'))
    expect(scoreCampaignTacticOutcome(before, selfDamage, 'p2')).toBeLessThan(0)
    expect(scoreCampaignTacticOutcome(before, relayDamage, 'p2')).toBeLessThan(0)
  })

  it('rejects incomplete candidates and cancels stale generations', () => {
    const engine = cpuDecisionEngine()
    const incomplete = computeCampaignTactic({
      engine, actorId: 'p2', difficulty: 'hard', generation: 1,
      isGenerationCurrent: () => true, maxTicksPerCandidate: 0,
    })
    expect(incomplete).toMatchObject({ status: 'no-complete-candidate', plan: null })
    expect(incomplete.metrics.candidatesRejectedIncomplete).toBeGreaterThan(0)
    const stale = computeCampaignTactic({
      engine, actorId: 'p2', difficulty: 'hard', generation: 2,
      isGenerationCurrent: () => false,
    })
    expect(stale).toMatchObject({ status: 'canceled', plan: null })
    expect(stale.metrics).toMatchObject({ candidatesStarted: 0, clones: 0, ticks: 0 })
  })
})
