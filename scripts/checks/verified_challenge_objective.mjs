// AC02: settled human CPU-health delta; terminal precedence and exact transcript ownership.
// Run: node --import tsx scripts/checks/verified_challenge_objective.mjs
import assert from 'node:assert/strict'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { createVerifiedDuelOptions } from '../../shared/src/net/verifiedDuel.ts'
import { evaluateVerifiedChallengeSalvo, VerifiedChallengeController, replayVerifiedChallenge }
  from '../../shared/src/net/verifiedChallengeController.ts'

// Controlled settled-state fixtures prove ordering independent of trajectory reachability.
const state = () => new GameEngine({ ...createVerifiedDuelOptions(42), walls: 'wrap' }).getState()
const before = { id: 'p2', health: 100 }
const damaged = state(); damaged.tanks[1].health = 99
assert.equal(evaluateVerifiedChallengeSalvo('human', before, damaged, 1), 'objective_cleared', 'AC02 settled health decrease clears')
assert.equal(evaluateVerifiedChallengeSalvo('human', before, damaged, 3), 'objective_cleared')
assert.equal(evaluateVerifiedChallengeSalvo('cpu', null, damaged, 1), null, 'CPU-turn damage never clears')
const falling = state(); falling.phase = 'RESOLVING'; falling.tanks[1].health = 80
assert.throws(() => evaluateVerifiedChallengeSalvo('human', before, falling, 1), /unsettled/)
falling.phase = 'PLAYER_TURN'; falling.tanks[1].health = 75
falling.tanks[0].totalDamage = 0 // Environmental fall loss is sufficient; shooter statistics are irrelevant.
assert.equal(evaluateVerifiedChallengeSalvo('human', before, falling, 1), 'objective_cleared')
const removed = state(); removed.tanks.splice(1, 1); removed.phase = 'GAME_OVER'
assert.equal(evaluateVerifiedChallengeSalvo('human', before, removed, 1), 'objective_cleared')
const simultaneous = state(); simultaneous.phase = 'GAME_OVER'
for (const tank of simultaneous.tanks) { tank.health = 0; tank.alive = false }
assert.equal(evaluateVerifiedChallengeSalvo('human', before, simultaneous, 3), 'objective_cleared')
for (const phase of ['GAME_OVER', 'ROUND_OVER']) {
  const terminal = state(); terminal.phase = phase
  assert.equal(evaluateVerifiedChallengeSalvo('human', before, terminal, 3), 'terminal_without_clear')
  terminal.tanks[1].health = 0; terminal.tanks[1].alive = false
  assert.equal(evaluateVerifiedChallengeSalvo('cpu', null, terminal, 1), 'terminal_without_clear', 'CPU self-kill fails')
  terminal.tanks[0].health = 0; terminal.tanks[0].alive = false
  assert.equal(evaluateVerifiedChallengeSalvo('cpu', null, terminal, 1), 'terminal_without_clear', 'CPU draw fails')
}
assert.equal(evaluateVerifiedChallengeSalvo('human', before, state(), 2), null)
assert.equal(evaluateVerifiedChallengeSalvo('human', before, state(), 3), 'objective_not_cleared')
assert.throws(() => evaluateVerifiedChallengeSalvo('human', null, state(), 1), /invalid.*snapshot/)
assert.throws(() => evaluateVerifiedChallengeSalvo('human', { id: 'p2', health: 0 }, state(), 1), /invalid.*snapshot/)

const fire = (controller, shot) => {
  assert.equal(controller.applyHumanAction({ type: 'set_angle', angle: shot.angle }), true)
  assert.equal(controller.applyHumanAction({ type: 'set_power', power: shot.power }), true)
  assert.equal(controller.applyHumanAction({ type: 'fire' }), true)
}
const settle = (controller) => {
  let ticks = 0
  while (!controller.complete && !controller.awaitingHuman) { controller.tick(); assert.ok(++ticks <= 782) }
}
const hit = { angle: 32, power: 100 }
const miss = { angle: 0, power: 100 }
const first = VerifiedChallengeController.create()
fire(first, hit)
assert.equal(first.complete, false)
assert.throws(() => first.result(), /incomplete/)
assert.equal(first.applyHumanAction({ type: 'fire' }), false)
settle(first)
assert.equal(first.result().terminal, 'objective_cleared')
assert.equal(first.result().cpuSalvos, 0, 'no CPU search/fire after early human success')
assert.equal(first.result().liveTicks, 118)
assert.equal(first.result().humanHealth, 100)
assert.equal(first.result().cpuHealth, 71.69216246578995)
assert.equal(first.engine.getState().phase, 'PLAYER_TURN', 'objective terminal precedes GAME_OVER')
const finished = first.result(); first.tick()
assert.deepEqual(first.result(), finished)
assert.equal(first.applyHumanAction({ type: 'fire' }), false)
assert.deepEqual(replayVerifiedChallenge([hit]), finished)
assert.throws(() => replayVerifiedChallenge([hit, miss]), /trailing/)
assert.throws(() => replayVerifiedChallenge([miss]), /incomplete/)
assert.throws(() => replayVerifiedChallenge([{ ...hit, weapon: 'baby_missile' }]), /invalid.*transcript/)
assert.throws(() => replayVerifiedChallenge([miss, miss, miss, miss]), /invalid.*transcript/)
const exhausted = replayVerifiedChallenge([miss, miss, miss])
assert.equal(exhausted.terminal, 'objective_not_cleared')
assert.equal(exhausted.humanSalvos, 3)
assert.equal(exhausted.cpuSalvos, 2, 'no CPU search/fire after third miss')
assert.equal(exhausted.liveTicks, 241)
const third = replayVerifiedChallenge([miss, miss, { angle: 32, power: 100 }])
assert.equal(third.terminal, 'objective_cleared')
assert.equal(third.humanSalvos, 3)
assert.equal(third.cpuSalvos, 2)
const live = VerifiedChallengeController.create()
for (const action of [{ type: 'buy', weapon: 'missile' }, { type: 'select_weapon', weapon: 'baby_missile' },
  { type: 'use_shield', weapon: 'shield' }, { type: 'next_round' },
  { type: 'set_angle', angle: 0.5 }, { type: 'set_angle', angle: 181 }, { type: 'set_power', power: 101 }])
  assert.equal(live.applyHumanAction(action), false)
live.engine.getState().tanks[0].alive = false; live.engine.getState().tanks[0].health = 0
assert.equal(live.applyHumanAction({ type: 'fire' }), false, 'dead human cannot fire')
assert.deepEqual(live.transcript, [])
assert.throws(() => new VerifiedChallengeController(), /private.*constructor/)
console.log('verified-challenge-objective: PASS (controlled settlement ordering + real fixed-seed first/third clear and misses)')
