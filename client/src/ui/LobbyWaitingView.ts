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
}

export function buildLobbyWaitingView(options: LobbyWaitingViewOptions): HTMLElement {
  const root = document.createElement('div');

  const humans = options.players.filter((player) => !player.ai);
  const humansReady = humans.filter((player) => player.ready).length;
  const cpuCount = options.players.length - humans.length;
  const seatsOpen = options.players.length < options.maxPlayers;
  const sub = document.createElement('p');
  sub.className = 'lobby-sub';
  sub.textContent =
    `${humansReady}/${humans.length} human${humans.length === 1 ? '' : 's'} ready`
    + (cpuCount > 0 ? ` · ${cpuCount} CPU` : '')
    + (seatsOpen ? ' · waiting for players to join' : '');
  root.append(sub);

  const codeLabel = document.createElement('p');
  codeLabel.style.cssText = 'color:var(--text-dim);font-size:13px;margin:0 0 6px;';
  codeLabel.textContent = 'Share this code:';
  root.append(codeLabel);

  const codeDisplay = document.createElement('div');
  codeDisplay.className = 'online-code-display';
  const codeChars = options.roomCode.padEnd(4, ' ').split('');
  for (const character of codeChars) {
    const charBox = document.createElement('div');
    charBox.className = 'online-code-char';
    charBox.textContent = character.trim() || ' ';
    codeDisplay.append(charBox);
  }
  root.append(codeDisplay);

  const invite = document.createElement('div');
  invite.className = 'online-invite';
  const copyInvite = document.createElement('button');
  copyInvite.type = 'button';
  copyInvite.className = 'lobby-btn online-invite-copy';
  copyInvite.textContent = 'Copy invite link';
  const inviteStatus = document.createElement('p');
  inviteStatus.className = 'online-invite-status';
  inviteStatus.setAttribute('role', 'status');
  inviteStatus.setAttribute('aria-live', 'polite');
  copyInvite.addEventListener('click', () => {
    options.onCopyInvite(copyInvite, inviteStatus);
  });
  invite.append(copyInvite, inviteStatus);
  root.append(invite);

  const listHeader = document.createElement('p');
  listHeader.style.cssText = 'color:var(--text-dim);font-size:13px;margin:0 0 8px;';
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
      tag.style.cssText = 'color:var(--tank-red,#e8554d);font-size:11px;margin-left:6px;white-space:nowrap;';
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
  root.append(playerList, options.selfEdit);

  const myClash = options.colorClash || options.nameClash;
  if (myClash) {
    const warning = document.createElement('p');
    warning.className = 'online-status error';
    const parts: string[] = [];
    if (options.colorClash) parts.push('color');
    if (options.nameClash) parts.push('name');
    warning.textContent =
      `Another player already has your ${parts.join(' and ')}. Change it above to start.`;
    root.append(warning);
  }

  root.append(options.status);

  const actions = document.createElement('div');
  actions.className = 'lobby-btn-row';

  const ready = document.createElement('button');
  ready.type = 'button';
  ready.className = 'lobby-btn';
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
  ready.addEventListener('click', options.onReady);

  const leave = document.createElement('button');
  leave.type = 'button';
  leave.className = 'lobby-btn secondary';
  leave.textContent = 'Leave';
  leave.addEventListener('click', options.onLeave);

  actions.append(ready, leave);
  root.append(actions);

  return root;
}
