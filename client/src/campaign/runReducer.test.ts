import { parseCampaignRun } from '@shared/campaign/definitions'
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import { createCampaignGameEngine } from '@shared/campaign/initialization'
import { describe, expect, it } from 'vitest'
import {
  campaignDescriptorFromCheckpoint,
  createCampaignCheckpoint,
} from './checkpoint'
import { createModeClient } from '../client/createModeClient'
import { ASH_ROAD_EPISODE, ASH_ROAD_ROUTE_IDS } from './content/episode'
import {
  FUEL_STOP_FIXTURE,
  FUEL_STOP_TRANSCRIPTS,
  type FuelStopTranscript,
} from './content/fuel-stop'
import * as reducerModule from './runReducer'
import { parseCampaignLoadout } from './loadout'

type ReducerApi = {
  readonly CAMPAIGN_ROUTE_CHOICE_VERSION: number
  readonly createCampaignRunState: (checkpoint: unknown, loadout?: unknown) => any
  readonly parseCampaignRunState: (value: unknown) => any | null
  readonly chooseCampaignRoute: (state: unknown, command: unknown) => any
  readonly createCampaignResultReceipt: (input: unknown) => any
  readonly applyCampaignResult: (state: unknown, receipt: unknown) => any
  readonly applyCampaignCheckpointDecision: (state: unknown, command: unknown) => any
  readonly advanceCampaignEncounter: (state: unknown, command: unknown) => any
  readonly applyCampaignEmergencyPatch: (state: unknown, command: unknown) => any
  readonly retryCampaignRun: (state: unknown, command: unknown) => any
}

const api = reducerModule as unknown as Partial<ReducerApi>

function requireApi<Key extends keyof ReducerApi>(key: Key): ReducerApi[Key] {
  expect(api[key], `${key} must be implemented`).toBeTypeOf(
    key === 'CAMPAIGN_ROUTE_CHOICE_VERSION' ? 'number' : 'function',
  )
  return api[key] as ReducerApi[Key]
}

function checkpoint() {
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === ASH_ROAD_ROUTE_IDS.highRoad)!
  const run = parseCampaignRun({
    kind: 'campaign-run', runVersion: 1, runId: 'run-t23',
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    routeId: route.id, encounterIds: route.encounterIds, currentEncounterIndex: 0,
    combatProfileId: profile.profileId, combatProfileVersion: profile.profileVersion,
    combatProfileContentDigest: profile.contentDigest,
  })!
  return createCampaignCheckpoint({
    run,
    encounter: ASH_ROAD_EPISODE.encounters.find(({ encounterId }) => encounterId === 'fuel-stop')!,
    combatProfile: profile,
    attempt: 1,
    supplies: 2,
  })
}

function settle(engine: ReturnType<typeof createCampaignGameEngine>): void {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    if (ticks >= 2_000) throw new Error('test settlement exceeded its fixed bound')
    engine.tick()
    ticks += 1
  }
}

function replay(transcript: FuelStopTranscript, state?: any) {
  const engine = createCampaignGameEngine(state
    ? campaignDescriptorFromCheckpoint(state.checkpoint, state.attemptCheckpoint.loadout)
    : FUEL_STOP_FIXTURE)
  for (const turn of transcript.turns) {
    for (const action of turn.actions) {
      if (!engine.applyAction(action)) throw new Error(`rejected ${action.type}`)
    }
    settle(engine)
  }
  return engine
}

function replayCommands(transcript: FuelStopTranscript) {
  return Object.freeze(transcript.turns.flatMap(({ actions }) => actions))
}

const FAILURE_COMMANDS = Object.freeze([
  Object.freeze({ type: 'select_weapon', weapon: 'missile' } as const),
  Object.freeze({ type: 'set_angle', angle: 0 } as const),
  Object.freeze({ type: 'set_power', power: 11 } as const),
  Object.freeze({ type: 'fire' } as const),
])

function failedEngine(state?: any) {
  const engine = createCampaignGameEngine(state
    ? campaignDescriptorFromCheckpoint(state.checkpoint, state.attemptCheckpoint.loadout)
    : FUEL_STOP_FIXTURE)
  for (const action of FAILURE_COMMANDS) {
    if (!engine.applyAction(action)) throw new Error(`rejected failure ${action.type}`)
  }
  settle(engine)
  return engine
}

