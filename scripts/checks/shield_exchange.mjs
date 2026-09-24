/** WB-02: real purchases/turn costs, censored outcomes and isolated source state.
 * Run: node --import tsx scripts/checks/shield_exchange.mjs
 * Expected values below are inline witnesses, not regenerated corpus goldens.
 */
import assert from 'node:assert/strict';
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts';
import { makeScenario } from '../balance/weaponBalance.mjs';
import { makeExchangeFixture, sampleShieldExchange, compareShieldExchange, runShieldExchanges } from '../balance/shieldExchange.mjs';

const catalogBefore = structuredClone(WEAPONS);
const fixture = makeExchangeFixture('open-42');
const sourceBefore = structuredClone(fixture.engine.getState());
const fixedAim = { angle: 180, power: 100 }; // Deliberate misses isolate turn/cash costs.
const probe = (engine, strategy, extra = {}) => sampleShieldExchange(engine, { strategy, fixedAim, ...extra });
assert.deepEqual(fixture.engine.getState(), makeScenario('open-42').engine.getState());
assert.equal(fixture.synthetic, null);
const fire = probe(fixture.engine, 'fire-first');
const shield = probe(fixture.engine, 'shield-first');
const heavyShield = probe(fixture.engine, 'heavy-shield-first');
assert.equal(fire.termination, 'horizon');
assert.equal(fire.summary.matchFinished, false, 'a surviving four-action window is not a draw');
assert.equal(fire.summary.winner, null);
assert.deepEqual(fire.commitments, { p1: 2, p2: 2 });
assert.deepEqual(shield.commitments, fire.commitments);
assert.deepEqual(heavyShield.commitments, fire.commitments);
assert.deepEqual(fire.trace.map(({ actorId }) => actorId), ['p1', 'p2', 'p1', 'p2']);
assert.deepEqual(shield.trace.map(({ kind }) => kind), ['use_shield', 'fire', 'fire', 'fire']);
assert.deepEqual(shield.trace.map(({ wind }) => wind), fire.trace.map(({ wind }) => wind), 'ordinary shield turn advances wind like a shot');
assert.equal(fire.summary.tanks[0].earnedCredits, 1000);
assert.equal(shield.summary.tanks[0].earnedCredits, 500, 'shielding gives up the shot stipend');
assert.equal(shield.summary.tanks[0].shots, 1);
assert.equal(shield.summary.tanks[1].shots, 2, 'opponent gets real replies');
assert.equal(shield.summary.tanks[0].shieldHp, 120);
assert.equal(heavyShield.summary.tanks[0].shieldHp, 240);
assert.equal(shield.summary.tanks[0].spentCredits, 0, 'stock shield use is not an invented cash purchase');
assert.equal(shield.purchases.length, 0);
assert.equal(shield.finish.tanks[0].inventory.shield.count, 0);
assert.ok(shield.summary.tanks[0].consumedReplacementValue > 6000, 'replacement value is separately disclosed');
assert.equal(compareShieldExchange(fire, shield).subjectShotsDelta, -1);
assert.equal(compareShieldExchange(fire, shield).subjectCashDelta, -500);
assert.deepEqual(probe(fixture.engine, 'shield-first'), shield);
assert.deepEqual(fixture.engine.getState(), sourceBefore, 'probes never consume source stock or mutate terrain');

const second = probe(fixture.engine, 'shield-first', { subjectId: 'p2' });
assert.equal(second.trace[0].actorId, 'p1');
assert.equal(second.trace[0].kind, 'fire');
assert.equal(second.trace[1].actorId, 'p2');
assert.equal(second.trace[1].kind, 'use_shield', 'initiative must not be faked by changing activePlayerId');
assert.equal(second.summary.tanks[1].earnedCredits, 500);

const replenishment = makeExchangeFixture('open-42', 'depleted-30k');
const replenishmentBefore = structuredClone(replenishment.engine.getState());
assert.equal(replenishment.synthetic.creditsPerSeat, 30000);
assert.equal(replenishment.engine.getState().tanks[0].inventory.heavy_shield.count, 0);
const restock = probe(replenishment.engine, 'fire-first', { weapon: 'heavy_missile' });
assert.equal(restock.purchases.length, 2, 'buy one bundle per depleted seat, not one per shot');
assert.deepEqual(restock.purchases.map(({ spent, granted }) => [spent, granted]), [[6000, 3], [6000, 3]]);
assert.equal(restock.finish.tanks[0].inventory.heavy_missile.count, 1, 'unspent purchased rounds are retained');
assert.equal(restock.summary.tanks[0].endingCredits, 25000);
const paidShield = probe(replenishment.engine, 'shield-first', { weapon: 'heavy_missile' });
assert.equal(paidShield.summary.tanks[0].spentCredits, 26000, 'whole shield and missile bundles, not amortized fractions');
assert.equal(paidShield.finish.tanks[0].inventory.shield.count, 2);
assert.equal(paidShield.finish.tanks[0].inventory.heavy_missile.count, 2);
const paidHeavy = probe(replenishment.engine, 'heavy-shield-first', { weapon: 'heavy_missile' });
assert.equal(paidHeavy.summary.tanks[0].spentCredits, 30000);
assert.equal(paidHeavy.summary.tanks[0].endingCredits, 500);
assert.equal(paidHeavy.trace[2].weapon, 'baby_missile', 'cannot fire lab-granted Heavy Missile after spending the entire budget');
assert.equal(paidHeavy.fallbacks[0].reason, 'restock-rejected');
assert.equal(paidHeavy.purchases.at(-1).accepted, false);
assert.equal(paidHeavy.purchases.at(-1).spent, 0);
assert.equal(paidHeavy.purchases.at(-1).granted, 0);
assert.deepEqual(replenishment.engine.getState(), replenishmentBefore);
assert.equal(compareShieldExchange(restock, paidHeavy).subjectCashDelta, -24500);

