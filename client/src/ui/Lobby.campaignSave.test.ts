import { ASH_ROAD_COMBAT_PROFILE_REFERENCE, resolveCampaignCombatProfile } from '@shared/campaign/combatProfiles';
import { parseCampaignRun } from '@shared/campaign/definitions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountCredentials, AccountMode, AccountState } from '../client/AccountSession';
import { createCampaignCheckpoint } from '../campaign/checkpoint';
import { ASH_ROAD_EPISODE } from '../campaign/content/episode';
import { createCampaignLoadout } from '../campaign/loadout';
import {
  campaignStorageBindingFromRunState,
  createCampaignReplayPayload,
  type CampaignReplayPayload,
} from '../campaign/replay';
import { createCampaignRunState, parseCampaignRunState } from '../campaign/runReducer';
import {
  CAMPAIGN_STORAGE_SCHEMA_VERSION,
  CampaignStorageConflictError,
  CampaignStorageIncompatibleError,
  type CampaignStorage,
  type CampaignStorageRecord,
} from '../campaign/storage';
import { CampaignSavePresentationOwner } from './commandCenter/CampaignSavePresentation';
import { Lobby, type AccountSessionPort, type LobbyConfig } from './Lobby';

class FakeAccountSession implements AccountSessionPort {
  state: AccountState = { status: 'anonymous', busy: false, error: '' };
  readonly initialize = vi.fn(async () => undefined);
  readonly submit = vi.fn(async (_mode: AccountMode, _credentials: AccountCredentials) => undefined);
  readonly signOut = vi.fn(async () => undefined);
  readonly refresh = vi.fn(async () => undefined);
  readonly recordHotSeatMatch = vi.fn(async () => null);
  readonly startVerifiedDeployment = vi.fn(async () => null);
  readonly abandonVerifiedDeployment = vi.fn(async () => false);
  readonly completeVerifiedDeployment = vi.fn(async () => null);

  constructor(private readonly onChange: (state: AccountState) => void) {}

  emit(state: AccountState): void {
    this.state = state;
    this.onChange(state);
  }
}

function campaignRecord(revision = 4, encounterIndex = 0): CampaignStorageRecord {
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
    currentEncounterIndex: encounterIndex,
  })!;
  const checkpoint = createCampaignCheckpoint({
    run,
    encounter: ASH_ROAD_EPISODE.encounters.find(
      ({ encounterId }) => encounterId === route.encounterIds[encounterIndex],
    )!,
    combatProfile: profile,
    attempt: 1,
    supplies: 2,
  });
  const runState = createCampaignRunState(checkpoint, createCampaignLoadout());
  const payload = createCampaignReplayPayload({ runState, acceptedCommands: [] });
  return Object.freeze({
    kind: 'campaign-storage-record',
    schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
    slotId: 'ash-road-local',
    revision,
    binding: campaignStorageBindingFromRunState(runState),
    payload,
  });
}

