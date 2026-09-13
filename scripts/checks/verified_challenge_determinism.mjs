// AC02/03: fixed cq1 config/policy and immutable direct-engine baseline snapshots.
// Run: node --import tsx scripts/checks/verified_challenge_determinism.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { VerifiedChallengeController, createVerifiedChallengeOptions, replayVerifiedChallenge }
  from '../../shared/src/net/verifiedChallengeController.ts'
import { selectVerifiedChallengeCpuFire, selectVerifiedCpuFireV3 }
  from '../../shared/src/net/verifiedCpuPolicyV3.ts'

const initial = new GameEngine(createVerifiedChallengeOptions())
assert.throws(() => selectVerifiedChallengeCpuFire(initial, 'current-v3'), /unsupported.*policy/, 'cq1 CPU refuses unknown alias')
assert.deepEqual(selectVerifiedChallengeCpuFire(initial), selectVerifiedCpuFireV3(initial), 'wrapper preserves reviewed V3 selection')
for (const invalid of ['cq2', 42, { seed: 42 }, null]) {
  assert.throws(() => createVerifiedChallengeOptions(invalid), /unsupported.*edition/)
  assert.throws(() => VerifiedChallengeController.create(invalid), /unsupported.*edition/)
  assert.throws(() => replayVerifiedChallenge([{ angle: 32, power: 100 }], invalid), /unsupported.*edition/)
}
const options = createVerifiedChallengeOptions()
assert.deepEqual({ ...options, players: undefined }, { maxPlayers: 2, players: undefined, seed: 42,
  maxWind: 6, gravity: 0.15, walls: 'wrap', hazards: 'none', rounds: 1, interestRate: 0,
  suddenDeathTurn: 0, armsLevel: 0, teamMode: false, starterWeaponFalloff: 'decisive', rulesetVersion: 4 })
options.players[0].loadout.hull = 'jackal'; options.seed = 17
assert.equal(createVerifiedChallengeOptions().players[0].loadout.hull, 'foundry')
assert.equal(createVerifiedChallengeOptions().seed, 42)
const golden = JSON.parse(await readFile(new URL('./fixtures/verified_challenge_cq1.json', import.meta.url), 'utf8'))
assert.equal(golden.schema, 'verified-challenge-cq1-golden-v1')
const state = initial.getState()
assert.deepEqual({ phase: state.phase, wind: state.wind, activePlayerId: state.activePlayerId,
  tanks: state.tanks.map(({ id, x, y, health, angle, power, powerCap, shieldHp, alive, inventory, accessories, loadout }) =>
    ({ id, x, y, health, angle, power, powerCap, shieldHp, alive, inventory, accessories, loadout })) }, golden.initial)
for (const scenario of golden.scenarios) {
  const result = replayVerifiedChallenge(scenario.transcript)
  assert.deepEqual(result, scenario.result, `${scenario.id}: exact CPU, settled health, events and existing tick counts`)
  assert.deepEqual(replayVerifiedChallenge(scenario.transcript), result)
  for (const tickBatch of [1, 2, 4, 16]) {
    const controller = VerifiedChallengeController.create()
    for (const shot of scenario.transcript) {
      assert.equal(controller.applyHumanAction({ type: 'set_angle', angle: shot.angle }), true)
      assert.equal(controller.applyHumanAction({ type: 'set_power', power: shot.power }), true)
      assert.equal(controller.applyHumanAction({ type: 'fire' }), true)
      let ticks = 0
      while (!controller.complete && !controller.awaitingHuman) {
        for (let i = 0; i < tickBatch; i++) controller.tick()
        assert.ok((ticks += tickBatch) <= 800)
      }
    }
    assert.deepEqual(controller.result(), scenario.result, `${scenario.id}: browser-equivalent batch ${tickBatch}`)
    assert.ok(Object.isFrozen(controller.result()) && Object.isFrozen(controller.events)
      && controller.events.every(Object.isFrozen))
  }
}
for (const angle of [0, 180]) for (const power of [0, 100])
  assert.ok(golden.scenarios.some(({ id }) => id === `edge-${angle}-${power}`))
console.log(`verified-challenge-determinism: PASS (${golden.scenarios.length} cq1 golden trajectories, four fixed-tick batch sizes)`)
