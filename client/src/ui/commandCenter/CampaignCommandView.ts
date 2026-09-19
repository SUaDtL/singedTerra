import type { CampaignEncounterDefinition } from '@shared/campaign/definitions';
import type { CampaignWeaponId } from '@shared/campaign/combatProfiles';
import { createCampaignLoadout, type CampaignLoadout } from '../../campaign/loadout';
import { ASH_ROAD_EPISODE } from '../../campaign/content/episode';
import { ASH_ROAD_STORY } from '../../campaign/content/story';
import type { CampaignResumeCandidate } from './CampaignSavePresentation';
import {
  createPreparationFrame,
  createPreparationPrimaryAction,
} from '../PreparationFrame';
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

const MISSION_ART = Object.freeze({
  'fuel-stop': 'ash-road-refinery.webp',
  'high-road': 'ash-road-refinery.webp',
  'salvage-pit': 'ash-road-cache.webp',
  'relay-ridge': 'ash-road-relay.webp',
} as const);

const OBJECT_NAMES = Object.freeze({
  refinery: 'refinery',
  pump: 'pump',
  'ridge-relay': 'relay',
  'siege-relay': 'relay',
} as const);

const SAVE_COPY = Object.freeze({
  checking: 'Checking this device for a saved run.',
  empty: 'No saved run on this device.',
  compatible: 'Saved run ready.',
  incompatible: 'Saved run uses a different Ash Road build. Resume and replacement are blocked.',
  unavailable: 'Campaign storage could not be read. Nothing was replaced.',
  restoring: 'Restoring saved run.',
  complete: 'Campaign complete. Starting again will replace this record.',
} as const satisfies Record<CampaignSavePresentation['status'], string>);

type RouteNodeState = 'available' | 'alternate' | 'complete' | 'current' | 'upcoming';

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

function weaponName(id: CampaignWeaponId): string {
  if (id === 'baby_missile') return 'Baby Missile';
  if (id === 'cluster_bomb') return 'Cluster Bomb';
  return id.split('_').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
}

function carriedWeaponNames(loadout: CampaignLoadout): string {
  return [
    loadout.carried.basicWeaponId,
    ...loadout.carried.offensiveWeaponIds,
    loadout.carried.defensiveWeaponId,
  ].map(weaponName).join(', ');
}

