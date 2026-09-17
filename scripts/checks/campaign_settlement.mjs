// Ash Road T-09 settled campaign commitment contract (AC-02 / AC-06).
//
// This is intentionally RED until commitments.ts, outcomes.ts, and the opt-in
// GameEngine campaign projection implement the shared settlement boundary.
// Run: node --import tsx scripts/checks/campaign_settlement.mjs

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

const MAX_SETTLEMENT_TICKS = 100_000
const EXPECTED_CAMPAIGN_MODULES = [
  {
    path: '../../shared/src/campaign/commitments.ts',
    exports: ['classifyCampaignCommitment'],
  },
  {
    path: '../../shared/src/campaign/outcomes.ts',
    exports: [
      'appendCampaignDamageComponent',
      'createCampaignDamageSummary',
      'decideCampaignOutcome',
    ],
  },
]

async function loadCampaignContract({ path, exports }) {
  try {
    const contract = await import(path)
    const missing = exports.filter((name) => typeof contract[name] !== 'function')
    return missing.length === 0
      ? { contract }
      : { issue: `${path} is missing function export(s): ${missing.join(', ')}` }
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
  `campaign-settlement RED: implement the explicit T-10 contracts (${contractIssues.join('; ')})`,
)

const [{ contract: commitments }, { contract: outcomes }] = loadedContracts
const { classifyCampaignCommitment } = commitments
const {
  appendCampaignDamageComponent,
  createCampaignDamageSummary,
  decideCampaignOutcome,
} = outcomes

function flatEncounter({
  encounterId = 'settlement-contract',
  humanEquipment = ['baby_missile', 'missile', 'shield'],
  defenderEquipment = ['baby_missile', 'missile', 'shield'],
  objective = { kind: 'eliminate', protectedObjectIds: [] },
} = {}) {
  const surfaceY = 318
  return {
    kind: 'campaign-encounter',
    episodeVersion: 1,
    encounterVersion: 1,
    encounterId,
    combatProfileId: 'ash-road-v1',
    combatProfileVersion: 1,
    contentDigest: '9'.repeat(64),
    seed: 0x09_10_06,
    terrain: {
      kind: 'height-control-points',
      version: 1,
      width: CANVAS_WIDTH,
      bitmapHeight: CANVAS_HEIGHT,
      floorY: ARENA_FLOOR_Y,
      points: [
        { x: 0, y: surfaceY },
        { x: CANVAS_WIDTH - 1, y: surfaceY },
      ],
    },
    spawns: [
      { id: 'p1', role: 'human', x: 240, hull: 100, equipment: humanEquipment },
      { id: 'p2', role: 'defender', x: 860, hull: 100, equipment: defenderEquipment },
    ],
    objects: [],
    objective,
    warning: null,
  }
}

const combatProfile = resolveCampaignCombatProfile({ ...ASH_ROAD_COMBAT_PROFILE_REFERENCE })

function createCampaignEngine(overrides) {
  return createCampaignGameEngine({
    encounter: flatEncounter(overrides),
    combatProfile,
  })
}

function campaignState(engine, label) {
  const state = engine.getState()
  assert.ok(
    Object.hasOwn(state, 'campaign'),
    `${label}: opt-in engine state must expose a campaign projection`,
  )
  assert.ok(state.campaign && typeof state.campaign === 'object', `${label}: campaign projection`)
  for (const key of ['commitmentCount', 'activeCommitment', 'settledOutcome', 'result']) {
    assert.ok(Object.hasOwn(state.campaign, key), `${label}: campaign.${key} is required`)
  }
  return state.campaign
}

function assertNoCampaignKeys(value, label, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(
      key !== 'campaign' && !key.toLowerCase().startsWith('campaign'),
      `${label}: ordinary state exposed campaign-only key ${key}`,
    )
    assertNoCampaignKeys(nested, label, seen)
  }
}

