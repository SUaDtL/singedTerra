import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from './Lobby';

interface LobbyInternals {
  surface: 'chooser' | 'preparation';
  activeTab: string;
  onlineSubView: string;
  waitingRoomCode: string;
  waitingRoomId: string;
  waitingPlayerId: string;
  waitingPlayers: unknown[];
  waitingOptions: { maxPlayers: number; maxWind: number; gravity: number };
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Lobby shareable room invites', () => {
  let root: HTMLDivElement;
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
    root = document.createElement('div');
    root.id = 'lobby';
    document.body.append(root);
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
    root.remove();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
    vi.restoreAllMocks();
  });

  it('routes a valid invite to Online / Join Room with the code prefilled', () => {
    history.replaceState(null, '', '/singedTerra/?join=ab12');
    const lobby = new Lobby(root, vi.fn());

    lobby.show();

    expect(root.querySelector('.lobby-deployment-chooser')).toBeNull();
    expect(root.querySelector('.lobby-mode-context h2')?.textContent).toBe('Play Online');
    expect(root.querySelector<HTMLInputElement>('.lobby-code-input')?.value).toBe('AB12');
    expect(internals(lobby).onlineSubView).toBe('join');
  });

  it('ignores malformed invite parameters and keeps the normal landing view', () => {
    for (const query of [
      '?join=ABC',
      '?join=ABCDE',
      '?join=AB-12',
      '?join=',
      '?join=AB12&join=CD34',
    ]) {
      history.replaceState(null, '', `/singedTerra/${query}`);
      const lobby = new Lobby(root, vi.fn());
      lobby.show();
      expect(root.querySelectorAll('.lobby-deployment-chooser button')).toHaveLength(3);
      expect(root.querySelector('.lobby-mode-context')).toBeNull();
      expect(root.querySelector('.lobby-code-input')).toBeNull();
    }
  });

  it('copies the exact path-safe invite and announces success', async () => {
    history.replaceState(null, '', '/singedTerra/?e2e=hotseat#stale');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const lobby = new Lobby(root, vi.fn());
    Object.assign(internals(lobby), {
      surface: 'preparation',
      activeTab: 'online',
      onlineSubView: 'waiting',
      waitingRoomCode: 'ABCD',
      waitingRoomId: 'room-1',
      waitingPlayerId: 'p-1',
      waitingPlayers: [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false }],
      waitingOptions: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
    });

    lobby.show();
    root.querySelector<HTMLButtonElement>('.online-invite-copy')!.click();
    await flush();

    expect(writeText).toHaveBeenCalledWith(
      `${location.origin}/singedTerra/?join=ABCD`,
    );
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Invite copied');
    expect(root.querySelector('.online-invite-copy')?.textContent).toContain('Copy invite link');
  });

  it('surfaces clipboard rejection without claiming success', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const lobby = new Lobby(root, vi.fn());
    Object.assign(internals(lobby), {
      surface: 'preparation',
      activeTab: 'online',
      onlineSubView: 'waiting',
      waitingRoomCode: 'WXYZ',
      waitingRoomId: 'room-1',
      waitingPlayerId: 'p-1',
      waitingPlayers: [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false }],
      waitingOptions: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
    });

    lobby.show();
    root.querySelector<HTMLButtonElement>('.online-invite-copy')!.click();
    await flush();

    expect(root.querySelector('[role="alert"]')?.textContent)
      .toBe('Could not copy invite link. Share code WXYZ instead.');
    expect(root.querySelector('.online-invite-copy')?.textContent).toContain('Copy invite link');

    writeText.mockResolvedValueOnce(undefined);
    root.querySelector<HTMLButtonElement>('.online-invite-copy')!.click();
    await flush();
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Invite copied');
    expect(root.querySelector('.online-invite-status')?.classList.contains('error')).toBe(false);
  });

  it.each([
    ['missing clipboard', undefined, 'ABCD'],
    ['missing writeText', {}, 'ABCD'],
    ['invalid waiting code', { writeText: vi.fn() }, 'ABC'],
  ])('handles %s as a recoverable copy failure', async (_label, clipboard, code) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });
    const lobby = new Lobby(root, vi.fn());
    Object.assign(internals(lobby), {
      surface: 'preparation',
      activeTab: 'online',
      onlineSubView: 'waiting',
      waitingRoomCode: code,
      waitingRoomId: 'room-1',
      waitingPlayerId: 'p-1',
      waitingPlayers: [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false }],
      waitingOptions: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
    });
    lobby.show();

    root.querySelector<HTMLButtonElement>('.online-invite-copy')!.click();
    await flush();

    expect(root.querySelector('[role="alert"]')?.textContent)
      .toBe(`Could not copy invite link. Share code ${code} instead.`);
    expect(root.querySelector('[role="status"]')).toBeNull();
    const maybeWrite = (clipboard as { writeText?: ReturnType<typeof vi.fn> } | undefined)
      ?.writeText;
    if (maybeWrite) expect(maybeWrite).not.toHaveBeenCalled();
  });
});
