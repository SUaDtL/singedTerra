import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { createCampaignGameEngine } from '../../shared/src/campaign/initialization.ts'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../../shared/src/campaign/combatProfiles.ts'
import { parseCampaignEncounterDefinition } from '../../shared/src/campaign/definitions.ts'
import { ASH_ROAD_EPISODE } from '../../client/src/campaign/content/episode.ts'
import { FUEL_STOP_TRANSCRIPTS } from '../../client/src/campaign/content/fuel-stop.ts'
import { HIGH_ROAD_TRANSCRIPTS } from '../../client/src/campaign/content/high-road.ts'
import { SALVAGE_PIT_TRANSCRIPTS } from '../../client/src/campaign/content/salvage-pit.ts'
import { RELAY_RIDGE_TRANSCRIPTS } from '../../client/src/campaign/content/relay-ridge.ts'
import { parseCampaignReplayCommands } from '../../client/src/campaign/runReducer.ts'

const fixturePath = fileURLToPath(new URL('./fixtures/campaign-balance/corpus-v1.json', import.meta.url))
const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
const transcriptFamilies = {
  'fuel-stop': FUEL_STOP_TRANSCRIPTS,
  'high-road': HIGH_ROAD_TRANSCRIPTS,
  'salvage-pit': SALVAGE_PIT_TRANSCRIPTS,
  'relay-ridge': RELAY_RIDGE_TRANSCRIPTS,
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function exactKeys(value, keys) {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/
function identifier(value) {
  return typeof value === 'string' && value.length <= 64 && IDENTIFIER.test(value)
}

function parseOffense(value) {
  if (!Array.isArray(value) || value.length !== profile.kit.offensiveSlots
    || new Set(value).size !== value.length
    || value.some((weaponId) => typeof weaponId !== 'string'
      || !profile.choices.includes(weaponId)
      || profile.catalog[weaponId].slot !== 'offense')) return null
  return Object.freeze([...value])
}

function parseScenarioBase(value, keys) {
  if (!record(value) || !exactKeys(value, keys) || !identifier(value.id)
    || !identifier(value.terrainFamily) || !identifier(value.spawnFamily)
    || (value.inventorySource !== 'granted' && value.inventorySource !== 'checkpoint-refill')
    || !Number.isSafeInteger(value.economicCost) || value.economicCost < 0
    || value.economicCost > 16
    || (value.inventorySource === 'granted' && value.economicCost !== 0)
    || (value.inventorySource === 'checkpoint-refill' && value.economicCost !== 1)) return null
  const offense = parseOffense(value.offense)
  return offense ? { offense } : null
}

function parseFixtureTurn(value) {
  if (!record(value) || !exactKeys(value, ['actorId', 'actions']) || !identifier(value.actorId)) return null
  const actions = parseCampaignReplayCommands(value.actions)
  if (!actions || actions.length === 0) return null
  return Object.freeze({ actorId: value.actorId, actions })
}

function parseRetainedScenario(value) {
  const keys = ['id', 'encounter', 'transcript', 'terrainFamily', 'spawnFamily', 'offense',
    'inventorySource', 'economicCost']
  const base = parseScenarioBase(value, keys)
  if (!base || !identifier(value.encounter) || !identifier(value.transcript)) return null
  return Object.freeze({ ...value, offense: base.offense, evidenceSet: 'retained' })
}

function parseHoldoutScenario(value) {
  const keys = ['id', 'terrainFamily', 'spawnFamily', 'offense', 'inventorySource',
    'economicCost', 'encounter', 'prelude', 'decision']
  const base = parseScenarioBase(value, keys)
  const encounter = parseCampaignEncounterDefinition(value?.encounter)
  if (!base || !encounter || encounter.combatProfileId !== profile.profileId
    || encounter.combatProfileVersion !== profile.profileVersion
    || !Array.isArray(value.prelude) || value.prelude.length > 16) return null
  const prelude = value.prelude.map(parseFixtureTurn)
  const decision = parseFixtureTurn(value.decision)
  if (!decision || prelude.some((turn) => turn === null)) return null
  return Object.freeze({
    id: value.id,
    terrainFamily: value.terrainFamily,
    spawnFamily: value.spawnFamily,
    offense: base.offense,
    inventorySource: value.inventorySource,
    economicCost: value.economicCost,
    encounter,
    prelude: Object.freeze(prelude),
    decision,
    evidenceSet: 'held-out',
  })
}

function parseBalanceFixture(value) {
  if (!record(value) || !exactKeys(value, ['schemaVersion', 'aimErrorDegrees', 'scenarios', 'holdouts'])
    || value.schemaVersion !== 1 || !Array.isArray(value.aimErrorDegrees)
    || value.aimErrorDegrees.length !== 3
    || !value.aimErrorDegrees.every((item, index) => item === [-2, 0, 2][index])
    || !Array.isArray(value.scenarios) || value.scenarios.length === 0 || value.scenarios.length > 64
    || !Array.isArray(value.holdouts) || value.holdouts.length < 4 || value.holdouts.length > 16) return null
  const scenarios = value.scenarios.map(parseRetainedScenario)
  const holdouts = value.holdouts.map(parseHoldoutScenario)
  if (scenarios.some((scenario) => scenario === null) || holdouts.some((scenario) => scenario === null)) return null
  const ids = [...scenarios, ...holdouts].map(({ id }) => id)
  if (new Set(ids).size !== ids.length) return null
  return Object.freeze({
    schemaVersion: 1,
    aimErrorDegrees: Object.freeze([...value.aimErrorDegrees]),
    scenarios: Object.freeze(scenarios),
    holdouts: Object.freeze(holdouts),
  })
}

const rawFixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const fixture = parseBalanceFixture(rawFixture)
assert.ok(fixture, 'campaign balance fixture must match the exact v1 schema')

const malformedRoot = structuredClone(rawFixture)
malformedRoot.extra = true
assert.equal(parseBalanceFixture(malformedRoot), null, 'fixture parser rejects extra root keys')
const malformedVersion = structuredClone(rawFixture)
malformedVersion.schemaVersion = 2
assert.equal(parseBalanceFixture(malformedVersion), null, 'fixture parser rejects unknown versions')
const malformedScenario = structuredClone(rawFixture)
malformedScenario.scenarios[0].economicCost = -1
assert.equal(parseBalanceFixture(malformedScenario), null, 'fixture parser rejects invalid costs')
const malformedProvenance = structuredClone(rawFixture)
malformedProvenance.scenarios[0].inventorySource = 'reward'
assert.equal(parseBalanceFixture(malformedProvenance), null, 'fixture parser rejects invalid provenance')
const missingScenarioKey = structuredClone(rawFixture)
delete missingScenarioKey.scenarios[0].transcript
assert.equal(parseBalanceFixture(missingScenarioKey), null, 'fixture parser rejects missing scenario keys')
const extraScenarioKey = structuredClone(rawFixture)
extraScenarioKey.scenarios[0].unexpected = true
assert.equal(parseBalanceFixture(extraScenarioKey), null, 'fixture parser rejects extra scenario keys')
const grantedWithCost = structuredClone(rawFixture)
grantedWithCost.scenarios[0].economicCost = 1
assert.equal(parseBalanceFixture(grantedWithCost), null, 'granted inventory cannot carry a supply cost')
const freeCheckpointRefill = structuredClone(rawFixture)
freeCheckpointRefill.scenarios.find(({ inventorySource }) => inventorySource === 'checkpoint-refill').economicCost = 0
assert.equal(parseBalanceFixture(freeCheckpointRefill), null,
  'checkpoint-refill inventory must carry the reviewed one-supply cost')
const malformedHoldout = structuredClone(rawFixture)
malformedHoldout.holdouts[0].decision.actions[0].unexpected = true
assert.equal(parseBalanceFixture(malformedHoldout), null, 'fixture parser rejects malformed held-out actions')

function settle(engine) {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    if (ticks++ >= 1_200) return { completed: false, ticks, reason: 'settlement-tick-limit' }
    engine.tick()
  }
  return { completed: true, ticks, reason: null }
}

function actionsWithAimError(actions, errorDegrees) {
  return actions.map((action) => action.type === 'set_angle'
    ? { ...action, angle: Math.max(0, Math.min(180, action.angle + errorDegrees)) }
    : action)
}

function applyDecision(engine, actions) {
  for (const action of actions) {
    if (!engine.applyAction(action)) return { completed: false, ticks: 0, reason: `rejected-${action.type}` }
  }
  return settle(engine)
}

function sumObjectHealth(state) {
  return (state.campaign?.objects ?? []).reduce((sum, object) => sum + object.health, 0)
}

function encounterIdForScenario(scenario) {
  return typeof scenario.encounter === 'string' ? scenario.encounter : scenario.encounter.encounterId
}

function knownProbeFields({ before, scenario, turn, decisionTurn, weapon, aimErrorDegrees }) {
  const actorBefore = before.tanks.find(({ id }) => id === turn.actorId)
  return {
    caseId: `${scenario.id}:decision-${decisionTurn}:aim-${aimErrorDegrees}`,
    scenarioId: scenario.id,
    evidenceSet: scenario.evidenceSet,
    encounterId: encounterIdForScenario(scenario),
    combatProfile: ASH_ROAD_COMBAT_PROFILE_REFERENCE,
    seed: scenario.seed,
    terrainFamily: scenario.terrainFamily,
    spawnFamily: scenario.spawnFamily,
    walls: before.walls,
    terrainCondition: decisionTurn === 1 ? 'opening' : 'pre-damaged',
    seatAdvantage: decisionTurn === 1 ? 'human-opener' : 'human-reply',
    protectedObjects: (before.campaign?.objects ?? []).filter(({ kind }) => kind === 'protected').length,
    objectKinds: [...new Set((before.campaign?.objects ?? []).map(({ kind }) => kind))].sort(),
    shieldStateBefore: actorBefore?.shieldHp ?? 0,
    inventory: {
      owned: ['baby_missile'],
      granted: scenario.inventorySource === 'granted' ? [...scenario.offense, 'shield'] : ['shield'],
      purchased: scenario.inventorySource === 'checkpoint-refill' ? [...scenario.offense] : [],
      campaignReward: [],
    },
    decisionTurn,
    weapon,
    aimBudgetDegrees: turn.actions.some(({ type }) => type === 'set_angle')
      ? [...fixture.aimErrorDegrees]
      : [0],
    aimErrorDegrees,
  }
}

function measureDecision({ engine, scenario, turn, decisionTurn, aimErrorDegrees }) {
  const probe = engine.clone()
  const before = probe.getState()
  const actorBefore = before.tanks.find(({ id }) => id === turn.actorId)
  const actions = actionsWithAimError(turn.actions, aimErrorDegrees)
  const weapon = actions.find(({ type }) => type === 'select_weapon')?.weapon
    ?? actions.find(({ type }) => type === 'use_shield')?.weapon
    ?? actorBefore?.selectedWeapon
  const known = knownProbeFields({ before, scenario, turn, decisionTurn, weapon, aimErrorDegrees })
  const settlement = applyDecision(probe, actions)
  if (!settlement.completed) {
    return {
      ...known,
      completed: false,
      incompleteReason: settlement.reason,
      metrics: {
        hullDamage: null,
        shieldAbsorption: null,
        fallDamage: null,
        hazardDamage: null,
        selfDamage: null,
        allyDamage: null,
        objectDamage: null,
        remainingAmmo: null,
        economicCost: scenario.economicCost,
        resolutionTicks: settlement.reason === 'settlement-tick-limit' ? settlement.ticks : null,
        objectiveSuccess: null,
        terminalOutcome: null,
      },
    }
  }
  const after = probe.getState()
  const actorAfter = after.tanks.find(({ id }) => id === turn.actorId)
  const damage = after.campaign?.settledOutcome?.damage
  return {
    ...known,
    completed: true,
    incompleteReason: null,
    metrics: {
      hullDamage: damage?.hullDamage ?? 0,
      shieldAbsorption: damage?.shieldAbsorption ?? 0,
      fallDamage: damage?.fallDamage ?? 0,
      hazardDamage: damage?.hazardDamage ?? 0,
      selfDamage: damage?.selfDamage ?? 0,
      allyDamage: damage?.alliedDamage ?? 0,
      objectDamage: damage?.objectDamage ?? Math.max(0, sumObjectHealth(before) - sumObjectHealth(after)),
      remainingAmmo: actorAfter?.inventory[weapon]?.unlimited
        ? 'unlimited'
        : actorAfter?.inventory[weapon]?.count ?? null,
      economicCost: scenario.economicCost,
      resolutionTicks: settlement.ticks,
      objectiveSuccess: after.campaign?.result?.outcome === 'success',
      terminalOutcome: after.campaign?.result?.outcome ?? null,
    },
  }
}

function humanLoadout(offense) {
  return {
    hull: 100,
    ammunition: [
      { weaponId: 'baby_missile', quantity: null },
      ...offense.map((weaponId) => ({
        weaponId,
        quantity: profile.catalog[weaponId].startingAmmunition,
      })),
      { weaponId: 'shield', quantity: profile.catalog.shield.startingAmmunition },
    ],
  }
}

function runCorpus() {
  const records = []
  for (const rawScenario of fixture.scenarios) {
    const encounter = ASH_ROAD_EPISODE.encounters.find(
      ({ encounterId }) => encounterId === rawScenario.encounter,
    )
    assert.ok(encounter, `${rawScenario.id}: encounter exists`)
    const scenario = { ...rawScenario, seed: encounter.seed }
    const transcript = transcriptFamilies[scenario.encounter]?.[scenario.transcript]
    assert.ok(transcript, `${scenario.id}: transcript exists`)
    const engine = createCampaignGameEngine({
      encounter,
      combatProfile: profile,
      humanLoadout: humanLoadout(scenario.offense),
    })
    let decisionTurn = 0
    for (const turn of transcript.turns) {
      assert.equal(engine.getState().activePlayerId, turn.actorId, `${scenario.id}: actor order`)
      if (turn.actorId === 'p1') {
        decisionTurn += 1
        const hasAim = turn.actions.some(({ type }) => type === 'set_angle')
        for (const aimErrorDegrees of hasAim ? fixture.aimErrorDegrees : [0]) {
          records.push(measureDecision({ engine, scenario, turn, decisionTurn, aimErrorDegrees }))
        }
      }
      const applied = applyDecision(engine, turn.actions)
      assert.equal(applied.completed, true, `${scenario.id}: retained transcript completes`)
    }
  }

  for (const rawScenario of fixture.holdouts) {
    const scenario = { ...rawScenario, seed: rawScenario.encounter.seed }
    const engine = createCampaignGameEngine({
      encounter: scenario.encounter,
      combatProfile: profile,
      humanLoadout: humanLoadout(scenario.offense),
    })
    for (const turn of scenario.prelude) {
      assert.equal(engine.getState().activePlayerId, turn.actorId, `${scenario.id}: held-out prelude order`)
      const applied = applyDecision(engine, turn.actions)
      assert.equal(applied.completed, true, `${scenario.id}: held-out prelude completes`)
    }
    assert.equal(engine.getState().activePlayerId, scenario.decision.actorId,
      `${scenario.id}: held-out decision actor`)
    const hasAim = scenario.decision.actions.some(({ type }) => type === 'set_angle')
    const decisionTurn = scenario.prelude.filter(({ actorId }) => actorId === scenario.decision.actorId).length + 1
    for (const aimErrorDegrees of hasAim ? fixture.aimErrorDegrees : [0]) {
      records.push(measureDecision({
        engine,
        scenario,
        turn: scenario.decision,
        decisionTurn,
        aimErrorDegrees,
      }))
    }
  }

  const incompleteSource = fixture.holdouts[0]
  const incompleteScenario = {
    ...incompleteSource,
    id: 'holdout-forced-incomplete',
    seed: incompleteSource.encounter.seed,
  }
  const incompleteEngine = createCampaignGameEngine({
    encounter: incompleteSource.encounter,
    combatProfile: profile,
    humanLoadout: humanLoadout(incompleteSource.offense),
  })
  records.push(measureDecision({
    engine: incompleteEngine,
    scenario: incompleteScenario,
    turn: {
      actorId: 'p1',
      actions: parseCampaignReplayCommands([
        { type: 'select_weapon', weapon: 'napalm' },
        { type: 'fire' },
      ]),
    },
    decisionTurn: 1,
    aimErrorDegrees: 0,
  }))
  return records
}

const first = runCorpus()
const second = runCorpus()
assert.deepEqual(second, first, 'repeated source-native corpus must be byte-stable')
assert.ok(first.some(({ evidenceSet }) => evidenceSet === 'held-out'),
  'AC-19 requires deterministic held-out terrain, spawn, shield, and object probes')
assert.ok(first.some(({ completed }) => completed === false),
  'the corpus must retain an intentional incomplete probe')
assert.ok(first.every(({ completed, incompleteReason }) =>
  typeof completed === 'boolean' && (completed || typeof incompleteReason === 'string')),
'incomplete probes must remain explicit')
const incomplete = first.find(({ completed }) => !completed)
assert.ok(incomplete, 'forced incomplete probe exists')
assert.equal(incomplete.seed, fixture.holdouts[0].encounter.seed, 'incomplete probe keeps its known seed')
assert.deepEqual(incomplete.metrics, {
  hullDamage: null,
  shieldAbsorption: null,
  fallDamage: null,
  hazardDamage: null,
  selfDamage: null,
  allyDamage: null,
  objectDamage: null,
  remainingAmmo: null,
  economicCost: fixture.holdouts[0].economicCost,
  resolutionTicks: null,
  objectiveSuccess: null,
  terminalOutcome: null,
}, 'incomplete probe retains known cost/ticks and explicitly nulls unavailable metrics')
assert.deepEqual(
  [...new Set(first.map(({ weapon }) => weapon))].sort(),
  ['baby_missile', 'cluster_bomb', 'missile', 'napalm', 'sandhog', 'shield'],
  'each selected chapter weapon needs a demonstrated corpus role',
)
assert.ok(new Set(first.map(({ seed }) => seed)).size >= 8, 'retained and held-out seeds remain distinct')
assert.ok(new Set(first.map(({ terrainFamily }) => terrainFamily)).size >= 4, 'multiple terrain families')
assert.ok(first.some(({ shieldStateBefore }) => shieldStateBefore > 0), 'shielded state')
assert.ok(first.some(({ terrainCondition }) => terrainCondition === 'pre-damaged'), 'pre-damaged state')
assert.ok(first.some(({ protectedObjects }) => protectedObjects > 0), 'protected-object state')
const heldOut = first.filter(({ evidenceSet, completed }) => evidenceSet === 'held-out' && completed)
assert.ok(new Set(heldOut.map(({ seed }) => seed)).size >= 4, 'held-out seeds')
assert.ok(new Set(heldOut.map(({ terrainFamily }) => terrainFamily)).size >= 4, 'held-out terrain cases')
assert.ok(new Set(heldOut.map(({ spawnFamily }) => spawnFamily)).size >= 4, 'held-out spawn cases')
assert.ok(heldOut.some(({ shieldStateBefore }) => shieldStateBefore > 0), 'held-out shield case')
assert.ok(heldOut.some(({ objectKinds }) => objectKinds.includes('supply-drum')),
  'held-out volatile-object case')
assert.ok(heldOut.some(({ objectKinds }) => objectKinds.includes('protected')),
  'held-out protected-object case')

const report = {
  schemaVersion: 1,
  method: {
    engine: 'source GameEngine via createCampaignGameEngine',
    fixtures: 'nine retained authored transcripts plus four disjoint held-out source-engine setups',
    fixtureSelection: 'retained regression corpus is reported separately from non-production held-out terrain, spawn, shield, and object probes',
    combatProfile: ASH_ROAD_COMBAT_PROFILE_REFERENCE,
    pairing: 'each human firing decision at -2, 0, and +2 degrees from the same engine clone',
    searchBudget: 'one full authoritative simulation per paired probe; 1200-tick hard completion bound',
    interpretation: 'mechanical scenario differences only; not human win rates or a universal tier list',
  },
  sampleSize: first.length,
  completed: first.filter(({ completed }) => completed).length,
  incomplete: first.filter(({ completed }) => !completed).length,
  records: first,
}

console.log(JSON.stringify(report, null, 2))
