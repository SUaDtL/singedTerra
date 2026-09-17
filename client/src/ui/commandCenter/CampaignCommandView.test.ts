import { fireEvent, getByRole, queryAllByRole } from '@testing-library/dom';
import { ASH_ROAD_COMBAT_PROFILE_REFERENCE, resolveCampaignCombatProfile } from '@shared/campaign/combatProfiles';
import { parseCampaignRun } from '@shared/campaign/definitions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCampaignCheckpoint } from '../../campaign/checkpoint';
import { ASH_ROAD_EPISODE } from '../../campaign/content/episode';
import { createCampaignLoadout } from '../../campaign/loadout';
import { createCampaignReplayPayload } from '../../campaign/replay';
import { createCampaignRunState } from '../../campaign/runReducer';
import { createCommandCenterShell } from './CommandCenterShell';
import {
  createAshRoadCommandCategoryContribution,
  createCampaignCommandView,
  type CampaignCommandContext,
  type CampaignKitId,
} from './CampaignCommandView';
import type { CampaignSavePresentation } from './contracts';
import { commandCategoryId, commandItemId } from './contracts';

function savedContext(
  status: CampaignSavePresentation['status'],
  kit: CampaignKitId = 'precision',
  encounterIndex = 0,
): CampaignCommandContext {
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE);
  const route = ASH_ROAD_EPISODE.routes[0]!;
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
  const encounter = ASH_ROAD_EPISODE.encounters.find(
    ({ encounterId }) => encounterId === route.encounterIds[encounterIndex],
  )!;
  const loadout = createCampaignLoadout({
    offensiveWeaponIds: kit === 'assault'
      ? ['missile', 'cluster_bomb']
      : kit === 'breach'
        ? ['missile', 'sandhog']
        : ['missile', 'napalm'],
  });
  const runState = createCampaignRunState(createCampaignCheckpoint({
    run,
    encounter,
    combatProfile: profile,
    attempt: 1,
    supplies: 2,
  }), loadout);
  return {
    savePresentation: { status },
    resumeCandidate: status === 'compatible' || status === 'restoring'
      ? { payload: createCampaignReplayPayload({ runState, acceptedCommands: [] }), revision: 7 }
      : null,
    selectedKit: kit,
    onSelectKit: vi.fn(),
    onStart: vi.fn(),
    onResume: vi.fn(),
    onNewRun: vi.fn(),
    onRetrySave: vi.fn(),
  };
}

function setup(context: CampaignCommandContext = savedContext('empty')) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = createCampaignCommandView(host, context);
  return { host, view, context };
}

function button(host: HTMLElement, name: string): HTMLButtonElement {
  return getByRole(host, 'button', { name }) as HTMLButtonElement;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Ash Road command contribution', () => {
  it('mounts Campaigns and Ash Road through the real registry shell without leaking command input', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const escapedClick = vi.fn();
    const escapedKey = vi.fn();
    document.body.addEventListener('click', escapedClick);
    document.body.addEventListener('keydown', escapedKey);
    const context = savedContext('empty');
    const contribution = createAshRoadCommandCategoryContribution<CampaignCommandContext>();
    const shell = createCommandCenterShell(root, {
      contributions: [contribution],
      context,
      initialSelection: {
        categoryId: commandCategoryId('campaigns'),
        itemId: commandItemId('ash-road'),
      },
      selectionStore: { read: () => null, remember: () => true, clear: () => undefined },
    });

    expect(root.querySelector('[data-command-category="campaigns"]')?.textContent).toBe('Campaigns');
    expect(root.querySelector('[data-command-item="ash-road"]')?.textContent)
      .toContain('Ash Road');
    expect(getByRole(root, 'heading', { name: 'Fuel Stop' })).toBeTruthy();

    fireEvent.click(button(root, 'Start Ash Road'));
    fireEvent.keyDown(button(root, 'Start Ash Road'), { key: 'Enter' });
    expect(escapedClick).not.toHaveBeenCalled();
    expect(escapedKey).not.toHaveBeenCalled();
    shell.destroy();
  });
});

