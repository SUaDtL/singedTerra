import { renderFieldOrder, type FieldOrder } from '../client/fieldOrder';
import { buildLobbyPreparationSection } from './LobbyPreparationSection';

export interface LobbyHotSeatViewOptions {
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  playerRows: readonly HTMLElement[];
  advanced: HTMLElement;
  customizationOpen: boolean;
  validationMessage: string | null;
  verifiedDeployment: LobbyHotSeatVerifiedDeploymentOptions | null;
  /** Authenticated Local Battle may compose existing local practice operations here. */
  quickOperations?: readonly LobbyQuickOperation[];
  onQuickOperation?: (operationId: string) => void;
  onPlayerCountChange: (count: number) => void;
  onCustomizationToggle: (open: boolean) => void;
  onStart: () => void;
}

export interface LobbyQuickOperation {
  readonly id: string;
  readonly title: string;
  readonly briefing: string;
}

export interface LobbyHotSeatVerifiedDeploymentOptions {
  action: 'start' | 'resume';
  commanderName: string;
  busy: boolean;
  message: string | null;
  abandonIntent: boolean;
  fieldOrder: FieldOrder | null;
  onLaunch: () => void;
  onRequestAbandon: () => void;
  onConfirmAbandon: () => void;
  onCancelAbandon: () => void;
}

function buildVerifiedDeployment(
  options: LobbyHotSeatVerifiedDeploymentOptions,
  includeFieldOrderDossier = true,
): HTMLElement {
  const verified = document.createElement('section');
  verified.className = 'lobby-verified-deployment';
  verified.setAttribute('aria-label', 'Verified deployment');

  const title = document.createElement('h3');
  title.textContent = 'Verified deployment';
  const matchup = document.createElement('p');
  matchup.className = 'lobby-verified-deployment__matchup';
  matchup.textContent = `Commander ${options.commanderName} versus deterministic CPU`;
  const rules = document.createElement('ul');
  rules.className = 'lobby-verified-deployment__rules';
  for (const rule of [
    'Baby Missile only',
    '6 human / 6 CPU salvos maximum',
    'Fixed battlefield rules',
    'Verified XP stakes',
    '30-minute deadline',
  ]) {
    const item = document.createElement('li');
    item.textContent = rule;
    rules.append(item);
  }
  const fieldOrder = options.fieldOrder;
  const dossier = includeFieldOrderDossier && fieldOrder !== null ? document.createElement('section') : null;
  if (fieldOrder && dossier) {
    dossier.className = 'lobby-verified-deployment__dossier';
    dossier.setAttribute('aria-label', 'Commander dossier');
    const dossierTitle = document.createElement('h4');
    dossierTitle.textContent = 'Commander dossier';
    const order = document.createElement('p');
    order.textContent = renderFieldOrder(fieldOrder).brief;
    dossier.append(dossierTitle, order);
  }
  const message = document.createElement('p');
  message.className = 'lobby-verified-deployment__message';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.textContent = options.message ?? '';
  message.hidden = options.message === null;

  const actions = document.createElement('div');
  actions.className = 'lobby-verified-deployment__actions';
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'lobby-btn primary lobby-verified-deployment__launch';
  launch.textContent = options.busy
    ? 'Verified deployment busy'
    : options.action === 'resume'
      ? 'Resume verified deployment'
      : 'Start verified deployment';
  launch.disabled = options.busy;
  launch.addEventListener('click', options.onLaunch);
  actions.append(launch);

  if (options.action === 'resume') {
    const abandon = document.createElement('button');
    abandon.type = 'button';
    abandon.className = 'lobby-btn secondary lobby-verified-deployment__abandon';
    abandon.textContent = 'Abandon verified deployment';
    abandon.disabled = options.busy;
    abandon.addEventListener('click', options.onRequestAbandon);
    actions.append(abandon);

    const confirmation = document.createElement('div');
    confirmation.className = 'lobby-verified-deployment__confirm';
    confirmation.hidden = !options.abandonIntent;
    const warning = document.createElement('p');
    warning.textContent = 'Abandon this recoverable deployment and its pending verified run?';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'lobby-btn lobby-verified-deployment__confirm-abandon';
    confirm.textContent = 'Confirm abandon';
    confirm.addEventListener('click', options.onConfirmAbandon);
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'lobby-btn secondary lobby-verified-deployment__keep';
    keep.textContent = 'Keep deployment';
    keep.addEventListener('click', options.onCancelAbandon);
    confirmation.append(warning, confirm, keep);
    actions.append(confirmation);
  }

  verified.append(title, matchup, rules);
  if (dossier) verified.append(dossier);
  verified.append(message, actions);
  return verified;
}

