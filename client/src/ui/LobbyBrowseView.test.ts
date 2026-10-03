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
    interestRate: 0.2,
    suddenDeathTurn: 15,
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
    const onRefresh = vi.fn();

    const root = buildLobbyBrowseView({
      nameColor,
      garage,
      status,
      rooms: [],
      busy: false,
      onJoin: vi.fn(),
      onRefresh,
      onCreate,
      onJoinByCode,
    });

    expect(root.classList).toContain('lobby-operations-board');
    expect(root.classList).toContain('lobby-operations-board--browse');
    expect(root.classList).toContain('preparation-frame');
    expect(root.querySelector('.lobby-operations-board__title')?.textContent).toBe('Open operations');
    expect(root.querySelector('.lobby-operations-board__purpose')?.textContent)
      .toBe('Scan active rooms and join a crew preparing to fire.');
    expect(root.querySelector('.lobby-operations-board__crew')?.getAttribute('aria-label'))
      .toBe('Commander preparation');
    expect([...root.querySelector('.lobby-operations-board__crew')!.children])
      .toEqual([nameColor, garage, status]);
    expect(root.querySelector('.lobby-operations-board__section')?.getAttribute('aria-label'))
      .toBe('Open operations');
    expect(root.querySelector('.online-player-row')?.textContent)
      .toBe('No public rooms right now.');
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Other ways to play online');
    expect(root.querySelectorAll('.lobby-btn.primary')).toHaveLength(1);
    expect(button(root, 'Refresh rooms').classList.contains('primary')).toBe(true);

    button(root, 'Refresh rooms').click();
    button(root, 'Create a room').click();
    button(root, 'Join with a code').click();
    expect(onRefresh).toHaveBeenCalledOnce();
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
      onRefresh: vi.fn(),
      onCreate: vi.fn(),
      onJoinByCode: vi.fn(),
    });

    const availableRow = root.querySelectorAll('.online-player-row')[0]!;
    expect(root.querySelector('.lobby-operations-board__section')?.getAttribute('aria-label'))
      .toBe('Open operations');
    expect(availableRow.textContent).toContain('Atlas');
    expect(availableRow.textContent).toContain('Best of 3');
    expect(availableRow.textContent).toContain('Arms Lv 2');
    expect(availableRow.textContent).toContain('1 CPU');
    expect(availableRow.textContent).toContain('Interest +20%');
    expect(availableRow.textContent).toContain('Sudden death T15');

    const available = button(root, 'Join (1/4)');
    const full = button(root, 'Join (4/4)');
    expect(available.classList.contains('secondary')).toBe(true);
    expect(full.classList.contains('secondary')).toBe(true);
    expect(root.querySelectorAll('.lobby-btn.primary')).toHaveLength(1);
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
      onRefresh: vi.fn(),
      onCreate: vi.fn(),
      onJoinByCode: vi.fn(),
    });

    const join = button(root, 'Join (1/4)');
    expect(join.disabled).toBe(true);
    join.click();
    expect(onJoin).not.toHaveBeenCalled();
  });

  // These are supplied builder states, not a pending-fetch or error-creation claim.
  it('renders the supplied loading state while busy', () => {
    const onRefresh = vi.fn();
    const root = buildLobbyBrowseView({
      nameColor: sharedSection('name-color'),
      garage: sharedSection('garage'),
      status: sharedSection('status'),
      rooms: [],
      busy: true,
      onJoin: vi.fn(),
      onRefresh,
      onCreate: vi.fn(),
      onJoinByCode: vi.fn(),
    });
    document.body.append(root);
    try {
      const refresh = button(root, 'Refreshing rooms…');
      expect(refresh.isConnected).toBe(true);
      expect(refresh.hidden).toBe(false);
      expect(refresh.disabled).toBe(true);
      expect(refresh.getAttribute('aria-busy')).toBe('true');
      expect(refresh.closest('[hidden], [aria-hidden="true"]')).toBeNull();
      refresh.click();
      expect(onRefresh).not.toHaveBeenCalled();
    } finally {
      root.remove();
    }
  });

  it('renders the supplied error node', () => {
    const status = sharedSection('status');
    status.setAttribute('role', 'alert');
    status.textContent = 'Unable to load public rooms.';
    const root = buildLobbyBrowseView({
      nameColor: sharedSection('name-color'),
      garage: sharedSection('garage'),
      status,
      rooms: [],
      busy: false,
      onJoin: vi.fn(),
      onRefresh: vi.fn(),
      onCreate: vi.fn(),
      onJoinByCode: vi.fn(),
    });
    document.body.append(root);
    try {
      expect(root.querySelector('[role="alert"]')).toBe(status);
      expect(status.isConnected).toBe(true);
      expect(status.hidden).toBe(false);
      expect(status.closest('[hidden], [aria-hidden="true"]')).toBeNull();
      expect(status.textContent).toBe('Unable to load public rooms.');
      expect(root.querySelector('.lobby-operations-board__crew')?.contains(status)).toBe(true);
      expect(button(root, 'Refresh rooms').disabled).toBe(false);
    } finally {
      root.remove();
    }
  });
});
