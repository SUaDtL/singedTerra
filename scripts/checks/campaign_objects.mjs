// Ash Road T-11 object-physics contract (AC-02 / AC-04).
//
// This is intentionally RED until T-12 adds shared/src/campaign/objects.ts and
// threads its opt-in object state through campaign construction, projectile
// sweeps, blast resolution, and tank movement. Ordinary engine callers retain
// their current object-free signatures and state shape.
// Run: npx tsx scripts/checks/campaign_objects.mjs

import assert from 'node:assert/strict'

import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import {
  sweepCollide,
  wrapSideWall,
} from '../../shared/src/engine/Physics.ts'
import { resolveTankMove } from '../../shared/src/engine/Movement.ts'
import {
  ARENA_FLOOR_Y,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  buildBitmap,
} from '../../shared/src/engine/Terrain.ts'

// T-12 public helper API. Object state is owned by the engine, not an extra
// tank/player shape. Its bounds and three authored support samples are explicit
// so collision, damage, rendering, and support effects all consume one fact.
const EXPECTED_OBJECT_MODULE = {
  path: '../../shared/src/campaign/objects.ts',
  exports: [
    'applyCampaignObjectBlast',
    'createCampaignObjectStates',
    'isLiveCampaignObject',
  ],
}

async function loadObjectContract() {
  try {
    const contract = await import(EXPECTED_OBJECT_MODULE.path)
    const missing = EXPECTED_OBJECT_MODULE.exports.filter((name) =>
      typeof contract[name] !== 'function')
    return missing.length === 0
      ? { contract }
      : { issue: `${EXPECTED_OBJECT_MODULE.path} is missing function export(s): ${missing.join(', ')}` }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ERR_MODULE_NOT_FOUND') {
      return { issue: `${EXPECTED_OBJECT_MODULE.path} is absent` }
    }
    throw error
  }
}

const loaded = await loadObjectContract()
assert.ok(
  !loaded.issue,
  `campaign-objects RED: implement the explicit T-12 object API and opt-in engine integration (${loaded.issue})`,
)

const {
  applyCampaignObjectBlast,
  createCampaignObjectStates,
  isLiveCampaignObject,
} = loaded.contract

const FLAT_SURFACE_Y = 318
const profile = resolveCampaignCombatProfile({ ...ASH_ROAD_COMBAT_PROFILE_REFERENCE })

function flatTerrain() {
  return buildBitmap(new Uint16Array(CANVAS_WIDTH).fill(FLAT_SURFACE_Y))
}

function objectDefinitions() {
  return [
    { id: 'refinery', kind: 'protected', x: 320, width: 40, height: 40, health: 80 },
    { id: 'drum', kind: 'supply-drum', x: 500, width: 24, height: 24, health: 30 },
    { id: 'cache', kind: 'cache', x: 700, width: 36, height: 28, health: 45 },
    { id: 'relay', kind: 'relay', x: 900, width: 18, height: 60, health: 60 },
  ]
}

function campaignEncounter(objects = objectDefinitions()) {
  return {
    kind: 'campaign-encounter',
    episodeVersion: 1,
    encounterVersion: 1,
    encounterId: 'objects-contract',
    combatProfileId: 'ash-road-v1',
    combatProfileVersion: 1,
    contentDigest: 'b'.repeat(64),
    seed: 0x0b_12_04,
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
      { id: 'human', role: 'human', x: 120, hull: 100, equipment: ['baby_missile', 'missile', 'shield'] },
      { id: 'defender', role: 'defender', x: 1080, hull: 100, equipment: ['baby_missile', 'missile', 'shield'] },
    ],
    objects,
    objective: { kind: 'eliminate', protectedObjectIds: ['refinery'] },
    warning: null,
  }
}

function createEngine(objects) {
  return createCampaignGameEngine({ encounter: campaignEncounter(objects), combatProfile: profile })
}

