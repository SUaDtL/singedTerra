export interface LobbyHotSeatViewOptions {
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  playerRows: readonly HTMLElement[];
  advanced: HTMLElement;
  customizationOpen: boolean;
  validationMessage: string | null;
  onPlayerCountChange: (count: number) => void;
  onCustomizationToggle: (open: boolean) => void;
  onStart: () => void;
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
  wrapper.append(brief, ready, customization, start);

  return wrapper;
}
import { buildLobbyPreparationSection } from './LobbyPreparationSection';
