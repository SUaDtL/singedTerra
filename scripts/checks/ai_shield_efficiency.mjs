/** WB-04: ordinary hard CPUs must not waste or downgrade normal-shield protection.
 * Run: node --import tsx scripts/checks/ai_shield_efficiency.mjs
 * Also imported by the existing root-gated weapon_balance.mjs. Expectations are pinned inline.
 */
import assert from 'node:assert/strict';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { computeAiPlan } from '../../shared/src/engine/AI.ts';
import { getWeapon } from '../../shared/src/engine/WeaponSystem.ts';
import { replayNetworkAction } from '../../shared/src/net/replay.ts';

const normalCapacity = getWeapon('shield').behavior.shield.capacity;
assert.equal(normalCapacity, 120, 'this correction does not retune normal shields');
assert.equal(getWeapon('heavy_shield').behavior.shield.capacity, 240);
function engine() {
  return new GameEngine({ maxPlayers: 2, players: [
    { name: 'Human', color: '#e84d4d' }, { name: 'CPU', color: '#4d8ce8', ai: 'hard' },
  ], seed: 17, rounds: 1, maxWind: 10, gravity: 0.15, walls: 'open', armsLevel: 4,
  rulesetVersion: 4, starterWeaponFalloff: 'decisive' });
}
function settle(e) {
  let ticks = 0;
  while (['FIRING', 'RESOLVING'].includes(e.getState().phase)) {
    assert.ok(ticks++ < 2048, 'settlement must be complete, never a partial outcome');
    e.tick();
  }
}
function plan(e, difficulty = 'hard') {
  const state = e.getState();
  return computeAiPlan(state, state.activePlayerId, difficulty, e.getEffectiveGravity(), 4);
}
function fire(e, weapon, angle, power) {
  for (const action of [{ type: 'select_weapon', weapon }, { type: 'set_angle', angle },
    { type: 'set_power', power }, { type: 'fire' }]) assert.equal(e.applyAction(action), true);
  settle(e);
}

// Reachable witness: stock equipment and accepted actions only. No health,
// terrain, inventory, aim or turn-state injection into the checkpoint.
const live = engine();
assert.equal(live.applyAction({ type: 'use_shield', weapon: 'shield' }), true);
assert.equal(live.applyAction({ type: 'use_shield', weapon: 'heavy_shield' }), true);
fire(live, 'sandhog', 31, 100);
const checkpoint = structuredClone(live.getState());
const cpu = checkpoint.tanks[1];
assert.equal(checkpoint.phase, 'PLAYER_TURN');
assert.equal(checkpoint.activePlayerId, 'p2');
assert.equal(cpu.health, 34);
assert.ok(Math.abs(cpu.shieldHp - 235.46804583402488) < 1e-9);
assert.equal(cpu.inventory.shield.count, 1);
const chosen = plan(live);
assert.ok(chosen && chosen.weapon !== 'shield', 'hard CPU must not replace 235 protection with 120');
const withoutNormal = live.clone();
withoutNormal.getState().tanks[1].inventory.shield.count = 0; // Synthetic policy control only.
assert.deepEqual(chosen, plan(withoutNormal), 'use the existing offense/purchase path, not a new policy');
assert.deepEqual(plan(live), chosen, 'repeated planning is deterministic');
assert.deepEqual(live.getState(), checkpoint, 'planning does not mutate state or consume equipment');

// Replay either an older accepted shield or the new offensive command through
// the unchanged canonical action translator; clients do not regenerate logged AI.
const oldCommand = live.clone();
replayNetworkAction(oldCommand, { type: 'use_shield', weapon: 'shield' });
assert.equal(oldCommand.getState().tanks[1].shieldHp, 120, 'old/human actions remain legal');
assert.equal(oldCommand.getState().tanks[1].inventory.shield.count, 0);
const replay = engine();
replayNetworkAction(replay, { type: 'use_shield', weapon: 'shield' });
replayNetworkAction(replay, { type: 'use_shield', weapon: 'heavy_shield' });
replayNetworkAction(replay, { type: 'fire', weapon: 'sandhog', angle: 31, power: 100 });
settle(replay);
assert.deepEqual(replay.getState(), checkpoint, 'fresh-engine replay reaches the exact legal checkpoint');
for (const action of [
  ...(chosen.buy ? [{ type: 'buy', weapon: chosen.buy }] : []),
  ...(chosen.buyAccessory ? [{ type: 'buy', accessory: chosen.buyAccessory }] : []),
]) {
  assert.equal(live.applyAction(action), true);
  replayNetworkAction(replay, action);
}
fire(live, chosen.weapon, chosen.angle, chosen.power);
replayNetworkAction(replay, { type: 'fire', weapon: chosen.weapon, angle: chosen.angle, power: chosen.power });
settle(replay);
assert.deepEqual(replay.getState(), live.getState(), 'corrected actions retain live/log replay parity');
assert.equal(live.getState().tanks[1].inventory.shield.count, 1, 'normal shield is saved for later');

// Synthetic threshold matrix: difficulty, health, shield capacity and held stock
// are varied independently. No universal refresh-percentage policy is invented.
let cases = 0;
for (const difficulty of ['easy', 'medium', 'hard']) for (const hull of [1, 35, 36, 100]) {
  for (const pool of [0, 119.5, 120, 180, 240]) for (const count of [0, 1]) {
    const e = engine();
    const tank = e.getState().tanks[0];
    tank.health = hull; tank.shieldHp = pool; tank.inventory.shield.count = count;
    const selected = plan(e, difficulty);
    assert.ok(selected);
    assert.equal(selected.weapon === 'shield', difficulty === 'hard' && hull <= 35 && count > 0 && pool < normalCapacity);
    if (selected.weapon === 'shield') {
      assert.equal(e.applyAction({ type: 'use_shield', weapon: 'shield' }), true);
      assert.ok(tank.shieldHp > pool);
      assert.equal(tank.inventory.shield.count, count - 1);
      assert.equal(e.getState().turn, 1);
    } else {
      const control = e.clone();
      control.getState().tanks[0].inventory.shield.count = 0;
      assert.deepEqual(selected, plan(control, difficulty));
    }
    cases += 1;
  }
}

// Ash Road may have different shield capacities and regenerated CPU plans in
// stored transcripts. Keep its established selection path rather than changing it.
const campaign = engine();
// Presence-only selector fixture; no campaign actions, parser or save is exercised.
campaign.getState().campaign = Object.freeze({});
const campaignTank = campaign.getState().tanks[0];
campaignTank.health = 20; campaignTank.shieldHp = 240;
campaignTank.inventory.shield.count = 1; // Synthetic compatibility boundary probe.
assert.equal(plan(campaign).weapon, 'shield', 'legacy campaign planning is deliberately preserved');
console.log(`AI SHIELD EFFICIENCY CHECK: PASSED (WB-04 legal undercut, replay and ${cases} boundary cases)`);
