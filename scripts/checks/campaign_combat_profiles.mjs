import assert from 'node:assert/strict'

import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts'

const ordinaryCatalogBefore = JSON.stringify(WEAPONS)
const ordinaryEconomyBefore = Object.fromEntries(
  Object.entries(WEAPONS).map(([id, definition]) => [
    id,
    { price: definition.price, bundleSize: definition.bundleSize, armsLevel: definition.armsLevel },
  ]),
)

const {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} = await import('../../shared/src/campaign/combatProfiles.ts')

const reference = { ...ASH_ROAD_COMBAT_PROFILE_REFERENCE }
const profile = resolveCampaignCombatProfile(reference)

assert.deepEqual(profile.choices, [
  'baby_missile',
  'missile',
  'cluster_bomb',
  'sandhog',
  'napalm',
  'shield',
])
assert.deepEqual(profile.kit, {
  basicWeaponId: 'baby_missile',
  offensiveSlots: 2,
  defensiveSlots: 1,
})

const expected = {
  baby_missile: { name: 'Baby Missile', slot: 'basic', ammunition: null, damageReach: 32.4, craterRadius: 18 },
  missile: { name: 'Missile', slot: 'offense', ammunition: 3, damageReach: 54, craterRadius: 30 },
  cluster_bomb: { name: 'Cluster Bomb', slot: 'offense', ammunition: 2, damageReach: 25.2, craterRadius: 18 },
  sandhog: { name: 'Sandhog', slot: 'offense', ammunition: 2, damageReach: 68.4, craterRadius: 38 },
  napalm: { name: 'Napalm', slot: 'offense', ammunition: 2, damageReach: 0, craterRadius: 0 },
  shield: { name: 'Shield', slot: 'defense', ammunition: 1, damageReach: 0, craterRadius: 0 },
}

assert.deepEqual(Object.keys(profile.catalog), Object.keys(expected))
for (const [id, expectation] of Object.entries(expected)) {
  const item = profile.catalog[id]
  assert.equal(item.name, expectation.name, `${id}: presentation name`)
  assert.equal(item.slot, expectation.slot, `${id}: slot semantics`)
  assert.equal(item.startingAmmunition, expectation.ammunition, `${id}: starting ammunition`)
  assert.equal(item.damage.damageReach, expectation.damageReach, `${id}: explicit damage reach`)
  assert.equal(item.damage.craterRadius, expectation.craterRadius, `${id}: crater radius remains separate`)
}

assert.deepEqual(profile.shield, { candidates: [60, 90, 120], selectedCapacity: 90 })
assert.equal(profile.catalog.shield.definition.behavior.shield.capacity, 90)
assert.deepEqual(profile.environmentEffects, {
  supplyDrum: { maxDamage: 60, damageReach: 76, craterRadius: 32, falloffExponent: 1 },
  announcedStrike: { maxDamage: 35, damageReach: 55, craterRadius: 24, falloffExponent: 1 },
})
assert.deepEqual(profile.economy, {
  battleShopping: false,
  damageIncome: 0,
  shotStipend: 0,
  startingSupplies: 2,
})

for (const value of [profile, profile.choices, profile.kit, profile.catalog, profile.catalog.missile,
  profile.catalog.missile.damage, profile.catalog.missile.definition,
  profile.catalog.missile.definition.detonation, profile.shield, profile.shield.candidates,
  profile.environmentEffects, profile.environmentEffects.supplyDrum, profile.economy]) {
  assert.equal(Object.isFrozen(value), true, 'resolved profile is deeply immutable')
}
assert.throws(() => { profile.choices.push('nuke') }, TypeError)
assert.throws(() => { profile.catalog.missile.damage.damageReach = 999 }, TypeError)
assert.throws(() => { profile.catalog.missile.definition.detonation.radius = 999 }, TypeError)
reference.profileId = 'changed-after-resolution'
assert.equal(profile.profileId, 'ash-road-v1', 'caller mutation cannot change resolved identity')

for (const badReference of [
  null,
  {},
  { profileId: 'ash-road-v1' },
  { profileVersion: 1 },
  { profileId: 'ash-road-v1', profileVersion: 0 },
  { profileId: 'ash-road-v1', profileVersion: 2 },
  { profileId: 'unknown-profile', profileVersion: 1 },
  { profileId: 'ash-road-v1', profileVersion: 1, ignored: true },
]) {
  assert.throws(() => resolveCampaignCombatProfile(badReference), /unsupported campaign combat profile/)
}

assert.equal(JSON.stringify(WEAPONS), ordinaryCatalogBefore, 'resolution must not mutate global WEAPONS')
assert.deepEqual(
  Object.fromEntries(Object.entries(WEAPONS).map(([id, definition]) => [
    id,
    { price: definition.price, bundleSize: definition.bundleSize, armsLevel: definition.armsLevel },
  ])),
  ordinaryEconomyBefore,
  'ordinary price, bundle, and arms-level economy remains unchanged',
)
assert.notEqual(profile.catalog.missile.definition, WEAPONS.missile, 'campaign definitions are owned clones')
assert.notEqual(profile.catalog.missile.definition.detonation, WEAPONS.missile.detonation)

console.log('CAMPAIGN COMBAT PROFILES CHECK: PASSED')
