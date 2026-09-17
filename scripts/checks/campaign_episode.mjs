import assert from 'node:assert/strict'
import { parseCampaignRun } from '../../shared/src/campaign/definitions.ts'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import {
  campaignDescriptorFromCheckpoint,
  createCampaignCheckpoint,
} from '../../client/src/campaign/checkpoint.ts'
import { ASH_ROAD_EPISODE } from '../../client/src/campaign/content/episode.ts'
import { FUEL_STOP_TRANSCRIPTS } from '../../client/src/campaign/content/fuel-stop.ts'
import { HIGH_ROAD_TRANSCRIPTS } from '../../client/src/campaign/content/high-road.ts'
import { SALVAGE_PIT_TRANSCRIPTS } from '../../client/src/campaign/content/salvage-pit.ts'
import { RELAY_RIDGE_TRANSCRIPTS } from '../../client/src/campaign/content/relay-ridge.ts'
import { createCampaignLoadout } from '../../client/src/campaign/loadout.ts'
import {
  advanceCampaignEncounter,
  applyCampaignCheckpointDecision,
  applyCampaignResult,
  chooseCampaignRoute,
  createCampaignResultReceipt,
  createCampaignRunState,
} from '../../client/src/campaign/runReducer.ts'

const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)

function initialState(routeId) {
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === routeId)
  const run = parseCampaignRun({
    kind: 'campaign-run', runVersion: 1, runId: `episode-${routeId}`,
    episodeId: ASH_ROAD_EPISODE.episodeId, episodeVersion: 1,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    combatProfileId: profile.profileId, combatProfileVersion: 1,
    combatProfileContentDigest: profile.contentDigest,
    routeId: route.id, encounterIds: route.encounterIds, currentEncounterIndex: 0,
  })
  const checkpoint = createCampaignCheckpoint({
    run, encounter: ASH_ROAD_EPISODE.encounters[0], combatProfile: profile,
    attempt: 1, supplies: 2,
  })
  const loadout = createCampaignLoadout({
    offensiveWeaponIds: ['missile', 'cluster_bomb'],
  })
  return chooseCampaignRoute(createCampaignRunState(checkpoint, loadout), {
    kind: 'campaign-route-choice', routeChoiceVersion: 1, routeId,
  })
}

function play(state, transcript) {
  const engine = createCampaignGameEngine(campaignDescriptorFromCheckpoint(
    state.checkpoint,
    state.attemptCheckpoint.loadout,
  ))
  const commands = []
  for (const turn of transcript.turns) {
    assert.equal(engine.getState().activePlayerId, turn.actorId)
    for (const action of turn.actions) {
      assert.equal(engine.applyAction(action), true)
      commands.push(action)
    }
    let ticks = 0
    while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
      assert.ok(ticks++ < 1_200)
      engine.tick()
    }
  }
  assert.equal(engine.getState().campaign.result.outcome, 'success')
  const receipt = createCampaignResultReceipt({ runState: state, engine, replayCommands: commands })
  return applyCampaignResult(state, receipt)
}

function decideAndAdvance(state, choice = { kind: 'retain' }) {
  const decided = applyCampaignCheckpointDecision(state, {
    kind: 'campaign-checkpoint-decision', checkpointDecisionVersion: 1,
    resultAttempt: state.attempt, choice,
  })
  return advanceCampaignEncounter(decided, {
    kind: 'campaign-advance', advanceVersion: 1,
    fromEncounterId: state.checkpoint.encounter.encounterId,
  })
}

const routes = [
  {
    routeId: 'high-road-route', middle: HIGH_ROAD_TRANSCRIPTS.eliminate,
    expectedMiddle: 'high-road', expectedSupplies: 5,
  },
  {
    routeId: 'salvage-pit-route', middle: SALVAGE_PIT_TRANSCRIPTS.aggressive,
    expectedMiddle: 'salvage-pit', expectedSupplies: 5,
  },
]

for (const route of routes) {
  let state = initialState(route.routeId)
  state = play(state, FUEL_STOP_TRANSCRIPTS.detonation)
  state = decideAndAdvance(state)
  assert.equal(state.checkpoint.encounter.encounterId, route.expectedMiddle)
  assert.deepEqual(state.attemptCheckpoint.loadout, state.loadout)
  state = play(state, route.middle)
  state = decideAndAdvance(state, { kind: 'refill', weaponId: 'missile' })
  assert.equal(state.checkpoint.encounter.encounterId, 'relay-ridge')
  assert.equal(state.checkpoint.run.currentEncounterIndex, 2)
  state = play(state, RELAY_RIDGE_TRANSCRIPTS.direct)
  assert.equal(state.supplies, route.expectedSupplies)
  assert.equal(state.appliedResults.at(-1).result.encounterId, 'relay-ridge')
  assert.equal(state.pendingCheckpointDecision.resultAttempt, 1)
}

console.log('campaign-episode: PASS (both routes carry real settlement into natural finales)')