function projectile(x, y, vx = 0, vy = 0) {
  return {
    x,
    y,
    vx,
    vy,
    weaponType: 'baby_missile',
    age: 0,
    hasSplit: false,
    bounces: 0,
  }
}

function objectById(objects, id) {
  const object = objects.find((candidate) => candidate.id === id)
  assert.ok(object, `missing object ${id}`)
  return object
}

function campaignObjects(state, label) {
  assert.ok(state.campaign && typeof state.campaign === 'object', `${label}: campaign projection is present`)
  assert.ok(Object.hasOwn(state.campaign, 'objects'), `${label}: campaign.objects is required`)
  assert.ok(Array.isArray(state.campaign.objects), `${label}: campaign.objects is an array`)
  return state.campaign.objects
}

function assertNoCampaignObjectKeys(value, label, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(
      key !== 'campaign' && key !== 'objects',
      `${label}: ordinary state exposed campaign object key ${key}`,
    )
    assertNoCampaignObjectKeys(nested, label, seen)
  }
}

// Engine construction owns all four object kinds with stable IDs. These are
// battlefield entities only: they are never seats, turn owners, or inventories.
const sourceObjects = objectDefinitions()
const engine = createEngine(sourceObjects)
const state = engine.getState()
const objects = campaignObjects(state, 'owned construction')
assert.deepEqual(
  objects.map((object) => ({ id: object.id, kind: object.kind, health: object.health, alive: object.alive })),
  [
    { id: 'refinery', kind: 'protected', health: 80, alive: true },
    { id: 'drum', kind: 'supply-drum', health: 30, alive: true },
    { id: 'cache', kind: 'cache', health: 45, alive: true },
    { id: 'relay', kind: 'relay', health: 60, alive: true },
  ],
  'all authored object kinds retain their stable identity, health, and liveness',
)
assert.notStrictEqual(objects, sourceObjects, 'engine owns a detached object collection')

const refinery = objectById(objects, 'refinery')
assert.deepEqual(
  refinery.collisionBounds,
  { left: 300, right: 340, top: 278, bottom: 318 },
  'object collision bounds use the authored AABB on the canonical terrain surface',
)
assert.deepEqual(
  refinery.supportSamples,
  [
    { x: 300, y: FLAT_SURFACE_Y },
    { x: 320, y: FLAT_SURFACE_Y },
    { x: 340, y: FLAT_SURFACE_Y },
  ],
  'object support is three explicit left/center/right terrain samples',
)
assert.ok(isLiveCampaignObject(refinery), 'a positive-health object is live')
for (const object of objects) {
  assert.ok(!state.tanks.some((tank) => tank.id === object.id), `${object.id}: object is not a tank seat`)
  assert.notEqual(state.activePlayerId, object.id, `${object.id}: object cannot own a turn`)
  assert.ok(!Object.hasOwn(object, 'inventory'), `${object.id}: object has no weapon inventory identity`)
  assert.ok(!Object.hasOwn(object, 'selectedWeapon'), `${object.id}: object has no selected weapon identity`)
  assert.ok(!Object.hasOwn(object, 'accessories'), `${object.id}: object has no tank equipment identity`)
}
sourceObjects[0].health = 1
sourceObjects[0].width = 1
assert.deepEqual(
  objectById(campaignObjects(engine.getState(), 'detached construction'), 'refinery').collisionBounds,
  { left: 300, right: 340, top: 278, bottom: 318 },
  'caller mutation after construction cannot change engine-owned object bounds',
)