function kitForLoadout(loadout: CampaignLoadout): CampaignKitId | null {
  const [first, second] = loadout.carried.offensiveWeaponIds;
  for (const kitId of Object.keys(KIT_PRESENTATION) as CampaignKitId[]) {
    const offense = KIT_PRESENTATION[kitId].offense;
    if (first === offense[0] && second === offense[1]) return kitId;
  }
  return null;
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

function missionArt(encounterId: string): string {
  return MISSION_ART[encounterId as keyof typeof MISSION_ART] ?? MISSION_ART['fuel-stop'];
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
  let previousStatus = initialContext.savePresentation.status;
  let newRunSetup = previousStatus === 'empty' || previousStatus === 'complete';
  let disposed = false;

  const root = element(document, 'article', 'campaign-command');
  root.dataset.campaignCommandView = '';

  const decisionPlane = element(document, 'section', 'campaign-command__decision');
  decisionPlane.dataset.campaignDecisionPlane = '';
  decisionPlane.setAttribute('aria-label', 'Ash Road preparation');

  const identity = element(document, 'div', 'campaign-command__identity');
  const chapter = element(document, 'p', 'campaign-command__chapter');
  chapter.textContent = 'Ash Road campaign';
  const missionKicker = element(document, 'p', 'campaign-command__fact-label');
  missionKicker.textContent = 'Current assignment';
  const mission = element(document, 'h2', 'campaign-command__mission');
  mission.id = `campaign-command-mission-${id}`;
  const saveStatus = element(document, 'p', 'campaign-command__save-status');
  saveStatus.dataset.campaignSaveStatus = '';
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');
  saveStatus.tabIndex = -1;
  identity.append(chapter, missionKicker, mission, saveStatus);

  const missionScene = element(document, 'figure', 'campaign-command__scene');
  missionScene.setAttribute('aria-labelledby', mission.id);
  const sceneBackdrop = document.createElement('img');
  sceneBackdrop.src = `${import.meta.env.BASE_URL}art/campaign/ash-road-panorama.webp`;
  sceneBackdrop.alt = '';
  sceneBackdrop.className = 'campaign-command__scene-backdrop';
  const sceneObject = document.createElement('img');
  sceneObject.alt = '';
  sceneObject.className = 'campaign-command__scene-object';
  const sceneCaption = document.createElement('figcaption');
  sceneCaption.textContent = 'Ash Road field projection';
  missionScene.append(sceneBackdrop, sceneObject, sceneCaption);

  const objectivePanel = element(document, 'section', 'campaign-command__objective-panel');
  const objectiveLabel = element(document, 'p', 'campaign-command__fact-label');
  objectiveLabel.textContent = 'Immediate objective';
  const objective = element(document, 'p', 'campaign-command__objective');
  objectivePanel.append(objectiveLabel, objective);

  const routeBoard = element(document, 'section', 'campaign-command__route-board');
  routeBoard.dataset.campaignRouteMap = '';
  routeBoard.setAttribute('aria-labelledby', `campaign-command-route-${id}`);
  const routeHeader = element(document, 'div', 'campaign-command__route-header');
  const routeTitle = element(document, 'h3', 'campaign-command__route-title');
  routeTitle.id = `campaign-command-route-${id}`;
  routeTitle.textContent = 'Convoy route';
  const routeStatus = element(document, 'p', 'campaign-command__route-status');
  routeHeader.append(routeTitle, routeStatus);

  const routeTrack = element(document, 'div', 'campaign-command__route-track');
  routeTrack.setAttribute('role', 'list');
  routeTrack.setAttribute('aria-label', 'Ash Road mission route');
  const routeNodes = new Map<string, HTMLElement>();
  const createRouteNode = (encounterId: string, position: string): HTMLElement => {
    const node = element(document, 'div', 'campaign-command__route-node');
    node.dataset.campaignRoute = encounterId;
    node.dataset.routePosition = position;
    node.setAttribute('role', 'listitem');
    const marker = element(document, 'span', 'campaign-command__route-marker');
    marker.setAttribute('aria-hidden', 'true');
    const label = element(document, 'span', 'campaign-command__route-label');
    label.textContent = encounterName(encounterId);
    node.append(marker, label);
    routeNodes.set(encounterId, node);
    return node;
  };
  const entryNode = createRouteNode('fuel-stop', 'entry');
  const branch = element(document, 'div', 'campaign-command__route-branches');
  branch.setAttribute('role', 'group');
  branch.setAttribute('aria-label', 'Alternative approaches');
  branch.append(
    createRouteNode('high-road', 'branch'),
    createRouteNode('salvage-pit', 'branch'),
  );
  const finishNode = createRouteNode('relay-ridge', 'finish');
  const firstConnector = element(document, 'span', 'campaign-command__route-connector');
  firstConnector.setAttribute('aria-hidden', 'true');
  const secondConnector = element(document, 'span', 'campaign-command__route-connector');
  secondConnector.setAttribute('aria-hidden', 'true');
  routeTrack.append(entryNode, firstConnector, branch, secondConnector, finishNode);
  routeBoard.append(routeHeader, routeTrack);

  decisionPlane.append(missionScene, objectivePanel, routeBoard);

  const loadoutPanel = element(document, 'section', 'campaign-command__loadout');
  loadoutPanel.setAttribute('aria-labelledby', `campaign-command-loadout-${id}`);
  const loadoutHeader = element(document, 'div', 'campaign-command__loadout-header');
  const loadoutTitle = element(document, 'h3', 'campaign-command__loadout-title');
  loadoutTitle.id = `campaign-command-loadout-${id}`;
  const loadoutProfile = element(document, 'p', 'campaign-command__loadout-profile');
  loadoutHeader.append(loadoutTitle, loadoutProfile);

  const kitField = element(document, 'label', 'campaign-command__kit');
  const kitLabel = element(document, 'span', 'campaign-command__fact-label');
  kitLabel.textContent = 'New run kit';
  const kitSelect = element(document, 'select', 'command-center__action campaign-command__kit-select');
  kitSelect.id = `campaign-command-kit-${id}`;
  kitSelect.setAttribute('aria-label', 'New run kit');
  for (const kitId of ['precision', 'assault', 'breach'] as const) {
    const option = document.createElement('option');
    option.value = kitId;
    option.textContent = `${KIT_PRESENTATION[kitId].label}: ${carriedWeaponNames(newRunLoadout(kitId))}`;
    kitSelect.append(option);
  }
  kitField.append(kitLabel, kitSelect);

  const equipment = element(document, 'dl', 'campaign-command__equipment');
  const weaponsTerm = document.createElement('dt');
  weaponsTerm.textContent = 'Weapons';
  const weaponsValue = document.createElement('dd');
  const conditionTerm = document.createElement('dt');
  conditionTerm.textContent = 'Run condition';
  const conditionValue = document.createElement('dd');
  equipment.append(weaponsTerm, weaponsValue, conditionTerm, conditionValue);
  loadoutPanel.append(loadoutHeader, kitField, equipment);

  const primary = createPreparationPrimaryAction(document, {
    label: '',
    className: 'campaign-command__primary-action',
  });
  primary.dataset.commandPrimary = '';
  const secondary = element(document, 'button', 'command-center__action campaign-command__secondary-action');
  secondary.type = 'button';
  secondary.name = 'campaign-new-run';
  secondary.dataset.commandAction = 'new-run';
  const retry = element(document, 'button', 'command-center__action campaign-command__secondary-action');
  retry.type = 'button';
  retry.name = 'campaign-save-retry';
  retry.dataset.commandAction = 'retry-save';
  retry.textContent = 'Retry save check';
  const briefing = element(document, 'details', 'campaign-command__disclosure');
  const briefingSummary = document.createElement('summary');
  briefingSummary.className = 'command-center__action campaign-command__disclosure-summary';
  briefingSummary.textContent = 'Campaign briefing';
  const briefingCopy = document.createElement('p');
  briefingCopy.textContent = ASH_ROAD_STORY.setting;
  briefing.append(briefingSummary, briefingCopy);

  const supporting = element(document, 'div', 'campaign-command__supporting');
  supporting.append(loadoutPanel, briefing);

  createPreparationFrame(document, {
    root,
    headingContent: identity,
    body: [decisionPlane, supporting],
    dockLabel: 'Campaign order',
    dockStatus: saveStatus,
    primaryAction: primary,
    secondaryActions: [secondary, retry],
    dockClassName: 'campaign-command__actions',
  });
  host.replaceChildren(root);

  const renderRoute = (encounterId: string): void => {
    const runState = context.resumeCandidate?.payload.runState;
    const checkpointRouteId = runState?.checkpoint.run.routeId ?? null;
    const selectedRouteId = runState?.selectedRouteId
      ?? (encounterId === ASH_ROAD_EPISODE.entryEncounterId ? null : checkpointRouteId);
    const selectedRoute = ASH_ROAD_EPISODE.routes.find(({ id: routeId }) => routeId === selectedRouteId);
    const selectedBranch = selectedRoute?.encounterIds.find(
      (candidate) => candidate !== 'fuel-stop' && candidate !== 'relay-ridge',
    ) ?? null;
    const currentIndex = selectedRoute?.encounterIds.indexOf(encounterId) ?? -1;

    for (const [nodeId, node] of routeNodes) {
      let state: RouteNodeState = 'upcoming';
      if (nodeId === encounterId) state = 'current';
      else if (nodeId === 'fuel-stop' && encounterId !== 'fuel-stop') state = 'complete';
      else if (nodeId === 'relay-ridge') state = 'upcoming';
      else if (selectedBranch === null) state = 'available';
      else if (nodeId !== selectedBranch) state = 'alternate';
      else if (currentIndex >= 2) state = 'complete';
      else state = 'upcoming';
      node.dataset.routeState = state;
      if (state === 'current') node.setAttribute('aria-current', 'step');
      else node.removeAttribute('aria-current');
      node.setAttribute('aria-label', `${encounterName(nodeId)}, ${state}`);
    }

    routeStatus.textContent = selectedBranch
      ? `${encounterName(selectedBranch)} route selected. Relay Ridge is the final approach.`
      : 'Choose one approach after Fuel Stop. Both roads converge at Relay Ridge.';
  };

  const render = (): void => {
    const focusedControl = root.contains(document.activeElement)
      ? document.activeElement as HTMLElement
      : null;
    const status = context.savePresentation.status;
    const encounter = currentEncounter(context);
    const selectedLoadout = newRunLoadout(context.selectedKit);
    const persistedLoadout = savedLoadout(context);
    const usingSavedLoadout = status === 'compatible' && !newRunSetup && persistedLoadout !== null;
    const activeLoadout = usingSavedLoadout ? persistedLoadout : selectedLoadout;
    const activeKit = kitForLoadout(activeLoadout);
    const showNewRunKit = status === 'empty'
      || status === 'complete'
      || (status === 'compatible' && newRunSetup);
    const blockLoadout = status === 'checking'
      || status === 'restoring'
      || status === 'incompatible'
      || status === 'unavailable';

    root.dataset.campaignSaveState = status;
    root.dataset.campaignWorkflow = newRunSetup ? 'new-run' : 'current-run';
    root.setAttribute('aria-busy', String(status === 'checking' || status === 'restoring'));
    saveStatus.textContent = SAVE_COPY[status];
    mission.textContent = encounterName(encounter.encounterId);
    objective.textContent = status === 'complete' ? 'Chapter secured.' : immediateObjective(encounter);
    sceneObject.src = `${import.meta.env.BASE_URL}art/campaign/${missionArt(encounter.encounterId)}`;
    sceneObject.dataset.missionArt = encounter.encounterId;
    renderRoute(encounter.encounterId);

    loadoutPanel.hidden = blockLoadout;
    loadoutPanel.dataset.campaignLoadoutMode = usingSavedLoadout ? 'saved' : 'starting';
    loadoutTitle.textContent = usingSavedLoadout ? 'Saved loadout' : 'Starting loadout';
    loadoutProfile.textContent = activeKit
      ? `${KIT_PRESENTATION[activeKit].label} configuration`
      : 'Field configuration';
    kitField.hidden = !showNewRunKit;
    kitSelect.value = context.selectedKit;
    kitSelect.disabled = !showNewRunKit || blockLoadout;
    weaponsValue.textContent = carriedWeaponNames(activeLoadout);
    conditionTerm.hidden = !usingSavedLoadout;
    conditionValue.hidden = !usingSavedLoadout;
    if (usingSavedLoadout && context.resumeCandidate) {
      const runState = context.resumeCandidate.payload.runState;
      conditionValue.textContent = `Hull ${activeLoadout.hull} · ${runState.supplies} supplies`;
    } else {
      conditionValue.textContent = '';
    }

    secondary.hidden = status !== 'compatible';
    secondary.disabled = secondary.hidden;
    secondary.textContent = newRunSetup ? 'Cancel New Run' : 'New Run';
    retry.hidden = status !== 'unavailable';
    retry.disabled = retry.hidden;
    if (status === 'empty') {
      primary.textContent = 'Start Ash Road';
      primary.name = 'campaign-new-run';
      primary.dataset.commandAction = 'new-run';
      primary.disabled = false;
    } else if (status === 'compatible' && newRunSetup) {
      primary.textContent = 'Replace Saved Run';
      primary.name = 'campaign-new-run';
      primary.dataset.commandAction = 'new-run';
      primary.disabled = false;
    } else if (status === 'compatible') {
      primary.textContent = 'Resume Ash Road';
      primary.name = 'campaign-resume';
      primary.dataset.commandAction = 'resume';
      primary.disabled = context.resumeCandidate === null;
    } else if (status === 'checking') {
      primary.textContent = 'Checking save';
      primary.name = 'campaign-save-status';
      primary.dataset.commandAction = 'save-status';
      primary.disabled = true;
    } else if (status === 'restoring') {
      primary.textContent = 'Restoring Ash Road';
      primary.name = 'campaign-resume';
      primary.dataset.commandAction = 'resume';
      primary.disabled = true;
    } else if (status === 'incompatible') {
      primary.textContent = 'Campaign unavailable';
      primary.name = 'campaign-save-status';
      primary.dataset.commandAction = 'save-status';
      primary.disabled = true;
    } else if (status === 'unavailable') {
      primary.textContent = 'Save unavailable';
      primary.name = 'campaign-save-status';
      primary.dataset.commandAction = 'save-status';
      primary.disabled = true;
    } else {
      primary.textContent = 'Start New Run';
      primary.name = 'campaign-new-run';
      primary.dataset.commandAction = 'new-run';
      primary.disabled = false;
    }

    const focusedIsDisabled = focusedControl instanceof HTMLButtonElement
      || focusedControl instanceof HTMLSelectElement
      ? focusedControl.disabled
      : false;
    if (focusedControl && (focusedIsDisabled || focusedControl.closest('[hidden]'))) {
      saveStatus.focus({ preventScroll: true });
    }
  };

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
    const status = context.savePresentation.status;
    if (status === 'empty') {
      void context.onStart(context.selectedKit);
    } else if (status === 'compatible' && !newRunSetup && context.resumeCandidate) {
      context.onResume();
    } else if ((status === 'compatible' && newRunSetup) || status === 'complete') {
      void context.onNewRun(context.selectedKit, lifetime?.signal ?? listeners.signal);
    }
  }, { signal: listeners.signal });
  secondary.addEventListener('click', () => {
    if (disposed || secondary.hidden || secondary.disabled) return;
    newRunSetup = !newRunSetup;
    render();
    if (newRunSetup) kitSelect.focus({ preventScroll: true });
    else primary.focus({ preventScroll: true });
  }, { signal: listeners.signal });
  retry.addEventListener('click', () => {
    if (disposed || retry.hidden || retry.disabled) return;
    void context.onRetrySave();
  }, { signal: listeners.signal });

  render();

  return {
    update: (nextContext) => {
      if (disposed) return;
      context = nextContext;
      const nextStatus = nextContext.savePresentation.status;
      if (nextStatus !== previousStatus) {
        newRunSetup = nextStatus === 'empty' || nextStatus === 'complete';
        previousStatus = nextStatus;
      }
      render();
    },
    focusDefault: () => {
      if (disposed) return;
      if (!primary.disabled) primary.focus();
      else if (!retry.hidden && !retry.disabled) retry.focus();
      else if (!secondary.hidden && !secondary.disabled) secondary.focus();
      else if (!kitField.hidden && !kitSelect.disabled) kitSelect.focus();
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
      createView: (viewHost, viewContext, viewLifetime) => createCampaignCommandView(
        viewHost,
        viewContext,
        viewLifetime,
      ),
    }],
  };
}
