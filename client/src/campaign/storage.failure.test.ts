import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '@shared/campaign/combatProfiles'
import { parseCampaignRun } from '@shared/campaign/definitions'
import { describe, expect, it } from 'vitest'
import { createCampaignCheckpoint } from './checkpoint'
import { ASH_ROAD_EPISODE, ASH_ROAD_ROUTE_IDS } from './content/episode'
import {
  CampaignSaveSession,
  campaignStorageBindingFromRunState,
  createCampaignReplayPayload,
} from './replay'
import { createCampaignRunState } from './runReducer'
import {
  createCampaignStorage,
  type CampaignStorageTransactionPort,
} from './storage'

function runState() {
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE)
  const route = ASH_ROAD_EPISODE.routes.find(({ id }) => id === ASH_ROAD_ROUTE_IDS.highRoad)!
  const run = parseCampaignRun({
    kind: 'campaign-run', runVersion: 1, runId: 'run-t25-failure',
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

class FailurePort implements CampaignStorageTransactionPort {
  value: unknown | null = null
  failBefore = false
  failAfterCommit = false
  transactions = 0

  async read(): Promise<unknown | null> { return structuredClone(this.value) }

  async transact<Result>(
    _slotId: string,
    operation: (current: unknown | null) => Readonly<{ next: unknown; result: Result }>,
  ): Promise<Result> {
    this.transactions += 1
    if (this.failBefore) throw new Error('quota unavailable before transaction')
    const applied = operation(structuredClone(this.value))
    this.value = structuredClone(applied.next)
    if (this.failAfterCommit) throw new Error('completion signal lost after commit')
    return applied.result
  }
}

describe('campaign save failure and stale-tab honesty', () => {
  it('makes a stale tab read-only until it explicitly reloads the current revision', async () => {
    const state = runState()
    const payload = createCampaignReplayPayload({
      runState: state, acceptedCommands: [],
    })
    const binding = campaignStorageBindingFromRunState(state)
    const port = new FailurePort()
    const storage = createCampaignStorage(port)
    const first = new CampaignSaveSession(storage, 'ash-road-local', binding)
    const stale = new CampaignSaveSession(storage, 'ash-road-local', binding)
    await first.reload()
    await stale.reload()
    await expect(first.save(payload)).resolves.toMatchObject({ status: 'saved', revision: 1 })
    await expect(stale.save(payload)).resolves.toEqual({ status: 'read-only', revision: 0 })
    expect(stale.isReadOnly).toBe(true)
    const transactionsAtConflict = port.transactions
    await expect(stale.save(payload)).resolves.toEqual({ status: 'read-only', revision: 0 })
    expect(port.transactions).toBe(transactionsAtConflict)
    await expect(stale.reload()).resolves.toMatchObject({ revision: 1 })
    expect(stale.isReadOnly).toBe(false)
    await expect(stale.save(payload)).resolves.toMatchObject({ status: 'saved', revision: 2 })
  })

  it('reports pre-commit failure as unsaved and advances only after a successful retry', async () => {
    const state = runState()
    const payload = createCampaignReplayPayload({
      runState: state, acceptedCommands: [],
    })
    const port = new FailurePort()
    const session = new CampaignSaveSession(
      createCampaignStorage(port),
      'ash-road-local',
      campaignStorageBindingFromRunState(state),
    )
    port.failBefore = true
    await expect(session.save(payload)).resolves.toMatchObject({ status: 'unsaved', revision: 0 })
    expect(session.currentRevision).toBe(0)
    expect(port.value).toBeNull()
    port.failBefore = false
    await expect(session.save(payload)).resolves.toMatchObject({ status: 'saved', revision: 1 })
  })

  it('never repeats an uncertain committed write over a newer durable revision', async () => {
    const state = runState()
    const payload = createCampaignReplayPayload({
      runState: state, acceptedCommands: [],
    })
    const port = new FailurePort()
    const session = new CampaignSaveSession(
      createCampaignStorage(port),
      'ash-road-local',
      campaignStorageBindingFromRunState(state),
    )
    port.failAfterCommit = true
    await expect(session.save(payload)).resolves.toMatchObject({ status: 'unsaved', revision: 0 })
    expect((port.value as { revision?: number }).revision).toBe(1)
    port.failAfterCommit = false
    await expect(session.save(payload)).resolves.toEqual({ status: 'read-only', revision: 0 })
    expect((port.value as { revision?: number }).revision).toBe(1)
    await session.reload()
    await expect(session.save(payload)).resolves.toMatchObject({ status: 'saved', revision: 2 })
  })
})
