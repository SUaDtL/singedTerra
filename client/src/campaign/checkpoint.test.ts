import { describe, expect, it } from 'vitest'
import {
  parseCampaignRun,
  type CampaignResult,
  type CampaignRun,
} from '@shared/campaign/definitions'
import { createCampaignGameEngine } from '@shared/campaign/initialization'
import { ASH_ROAD_EPISODE, ASH_ROAD_ROUTE_IDS } from './content/episode'
import {
  FUEL_STOP_FIXTURE,
  FUEL_STOP_IDS,
  FUEL_STOP_TRANSCRIPTS,
  type FuelStopTranscript,
} from './content/fuel-stop'
import {
  CAMPAIGN_CHECKPOINT_VERSION,
  campaignDescriptorFromCheckpoint,
  createCampaignCheckpoint,
  parseCampaignCheckpoint,
} from './checkpoint'
import {
  CAMPAIGN_RUN_STATE_VERSION,
  FUEL_STOP_SUPPLY_REWARD,
  applyCampaignResult,
  createCampaignResultReceipt,
  createCampaignRunState,
  parseCampaignResultReceipt,
  parseCampaignRunState,
  retryCampaignRun,
} from './runReducer'

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

function clone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>
}

function fuelStopRun(): CampaignRun {
  const run = parseCampaignRun({
    kind: 'campaign-run',
    runVersion: 1,
    runId: 'ash-road-run-1',
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    combatProfileId: FUEL_STOP_FIXTURE.combatProfile.profileId,
    combatProfileVersion: FUEL_STOP_FIXTURE.combatProfile.profileVersion,
    combatProfileContentDigest: FUEL_STOP_FIXTURE.combatProfile.contentDigest,
    routeId: ASH_ROAD_ROUTE_IDS.highRoad,
    encounterIds: ['fuel-stop', 'high-road', 'relay-ridge'],
    currentEncounterIndex: 0,
  })
  if (!run) throw new Error('test run must satisfy the shared campaign contract')
  return run
}

function checkpointInput() {
  return {
    run: fuelStopRun(),
    encounter: clone(FUEL_STOP_FIXTURE.encounter),
    combatProfile: FUEL_STOP_FIXTURE.combatProfile,
    attempt: 1,
    supplies: 2,
  }
}

function result(attempt: number, outcome: CampaignResult['outcome']): CampaignResult {
  return {
    kind: 'campaign-result',
    resultVersion: 1,
    runId: fuelStopRun().runId,
    encounterId: FUEL_STOP_IDS.encounter,
    encounterVersion: 1,
    encounterContentDigest: FUEL_STOP_FIXTURE.encounter.contentDigest,
    attempt,
    outcome,
    commitments: 3,
  }
}

function settle(engine: ReturnType<typeof createCampaignGameEngine>): void {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    if (ticks >= 2_000) throw new Error('test campaign settlement exceeded its fixed tick bound')
    engine.tick()
    ticks += 1
  }
}

function operationalFuelStopDescriptor() {
  const state = createCampaignRunState(createCampaignCheckpoint(checkpointInput()))
  return campaignDescriptorFromCheckpoint(state.checkpoint, state.attemptCheckpoint.loadout)
}

function replayFuelStop(transcript: FuelStopTranscript) {
  const engine = createCampaignGameEngine(operationalFuelStopDescriptor())
  for (const turn of transcript.turns) {
    for (const action of turn.actions) {
      if (!engine.applyAction(action)) throw new Error(`rejected ${turn.actorId} ${action.type}`)
    }
    settle(engine)
  }
  return engine
}

const FAILURE_COMMANDS = Object.freeze([
  Object.freeze({ type: 'select_weapon', weapon: 'missile' } as const),
  Object.freeze({ type: 'set_angle', angle: 0 } as const),
  Object.freeze({ type: 'set_power', power: 11 } as const),
  Object.freeze({ type: 'fire' } as const),
])

function transcriptReplayCommands(transcript: FuelStopTranscript) {
  return Object.freeze(transcript.turns.flatMap(({ actions }) => actions))
}