function buildPracticeLane(
  operations: readonly LobbyQuickOperation[],
  onQuickOperation: (operationId: string) => void,
): HTMLElement {
  const practice = document.createElement('section');
  practice.dataset.operationLane = 'practice';
  practice.className = 'lobby-commander-operations__practice';
  practice.setAttribute('aria-label', 'Practice operations');
  const title = document.createElement('h3');
  title.textContent = 'Practice operations';
  const purpose = document.createElement('p');
  purpose.textContent = 'Local practice only. Results do not affect your verified record.';
  const cards = document.createElement('div');
  cards.className = 'lobby-commander-operations__cards';
  let selectedOperation = operations[0]!;
  for (const operation of operations) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lobby-commander-operations__card lobby-btn secondary';
    card.dataset.operationId = operation.id;
    card.setAttribute('aria-label', `${operation.title}. ${operation.briefing}`);
    const label = document.createElement('strong');
    label.textContent = operation.title;
    const briefing = document.createElement('span');
    briefing.textContent = operation.briefing;
    card.append(label, briefing);
    card.addEventListener('click', () => { onQuickOperation(operation.id); });
    cards.append(card);
  }
  const compactLaunch = document.createElement('div');
  compactLaunch.className = 'lobby-commander-operations__compact-launch';
  const selector = document.createElement('select');
  selector.dataset.ui = 'practice-operation-selector';
  selector.setAttribute('aria-label', 'Choose practice operation');
  for (const operation of operations) {
    const option = document.createElement('option');
    option.value = operation.id;
    option.textContent = operation.title;
    selector.append(option);
  }
  selector.addEventListener('change', () => {
    selectedOperation = operations.find((operation) => operation.id === selector.value) ?? operations[0]!;
  });
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'lobby-btn secondary';
  launch.dataset.ui = 'launch-practice-operation';
  launch.textContent = 'Launch practice';
  launch.addEventListener('click', () => { onQuickOperation(selectedOperation.id); });
  compactLaunch.append(selector, launch);
  practice.append(title, purpose, cards, compactLaunch);
  return practice;
}

function buildCommanderOperations(
  verifiedDeployment: LobbyHotSeatVerifiedDeploymentOptions,
  operations: readonly LobbyQuickOperation[],
  onQuickOperation: (operationId: string) => void,
): HTMLElement {
  const board = document.createElement('section');
  board.dataset.ui = 'commander-operations';
  board.className = 'lobby-commander-operations';
  board.setAttribute('aria-label', 'Commander Operations');

  const career = document.createElement('section');
  career.dataset.operationLane = 'career';
  career.className = 'lobby-commander-operations__career';
  const title = document.createElement('h3');
  title.textContent = 'Current field order';
  const order = document.createElement('p');
  order.textContent = verifiedDeployment.fieldOrder === null
    ? 'Your next verified order will be assigned when your record is available.'
    : renderFieldOrder(verifiedDeployment.fieldOrder).brief;
  career.append(title, order);

  const verified = buildVerifiedDeployment(verifiedDeployment, false);
  verified.dataset.operationLane = 'verified';
  board.append(career, verified, buildPracticeLane(operations, onQuickOperation));
  return board;
}

