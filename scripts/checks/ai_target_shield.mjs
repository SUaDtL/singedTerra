/** WB-05: ordinary hard CPU offense must account for existing target shields.
 * Root-gated through weapon_balance.mjs; all expectations stay inline.
 */
import assert from 'node:assert/strict';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { computeAiPlan } from '../../shared/src/engine/AI.ts';
import { getWeapon } from '../../shared/src/engine/WeaponSystem.ts';
import { replayNetworkAction } from '../../shared/src/net/replay.ts';

function engine() {
  return new GameEngine({ maxPlayers: 2, players: [
    { name: 'CPU', color: '#e84d4d', ai: 'hard' }, { name: 'Opponent', color: '#4d8ce8' },
  ], seed: 17, rounds: 1, maxWind: 10, gravity: 0.15, walls: 'open', armsLevel: 4,
  rulesetVersion: 4, starterWeaponFalloff: 'decisive' });
}
function settle(e) {
  let ticks = 0;
  while (['FIRING', 'RESOLVING'].includes(e.getState().phase)) {
    assert.ok(ticks++ < 2048, 'incomplete effects are not a settled result');
    e.tick();
  }
}
function fire(e, weapon, angle, power) {
  for (const action of [{ type: 'select_weapon', weapon }, { type: 'set_angle', angle },
    { type: 'set_power', power }, { type: 'fire' }]) assert.equal(e.applyAction(action), true);
  settle(e);
}
function plan(e, difficulty = 'hard', arms = 4, personality = 'conservative') {
  const s = e.getState();
  return computeAiPlan(s, s.activePlayerId, difficulty, e.getEffectiveGravity(), arms, personality);
}

// Reachable stock checkpoint: all setup changes are accepted game actions.
// The scripted opening is not claimed to be a normal CPU-generated sequence.
const live = engine();
assert.ok(live.applyAction({ type: 'use_shield', weapon: 'shield' }));
assert.ok(live.applyAction({ type: 'use_shield', weapon: 'heavy_shield' }));
fire(live, 'sandhog', 31, 100);
fire(live, 'tracer', 180, 100);
const checkpoint = structuredClone(live.getState());
assert.equal(checkpoint.activePlayerId, 'p1');
assert.equal(checkpoint.tanks[1].health, 34);
assert.ok(Math.abs(checkpoint.tanks[1].shieldHp - 235.46804583402488) < 1e-9);
const selected = plan(live);
assert.equal(selected.weapon, 'heavy_missile', 'a 34-hull target behind 235 shield is not a Baby Missile finisher');
assert.equal(selected.buy, undefined, 'use the strongest held tool when no affordable estimated finisher exists');
assert.deepEqual(plan(live), selected);
assert.deepEqual(live.getState(), checkpoint, 'planning is read-only');

const replay = engine();
for (const action of [
  { type: 'use_shield', weapon: 'shield' }, { type: 'use_shield', weapon: 'heavy_shield' },
  { type: 'fire', weapon: 'sandhog', angle: 31, power: 100 },
  { type: 'fire', weapon: 'tracer', angle: 180, power: 100 },
]) { replayNetworkAction(replay, action); settle(replay); }
assert.deepEqual(replay.getState(), checkpoint);
// Old explicit Baby Missile actions remain legal; replay never replans them.
const oldCommand = live.clone();
replayNetworkAction(oldCommand, { type: 'fire', weapon: 'baby_missile', angle: selected.angle, power: selected.power });
settle(oldCommand);
assert.equal(oldCommand.getState().phase, 'PLAYER_TURN');
fire(live, selected.weapon, selected.angle, selected.power);
replayNetworkAction(replay, { type: 'fire', weapon: selected.weapon, angle: selected.angle, power: selected.power });
settle(replay);
assert.deepEqual(live.getState(), replay.getState(), 'new explicit commands retain direct/log parity');
assert.ok(live.getState().tanks[1].shieldHp < oldCommand.getState().tanks[1].shieldHp,
  'the fixed aim witness removes more protection with the appropriate held weapon');

