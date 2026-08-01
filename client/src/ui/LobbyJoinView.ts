export interface LobbyJoinViewOptions {
  code: string;
  busy: boolean;
  nameColor: HTMLElement;
  garage: HTMLElement;
  status: HTMLElement;
  onCodeInput: (value: string) => string;
  onJoin: () => void;
  onCreate: () => void;
  onBrowse: () => void;
}

export function buildLobbyJoinView(options: LobbyJoinViewOptions): HTMLElement {
  const root = document.createElement('div');

  const sub = document.createElement('p');
  sub.className = 'lobby-sub';
  sub.textContent = 'Enter the 4-character room code to join.';
  root.append(sub);

  const codeField = document.createElement('div');
  codeField.className = 'lobby-field';
  const codeLabel = document.createElement('label');
  codeLabel.textContent = 'Room code';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.className = 'lobby-code-input';
  codeInput.maxLength = 4;
  codeInput.value = options.code;
  codeInput.placeholder = 'XXXX';
  codeInput.addEventListener('input', () => {
    codeInput.value = options.onCodeInput(codeInput.value);
  });
  codeField.append(codeLabel, codeInput);
  root.append(codeField, options.nameColor, options.garage, options.status);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'lobby-btn-row';

  const joinButton = document.createElement('button');
  joinButton.type = 'button';
  joinButton.className = 'lobby-btn';
  joinButton.textContent = options.busy ? 'Joining...' : 'Join Room';
  joinButton.disabled = options.busy;
  joinButton.addEventListener('click', options.onJoin);

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'lobby-btn secondary';
  createButton.textContent = 'Create instead';
  createButton.addEventListener('click', options.onCreate);

  const browseButton = document.createElement('button');
  browseButton.type = 'button';
  browseButton.className = 'lobby-btn secondary';
  browseButton.textContent = 'Browse public rooms';
  browseButton.addEventListener('click', options.onBrowse);

  buttonRow.append(joinButton, createButton, browseButton);
  root.append(buttonRow);
  return root;
}
