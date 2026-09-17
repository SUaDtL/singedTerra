// Ash Road T-06 authored campaign initialization contract (AC-03 / AC-07).
//
// This is intentionally RED until shared/src/campaign/initialization.ts supplies
// the owned createCampaignGameEngine({ encounter, combatProfile }) boundary.
// Run: npx tsx scripts/checks/campaign_initialization.mjs

import assert from 'node:assert/strict'

import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import { TANK_WIDTH } from '../../shared/src/engine/Tank.ts'
import {
  AIR_PIXEL,
  ARENA_FLOOR_Y,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SOLID_PIXEL,
  buildBitmap,
  surfaceAt,
} from '../../shared/src/engine/Terrain.ts'
import { WEAPONS } from '../../shared/src/engine/WeaponSystem.ts'

const { createCampaignGameEngine } = await import(
  '../../shared/src/campaign/initialization.ts'
)

assert.equal(
  typeof createCampaignGameEngine,
  'function',
  'campaign initialization API must export createCampaignGameEngine',
)

const FLAT_SURFACE_Y = 318

function authoredEncounter() {
  return {
    kind: 'campaign-encounter',
    episodeVersion: 1,
    encounterVersion: 1,
    encounterId: 'initialization-contract',
    combatProfileId: 'ash-road-v1',
    combatProfileVersion: 1,
    contentDigest: '6'.repeat(64),
    seed: 0x06_07_08,
    terrain: {
      kind: 'height-control-points',
      version: 1,
      width: CANVAS_WIDTH,
      bitmapHeight: CANVAS_HEIGHT,
      floorY: ARENA_FLOOR_Y,
      points: [
        { x: 0, y: FLAT_SURFACE_Y },
        { x: CANVAS_WIDTH - 1, y: FLAT_SURFACE_Y },
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

function expectedInventory(profile, equipment) {
  const equipped = new Set(equipment)
  return Object.fromEntries(Object.keys(WEAPONS).map((id) => {
    const campaignWeapon = profile.catalog[id]
    if (!equipped.has(id) || !campaignWeapon) {
      return [id, { count: 0, unlimited: false }]
    }
    return campaignWeapon.startingAmmunition === null
      ? [id, { count: 0, unlimited: true }]
      : [id, { count: campaignWeapon.startingAmmunition, unlimited: false }]
  }))
}

function ordinarySnapshot() {
  return structuredClone(new GameEngine().getState())
}

function createThroughOwnedBoundary(input, combatProfile) {
  const borrowedGetState = GameEngine.prototype.getState
  let borrowedStateReads = 0
  GameEngine.prototype.getState = function forbiddenBorrowedStateRead() {
    borrowedStateReads += 1
    throw new Error('campaign initialization must not mutate borrowed getState() state')
  }
  try {
    const engine = createCampaignGameEngine({ encounter: input, combatProfile })
    assert.equal(borrowedStateReads, 0, 'initializer read the borrowed public GameState')
    assert.ok(engine instanceof GameEngine, 'campaign factory returns the authoritative GameEngine')
    return engine
  } finally {
    GameEngine.prototype.getState = borrowedGetState
  }
}

const ordinaryBefore = ordinarySnapshot()
const profile = resolveCampaignCombatProfile({ ...ASH_ROAD_COMBAT_PROFILE_REFERENCE })
const source = authoredEncounter()
const engine = createThroughOwnedBoundary(source, profile)
const state = engine.getState()

// The complete authored bitmap, not seed-generated terrain, is installed by the
// engine-owned construction path.
const expectedHeights = new Uint16Array(CANVAS_WIDTH).fill(FLAT_SURFACE_Y)
assert.deepEqual(state.terrain, buildBitmap(expectedHeights), 'authored terrain bitmap is exact')
assert.equal(state.terrain[FLAT_SURFACE_Y * CANVAS_WIDTH + 600], SOLID_PIXEL)
assert.equal(state.terrain[(FLAT_SURFACE_Y - 1) * CANVAS_WIDTH + 600], AIR_PIXEL)
assert.equal(state.terrainVersion, 0, 'authored construction is the initial terrain, not a mutation')

assert.equal(state.activePlayerId, 'p1')
assert.equal(state.tanks.length, 2)
const [human, defender] = state.tanks
assert.ok(human && defender)
assert.deepEqual(
  [human.id, human.x, human.y, human.angle, human.health, human.fuel, human.selectedWeapon],
  ['p1', 240, FLAT_SURFACE_Y, 45, 73, 100, 'baby_missile'],
  'human spawn, facing, hull, fuel, and selected equipment are exact',
)
assert.deepEqual(
  [defender.id, defender.x, defender.y, defender.angle, defender.health, defender.fuel,
    defender.selectedWeapon],
  ['p2', 860, FLAT_SURFACE_Y, 135, 58, 100, 'baby_missile'],
  'enemy spawn, facing, hull, fuel, and selected equipment are exact',
)
assert.deepEqual(
  human.inventory,
  expectedInventory(profile, source.spawns[0].equipment),
  'human inventory contains exactly the authored campaign equipment and profile ammunition',
)
assert.deepEqual(
  defender.inventory,
  expectedInventory(profile, source.spawns[1].equipment),
  'enemy inventory contains exactly the authored campaign equipment and profile ammunition',
)

for (const tank of state.tanks) {
  assert.ok(
    tank.x >= TANK_WIDTH / 2 && tank.x <= CANVAS_WIDTH - TANK_WIDTH / 2,
    `${tank.id}: tank footprint is inside the arena`,
  )
  for (const x of [tank.x - TANK_WIDTH / 2, tank.x, tank.x + TANK_WIDTH / 2]) {
    assert.equal(surfaceAt(state.terrain, x), tank.y, `${tank.id}: supported at authored x=${x}`)
  }
}

// Mutating caller-owned nested inputs after construction cannot alter live state.
const retainedTerrain = state.terrain.slice()
const retainedTanks = structuredClone(state.tanks)
source.terrain.points[0].y = 220
source.spawns[0].x = 500
source.spawns[0].hull = 1
source.spawns[0].equipment.push('napalm')
assert.deepEqual(state.terrain, retainedTerrain, 'terrain is detached from caller input')
assert.deepEqual(state.tanks, retainedTanks, 'tank state is detached from caller input')

// Untyped/future callers fail closed at the initialization boundary.
const unknownEquipment = authoredEncounter()
unknownEquipment.spawns[1].equipment = ['baby_missile', 'unknown_weapon']
assert.throws(
  () => createCampaignGameEngine({ encounter: unknownEquipment, combatProfile: profile }),
  'unknown campaign equipment must fail closed',
)

const outsideArena = authoredEncounter()
outsideArena.spawns[0].x = 5
assert.throws(
  () => createCampaignGameEngine({ encounter: outsideArena, combatProfile: profile }),
  'out-of-arena spawn placement must fail closed',
)

const overlappingSpawns = authoredEncounter()
overlappingSpawns.spawns[1].x = overlappingSpawns.spawns[0].x + TANK_WIDTH
assert.throws(
  () => createCampaignGameEngine({ encounter: overlappingSpawns, combatProfile: profile }),
  'overlapping spawn placement must fail closed',
)

const wrongProfile = authoredEncounter()
wrongProfile.combatProfileId = 'unknown-profile'
assert.throws(
  () => createCampaignGameEngine({ encounter: wrongProfile, combatProfile: profile }),
  'encounter/profile identity skew must fail closed',
)

assert.deepEqual(
  ordinarySnapshot(),
  ordinaryBefore,
  'default non-campaign GameEngine construction changed after campaign initialization',
)

console.log(
  'campaign-initialization: PASS (owned authored terrain, exact legal spawns/equipment, fail-closed inputs, detached sources, ordinary parity)',
)
