/** WB-01 contract: actual-weapon outcomes, isolated fixtures and bounded search.
 * Run: node --import tsx scripts/checks/weapon_balance.mjs
 * Inline witness values are regression evidence, never regenerated expectations.
 */
import assert from 'node:assert/strict';
import './ai_shield_efficiency.mjs'; // WB-04: included in the existing balance gate.
import './ai_target_shield.mjs'; // WB-05: target-shield selection uses the same gate.
import { GameEngine } from '../../shared/src/engine/GameEngine.ts';
import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts';
import { makeScenario, sampleShot, searchWeapon, startingState, runBalance } from '../balance/weaponBalance.mjs';

const originalCatalog = structuredClone(WEAPONS);
const plain = makeScenario('open-42').engine;
const before = structuredClone(plain.getState());
const terrainAttack = sampleShot(plain, 'sandhog', { angle: 21, power: 100 }, { terrain: true });
assert.equal(terrainAttack.status, 'settled');
assert.equal(terrainAttack.enemyHullLost, 30);
assert.equal(terrainAttack.allyHullLost, 0, 'FFA null teams are not allies');
assert.equal(terrainAttack.creditedDamage, 0, 'physical loss is not score attribution');
assert.equal(terrainAttack.tankEffects[1].deltaY, 52);
assert.equal(terrainAttack.ammoConsumed, 1);
assert.ok(terrainAttack.terrain.solidToAirPixels > 0);
assert.deepEqual(plain.getState(), before, 'probe must not mutate source state or buffers');
assert.deepEqual(sampleShot(plain, 'sandhog', { angle: 21, power: 100 }, { terrain: true }), terrainAttack);

const shielded = makeScenario('shield-7');
assert.equal(shielded.preparation.length, 2);
assert.equal(shielded.engine.getState().activePlayerId, 'p1');
assert.ok(startingState(shielded.engine).tanks.every((tank) => tank.shieldHp === 120));
const undercut = sampleShot(shielded.engine, 'sandhog', { angle: 35, power: 100 });
assert.equal(undercut.enemyHullLost, 57);
assert.equal(undercut.enemyShieldLost, 0);
assert.equal(undercut.tankEffects[1].deltaY, 70);

const betty = makeScenario('open-7').engine;
const badAim = sampleShot(betty, 'bouncing_betty', { angle: 34, power: 100 });
const goodAim = sampleShot(betty, 'bouncing_betty', { angle: 25, power: 100 });
assert.equal(badAim.enemyHullLost, 0);
assert.ok(Math.abs(goodAim.enemyHullLost - 44.33716224086074) < 1e-9);
assert.equal(goodAim.creditsEarned, 4047);
assert.equal(goodAim.nominalAmmoCost, 1200);

const terminal = sampleShot(plain, 'heavy_missile', { angle: 28, power: 100 });
assert.equal(terminal.phase, 'GAME_OVER');
assert.equal(terminal.enemyHullLost, 100, 'must not sample newly reset round health');
assert.equal(terminal.enemyKills, 1);
assert.equal(terminal.creditedKills, 0, 'credited kills and physical eliminations are distinct');
const tracer = sampleShot(plain, 'tracer', { angle: 21, power: 100 }, { terrain: true });
assert.equal(tracer.enemyHullLost, 0);
assert.equal(tracer.terrain.changedPixels, 0);
assert.ok(tracer.ticks > 0);
const basic = sampleShot(plain, 'baby_missile', { angle: 21, power: 100 });
assert.equal(basic.ammoConsumed, 0);
assert.equal(basic.nominalAmmoCost, 0, 'unlimited basic shell must not be priced as a paid round');

const teams = sampleShot(makeScenario('teams-42').engine, 'missile', { angle: 45, power: 60 });
assert.deepEqual(teams.tankEffects.map(({ relation }) => relation), ['self', 'enemy', 'ally', 'enemy']);
const incomplete = sampleShot(plain, 'napalm',
  { angle: 41, power: 100, status: 'settled', enemyHullLost: 999 }, { tickLimit: 1 });
assert.equal(incomplete.status, 'unresolved');
assert.equal(incomplete.ticks, 1);
assert.equal(incomplete.enemyHullLost, undefined, 'never score partial results as zero');

for (const aim of [{ angle: NaN, power: 50 }, { angle: 21.5, power: 50 },
  { angle: 181, power: 50 }, { angle: 21, power: 101 }]) {
  assert.throws(() => sampleShot(plain, 'missile', aim), RangeError);
}
assert.throws(() => sampleShot(plain, 'shield', { angle: 45, power: 50 }), /fireable/);
assert.throws(() => sampleShot(plain, 'unknown', { angle: 45, power: 50 }), /fireable/);
assert.throws(() => sampleShot(plain, 'missile', { angle: 45, power: 50 }, { tickLimit: 0 }), RangeError);
assert.throws(() => sampleShot(new GameEngine({ maxPlayers: 2, rounds: 3 }), 'missile',
  { angle: 45, power: 50 }), /single-round/);
assert.throws(() => makeScenario('missing'), /Unknown/);
assert.throws(() => searchWeapon(plain, 'missile', { angleStep: 1, powerStep: 1 }), /budget/);
assert.throws(() => runBalance({ scenarioIds: [] }), /nonempty/);
assert.throws(() => runBalance({ weaponIds: ['unknown'] }), /Unknown/);

const searchOptions = { angleStep: 45, powerStep: 50 };
const first = searchWeapon(betty, 'bouncing_betty', searchOptions);
assert.deepEqual(searchWeapon(betty, 'bouncing_betty', searchOptions), first);
assert.ok(first.probes <= 15 + 1 + 70, 'coarse + one ranging proposal + two refinement anchors have a fixed upper bound');
assert.ok(first.tolerance.total >= 4 && first.tolerance.total <= 9);
assert.equal(new Set(first.tolerance.samples.map(({ angle, power }) => `${angle}:${power}`)).size,
  first.tolerance.total, 'boundary neighborhoods omit, not duplicate, illegal inputs');
assert.equal(first.tolerance.total, first.tolerance.settled + first.tolerance.unresolved);
assert.ok(first.tolerance.damaging <= first.tolerance.settled);
const capped = searchWeapon(plain, 'baby_missile', { ...searchOptions, tickLimit: 1 });
assert.ok(capped.unresolved > 0, 'incomplete coarse probes are accounted for');
if (capped.best) assert.equal(capped.best.status, 'settled');
const report = runBalance({ scenarioIds: ['open-7'], weaponIds: ['tracer'], search: searchOptions });
assert.equal(report.schemaVersion, 1);
assert.equal(report.rows.length, 1);
assert.equal(report.catalog.tracer.price, WEAPONS.tracer.price);
assert.equal(report.scenarios[0].synthetic, null);
assert.ok(makeScenario('near-calm').definition.synthetic, 'synthetic conditions are explicitly flagged');
report.catalog.tracer.detonation.maxDamage = 999;
assert.deepEqual(WEAPONS, originalCatalog, 'study must never rebalance the live catalog');
assert.deepEqual(plain.getState(), before);
console.log('WEAPON BALANCE CHECK: PASSED (WB-01 inline witnesses, bounds and isolation)');