function assertCommitmentShape(commitment, expected, label) {
  assert.ok(commitment, `${label}: active commitment is present`)
  assert.deepEqual(
    {
      id: commitment.id,
      rootCommitmentId: commitment.rootCommitmentId,
      actorId: commitment.actorId,
      action: commitment.action,
    },
    expected,
    `${label}: root identity is captured before action mutation`,
  )
  assert.ok(Object.isFrozen(commitment), `${label}: published commitment is immutable`)
}

function assertSettledShape(outcome, expected, label) {
  assert.ok(outcome, `${label}: one settled outcome is published`)
  assert.deepEqual(
    {
      commitmentId: outcome.commitmentId,
      rootCommitmentId: outcome.rootCommitmentId,
      actorId: outcome.actorId,
      action: outcome.action,
    },
    expected,
    `${label}: settled outcome retains the accepted root`,
  )
  assert.ok(outcome.damage && typeof outcome.damage === 'object', `${label}: damage summary is present`)
  assert.ok(Object.isFrozen(outcome), `${label}: settled outcome is immutable`)
  assert.ok(Object.isFrozen(outcome.damage), `${label}: settled damage is immutable`)
}

function settle(engine, label, beforeEachTick) {
  let ticks = 0
  while (['FIRING', 'RESOLVING'].includes(engine.getState().phase)) {
    assert.ok(ticks < MAX_SETTLEMENT_TICKS, `${label}: engine exceeded settlement bound`)
    beforeEachTick?.(engine.getState(), ticks)
    engine.tick()
    ticks += 1
  }
  assert.ok(ticks > 0, `${label}: expected causal engine work before settlement`)
  return ticks
}

function directGroundProjectile(x, surfaceY, weaponType = 'missile') {
  return {
    x: x - 40,
    y: surfaceY - 0.15,
    vx: 40,
    vy: 0,
    weaponType,
    age: 0,
    hasSplit: false,
    bounces: 0,
  }
}

// Public classification is deliberately acceptance-aware. Merely naming a
// turn-ending action cannot consume a commitment.
assert.equal(classifyCampaignCommitment({ action: { type: 'fire' }, accepted: true }), 'fire')
assert.equal(
  classifyCampaignCommitment({ action: { type: 'use_shield', weapon: 'shield' }, accepted: true }),
  'shield',
)
for (const sample of [
  { action: { type: 'fire' }, accepted: false },
  { action: { type: 'use_shield' }, accepted: false },
  { action: { type: 'set_angle', angle: 50 }, accepted: true },
  { action: { type: 'set_power', power: 70 }, accepted: true },
  { action: { type: 'select_weapon', weapon: 'missile' }, accepted: true },
  { action: { type: 'buy_preview', weapon: 'missile' }, accepted: true },
  { action: { type: 'buy', weapon: 'baby_missile' }, accepted: false },
  { action: { type: 'move', delta: 1 }, accepted: true },
]) {
  assert.equal(
    classifyCampaignCommitment(sample),
    null,
    `${sample.action.type}: only accepted fire/shield are campaign commitments`,
  )
}

// Componentized harm is immutable and keeps physical kind separate from causal
// attribution. Every component retains the original actor/root even when the
// immediate source is an object, hazard, fall, or other environment effect.
let damage = createCampaignDamageSummary({ actorId: 'p1', rootCommitmentId: 7 })
const damageComponents = [
  {
    damageKind: 'hull', amount: 8, creditedDamage: 8,
    target: { kind: 'tank', id: 'enemy' }, attribution: 'enemy',
    source: { kind: 'weapon', id: 'baby_missile' }, actorId: 'p1', rootCommitmentId: 7,
  },
  {
    damageKind: 'shield', amount: 7, creditedDamage: 0,
    target: { kind: 'tank', id: 'enemy' }, attribution: 'enemy',
    source: { kind: 'weapon', id: 'baby_missile' }, actorId: 'p1', rootCommitmentId: 7,
  },
  {
    damageKind: 'fall', amount: 5, creditedDamage: 0,
    target: { kind: 'tank', id: 'enemy' }, attribution: 'environment',
    source: { kind: 'environment', id: 'terrain-collapse' }, actorId: 'p1', rootCommitmentId: 7,
  },
  {
    damageKind: 'hull', amount: 4, creditedDamage: 0,
    target: { kind: 'tank', id: 'p1' }, attribution: 'self',
    source: { kind: 'weapon', id: 'baby_missile' }, actorId: 'p1', rootCommitmentId: 7,
  },
  {
    damageKind: 'hull', amount: 6, creditedDamage: 0,
    target: { kind: 'tank', id: 'ally' }, attribution: 'ally',
    source: { kind: 'object', id: 'drum-a' }, actorId: 'p1', rootCommitmentId: 7,
  },
  {
    damageKind: 'object', amount: 9, creditedDamage: 0,
    target: { kind: 'object', id: 'refinery' }, attribution: 'object',
    source: { kind: 'weapon', id: 'baby_missile' }, actorId: 'p1', rootCommitmentId: 7,
  },
  {
    damageKind: 'hazard', amount: 3, creditedDamage: 0,
    target: { kind: 'tank', id: 'p1' }, attribution: 'environment',
    source: { kind: 'hazard', id: 'announced-strike' }, actorId: 'p1', rootCommitmentId: 7,
  },
]

