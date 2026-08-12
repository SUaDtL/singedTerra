export interface LobbyHotSeatViewOptions {
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  playerRows: readonly HTMLElement[];
  advanced: HTMLElement;
  customizationOpen: boolean;
  validationMessage: string | null;
  verifiedDeployment: LobbyHotSeatVerifiedDeploymentOptions | null;
  onPlayerCountChange: (count: number) => void;
  onCustomizationToggle: (open: boolean) => void;
  onStart: () => void;
}

export interface LobbyHotSeatVerifiedDeploymentOptions {
  action: 'start' | 'resume';
  commanderName: string;
  busy: boolean;
  message: string | null;
  abandonIntent: boolean;
  onLaunch: () => void;
  onRequestAbandon: () => void;
  onConfirmAbandon: () => void;
  onCancelAbandon: () => void;
}

function buildVerifiedDeployment(
  options: LobbyHotSeatVerifiedDeploymentOptions,
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

  verified.append(title, matchup, rules, message, actions);
  return verified;
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
  if (options.verifiedDeployment) {
    wrapper.append(buildVerifiedDeployment(options.verifiedDeployment));
  }
  wrapper.append(customization, start);

  return wrapper;
}
import { buildLobbyPreparationSection } from './LobbyPreparationSection';
