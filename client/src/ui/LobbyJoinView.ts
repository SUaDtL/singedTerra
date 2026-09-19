import { buildOnlineRouteActions } from './LobbyOnlineRouteActions';
import { createPreparationFrame, createPreparationPrimaryAction } from './PreparationFrame';

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

  const joinButton = createPreparationPrimaryAction(document, {
    label: options.busy ? 'Joining...' : 'Join Room',
    disabled: options.busy,
    busy: options.busy,
    onActivate: options.onJoin,
    className: 'lobby-online-primary',
    listenerSignal: options.listenerSignal,
  });
  const alternatives = buildOnlineRouteActions(null, [
    { id: 'create', label: 'Create a room', onClick: options.onCreate },
    { id: 'browse', label: 'Browse public rooms', onClick: options.onBrowse },
  ], options.listenerSignal);
  return createPreparationFrame(document, {
    root,
    eyebrow: 'Network operation',
    title: 'Rally to a signal',
    description: 'Enter a room code and join the operation already in motion.',
    headingClassName: 'lobby-route-brief__header',
    titleClassName: 'lobby-route-brief__title',
    descriptionClassName: 'lobby-route-brief__purpose',
    body: setup,
    dockLabel: 'Rally order',
    dockStatus: 'Join the room identified by this signal',
    primaryAction: joinButton,
    secondaryActions: alternatives,
  });
}
