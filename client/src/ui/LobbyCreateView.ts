import type { AiDifficulty } from '@shared/types/GameState';
import { buildOnlineRouteActions } from './LobbyOnlineRouteActions';
import { buildLobbyPreparationSection } from './LobbyPreparationSection';

export interface LobbyCreateViewOptions {
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  botCount: number;
  botDifficulty: AiDifficulty;
  visibility: 'public' | 'private';
  busy: boolean;
  nameColor: HTMLElement;
  garage: HTMLElement;
  advancedFields: readonly HTMLElement[];
  status: HTMLElement;
  onPlayerCountChange: (count: number) => void;
  onBotCountChange: (count: number) => void;
  onBotDifficultyChange: (difficulty: AiDifficulty) => void;
  onVisibilityChange: (visibility: 'public' | 'private') => void;
  onCreate: () => void;
  onJoin: () => void;
  onBrowse: () => void;
}

export function buildLobbyCreateView(options: LobbyCreateViewOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lobby-route-brief lobby-route-brief--online';

  const brief = document.createElement('header');
  brief.className = 'lobby-route-brief__header';
  const title = document.createElement('h2');
  title.className = 'lobby-route-brief__title';
  title.textContent = 'Open operation';
  const purpose = document.createElement('p');
  purpose.className = 'lobby-route-brief__purpose';
  purpose.textContent = 'Set the battlefield, then issue a room code to your crew.';
  brief.append(title, purpose);

  const setup = document.createElement('section');
  setup.className = 'lobby-route-brief__setup';
  setup.setAttribute('aria-label', 'Open operation setup');

  const playerField = document.createElement('div');
  playerField.className = 'lobby-field';
  const playerLabel = document.createElement('label');
  playerLabel.textContent = 'Players';
  const playerSelect = document.createElement('select');
  for (let count = options.minPlayers; count <= options.maxPlayers; count += 1) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    if (count === options.playerCount) option.selected = true;
    playerSelect.append(option);
  }
  playerSelect.addEventListener('change', () => {
    options.onPlayerCountChange(Number(playerSelect.value));
  });
  playerField.append(playerLabel, playerSelect);
  const botField = document.createElement('div');
  botField.className = 'lobby-field';
  const botLabel = document.createElement('label');
  botLabel.textContent = 'CPU opponents';
  const botSelect = document.createElement('select');
  for (let count = 0; count <= options.playerCount - 1; count += 1) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    if (count === options.botCount) option.selected = true;
    botSelect.append(option);
  }
  botSelect.addEventListener('change', () => {
    options.onBotCountChange(Number(botSelect.value));
  });
  botField.append(botLabel, botSelect);
  if (options.botCount > 0) {
    const difficultySelect = document.createElement('select');
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const option = document.createElement('option');
      option.value = difficulty;
      option.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
      if (difficulty === options.botDifficulty) option.selected = true;
      difficultySelect.append(option);
    }
    difficultySelect.addEventListener('change', () => {
      options.onBotDifficultyChange(difficultySelect.value as AiDifficulty);
    });
    botField.append(difficultySelect);
  }
  const visibilityField = document.createElement('div');
  visibilityField.className = 'lobby-field';
  const visibilityLabel = document.createElement('label');
  visibilityLabel.textContent = 'Visibility';
  const visibilitySelect = document.createElement('select');
  for (const visibility of ['public', 'private'] as const) {
    const option = document.createElement('option');
    option.value = visibility;
    option.textContent = visibility === 'public' ? 'Public' : 'Private';
    if (visibility === options.visibility) option.selected = true;
    visibilitySelect.append(option);
  }
  visibilitySelect.addEventListener('change', () => {
    options.onVisibilityChange(visibilitySelect.value as 'public' | 'private');
  });
  visibilityField.append(visibilityLabel, visibilitySelect);
  const advanced = document.createElement('details');
  advanced.className = 'lobby-advanced';
  const summary = document.createElement('summary');
  summary.textContent = 'Advanced settings';
  advanced.append(summary, ...options.advancedFields);
  setup.append(
    buildLobbyPreparationSection({
      id: 'command-vehicle',
      title: 'Command vehicle',
      children: [options.nameColor, options.garage],
    }),
    buildLobbyPreparationSection({
      id: 'operation-profile',
      title: 'Operation profile',
      children: [playerField, botField, visibilityField],
    }),
    buildLobbyPreparationSection({
      id: 'battlefield-protocol',
      title: 'Battlefield protocol',
      children: [advanced, options.status],
    }),
  );

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'lobby-btn primary';
  createButton.textContent = options.busy ? 'Creating...' : 'Create operation';
  createButton.disabled = options.busy;
  createButton.addEventListener('click', options.onCreate);

  root.append(brief, setup, buildOnlineRouteActions(createButton, [
    { id: 'join-code', label: 'Join with a code', onClick: options.onJoin },
    { id: 'browse', label: 'Browse public rooms', onClick: options.onBrowse },
  ]));
  return root;
}
