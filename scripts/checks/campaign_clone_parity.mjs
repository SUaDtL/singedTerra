// Ash Road T-08 campaign clone isolation contract (AC-02 / AC-03).
//
// Exercises the real campaign construction seam rather than a mocked state:
// caller-owned definitions, a live cloned campaign engine, and an ordinary
// engine all retain the ownership and deterministic-future guarantees.
// Run: npx tsx scripts/checks/campaign_clone_parity.mjs

import assert from 'node:assert/strict'

import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import {
  ARENA_FLOOR_Y,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
} from '../../shared/src/engine/Terrain.ts'

const CAMPAIGN_ONLY_KEYS = new Set([
  'campaign',
  'campaignState',
  'commitments',
  'encounterObjects',
  'encounterZones',
  'objectives',
  'warnings',
])
const MAX_SETTLE_TICKS = 100_000

function authoredEncounter() {
  return {
    kind: 'campaign-encounter',
    episodeVersion: 1,
    encounterVersion: 1,
    encounterId: 'clone-parity-contract',
    combatProfileId: 'ash-road-v1',
    combatProfileVersion: 1,
    contentDigest: '8'.repeat(64),
    seed: 0x08_08_08,
    terrain: {
      kind: 'height-control-points',
      version: 1,
      width: CANVAS_WIDTH,
      bitmapHeight: CANVAS_HEIGHT,
      floorY: ARENA_FLOOR_Y,
      points: [
        { x: 0, y: 318 },
        { x: CANVAS_WIDTH - 1, y: 318 },
      ],
    },
    spawns: [
      {
        id: 'p1',
        role: 'human',
        x: 240,
        hull: 73,
        equipment: ['baby_missile', 'missile', 'shield'],
      },
      {
        id: 'p2',
        role: 'defender',
        x: 860,
        hull: 58,
        equipment: ['baby_missile', 'cluster_bomb', 'sandhog'],
      },
    ],
    objects: [],
    objective: { kind: 'eliminate', protectedObjectIds: [] },
    warning: null,
  }
}

function snapshot(engine) {
  return structuredClone(engine.getState())
}

function applyOpeningShot(engine, label) {
  for (const action of [
    { type: 'set_angle', angle: 45 },
    { type: 'set_power', power: 40 },
    { type: 'fire' },
  ]) {
    assert.equal(engine.applyAction(action), true, `${label}: ${action.type} is legal`)
  }
  assert.equal(engine.getState().phase, 'FIRING', `${label}: fire creates a live projectile`)
  assert.equal(engine.getState().projectiles.length, 1, `${label}: one live projectile exists`)
}

function tickToRest(engine, label) {
  let ticks = 0
  while (['FIRING', 'RESOLVING'].includes(engine.getState().phase) && ticks < MAX_SETTLE_TICKS) {
    engine.tick()
    ticks += 1
  }
  assert.ok(ticks < MAX_SETTLE_TICKS, `${label}: engine did not settle`)
  return ticks
}

function assertArrayOwnership(label, original, clone) {
  assert.notStrictEqual(original, clone, `${label}: containers must not alias`)
  const originalLength = original.length
  original.push({ parityProbe: label })
  assert.equal(clone.length, originalLength, `${label}: original mutation leaked into clone`)
  original.pop()
  clone.push({ parityProbe: label })
  assert.equal(original.length, originalLength, `${label}: clone mutation leaked into original`)
  clone.pop()
}

function assertMapOwnership(label, original, clone) {
  assert.ok(original instanceof Map, `${label}: source map is present`)
  assert.ok(clone instanceof Map, `${label}: clone map is present`)
  assert.notStrictEqual(original, clone, `${label}: maps must not alias`)
  original.set(-1, 1)
  assert.equal(clone.has(-1), false, `${label}: source map mutation leaked into clone`)
  original.delete(-1)
  clone.set(-2, 2)
  assert.equal(original.has(-2), false, `${label}: clone map mutation leaked into source`)
  clone.delete(-2)
}

function assertSetOwnership(label, original, clone) {
  assert.ok(original instanceof Set, `${label}: source set is present`)
  assert.ok(clone instanceof Set, `${label}: clone set is present`)
  assert.notStrictEqual(original, clone, `${label}: sets must not alias`)
  original.add(-1)
  assert.equal(clone.has(-1), false, `${label}: source set mutation leaked into clone`)
  original.delete(-1)
  clone.add(-2)
  assert.equal(original.has(-2), false, `${label}: clone set mutation leaked into source`)
  clone.delete(-2)
}

const profile = resolveCampaignCombatProfile({ ...ASH_ROAD_COMBAT_PROFILE_REFERENCE })
const callerEncounter = authoredEncounter()
const campaign = createCampaignGameEngine({ encounter: callerEncounter, combatProfile: profile })
const campaignClone = campaign.clone()
const campaignAtClone = snapshot(campaign)

assert.deepEqual(snapshot(campaignClone), campaignAtClone,
  'campaign clone is state-equivalent at clone time')

// Construction must own the parsed definition before any public state exists;
// changing the caller later cannot alter either the source engine or its clone.
callerEncounter.terrain.points[0].y = 220
callerEncounter.spawns[0].hull = 1
callerEncounter.spawns[0].equipment.push('napalm')
assert.deepEqual(snapshot(campaign), campaignAtClone,
  'caller encounter mutation after construction changed the source engine')
assert.deepEqual(snapshot(campaignClone), campaignAtClone,
  'caller encounter mutation after construction changed the campaign clone')

