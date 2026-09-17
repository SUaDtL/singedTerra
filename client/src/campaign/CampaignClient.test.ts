import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASH_ROAD_COMBAT_PROFILE_REFERENCE, resolveCampaignCombatProfile } from '@shared/campaign/combatProfiles'
import { parseCampaignRun } from '@shared/campaign/definitions'
import { createCampaignGameEngine } from '@shared/campaign/initialization'
import type { PlayerAction } from '@shared/types/PlayerAction'
import type { GameClient } from '../client/GameClient'
import { campaignDescriptorFromCheckpoint, createCampaignCheckpoint } from './checkpoint'
import { ASH_ROAD_EPISODE, ASH_ROAD_ROUTE_IDS } from './content/episode'
import { FUEL_STOP_FIXTURE, FUEL_STOP_TRANSCRIPTS } from './content/fuel-stop'
import {
  CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT,
  applyCampaignResult,
  createCampaignRunState,
  type CampaignResultReceipt,
  type CampaignRunState,
} from './runReducer'
import { replayCampaignPayload, type CampaignReplayPayload } from './replay'

const tacticSeam = vi.hoisted(() => ({
  noCompleteCandidate: false,
  calls: 0,
}))

vi.mock('@shared/campaign/tactics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/campaign/tactics')>()
  return {
    ...actual,
    computeCampaignTactic: (input: Parameters<typeof actual.computeCampaignTactic>[0]) => {
      tacticSeam.calls += 1
      if (!tacticSeam.noCompleteCandidate) return actual.computeCampaignTactic(input)
      return Object.freeze({
        status: 'no-complete-candidate' as const,
        generation: input.generation,
        plan: null,
        metrics: Object.freeze({
          candidatesStarted: 36,
          candidatesCompleted: 0,
          candidatesRejectedIncomplete: 36,
          ticks: 43_200,
          clones: 36,
        }),
      })
    },
  }
})

interface CampaignClientContract extends GameClient {
  readonly ownsCpuExecution: true
  getCommittedReplayJournal(): readonly PlayerAction[]
  createResultReceipt(runState: CampaignRunState): CampaignResultReceipt
  createReplayPayload(runState: CampaignRunState): Promise<CampaignReplayPayload>
  setPaused(paused: boolean): void
}

type CampaignClientConstructor = new (
  descriptor: typeof campaignDescriptor,
  restored?: Readonly<{
    engine: ReturnType<typeof createCampaignGameEngine>
    acceptedCommands: readonly PlayerAction[]
  }>,
) => CampaignClientContract

const campaignDescriptor = Object.freeze({
  encounter: ASH_ROAD_EPISODE.encounters[0]!,
  combatProfile: resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE),
})

function campaignRunState(): CampaignRunState {
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === ASH_ROAD_ROUTE_IDS.highRoad)!
  const run = parseCampaignRun({
    kind: 'campaign-run',
    runVersion: 1,
    runId: 'ash-road-client-test',
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    combatProfileId: campaignDescriptor.combatProfile.profileId,
    combatProfileVersion: campaignDescriptor.combatProfile.profileVersion,
    combatProfileContentDigest: campaignDescriptor.combatProfile.contentDigest,
    routeId: route.id,
    encounterIds: route.encounterIds,
    currentEncounterIndex: 0,
  })!
  return createCampaignRunState(createCampaignCheckpoint({
    run,
    encounter: FUEL_STOP_FIXTURE.encounter,
    combatProfile: FUEL_STOP_FIXTURE.combatProfile,
    attempt: 1,
    supplies: 2,
  }))
}

function operationalCampaignDescriptor() {
  const state = campaignRunState()
  return campaignDescriptorFromCheckpoint(state.checkpoint, state.attemptCheckpoint.loadout)
}

function flattenedPreserveTranscript(): readonly PlayerAction[] {
  return FUEL_STOP_TRANSCRIPTS.preserve.turns.flatMap(({ actions }) => actions)
}

async function loadCampaignClient(): Promise<CampaignClientConstructor> {
  try {
    const modulePath = './CampaignClient'
    const candidate = await import(/* @vite-ignore */ modulePath) as {
      CampaignClient?: CampaignClientConstructor
    }
    if (typeof candidate.CampaignClient !== 'function') {
      throw new Error('CampaignClient export is missing')
    }
    return candidate.CampaignClient
  } catch (error) {
    expect.fail(`CampaignClient API is not implemented: ${String(error)}`)
  }
}

