import assert from 'node:assert/strict'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import { computeCampaignTactic } from '../../shared/src/campaign/tactics.ts'
import {
  SALVAGE_PIT_FIXTURE,
  SALVAGE_PIT_TRANSCRIPTS,
} from '../../client/src/campaign/content/salvage-pit.ts'

for (const transcript of Object.values(SALVAGE_PIT_TRANSCRIPTS)) {
  const engine = createCampaignGameEngine(SALVAGE_PIT_FIXTURE)
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
  }
  const state = engine.getState()
  assert.deepEqual(state.campaign.result, {
    outcome: 'success', reason: 'objective', commitmentId: 4,
  })
  assert.equal(state.tanks.find(({ id }) => id === 'p1').health, transcript.expected.humanHealth)
  assert.equal(state.tanks.filter(({ id }) => id !== 'p1').every(({ alive }) => !alive), true)
  assert.equal(state.campaign.objects.find(({ id }) => id === 'drill-cache').health,
    transcript.expected.cacheHealth)
  assert.equal(state.campaign.objects.find(({ id }) => id === 'drum-c').health,
    transcript.expected.drumHealth)
}

assert.equal(SALVAGE_PIT_TRANSCRIPTS.preserve.expected.cacheHealth, 40)
assert.equal(SALVAGE_PIT_TRANSCRIPTS.aggressive.expected.cacheHealth, 0)
console.log('campaign-salvage-pit: PASS (cache-preserve and aggressive paths, objective independent)')
