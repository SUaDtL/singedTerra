// Ash Road T-13 deterministic effects and support contract (AC-05 / AC-06).
//
// This remains deliberately RED until T-14 adds effects.ts and support.ts and
// makes GameEngine drain their campaign-only work before it publishes a settled
// outcome, rotates the turn, or selects a verdict.  The helper API is kept
// source-native: effects owns deterministic queue/refusal facts; support owns
// original-footing evaluation; GameEngine remains the only authority that can
// damage, deform, settle terrain, or publish campaign state.
// Run: node --import tsx scripts/checks/campaign_effects.mjs

import assert from 'node:assert/strict'

import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import { createCampaignObjectStates } from '../../shared/src/campaign/objects.ts'
import { GameEngine } from '../../shared/src/engine/GameEngine.ts'
import {
  ARENA_FLOOR_Y,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SOLID_PIXEL,
  buildBitmap,
  deform,
} from '../../shared/src/engine/Terrain.ts'

const MAX_SETTLEMENT_TICKS = 100_000
const EFFECT_LIMITS = Object.freeze({ maxChainDepth: 8, maxQueuedEffects: 32 })

// T-14 owns these two narrow, pure contracts.  `activateCampaignSupplyDrum`
// is intentionally the atomic mark-then-enqueue boundary: a duplicate or a
// queue refusal must never leave a volatile object eligible to trigger again.
// `enqueueCampaignEffects` receives one simultaneous batch and sorts that
// batch by stable source ID before appending it to the FIFO.  `drain...` only
// removes pending work; GameEngine owns the physical application of each item.
const EXPECTED_CAMPAIGN_MODULES = [
  {
    path: '../../shared/src/campaign/effects.ts',
    exports: [
      'CAMPAIGN_EFFECT_LIMITS',
      'activateCampaignSupplyDrum',
      'createCampaignEffectState',
      'drainCampaignEffects',
      'enqueueCampaignEffects',
    ],
  },
  {
    path: '../../shared/src/campaign/support.ts',
    exports: [
      'countCampaignObjectSupportLoss',
      'settleCampaignObjectSupport',
    ],
  },
]

async function loadCampaignContract({ path, exports }) {
  try {
    const contract = await import(path)
    const missing = exports.filter((name) =>
      (name === 'CAMPAIGN_EFFECT_LIMITS'
        ? contract[name] === undefined
        : typeof contract[name] !== 'function'))
    return missing.length === 0
      ? { contract }
      : { issue: `${path} is missing export(s): ${missing.join(', ')}` }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ERR_MODULE_NOT_FOUND') {
      return { issue: `${path} is absent` }
    }
    throw error
  }
}

const loadedContracts = await Promise.all(EXPECTED_CAMPAIGN_MODULES.map(loadCampaignContract))
const contractIssues = loadedContracts.flatMap((loaded) => loaded.issue ? [loaded.issue] : [])
assert.deepEqual(
  contractIssues,
  [],
  `campaign-effects RED: implement only the explicit T-14 effects/support modules and GameEngine integration (${contractIssues.join('; ')})`,
)

const [{ contract: effects }, { contract: support }] = loadedContracts
const {
  CAMPAIGN_EFFECT_LIMITS,
  activateCampaignSupplyDrum,
  createCampaignEffectState,
  drainCampaignEffects,
  enqueueCampaignEffects,
} = effects
const {
  countCampaignObjectSupportLoss,
  settleCampaignObjectSupport,
} = support

const profile = resolveCampaignCombatProfile({ ...ASH_ROAD_COMBAT_PROFILE_REFERENCE })

assert.deepEqual(
  CAMPAIGN_EFFECT_LIMITS,
  EFFECT_LIMITS,
  'the fixed campaign chain-depth and queued-effect bounds are explicit public values',
)
assert.ok(Object.isFrozen(CAMPAIGN_EFFECT_LIMITS), 'effect limits are immutable configuration')

function effectInput(overrides = {}) {
  return {
    kind: 'supply-drum',
    sourceObjectId: 'drum-a',
    x: 500,
    y: 318,
    actorId: 'human',
    rootCommitmentId: 41,
    depth: 1,
    profile: profile.environmentEffects.supplyDrum,
    ...overrides,
  }
}