describe('CampaignCommandView decision plane', () => {
  it.each([
    ['checking', 'Checking this device for an Ash Road save.', 'Checking save', true],
    ['empty', 'No Ash Road save is stored on this device.', 'Start Ash Road', false],
    ['compatible', 'A compatible run is ready on this device.', 'Resume Ash Road', false],
    ['incompatible', 'The stored run was created for a different Ash Road build.', 'Campaign unavailable', true],
    ['unavailable', 'This browser could not read campaign storage.', 'Save unavailable', true],
    ['restoring', 'Restoring the saved run.', 'Restoring Ash Road', true],
    ['complete', 'Ash Road is complete on this device.', 'Campaign complete', true],
  ] as const)(
    'renders %s truthfully with exactly one primary control',
    (status, statusCopy, primaryLabel, disabled) => {
      const { host } = setup(savedContext(status));
      const primaries = host.querySelectorAll<HTMLButtonElement>('[data-command-primary]');

      expect(host.querySelector('[data-campaign-save-status]')?.textContent).toContain(statusCopy);
      expect(primaries).toHaveLength(1);
      expect(primaries[0]?.textContent).toBe(primaryLabel);
      expect(primaries[0]?.disabled).toBe(disabled);
      expect(host.querySelector('[aria-busy="true"]') !== null)
        .toBe(status === 'checking' || status === 'restoring');
    },
  );

  it('leads with mission, immediate objective, selected kit, and truthful carried/granted equipment', () => {
    const { host } = setup(savedContext('compatible', 'assault', 1));
    const decisionPlane = host.querySelector<HTMLElement>('[data-campaign-decision-plane]')!;

    expect(getByRole(decisionPlane, 'heading', { name: 'High Road' })).toBeTruthy();
    expect(decisionPlane.textContent).toContain('Hold the pump for 3 commitments or destroy the defender.');
    expect(decisionPlane.textContent).toContain('Assault');
    expect(decisionPlane.textContent).toContain('Missile, Cluster Bomb, Shield');
    expect(decisionPlane.textContent).toContain('Baby Missile, Missile, Cluster Bomb, Shield');
    expect(decisionPlane.querySelector('details')).toBeNull();
  });

  it('keeps route map and campaign briefing in secondary native disclosures', () => {
    const { host } = setup();
    const details = [...host.querySelectorAll('details')];

    expect(details).toHaveLength(2);
    expect(details.map((node) => node.querySelector('summary')?.textContent)).toEqual([
      'Route map',
      'Campaign briefing',
    ]);
    expect(details[0]?.textContent).toContain('Fuel Stop');
    expect(details[0]?.textContent).toContain('Relay Ridge');
    expect(details[0]?.querySelector('img')?.getAttribute('src'))
      .toContain('art/campaign/ash-road-panorama.webp');
  });

  it('routes Start, Resume, confirmed New Run, retry, and kit selection to the current owner callbacks', () => {
    const empty = savedContext('empty');
    const mounted = setup(empty);
    const kit = getByRole(mounted.host, 'combobox', { name: 'New run kit' }) as HTMLSelectElement;
    kit.value = 'breach';
    fireEvent.change(kit);
    expect(empty.onSelectKit).toHaveBeenCalledWith('breach');
    mounted.view.update({ ...empty, selectedKit: 'breach' });
    button(mounted.host, 'Start Ash Road').click();
    expect(empty.onStart).toHaveBeenCalledWith('breach');

    const compatible = savedContext('compatible', 'assault');
    mounted.view.update(compatible);
    button(mounted.host, 'Resume Ash Road').click();
    button(mounted.host, 'New Run').click();
    expect(compatible.onResume).toHaveBeenCalledOnce();
    expect(compatible.onNewRun).toHaveBeenCalledWith('assault', expect.any(AbortSignal));
    const lifetime = vi.mocked(compatible.onNewRun).mock.calls[0]![1];
    expect(lifetime.aborted).toBe(false);

    const unavailable = savedContext('unavailable');
    mounted.view.update(unavailable);
    button(mounted.host, 'Retry save check').click();
    expect(unavailable.onRetrySave).toHaveBeenCalledOnce();

    const complete = savedContext('complete', 'breach');
    mounted.view.update(complete);
    expect(queryAllByRole(mounted.host, 'button', { name: 'Resume Ash Road' })).toHaveLength(0);
    button(mounted.host, 'New Run').click();
    expect(complete.onNewRun).toHaveBeenCalledWith('breach', expect.any(AbortSignal));
    mounted.view.dispose();
    expect(lifetime.aborted).toBe(true);
  });

  it('exposes stable action hooks, updates in place, focuses the valid decision, and disposes idempotently', () => {
    const first = savedContext('empty');
    const { host, view } = setup(first);
    const root = host.querySelector<HTMLElement>('[data-campaign-command-view]')!;
    const select = getByRole(host, 'combobox', { name: 'New run kit' }) as HTMLSelectElement;
    expect([...host.querySelectorAll('button, select, summary')]
      .every((control) => control.classList.contains('command-center__action'))).toBe(true);

    view.update(savedContext('compatible', 'assault', 1));
    expect(host.querySelector('[data-campaign-command-view]')).toBe(root);
    expect(select.value).toBe('assault');
    expect(getByRole(host, 'heading', { name: 'High Road' })).toBeTruthy();

    view.focusDefault();
    expect(document.activeElement).toBe(button(host, 'Resume Ash Road'));

    const staleResume = button(host, 'Resume Ash Road');
    const current = savedContext('compatible');
    view.update(current);
    view.dispose();
    view.dispose();
    staleResume.click();
    expect(current.onResume).not.toHaveBeenCalled();
    expect(host.querySelector('[data-campaign-command-view]')).toBeNull();
  });

  it.each([
    ['complete', 'New Run'],
    ['unavailable', 'Retry save check'],
    ['checking', null],
  ] as const)('focuses the meaningful %s-state fallback', (status, actionLabel) => {
    const { host, view } = setup(savedContext(status));

    view.focusDefault();

    const expected = actionLabel === null
      ? host.querySelector('[data-campaign-save-status]')
      : button(host, actionLabel);
    expect(document.activeElement).toBe(expected);
  });
});
