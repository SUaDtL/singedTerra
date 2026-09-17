import { resolveCampaignCombatProfile, ASH_ROAD_COMBAT_PROFILE_REFERENCE } from '@shared/campaign/combatProfiles';
import { parseCampaignRun } from '@shared/campaign/definitions';
import { describe, expect, it, vi } from 'vitest';
import { createCampaignCheckpoint } from '../../campaign/checkpoint';
import { ASH_ROAD_EPISODE } from '../../campaign/content/episode';
import { createCampaignLoadout } from '../../campaign/loadout';
import {
  campaignStorageBindingFromRunState,
  createCampaignReplayPayload,
  type CampaignReplayPayload,
} from '../../campaign/replay';
import { createCampaignRunState, parseCampaignRunState } from '../../campaign/runReducer';
import {
  CAMPAIGN_STORAGE_SCHEMA_VERSION,
  CampaignStorageIncompatibleError,
  type CampaignStorageRecord,
} from '../../campaign/storage';
import {
  CampaignSavePresentationOwner,
  projectParsedCampaignSaveRecord,
  type CampaignSaveLoadPort,
} from './CampaignSavePresentation';

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function payloadAt(encounterIndex = 0): CampaignReplayPayload {
  const route = ASH_ROAD_EPISODE.routes[0]!;
  const encounterId = route.encounterIds[encounterIndex]!;
  const encounter = ASH_ROAD_EPISODE.encounters.find(
    (candidate) => candidate.encounterId === encounterId,
  )!;
  const combatProfile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE);
  const run = parseCampaignRun({
    kind: 'campaign-run',
    runVersion: 1,
    runId: 'command-center-save-test',
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    combatProfileId: combatProfile.profileId,
    combatProfileVersion: combatProfile.profileVersion,
    combatProfileContentDigest: combatProfile.contentDigest,
    routeId: route.id,
    encounterIds: route.encounterIds,
    currentEncounterIndex: encounterIndex,
  })!;
  const checkpoint = createCampaignCheckpoint({
    run,
    encounter,
    combatProfile,
    attempt: 1,
    supplies: 2,
  });
  const runState = createCampaignRunState(checkpoint, createCampaignLoadout());
  return createCampaignReplayPayload({ runState, acceptedCommands: [] });
}

function completedPayload(): CampaignReplayPayload {
  const payload = payloadAt(2);
  const { runState } = payload;
  const completed = parseCampaignRunState({
    ...runState,
    missionLoadout: runState.loadout,
    pendingCheckpointDecision: { resultAttempt: runState.attempt },
    appliedResults: [{
      kind: 'campaign-result-receipt',
      receiptVersion: 1,
      result: {
        kind: 'campaign-result',
        resultVersion: 1,
        runId: runState.checkpoint.run.runId,
        encounterId: runState.checkpoint.encounter.encounterId,
        encounterVersion: runState.checkpoint.encounter.encounterVersion,
        encounterContentDigest: runState.checkpoint.encounter.contentDigest,
        attempt: runState.attempt,
        outcome: 'success',
        commitments: 1,
      },
      intactSupplyDrumIds: ['siege-drum'],
      suppliesAwarded: 0,
    }],
  });
  if (!completed) throw new Error('Invalid completed campaign fixture');
  return createCampaignReplayPayload({ runState: completed, acceptedCommands: [] });
}

function storageRecord(
  payload: unknown,
  revision = 4,
  compatiblePayload: CampaignReplayPayload = payloadAt(),
): CampaignStorageRecord {
  return Object.freeze({
    kind: 'campaign-storage-record',
    schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
    slotId: 'ash-road-local',
    revision,
    binding: campaignStorageBindingFromRunState(compatiblePayload.runState),
    payload,
  });
}

function owner(load: CampaignSaveLoadPort['load']): CampaignSavePresentationOwner {
  return new CampaignSavePresentationOwner({ load });
}