function effectSummary(effect) {
  return {
    kind: effect.kind,
    sourceObjectId: effect.sourceObjectId,
    actorId: effect.actorId,
    rootCommitmentId: effect.rootCommitmentId,
    depth: effect.depth,
    x: effect.x,
    y: effect.y,
    profile: effect.profile,
  }
}

function assertEffectState(state, label) {
  assert.ok(state && typeof state === 'object', `${label}: effect state is present`)
  for (const key of ['activatedObjectIds', 'pending', 'technicalFailure']) {
    assert.ok(Object.hasOwn(state, key), `${label}: effect state exposes ${key}`)
  }
  assert.ok(Array.isArray(state.activatedObjectIds), `${label}: activated IDs are ordered`)
  assert.ok(Array.isArray(state.pending), `${label}: pending effects are ordered`)
  assert.ok(
    state.technicalFailure === null || typeof state.technicalFailure === 'object',
    `${label}: technical failure is null or a visible fact`,
  )
}

function assertFailure(failure, code, label) {
  assert.ok(failure && typeof failure === 'object', `${label}: refusal is represented`)
  assert.equal(failure.outcome, 'failure', `${label}: refusal cannot become success`)
  assert.equal(failure.reason, 'technical-failure', `${label}: refusal is visibly technical`)
  assert.equal(failure.code, code, `${label}: refusal retains its exact bound code`)
  assert.equal(failure.reward, false, `${label}: refusal grants no reward`)
  assert.ok(Object.isFrozen(failure), `${label}: refusal fact is immutable`)
}

// A volatile drum is recorded as activated before its effect is queued.  The
// exact profile is copied into the effect instead of falling back to a weapon or
// a global tuning table; indirect work retains the root which destroyed it.
let queueState = createCampaignEffectState()
assertEffectState(queueState, 'initial')
assert.deepEqual(queueState.activatedObjectIds, [], 'no objects begin activated')
assert.deepEqual(queueState.pending, [], 'no effects begin queued')
assert.equal(queueState.technicalFailure, null, 'no technical failure begins active')
assert.ok(Object.isFrozen(queueState), 'initial effect state is immutable')

const firstActivation = activateCampaignSupplyDrum({
  state: queueState,
  effect: effectInput(),
})
assert.equal(firstActivation.activated, true, 'the first destroyed supply drum activates')
queueState = firstActivation.state
assertEffectState(queueState, 'first activation')
assert.deepEqual(queueState.activatedObjectIds, ['drum-a'], 'activation is recorded before work drains')
assert.equal(queueState.pending.length, 1, 'the first activation queues exactly one effect')
assert.deepEqual(
  effectSummary(queueState.pending[0]),
  {
    kind: 'supply-drum',
    sourceObjectId: 'drum-a',
    actorId: 'human',
    rootCommitmentId: 41,
    depth: 1,
    x: 500,
    y: 318,
    profile: {
      maxDamage: 60,
      damageReach: 76,
      craterRadius: 32,
      falloffExponent: 1,
    },
  },
  'the queued drum effect carries the original root and explicit environment profile values',
)
assert.notStrictEqual(
  queueState.pending[0].profile,
  profile.environmentEffects.supplyDrum,
  'the queued environment profile is owned rather than borrowed from the combat catalog',
)
assert.ok(Object.isFrozen(queueState.pending[0]), 'queued effects are immutable')

const duplicateActivation = activateCampaignSupplyDrum({
  state: queueState,
  effect: effectInput({ x: 999, actorId: 'forged', rootCommitmentId: 99 }),
})
assert.equal(duplicateActivation.activated, false, 'an already activated drum cannot enqueue again')
assert.strictEqual(duplicateActivation.state, queueState, 'duplicate activation does not replace deterministic state')

let drained = drainCampaignEffects({ state: queueState })
assert.deepEqual(
  drained.effects.map(effectSummary),
  [effectSummary(queueState.pending[0])],
  'drain returns the first FIFO effect without reattributing it',
)
queueState = drained.state
assert.deepEqual(queueState.pending, [], 'drain removes only the emitted work')
assert.deepEqual(queueState.activatedObjectIds, ['drum-a'], 'drain never clears the once-only ledger')

