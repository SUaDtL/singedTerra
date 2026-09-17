import assert from 'node:assert/strict'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import { computeCampaignTactic } from '../../shared/src/campaign/tactics.ts'
import {
  RELAY_RIDGE_FIXTURE,
  RELAY_RIDGE_TRANSCRIPTS,
} from '../../client/src/campaign/content/relay-ridge.ts'

for (const transcript of Object.values(RELAY_RIDGE_TRANSCRIPTS)) {
  const engine = createCampaignGameEngine(RELAY_RIDGE_FIXTURE)
  assert.equal(engine.getState().tanks.find(({ id }) => id === 'p2').health, 100)
  if (transcript.id === 'footing') {
    assert.equal(engine.getState().tanks.find(({ id }) => id === 'p2').y,
      transcript.expected.openingGunY)
  }
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
      assert.deepEqual(planned.plan, turn.plan, `${transcript.id} retained CPU row ${index}`)
    }
    for (const action of turn.actions) {
      assert.equal(engine.applyAction(action), true, `${transcript.id} action ${index}`)
    }
    let ticks = 0
    while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
      assert.ok(ticks++ < 1_200, `${transcript.id} settlement bound ${index}`)
      engine.tick()
    }
    if (transcript.id === 'relay' && index === 0) {
      assert.equal(engine.getState().campaign.warning.status, 'canceled')
      assert.equal(engine.getState().campaign.objects.find(({ id }) => id === 'siege-relay').health, 0)
      assert.equal(engine.getState().tanks.find(({ id }) => id === 'p2').health, 100)
    }
    if (transcript.id === 'direct' && index === 0) {
      assert.equal(engine.getState().tanks.find(({ id }) => id === 'p2').health, 58.83650247089327)
      assert.equal(engine.getState().campaign.objects.find(({ id }) => id === 'siege-relay').health, 35)
      assert.equal(engine.getState().campaign.objects.find(({ id }) => id === 'siege-drum').health, 20)
    }
    if (transcript.id === 'footing' && index === 0) {
      assert.equal(engine.getState().tanks.find(({ id }) => id === 'p2').y,
        transcript.expected.firstSettledGunY)
      assert.ok(engine.getState().tanks.find(({ id }) => id === 'p2').health < 100)
    }
  }
  const state = engine.getState()
  assert.deepEqual(state.campaign.result, {
    outcome: 'success', reason: 'objective', commitmentId: 3,
  })
  assert.equal(state.tanks.find(({ id }) => id === 'p1').health, transcript.expected.humanHealth)
  assert.equal(state.tanks.find(({ id }) => id === 'p2').health, 0)
  if (transcript.id === 'footing') {
    assert.equal(state.tanks.find(({ id }) => id === 'p2').y,
      transcript.expected.finalGunY)
  }
  assert.equal(state.campaign.warning.status, transcript.expected.warningStatus)
  assert.equal(state.campaign.objects.find(({ id }) => id === 'siege-relay').health,
    transcript.expected.relayHealth)
}

console.log('campaign-relay-ridge: PASS (relay, direct gun, and footing counterplay at 100 hull)')