function failFuelStop() {
  const engine = createCampaignGameEngine(operationalFuelStopDescriptor())
  for (const action of FAILURE_COMMANDS) {
    if (!engine.applyAction(action)) throw new Error(`rejected failure action ${action.type}`)
  }
  settle(engine)
  return engine
}

function rawReceipt(
  campaignResult: CampaignResult,
  intactSupplyDrumIds: readonly string[],
) {
  return {
    kind: 'campaign-result-receipt' as const,
    receiptVersion: 1 as const,
    result: campaignResult,
    intactSupplyDrumIds,
  }
}

describe('campaign checkpoint v1', () => {
  it('owns a strict bound checkpoint and reconstructs the exact authored seed, kit, and objects', () => {
    const input = checkpointInput()
    const checkpoint = createCampaignCheckpoint(input)

    expect(CAMPAIGN_CHECKPOINT_VERSION).toBe(1)
    expect(checkpoint).toMatchObject({
      kind: 'campaign-checkpoint',
      checkpointVersion: 1,
      attempt: 1,
      supplies: 2,
      profile: {
        profileId: 'ash-road-v1',
        profileVersion: 1,
        contentDigest: FUEL_STOP_FIXTURE.combatProfile.contentDigest,
      },
    })
    expect(Object.isFrozen(checkpoint)).toBe(true)
    expect(Object.isFrozen(checkpoint.encounter)).toBe(true)
    expect(Object.isFrozen(checkpoint.run.encounterIds)).toBe(true)

    input.encounter.seed = 99
    input.encounter.spawns[0]!.equipment[0] = 'shield'
    input.encounter.objects[0]!.health = 1
    expect(checkpoint.encounter.seed).toBe(FUEL_STOP_FIXTURE.encounter.seed)
    expect(checkpoint.encounter.spawns[0]!.equipment[0]).toBe('baby_missile')
    expect(checkpoint.encounter.objects[0]!.health).toBe(100)

    const first = createCampaignGameEngine(campaignDescriptorFromCheckpoint(checkpoint))
    const retry = createCampaignGameEngine(campaignDescriptorFromCheckpoint(checkpoint))
    expect(retry.getState()).toEqual(first.getState())
    expect(retry.getState().tanks.map(({ id, inventory }) => ({ id, inventory })))
      .toEqual(first.getState().tanks.map(({ id, inventory }) => ({ id, inventory })))
    expect(retry.getState().campaign?.objects).toEqual(first.getState().campaign?.objects)

    const descriptor = campaignDescriptorFromCheckpoint(checkpoint)
    expect(descriptor).not.toBe(campaignDescriptorFromCheckpoint(checkpoint))
    expect(descriptor.encounter).not.toBe(checkpoint.encounter)
    expect(Object.isFrozen(descriptor)).toBe(true)
    expect(Object.isFrozen(descriptor.encounter)).toBe(true)
  })

  it('fails closed on version, binding, shape, and numeric drift', () => {
    const checkpoint = createCampaignCheckpoint(checkpointInput())
    expect(parseCampaignCheckpoint(checkpoint)).toEqual(checkpoint)

    for (const mutate of [
      (candidate: Record<string, unknown>) => { candidate.checkpointVersion = 2 },
      (candidate: Record<string, unknown>) => { candidate.supplies = -1 },
      (candidate: Record<string, unknown>) => { candidate.extra = true },
      (candidate: Record<string, unknown>) => {
        ;(candidate.profile as Record<string, unknown>).contentDigest = '0'.repeat(64)
      },
      (candidate: Record<string, unknown>) => {
        ;(candidate.encounter as Record<string, unknown>).encounterId = 'high-road'
      },
      (candidate: Record<string, unknown>) => {
        ;(candidate.run as Record<string, unknown>).currentEncounterIndex = 1
      },
    ]) {
      const candidate = clone(checkpoint) as unknown as Record<string, unknown>
      mutate(candidate)
      expect(parseCampaignCheckpoint(candidate)).toBeNull()
      expect(() => campaignDescriptorFromCheckpoint(candidate)).toThrow()
    }
  })

  it('rejects parseable data that is not the exact canonical Ash Road route and encounter', () => {
    const checkpoint = createCampaignCheckpoint(checkpointInput())
    const mutations = [
      (candidate: Mutable<typeof checkpoint>) => {
        candidate.run.episodeId = 'other-episode'
      },
      (candidate: Mutable<typeof checkpoint>) => {
        candidate.run.episodeContentDigest = '0'.repeat(64)
      },
      (candidate: Mutable<typeof checkpoint>) => {
        candidate.run.routeId = 'invented-route'
      },
      (candidate: Mutable<typeof checkpoint>) => {
        candidate.run.encounterIds = ['fuel-stop', 'salvage-pit', 'relay-ridge']
      },
      (candidate: Mutable<typeof checkpoint>) => {
        candidate.encounter.seed += 1
      },
      (candidate: Mutable<typeof checkpoint>) => {
        candidate.encounter.contentDigest = '0'.repeat(64)
      },
      (candidate: Mutable<typeof checkpoint>) => {
        candidate.encounter.objects.push({
          id: 'drum-c', kind: 'supply-drum', x: 1_100, width: 20, height: 20, health: 20,
        })
      },
    ]

    for (const mutate of mutations) {
      const candidate = clone(checkpoint)
      mutate(candidate)
      expect(parseCampaignCheckpoint(candidate)).toBeNull()
    }

    const candidate = clone(checkpoint)
    const parsed = parseCampaignCheckpoint(candidate)
    expect(parsed?.encounter).toEqual(FUEL_STOP_FIXTURE.encounter)
    expect(parsed?.encounter).not.toBe(candidate.encounter)
    expect(parsed?.run.encounterIds).not.toBe(candidate.run.encounterIds)
  })
})

