export interface LobbyHotSeatViewOptions {
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  playerRows: readonly HTMLElement[];
  advanced: HTMLElement;
  validationMessage: string | null;
  onPlayerCountChange: (count: number) => void;
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

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'lobby-start lobby-btn primary';
  start.textContent = 'Deploy local battle';
  start.disabled = options.validationMessage !== null;
  start.addEventListener('click', options.onStart);
  wrapper.append(brief, setup, start);

  return wrapper;
}
import { buildLobbyPreparationSection } from './LobbyPreparationSection';