function applyPreserveResult() {
  const initial = requireApi('createCampaignRunState')(checkpoint())
  const receipt = requireApi('createCampaignResultReceipt')({
    runState: initial,
    engine: replay(FUEL_STOP_TRANSCRIPTS.preserve, initial),
    replayCommands: replayCommands(FUEL_STOP_TRANSCRIPTS.preserve),
  })
  return {
    initial,
    receipt,
    applied: requireApi('applyCampaignResult')(initial, receipt),
  }
}

describe('Ash Road route ownership', () => {
  it('records one authored route choice without rewriting the retry checkpoint', () => {
    const create = requireApi('createCampaignRunState')
    const choose = requireApi('chooseCampaignRoute')
    expect(requireApi('CAMPAIGN_ROUTE_CHOICE_VERSION')).toBe(1)
    const initial = create(checkpoint())
    expect(initial.selectedRouteId).toBeNull()

    const command = Object.freeze({
      kind: 'campaign-route-choice',
      routeChoiceVersion: 1,
      routeId: ASH_ROAD_ROUTE_IDS.salvagePit,
    })
    const selected = choose(initial, command)
    expect(selected.selectedRouteId).toBe(ASH_ROAD_ROUTE_IDS.salvagePit)
    expect(selected.checkpoint).toEqual(initial.checkpoint)
    expect(selected.checkpoint.run.routeId).toBe(ASH_ROAD_ROUTE_IDS.highRoad)
    expect(choose(selected, command)).toBe(selected)
    expect(() => choose(selected, {
      ...command, routeId: ASH_ROAD_ROUTE_IDS.highRoad,
    })).toThrow(/conflict|already|route/i)
    expect(() => choose(initial, { ...command, routeId: 'unknown-route' })).toThrow(/route/i)
    expect(() => choose(initial, { ...command, extra: true })).toThrow(/route/i)
  })

  it('advances a successful decided checkpoint on the durable authored route', () => {
    const choose = requireApi('chooseCampaignRoute')
    const decide = requireApi('applyCampaignCheckpointDecision')
    const advance = requireApi('advanceCampaignEncounter')
    const { applied } = applyPreserveResult()
    const routed = choose(applied, {
      kind: 'campaign-route-choice', routeChoiceVersion: 1,
      routeId: ASH_ROAD_ROUTE_IDS.salvagePit,
    })
    const decided = decide(routed, {
      kind: 'campaign-checkpoint-decision', checkpointDecisionVersion: 1,
      resultAttempt: 1, choice: { kind: 'retain' },
    })
    const next = advance(decided, {
      kind: 'campaign-advance', advanceVersion: 1, fromEncounterId: 'fuel-stop',
    })
    expect(next).toMatchObject({
      attempt: 1,
      selectedRouteId: ASH_ROAD_ROUTE_IDS.salvagePit,
      checkpoint: {
        run: { currentEncounterIndex: 1, routeId: ASH_ROAD_ROUTE_IDS.salvagePit },
        encounter: { encounterId: 'salvage-pit' },
      },
    })
    expect(next.supplies).toBe(6)
    expect(next.appliedResults).toEqual([])
    expect(next.attemptCheckpoint.loadout).toEqual(decided.loadout)
    expect(() => advance(applied, {
      kind: 'campaign-advance', advanceVersion: 1, fromEncounterId: 'fuel-stop',
    })).toThrow(/decided checkpoint/i)
  })

  it('parses route/loadout state with exact keys and detached frozen output', () => {
    const create = requireApi('createCampaignRunState')
    const parse = requireApi('parseCampaignRunState')
    const initial = create(checkpoint())
    expect(initial.loadout).toMatchObject({
      kind: 'campaign-loadout',
      hull: 100,
      carried: { basicWeaponId: 'baby_missile' },
    })
    const source = structuredClone(initial)
    const parsed = parse(source)
    expect(parsed).toEqual(initial)
    expect(parsed).not.toBe(source)
    expect(parsed.loadout).not.toBe(source.loadout)
    expect(Object.isFrozen(parsed)).toBe(true)

    expect(parse({ ...source, extra: true })).toBeNull()
    expect(parse({ ...source, selectedRouteId: 'unknown-route' })).toBeNull()
    expect(parse({ ...source, supplies: Number.MAX_SAFE_INTEGER + 1 })).toBeNull()
  })

  it('applies one real settled mission to supplies, carried hull/ammo, and one decision slot', () => {
    const { initial, receipt, applied } = applyPreserveResult()
    expect(applied.supplies).toBe(6)
    expect(applied.loadout.hull).toBeCloseTo(48.571199141904266, 10)
    expect(applied.loadout.carried.ammunition).toEqual([
      { weaponId: 'baby_missile', quantity: null },
      { weaponId: 'missile', quantity: 3 },
      { weaponId: 'napalm', quantity: 0 },
      { weaponId: 'shield', quantity: 1 },
    ])
    expect(applied.pendingCheckpointDecision).toEqual({ resultAttempt: 1 })
    expect(applied.checkpointDecisions).toEqual([])
    expect(requireApi('applyCampaignResult')(applied, receipt)).toBe(applied)
    expect(initial.loadout).toMatchObject({ hull: 100 })
    expect(initial.loadout.carried.ammunition).toContainEqual({
      weaponId: 'napalm', quantity: 2,
    })
  })

  it('applies exactly one retain, repair, or single-special refill decision', () => {
    const decide = requireApi('applyCampaignCheckpointDecision')
    const command = (choice: unknown) => ({
      kind: 'campaign-checkpoint-decision',
      checkpointDecisionVersion: 1,
      resultAttempt: 1,
      choice,
    })

    const retainedStart = applyPreserveResult().applied
    const retain = command({ kind: 'retain' })
    const retained = decide(retainedStart, retain)
    expect(retained).toMatchObject({ supplies: 6, pendingCheckpointDecision: null })
    expect(retained.checkpointDecisions).toHaveLength(1)
    expect(decide(retained, retain)).toBe(retained)
    expect(() => decide(retained, command({ kind: 'repair' }))).toThrow(/conflict|already/i)

    const repairedStart = applyPreserveResult().applied
    const repair = command({ kind: 'repair' })
    const repaired = decide(repairedStart, repair)
    expect(repaired).toMatchObject({ supplies: 4, loadout: { hull: 100 } })
    expect(decide(repaired, repair)).toBe(repaired)

    const refilledStart = applyPreserveResult().applied
    const refill = command({ kind: 'refill', weaponId: 'napalm' })
    const refilled = decide(refilledStart, refill)
    expect(refilled.supplies).toBe(5)
    expect(refilled.loadout.carried.ammunition).toContainEqual({
      weaponId: 'napalm', quantity: 2,
    })
    expect(decide(refilled, refill)).toBe(refilled)
    expect(() => decide(refilledStart, command({
      kind: 'refill', weaponId: 'baby_missile',
    }))).toThrow(/basic|unlimited/i)
    expect(() => decide({ ...refilledStart, supplies: 0 }, repair)).toThrow(/invalid|suppl/i)

    const malformedDecision = structuredClone(repaired)
    malformedDecision.loadout.hull = 99
    expect(requireApi('parseCampaignRunState')(malformedDecision)).toBeNull()
    const malformedCost = structuredClone(repaired)
    malformedCost.checkpointDecisions[0].cost = 1
    expect(requireApi('parseCampaignRunState')(malformedCost)).toBeNull()
  })

  it('applies the free emergency hull floor once without duplicating a later cost', () => {
    const patch = requireApi('applyCampaignEmergencyPatch')
    const decide = requireApi('applyCampaignCheckpointDecision')
    const start = applyPreserveResult().applied
    const patchCommand = {
      kind: 'campaign-emergency-patch', emergencyPatchVersion: 1, resultAttempt: 1,
    }
    const patched = patch(start, patchCommand)
    expect(patched).toMatchObject({ supplies: 6, loadout: { hull: 60 } })
    expect(patched.emergencyPatchAttempts).toEqual([1])
    expect(patch(patched, patchCommand)).toBe(patched)

    const repair = {
      kind: 'campaign-checkpoint-decision', checkpointDecisionVersion: 1,
      resultAttempt: 1, choice: { kind: 'repair' },
    }
    const repaired = decide(patched, repair)
    expect(repaired).toMatchObject({ supplies: 4, loadout: { hull: 100 } })
    expect(decide(repaired, repair)).toBe(repaired)
  })

  it('retries a real failure from pre-encounter supplies/loadout without duplicated effects', () => {
    const createReceipt = requireApi('createCampaignResultReceipt')
    const applyResult = requireApi('applyCampaignResult')
    const retry = requireApi('retryCampaignRun')
    const initial = requireApi('createCampaignRunState')(checkpoint())
    const failure = createReceipt({
      runState: initial,
      engine: failedEngine(initial),
      replayCommands: FAILURE_COMMANDS,
    })
    const failed = applyResult(initial, failure)
    expect(failed.supplies).toBe(2)
    expect(failed.loadout.carried.ammunition).toContainEqual({
      weaponId: 'missile', quantity: 2,
    })
    expect(failed.pendingCheckpointDecision).toBeNull()

    const command = { kind: 'campaign-retry', retryVersion: 1, fromAttempt: 1 }
    const retried = retry(failed, command)
    expect(retried).toMatchObject({ attempt: 2, supplies: 2 })
    expect(retried.loadout).toEqual(initial.loadout)
    expect(retried.loadout).not.toBe(initial.loadout)
    expect(retry(retried, command)).toBe(retried)
    expect(applyResult(retried, failure)).toBe(retried)
  })

  it('refuses supply overflow before applying an otherwise authoritative mission reward', () => {
    const maxCheckpoint = {
      ...structuredClone(checkpoint()),
      supplies: Number.MAX_SAFE_INTEGER,
    }
    const initial = requireApi('createCampaignRunState')(maxCheckpoint)
    const receipt = requireApi('createCampaignResultReceipt')({
      runState: initial,
      engine: replay(FUEL_STOP_TRANSCRIPTS.preserve, initial),
      replayCommands: replayCommands(FUEL_STOP_TRANSCRIPTS.preserve),
    })
    expect(() => requireApi('applyCampaignResult')(initial, receipt)).toThrow(/overflow/i)
  })

  it('acquires and replays the real engine from the active carried hull and ammunition', async () => {
    const initial = requireApi('createCampaignRunState')(checkpoint())
    const customLoadout = structuredClone(initial.loadout)
    customLoadout.hull = 73
    customLoadout.carried.ammunition.find(
      ({ weaponId }: { weaponId: string }) => weaponId === 'missile',
    ).quantity = 2
    const parsedLoadout = parseCampaignLoadout(customLoadout)
    expect(parsedLoadout).not.toBeNull()
    const customState = requireApi('parseCampaignRunState')({
      ...initial,
      loadout: parsedLoadout,
      attemptCheckpoint: { supplies: 2, loadout: parsedLoadout },
    })
    expect(customState).not.toBeNull()

    const descriptor = campaignDescriptorFromCheckpoint(
      customState.checkpoint,
      customState.attemptCheckpoint.loadout,
    )
    const client = await createModeClient({
      mode: 'hotseat',
      experience: 'campaign',
      campaign: descriptor,
      players: [
        { name: 'Ranger', color: '#e84d4d' },
        { name: 'Defender', color: '#4d8ce8', ai: 'hard' },
      ],
      playerNames: ['Ranger', 'Defender'],
    })
    const acquiredHuman = client.getState()?.tanks.find(({ id }) => id === 'p1')
    expect(acquiredHuman).toMatchObject({ health: 73 })
    expect(acquiredHuman?.inventory).toMatchObject({
      baby_missile: { count: 0, unlimited: true },
      missile: { count: 2, unlimited: false },
      napalm: { count: 2, unlimited: false },
      shield: { count: 1, unlimited: false },
      cluster_bomb: { count: 0, unlimited: false },
      sandhog: { count: 0, unlimited: false },
    })
    client.stop()

    const engine = createCampaignGameEngine(descriptor)
    for (const action of FAILURE_COMMANDS) {
      if (!engine.applyAction(action)) throw new Error(`rejected custom failure ${action.type}`)
    }
    settle(engine)
    const receipt = requireApi('createCampaignResultReceipt')({
      runState: customState,
      engine,
      replayCommands: FAILURE_COMMANDS,
    })
    const failed = requireApi('applyCampaignResult')(customState, receipt)
    expect(failed.loadout.hull).toBeCloseTo(66.90289623251888, 10)
    expect(failed.loadout.carried.ammunition).toContainEqual({
      weaponId: 'missile', quantity: 1,
    })
    const retried = requireApi('retryCampaignRun')(failed, {
      kind: 'campaign-retry', retryVersion: 1, fromAttempt: 1,
    })
    const retryDescriptor = campaignDescriptorFromCheckpoint(
      retried.checkpoint,
      retried.attemptCheckpoint.loadout,
    )
    const retryEngine = createCampaignGameEngine(retryDescriptor)
    const retryHuman = retryEngine.getState().tanks.find(({ id }) => id === 'p1')
    expect(retryHuman).toMatchObject({ health: 73 })
    expect(retryHuman?.inventory.missile).toEqual({ count: 2, unlimited: false })
  })
})