describe('campaign retry and once-only Fuel Stop supplies', () => {
  it('applies one successful reward once while keeping checkpoint supplies distinct', () => {
    const checkpoint = createCampaignCheckpoint(checkpointInput())
    const initial = createCampaignRunState(checkpoint)
    const receipt = createCampaignResultReceipt({
      runState: initial,
      engine: replayFuelStop(FUEL_STOP_TRANSCRIPTS.preserve),
      replayCommands: transcriptReplayCommands(FUEL_STOP_TRANSCRIPTS.preserve),
    })

    expect(CAMPAIGN_RUN_STATE_VERSION).toBe(1)
    expect(FUEL_STOP_SUPPLY_REWARD).toEqual({ base: 2, perIntactDrum: 1 })
    expect(initial.supplies).toBe(2)
    expect(initial.checkpoint.supplies).toBe(2)

    const applied = applyCampaignResult(initial, receipt)
    expect(applied.supplies).toBe(6)
    expect(applied.checkpoint.supplies).toBe(2)
    expect(applied.appliedResults).toHaveLength(1)
    expect(applied.appliedResults[0]).toMatchObject({ suppliesAwarded: 4 })
    expect(Object.isFrozen(applied)).toBe(true)
    expect(Object.isFrozen(applied.appliedResults)).toBe(true)
    expect(Object.isFrozen(applied.appliedResults[0])).toBe(true)
    expect(applyCampaignResult(applied, receipt)).toBe(applied)

    const conflictingReceipt = rawReceipt(result(1, 'success'), ['drum-a'])
    expect(() => applyCampaignResult(applied, conflictingReceipt)).toThrow(/conflicting/i)
    expect(() => retryCampaignRun(applied, {
      kind: 'campaign-retry', retryVersion: 1, fromAttempt: 1,
    })).toThrow(/successful/i)
  })

  it('retries a failed attempt exactly once from the immutable checkpoint without awarding supplies', () => {
    const checkpoint = createCampaignCheckpoint(checkpointInput())
    const initial = createCampaignRunState(checkpoint)
    expect(() => retryCampaignRun(initial, {
      kind: 'campaign-retry', retryVersion: 1, fromAttempt: 1,
    })).toThrow(/terminal|result/i)
    expect(parseCampaignRunState({
      ...initial,
      attempt: 2,
      retryFromAttempts: [1],
    })).toBeNull()

    const failedReceipt = createCampaignResultReceipt({
      runState: initial,
      engine: failFuelStop(),
      replayCommands: FAILURE_COMMANDS,
    })
    const failed = applyCampaignResult(initial, failedReceipt)
    expect(failed.supplies).toBe(2)
    expect(failed.appliedResults[0]).toMatchObject({ suppliesAwarded: 0 })

    const retryCommand = Object.freeze({
      kind: 'campaign-retry' as const,
      retryVersion: 1 as const,
      fromAttempt: 1,
    })
    const retried = retryCampaignRun(failed, retryCommand)
    expect(retried).toMatchObject({ attempt: 2, supplies: 2, retryFromAttempts: [1] })
    expect(retried.checkpoint).toEqual(checkpoint)
    expect(retryCampaignRun(retried, retryCommand)).toBe(retried)
    expect(applyCampaignResult(retried, failedReceipt)).toBe(retried)

    const descriptor = campaignDescriptorFromCheckpoint(retried.checkpoint)
    expect(createCampaignGameEngine(descriptor).getState())
      .toEqual(createCampaignGameEngine(campaignDescriptorFromCheckpoint(checkpoint)).getState())

    const secondSuccess = createCampaignResultReceipt({
      runState: retried,
      engine: replayFuelStop(FUEL_STOP_TRANSCRIPTS.detonation),
      replayCommands: transcriptReplayCommands(FUEL_STOP_TRANSCRIPTS.detonation),
    })
    const completed = applyCampaignResult(retried, secondSuccess)
    expect(completed.supplies).toBe(4)
    expect(completed.checkpoint.supplies).toBe(2)
    expect(completed.appliedResults).toHaveLength(2)
    expect(applyCampaignResult(completed, secondSuccess)).toBe(completed)
    expect(parseCampaignRunState(completed)).toEqual(completed)

    const technical = parseCampaignRunState({
      ...initial,
      appliedResults: [{
        ...rawReceipt(result(1, 'technical-failure'), []),
        suppliesAwarded: 0,
      }],
    })
    expect(technical).not.toBeNull()
    expect(retryCampaignRun(technical!, retryCommand)).toMatchObject({
      attempt: 2,
      supplies: 2,
      retryFromAttempts: [1],
    })
  })

  it('requires the concrete GameEngine to be settled before deriving a receipt', () => {
    const state = createCampaignRunState(createCampaignCheckpoint(checkpointInput()))
    expect(() => createCampaignResultReceipt({
      runState: state,
      engine: createCampaignGameEngine(operationalFuelStopDescriptor()),
      replayCommands: [],
    })).toThrow(/settled/i)
  })

  it('rejects structural authority forgeries before they can be applied', () => {
    const state = createCampaignRunState(createCampaignCheckpoint(checkpointInput()))
    const settledEngine = replayFuelStop(FUEL_STOP_TRANSCRIPTS.preserve)
    const craftedState = structuredClone(settledEngine.getState())
    expect(() => applyCampaignResult(state, createCampaignResultReceipt({
      runState: state,
      gameState: craftedState,
      replayCommands: transcriptReplayCommands(FUEL_STOP_TRANSCRIPTS.preserve),
    } as never))).toThrow(/GameEngine/i)
    expect(() => applyCampaignResult(state, createCampaignResultReceipt({
      runState: state,
      engine: { getState: () => craftedState },
      replayCommands: transcriptReplayCommands(FUEL_STOP_TRANSCRIPTS.preserve),
    } as never))).toThrow(/GameEngine/i)
  })

  it('rejects a mutated genuine engine and omitted, altered, or reordered replay commands', () => {
    const state = createCampaignRunState(createCampaignCheckpoint(checkpointInput()))
    const settledEngine = replayFuelStop(FUEL_STOP_TRANSCRIPTS.preserve)
    const replayCommands = transcriptReplayCommands(FUEL_STOP_TRANSCRIPTS.preserve)
    const forgedEngine = createCampaignGameEngine(operationalFuelStopDescriptor())

    // Negative reproduction only: overwrite the borrowed live projection with a
    // convincing settled state while leaving the genuine engine runtime untouched.
    Object.assign(forgedEngine.getState() as object, structuredClone(settledEngine.getState()))
    expect(() => applyCampaignResult(state, createCampaignResultReceipt({
      runState: state,
      engine: forgedEngine,
    } as never))).toThrow(/replay/i)
    expect(() => applyCampaignResult(state, createCampaignResultReceipt({
      runState: state,
      engine: forgedEngine,
      replayCommands: [],
    }))).toThrow(/replay/i)

    const altered = structuredClone([...replayCommands])
    const power = altered[altered.length - 2]
    if (!power || power.type !== 'set_power') throw new Error('missing retained power command')
    power.power -= 1
    const reordered = structuredClone([...replayCommands])
    ;[reordered[reordered.length - 2], reordered[reordered.length - 1]] = [
      reordered[reordered.length - 1]!, reordered[reordered.length - 2]!,
    ]
    for (const candidate of [
      replayCommands.slice(0, -1),
      altered,
      reordered,
      Array.from({ length: 257 }, () => ({ type: 'set_angle' as const, angle: 45 })),
    ]) {
      expect(() => createCampaignResultReceipt({
        runState: state,
        engine: settledEngine,
        replayCommands: candidate,
      })).toThrow(/replay|limit|bound/i)
    }
  })

  it('omits redundant accepted previews from the canonical committed replay sequence', () => {
    const state = createCampaignRunState(createCampaignCheckpoint(checkpointInput()))
    const engine = createCampaignGameEngine(operationalFuelStopDescriptor())
    const active = engine.getState().tanks.find(
      ({ id }) => id === engine.getState().activePlayerId,
    )
    if (!active || !engine.applyAction({ type: 'set_angle', angle: active.angle })) {
      throw new Error('redundant preview must be accepted by the real engine')
    }
    for (const turn of FUEL_STOP_TRANSCRIPTS.preserve.turns) {
      for (const command of turn.actions) {
        if (!engine.applyAction(command)) throw new Error(`rejected committed ${command.type}`)
      }
      settle(engine)
    }

    const receipt = createCampaignResultReceipt({
      runState: state,
      engine,
      replayCommands: transcriptReplayCommands(FUEL_STOP_TRANSCRIPTS.preserve),
    })
    expect(receipt.result.outcome).toBe('success')
    expect(applyCampaignResult(state, receipt).supplies).toBe(6)
  })

  it('rejects forged receipts, stale attempts, non-drum rewards, and malformed retries', () => {
    const state = createCampaignRunState(createCampaignCheckpoint(checkpointInput()))
    const invalidReceipts = [
      rawReceipt(result(2, 'success'), ['drum-a']),
      rawReceipt({ ...result(1, 'success'), runId: 'other-run' }, ['drum-a']),
      rawReceipt(result(1, 'success'), ['refinery']),
      rawReceipt(result(1, 'success'), ['missing-drum']),
    ]
    for (const receipt of invalidReceipts) {
      expect(() => applyCampaignResult(state, receipt)).toThrow()
    }
    expect(parseCampaignResultReceipt(
      rawReceipt(result(1, 'success'), ['drum-a', 'drum-a']),
    )).toBeNull()
    expect(() => applyCampaignResult(
      state,
      rawReceipt(result(1, 'success'), ['drum-a', 'drum-b']),
    )).toThrow(/authoritative|settled/i)

    expect(() => retryCampaignRun(state, {
      kind: 'campaign-retry', retryVersion: 2, fromAttempt: 1,
    } as never)).toThrow()
    expect(() => retryCampaignRun(state, {
      kind: 'campaign-retry', retryVersion: 1, fromAttempt: 0,
    })).toThrow()
    expect(parseCampaignRunState({ ...state, supplies: Number.NaN })).toBeNull()
  })
})