// Projectile contacts select the first point of travel across terrain, tanks,
// and live object AABBs. Object/object ties are independent of caller array
// order and resolve by stable object ID.
const terrain = flatTerrain()
const sweepObjects = createCampaignObjectStates(objectDefinitions(), terrain)
{
  const shell = projectile(400, 300)
  shell.x = 800
  const hit = sweepCollide(shell, 400, 300, terrain, [{ ...state.tanks[1], x: 760, y: 318 }], 'open', undefined, sweepObjects)
  assert.deepEqual(hit, { type: 'object', objectId: 'drum', x: shell.x, y: shell.y },
    'an earlier live object contact beats a later tank contact')
}
{
  const spikeTerrain = terrain.slice()
  spikeTerrain[300 * CANVAS_WIDTH + 450] = 1
  const shell = projectile(400, 300)
  shell.x = 800
  const hit = sweepCollide(shell, 400, 300, spikeTerrain, [], 'open', undefined, sweepObjects)
  assert.equal(hit.type, 'ground', 'an earlier terrain pixel beats a later live object')
  assert.equal(shell.x, 450, 'terrain contact snaps to the earliest sampled coordinate')
}
{
  const shell = projectile(400, 310)
  shell.x = 800
  const hit = sweepCollide(shell, 400, 310, terrain, [{ ...state.tanks[1], x: 460, y: 318 }], 'open', undefined, sweepObjects)
  assert.equal(hit.type, 'tank', 'an earlier tank contact beats a later live object')
}
{
  const tied = createCampaignObjectStates([
    { id: 'cache-b', kind: 'cache', x: 520, width: 20, height: 20, health: 10 },
    { id: 'cache-a', kind: 'cache', x: 520, width: 20, height: 20, health: 10 },
  ], terrain)
  for (const order of [tied, [...tied].reverse()]) {
    const shell = projectile(480, 300)
    shell.x = 560
    const hit = sweepCollide(shell, 480, 300, terrain, [], 'open', undefined, order)
    assert.equal(hit.type, 'object', 'tied live objects produce an object contact')
    assert.equal(hit.objectId, 'cache-a', 'tied objects resolve by stable ID, not caller order')
  }
}

// Wrap must carry the exact unconsumed segment into the paired rail. The entry
// side object is still hit; no sampled overshoot may be discarded at the wall.
{
  const wrapObjects = createCampaignObjectStates([
    { id: 'wrap-cache', kind: 'cache', x: 6, width: 4, height: 24, health: 10 },
  ], terrain)
  const shell = projectile(CANVAS_WIDTH + 10, 300, 20, 0)
  const wall = sweepCollide(shell, CANVAS_WIDTH - 10, 300, terrain, [], 'wrap', undefined, wrapObjects)
  assert.equal(wall.type, 'wall', 'wrap sweep first reports the authored rail contact')
  const entry = wrapSideWall(shell, wall, terrain, [], undefined, wrapObjects)
  assert.equal(entry.type, 'object', 'wrap remainder immediately sweeps the entry-side object')
  assert.equal(entry.objectId, 'wrap-cache', 'wrap remainder retains the exact object identity')
}

// A live AABB blocks legal one-pixel movement before fuel is spent. A dead
// object remains in the result ledger but no longer blocks the same path.
const movementTerrain = flatTerrain()
const movementObjects = createCampaignObjectStates([
  { id: 'movement-cache', kind: 'cache', x: 265, width: 30, height: 24, health: 10 },
], movementTerrain)
const moverSource = structuredClone(state.tanks[0])
moverSource.x = 240
moverSource.y = FLAT_SURFACE_Y
moverSource.fuel = 100
const moverBlocked = structuredClone(moverSource)
assert.equal(
  resolveTankMove(moverBlocked, [moverBlocked], movementTerrain, 8, movementObjects),
  0,
  'live object blocks an otherwise legal tank path',
)
assert.equal(moverBlocked.fuel, 100, 'rejected object movement spends no fuel')
const deadMovementObjects = movementObjects.map((object) =>
  object.id === 'movement-cache' ? { ...object, health: 0, alive: false } : object)
assert.equal(
  resolveTankMove(moverSource, [moverSource], movementTerrain, 8, deadMovementObjects),
  8,
  'dead objects do not block the identical legal path',
)
assert.equal(moverSource.fuel, 92, 'accepted movement retains ordinary per-pixel fuel accounting')

