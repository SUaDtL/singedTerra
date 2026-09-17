import {
  FUEL_STOP_FIXTURE,
  FUEL_STOP_IDS,
  FUEL_STOP_TRANSCRIPTS,
  type FuelStopTranscript,
  type FuelStopTranscriptTurn,
} from '../../../client/src/campaign/content/fuel-stop.ts'
import { createCampaignGameEngine } from './initialization.ts'
import { computeAiPlan } from '../engine/AI.ts'
import { GameEngine } from '../engine/GameEngine.ts'
import type { PlayerAction } from '../types/PlayerAction.ts'

const MAX_SETTLEMENT_TICKS = 2_000
const PACING_A = Object.freeze([1])
const PACING_B = Object.freeze([4, 1, 7, 2])

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const assert = Object.freeze({
  equal(actual: unknown, expected: unknown, message = 'values differ'): void {
    if (!Object.is(actual, expected)) {
      throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`)
    }
  },
  deepEqual(actual: unknown, expected: unknown, message = 'structures differ'): void {
    const actualJson = JSON.stringify(actual)
    const expectedJson = JSON.stringify(expected)
    if (actualJson !== expectedJson) {
      throw new Error(`${message}: expected ${expectedJson}, received ${actualJson}`)
    }
  },
})

function terrainChecksum(terrain: Uint8Array): string {
  let hash = 2_166_136_261
  for (const byte of terrain) hash = Math.imul(hash ^ byte, 16_777_619) >>> 0
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

function assertStateEqual(
  actual: ReturnType<GameEngine['getState']>,
  expected: ReturnType<GameEngine['getState']>,
  message: string,
): void {
  assert.deepEqual(
    { ...actual, terrain: undefined },
    { ...expected, terrain: undefined },
    message,
  )
  assert.deepEqual([...actual.terrain], [...expected.terrain], `${message}: terrain bytes`)
}

function actionsForPlan(plan: NonNullable<ReturnType<typeof computeAiPlan>>): readonly PlayerAction[] {
  assert.equal(plan.buy, undefined, 'Fuel Stop enemy cannot enter the ordinary shop path')
  assert.equal(plan.buyAccessory, undefined, 'Fuel Stop enemy cannot enter the ordinary accessory path')
  return Object.freeze([
    Object.freeze({ type: 'select_weapon', weapon: plan.weapon }),
    Object.freeze({ type: 'set_angle', angle: plan.angle }),
    Object.freeze({ type: 'set_power', power: plan.power }),
    Object.freeze(plan.weapon === 'shield'
      ? { type: 'use_shield' as const }
      : { type: 'fire' as const }),
  ])
}

function settle(engine: GameEngine, pacing: readonly number[]): number {
  let ticks = 0
  let frame = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    const frameTicks = pacing[frame % pacing.length]!
    frame += 1
    for (let tick = 0; tick < frameTicks; tick += 1) {
      if (engine.getState().phase !== 'FIRING' && engine.getState().phase !== 'RESOLVING') break
      invariant(ticks < MAX_SETTLEMENT_TICKS, 'Fuel Stop settlement exceeded its fixed tick bound')
      engine.tick()
      ticks += 1
    }
  }
  return ticks
}

function objectById(engine: GameEngine, id: string) {
  const object = engine.getState().campaign?.objects?.find((candidate) => candidate.id === id)
  invariant(object, `Fuel Stop is missing campaign object ${id}`)
  return object
}

function assertTurnOwner(engine: GameEngine, turn: FuelStopTranscriptTurn): void {
  const state = engine.getState()
  assert.equal(state.phase, 'PLAYER_TURN', `${turn.actorId} starts from a legal player turn`)
  assert.equal(state.activePlayerId, turn.actorId, `${turn.actorId} owns this retained turn`)
  const active = state.tanks.find(({ id }) => id === turn.actorId)
  invariant(active?.alive, `${turn.actorId} is alive when its turn begins`)
  assert.equal(active.ai === null ? 'player' : 'enemy-ai', turn.owner,
    `${turn.actorId} retains the authored player/AI ownership`)
}

function applyTurn(engine: GameEngine, turn: FuelStopTranscriptTurn): void {
  assertTurnOwner(engine, turn)
  let actions = turn.actions
  if (turn.owner === 'enemy-ai') {
    const active = engine.getState().tanks.find(({ id }) => id === turn.actorId)!
    const plan = computeAiPlan(
      engine.getState(),
      active.id,
      active.ai!,
      engine.getEffectiveGravity(),
      4,
    )
    invariant(plan, 'the real Fuel Stop enemy produces a legal bounded plan')
    actions = actionsForPlan(plan)
    assert.deepEqual(actions, turn.actions,
      'the retained enemy row must match the current real hard-AI plan exactly')
  }

  for (const action of actions) {
    assert.equal(engine.applyAction(action), true,
      `${turn.actorId} action ${action.type} is accepted by the real engine`)
  }
}

function assertExpectedOutcome(engine: GameEngine, transcript: FuelStopTranscript): void {
  const state = engine.getState()
  const campaign = state.campaign
  invariant(campaign?.objects && campaign.effects, 'Fuel Stop retains physical object/effect state')
  assert.deepEqual(campaign.result, {
    outcome: 'success',
    reason: 'objective',
    commitmentId: transcript.turns.length,
  }, `${transcript.id} reaches one clear settled success`)
  assert.equal(state.phase, 'GAME_OVER', `${transcript.id} stops after its settled result`)
  assert.equal(campaign.commitmentCount, transcript.turns.length,
    `${transcript.id} has one commitment per retained turn`)
  assert.equal(campaign.activeCommitment, null, `${transcript.id} leaves no open commitment`)
  assert.equal(campaign.effects.pending.length, 0, `${transcript.id} drains every environment effect`)
  assert.equal(campaign.effects.technicalFailure, null, `${transcript.id} does not cross an effect bound`)

  const human = state.tanks.find(({ id }) => id === FUEL_STOP_IDS.human)
  const defender = state.tanks.find(({ id }) => id === FUEL_STOP_IDS.defender)
  invariant(human && defender, 'Fuel Stop retains both canonical tank identities')
  assert.equal(human.health, transcript.expected.humanHealth)
  assert.equal(human.alive, true, `${transcript.id} keeps the player alive`)
  assert.equal(defender.health, transcript.expected.defenderHealth)
  assert.equal(defender.alive, false, `${transcript.id} physically eliminates the defender`)
  assert.equal(objectById(engine, FUEL_STOP_IDS.refinery).health, transcript.expected.refineryHealth)
  assert.equal(objectById(engine, FUEL_STOP_IDS.refinery).alive, true,
    `${transcript.id} succeeds with a living refinery`)
  assert.deepEqual(
    FUEL_STOP_IDS.drums.map((id) => objectById(engine, id).health),
    transcript.expected.drumHealth,
    `${transcript.id} retains its selected drum consequence`,
  )
  assert.deepEqual(campaign.effects.activatedObjectIds, transcript.expected.activatedDrumIds,
    `${transcript.id} retains the expected exactly-once detonation ledger`)
  assert.equal(state.terrainVersion, transcript.expected.terrainVersion)
  assert.equal(
    terrainChecksum(state.terrain),
    transcript.expected.terrainChecksum,
    `${transcript.id} retains its exact settled terrain`,
  )
}

function replay(transcript: FuelStopTranscript, pacing: readonly number[]): GameEngine {
  const engine = createCampaignGameEngine(FUEL_STOP_FIXTURE)
  for (const turn of transcript.turns) {
    applyTurn(engine, turn)

    // Clone only after the accepted root is open. Both copies then settle through
    // their real tick machines under different frame groupings.
    const clone = engine.clone()
    const ticks = settle(engine, pacing)
    const cloneTicks = settle(clone, pacing === PACING_A ? PACING_B : PACING_A)
    assert.equal(ticks, turn.settlementTicks, `${transcript.id}/${turn.actorId} tick count is retained`)
    assert.equal(cloneTicks, ticks, `${transcript.id}/${turn.actorId} clone pacing changes no work`)
    assertStateEqual(clone.getState(), engine.getState(),
      `${transcript.id}/${turn.actorId} clone reaches the byte-equal settled state`)
  }
  assertExpectedOutcome(engine, transcript)
  return engine
}

assert.equal(FUEL_STOP_FIXTURE.encounter.encounterId, FUEL_STOP_IDS.encounter)
assert.equal(FUEL_STOP_FIXTURE.combatProfile.profileId, FUEL_STOP_IDS.profile)
assert.deepEqual(
  FUEL_STOP_FIXTURE.encounter.spawns.map(({ id, role, x }) => ({ id, role, x })),
  [
    { id: 'p1', role: 'human', x: 280 },
    { id: 'p2', role: 'defender', x: 800 },
  ],
  'Fuel Stop uses the canonical authored spawn identities and positions',
)
assert.deepEqual(
  FUEL_STOP_FIXTURE.encounter.objects.map(({ id, kind, x }) => ({ id, kind, x })),
  [
    { id: 'refinery', kind: 'protected', x: 350 },
    { id: 'drum-a', kind: 'supply-drum', x: 715 },
    { id: 'drum-b', kind: 'supply-drum', x: 765 },
  ],
  'Fuel Stop uses the canonical authored object identities and positions',
)

const opening = createCampaignGameEngine(FUEL_STOP_FIXTURE)
assert.deepEqual(
  opening.getState().campaign?.objects?.map(({ id, supportSamples }) => ({ id, supportSamples })),
  [
    { id: 'refinery', supportSamples: [{ x: 328, y: 305 }, { x: 350, y: 305 }, { x: 372, y: 305 }] },
    { id: 'drum-a', supportSamples: [{ x: 701, y: 305 }, { x: 715, y: 305 }, { x: 729, y: 305 }] },
    { id: 'drum-b', supportSamples: [{ x: 751, y: 305 }, { x: 765, y: 305 }, { x: 779, y: 305 }] },
  ],
  'the authored terrain legally supports all three physical objects at their fixed feet',
)

for (const transcript of Object.values(FUEL_STOP_TRANSCRIPTS)) {
  const paced = replay(transcript, PACING_A)
  const replayed = replay(transcript, PACING_B)
  assertStateEqual(replayed.getState(), paced.getState(),
    `${transcript.id} full replay is identical across frame pacing`)
}

assert.equal(
  objectById(replay(FUEL_STOP_TRANSCRIPTS.preserve, PACING_A), 'drum-a').alive,
  true,
  'the precision path preserves at least one drum',
)
assert.deepEqual(
  FUEL_STOP_TRANSCRIPTS.detonation.expected.activatedDrumIds,
  ['drum-a', 'drum-b'],
  'the deliberate path changes the battlefield by detonating the supply drums',
)

const ordinary = new GameEngine({
  seed: FUEL_STOP_FIXTURE.encounter.seed,
  rounds: 1,
  maxPlayers: 2,
})
assert.equal(Object.hasOwn(ordinary.getState(), 'campaign'), false,
  'the Fuel Stop fixture introduces no campaign projection into ordinary construction')

export const FUEL_STOP_CHECK_SUMMARY =
  'authored legal spawns/support, canonical IDs, real enemy AI turns, preserve/detonation outcomes, clone/replay/frame-pacing determinism, ordinary isolation'