// A simultaneous destruction batch has a canonical order independent of the
// array order delivered by collision/deformation code.  Existing FIFO work
// remains ahead of the new, ID-sorted batch.
const simultaneous = [
  effectInput({ sourceObjectId: 'drum-z', x: 700 }),
  effectInput({ sourceObjectId: 'drum-a', x: 500 }),
  effectInput({ sourceObjectId: 'drum-m', x: 600 }),
]
for (const permutation of [simultaneous, [...simultaneous].reverse(), [simultaneous[1], simultaneous[2], simultaneous[0]]]) {
  const enqueued = enqueueCampaignEffects({ state: createCampaignEffectState(), effects: permutation })
  assert.equal(enqueued.accepted, true, 'a within-bound simultaneous batch is accepted')
  assert.deepEqual(
    enqueued.state.pending.map((effect) => effect.sourceObjectId),
    ['drum-a', 'drum-m', 'drum-z'],
    'simultaneous destroyed objects are enqueued in stable ID order, not caller order',
  )
  const orderedDrain = drainCampaignEffects({ state: enqueued.state })
  assert.deepEqual(
    orderedDrain.effects.map((effect) => effect.sourceObjectId),
    ['drum-a', 'drum-m', 'drum-z'],
    'the canonical simultaneous order drains FIFO without re-sorting',
  )
}

// Limits fail closed.  They do not silently drop a tail item and they do not
// publish a success/reward for partially processed causal work.
const depthRefusal = enqueueCampaignEffects({
  state: createCampaignEffectState(),
  effects: [effectInput({ sourceObjectId: 'too-deep', depth: EFFECT_LIMITS.maxChainDepth + 1 })],
})
assert.equal(depthRefusal.accepted, false, 'depth nine is refused instead of truncated to eight')
assertFailure(depthRefusal.state.technicalFailure, 'effect-depth-limit', 'depth refusal')
assert.deepEqual(depthRefusal.state.pending, [], 'depth refusal fabricates no partial effect')

const capacityFill = enqueueCampaignEffects({
  state: createCampaignEffectState(),
  effects: Array.from({ length: EFFECT_LIMITS.maxQueuedEffects }, (_, index) => effectInput({
    sourceObjectId: `capacity-${String(index).padStart(2, '0')}`,
    x: 100 + index,
  })),
})
assert.equal(capacityFill.accepted, true, 'the exact queue capacity is accepted')
assert.equal(capacityFill.state.pending.length, EFFECT_LIMITS.maxQueuedEffects, 'the queue reaches its explicit capacity')
const capacityRefusal = enqueueCampaignEffects({
  state: capacityFill.state,
  effects: [effectInput({ sourceObjectId: 'capacity-overflow', x: 900 })],
})
assert.equal(capacityRefusal.accepted, false, 'the thirty-third effect is refused rather than silently discarded')
assertFailure(capacityRefusal.state.technicalFailure, 'effect-queue-limit', 'queue refusal')
assert.deepEqual(
  capacityRefusal.state.pending.map((effect) => effect.sourceObjectId),
  capacityFill.state.pending.map((effect) => effect.sourceObjectId),
  'queue refusal preserves every already queued effect and appends no partial tail',
)

const markBeforeQueueRefusal = activateCampaignSupplyDrum({
  state: capacityFill.state,
  effect: effectInput({ sourceObjectId: 'late-drum', x: 901 }),
})
assert.equal(markBeforeQueueRefusal.activated, false, 'a capacity refusal declines the activation work')
assert.deepEqual(
  markBeforeQueueRefusal.state.activatedObjectIds,
  ['late-drum'],
  'the destroyed drum is marked before enqueue refusal so it can never retrigger',
)
assertFailure(markBeforeQueueRefusal.state.technicalFailure, 'effect-queue-limit', 'mark-before-enqueue refusal')
assert.equal(
  activateCampaignSupplyDrum({
    state: markBeforeQueueRefusal.state,
    effect: effectInput({ sourceObjectId: 'late-drum', x: 901 }),
  }).activated,
  false,
  'a repeated settlement cannot retry a drum after a failed enqueue',
)

// Support never samples a moving surface or a synthesized new footing.  It is
// measured against the three stored opening feet, considering solid material at
// the original foot pixel through four pixels below it.  Two losses disable the
// object; one loss survives.  Once disabled, terrain raising cannot revive it.
const SUPPORT_SURFACE_Y = 318
function supportTerrain() {
  return buildBitmap(new Uint16Array(CANVAS_WIDTH).fill(SUPPORT_SURFACE_Y))
}

function supportObject() {
  return createCampaignObjectStates([
    { id: 'support-structure', kind: 'protected', x: 600, width: 40, height: 40, health: 80 },
  ], supportTerrain())[0]
}

