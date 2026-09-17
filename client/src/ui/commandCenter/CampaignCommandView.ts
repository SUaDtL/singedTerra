import type {
  CampaignEncounterDefinition,
} from '@shared/campaign/definitions';
import type { CampaignWeaponId } from '@shared/campaign/combatProfiles';
import { createCampaignLoadout, type CampaignLoadout } from '../../campaign/loadout';
import { ASH_ROAD_EPISODE } from '../../campaign/content/episode';
import { ASH_ROAD_STORY } from '../../campaign/content/story';
import type { CampaignResumeCandidate } from './CampaignSavePresentation';
import {
  commandCategoryId,
  commandItemId,
  type CampaignSavePresentation,
  type CommandCategoryContribution,
  type CommandViewLifetime,
  type MountedCommandView,
} from './contracts';

export type CampaignKitId = 'precision' | 'assault' | 'breach';

export interface CampaignCommandContext {
  readonly savePresentation: CampaignSavePresentation;
  readonly resumeCandidate: CampaignResumeCandidate | null;
  readonly selectedKit: CampaignKitId;
  readonly onSelectKit: (kitId: CampaignKitId) => void;
  readonly onStart: (kitId: CampaignKitId) => void | Promise<void>;
  readonly onResume: () => void;
  readonly onNewRun: (kitId: CampaignKitId, lifetime: AbortSignal) => void | Promise<void>;
  readonly onRetrySave: () => void | Promise<void>;
}

const KIT_PRESENTATION = Object.freeze({
  precision: Object.freeze({
    label: 'Precision',
    offense: Object.freeze(['missile', 'napalm'] as const),
  }),
  assault: Object.freeze({
    label: 'Assault',
    offense: Object.freeze(['missile', 'cluster_bomb'] as const),
  }),
  breach: Object.freeze({
    label: 'Breach',
    offense: Object.freeze(['missile', 'sandhog'] as const),
  }),
} as const satisfies Record<CampaignKitId, {
  readonly label: string;
  readonly offense: readonly [CampaignWeaponId, CampaignWeaponId];
}>);

const ENCOUNTER_NAMES = Object.freeze({
  'fuel-stop': 'Fuel Stop',
  'high-road': 'High Road',
  'salvage-pit': 'Salvage Pit',
  'relay-ridge': 'Relay Ridge',
} as const);

const OBJECT_NAMES = Object.freeze({
  refinery: 'refinery',
  pump: 'pump',
  'ridge-relay': 'relay',
  'siege-relay': 'relay',
} as const);

const SAVE_COPY = Object.freeze({
  checking: 'Checking this device for an Ash Road save.',
  empty: 'No Ash Road save is stored on this device.',
  compatible: 'A compatible run is ready on this device.',
  incompatible: 'The stored run was created for a different Ash Road build. It cannot be resumed or replaced here.',
  unavailable: 'This browser could not read campaign storage. Your saved run was not treated as empty.',
  restoring: 'Restoring the saved run.',
  complete: 'Ash Road is complete on this device. A new run will replace that completed record.',
} as const satisfies Record<CampaignSavePresentation['status'], string>);

let campaignCommandViewId = 0;

function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function encounterName(encounterId: string): string {
  return ENCOUNTER_NAMES[encounterId as keyof typeof ENCOUNTER_NAMES]
    ?? encounterId.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
}

function objectName(objectId: string): string {
  return OBJECT_NAMES[objectId as keyof typeof OBJECT_NAMES] ?? objectId.replaceAll('-', ' ');
}

function immediateObjective(encounter: CampaignEncounterDefinition): string {
  const protectedObjects = encounter.objective.protectedObjectIds.map(objectName);
  if (encounter.objective.kind === 'survive-or-eliminate') {
    const target = protectedObjects[0];
    return target
      ? `Hold the ${target} for ${encounter.objective.humanCommitments} commitments or destroy the defender.`
      : `Hold the position for ${encounter.objective.humanCommitments} commitments or destroy the defender.`;
  }
  return protectedObjects.length > 0
    ? `Destroy all defenders. Keep the ${protectedObjects.join(' and ')} standing.`
    : 'Destroy all defenders.';
}

function newRunLoadout(kitId: CampaignKitId): CampaignLoadout {
  return createCampaignLoadout({ offensiveWeaponIds: KIT_PRESENTATION[kitId].offense });
}

function weaponNames(ids: readonly CampaignWeaponId[], loadout: CampaignLoadout): string {
  const names = new Map(loadout.carried.ammunition.map(({ weaponId }) => [
    weaponId,
    weaponId === 'baby_missile'
      ? 'Baby Missile'
      : weaponId === 'cluster_bomb'
        ? 'Cluster Bomb'
        : weaponId.slice(0, 1).toUpperCase() + weaponId.slice(1),
  ]));
  return ids.map((id) => names.get(id) ?? id.replaceAll('_', ' ')).join(', ');
}

function savedLoadout(context: Readonly<CampaignCommandContext>): CampaignLoadout | null {
  return context.resumeCandidate?.payload.runState.loadout ?? null;
}

