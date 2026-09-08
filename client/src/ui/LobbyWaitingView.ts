import type { NetworkPlayer } from '../client/LobbyTransport';

export interface LobbyWaitingViewOptions {
  roomCode: string;
  players: readonly NetworkPlayer[];
  maxPlayers: number;
  busy: boolean;
  thisPlayerReady: boolean;
  clashColors: ReadonlySet<string>;
  clashNames: ReadonlySet<string>;
  colorClash: boolean;
  nameClash: boolean;
  selfEdit: HTMLElement;
  status: HTMLElement;
  onCopyInvite: (button: HTMLButtonElement, status: HTMLElement) => void;
  onReady: () => void;
  onLeave: () => void;
  listenerSignal?: AbortSignal;
}

export function buildLobbyWaitingView(options: LobbyWaitingViewOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lobby-operations-board lobby-operations-board--waiting';

  const header = document.createElement('header');
  header.className = 'lobby-operations-board__header';
  const title = document.createElement('h2');
  title.className = 'lobby-operations-board__title';
  title.textContent = 'Staging operation';
  const purpose = document.createElement('p');
  purpose.className = 'lobby-operations-board__purpose';
  purpose.textContent = 'Confirm the crew, share the signal, and ready the battery.';
  header.append(title, purpose);

  const humans = options.players.filter((player) => !player.ai);
  const humansReady = humans.filter((player) => player.ready).length;
  const cpuCount = options.players.length - humans.length;
  const seatsOpen = options.players.length < options.maxPlayers;
  const roster = document.createElement('section');
  roster.className = 'lobby-operations-board__roster';
  roster.setAttribute('aria-label', 'Operation roster');
  const readiness = document.createElement('p');
  readiness.className = 'lobby-operations-board__readiness';
  readiness.textContent =
    `${humansReady}/${humans.length} human${humans.length === 1 ? '' : 's'} ready`
    + (cpuCount > 0 ? ` · ${cpuCount} CPU` : '')
    + (seatsOpen ? ' · waiting for players to join' : '');
  const mission = document.createElement('section');
  mission.className = 'lobby-operations-board__mission';
  mission.setAttribute('aria-label', 'Room access');

  const codeLabel = document.createElement('p');
  codeLabel.className = 'lobby-operations-board__section-label';
  codeLabel.textContent = 'Share this code:';

  const codeDisplay = document.createElement('div');
  codeDisplay.className = 'online-code-display';
  const codeChars = options.roomCode.padEnd(4, ' ').split('');
  for (const character of codeChars) {
    const charBox = document.createElement('div');
    charBox.className = 'online-code-char';
    charBox.textContent = character.trim() || ' ';
    codeDisplay.append(charBox);
  }

  const invite = document.createElement('div');
  invite.className = 'online-invite';
  const copyInvite = document.createElement('button');
  copyInvite.type = 'button';
  copyInvite.className = 'lobby-btn secondary online-invite-copy';
  copyInvite.textContent = 'Copy invite link';
  const inviteStatus = document.createElement('p');
  inviteStatus.className = 'online-invite-status';
  inviteStatus.setAttribute('role', 'status');
  inviteStatus.setAttribute('aria-live', 'polite');
  copyInvite.addEventListener('click', () => {
    options.onCopyInvite(copyInvite, inviteStatus);
  }, { signal: options.listenerSignal });
  invite.append(copyInvite, inviteStatus);
  mission.append(codeLabel, codeDisplay, invite);

  const listHeader = document.createElement('p');
  listHeader.className = 'lobby-operations-board__roster-label';
  listHeader.textContent = `Players (${options.players.length}/${options.maxPlayers}):`;
  root.append(listHeader);

  const playerList = document.createElement('ul');
  playerList.className = 'online-player-list';
  for (const player of options.players) {
    const row = document.createElement('li');
    row.className = 'online-player-row';

    const dot = document.createElement('div');
    dot.className = 'online-player-dot' + (options.clashColors.has(player.color) ? ' clash' : '');
    dot.style.background = player.color;

    const name = document.createElement('span');
    name.textContent = player.name;

    const sharesColor = options.clashColors.has(player.color);
    const sharesName = options.clashNames.has(player.name.trim().toLowerCase());
    if (sharesColor || sharesName) {
      const tag = document.createElement('span');
      tag.className = 'online-clash-tag';
      const shared = sharesColor && sharesName ? 'color + name' : sharesColor ? 'color' : 'name';
      tag.textContent = `⚠ shared ${shared}`;
      name.append(tag);
    }

    const badge = document.createElement('span');
    if (player.ai) {
      const difficulty = player.ai.charAt(0).toUpperCase() + player.ai.slice(1);
      badge.className = 'online-badge ready';
      badge.textContent = `🤖 ${difficulty}`;
    } else {
      badge.className = 'online-badge ' + (player.ready ? 'ready' : 'waiting');
      badge.textContent = player.ready ? 'Ready' : 'Waiting...';
    }

    row.append(dot, name, badge);
    playerList.append(row);
  }
  roster.append(readiness, listHeader, playerList, options.selfEdit);

  const myClash = options.colorClash || options.nameClash;
  if (myClash) {
    const warning = document.createElement('p');
    warning.className = 'online-status error';
    const parts: string[] = [];
    if (options.colorClash) parts.push('color');
    if (options.nameClash) parts.push('name');
    warning.textContent =
      `Another player already has your ${parts.join(' and ')}. Change it above to start.`;
    roster.append(warning);
  }

  roster.append(options.status);

  const actions = document.createElement('div');
  actions.className = 'lobby-operations-board__actions lobby-btn-row';

  const ready = document.createElement('button');
  ready.type = 'button';
  ready.className = 'lobby-btn primary';
  if (options.thisPlayerReady) {
    ready.textContent = 'Waiting for others...';
    ready.disabled = true;
  } else if (myClash) {
    ready.textContent = 'Ready Up';
    ready.disabled = true;
  } else {
    ready.textContent = 'Ready Up';
    ready.disabled = options.busy;
  }
  ready.addEventListener('click', options.onReady, { signal: options.listenerSignal });

  const leave = document.createElement('button');
  leave.type = 'button';
  leave.className = 'lobby-btn secondary';
  leave.textContent = 'Leave';
  leave.addEventListener('click', options.onLeave, { signal: options.listenerSignal });

  actions.append(ready, leave);
  root.append(header, mission, roster, actions);

  return root;
}