function completedCampaignRecord(revision = 4): CampaignStorageRecord {
  const current = campaignRecord(revision, ASH_ROAD_EPISODE.routes[0]!.encounterIds.length - 1);
  const payload = current.payload as CampaignReplayPayload;
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
  return Object.freeze({
    ...current,
    payload: createCampaignReplayPayload({ runState: completed, acceptedCommands: [] }),
  });
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  let match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text);
  if (!match && text.includes('Ash Road')) {
    openCampaigns(root);
    match = [...root.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === text);
  }
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`);
  return match;
}

function openCampaigns(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>(
    '[data-command-surface="rail"][data-command-category="campaigns"]',
  )?.click();
}

interface CampaignLobbyInternals {
  readonly campaignSavePresentation: CampaignSavePresentationOwner;
}

interface CampaignLaunchRecoveryContract {
  captureLaunchFocus(): unknown;
  restoreLaunchFocus(snapshot: unknown): void;
  refreshCampaignSaveAfterLaunchFailure(): Promise<void>;
  showLaunchFailure(message: string): void;
}

function campaignInternals(lobby: Lobby): CampaignLobbyInternals {
  return lobby as unknown as CampaignLobbyInternals;
}

describe('Lobby campaign save presentation owner', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(() => {
    root.remove();
    vi.restoreAllMocks();
  });

  it('mounts the real three-category command shell and delegates Ash Road kit launch to the existing owner', async () => {
    const storage: CampaignStorage = {
      load: vi.fn(async () => null),
      compareAndSwap: vi.fn(),
    };
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => expect(
      campaignInternals(lobby).campaignSavePresentation.presentation,
    ).toEqual({ status: 'empty' }));

    const rail = root.querySelector('nav[aria-label="Command categories"]')!;
    expect([...rail.querySelectorAll('[data-command-category]')]
      .map((control) => control.textContent)).toEqual([
      'Campaigns',
      'Skirmishes',
      'Multiplayer',
    ]);
    (rail.querySelector('[data-command-category="campaigns"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-command-item="ash-road"]')?.textContent).toContain('Ash Road');
    expect(root.querySelectorAll('[data-campaign-command-view]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-command-primary]')).toHaveLength(1);

    const kit = root.querySelector<HTMLSelectElement>('[aria-label="New run kit"]')!;
    kit.value = 'assault';
    kit.dispatchEvent(new Event('change'));
    button(root, 'Start Ash Road').click();

    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      experience: 'campaign',
      campaignRunState: expect.objectContaining({
        loadout: expect.objectContaining({
          carried: expect.objectContaining({
            offensiveWeaponIds: ['missile', 'cluster_bomb'],
          }),
        }),
      }),
    }));

    (rail.querySelector('[data-command-category="skirmishes"]') as HTMLButtonElement).click();
    expect(button(root, 'Start First Salvo')).toBeTruthy();
    expect([...root.querySelectorAll('button')]
      .filter((control) => [
        'Start Ash Road',
        'Resume Ash Road',
        'Local Battle',
        'Play Online',
      ].includes(control.textContent ?? ''))).toHaveLength(0);
  });

  it('preserves the compatible candidate through account rerenders and launches its exact payload/revision', async () => {
    const record = campaignRecord(14);
    const storage: CampaignStorage = {
      load: vi.fn(async () => record),
      compareAndSwap: vi.fn(),
    };
    let presentationAtHandoff: CampaignSavePresentationOwner['presentation'] | null = null;
    let lobby!: Lobby;
    const onReady = vi.fn<(config: LobbyConfig) => void>(() => {
      presentationAtHandoff = campaignInternals(lobby).campaignSavePresentation.presentation;
    });
    let account!: FakeAccountSession;
    lobby = new Lobby(
      root,
      onReady,
      (onChange) => (account = new FakeAccountSession(onChange)),
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => expect(button(root, 'Resume Ash Road')).toBeTruthy());
    const candidate = campaignInternals(lobby).campaignSavePresentation.resumeCandidate;

    account.emit({
      status: 'authenticated',
      busy: false,
      error: '',
      profile: {
        id: 'campaign-account',
        displayName: 'Ranger',
        summary: {
          matchesPlayed: 0,
          wins: 0,
          progressionVersion: 1,
          totalXp: 0,
          level: 1,
          levelXp: 0,
          nextLevelXp: 500,
          verifiedProgression: {
            evidence: 'verified_replay_v2',
            matchesPlayed: 0,
            wins: 0,
            progressionVersion: 1,
            totalXp: 0,
            level: 1,
            levelXp: 0,
            nextLevelXp: 500,
          },
        },
      },
    });
    expect(campaignInternals(lobby).campaignSavePresentation.resumeCandidate).toBe(candidate);
    button(root, 'Resume Ash Road').click();

    expect(presentationAtHandoff).toEqual({ status: 'restoring' });
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      campaignReplayPayload: record.payload,
      campaignReplayRevision: 14,
      campaignRunState: (record.payload as { runState: unknown }).runState,
    }));
  });

  it('promotes a newly resolved compatible save into the initial Campaigns entry', async () => {
    let resolveSave!: (record: CampaignStorageRecord) => void;
    const save = new Promise<CampaignStorageRecord>((resolve) => { resolveSave = resolve; });
    const storage: CampaignStorage = {
      load: vi.fn(() => save),
      compareAndSwap: vi.fn(),
    };
    const lobby = new Lobby(
      root,
      vi.fn(),
      (onChange) => new FakeAccountSession(onChange),
      undefined,
      undefined,
      undefined,
      storage,
    );

    lobby.show();
    expect(root.querySelector('[aria-current="true"]')?.textContent).toContain('First Salvo');

    resolveSave(campaignRecord(14));
    await vi.waitFor(() => {
      expect(root.querySelector('[aria-current="true"]')?.textContent).toContain('Ash Road');
      expect([...root.querySelectorAll('button')]
        .find((candidate) => candidate.textContent === 'Resume Ash Road')).toBeTruthy();
    });
  });

  it('preserves an engaged Skirmishes choice and focus when save checking finishes', async () => {
    let resolveSave!: (record: CampaignStorageRecord) => void;
    const save = new Promise<CampaignStorageRecord>((resolve) => { resolveSave = resolve; });
    const storage: CampaignStorage = {
      load: vi.fn(() => save),
      compareAndSwap: vi.fn(),
    };
    const lobby = new Lobby(
      root,
      vi.fn(),
      (onChange) => new FakeAccountSession(onChange),
      undefined,
      undefined,
      undefined,
      storage,
    );

    lobby.show();
    root.querySelector<HTMLButtonElement>('[data-command-category="skirmishes"]')!.click();
    const crosswind = root.querySelector<HTMLButtonElement>('[data-command-item="crosswind-range"]')!;
    crosswind.click();
    crosswind.focus();

    resolveSave(campaignRecord(14));
    await vi.waitFor(() => expect(
      campaignInternals(lobby).campaignSavePresentation.presentation.status,
    ).toBe('compatible'));

    const refreshedCrosswind = root.querySelector<HTMLButtonElement>(
      '[data-command-item="crosswind-range"]',
    );
    expect(refreshedCrosswind).not.toBe(crosswind);
    expect(refreshedCrosswind?.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(refreshedCrosswind);
    expect(root.querySelector('[aria-current="true"]')?.textContent).toContain('Crosswind Range');
  });

  it('recovers a failed Resume launch to a current retry owner and its initiating focus', async () => {
    const record = campaignRecord(14);
    const storage: CampaignStorage = {
      load: vi.fn(async () => record),
      compareAndSwap: vi.fn(),
    };
    let launchSnapshot: unknown;
    let launchOwner!: CampaignLaunchRecoveryContract;
    const onReady = vi.fn<(config: LobbyConfig) => void>(() => {
      launchSnapshot = launchOwner.captureLaunchFocus();
    });
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    launchOwner = lobby as unknown as CampaignLaunchRecoveryContract;
    lobby.show();
    await vi.waitFor(() => expect(button(root, 'Resume Ash Road')).toBeTruthy());
    button(root, 'Resume Ash Road').focus();
    button(root, 'Resume Ash Road').click();

    expect(launchSnapshot).toBeTruthy();
    expect(button(root, 'Restoring Ash Road').disabled).toBe(true);
    await launchOwner.refreshCampaignSaveAfterLaunchFailure();
    launchOwner.showLaunchFailure('Campaign setup failed.');
    launchOwner.restoreLaunchFocus(launchSnapshot);

    const retry = button(root, 'Resume Ash Road');
    expect(retry.disabled).toBe(false);
    expect(document.activeElement).toBe(retry);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('Campaign setup failed.');
  });

  it('refreshes a persisted New Run replacement before retrying a failed setup', async () => {
    let persisted = campaignRecord(14);
    const storage: CampaignStorage = {
      load: vi.fn(async () => persisted),
      compareAndSwap: vi.fn(async (input) => {
        persisted = Object.freeze({
          kind: 'campaign-storage-record',
          schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
          slotId: input.slotId,
          revision: input.expectedRevision + 1,
          binding: input.binding,
          payload: input.payload,
        });
        return persisted;
      }),
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let launchSnapshot: unknown;
    let launchOwner!: CampaignLaunchRecoveryContract;
    const onReady = vi.fn<(config: LobbyConfig) => void>(() => {
      launchSnapshot = launchOwner.captureLaunchFocus();
    });
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    launchOwner = lobby as unknown as CampaignLaunchRecoveryContract;
    lobby.show();
    await vi.waitFor(() => expect(button(root, 'Resume Ash Road')).toBeTruthy());
    button(root, 'New Run').click();
    button(root, 'Replace Saved Run').focus();
    button(root, 'Replace Saved Run').click();
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    await launchOwner.refreshCampaignSaveAfterLaunchFailure();
    launchOwner.showLaunchFailure('Campaign setup failed.');
    launchOwner.restoreLaunchFocus(launchSnapshot);

    expect(campaignInternals(lobby).campaignSavePresentation.resumeCandidate?.revision).toBe(15);
    expect(document.activeElement).toBe(button(root, 'New Run'));
  });

  it('invalidates a pending save read when hidden so its late result cannot become resumable', async () => {
    let resolveLoad!: (record: CampaignStorageRecord | null) => void;
    const pending = new Promise<CampaignStorageRecord | null>((resolve) => { resolveLoad = resolve; });
    const storage: CampaignStorage = {
      load: vi.fn(() => pending),
      compareAndSwap: vi.fn(),
    };
    const lobby = new Lobby(
      root,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    lobby.hide();

    resolveLoad(campaignRecord());
    await pending;
    await Promise.resolve();

    expect(root.hidden).toBe(true);
    expect(campaignInternals(lobby).campaignSavePresentation.resumeCandidate).toBeNull();
    expect(campaignInternals(lobby).campaignSavePresentation.presentation)
      .toEqual({ status: 'checking' });
  });

  it('requires confirmation for a compatible save and cancellation performs no write or launch', async () => {
    const record = campaignRecord(14);
    const storage: CampaignStorage = {
      load: vi.fn(async () => record),
      compareAndSwap: vi.fn(),
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => expect(button(root, 'Resume Ash Road')).toBeTruthy());

    button(root, 'New Run').click();
    button(root, 'Replace Saved Run').click();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());

    expect(storage.compareAndSwap).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('requires the same explicit confirmation before replacing a complete save', async () => {
    const record = completedCampaignRecord(21);
    const storage: CampaignStorage = {
      load: vi.fn(async () => record),
      compareAndSwap: vi.fn(),
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => {
      expect(campaignInternals(lobby).campaignSavePresentation.presentation).toEqual({ status: 'complete' });
      expect(campaignInternals(lobby).campaignSavePresentation.replacementRevision).toBe(21);
    });

    openCampaigns(root);
    button(root, 'Start New Run').click();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());

    expect(storage.compareAndSwap).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('uses the displayed revision for replacement and hands off the exact persisted selected-kit payload', async () => {
    const current = campaignRecord(14);
    let replacement: CampaignStorageRecord | null = null;
    const storage: CampaignStorage = {
      load: vi.fn(async () => current),
      compareAndSwap: vi.fn(async (input) => {
        replacement = Object.freeze({
          kind: 'campaign-storage-record',
          schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
          slotId: input.slotId,
          revision: input.expectedRevision + 1,
          binding: input.binding,
          payload: input.payload,
        });
        return replacement;
      }),
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => expect(button(root, 'Resume Ash Road')).toBeTruthy());
    button(root, 'New Run').click();
    const kit = root.querySelector<HTMLSelectElement>('[aria-label="New run kit"]')!;
    kit.value = 'breach';
    kit.dispatchEvent(new Event('change'));

    button(root, 'Replace Saved Run').click();
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(storage.compareAndSwap).toHaveBeenCalledWith(expect.objectContaining({
      slotId: 'ash-road-local',
      expectedRevision: 14,
    }));
    expect(replacement).not.toBeNull();
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
      campaignReplayPayload: replacement!.payload,
      campaignReplayRevision: 15,
      campaignRunState: expect.objectContaining({
        loadout: expect.objectContaining({
          carried: expect.objectContaining({ offensiveWeaponIds: ['missile', 'sandhog'] }),
        }),
      }),
    }));
  });

  it('does not hand off a confirmed replacement after its Ash Road view is disposed', async () => {
    let current = campaignRecord(14);
    let resolveReplacement!: (record: CampaignStorageRecord) => void;
    let compareAndSwapReturned = false;
    const pendingReplacement = new Promise<CampaignStorageRecord>((resolve) => {
      resolveReplacement = resolve;
    });
    const storage: CampaignStorage = {
      load: vi.fn(async () => current),
      compareAndSwap: vi.fn(async (input) => {
        const record = await pendingReplacement;
        compareAndSwapReturned = true;
        current = record;
        return record;
      }),
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => expect(button(root, 'Resume Ash Road')).toBeTruthy());

    button(root, 'New Run').click();
    button(root, 'Replace Saved Run').click();
    await vi.waitFor(() => expect(storage.compareAndSwap).toHaveBeenCalledOnce());
    root.querySelector<HTMLButtonElement>('[data-command-category="skirmishes"]')!.click();
    expect(root.querySelector('[data-campaign-command-view]')).toBeNull();

    const input = vi.mocked(storage.compareAndSwap).mock.calls[0]![0];
    resolveReplacement(Object.freeze({
      kind: 'campaign-storage-record',
      schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
      slotId: input.slotId,
      revision: input.expectedRevision + 1,
      binding: input.binding,
      payload: input.payload,
    }));
    await vi.waitFor(() => expect(compareAndSwapReturned).toBe(true));
    await vi.waitFor(() => {
      expect(campaignInternals(lobby).campaignSavePresentation.resumeCandidate?.revision).toBe(15);
    });

    expect(onReady).not.toHaveBeenCalled();
  });

  it('preserves a newer conflicting save, refreshes its presentation, and does not launch', async () => {
    const displayed = campaignRecord(14);
    const newer = campaignRecord(15);
    const storage: CampaignStorage = {
      load: vi.fn()
        .mockResolvedValueOnce(displayed)
        .mockResolvedValueOnce(newer),
      compareAndSwap: vi.fn(async () => {
        throw new CampaignStorageConflictError(15);
      }),
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => expect(button(root, 'Resume Ash Road')).toBeTruthy());

    button(root, 'New Run').click();
    button(root, 'Replace Saved Run').click();
    await vi.waitFor(() => expect(storage.compareAndSwap).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(campaignInternals(lobby).campaignSavePresentation.resumeCandidate?.revision).toBe(15);
    });

    expect(storage.compareAndSwap).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 14,
    }));
    expect(storage.load).toHaveBeenCalledTimes(2);
    expect(onReady).not.toHaveBeenCalled();
    expect(root.querySelector('[data-launch-failure]')?.textContent)
      .toContain('Campaign progress changed in another session.');
    expect(document.activeElement).toBe(root.querySelector('[data-command-primary]'));
  });

  it('publishes checking immediately when retrying storage and preserves the campaign workspace', async () => {
    let resolveRetry!: (record: CampaignStorageRecord | null) => void;
    const retry = new Promise<CampaignStorageRecord | null>((resolve) => { resolveRetry = resolve; });
    const storage: CampaignStorage = {
      load: vi.fn()
        .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
        .mockReturnValueOnce(retry),
      compareAndSwap: vi.fn(),
    };
    const lobby = new Lobby(
      root,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    await vi.waitFor(() => {
      expect(campaignInternals(lobby).campaignSavePresentation.presentation.status)
        .toBe('unavailable');
    });

    openCampaigns(root);
    const retryButton = button(root, 'Retry save check');
    retryButton.focus();
    retryButton.click();

    expect(button(root, 'Checking save').disabled).toBe(true);
    expect(root.querySelector('[data-campaign-save-state="checking"]')?.getAttribute('aria-busy'))
      .toBe('true');
    expect(document.activeElement).toBe(root.querySelector('[data-campaign-save-status]'));
    expect(root.querySelector('[aria-current="true"]')?.textContent).toContain('Ash Road');

    resolveRetry(null);
    await vi.waitFor(() => expect(button(root, 'Start Ash Road').disabled).toBe(false));
    expect(root.querySelector('[aria-current="true"]')?.textContent).toContain('Ash Road');
  });

  it.each([
    {
      label: 'checking',
      load: () => new Promise<CampaignStorageRecord | null>(() => {}),
    },
    {
      label: 'unavailable',
      load: async () => { throw new Error('IndexedDB unavailable'); },
    },
    {
      label: 'incompatible',
      load: async () => { throw new CampaignStorageIncompatibleError({ schemaVersion: 99 }); },
    },
  ])('does not bypass a $label save gate by launching an unverified replacement', async ({ label, load }) => {
    const storage: CampaignStorage = {
      load: vi.fn(load),
      compareAndSwap: vi.fn(),
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(
      root,
      onReady,
      undefined,
      undefined,
      undefined,
      undefined,
      storage,
    );
    lobby.show();
    if (label !== 'checking') {
      await vi.waitFor(() => {
        expect(campaignInternals(lobby).campaignSavePresentation.presentation.status).toBe(label);
      });
    }

    openCampaigns(root);
    const blockedLabel = label === 'checking'
      ? 'Checking save'
      : label === 'unavailable'
        ? 'Save unavailable'
        : 'Campaign unavailable';
    const blocked = button(root, blockedLabel);
    expect(blocked.disabled).toBe(true);
    blocked.click();
    await Promise.resolve();

    expect(confirm).not.toHaveBeenCalled();
    expect(storage.compareAndSwap).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });
});
