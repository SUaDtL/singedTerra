import { describe, expect, it, vi } from 'vitest';
import type { BrowseRoom } from '../client/LobbyTransport';
import { buildLobbyBrowseView } from './LobbyBrowseView';

function sharedSection(name: string): HTMLElement {
  const section = document.createElement('section');
  section.dataset['sharedSection'] = name;
  return section;
}

function browseRoom(overrides: Partial<BrowseRoom> = {}): BrowseRoom {
  return {
    roomId: 'room-brow',
    code: 'BROW',
    hostName: 'Atlas',
    playerCount: 1,
    maxPlayers: 4,
    rounds: 3,
    armsLevel: 2,
    botCount: 1,
    ...overrides,
  };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === label);
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return match;
}

describe('buildLobbyBrowseView', () => {
  it('keeps shared sections ordered and routes both empty-state back actions', () => {
    const nameColor = sharedSection('name-color');
    const garage = sharedSection('garage');
    const status = sharedSection('status');
    const onCreate = vi.fn();
    const onJoinByCode = vi.fn();

    const root = buildLobbyBrowseView({
      nameColor,
      garage,
      status,
      rooms: [],
      busy: false,
      onJoin: vi.fn(),
      onCreate,
      onJoinByCode,
    });

    expect(root.querySelector('.lobby-sub')?.textContent)
      .toBe('Public rooms looking for players.');
    expect([...root.children].slice(1, 4)).toEqual([nameColor, garage, status]);
    expect(root.querySelector('.online-player-row')?.textContent)
      .toBe('No public rooms right now.');

    button(root, 'Create instead').click();
    button(root, 'Join by code').click();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onJoinByCode).toHaveBeenCalledOnce();
  });

  it('renders room metadata and routes only an available room code to Join', () => {
    const onJoin = vi.fn();
    const root = buildLobbyBrowseView({
      nameColor: sharedSection('name-color'),
      garage: sharedSection('garage'),
      status: sharedSection('status'),
      rooms: [
        browseRoom(),
        browseRoom({ roomId: 'room-full', code: 'FULL', playerCount: 4 }),
      ],
      busy: false,
      onJoin,
      onCreate: vi.fn(),
      onJoinByCode: vi.fn(),
    });

    const availableRow = root.querySelectorAll('.online-player-row')[0]!;
    expect(availableRow.textContent).toContain('Atlas');
    expect(availableRow.textContent).toContain('Best of 3');
    expect(availableRow.textContent).toContain('Arms Lv 2');
    expect(availableRow.textContent).toContain('1 CPU');

    const available = button(root, 'Join (1/4)');
    const full = button(root, 'Join (4/4)');
    expect(available.disabled).toBe(false);
    expect(full.disabled).toBe(true);
    available.click();
    full.click();
    expect(onJoin).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledWith('BROW');
  });

  it('disables an otherwise available Join action while Lobby is busy', () => {
    const onJoin = vi.fn();
    const root = buildLobbyBrowseView({
      nameColor: sharedSection('name-color'),
      garage: sharedSection('garage'),
      status: sharedSection('status'),
      rooms: [browseRoom()],
      busy: true,
      onJoin,
      onCreate: vi.fn(),
      onJoinByCode: vi.fn(),
    });

    const join = button(root, 'Join (1/4)');
    expect(join.disabled).toBe(true);
    join.click();
    expect(onJoin).not.toHaveBeenCalled();
  });
});
