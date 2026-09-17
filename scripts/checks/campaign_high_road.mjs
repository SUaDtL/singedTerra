import assert from 'node:assert/strict'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import { computeCampaignTactic } from '../../shared/src/campaign/tactics.ts'
import {
  HIGH_ROAD_FIXTURE,
  HIGH_ROAD_TRANSCRIPTS,
} from '../../client/src/campaign/content/high-road.ts'

for (const transcript of Object.values(HIGH_ROAD_TRANSCRIPTS)) {
  const engine = createCampaignGameEngine(HIGH_ROAD_FIXTURE)
  for (const [index, turn] of transcript.turns.entries()) {
    const state = engine.getState()
    assert.equal(state.activePlayerId, turn.actorId, `${transcript.id} actor ${index}`)
    if (turn.role === 'enemy-ai') {
      const actor = state.tanks.find(({ id }) => id === turn.actorId)
      const planned = computeCampaignTactic({
        engine, actorId: actor.id, difficulty: actor.ai, generation: index + 1,
        isGenerationCurrent: () => true,
      })
      assert.equal(planned.status, 'planned')
      assert.deepEqual(planned.plan, {
        weapon: turn.actions[0].weapon,
        angle: turn.actions[1].angle,
        power: turn.actions[2].power,
      }, `${transcript.id} retained CPU row ${index}`)
    }
    for (const action of turn.actions) {
      assert.equal(engine.applyAction(action), true, `${transcript.id} action ${index}`)
    }
    let ticks = 0
    while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
      assert.ok(ticks++ < 1_200, `${transcript.id} settlement bound ${index}`)
      engine.tick()
    }
    if (transcript.id === 'eliminate' && index === 0) {
      assert.equal(engine.getState().campaign.warning.status, 'canceled')
      assert.equal(engine.getState().campaign.warning.fired, false)
      assert.equal(engine.getState().campaign.objects.find(({ id }) => id === 'ridge-relay').alive, false)
    }
    if (transcript.id === 'survive' && index === 0) {
      assert.equal(engine.getState().campaign.warning.status, 'fired')
      assert.equal(engine.getState().tanks.find(({ id }) => id === 'p1').shieldHp, 55)
    }
  }
  const state = engine.getState()
  const campaign = state.campaign
  assert.equal(campaign.result.outcome, 'success')
  assert.equal(campaign.result.reason, transcript.expected.resultReason)
  assert.equal(state.tanks.find(({ id }) => id === 'p1').health, transcript.expected.humanHealth)
  assert.equal(state.tanks.find(({ id }) => id === 'p2').health, transcript.expected.defenderHealth)
  assert.equal(campaign.objects.find(({ id }) => id === 'pump').health, transcript.expected.pumpHealth)
  assert.equal(campaign.objects.find(({ id }) => id === 'ridge-relay').health, transcript.expected.relayHealth)
  assert.equal(campaign.warning.status, transcript.expected.warningStatus)
}

console.log('campaign-high-road: PASS (relay counterplay, shield response, elimination and survival)')
