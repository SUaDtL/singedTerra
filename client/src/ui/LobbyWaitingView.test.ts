import { describe, expect, it, vi } from 'vitest';
import type { NetworkPlayer } from '../client/LobbyTransport';
import { buildLobbyWaitingView, type LobbyWaitingViewOptions } from './LobbyWaitingView';

function sharedSection(name: string): HTMLElement {
  const section = document.createElement('section');
  section.dataset['sharedSection'] = name;
  return section;
}

function player(overrides: Partial<NetworkPlayer> = {}): NetworkPlayer {
  return {
    id: 'p-1',
    name: 'Alice',
    color: '#e84d4d',
    ready: false,
    ...overrides,
  };
}

function options(overrides: Partial<LobbyWaitingViewOptions> = {}): LobbyWaitingViewOptions {
  return {
    roomCode: 'WXYZ',
    players: [player()],
    maxPlayers: 2,
    busy: false,
    thisPlayerReady: false,
    clashColors: new Set(),
    clashNames: new Set(),
    colorClash: false,
    nameClash: false,
    selfEdit: sharedSection('self-edit'),
    status: sharedSection('status'),
    onCopyInvite: vi.fn(),
    onReady: vi.fn(),
    onLeave: vi.fn(),
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

describe('buildLobbyWaitingView', () => {
  it('renders readiness, room code, invite identity, and shared sections in order', () => {
    const selfEdit = sharedSection('self-edit');
    const status = sharedSection('status');
    const onCopyInvite = vi.fn();
    const root = buildLobbyWaitingView(options({
      players: [
        player(),
        player({ id: 'cpu-1', name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'medium' }),
      ],
      maxPlayers: 4,
      selfEdit,
      status,
      onCopyInvite,
    }));

    expect(root.querySelector('.lobby-sub')?.textContent)
      .toBe('0/1 human ready · 1 CPU · waiting for players to join');
    expect([...root.querySelectorAll('.online-code-char')].map((cell) => cell.textContent))
      .toEqual(['W', 'X', 'Y', 'Z']);
    expect(root.querySelector('.online-invite-status')?.getAttribute('role')).toBe('status');
    expect(root.querySelector('.online-invite-status')?.getAttribute('aria-live')).toBe('polite');
    expect([...root.children].indexOf(selfEdit)).toBeLessThan([...root.children].indexOf(status));

    const copy = button(root, 'Copy invite link');
    copy.click();
    expect(onCopyInvite).toHaveBeenCalledOnce();
    expect(onCopyInvite).toHaveBeenCalledWith(copy, root.querySelector('.online-invite-status'));
  });

  it('renders human and CPU badges plus accessible color and name clash cues', () => {
    const root = buildLobbyWaitingView(options({
      players: [
        player({ ready: true }),
        player({ id: 'cpu-1', name: ' Alice ', color: '#4d8ce8', ready: true, ai: 'hard' }),
        player({ id: 'p-2', name: 'Bob', ready: false }),
      ],
      maxPlayers: 3,
      clashColors: new Set(['#e84d4d']),
      clashNames: new Set(['alice']),
    }));

    expect(root.querySelector('.lobby-sub')?.textContent).toBe('1/2 humans ready · 1 CPU');
    expect(root.querySelector('p:nth-of-type(3)')?.textContent).toBe('Players (3/3):');
    const rows = [...root.querySelectorAll('.online-player-row')];
    expect(rows[0]?.textContent).toContain('⚠ shared color + name');
    expect(rows[0]?.querySelector('.online-player-dot')?.classList.contains('clash')).toBe(true);
    expect(rows[0]?.querySelector('.online-badge')?.textContent).toBe('Ready');
    expect(rows[1]?.textContent).toContain('⚠ shared name');
    expect(rows[1]?.querySelector('.online-badge')?.textContent).toBe('🤖 Hard');
    expect(rows[2]?.textContent).toContain('⚠ shared color');
    expect(rows[2]?.querySelector('.online-badge')?.textContent).toBe('Waiting...');
  });

  it('shows the local combined clash warning and blocks Ready while Leave still routes', () => {
    const onReady = vi.fn();
    const onLeave = vi.fn();
    const root = buildLobbyWaitingView(options({
      colorClash: true,
      nameClash: true,
      onReady,
      onLeave,
    }));

    expect(root.querySelector('.online-status.error')?.textContent)
      .toBe('Another player already has your color and name. Change it above to start.');
    const ready = button(root, 'Ready Up');
    expect(ready.disabled).toBe(true);
    ready.click();
    button(root, 'Leave').click();
    expect(onReady).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('preserves already-ready, busy, and actionable Ready button states', () => {
    const waiting = buildLobbyWaitingView(options({ thisPlayerReady: true }));
    expect(button(waiting, 'Waiting for others...').disabled).toBe(true);

    const busy = buildLobbyWaitingView(options({ busy: true }));
    expect(button(busy, 'Ready Up').disabled).toBe(true);

    const onReady = vi.fn();
    const actionable = buildLobbyWaitingView(options({ onReady }));
    const ready = button(actionable, 'Ready Up');
    expect(ready.disabled).toBe(false);
    ready.click();
    expect(onReady).toHaveBeenCalledOnce();
  });
});
