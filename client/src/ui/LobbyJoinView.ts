import { buildOnlineRouteActions } from './LobbyOnlineRouteActions';

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
  listenerSignal?: AbortSignal;
}

export function buildLobbyJoinView(options: LobbyJoinViewOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lobby-route-brief lobby-route-brief--online';

  const brief = document.createElement('header');
  brief.className = 'lobby-route-brief__header';
  const title = document.createElement('h2');
  title.className = 'lobby-route-brief__title';
  title.textContent = 'Rally to a signal';
  const purpose = document.createElement('p');
  purpose.className = 'lobby-route-brief__purpose';
  purpose.textContent = 'Enter a room code and join the operation already in motion.';
  brief.append(title, purpose);

  const setup = document.createElement('section');
  setup.className = 'lobby-route-brief__setup';
  setup.setAttribute('aria-label', 'Rally setup');

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
  }, { signal: options.listenerSignal });
  codeField.append(codeLabel, codeInput);
  setup.append(codeField, options.nameColor, options.garage, options.status);

  const joinButton = document.createElement('button');
  joinButton.type = 'button';
  joinButton.className = 'lobby-btn primary';
  joinButton.textContent = options.busy ? 'Joining...' : 'Join Room';
  joinButton.disabled = options.busy;
  joinButton.addEventListener('click', options.onJoin, { signal: options.listenerSignal });

  root.append(brief, setup, buildOnlineRouteActions(joinButton, [
    { id: 'create', label: 'Create a room', onClick: options.onCreate },
    { id: 'browse', label: 'Browse public rooms', onClick: options.onBrowse },
  ], options.listenerSignal));
  return root;
}