for (const component of damageComponents) {
  const before = damage
  damage = appendCampaignDamageComponent(damage, component)
  assert.notStrictEqual(damage, before, 'damage append returns a new summary')
  assert.ok(Object.isFrozen(damage), 'damage summary is immutable')
  assert.ok(Object.isFrozen(damage.components), 'damage component collection is immutable')
}

assert.deepEqual(
  {
    hullDamage: damage.hullDamage,
    shieldAbsorption: damage.shieldAbsorption,
    fallDamage: damage.fallDamage,
    hazardDamage: damage.hazardDamage,
    selfDamage: damage.selfDamage,
    alliedDamage: damage.alliedDamage,
    objectDamage: damage.objectDamage,
    creditedDamage: damage.creditedDamage,
  },
  {
    hullDamage: 18,
    shieldAbsorption: 7,
    fallDamage: 5,
    hazardDamage: 3,
    selfDamage: 4,
    alliedDamage: 6,
    objectDamage: 9,
    creditedDamage: 8,
  },
  'physical damage components and attribution totals remain distinct',
)
assert.deepEqual(
  damage.components.map(({ damageKind, attribution, source, actorId, rootCommitmentId }) => ({
    damageKind,
    attribution,
    sourceKind: source.kind,
    actorId,
    rootCommitmentId,
  })),
  [
    { damageKind: 'hull', attribution: 'enemy', sourceKind: 'weapon', actorId: 'p1', rootCommitmentId: 7 },
    { damageKind: 'shield', attribution: 'enemy', sourceKind: 'weapon', actorId: 'p1', rootCommitmentId: 7 },
    { damageKind: 'fall', attribution: 'environment', sourceKind: 'environment', actorId: 'p1', rootCommitmentId: 7 },
    { damageKind: 'hull', attribution: 'self', sourceKind: 'weapon', actorId: 'p1', rootCommitmentId: 7 },
    { damageKind: 'hull', attribution: 'ally', sourceKind: 'object', actorId: 'p1', rootCommitmentId: 7 },
    { damageKind: 'object', attribution: 'object', sourceKind: 'weapon', actorId: 'p1', rootCommitmentId: 7 },
    { damageKind: 'hazard', attribution: 'environment', sourceKind: 'hazard', actorId: 'p1', rootCommitmentId: 7 },
  ],
  'component records preserve actor/root identity through indirect causes',
)