function makeRafQueue() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  })
  const cancel = vi.fn((id: number): void => {
    callbacks.delete(id)
  })

  return {
    request,
    cancel,
    pendingIds: () => [...callbacks.keys()],
    runNext(timestamp: number): void {
      const [id] = callbacks.keys()
      if (id === undefined) throw new Error('No queued campaign animation frame')
      const callback = callbacks.get(id)!
      callbacks.delete(id)
      callback(timestamp)
    },
  }
}

describe('CampaignClient ownership contract', () => {
  let raf: ReturnType<typeof makeRafQueue>

  beforeEach(() => {
    tacticSeam.noCompleteCandidate = false
    tacticSeam.calls = 0
    raf = makeRafQueue()
    vi.stubGlobal('requestAnimationFrame', raf.request)
    vi.stubGlobal('cancelAnimationFrame', raf.cancel)
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('is a GameClient that owns CPU execution without retaining uncommitted aim previews', async () => {
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(campaignDescriptor)
    const accepted: PlayerAction = { type: 'set_angle', angle: 37 }
    const rejected = { type: 'set_angle', angle: Number.NaN } as PlayerAction

    expect(client.ownsCpuExecution).toBe(true)
    client.sendAction(accepted)
    client.sendAction(rejected)

    expect(client.getCommittedReplayJournal()).toEqual([])
    expect(Object.isFrozen(client.getCommittedReplayJournal())).toBe(true)
    expect(client.getState()?.tanks.find(({ id }) => id === 'p1')?.angle).toBe(37)
  })

  it('rejects a forged non-roster selection without changing authoritative state or journal', async () => {
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(campaignDescriptor)
    const stateBefore = client.getState()!
    const activeBefore = stateBefore.tanks.find(({ id }) => id === stateBefore.activePlayerId)!

    expect(activeBefore.selectedWeapon).toBe('baby_missile')
    client.sendAction({ type: 'select_weapon', weapon: 'nuke' })

    const stateAfter = client.getState()!
    const activeAfter = stateAfter.tanks.find(({ id }) => id === stateAfter.activePlayerId)!
    expect(activeAfter.selectedWeapon).toBe('baby_missile')
    expect(client.getCommittedReplayJournal()).toEqual([])
  })

  it('bounds 257 legal previews and records exact human/CPU commitments for a real preserve receipt', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(operationalCampaignDescriptor())
    let timestamp = 0
    const advanceUntil = (predicate: () => boolean): void => {
      for (let frame = 0; frame < 5_000; frame += 1) {
        if (predicate()) return
        timestamp += 1_000 / 60
        raf.runNext(timestamp)
      }
      throw new Error('campaign client did not reach the expected state')
    }

    client.start()
    for (let preview = 0; preview < 257; preview += 1) {
      client.sendAction({ type: 'set_angle', angle: preview % 2 === 0 ? 18 : 20 })
    }
    expect(client.getCommittedReplayJournal()).toEqual([])

    for (const action of FUEL_STOP_TRANSCRIPTS.preserve.turns[0]!.actions) {
      client.sendAction(action)
    }
    advanceUntil(() => client.getState()?.phase === 'PLAYER_TURN'
      && client.getState()?.activePlayerId === 'p2')
    expect(client.getCommittedReplayJournal())
      .toEqual(FUEL_STOP_TRANSCRIPTS.preserve.turns[0]!.actions)

    vi.advanceTimersByTime(1_150)
    advanceUntil(() => client.getState()?.phase === 'PLAYER_TURN'
      && client.getState()?.activePlayerId === 'p1')
    for (const action of FUEL_STOP_TRANSCRIPTS.preserve.turns[2]!.actions) {
      client.sendAction(action)
    }
    advanceUntil(() => client.getState()?.phase === 'GAME_OVER')

    const journal = client.getCommittedReplayJournal()
    expect(journal).toEqual(flattenedPreserveTranscript())
    expect(journal).toHaveLength(12)
    expect(Object.isFrozen(journal)).toBe(true)
    const receipt = client.createResultReceipt(campaignRunState())
    expect(receipt.result).toMatchObject({ outcome: 'success', commitments: 3 })
    expect(applyCampaignResult(campaignRunState(), receipt).supplies).toBe(6)
    client.stop()
  })

  it('retains movement and the exact shield commitment needed for replay parity', async () => {
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(operationalCampaignDescriptor())

    client.sendAction({ type: 'move', delta: -1 })
    client.sendAction({ type: 'select_weapon', weapon: 'shield' })
    client.sendAction({ type: 'set_angle', angle: 12 })
    client.sendAction({ type: 'set_power', power: 34 })
    client.sendAction({ type: 'use_shield' })

    expect(client.getCommittedReplayJournal()).toEqual([
      { type: 'move', delta: -1 },
      { type: 'select_weapon', weapon: 'shield' },
      { type: 'set_angle', angle: 12 },
      { type: 'set_power', power: 34 },
      { type: 'use_shield', weapon: 'shield' },
    ])
    const replay = createCampaignGameEngine(operationalCampaignDescriptor())
    for (const action of client.getCommittedReplayJournal()) {
      expect(replay.applyAction(action)).toBe(true)
    }
    expect(replay.getState()).toEqual(client.getState())

    const payload = await client.createReplayPayload(campaignRunState())
    const restored = await replayCampaignPayload(payload)
    const resumedClient = new CampaignClient(operationalCampaignDescriptor(), {
      engine: restored.engine,
      acceptedCommands: restored.payload.acceptedCommands,
    })
    expect(resumedClient.getState()).toEqual(client.getState())
    expect(resumedClient.getCommittedReplayJournal()).toEqual(client.getCommittedReplayJournal())
  })

  it('admits an atomic commitment exactly at the replay bound', async () => {
    const CampaignClient = await loadCampaignClient()
    const prior = Array.from(
      { length: CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT - 4 },
      () => Object.freeze({ type: 'set_angle', angle: 45 }) as PlayerAction,
    )
    const client = new CampaignClient(operationalCampaignDescriptor(), {
      engine: createCampaignGameEngine(operationalCampaignDescriptor()),
      acceptedCommands: prior,
    })

    client.sendAction({ type: 'fire' })

    expect(client.getCommittedReplayJournal()).toHaveLength(CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT)
    expect(client.getState()?.phase).toBe('FIRING')
    expect(client.getState()?.campaign?.result).toBeNull()
  })

  it('refuses an atomic commitment before mutation when its replay would overflow', async () => {
    const CampaignClient = await loadCampaignClient()
    const prior = Array.from(
      { length: CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT - 3 },
      () => Object.freeze({ type: 'set_angle', angle: 45 }) as PlayerAction,
    )
    const engine = createCampaignGameEngine(operationalCampaignDescriptor())
    const projectileBefore = engine.getState().projectile
    const client = new CampaignClient(operationalCampaignDescriptor(), {
      engine,
      acceptedCommands: prior,
    })

    client.sendAction({ type: 'fire' })

    expect(client.getCommittedReplayJournal()).toHaveLength(prior.length)
    expect(client.getState()?.projectile).toBe(projectileBefore)
    expect(client.getState()?.campaign?.result).toMatchObject({
      outcome: 'technical-failure',
      reason: 'technical-failure',
      code: 'replay-limit',
      reward: false,
    })
    expect(client.getState()?.phase).toBe('GAME_OVER')
    const payload = await client.createReplayPayload(campaignRunState())
    expect(payload.acceptedCommands).toHaveLength(prior.length)
  })

  it('saves an in-flight committed shot through a settled clone without advancing the live engine', async () => {
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(operationalCampaignDescriptor())

    client.sendAction({ type: 'fire' })
    const liveState = client.getState()!
    expect(liveState.phase).toBe('FIRING')
    expect(liveState.projectile).not.toBeNull()
    const liveTerrain = liveState.terrain.slice()

    const payload = await client.createReplayPayload(campaignRunState())
    const restored = await replayCampaignPayload(payload)

    expect(payload.acceptedCommands).toEqual([
      { type: 'select_weapon', weapon: 'baby_missile' },
      { type: 'set_angle', angle: 45 },
      { type: 'set_power', power: 50 },
      { type: 'fire' },
    ])
    expect(restored.engine.getState().phase).not.toMatch(/FIRING|RESOLVING/u)
    expect(client.getState()).toBe(liveState)
    expect(client.getState()?.phase).toBe('FIRING')
    expect(client.getState()?.terrain).toEqual(liveTerrain)
  })

  it('snapshots committed replay commands before later accepted input', async () => {
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(operationalCampaignDescriptor())

    client.sendAction({ type: 'move', delta: -1 })
    const pendingPayload = client.createReplayPayload(campaignRunState())
    client.sendAction({ type: 'move', delta: 1 })
    const payload = await pendingPayload

    expect(client.getCommittedReplayJournal()).toEqual([
      { type: 'move', delta: -1 },
      { type: 'move', delta: 1 },
    ])
    expect(payload.acceptedCommands).toEqual([{ type: 'move', delta: -1 }])
    await expect(replayCampaignPayload(payload)).resolves.toBeDefined()
  })

  it('owns one animation loop, suspends campaign work while paused, and disposes idempotently', async () => {
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(campaignDescriptor)
    const listener = vi.fn()
    const unsubscribe = client.onStateChange(listener)

    client.start()
    client.start()
    expect(listener).toHaveBeenCalledOnce()
    expect(raf.pendingIds()).toHaveLength(1)

    client.setPaused(true)
    raf.runNext(1_000 / 60)
    expect(listener).toHaveBeenCalledOnce()
    expect(raf.pendingIds()).toHaveLength(1)

    client.setPaused(false)
    raf.runNext(2_000 / 60)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(raf.pendingIds()).toHaveLength(1)

    unsubscribe()
    unsubscribe()
    client.stop()
    client.stop()
    expect(raf.cancel).toHaveBeenCalledOnce()
    expect(raf.pendingIds()).toEqual([])

    client.start()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(raf.pendingIds()).toHaveLength(1)
    client.stop()
    expect(raf.cancel).toHaveBeenCalledTimes(2)
  })

  it('retires its pending enemy action timers exactly once when the client is stopped', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(campaignDescriptor)

    client.sendAction({ type: 'fire' })
    client.start()
    let timestamp = 0
    for (let frame = 0; frame < 5_000; frame += 1) {
      const state = client.getState()
      if (state?.phase === 'PLAYER_TURN' && state.activePlayerId !== 'p1') break
      timestamp += 1_000 / 60
      raf.runNext(timestamp)
    }

    expect(client.getState()).toMatchObject({ phase: 'PLAYER_TURN', activePlayerId: 'p2' })
    const pendingTimers = vi.getTimerCount()
    expect(pendingTimers).toBeGreaterThan(0)
    const journalAtStop = client.getCommittedReplayJournal()

    client.stop()
    client.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(pendingTimers)
    vi.runAllTimers()
    expect(client.getCommittedReplayJournal()).toEqual(journalAtStop)
    vi.useRealTimers()
  })

  it('executes one legal bounded fallback when tactic search has no complete candidate', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    tacticSeam.noCompleteCandidate = true
    const CampaignClient = await loadCampaignClient()
    const client = new CampaignClient(operationalCampaignDescriptor())
    let timestamp = 0
    const advanceUntil = (predicate: () => boolean): void => {
      for (let frame = 0; frame < 5_000; frame += 1) {
        if (predicate()) return
        timestamp += 1_000 / 60
        raf.runNext(timestamp)
      }
      throw new Error('campaign client did not reach the expected fallback state')
    }

    client.sendAction({ type: 'fire' })
    client.start()
    advanceUntil(() => client.getState()?.phase === 'PLAYER_TURN'
      && client.getState()?.activePlayerId === 'p2')
    expect(tacticSeam.calls).toBe(1)

    vi.advanceTimersByTime(1_150)
    expect(client.getState()?.phase).toBe('FIRING')
    expect(client.getCommittedReplayJournal().slice(-4)).toEqual([
      { type: 'select_weapon', weapon: 'baby_missile' },
      { type: 'set_angle', angle: 135 },
      { type: 'set_power', power: 50 },
      { type: 'fire' },
    ])
    advanceUntil(() => client.getState()?.phase === 'PLAYER_TURN'
      && client.getState()?.activePlayerId === 'p1')
    for (let frame = 0; frame < 5; frame += 1) {
      timestamp += 1_000 / 60
      raf.runNext(timestamp)
    }
    expect(tacticSeam.calls).toBe(1)
    client.stop()
  })
})