describe('CampaignSavePresentationOwner', () => {
  it('projects checking, empty, compatible, incompatible, unavailable, restoring, and complete distinctly', async () => {
    const compatible = payloadAt();
    const cases = [
      { load: vi.fn(async () => null), status: 'empty' },
      { load: vi.fn(async () => storageRecord(compatible, 7, compatible)), status: 'compatible' },
      { load: vi.fn(async () => storageRecord({ kind: 'wrong-payload' })), status: 'incompatible' },
      { load: vi.fn(async () => { throw new Error('IndexedDB denied'); }), status: 'unavailable' },
      { load: vi.fn(async () => storageRecord(completedPayload(), 9)), status: 'complete' },
    ] as const;

    for (const fixture of cases) {
      const save = owner(fixture.load);
      expect(save.presentation).toEqual({ status: 'checking' });
      await save.refresh();
      expect(save.presentation).toEqual({ status: fixture.status });
    }

    const restoring = owner(vi.fn(async () => storageRecord(compatible, 11, compatible)));
    expect(restoring.beginRestoring()).toBe(false);
    await restoring.refresh();
    const candidate = restoring.resumeCandidate;
    expect(candidate).toEqual({ payload: compatible, revision: 11 });
    expect(restoring.replacementRevision).toBe(11);
    expect(restoring.beginRestoring()).toBe(true);
    expect(restoring.presentation).toEqual({ status: 'restoring' });
    expect(restoring.resumeCandidate).toBe(candidate);
  });

  it('distinguishes a storage-parser incompatibility from an operational failure', async () => {
    const incompatible = owner(vi.fn(async () => {
      throw new CampaignStorageIncompatibleError({ schemaVersion: 99 });
    }));
    await incompatible.refresh();
    expect(incompatible.presentation).toEqual({ status: 'incompatible' });

    const unavailable = owner(vi.fn(async () => {
      throw new DOMException('The operation is not allowed', 'NotAllowedError');
    }));
    await unavailable.refresh();
    expect(unavailable.presentation).toEqual({ status: 'unavailable' });
  });

  it('rejects a record whose strict storage binding does not match its replay payload', async () => {
    const compatible = payloadAt();
    const record = storageRecord(compatible, 6, compatible);
    const mismatched = {
      ...record,
      binding: {
        ...record.binding,
        episodeContentDigest: '0'.repeat(64),
      },
    } satisfies CampaignStorageRecord;
    const save = owner(vi.fn(async () => mismatched));

    await save.refresh();

    expect(save.presentation).toEqual({ status: 'incompatible' });
    expect(save.resumeCandidate).toBeNull();
  });

  it('rejects a self-consistent retained save whose parsed binding is not current Ash Road content', () => {
    const retained = structuredClone(completedPayload()) as CampaignReplayPayload;
    const episodeContentDigest = '1'.repeat(64);
    const profileContentDigest = '2'.repeat(64);
    for (const checkpoint of [retained.checkpoint, retained.runState.checkpoint]) {
      (checkpoint.run as { episodeContentDigest: string }).episodeContentDigest = episodeContentDigest;
      (checkpoint.profile as { contentDigest: string }).contentDigest = profileContentDigest;
    }
    const record: CampaignStorageRecord = Object.freeze({
      kind: 'campaign-storage-record',
      schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
      slotId: 'ash-road-local',
      revision: 17,
      binding: Object.freeze({
        episodeId: retained.runState.checkpoint.run.episodeId,
        episodeVersion: retained.runState.checkpoint.run.episodeVersion,
        episodeContentDigest,
        profileId: retained.runState.checkpoint.profile.profileId,
        profileVersion: retained.runState.checkpoint.profile.profileVersion,
        profileContentDigest,
      }),
      payload: retained,
    });

    expect(projectParsedCampaignSaveRecord(record, retained)).toEqual({
      presentation: { status: 'incompatible' },
      resumeCandidate: null,
      replacementRevision: null,
    });
  });

  it('requires a successful active result at the authored final encounter before projecting complete', async () => {
    const merelyFinal = payloadAt(2);
    const save = owner(vi.fn(async () => storageRecord(merelyFinal, 5, merelyFinal)));

    await save.refresh();

    expect(save.presentation).toEqual({ status: 'compatible' });
    expect(save.resumeCandidate).toEqual({ payload: merelyFinal, revision: 5 });

    const complete = completedPayload();
    const completedSave = owner(vi.fn(async () => storageRecord(complete, 6, complete)));
    await completedSave.refresh();
    expect(completedSave.presentation).toEqual({ status: 'complete' });
    expect(completedSave.resumeCandidate).toBeNull();
    expect(completedSave.replacementRevision).toBe(6);
  });

  it('rejects an older refresh after a newer generation resolves', async () => {
    const first = deferred<CampaignStorageRecord | null>();
    const second = deferred<CampaignStorageRecord | null>();
    const compatible = payloadAt();
    const load = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const save = owner(load);

    const staleRefresh = save.refresh();
    const currentRefresh = save.refresh();
    second.resolve(storageRecord(compatible, 8, compatible));
    await currentRefresh;
    first.resolve(null);
    await staleRefresh;

    expect(save.presentation).toEqual({ status: 'compatible' });
    expect(save.resumeCandidate).toEqual({ payload: compatible, revision: 8 });
  });

  it('rejects a pending generation after invalidation and retains the prior candidate', async () => {
    const compatible = payloadAt();
    const pending = deferred<CampaignStorageRecord | null>();
    const load = vi.fn()
      .mockResolvedValueOnce(storageRecord(compatible, 3, compatible))
      .mockImplementationOnce(() => pending.promise);
    const save = owner(load);
    await save.refresh();
    const retained = save.resumeCandidate;

    const refresh = save.refresh();
    save.invalidate();
    pending.reject(new Error('late failure'));
    await refresh;

    expect(save.presentation).toEqual({ status: 'checking' });
    expect(save.resumeCandidate).toBe(retained);
  });

  it('keeps the current presentation and candidate across unrelated reads', async () => {
    const compatible = payloadAt();
    const save = owner(vi.fn(async () => storageRecord(compatible, 12, compatible)));
    await save.refresh();
    const candidate = save.resumeCandidate;

    for (let rerender = 0; rerender < 3; rerender += 1) {
      expect(save.presentation).toEqual({ status: 'compatible' });
      expect(save.resumeCandidate).toBe(candidate);
    }
  });
});