// Verdict order is failure, success, then the declared limit. Failure wins a
// simultaneous collision; reaching a success limit while alive still succeeds.
const verdictBase = {
  protectedObjectFailed: false,
  playerFailed: false,
  objectiveSatisfied: false,
  limitReached: false,
  limitOutcome: 'failure',
}
assert.deepEqual(
  decideCampaignOutcome({
    ...verdictBase,
    protectedObjectFailed: true,
    objectiveSatisfied: true,
    limitReached: true,
    limitOutcome: 'success',
  }),
  { outcome: 'failure', reason: 'protected-object' },
  'protected-object failure precedes simultaneous success and limit',
)
assert.deepEqual(
  decideCampaignOutcome({
    ...verdictBase,
    playerFailed: true,
    objectiveSatisfied: true,
    limitReached: true,
    limitOutcome: 'success',
  }),
  { outcome: 'failure', reason: 'player' },
  'player failure precedes simultaneous success and limit',
)
assert.deepEqual(
  decideCampaignOutcome({ ...verdictBase, objectiveSatisfied: true, limitReached: true }),
  { outcome: 'success', reason: 'objective' },
  'mission success precedes a simultaneous failure-declared limit',
)
const successAtLimit = decideCampaignOutcome({
  ...verdictBase,
  limitReached: true,
  limitOutcome: 'success',
})
assert.deepEqual(
  successAtLimit,
  { outcome: 'success', reason: 'limit' },
  'a surviving player can win exactly at the declared limit',
)
assert.ok(Object.isFrozen(successAtLimit), 'published verdict is immutable')
assert.equal(decideCampaignOutcome(verdictBase), null, 'non-terminal boundary has no verdict')

// Aim, selection, movement, rejected buying, rejected fire, and rejected shield
// exercise the real engine API without changing the campaign counter.
const rejectedEngine = createCampaignEngine({
  encounterId: 'settlement-rejections',
  humanEquipment: ['baby_missile', 'missile'],
})
assert.equal(campaignState(rejectedEngine, 'rejections:initial').commitmentCount, 0)
assert.equal(rejectedEngine.applyAction({ type: 'set_angle', angle: 50 }), true)
assert.equal(rejectedEngine.applyAction({ type: 'set_power', power: 70 }), true)
assert.equal(rejectedEngine.applyAction({ type: 'select_weapon', weapon: 'missile' }), true)
assert.equal(rejectedEngine.applyAction({ type: 'move', delta: 1 }), true)
assert.equal(rejectedEngine.applyAction({ type: 'buy', weapon: 'baby_missile' }), false)
assert.equal(rejectedEngine.applyAction({ type: 'select_weapon', weapon: 'mega_nuke' }), true)
assert.equal(rejectedEngine.applyAction({ type: 'fire' }), false)
assert.equal(rejectedEngine.applyAction({ type: 'use_shield', weapon: 'shield' }), false)
assert.deepEqual(
  campaignState(rejectedEngine, 'rejections:after'),
  {
    encounterId: 'settlement-rejections',
    objective: { kind: 'eliminate', protectedObjectIds: [] },
    commitmentCount: 0,
    activeCommitment: null,
    settledOutcome: null,
    result: null,
  },
  'non-commitments and rejected commands leave the campaign boundary untouched',
)

// The resolved campaign profile, not the ordinary catalog, owns all campaign
// shield, shopping, and post-shot economy behavior. These are source-engine
// assertions: no adapter may rewrite the outcome after GameEngine mutates it.
const profileShieldEngine = createCampaignEngine({ encounterId: 'settlement-profile-shield' })
const profileShieldTank = profileShieldEngine.getState().tanks.find(({ id }) => id === 'p1')
assert.ok(profileShieldTank, 'campaign profile shield fixture has the human tank')
assert.equal(profileShieldEngine.applyAction({ type: 'use_shield', weapon: 'shield' }), true)
assert.equal(
  profileShieldTank.shieldHp,
  90,
  'campaign shield capacity comes from the resolved profile, not the ordinary 120-point catalog',
)

const profileBuyEngine = createCampaignEngine({ encounterId: 'settlement-profile-buy' })
const profileBuyTank = profileBuyEngine.getState().tanks.find(({ id }) => id === 'p1')
assert.ok(profileBuyTank, 'campaign profile shopping fixture has the human tank')
profileBuyTank.credits = 10_000
const profileBuyBefore = {
  credits: profileBuyTank.credits,
  missileAmmo: profileBuyTank.inventory.missile.count,
}
assert.equal(
  profileBuyEngine.applyAction({ type: 'buy', weapon: 'missile' }),
  false,
  'campaign profile rejects buying when battleShopping is false',
)
assert.deepEqual(
  {
    credits: profileBuyTank.credits,
    missileAmmo: profileBuyTank.inventory.missile.count,
  },
  profileBuyBefore,
  'a campaign buy rejection leaves both credits and ammunition unchanged',
)

