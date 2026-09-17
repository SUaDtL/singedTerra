import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import { parseCampaignRun } from '@shared/campaign/definitions'
import { createCampaignGameEngine } from '@shared/campaign/initialization'
import { describe, expect, it } from 'vitest'
import { campaignDescriptorFromCheckpoint, createCampaignCheckpoint } from './checkpoint'
import { ASH_ROAD_EPISODE, ASH_ROAD_ROUTE_IDS } from './content/episode'
import {
  createCampaignReplayPayload,
  parseCampaignReplayPayload,
  replayCampaignPayload,
} from './replay'
import {
  applyCampaignResult,
  createCampaignResultReceipt,
  createCampaignRunState,
} from './runReducer'

function runState() {
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === ASH_ROAD_ROUTE_IDS.highRoad)!
  const run = parseCampaignRun({
    kind: 'campaign-run', runVersion: 1, runId: 'run-t25',
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    routeId: route.id, encounterIds: route.encounterIds, currentEncounterIndex: 0,
    combatProfileId: profile.profileId, combatProfileVersion: profile.profileVersion,
    combatProfileContentDigest: profile.contentDigest,
  })!
  return createCampaignRunState(createCampaignCheckpoint({
    run,
    encounter: ASH_ROAD_EPISODE.encounters.find(({ encounterId }) => encounterId === 'fuel-stop')!,
    combatProfile: profile,
    attempt: 1,
    supplies: 2,
  }))
}

const FAILURE_COMMANDS = Object.freeze([
  Object.freeze({ type: 'select_weapon', weapon: 'missile' } as const),
  Object.freeze({ type: 'set_angle', angle: 0 } as const),
  Object.freeze({ type: 'set_power', power: 11 } as const),
  Object.freeze({ type: 'fire' } as const),
])

function settle(engine: ReturnType<typeof createCampaignGameEngine>): void {
  let ticks = 0
  while (engine.getState().phase === 'FIRING' || engine.getState().phase === 'RESOLVING') {
    if (ticks >= 2_000) throw new Error('test settlement exceeded its fixed bound')
    engine.tick()
    ticks += 1
  }
}

describe('campaign durable replay payload', () => {
  it('owns an exact versioned checkpoint/run/command payload without live GameState', () => {
    const state = runState()
    const payload = createCampaignReplayPayload({
      runState: state, acceptedCommands: FAILURE_COMMANDS,
    })
    expect(Object.isFrozen(payload)).toBe(true)
    expect(Object.isFrozen(payload.acceptedCommands)).toBe(true)
    const serialized = JSON.stringify(payload)
    expect(serialized).toContain('"kind":"height-control-points"')
    expect(serialized).not.toContain('"terrainVersion"')
    expect(serialized).not.toContain('"projectiles"')
    expect(parseCampaignReplayPayload({ ...payload, extra: true })).toBeNull()
    expect(parseCampaignReplayPayload({ ...payload, replayVersion: 99 })).toBeNull()
    expect(parseCampaignReplayPayload({ ...payload, settledDigest: null })).toBeNull()
    expect(parseCampaignReplayPayload({
      ...payload,
      acceptedCommands: Array.from({ length: 257 }, () => ({ type: 'fire' })),
    })).toBeNull()
    expect(parseCampaignReplayPayload({
      ...payload,
      checkpoint: { ...payload.checkpoint, supplies: 99 },
    })).toBeNull()
    expect(parseCampaignReplayPayload({
      ...payload,
      acceptedCommands: [{ type: 'select_weapon', weapon: 'nuke' }],
    })).toBeNull()
  })

  it('replays a reload during a shot to the exact next safe terminal boundary', async () => {
    const state = runState()
    const interrupted = createCampaignGameEngine(campaignDescriptorFromCheckpoint(
      state.checkpoint,
      state.attemptCheckpoint.loadout,
    ))
    for (const command of FAILURE_COMMANDS) expect(interrupted.applyAction(command)).toBe(true)
    expect(interrupted.getState().phase).toBe('FIRING')

    const expected = interrupted.clone()
    settle(expected)
    const resumed = await replayCampaignPayload(createCampaignReplayPayload({
      runState: state, acceptedCommands: FAILURE_COMMANDS,
    }))
    expect(resumed.engine.getState()).toEqual(expected.getState())
    expect(resumed.engine.getState().phase).toBe('GAME_OVER')
    expect(resumed.engine.getState().campaign?.result?.outcome).toBe('failure')
  })

  it('replays deterministically without accepting an obsolete browser digest field', async () => {
    const state = runState()
    const payload = createCampaignReplayPayload({
      runState: state, acceptedCommands: FAILURE_COMMANDS,
    })
    expect(parseCampaignReplayPayload({ ...payload, settledDigest: null })).toBeNull()
    const first = await replayCampaignPayload(payload)
    const second = await replayCampaignPayload(structuredClone(payload))
    expect(second.engine.getState()).toEqual(first.engine.getState())
  })

  it('retains the applied-result ledger and refuses a conflicting duplicate callback', () => {
    const state = runState()
    const engine = createCampaignGameEngine(campaignDescriptorFromCheckpoint(
      state.checkpoint,
      state.attemptCheckpoint.loadout,
    ))
    for (const command of FAILURE_COMMANDS) expect(engine.applyAction(command)).toBe(true)
    settle(engine)
    const receipt = createCampaignResultReceipt({
      runState: state,
      engine,
      replayCommands: FAILURE_COMMANDS,
    })
    const applied = applyCampaignResult(state, receipt)
    const durable = parseCampaignReplayPayload(createCampaignReplayPayload({
      runState: applied, acceptedCommands: FAILURE_COMMANDS,
    }))!
    expect(applyCampaignResult(durable.runState, receipt)).toBe(durable.runState)
    expect(() => applyCampaignResult(durable.runState, {
      ...receipt,
      result: { ...receipt.result, commitments: receipt.result.commitments + 1 },
    })).toThrow('conflicting campaign result')
  })
})
