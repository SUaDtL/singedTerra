import type { BrowseRoom } from '../client/LobbyTransport';
import {
  armsLabel,
  botLabel,
  interestLabel,
  roundsLabel,
  suddenDeathLabel,
} from './browseLabels';

export interface LobbyBrowseViewOptions {
  nameColor: HTMLElement;
  garage: HTMLElement;
  status: HTMLElement;
  rooms: readonly BrowseRoom[];
  busy: boolean;
  onJoin: (code: string) => void;
  onCreate: () => void;
  onJoinByCode: () => void;
}

export function buildLobbyBrowseView(options: LobbyBrowseViewOptions): HTMLElement {
  const root = document.createElement('div');

  const sub = document.createElement('p');
  sub.className = 'lobby-sub';
  sub.textContent = 'Public rooms looking for players.';
  root.append(sub, options.nameColor, options.garage, options.status);

  const list = document.createElement('ul');
  list.className = 'online-player-list';
  if (options.rooms.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'online-player-row';
    empty.style.cssText = 'color:var(--text-dim);';
    empty.textContent = 'No public rooms right now.';
    list.append(empty);
  } else {
    for (const room of options.rooms) {
      const row = document.createElement('li');
      row.className = 'online-player-row';

      const name = document.createElement('span');
      name.textContent = room.hostName || '(unnamed host)';

      const meta = document.createElement('span');
      meta.style.cssText = 'margin-left:8px;color:var(--text-dim);font-size:12px;';
      meta.textContent = [
        roundsLabel(room.rounds),
        armsLabel(room.armsLevel),
        botLabel(room.botCount),
        interestLabel(room.interestRate),
        suddenDeathLabel(room.suddenDeathTurn),
      ].filter(Boolean).join(' · ');

      const join = document.createElement('button');
      join.type = 'button';
      join.className = 'lobby-btn';
      join.style.cssText = 'margin-left:auto;padding:4px 12px;font-size:13px;';
      const full = room.playerCount >= room.maxPlayers;
      join.textContent = `Join (${room.playerCount}/${room.maxPlayers})`;
      join.disabled = full || options.busy;
      join.addEventListener('click', () => {
        if (full) return;
        options.onJoin(room.code);
      });

      row.append(name, meta, join);
      list.append(row);
    }
  }
  root.append(list);

  const actions = document.createElement('div');
  actions.className = 'lobby-btn-row';

  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'lobby-btn secondary';
  create.textContent = 'Create instead';
  create.addEventListener('click', options.onCreate);

  const joinByCode = document.createElement('button');
  joinByCode.type = 'button';
  joinByCode.className = 'lobby-btn secondary';
  joinByCode.textContent = 'Join by code';
  joinByCode.addEventListener('click', options.onJoinByCode);

  actions.append(create, joinByCode);
  root.append(actions);

  return root;
}