const profileEconomyEngine = createCampaignEngine({ encounterId: 'settlement-profile-economy' })
const profileEconomyTank = profileEconomyEngine.getState().tanks.find(({ id }) => id === 'p1')
assert.ok(profileEconomyTank, 'campaign profile economy fixture has the human tank')
profileEconomyTank.credits = 37
assert.equal(profileEconomyEngine.applyAction({ type: 'fire' }), true)
settle(profileEconomyEngine, 'profile economy')
assert.equal(
  profileEconomyTank.credits,
  37,
  'zero-valued campaign damage income and shot stipend leave post-shot credits unchanged',
)

// A physical terrain collapse is the causal child of the accepted shot. The
// fall component must therefore use the original root and the actual health
// removed (not a raw distance, a global reward amount, or a post-hoc verdict).
const fallEngine = createCampaignEngine({ encounterId: 'settlement-fall' })
const fallState = fallEngine.getState()
const fallingTank = fallState.tanks.find(({ id }) => id === 'p2')
assert.ok(fallingTank, 'campaign fall fixture has the defender tank')
fallingTank.y = 270
assert.equal(fallEngine.applyAction({ type: 'select_weapon', weapon: 'missile' }), true)
assert.equal(fallEngine.applyAction({ type: 'fire' }), true)
const forcedFallProjectile = directGroundProjectile(fallingTank.x, 318)
fallState.projectiles = [forcedFallProjectile]
fallState.projectile = forcedFallProjectile
const fallHealthBefore = fallingTank.health
settle(fallEngine, 'campaign fall')
const fallHealthRemoved = fallHealthBefore - fallingTank.health
const fallOutcome = campaignState(fallEngine, 'campaign fall:settled').settledOutcome
assert.ok(fallOutcome, 'terrain fall settles under the accepted campaign root')
assert.ok(fallHealthRemoved > 0, 'terrain collapse fixture removes real defender health')
assert.equal(
  fallOutcome.damage.fallDamage,
  fallHealthRemoved,
  'settled fall total equals the actual defender hull health removed',
)
assert.deepEqual(
  fallOutcome.damage.components
    .filter((component) => component.damageKind === 'fall')
    .map((component) => ({
      amount: component.amount,
      creditedDamage: component.creditedDamage,
      target: component.target,
      attribution: component.attribution,
      source: component.source,
      actorId: component.actorId,
      rootCommitmentId: component.rootCommitmentId,
    })),
  [{
    amount: fallHealthRemoved,
    creditedDamage: 0,
    target: { kind: 'tank', id: 'p2' },
    attribution: 'environment',
    source: { kind: 'environment', id: 'terrain-collapse' },
    actorId: 'p1',
    rootCommitmentId: 1,
  }],
  'fall damage is an uncredited terrain-collapse component under root 1',
)

// Accepted fire opens one root immediately, but no outcome exists until all
// projectile and terrain work has drained. Clone replay must settle identically.
const fireEngine = createCampaignEngine({ encounterId: 'settlement-fire' })
assert.equal(fireEngine.applyAction({ type: 'set_angle', angle: 45 }), true)
assert.equal(fireEngine.applyAction({ type: 'set_power', power: 100 }), true)
assert.equal(fireEngine.applyAction({ type: 'fire' }), true)
let fireCampaign = campaignState(fireEngine, 'fire:accepted')
assert.equal(fireCampaign.commitmentCount, 1, 'accepted fire increments exactly once')
assertCommitmentShape(
  fireCampaign.activeCommitment,
  { id: 1, rootCommitmentId: 1, actorId: 'p1', action: 'fire' },
  'fire:accepted',
)
assert.equal(fireCampaign.settledOutcome, null, 'fire does not publish before causal resolution')