// Synthetic inventory matrix isolates the selection thresholds, not shot lethality.
let boundaryCases = 0;
for (const difficulty of ['easy', 'medium', 'hard']) for (const hull of [1, 34, 35, 60, 85, 100]) {
  for (const pool of [0, 0.5, 1, 26, 60, 120, 240]) {
    const e = engine();
    const [me, target] = e.getState().tanks;
    for (const [weapon, ammo] of Object.entries(me.inventory)) if (!ammo.unlimited) ammo.count = weapon === 'missile' || weapon === 'heavy_missile' ? 1 : 0;
    me.credits = 0; target.health = hull; target.shieldHp = pool;
    const expected = difficulty === 'easy' ? 'baby_missile'
      : difficulty === 'medium' ? hull <= 34 ? 'baby_missile' : 'missile'
        : hull + pool <= 34 ? 'baby_missile' : hull + pool <= 60 ? 'missile' : 'heavy_missile';
    const result = plan(e, difficulty);
    assert.equal(result.weapon, expected, `${difficulty} hull=${hull} pool=${pool}`);
    assert.equal(result.buy, undefined);
    const previous = structuredClone(e.getState());
    assert.deepEqual(plan(e, difficulty), result);
    assert.deepEqual(e.getState(), previous);
    boundaryCases++;
  }
}

// Whole-bundle purchase and replan use the SAME target requirement. Buying must
// not revert to the free shell on the next plan, spend twice, or violate a tier.
for (const arms of [0, 1, 2, 3, 4]) for (const credits of [0, 1874, 1875, 6000]) {
  const e = engine();
  const [me, target] = e.getState().tanks;
  for (const ammo of Object.values(me.inventory)) if (!ammo.unlimited) ammo.count = 0;
  me.credits = credits; target.health = 10; target.shieldHp = 46; // 56 required: above Betty/Napalm estimates, within Missile.
  const shouldBuy = arms >= getWeapon('missile').armsLevel && credits >= getWeapon('missile').price;
  const chosen = plan(e, 'hard', arms);
  assert.equal(chosen.weapon, shouldBuy ? 'missile' : 'baby_missile');
  assert.equal(chosen.buy, shouldBuy ? 'missile' : undefined);
  if (shouldBuy) {
    const oldCash = me.credits;
    assert.ok(e.applyAction({ type: 'buy', weapon: chosen.buy }));
    assert.equal(me.credits, oldCash - 1875);
    assert.equal(me.inventory.missile.count, 5);
    const again = plan(e, 'hard', arms);
    assert.equal(again.weapon, 'missile');
    assert.equal(again.buy, undefined);
    assert.equal(again.angle, chosen.angle);
    assert.equal(again.power, chosen.power);
    fire(e, again.weapon, again.angle, again.power);
    assert.equal(me.inventory.missile.count, 4);
  }
}

// No affordable heuristic finisher: retain the free fallback, not a speculative
// expensive purchase that still cannot clear the declared total protection.
const noFinisher = engine();
for (const ammo of Object.values(noFinisher.getState().tanks[0].inventory)) if (!ammo.unlimited) ammo.count = 0;
noFinisher.getState().tanks[0].credits = 100000;
noFinisher.getState().tanks[1].health = 30;
noFinisher.getState().tanks[1].shieldHp = 240;
assert.equal(plan(noFinisher).buy, undefined);
assert.equal(plan(noFinisher).weapon, 'baby_missile');

// A zero or partial pool still permits cheaper stock when it covers the estimate.
// Existing defensive/area priorities and campaign semantics are not replaced.
const area = engine();
area.getState().tanks[1].health = 1; area.getState().tanks[1].shieldHp = 240;
assert.equal(plan(area, 'hard', 4, 'area_denial').weapon, 'napalm');
area.getState().tanks[0].health = 30;
assert.equal(plan(area).weapon, 'shield', 'own useful defense still precedes offense');
const campaign = engine();
campaign.getState().campaign = Object.freeze({}); // selector-only compatibility fixture.
campaign.getState().tanks[1].health = 10; campaign.getState().tanks[1].shieldHp = 240;
assert.equal(plan(campaign).weapon, 'baby_missile', 'legacy campaign planner retains hull-only selection');
const missing = engine();
missing.getState().tanks[1].alive = false;
assert.equal(plan(missing), null);
console.log(`AI TARGET SHIELD CHECK: PASSED (WB-05 legal witness, replay, ${boundaryCases} boundary cases and 20 shop cases)`);
