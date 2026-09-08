import type { BrowseRoom } from '../client/LobbyTransport';
import {
  armsLabel,
  botLabel,
  interestLabel,
  roundsLabel,
  suddenDeathLabel,
} from './browseLabels';
import { buildOnlineRouteActions } from './LobbyOnlineRouteActions';

export interface LobbyBrowseViewOptions {
  nameColor: HTMLElement;
  garage: HTMLElement;
  status: HTMLElement;
  rooms: readonly BrowseRoom[];
  busy: boolean;
  onJoin: (code: string) => void;
  onCreate: () => void;
  onJoinByCode: () => void;
  listenerSignal?: AbortSignal;
}

export function buildLobbyBrowseView(options: LobbyBrowseViewOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lobby-operations-board lobby-operations-board--browse';

  const header = document.createElement('header');
  header.className = 'lobby-operations-board__header';
  const title = document.createElement('h2');
  title.className = 'lobby-operations-board__title';
  title.textContent = 'Open operations';
  const purpose = document.createElement('p');
  purpose.className = 'lobby-operations-board__purpose';
  purpose.textContent = 'Scan active rooms and join a crew preparing to fire.';
  header.append(title, purpose);

  const crew = document.createElement('section');
  crew.className = 'lobby-operations-board__crew';
  crew.setAttribute('aria-label', 'Commander preparation');
  crew.append(options.nameColor, options.garage, options.status);

  const operations = document.createElement('section');
  operations.className = 'lobby-operations-board__section';
  operations.setAttribute('aria-label', 'Open operations');

  const list = document.createElement('ul');
  list.className = 'online-player-list';
  if (options.rooms.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'online-player-row lobby-operations-board__empty';
    empty.textContent = 'No public rooms right now.';
    list.append(empty);
  } else {
    for (const room of options.rooms) {
      const row = document.createElement('li');
      row.className = 'online-player-row lobby-operations-board__room-row';

      const name = document.createElement('span');
      name.textContent = room.hostName || '(unnamed host)';

      const meta = document.createElement('span');
      meta.className = 'lobby-operations-board__room-meta';
      meta.textContent = [
        roundsLabel(room.rounds),
        armsLabel(room.armsLevel),
        botLabel(room.botCount),
        interestLabel(room.interestRate),
        suddenDeathLabel(room.suddenDeathTurn),
      ].filter(Boolean).join(' · ');

      const join = document.createElement('button');
      join.type = 'button';
      join.className = 'lobby-btn primary lobby-operations-board__room-join';
      const full = room.playerCount >= room.maxPlayers;
      join.textContent = `Join (${room.playerCount}/${room.maxPlayers})`;
      join.disabled = full || options.busy;
      join.addEventListener('click', () => {
        if (full) return;
        options.onJoin(room.code);
      }, { signal: options.listenerSignal });

      row.append(name, meta, join);
      list.append(row);
    }
  }
  operations.append(list);

  root.append(header, crew, operations, buildOnlineRouteActions(null, [
    { id: 'create', label: 'Create a room', onClick: options.onCreate },
    { id: 'join-code', label: 'Join with a code', onClick: options.onJoinByCode },
  ], options.listenerSignal));

  return root;
}