const fireClone = fireEngine.clone()
settle(fireEngine, 'fire', (state) => {
  assert.equal(state.campaign?.settledOutcome, null, 'fire outcome waits through every causal tick')
  assert.equal(state.campaign?.commitmentCount, 1, 'fire ticks cannot duplicate a commitment')
})
settle(fireClone, 'fire clone')
assert.deepEqual(
  fireClone.getState().campaign,
  fireEngine.getState().campaign,
  'clone replay reaches the same settled campaign projection',
)

fireCampaign = campaignState(fireEngine, 'fire:settled')
assert.equal(fireCampaign.commitmentCount, 1)
assert.equal(fireCampaign.activeCommitment, null)
assertSettledShape(
  fireCampaign.settledOutcome,
  { commitmentId: 1, rootCommitmentId: 1, actorId: 'p1', action: 'fire' },
  'fire:settled',
)
const firstSettledOutcome = fireCampaign.settledOutcome
for (let index = 0; index < 10; index += 1) fireEngine.tick()
assert.strictEqual(
  campaignState(fireEngine, 'fire:idle').settledOutcome,
  firstSettledOutcome,
  'idle ticks cannot republish or replace a settled outcome',
)

// Campaign game-over waits for the last physical fire tick, and every burn is
// attributed to the weapon/root that ignited it. Ordinary matches retain their
// separate immediate terminal behavior below.
const napalmEngine = createCampaignEngine({
  encounterId: 'settlement-terminal-napalm',
  humanEquipment: ['baby_missile', 'napalm'],
})
const napalmState = napalmEngine.getState()
const napalmDefender = napalmState.tanks.find(({ id }) => id === 'p2')
assert.ok(napalmDefender, 'terminal napalm fixture has the defender tank')
napalmDefender.health = 1
assert.equal(napalmEngine.applyAction({ type: 'select_weapon', weapon: 'napalm' }), true)
assert.equal(napalmEngine.applyAction({ type: 'fire' }), true)
const napalmProjectile = directGroundProjectile(napalmDefender.x, 318, 'napalm')
napalmState.projectiles = [napalmProjectile]
napalmState.projectile = napalmProjectile
let sawDeadDefenderWhileFireRemained = false
let napalmTicks = 0
while (['FIRING', 'RESOLVING'].includes(napalmState.phase)) {
  assert.ok(napalmTicks < MAX_SETTLEMENT_TICKS, 'terminal napalm exceeded settlement bound')
  napalmEngine.tick()
  napalmTicks += 1
  if (!napalmDefender.alive && napalmState.fire.length > 0) {
    sawDeadDefenderWhileFireRemained = true
    assert.equal(napalmState.phase, 'FIRING', 'campaign remains active while terminal fire burns')
    assert.equal(napalmState.campaign?.result, null, 'campaign verdict waits for terminal fire')
  }
}
assert.equal(sawDeadDefenderWhileFireRemained, true, 'fixture proves fire outlives defender death')
assert.equal(napalmState.fire.length, 0, 'terminal campaign drains every fire column')
assert.equal(napalmState.phase, 'GAME_OVER', 'campaign resolves only after terminal fire drains')
const napalmOutcome = campaignState(napalmEngine, 'terminal napalm:settled').settledOutcome
assert.ok(napalmOutcome, 'terminal napalm publishes a settled outcome')
assert.equal(napalmOutcome.damage.hullDamage, 1, 'burn ledger equals actual defender hull removed')
const napalmHullComponents = napalmOutcome.damage.components
  .filter(({ damageKind }) => damageKind === 'hull')
assert.equal(
  napalmHullComponents.reduce((total, { amount }) => total + amount, 0),
  1,
  'napalm component sum equals actual hull removed',
)
assert.ok(
  napalmHullComponents.every(({ source, actorId, rootCommitmentId }) => (
    source.kind === 'weapon' && source.id === 'napalm'
      && actorId === 'p1' && rootCommitmentId === 1
  )),
  'every napalm burn component retains weapon and commitment attribution',
)