const sourceInitial = campaign.getState()
const cloneInitial = campaignClone.getState()
const sourceTank = sourceInitial.tanks[0]
const cloneTank = cloneInitial.tanks[0]
assert.ok(sourceTank && cloneTank, 'campaign clone fixture has a human tank')

const sourcePixel = sourceInitial.terrain[0]
sourceInitial.terrain[0] ^= 1
assert.equal(cloneInitial.terrain[0], sourcePixel, 'source terrain mutation leaked into clone')
sourceInitial.terrain[0] = sourcePixel
const clonePixel = cloneInitial.terrain[1]
cloneInitial.terrain[1] ^= 1
assert.equal(sourceInitial.terrain[1], clonePixel, 'clone terrain mutation leaked into source')
cloneInitial.terrain[1] = clonePixel

const sourceMissiles = sourceTank.inventory.missile.count
sourceTank.inventory.missile.count += 1
assert.equal(cloneTank.inventory.missile.count, sourceMissiles, 'source inventory mutation leaked into clone')
sourceTank.inventory.missile.count = sourceMissiles
const cloneShield = cloneTank.inventory.shield.count
cloneTank.inventory.shield.count += 1
assert.equal(sourceTank.inventory.shield.count, cloneShield, 'clone inventory mutation leaked into source')
cloneTank.inventory.shield.count = cloneShield

const sourceBattery = sourceTank.accessories.battery
sourceTank.accessories.battery += 1
assert.equal(cloneTank.accessories.battery, sourceBattery, 'source accessories mutation leaked into clone')
sourceTank.accessories.battery = sourceBattery
const cloneFuelTank = cloneTank.accessories.fuel_tank
cloneTank.accessories.fuel_tank += 1
assert.equal(sourceTank.accessories.fuel_tank, cloneFuelTank, 'clone accessories mutation leaked into source')
cloneTank.accessories.fuel_tank = cloneFuelTank

const sourceTreads = sourceTank.loadout.treads
sourceTank.loadout.treads = 'ranger'
assert.equal(cloneTank.loadout.treads, sourceTreads, 'source loadout mutation leaked into clone')
sourceTank.loadout.treads = sourceTreads
const cloneHull = cloneTank.loadout.hull
cloneTank.loadout.hull = 'ranger'
assert.equal(sourceTank.loadout.hull, cloneHull, 'clone loadout mutation leaked into source')
cloneTank.loadout.hull = cloneHull

// Apply an identical legal future from the clone checkpoint. This creates a
// live projectile on each engine so the element and the existing projectile/
// effect containers can be checked as mutable, independent state as well.
applyOpeningShot(campaign, 'campaign source')
applyOpeningShot(campaignClone, 'campaign clone')
const sourceFlight = campaign.getState()
const cloneFlight = campaignClone.getState()
assert.notStrictEqual(sourceFlight.projectile, cloneFlight.projectile,
  'live projectile records must not alias')
assert.strictEqual(sourceFlight.projectile, sourceFlight.projectiles[0],
  'source projectile alias remains synchronized')
assert.strictEqual(cloneFlight.projectile, cloneFlight.projectiles[0],
  'clone projectile alias remains synchronized')

const sourceProjectileX = sourceFlight.projectiles[0].x
sourceFlight.projectiles[0].x += 1
assert.equal(cloneFlight.projectiles[0].x, sourceProjectileX, 'source projectile mutation leaked into clone')
sourceFlight.projectiles[0].x = sourceProjectileX
const cloneProjectileY = cloneFlight.projectiles[0].y
cloneFlight.projectiles[0].y += 1
assert.equal(sourceFlight.projectiles[0].y, cloneProjectileY, 'clone projectile mutation leaked into source')
cloneFlight.projectiles[0].y = cloneProjectileY

assertArrayOwnership('projectile list', sourceFlight.projectiles, cloneFlight.projectiles)
assertArrayOwnership('explosion effects', sourceFlight.explosions, cloneFlight.explosions)
assertArrayOwnership('wall-impact effects', sourceFlight.wallImpacts, cloneFlight.wallImpacts)
assertArrayOwnership('fire effects', sourceFlight.fire, cloneFlight.fire)
assertMapOwnership('private fire effect store', campaign.fire, campaignClone.fire)
assertSetOwnership('private fire scorch store', campaign.fireScorched, campaignClone.fireScorched)
assertMapOwnership('private fall-distance effect store', campaign.fallDistances, campaignClone.fallDistances)

const sourceTicks = tickToRest(campaign, 'campaign source')
const cloneTicks = tickToRest(campaignClone, 'campaign clone')
assert.equal(cloneTicks, sourceTicks, 'same campaign ticks take the same deterministic duration')
assert.deepEqual(snapshot(campaignClone), snapshot(campaign),
  'same legal campaign action and ticks produce equal future state')

// Default construction stays campaign-free and keeps its existing clone contract.
const ordinary = new GameEngine({ maxPlayers: 2, seed: 0x08_08_08 })
const ordinaryClone = ordinary.clone()
assert.deepEqual(snapshot(ordinaryClone), snapshot(ordinary), 'ordinary clone parity')
const ordinaryCampaignKeys = Object.keys(ordinary.getState()).filter((key) =>
  CAMPAIGN_ONLY_KEYS.has(key) || key.toLowerCase().startsWith('campaign'))
assert.deepEqual(ordinaryCampaignKeys, [], 'ordinary snapshot exposed campaign-only keys')

console.log('campaign-clone-parity: PASS (owned caller input, clone-time equality, detached mutable state, deterministic future, ordinary parity)')