// An unaffordable defense is disclosed as an unexecuted strategy, not a defense win.
const poor = makeExchangeFixture('open-42').engine;
poor.getState().tanks[0].inventory.shield.count = 0;
const refused = probe(poor, 'shield-first');
assert.equal(refused.shieldActivated, false);
assert.equal(refused.trace[0].kind, 'fire');
assert.equal(refused.purchases[0].accepted, false);
assert.equal(compareShieldExchange(probe(poor, 'fire-first'), refused).status, 'shield-not-executed');

// Store tier is enforced by GameEngine; owning equipment still allows using it.
const restricted = new GameEngine({ maxPlayers: 2, players: [{ name: 'P1' }, { name: 'P2' }], seed: 42, rounds: 1, armsLevel: 0, rulesetVersion: 4 });
restricted.getState().tanks[0].credits = 100000;
restricted.getState().tanks[0].inventory.shield.count = 0;
const restrictedResult = probe(restricted, 'shield-first');
assert.equal(restrictedResult.purchases[0].accepted, false);
assert.equal(restrictedResult.shieldActivated, false);
restricted.getState().tanks[0].inventory.shield.count = 1;
assert.equal(probe(restricted, 'shield-first').shieldActivated, true);

const terminal = sampleShieldExchange(fixture.engine, { weapon: 'heavy_missile', fixedAim: { angle: 28, power: 100 } });
assert.equal(terminal.termination, 'game_over');
assert.equal(terminal.summary.matchFinished, true);
assert.equal(terminal.summary.tanks[1].hullLost, 100);
assert.deepEqual(terminal.commitments, { p1: 1, p2: 0 });
assert.equal(terminal.trace.length, 1, 'never force the dead opponent to reply');
const partial = sampleShieldExchange(fixture.engine, { fixedAim: { angle: 28, power: 100 }, tickLimit: 1 });
assert.equal(partial.termination, 'unresolved');
assert.equal(partial.summary, null);
assert.equal(partial.trace[0].effects, null);
assert.equal(compareShieldExchange(fire, partial).status, 'incomplete');
const cappedSearch = sampleShieldExchange(fixture.engine, { tickLimit: 1 });
assert.equal(cappedSearch.termination, 'unresolved');
assert.equal(cappedSearch.summary, null);
assert.ok(cappedSearch.searchWork.unresolvedCandidates > 0);
assert.equal(cappedSearch.trace.length, 0);

const noAmmo = makeExchangeFixture('open-42').engine;
for (const ammo of Object.values(noAmmo.getState().tanks[0].inventory)) { ammo.count = 0; ammo.unlimited = false; }
noAmmo.getState().tanks[0].credits = 0;
const blocked = probe(noAmmo, 'fire-first');
assert.equal(blocked.termination, 'blocked');
assert.equal(blocked.summary, null);
assert.equal(blocked.commitments.p1, 0);

for (const input of [{ strategy: 'magic-shield' }, { subjectId: 'p3' }, { weapon: 'nuke' },
  { tickLimit: 0 }, { fixedAim: { angle: NaN, power: 50 } },
  { fixedAim: { angle: 90, power: 101 } }, { fixedAim: { angle: 90.5, power: 50 } },
  { fixedAim: { angle: 90, power: 50, hidden: true } }]) {
  assert.throws(() => sampleShieldExchange(fixture.engine, input));
}
assert.throws(() => makeExchangeFixture('near-calm'), /Unknown/);
assert.throws(() => makeExchangeFixture('open-42', 'free-ammo'), /Unknown/);
assert.throws(() => runShieldExchanges({ scenarioIds: ['open-42', 'open-42'] }), /unique/);
assert.throws(() => runShieldExchanges({ weaponIds: [] }), /nonempty/);
assert.throws(() => runShieldExchanges({ weaponIds: ['tracer'] }), /Unknown/);
assert.throws(() => sampleShieldExchange(new GameEngine({ maxPlayers: 2, rounds: 3 })), /single-round/);
const changed = structuredClone(shield);
changed.start.wind += 1;
assert.throws(() => compareShieldExchange(fire, changed), /identical/);
assert.throws(() => compareShieldExchange(shield, fire), /baseline/);
changed.start = structuredClone(fire.start);
changed.limits.tickLimit += 1;
assert.throws(() => compareShieldExchange(fire, changed), /identical/);

// At least one real adaptive search/reply path, in addition to the fixed-aim witnesses.
const adaptive = sampleShieldExchange(fixture.engine, { strategy: 'shield-first', weapon: 'missile' });
assert.deepEqual(sampleShieldExchange(fixture.engine, { strategy: 'shield-first', weapon: 'missile' }), adaptive);
assert.ok(adaptive.searchWork.actualEngineProbes > 0 && adaptive.searchWork.actualEngineProbes <= 4 * 196);
assert.ok(adaptive.searchWork.proxyProbes > 0);
assert.ok(adaptive.trace.some(({ actorId, kind }) => actorId === 'p2' && kind === 'fire'));
assert.ok(adaptive.trace.every(({ settled }) => settled));
assert.deepEqual(fixture.engine.getState(), sourceBefore);
assert.deepEqual(WEAPONS, catalogBefore);
console.log('SHIELD EXCHANGE CHECK: PASSED (WB-02 inline costs, replies, bounds, isolation and censored outcomes)');