// The next accepted action receives the next monotonic ID. Shield uses the same
// completion boundary even though its primitive resolution is synchronous.
assert.equal(fireEngine.getState().activePlayerId, 'p2', 'fire rotated to the defender')
assert.equal(fireEngine.applyAction({ type: 'use_shield', weapon: 'shield' }), true)
const shieldAfterFire = campaignState(fireEngine, 'shield:second commitment')
assert.equal(shieldAfterFire.commitmentCount, 2, 'accepted shield increments exactly once')
assert.equal(shieldAfterFire.activeCommitment, null, 'synchronous shield settles before returning')
assertSettledShape(
  shieldAfterFire.settledOutcome,
  { commitmentId: 2, rootCommitmentId: 2, actorId: 'p2', action: 'shield' },
  'shield:second commitment',
)

// A declared human-commitment survival limit decides on the same synchronous
// shield boundary. Terminal publication prevents every later scheduling action.
const limitEngine = createCampaignEngine({
  encounterId: 'settlement-limit',
  objective: {
    kind: 'survive-or-eliminate',
    protectedObjectIds: [],
    humanCommitments: 1,
  },
})
assert.equal(limitEngine.applyAction({ type: 'use_shield', weapon: 'shield' }), true)
const limitState = limitEngine.getState()
const limitCampaign = campaignState(limitEngine, 'limit:settled')
assert.equal(limitState.tanks.find(({ id }) => id === 'p1')?.alive, true)
assert.equal(limitCampaign.commitmentCount, 1)
assert.deepEqual(
  limitCampaign.result,
  { outcome: 'success', reason: 'limit', commitmentId: 1 },
  'surviving human wins on the boundary that reaches the declared limit',
)
assert.ok(Object.isFrozen(limitCampaign.result), 'terminal result is immutable')
assert.equal(limitState.phase, 'GAME_OVER', 'terminal campaign result stops the turn machine')
const terminalResult = limitCampaign.result
const terminalOutcome = limitCampaign.settledOutcome
for (const action of [
  { type: 'set_angle', angle: 80 },
  { type: 'move', delta: 1 },
  { type: 'fire' },
  { type: 'use_shield', weapon: 'shield' },
]) {
  assert.equal(limitEngine.applyAction(action), false, `${action.type}: terminal result rejects scheduling`)
}
for (let index = 0; index < 10; index += 1) limitEngine.tick()
assert.strictEqual(campaignState(limitEngine, 'limit:idle').result, terminalResult)
assert.strictEqual(campaignState(limitEngine, 'limit:idle').settledOutcome, terminalOutcome)

// Ordinary rounds=1 construction remains the compatibility path: normal actions
// still resolve and no campaign-only key appears before, during, or after them.
const ordinaryShield = new GameEngine({ seed: 0x09_10_06, rounds: 1 })
assertNoCampaignKeys(ordinaryShield.getState(), 'ordinary shield before')
assert.equal(ordinaryShield.applyAction({ type: 'use_shield', weapon: 'shield' }), true)
assert.deepEqual(
  {
    phase: ordinaryShield.getState().phase,
    turn: ordinaryShield.getState().turn,
    round: ordinaryShield.getState().round,
    totalRounds: ordinaryShield.getState().totalRounds,
    activePlayerId: ordinaryShield.getState().activePlayerId,
  },
  { phase: 'PLAYER_TURN', turn: 1, round: 1, totalRounds: 1, activePlayerId: 'p2' },
  'ordinary rounds=1 shield behavior is unchanged',
)
assertNoCampaignKeys(ordinaryShield.getState(), 'ordinary shield after')

const ordinaryFire = new GameEngine({ seed: 0x09_10_06, rounds: 1 })
assert.equal(ordinaryFire.applyAction({ type: 'fire' }), true)
assertNoCampaignKeys(ordinaryFire.getState(), 'ordinary fire in flight')
settle(ordinaryFire, 'ordinary fire')
assertNoCampaignKeys(ordinaryFire.getState(), 'ordinary fire settled')

console.log(
  'campaign-settlement: PASS (accepted-only monotonic roots, once-only settled outcomes, componentized causal damage, failure precedence, limit success, terminal stop, ordinary parity)',
)