function clearOriginalFooting(terrain, sample, through = 4) {
  for (let y = sample.y; y <= sample.y + through; y += 1) {
    terrain[y * CANVAS_WIDTH + Math.floor(sample.x)] = 0
  }
}

const originalSupportObject = supportObject()
assert.equal(
  countCampaignObjectSupportLoss(originalSupportObject, supportTerrain()),
  0,
  'all three authored support samples begin on solid terrain',
)
assert.deepEqual(
  originalSupportObject.supportSamples,
  [
    { x: 580, y: SUPPORT_SURFACE_Y },
    { x: 600, y: SUPPORT_SURFACE_Y },
    { x: 620, y: SUPPORT_SURFACE_Y },
  ],
  'support checks consume the original left/center/right feet, not recomputed object bounds',
)

// Fixed structures do not adapt their left/right feet to a slope.  The stored
// samples are the first/center/last integer columns inside the AABB, all at the
// center-derived bottom.  Construction fails closed when that exact row lacks
// a foot or when raised terrain enters the body above it.
function slopedSupportTerrain(surfaceByX) {
  const heights = new Uint16Array(CANVAS_WIDTH).fill(SUPPORT_SURFACE_Y)
  for (const [x, surface] of Object.entries(surfaceByX)) {
    heights[Number(x)] = surface
  }
  return buildBitmap(heights)
}

function missingCenterFootTerrain() {
  const terrain = supportTerrain()
  for (let y = 0; y <= ARENA_FLOOR_Y; y += 1) {
    terrain[y * CANVAS_WIDTH + 600] = 0
  }
  return terrain
}

