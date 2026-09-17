import assert from 'node:assert/strict'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { CAMPAIGN_TACTIC_LIMITS, computeCampaignTactic } from '../../shared/src/campaign/tactics.ts'

const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
const engine = createCampaignGameEngine({
  encounter: {
    kind: 'campaign-encounter', episodeVersion: 1, encounterVersion: 1,
    encounterId: 'tactic-check', combatProfileId: profile.profileId,
    combatProfileVersion: 1, contentDigest: 'a'.repeat(64), seed: 4402,
    terrain: { kind: 'height-control-points', version: 1, width: 1200, bitmapHeight: 600,
      floorY: 400, points: [{ x: 0, y: 300 }, { x: 1199, y: 300 }] },
    spawns: [
      { id: 'p1', role: 'human', x: 200, hull: 100,
        equipment: ['baby_missile', 'missile', 'shield'] },
      { id: 'p2', role: 'defender', x: 900, hull: 100,
        equipment: ['baby_missile', 'missile', 'cluster_bomb'] },
    ],
    objects: [{ id: 'refinery', kind: 'protected', x: 300, width: 44, height: 36, health: 100 }],
    objective: { kind: 'eliminate', protectedObjectIds: ['refinery'] }, warning: null,
  },
  combatProfile: profile,
})
assert.equal(engine.applyAction({ type: 'use_shield', weapon: 'shield' }), true)
const planned = computeCampaignTactic({
  engine, actorId: 'p2', difficulty: 'hard', generation: 1,
  isGenerationCurrent: (generation) => generation === 1,
})
assert.equal(planned.status, 'planned')
assert.ok(planned.metrics.candidatesStarted <= CAMPAIGN_TACTIC_LIMITS.maxCandidates)
assert.ok(planned.metrics.candidatesCompleted > 0)
const stale = computeCampaignTactic({
  engine, actorId: 'p2', difficulty: 'hard', generation: 2,
  isGenerationCurrent: () => false,
})
assert.equal(stale.status, 'canceled')
assert.equal(stale.metrics.clones, 0)
console.log('campaign-ai: PASS (bounded real clones, complete selection, stale cancellation)')
