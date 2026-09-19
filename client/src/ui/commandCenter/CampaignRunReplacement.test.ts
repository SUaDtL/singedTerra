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
import { createCampaignRunState } from '../../campaign/runReducer';
import {
  CAMPAIGN_STORAGE_SCHEMA_VERSION,
  CampaignStorageConflictError,
  type CampaignStorage,
  type CampaignStorageRecord,
} from '../../campaign/storage';
import {
  CampaignRunReplacementCoordinator,
  type CampaignRunReplacementPresentationPort,
} from './CampaignRunReplacement';

function payload(): CampaignReplayPayload {
  const route = ASH_ROAD_EPISODE.routes[0]!;
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE);
  const run = parseCampaignRun({
    kind: 'campaign-run',
    runVersion: 1,
    runId: 'ash-road-local-run',
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    combatProfileId: profile.profileId,
    combatProfileVersion: profile.profileVersion,
    combatProfileContentDigest: profile.contentDigest,
    routeId: route.id,
    encounterIds: route.encounterIds,
    currentEncounterIndex: 0,
  })!;
  const checkpoint = createCampaignCheckpoint({
    run,
    encounter: ASH_ROAD_EPISODE.encounters[0]!,
    combatProfile: profile,
    attempt: 1,
    supplies: 2,
  });
  return createCampaignReplayPayload({
    runState: createCampaignRunState(checkpoint, createCampaignLoadout()),
    acceptedCommands: [],
  });
}

function presenter(
  revision: number | null,
  status: CampaignRunReplacementPresentationPort['presentation']['status'] = 'compatible',
): CampaignRunReplacementPresentationPort {
  return {
    presentation: { status } as CampaignRunReplacementPresentationPort['presentation'],
    replacementRevision: revision,
    refresh: vi.fn(async function (this: CampaignRunReplacementPresentationPort) {
      Object.assign(this, { presentation: { status: 'compatible' }, replacementRevision: 15 });
    }),
  };
}

function persisted(input: Parameters<CampaignStorage['compareAndSwap']>[0]): CampaignStorageRecord {
  return Object.freeze({
    kind: 'campaign-storage-record',
    schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
    slotId: input.slotId,
    revision: input.expectedRevision + 1,
    binding: input.binding,
    payload: input.payload,
  });
}

describe('CampaignRunReplacementCoordinator', () => {
  it('cancels without writing when explicit confirmation is declined', async () => {
    const storage: CampaignStorage = { load: vi.fn(), compareAndSwap: vi.fn() };
    const presentation = presenter(14);
    const confirm = vi.fn(async () => false);
    const coordinator = new CampaignRunReplacementCoordinator(storage, presentation, { confirm });

    await expect(coordinator.replace(payload())).resolves.toEqual({
      status: 'cancelled',
      expectedRevision: 14,
    });

    expect(confirm).toHaveBeenCalledWith({ slotId: 'ash-road-local', expectedRevision: 14 });
    expect(storage.compareAndSwap).not.toHaveBeenCalled();
    expect(presentation.refresh).not.toHaveBeenCalled();
  });

  it.each(['compatible', 'complete'] as const)(
    'persists and returns the exact deterministic replay payload at the displayed revision for %s saves',
    async (status) => {
      const next = payload();
      const storage: CampaignStorage = {
        load: vi.fn(),
        compareAndSwap: vi.fn(async (input) => persisted({
          ...input,
          payload: structuredClone(input.payload),
        })),
      };
      const presentation = presenter(14, status);
      const coordinator = new CampaignRunReplacementCoordinator(storage, presentation, {
        confirm: vi.fn(async () => true),
      });

      const result = await coordinator.replace(next);

      expect(storage.compareAndSwap).toHaveBeenCalledWith({
        slotId: 'ash-road-local',
        expectedRevision: 14,
        binding: campaignStorageBindingFromRunState(next.runState),
        payload: next,
      });
      expect(result).toEqual({ status: 'replaced', payload: next, revision: 15 });
      if (result.status === 'replaced') expect(result.payload).not.toBe(next);
    },
  );

  it('returns a recoverable conflict only after refreshing the newer presentation', async () => {
    const storage: CampaignStorage = {
      load: vi.fn(),
      compareAndSwap: vi.fn(async () => { throw new CampaignStorageConflictError(15); }),
    };
    const presentation = presenter(14);
    const coordinator = new CampaignRunReplacementCoordinator(storage, presentation, {
      confirm: vi.fn(async () => true),
    });

    await expect(coordinator.replace(payload())).resolves.toEqual({
      status: 'conflict',
      expectedRevision: 14,
      currentRevision: 15,
      presentation: { status: 'compatible' },
    });

    expect(presentation.refresh).toHaveBeenCalledOnce();
    expect(presentation.replacementRevision).toBe(15);
  });

  it.each(['checking', 'empty', 'incompatible', 'unavailable', 'restoring'] as const)(
    'blocks replacement while presentation is %s',
    async (status) => {
      const storage: CampaignStorage = { load: vi.fn(), compareAndSwap: vi.fn() };
      const presentation = presenter(status === 'empty' ? null : 14, status);
      const confirm = vi.fn(async () => true);
      const coordinator = new CampaignRunReplacementCoordinator(storage, presentation, { confirm });

      await expect(coordinator.replace(payload())).resolves.toEqual({ status: 'blocked', presentation: { status } });
      expect(confirm).not.toHaveBeenCalled();
      expect(storage.compareAndSwap).not.toHaveBeenCalled();
    },
  );

  it('returns unavailable without launching semantics when confirmation or storage fails', async () => {
    const confirmationFailure = new Error('confirmation unavailable');
    const storage: CampaignStorage = { load: vi.fn(), compareAndSwap: vi.fn() };
    const confirmationCoordinator = new CampaignRunReplacementCoordinator(
      storage,
      presenter(14),
      { confirm: vi.fn(async () => { throw confirmationFailure; }) },
    );
    await expect(confirmationCoordinator.replace(payload())).resolves.toEqual({
      status: 'unavailable',
      expectedRevision: 14,
      error: confirmationFailure,
    });
    expect(storage.compareAndSwap).not.toHaveBeenCalled();

    const storageFailure = new Error('storage unavailable');
    const failingStorage: CampaignStorage = {
      load: vi.fn(),
      compareAndSwap: vi.fn(async () => { throw storageFailure; }),
    };
    const storageCoordinator = new CampaignRunReplacementCoordinator(
      failingStorage,
      presenter(14),
      { confirm: vi.fn(async () => true) },
    );
    await expect(storageCoordinator.replace(payload())).resolves.toEqual({
      status: 'unavailable',
      expectedRevision: 14,
      error: storageFailure,
    });
  });
});