function constructionOutcome(definition, terrain) {
  try {
    return {
      accepted: true,
      supportSamples: createCampaignObjectStates([definition], terrain)[0].supportSamples,
    }
  } catch (error) {
    return {
      accepted: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

const innerFootObject = createCampaignObjectStates([
  { id: 'odd-width', kind: 'protected', x: 600.75, width: 39, height: 40, health: 80 },
], supportTerrain())[0]
assert.deepEqual(
  {
    innerFootPlacement: {
      collisionBounds: innerFootObject.collisionBounds,
      supportSamples: innerFootObject.supportSamples,
    },
    missingLeftFoot: constructionOutcome(
      { id: 'down-left', kind: 'protected', x: 600, width: 40, height: 40, health: 80 },
      slopedSupportTerrain({ 580: SUPPORT_SURFACE_Y + 1 }),
    ),
    missingCenterFoot: constructionOutcome(
      { id: 'missing-center', kind: 'protected', x: 600, width: 40, height: 40, health: 80 },
      missingCenterFootTerrain(),
    ),
    missingRightFoot: constructionOutcome(
      { id: 'down-right', kind: 'protected', x: 600, width: 40, height: 40, health: 80 },
      slopedSupportTerrain({ 620: SUPPORT_SURFACE_Y + 1 }),
    ),
    intrudingLeftBoundary: constructionOutcome(
      { id: 'up-left', kind: 'protected', x: 600, width: 40, height: 40, health: 80 },
      slopedSupportTerrain({ 580: SUPPORT_SURFACE_Y - 1 }),
    ),
    intrudingInterior: constructionOutcome(
      { id: 'up-interior', kind: 'protected', x: 600, width: 40, height: 40, health: 80 },
      slopedSupportTerrain({ 590: SUPPORT_SURFACE_Y - 1 }),
    ),
    intrudingRightBoundary: constructionOutcome(
      { id: 'up-right', kind: 'protected', x: 600, width: 40, height: 40, health: 80 },
      slopedSupportTerrain({ 620: SUPPORT_SURFACE_Y - 1 }),
    ),
  },
  {
    innerFootPlacement: {
      collisionBounds: {
        left: 581.25,
        right: 620.25,
        top: SUPPORT_SURFACE_Y - 40,
        bottom: SUPPORT_SURFACE_Y,
      },
      supportSamples: [
        { x: 582, y: SUPPORT_SURFACE_Y },
        { x: 600, y: SUPPORT_SURFACE_Y },
        { x: 620, y: SUPPORT_SURFACE_Y },
      ],
    },
    missingLeftFoot: {
      accepted: false,
      message: 'unsupported campaign object "down-left"',
    },
    missingCenterFoot: {
      accepted: false,
      message: 'unsupported campaign object "missing-center"',
    },
    missingRightFoot: {
      accepted: false,
      message: 'unsupported campaign object "down-right"',
    },
    intrudingLeftBoundary: {
      accepted: false,
      message: 'campaign terrain intersects object body for "up-left"',
    },
    intrudingInterior: {
      accepted: false,
      message: 'campaign terrain intersects object body for "up-interior"',
    },
    intrudingRightBoundary: {
      accepted: false,
      message: 'campaign terrain intersects object body for "up-right"',
    },
  },
  'object construction uses fixed common-foot samples and rejects both unsupported and intruding slopes',
)

const boundaryFooting = supportTerrain()
clearOriginalFooting(boundaryFooting, originalSupportObject.supportSamples[0], 3)
assert.equal(
  countCampaignObjectSupportLoss(originalSupportObject, boundaryFooting),
  0,
  'solid exactly four pixels below original foot depth still supports the structure',
)

const partialFooting = supportTerrain()
clearOriginalFooting(partialFooting, originalSupportObject.supportSamples[0])
assert.equal(
  countCampaignObjectSupportLoss(originalSupportObject, partialFooting),
  1,
  'one missing original support is a partial loss',
)
const partialSettlement = settleCampaignObjectSupport(originalSupportObject, partialFooting)
assert.deepEqual(
  { health: partialSettlement.health, alive: partialSettlement.alive },
  { health: 80, alive: true },
  'one of three support losses cannot destroy or disable a structure',
)

const failedFooting = partialFooting.slice()
clearOriginalFooting(failedFooting, originalSupportObject.supportSamples[1])
assert.equal(
  countCampaignObjectSupportLoss(originalSupportObject, failedFooting),
  2,
  'two of three original supports are the deterministic failure threshold',
)
const collapsed = settleCampaignObjectSupport(originalSupportObject, failedFooting)
assert.deepEqual(
  { health: collapsed.health, alive: collapsed.alive },
  { health: 0, alive: false },
  'two lost supports destroy or disable the structure through the shared object state',
)

const raisedAfterPartial = partialFooting.slice()
deform(raisedAfterPartial, 600, SUPPORT_SURFACE_Y - 12, 24, true)
const partialAfterRaise = settleCampaignObjectSupport(partialSettlement, raisedAfterPartial)
assert.deepEqual(
  { health: partialAfterRaise.health, alive: partialAfterRaise.alive },
  { health: 80, alive: true },
  'terrain raising cannot turn a surviving one-third loss into a false support death',
)
const raisedAfterCollapse = failedFooting.slice()
deform(raisedAfterCollapse, 600, SUPPORT_SURFACE_Y - 12, 24, true)
const collapsedAfterRaise = settleCampaignObjectSupport(collapsed, raisedAfterCollapse)
assert.deepEqual(
  { health: collapsedAfterRaise.health, alive: collapsedAfterRaise.alive },
  { health: 0, alive: false },
  'terrain raising cannot restore a structure that already failed its original support rule',
)
assert.deepEqual(
  settleCampaignObjectSupport(collapsedAfterRaise, raisedAfterCollapse),
  collapsedAfterRaise,
  'already-dead support settlement is idempotent',
)

function flatEncounter({
  encounterId = 'effects-contract',
  objects = [],
  objective = { kind: 'eliminate', protectedObjectIds: ['refinery'] },
} = {}) {
  return {
    kind: 'campaign-encounter',
    episodeVersion: 1,
    encounterVersion: 1,
    encounterId,
    combatProfileId: 'ash-road-v1',
    combatProfileVersion: 1,
    contentDigest: 'e'.repeat(64),
    seed: 0x0a_13_05,
    terrain: {
      kind: 'height-control-points',
      version: 1,
      width: CANVAS_WIDTH,
      bitmapHeight: CANVAS_HEIGHT,
      floorY: ARENA_FLOOR_Y,
      points: [
        { x: 0, y: SUPPORT_SURFACE_Y },
        { x: CANVAS_WIDTH - 1, y: SUPPORT_SURFACE_Y },
      ],
    },
    spawns: [
      { id: 'human', role: 'human', x: 120, hull: 100, equipment: ['baby_missile', 'missile', 'shield'] },
      { id: 'defender', role: 'defender', x: 590, hull: 1, equipment: ['baby_missile', 'missile', 'shield'] },
    ],
    objects,
    objective,
    warning: null,
  }
}

function createEffectsEngine(overrides = {}) {
  return createCampaignGameEngine({
    encounter: flatEncounter(overrides),
    combatProfile: profile,
  })
}

function campaignProjection(engine, label) {
  const state = engine.getState()
  assert.ok(state.campaign && typeof state.campaign === 'object', `${label}: campaign projection is present`)
  for (const key of ['activeCommitment', 'settledOutcome', 'result', 'objects', 'effects']) {
    assert.ok(Object.hasOwn(state.campaign, key), `${label}: campaign.${key} is required`)
  }
  const { effects: effectProjection } = state.campaign
  assertEffectState(effectProjection, `${label}: campaign.effects`)
  assert.ok(Array.isArray(effectProjection.resolved), `${label}: resolved effect ledger is visible`)
  return state.campaign
}

function objectById(objects, id) {
  const object = objects.find((candidate) => candidate.id === id)
  assert.ok(object, `missing campaign object ${id}`)
  return object
}

function directObjectProjectile(x, y, weaponType = 'missile') {
  return {
    x,
    y,
    vx: 40,
    vy: 0,
    weaponType,
    age: 0,
    hasSplit: false,
    bounces: 0,
  }
}

function settle(engine, label, beforeTick) {
  let ticks = 0
  while (['FIRING', 'RESOLVING'].includes(engine.getState().phase)) {
    assert.ok(ticks < MAX_SETTLEMENT_TICKS, `${label}: engine exceeded settlement bound`)
    beforeTick?.(engine.getState(), ticks)
    engine.tick()
    ticks += 1
  }
  assert.ok(ticks > 0, `${label}: source engine performed causal work`)
  return ticks
}

function finalDefenderChainObjects(order = ['drum-b', 'refinery', 'drum-a']) {
  const byId = {
    'drum-a': { id: 'drum-a', kind: 'supply-drum', x: 500, width: 24, height: 24, health: 1 },
    'drum-b': { id: 'drum-b', kind: 'supply-drum', x: 550, width: 24, height: 24, health: 1 },
    refinery: { id: 'refinery', kind: 'protected', x: 630, width: 40, height: 40, health: 1 },
  }
  return order.map((id) => ({ ...byId[id] }))
}

// The source-engine path is the decisive integration proof.  A real accepted
// shot is retargeted only at its in-flight projectile, as the existing object
// harness does, so the campaign root, terrain settle, object collision, chain,
// verdict, and turn machine all remain owned by GameEngine.  The shot causes
// simultaneous drum destruction in a deliberately scrambled author order;
// their environment chain destroys the last defender and the protected refinery.
// It must finish as protected-object failure, never an ordinary early victory.
function runFinalDefenderChain(order) {
  const engine = createEffectsEngine({
    encounterId: 'effects-final-order-parity',
    objects: finalDefenderChainObjects(order),
  })
  assert.equal(engine.applyAction({ type: 'select_weapon', weapon: 'missile' }), true)
  assert.equal(engine.applyAction({ type: 'fire' }), true)
  const before = engine.getState()
  assert.equal(before.campaign?.activeCommitment?.actorId, 'human', 'the shot opens one original root')
  const forced = directObjectProjectile(460, SUPPORT_SURFACE_Y - 20)
  before.projectiles = [forced]
  before.projectile = forced

  let sawEffectWork = false
  let sawTerrainMutation = false
  let sawPrematureVerdict = false
  settle(engine, 'final defender chain', (state) => {
    const campaign = campaignProjection(engine, 'final defender chain: during settlement')
    if (campaign.effects.pending.length > 0 || campaign.effects.resolved.length > 0) {
      sawEffectWork = true
      sawTerrainMutation ||= state.terrainVersion > 0
      if (campaign.effects.pending.length > 0 || state.phase === 'FIRING' || state.phase === 'RESOLVING') {
        sawPrematureVerdict ||= campaign.result !== null
      }
      assert.equal(
        campaign.activeCommitment?.rootCommitmentId,
        1,
        'all queued environment work remains under the original accepted root until drain',
      )
      assert.equal(campaign.settledOutcome, null, 'effects settle before the immutable outcome publishes')
    }
  })
  const campaign = campaignProjection(engine, 'final defender chain: settled')
  sawEffectWork ||= campaign.effects.resolved.length > 0
  sawTerrainMutation ||= engine.getState().terrainVersion > 0
  return {
    state: engine.getState(),
    campaign,
    sawEffectWork,
    sawTerrainMutation,
    sawPrematureVerdict,
  }
}

const chainA = runFinalDefenderChain(['drum-b', 'refinery', 'drum-a'])
const chainB = runFinalDefenderChain(['drum-a', 'drum-b', 'refinery'])
for (const chain of [chainA, chainB]) {
  assert.equal(chain.sawEffectWork, true, 'the source engine visibly drains environment effects')
  assert.equal(chain.sawTerrainMutation, true, 'environment effects deform terrain before their verdict')
  assert.equal(chain.sawPrematureVerdict, false, 'no victory/failure publishes while causal effects remain')
  assert.deepEqual(
    chain.campaign.effects.activatedObjectIds,
    ['drum-a', 'drum-b'],
    'each volatile object activates exactly once despite source object order',
  )
  assert.deepEqual(
    chain.campaign.effects.resolved.map((effect) => effect.sourceObjectId),
    ['drum-a', 'drum-b'],
    'simultaneous engine destruction drains supply drums in stable FIFO/ID order',
  )
  for (const effect of chain.campaign.effects.resolved) {
    assert.deepEqual(
      {
        actorId: effect.actorId,
        rootCommitmentId: effect.rootCommitmentId,
        profile: effect.profile,
      },
      {
        actorId: 'human',
        rootCommitmentId: 1,
        profile: { maxDamage: 60, damageReach: 76, craterRadius: 32, falloffExponent: 1 },
      },
      'resolved environment effects retain original attribution and explicit numeric profile',
    )
  }
  assert.equal(objectById(chain.campaign.objects, 'refinery').alive, false, 'the protected refinery physically fails')
  assert.equal(chain.state.tanks.find((tank) => tank.id === 'defender')?.alive, false, 'the final defender physically fails')
  assert.deepEqual(
    chain.campaign.result,
    { outcome: 'failure', reason: 'protected-object', commitmentId: 1 },
    'protected failure after the final defender defeats the ordinary-victory path',
  )
  assert.equal(chain.state.phase, 'GAME_OVER', 'the settled campaign failure stops turn rotation')
}
assert.deepEqual(
  chainA.campaign,
  chainB.campaign,
  'clone/replay-equivalent object-order permutations reach byte-equal campaign effects and result',
)

// Repeated ticks after the settled root are inert: neither a drum nor its
// technical/result ledger can re-enter the queue.  A clone made before causal
// work drains reaches the same exact campaign projection.
const replayEngine = createEffectsEngine({ objects: finalDefenderChainObjects() })
assert.equal(replayEngine.applyAction({ type: 'select_weapon', weapon: 'missile' }), true)
assert.equal(replayEngine.applyAction({ type: 'fire' }), true)
const replayState = replayEngine.getState()
const replayProjectile = directObjectProjectile(460, SUPPORT_SURFACE_Y - 20)
replayState.projectiles = [replayProjectile]
replayState.projectile = replayProjectile
const replayClone = replayEngine.clone()
settle(replayEngine, 'clone source')
settle(replayClone, 'clone replay')
assert.deepEqual(replayClone.getState().campaign, replayEngine.getState().campaign,
  'a pre-drain clone settles the same ordered effects, supports, and final verdict')
const settledEffects = replayEngine.getState().campaign.effects
for (let index = 0; index < 8; index += 1) replayEngine.tick()
assert.deepEqual(
  replayEngine.getState().campaign.effects,
  settledEffects,
  'idle/repeated settlement cannot republish or retrigger a drum',
)

// The entire effects/support surface is campaign-only.  Ordinary construction
// retains the pre-campaign state shape and standard turn behavior.
const ordinary = new GameEngine({ seed: 0x0a_13_05, rounds: 1 })
assert.equal(Object.hasOwn(ordinary.getState(), 'campaign'), false, 'ordinary state has no campaign projection')
assert.equal(ordinary.applyAction({ type: 'use_shield', weapon: 'shield' }), true,
  'ordinary shield still resolves through its unmodified path')
assert.equal(Object.hasOwn(ordinary.getState(), 'campaign'), false,
  'ordinary settlement never introduces effect/support campaign fields')

console.log(
  'campaign-effects: PASS (once-only marked drum activation, stable FIFO chains, explicit profiles, fail-closed bounds, original-foot support, causal settlement, final-defender failure precedence, clone/order/default parity)',
)