// Object blast reach is AABB-to-point geometry. This blast is outside cache's
// center-radius but reaches its left face; a tangent at the exact AABB reach is
// zero damage. Applying the same blast is pure and deterministic.
const blastCache = objectById(createCampaignObjectStates(objectDefinitions(), terrain), 'cache')
const blast = { cx: 667, cy: 304, radius: 16, maxDamage: 60 }
const firstBlast = applyCampaignObjectBlast(blastCache, blast)
const secondBlast = applyCampaignObjectBlast(structuredClone(blastCache), blast)
assert.deepEqual(firstBlast, secondBlast, 'object blast damage is deterministic for equal inputs')
assert.ok(firstBlast.damage > 0 && firstBlast.damage < blast.maxDamage,
  'AABB face within reach takes partial damage even though the object center is outside reach')
assert.equal(firstBlast.object.health, blastCache.health - firstBlast.damage,
  'object blast damage updates the owned health, not a center-radius alias')
const tangent = applyCampaignObjectBlast(blastCache, { cx: 666, cy: 304, radius: 16, maxDamage: 60 })
assert.equal(tangent.damage, 0, 'the exact AABB blast boundary has zero damage')
assert.equal(tangent.object.alive, true, 'zero blast damage does not fabricate object death')

// Direct contact and its resulting object damage run through the authoritative
// engine, not a fixture-only collision helper. Equivalent engines settle the
// same one-tick direct hit to byte-equal campaign object facts.
function resolveDirectObjectContact() {
  const direct = createEngine()
  const directState = direct.getState()
  const shell = projectile(650, 304, 40, 0)
  directState.phase = 'FIRING'
  directState.projectiles = [shell]
  directState.projectile = shell
  direct.tick()
  return campaignObjects(direct.getState(), 'direct object contact')
}
const directA = resolveDirectObjectContact()
const directB = resolveDirectObjectContact()
assert.deepEqual(directA, directB, 'direct object contacts produce deterministic state')
assert.ok(
  objectById(directA, 'cache').health < 45,
  'a direct projectile/object contact applies authoritative object damage',
)

// The added path is opt-in. Existing physics/movement calls and ordinary state
// remain object-free when no campaign construction exists.
const ordinary = new GameEngine().getState()
assert.equal(Object.hasOwn(ordinary, 'campaign'), false, 'ordinary GameState has no campaign projection')
assertNoCampaignObjectKeys(ordinary, 'ordinary GameState')
const ordinaryShellA = projectile(400, 300)
ordinaryShellA.x = 800
const ordinaryShellB = structuredClone(ordinaryShellA)
assert.deepEqual(
  sweepCollide(ordinaryShellA, 400, 300, terrain, [], 'open'),
  sweepCollide(ordinaryShellB, 400, 300, terrain, [], 'open', undefined, []),
  'object-free sweep behavior is unchanged by the optional object argument',
)
const ordinaryMoverA = structuredClone(state.tanks[0])
const ordinaryMoverB = structuredClone(state.tanks[0])
ordinaryMoverA.x = ordinaryMoverB.x = 240
ordinaryMoverA.y = ordinaryMoverB.y = FLAT_SURFACE_Y
ordinaryMoverA.fuel = ordinaryMoverB.fuel = 100
assert.equal(
  resolveTankMove(ordinaryMoverA, [ordinaryMoverA], terrain, 8),
  resolveTankMove(ordinaryMoverB, [ordinaryMoverB], terrain, 8, []),
  'object-free movement distance is unchanged by the optional object argument',
)
assert.deepEqual(
  { x: ordinaryMoverA.x, y: ordinaryMoverA.y, fuel: ordinaryMoverA.fuel },
  { x: ordinaryMoverB.x, y: ordinaryMoverB.y, fuel: ordinaryMoverB.fuel },
  'object-free movement state is byte-identical',
)

console.log(
  'campaign-objects: PASS (owned object entities, swept contacts/wrap, movement, AABB blasts, deterministic direct hits, ordinary parity)',
)