export function buildLobbyHotSeatView(options: LobbyHotSeatViewOptions): HTMLElement {
  const wrapper = document.createElement('div');
  const crowded = options.playerCount >= 3;
  wrapper.className = `lobby-route-brief lobby-hotseat${crowded ? ' crowded' : ''}`;

  const brief = document.createElement('header');
  brief.className = 'lobby-route-brief__header';
  const title = document.createElement('h2');
  title.className = 'lobby-route-brief__title';
  title.textContent = 'Local battery';
  const purpose = document.createElement('p');
  purpose.className = 'lobby-route-brief__purpose';
  purpose.textContent = 'Configure the crew sharing this battlefield.';
  brief.append(title, purpose);

  const ready = document.createElement('section');
  ready.className = 'lobby-hotseat-ready';
  ready.setAttribute('aria-label', 'Local battery readiness');
  const readyTitle = document.createElement('h3');
  readyTitle.textContent = 'Battery ready';
  const readyLoadout = document.createElement('strong');
  readyLoadout.textContent = `${options.playerCount}-player local battle`;
  const readyStatus = document.createElement('p');
  readyStatus.textContent = 'Current crew and battlefield setup is ready.';
  ready.append(readyTitle, readyLoadout, readyStatus);

  const customization = document.createElement('details');
  customization.className = 'lobby-hotseat-customization';
  customization.dataset.invalid = String(options.validationMessage !== null);
  customization.open = options.customizationOpen || customization.dataset.invalid === 'true';
  const customizationSummary = document.createElement('summary');
  customizationSummary.textContent = 'Customize crew and battlefield';

  const setup = document.createElement('section');
  setup.className = 'lobby-route-brief__setup';
  setup.setAttribute('aria-label', 'Local battery setup');

  const countField = document.createElement('div');
  countField.className = 'lobby-field';
  const countLabel = document.createElement('label');
  countLabel.textContent = 'Players';
  const countSelect = document.createElement('select');
  for (let count = options.minPlayers; count <= options.maxPlayers; count += 1) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    if (count === options.playerCount) option.selected = true;
    countSelect.append(option);
  }
  countSelect.addEventListener('change', () => {
    options.onPlayerCountChange(Number(countSelect.value));
  });
  countField.append(countLabel, countSelect);
  const rows = document.createElement('div');
  rows.className = 'lobby-rows';
  rows.classList.toggle('crowded', crowded);
  rows.append(...options.playerRows);
  setup.append(
    buildLobbyPreparationSection({
      id: 'crew-manifest',
      title: 'Crew manifest',
      children: [countField, rows],
    }),
    buildLobbyPreparationSection({
      id: 'battlefield-protocol',
      title: 'Battlefield protocol',
      children: [options.advanced],
    }),
  );

  const error = document.createElement('div');
  error.className = 'lobby-error';
  error.textContent = options.validationMessage ?? '';
  setup.append(error);
  customization.append(customizationSummary, setup);
  customization.addEventListener('toggle', () => {
    if (customization.dataset.invalid === 'true' && !customization.open) {
      customization.open = true;
      return;
    }
    options.onCustomizationToggle(customization.open);
  });

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'lobby-start lobby-btn primary';
  start.textContent = 'Deploy local battle';
  start.disabled = options.validationMessage !== null;
  start.addEventListener('click', options.onStart);
  wrapper.append(brief, ready);
  if (options.verifiedDeployment && options.quickOperations && options.onQuickOperation) {
    wrapper.append(buildCommanderOperations(
      options.verifiedDeployment,
      options.quickOperations,
      options.onQuickOperation,
    ));
  } else if (options.verifiedDeployment) {
    wrapper.append(buildVerifiedDeployment(options.verifiedDeployment));
  }
  wrapper.append(customization, start);

  return wrapper;
}