function currentEncounter(context: Readonly<CampaignCommandContext>): CampaignEncounterDefinition {
  const saved = context.resumeCandidate?.payload.runState.checkpoint.encounter;
  if (saved) return saved;
  if (context.savePresentation.status === 'complete') {
    const finalId = ASH_ROAD_EPISODE.routes[0]?.encounterIds.at(-1);
    const final = ASH_ROAD_EPISODE.encounters.find(({ encounterId }) => encounterId === finalId);
    if (final) return final;
  }
  return ASH_ROAD_EPISODE.encounters.find(
    ({ encounterId }) => encounterId === ASH_ROAD_EPISODE.entryEncounterId,
  )!;
}

export function createCampaignCommandView(
  host: HTMLElement,
  initialContext: Readonly<CampaignCommandContext>,
  lifetime?: CommandViewLifetime,
): MountedCommandView<CampaignCommandContext> {
  const document = host.ownerDocument;
  const listeners = new AbortController();
  const id = ++campaignCommandViewId;
  let context = initialContext;
  let disposed = false;

  const root = element(document, 'article', 'campaign-command');
  root.dataset.campaignCommandView = '';

  const decisionPlane = element(document, 'section', 'campaign-command__decision');
  decisionPlane.dataset.campaignDecisionPlane = '';
  decisionPlane.setAttribute('aria-label', 'Ash Road preparation');

  const chapter = element(document, 'p', 'campaign-command__chapter');
  chapter.textContent = 'Ash Road';
  const mission = element(document, 'h2', 'campaign-command__mission');
  const objectiveLabel = element(document, 'p', 'campaign-command__fact-label');
  objectiveLabel.textContent = 'Immediate objective';
  const objective = element(document, 'p', 'campaign-command__objective');

  const saveStatus = element(document, 'p', 'campaign-command__save-status');
  saveStatus.dataset.campaignSaveStatus = '';
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');
  saveStatus.tabIndex = -1;

  const kitField = element(document, 'label', 'campaign-command__kit');
  const kitLabel = element(document, 'span', 'campaign-command__fact-label');
  kitLabel.textContent = 'New run kit';
  const kitSelect = element(document, 'select', 'command-center__action campaign-command__kit-select');
  kitSelect.id = `campaign-command-kit-${id}`;
  kitSelect.setAttribute('aria-label', 'New run kit');
  for (const kitId of ['precision', 'assault', 'breach'] as const) {
    const option = document.createElement('option');
    option.value = kitId;
    option.textContent = `${KIT_PRESENTATION[kitId].label}: ${weaponNames(
      [...KIT_PRESENTATION[kitId].offense, 'shield'],
      newRunLoadout(kitId),
    )}`;
    kitSelect.append(option);
  }
  kitField.append(kitLabel, kitSelect);

  const equipment = element(document, 'dl', 'campaign-command__equipment');
  const selectedKitTerm = document.createElement('dt');
  selectedKitTerm.textContent = 'Selected kit';
  const selectedKitValue = document.createElement('dd');
  const carriedTerm = document.createElement('dt');
  carriedTerm.textContent = 'Carried kit';
  const carriedValue = document.createElement('dd');
  const grantedTerm = document.createElement('dt');
  grantedTerm.textContent = 'Granted equipment';
  const grantedValue = document.createElement('dd');
  equipment.append(
    selectedKitTerm,
    selectedKitValue,
    carriedTerm,
    carriedValue,
    grantedTerm,
    grantedValue,
  );

  const actions = element(document, 'div', 'campaign-command__actions');
  const primary = element(document, 'button', 'command-center__action command-center__primary-action');
  primary.type = 'button';
  primary.dataset.commandPrimary = '';
  const secondary = element(document, 'button', 'command-center__action campaign-command__secondary-action');
  secondary.type = 'button';
  secondary.textContent = 'New Run';
  const retry = element(document, 'button', 'command-center__action campaign-command__secondary-action');
  retry.type = 'button';
  retry.textContent = 'Retry save check';
  actions.append(primary, secondary, retry);

  decisionPlane.append(
    chapter,
    mission,
    objectiveLabel,
    objective,
    saveStatus,
    kitField,
    equipment,
    actions,
  );

  const routeMap = element(document, 'details', 'campaign-command__disclosure');
  const routeSummary = document.createElement('summary');
  routeSummary.className = 'command-center__action campaign-command__disclosure-summary';
  routeSummary.textContent = 'Route map';
  const routeArt = document.createElement('img');
  routeArt.src = `${import.meta.env.BASE_URL}art/campaign/ash-road-panorama.webp`;
  routeArt.alt = '';
  routeArt.className = 'campaign-command__route-art';
  const routes = element(document, 'ol', 'campaign-command__routes');
  for (const route of ASH_ROAD_EPISODE.routes) {
    const item = document.createElement('li');
    item.dataset.campaignRoute = route.id;
    item.textContent = route.encounterIds.map(encounterName).join(' to ');
    routes.append(item);
  }
  routeMap.append(routeSummary, routeArt, routes);

  const briefing = element(document, 'details', 'campaign-command__disclosure');
  const briefingSummary = document.createElement('summary');
  briefingSummary.className = 'command-center__action campaign-command__disclosure-summary';
  briefingSummary.textContent = 'Campaign briefing';
  const briefingCopy = document.createElement('p');
  briefingCopy.textContent = ASH_ROAD_STORY.setting;
  briefing.append(briefingSummary, briefingCopy);

  root.append(decisionPlane, routeMap, briefing);
  host.replaceChildren(root);

  kitSelect.addEventListener('change', () => {
    if (disposed) return;
    const kitId = kitSelect.value;
    if (kitId === 'precision' || kitId === 'assault' || kitId === 'breach') {
      context = { ...context, selectedKit: kitId };
      context.onSelectKit(kitId);
      render();
    }
  }, { signal: listeners.signal });
  primary.addEventListener('click', () => {
    if (disposed || primary.disabled) return;
    if (context.savePresentation.status === 'empty') {
      void context.onStart(context.selectedKit);
    } else if (context.savePresentation.status === 'compatible' && context.resumeCandidate) {
      context.onResume();
    }
  }, { signal: listeners.signal });
  secondary.addEventListener('click', () => {
    if (disposed || secondary.hidden || secondary.disabled) return;
    void context.onNewRun(context.selectedKit, lifetime?.signal ?? listeners.signal);
  }, { signal: listeners.signal });
  retry.addEventListener('click', () => {
    if (disposed || retry.hidden || retry.disabled) return;
    void context.onRetrySave();
  }, { signal: listeners.signal });

  const render = (): void => {
    const focusedControl = root.contains(document.activeElement)
      ? document.activeElement
      : null;
    const status = context.savePresentation.status;
    const encounter = currentEncounter(context);
    const selectedLoadout = newRunLoadout(context.selectedKit);
    const activeLoadout = savedLoadout(context) ?? selectedLoadout;
    const activeSpecials = [
      ...activeLoadout.carried.offensiveWeaponIds,
      activeLoadout.carried.defensiveWeaponId,
    ];

    root.dataset.campaignSaveState = status;
    root.setAttribute('aria-busy', String(status === 'checking' || status === 'restoring'));
    saveStatus.textContent = SAVE_COPY[status];
    mission.textContent = encounterName(encounter.encounterId);
    objective.textContent = status === 'complete' ? 'Chapter secured.' : immediateObjective(encounter);
    kitSelect.value = context.selectedKit;
    kitSelect.disabled = status === 'checking'
      || status === 'restoring'
      || status === 'incompatible'
      || status === 'unavailable';
    selectedKitValue.textContent = KIT_PRESENTATION[context.selectedKit].label;
    carriedValue.textContent = weaponNames(activeSpecials, activeLoadout);
    grantedValue.textContent = weaponNames(activeLoadout.owned.grantedWeaponIds, activeLoadout);

    secondary.hidden = status !== 'compatible' && status !== 'complete';
    secondary.disabled = secondary.hidden;
    retry.hidden = status !== 'unavailable';
    retry.disabled = retry.hidden;
    if (status === 'empty') {
      primary.textContent = 'Start Ash Road';
      primary.disabled = false;
    } else if (status === 'compatible') {
      primary.textContent = 'Resume Ash Road';
      primary.disabled = context.resumeCandidate === null;
    } else if (status === 'checking') {
      primary.textContent = 'Checking save';
      primary.disabled = true;
    } else if (status === 'restoring') {
      primary.textContent = 'Restoring Ash Road';
      primary.disabled = true;
    } else if (status === 'incompatible') {
      primary.textContent = 'Campaign unavailable';
      primary.disabled = true;
    } else if (status === 'unavailable') {
      primary.textContent = 'Save unavailable';
      primary.disabled = true;
    } else {
      primary.textContent = 'Campaign complete';
      primary.disabled = true;
    }

    if (
      focusedControl instanceof HTMLButtonElement
      && (focusedControl.hidden || focusedControl.disabled)
    ) {
      saveStatus.focus({ preventScroll: true });
    }
  };

  render();

  return {
    update: (nextContext) => {
      if (disposed) return;
      context = nextContext;
      render();
    },
    focusDefault: () => {
      if (disposed) return;
      if (!primary.disabled) primary.focus();
      else if (!secondary.hidden && !secondary.disabled) secondary.focus();
      else if (!retry.hidden && !retry.disabled) retry.focus();
      else if (!kitSelect.disabled) kitSelect.focus();
      else saveStatus.focus();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.abort();
      root.remove();
    },
  };
}

export function createAshRoadCommandCategoryContribution<
  Context extends CampaignCommandContext,
>(): CommandCategoryContribution<Context> {
  return {
    id: commandCategoryId('campaigns'),
    label: 'Campaigns',
    icon: 'campaigns',
    order: 10,
    availability: () => true,
    provideItems: () => [{
      id: commandItemId('ash-road'),
      summary: {
        label: 'Ash Road',
        description: 'Escort the refinery convoy through hostile ground.',
      },
      availability: () => true,
      createView: (host, context, lifetime) => createCampaignCommandView(host, context, lifetime),
    }],
  };
}
