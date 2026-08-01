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
  wrapper.className = `lobby-hotseat${crowded ? ' crowded' : ''}`;

  const sub = document.createElement('p');
  sub.className = 'lobby-sub';
  sub.textContent =
    `Hot-seat setup — choose ${options.minPlayers}-${options.maxPlayers} players, name them, pick a color.`;
  wrapper.append(sub);

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
  wrapper.append(countField);

  const rows = document.createElement('div');
  rows.className = 'lobby-rows';
  rows.classList.toggle('crowded', crowded);
  rows.append(...options.playerRows);
  wrapper.append(rows, options.advanced);

  const error = document.createElement('div');
  error.className = 'lobby-error';
  error.textContent = options.validationMessage ?? '';
  wrapper.append(error);

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'lobby-start';
  start.textContent = 'Start Game';
  start.disabled = options.validationMessage !== null;
  start.addEventListener('click', options.onStart);
  wrapper.append(start);

  return wrapper;
}
