import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TankLoadout } from '@shared/types/TankLoadout';
import { Lobby, type LobbyConfig } from '../Lobby';
import {
  createMultiplayerCommandCategoryContribution,
  type MultiplayerCommandContext,
} from './MultiplayerCommandView';
import { resolveCommandRegistry } from './registry';
import { readSession, writeSession } from '../../lib/sessionDescriptor';

const TEST_SESSION_VALUE = 'test-session-value';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function selectLocalBattle(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>(
    '[data-command-surface="rail"][data-command-category="multiplayer"]',
  )!.click();
  root.querySelector<HTMLButtonElement>('[data-command-item="local-battle"]')!.click();
}

function selectOnline(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>(
    '[data-command-surface="rail"][data-command-category="multiplayer"]',
  )!.click();
  root.querySelector<HTMLButtonElement>('[data-command-item="online"]')!.click();
}

describe('Multiplayer Local Battle command contribution', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    root = document.createElement('div');
    root.id = 'lobby';
    document.body.append(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    document.head.querySelector('#lobby-style')?.remove();
    vi.restoreAllMocks();
  });

  it('mounts the existing Local setup as the selected Multiplayer workspace without nested modes', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectLocalBattle(root);

    const workspace = root.querySelector<HTMLElement>('[data-multiplayer-command-view="local-battle"]');
    expect(workspace).not.toBeNull();
    expect(workspace?.querySelector('[aria-labelledby="crew-manifest-heading"]')).not.toBeNull();
    expect(workspace?.querySelector('[aria-labelledby="battlefield-protocol-heading"]')).not.toBeNull();
    expect(workspace?.querySelectorAll('.lobby-row')).toHaveLength(2);
    expect(workspace?.querySelectorAll('.lobby-garage')).toHaveLength(2);
    expect(workspace?.querySelector('.lobby-preview__spotlight')).not.toBeNull();
    expect(workspace?.querySelectorAll('.lobby-start')).toHaveLength(1);
    expect(workspace?.querySelector('[aria-label="Hot Seat modes"]')).toBeNull();
    expect(workspace?.querySelector('[data-operation-lane="practice"]')).toBeNull();
    expect(workspace?.querySelector('.lobby-verified-deployment')).toBeNull();
    expect(workspace?.textContent).not.toContain('Practice vs CPU');
    expect(workspace?.textContent).not.toContain('Verified Deployment');
    expect(root.querySelector('.command-center')).not.toBeNull();
  });

  it('assembles selected vehicle, crew, effective rules, and Deploy under one Local context', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectLocalBattle(root);

    const workspace = root.querySelector<HTMLElement>(
      '[data-multiplayer-command-view="local-battle"]',
    )!;
    const preparation = workspace.querySelector<HTMLElement>('[data-local-preparation]');
    expect(preparation).not.toBeNull();
    expect(preparation?.contains(workspace.querySelector('.lobby-preview')!)).toBe(true);
    expect(preparation?.querySelector('[aria-labelledby="crew-manifest-heading"]')).not.toBeNull();

    const effectiveRules = preparation?.querySelector<HTMLElement>(
      '[aria-labelledby="battlefield-protocol-heading"]',
    );
    expect(effectiveRules?.querySelector('#battlefield-protocol-heading')?.textContent)
      .toBe('Effective rules');
    const rounds = effectiveRules?.querySelector<HTMLInputElement>('input[aria-label="Rounds"]');
    const wind = effectiveRules?.querySelector<HTMLInputElement>('input[aria-label="Wind"]');
    const walls = effectiveRules?.querySelector<HTMLSelectElement>('#lobby-hotseat-direct-walls');
    expect(rounds?.value || rounds?.placeholder).toBe('1');
    expect(wind?.value || wind?.placeholder).toBe('10');
    expect(walls?.selectedOptions[0]?.textContent).toContain('Open');

    const deployActions = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.textContent?.startsWith('Deploy'));
    expect(deployActions).toHaveLength(1);
    expect(deployActions[0]?.textContent).toBe('Deploy local battle');
  });

  it('uses the existing validation and sole match-start owner without payload drift', () => {
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(root, onReady);
    lobby.show();
    selectLocalBattle(root);

    const playerOneName = root.querySelector<HTMLInputElement>(
      '[aria-label="Player 1 name"]',
    )!;
    playerOneName.value = '';
    playerOneName.dispatchEvent(new Event('input', { bubbles: true }));
    const start = root.querySelector<HTMLButtonElement>('.lobby-start')!;
    expect(root.querySelector('.lobby-error')?.textContent).toBe('Every player needs a name.');
    expect(start.disabled).toBe(true);
    start.click();
    expect(onReady).not.toHaveBeenCalled();

    playerOneName.value = 'Dust Fox';
    playerOneName.dispatchEvent(new Event('input', { bubbles: true }));
    expect(start.disabled).toBe(false);
    start.click();

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0]![0]).toEqual({
      mode: 'hotseat',
      players: [
        {
          name: 'Dust Fox',
          color: '#e84d4d',
          loadout: {
            treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry',
          },
        },
        {
          name: 'Player 2',
          color: '#4d8ce8',
          loadout: {
            treads: 'ranger', hull: 'ranger', turret: 'ranger', barrel: 'ranger',
          },
        },
      ],
      playerNames: ['Dust Fox', 'Player 2'],
    });
  });

  it('mounts the existing Online routes directly without an intermediate launch bridge', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectOnline(root);

    const workspace = root.querySelector<HTMLElement>(
      '[data-multiplayer-command-view="online"]',
    );
    expect(workspace).not.toBeNull();
    expect(workspace?.querySelector('.lobby-route-brief--online')).not.toBeNull();
    expect(workspace?.querySelector('.lobby-name')).not.toBeNull();
    expect(workspace?.querySelector('.lobby-garage[data-owner="online-player"]')).not.toBeNull();
    expect([...workspace!.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'Create operation',
    );
    expect(workspace?.textContent).not.toContain('Play Online');
    expect(root.querySelector('.command-center')).not.toBeNull();
    expect(root.querySelector('.lobby-mode-panel')).toBeNull();
  });

  it('releases detached Online route listeners when command navigation replaces the workspace', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectOnline(root);

    const staleName = root.querySelector<HTMLInputElement>(
      '[data-multiplayer-command-view="online"] .lobby-name',
    );
    const staleJoin = [...root.querySelectorAll<HTMLButtonElement>(
      '[data-multiplayer-command-view="online"] button',
    )].find((button) => button.textContent === 'Join with a code');
    expect(staleName).not.toBeNull();
    expect(staleJoin).not.toBeUndefined();

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    expect(staleName?.isConnected).toBe(false);

    staleName!.value = 'Detached Ranger';
    staleName!.dispatchEvent(new Event('input', { bubbles: true }));
    staleJoin!.click();

    const internal = lobby as unknown as { onlineName: string; onlineSubView: string };
    expect(internal.onlineName).toBe('');
    expect(internal.onlineSubView).toBe('create');
    expect(root.querySelector('[data-skirmish-command-view]')).not.toBeNull();
  });

  it('retires detached Online Garage mutation and close callbacks with the workspace', () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectOnline(root);

    root.querySelector<HTMLButtonElement>(
      '.lobby-garage[data-owner="online-player"] .lobby-garage__open',
    )!.click();
    const staleEditor = root.querySelector<HTMLElement>(
      '.lobby-garage[role="dialog"][data-owner="online-player"]',
    )!;
    const staleVariant = staleEditor.querySelector<HTMLButtonElement>(
      '[data-slot="turret"][data-variant="bulwark"]',
    )!;
    const staleDone = staleEditor.querySelector<HTMLButtonElement>('.lobby-garage__close')!;

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    expect(staleEditor.isConnected).toBe(false);

    staleVariant.click();
    staleDone.click();
    staleEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const internal = lobby as unknown as { onlineLoadout: TankLoadout };
    expect(internal.onlineLoadout).toEqual({
      treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry',
    });
    expect(root.querySelector('[data-skirmish-command-view]')).not.toBeNull();
  });

  it('rejects a late Online admission after command navigation retires its workspace', async () => {
    const lobby = new Lobby(root, vi.fn());
    const internal = lobby as unknown as {
      transport: {
        createRoom: ReturnType<typeof vi.fn>;
        leaveRoom: ReturnType<typeof vi.fn>;
      };
      onlineSubView: string;
    };
    let resolveAdmission!: (value: unknown) => void;
    const admission = new Promise((resolve) => { resolveAdmission = resolve; });
    vi.spyOn(internal.transport, 'createRoom').mockReturnValue(admission as never);
    const release = vi.spyOn(internal.transport, 'leaveRoom').mockResolvedValue({
      ok: true, status: 200, data: {},
    });

    lobby.show();
    selectOnline(root);
    const name = root.querySelector<HTMLInputElement>(
      '[data-multiplayer-command-view="online"] .lobby-name',
    )!;
    name.value = 'Ranger';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    [...root.querySelectorAll<HTMLButtonElement>(
      '[data-multiplayer-command-view="online"] button',
    )].find((button) => button.textContent === 'Create operation')!.click();
    expect(internal.transport.createRoom).toHaveBeenCalledOnce();

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    await Promise.resolve();
    resolveAdmission({
      ok: true,
      status: 200,
      data: {
        roomId: 'late-room',
        code: 'LATE',
        playerId: 'late-player',
        token: TEST_SESSION_VALUE,
        options: {
          maxPlayers: 2,
          maxWind: 10,
          gravity: 0.15,
          rulesetVersion: 4,
          commandProtocolVersion: 2,
        },
        players: [{
          id: 'late-player', name: 'Ranger', color: '#e84d4d', ready: false,
        }],
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(internal.onlineSubView).toBe('create');
    expect(readSession()).toBeNull();
    expect(localStorage.getItem('singedterra:seat:late-player')).toBeNull();
    expect(release).toHaveBeenCalledWith({
      roomId: 'late-room', playerId: 'late-player', token: TEST_SESSION_VALUE,
    });
    expect(root.querySelector('[data-skirmish-command-view]')).not.toBeNull();
  });

  it('rejects a late Join admission after command navigation retires its workspace', async () => {
    const lobby = new Lobby(root, vi.fn());
    const admission = deferred<unknown>();
    const internal = lobby as unknown as {
      transport: {
        joinRoom: ReturnType<typeof vi.fn>;
        leaveRoom: ReturnType<typeof vi.fn>;
      };
      session: { subscribeWaitingRoom: ReturnType<typeof vi.fn> };
      render: ReturnType<typeof vi.fn>;
      onlineSubView: string;
    };
    vi.spyOn(internal.transport, 'joinRoom').mockReturnValue(admission.promise as never);
    const release = vi.spyOn(internal.transport, 'leaveRoom').mockResolvedValue({
      ok: true, status: 200, data: {},
    });
    const subscribe = vi.spyOn(internal.session, 'subscribeWaitingRoom');
    const render = vi.spyOn(internal, 'render');

    lobby.show();
    selectOnline(root);
    [...root.querySelectorAll<HTMLButtonElement>(
      '[data-multiplayer-command-view="online"] button',
    )].find((button) => button.textContent === 'Join with a code')!.click();
    const name = root.querySelector<HTMLInputElement>('.lobby-name')!;
    name.value = 'Ranger';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const code = root.querySelector<HTMLInputElement>('.lobby-code-input')!;
    code.value = 'JOIN';
    code.dispatchEvent(new Event('input', { bubbles: true }));
    [...root.querySelectorAll<HTMLButtonElement>(
      '[data-multiplayer-command-view="online"] button',
    )].find((button) => button.textContent === 'Join Room')!.click();

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    await Promise.resolve();
    const retainedFocus = document.activeElement;
    render.mockClear();
    subscribe.mockClear();
    admission.resolve({
      ok: true,
      status: 200,
      data: {
        roomId: 'late-join-room',
        playerId: 'late-join-player',
        token: TEST_SESSION_VALUE,
        seed: 17,
        options: {
          maxPlayers: 2,
          maxWind: 10,
          gravity: 0.15,
          rulesetVersion: 4,
          commandProtocolVersion: 2,
        },
        players: [{
          id: 'late-join-player', name: 'Ranger', color: '#4d8ce8', ready: false,
        }],
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(internal.onlineSubView).toBe('join');
    expect(readSession()).toBeNull();
    expect(localStorage.getItem('singedterra:seat:late-join-player')).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(retainedFocus);
    expect(release).toHaveBeenCalledWith({
      roomId: 'late-join-room', playerId: 'late-join-player', token: TEST_SESSION_VALUE,
    });
  });

  it('does not let a deferred Leave completion mutate the replacement workspace', async () => {
    const lobby = new Lobby(root, vi.fn());
    const departure = deferred<unknown>();
    const internal = lobby as unknown as {
      transport: {
        fetchRoom: ReturnType<typeof vi.fn>;
        leaveRoom: ReturnType<typeof vi.fn>;
      };
      session: {
        replaceWaiting(next: unknown): void;
        subscribeWaitingRoom: ReturnType<typeof vi.fn>;
      };
      render: ReturnType<typeof vi.fn>;
      onlineSubView: string;
    };
    internal.onlineSubView = 'waiting';
    internal.session.replaceWaiting({
      roomId: 'leaving-room', roomCode: 'LEAV', playerId: 'leaving-player',
      token: TEST_SESSION_VALUE, players: [], seed: 17,
      options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
      thisPlayerReady: false,
    });
    writeSession({
      roomId: 'leaving-room', roomCode: 'LEAV', playerId: 'leaving-player',
    });
    const leave = vi.spyOn(internal.transport, 'leaveRoom')
      .mockReturnValue(departure.promise as never);
    vi.spyOn(internal.transport, 'fetchRoom')
      .mockReturnValue(new Promise(() => {}) as never);
    const subscribe = vi.spyOn(internal.session, 'subscribeWaitingRoom');
    const render = vi.spyOn(internal, 'render');

    lobby.show();
    selectOnline(root);
    [...root.querySelectorAll<HTMLButtonElement>(
      '[data-multiplayer-command-view="online"] button',
    )].find((button) => button.textContent === 'Leave')!.click();
    expect(leave).toHaveBeenCalledWith({
      roomId: 'leaving-room', playerId: 'leaving-player', token: TEST_SESSION_VALUE,
    });

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    await Promise.resolve();
    const retainedFocus = document.activeElement;
    render.mockClear();
    subscribe.mockClear();
    departure.resolve({ ok: true, status: 200, data: {} });
    await Promise.resolve();
    await Promise.resolve();

    expect(internal.onlineSubView).toBe('waiting');
    expect(readSession()).toEqual({
      roomId: 'leaving-room', roomCode: 'LEAV', playerId: 'leaving-player',
    });
    expect(subscribe).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(retainedFocus);
    expect(root.querySelector('[data-skirmish-command-view]')).not.toBeNull();
  });

  it('stops the Browse poll while disposed and resumes it when Online remounts', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby(root, vi.fn());
    const internal = lobby as unknown as {
      transport: { listRooms: ReturnType<typeof vi.fn> };
    };
    const listRooms = vi.spyOn(internal.transport, 'listRooms').mockResolvedValue({
      ok: true, status: 200, data: { rooms: [] },
    });

    lobby.show();
    selectOnline(root);
    [...root.querySelectorAll<HTMLButtonElement>(
      '[data-multiplayer-command-view="online"] button',
    )].find((button) => button.textContent === 'Browse public rooms')!.click();
    await Promise.resolve();
    expect(listRooms).toHaveBeenCalledOnce();

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(6_000);

    expect(listRooms).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-skirmish-command-view]')).not.toBeNull();

    selectOnline(root);
    await Promise.resolve();
    expect(listRooms).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(listRooms).toHaveBeenCalledTimes(3);
  });

  it('rejects a held Browse response after its mounted Online lifetime is disposed', async () => {
    const lobby = new Lobby(root, vi.fn());
    const response = deferred<unknown>();
    const internal = lobby as unknown as {
      transport: { listRooms: ReturnType<typeof vi.fn> };
      browseRooms: unknown[];
      render: ReturnType<typeof vi.fn>;
    };
    vi.spyOn(internal.transport, 'listRooms').mockReturnValue(response.promise as never);
    const render = vi.spyOn(internal, 'render');

    lobby.show();
    selectOnline(root);
    [...root.querySelectorAll<HTMLButtonElement>(
      '[data-multiplayer-command-view="online"] button',
    )].find((button) => button.textContent === 'Browse public rooms')!.click();
    expect(internal.transport.listRooms).toHaveBeenCalledOnce();

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    await Promise.resolve();
    const retainedFocus = document.activeElement;
    render.mockClear();
    response.resolve({
      ok: true,
      status: 200,
      data: {
        rooms: [{
          roomId: 'stale-room', code: 'OLD1', hostName: 'Stale',
          playerCount: 1, maxPlayers: 2,
        }],
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(internal.browseRooms).toEqual([]);
    expect(render).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(retainedFocus);
    expect(root.querySelector('[data-skirmish-command-view]')).not.toBeNull();
  });

  it('releases and restores the waiting-room subscription with Online ownership', async () => {
    const lobby = new Lobby(root, vi.fn());
    const internal = lobby as unknown as {
      onlineSubView: string;
      cleanupWaitingChannel(): void;
      subscribeWaitingRoom(): Promise<void>;
    };
    internal.onlineSubView = 'waiting';
    const cleanup = vi.spyOn(internal, 'cleanupWaitingChannel');
    const subscribe = vi.spyOn(internal, 'subscribeWaitingRoom').mockResolvedValue();

    lobby.show();
    selectOnline(root);
    cleanup.mockClear();
    subscribe.mockClear();

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();

    selectOnline(root);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it('launches with the complete normalized crew, loadouts, and battlefield settings', () => {
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(root, onReady);
    lobby.show();
    selectLocalBattle(root);

    const rounds = root.querySelector<HTMLInputElement>('input[aria-label="Rounds"]')!;
    const wind = root.querySelector<HTMLInputElement>('input[aria-label="Wind"]')!;
    const walls = root.querySelector<HTMLSelectElement>('#lobby-hotseat-direct-walls')!;
    rounds.value = '5';
    rounds.dispatchEvent(new Event('input', { bubbles: true }));
    wind.value = '7';
    wind.dispatchEvent(new Event('input', { bubbles: true }));
    walls.value = 'reflective';
    walls.dispatchEvent(new Event('change', { bubbles: true }));

    root.querySelector<HTMLButtonElement>('.lobby-start')!.click();

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0]![0]).toEqual({
      mode: 'hotseat',
      players: [
        {
          name: 'Player 1',
          color: '#e84d4d',
          loadout: {
            treads: 'foundry', hull: 'foundry', turret: 'foundry', barrel: 'foundry',
          },
        },
        {
          name: 'Player 2',
          color: '#4d8ce8',
          loadout: {
            treads: 'ranger', hull: 'ranger', turret: 'ranger', barrel: 'ranger',
          },
        },
      ],
      playerNames: ['Player 1', 'Player 2'],
      settings: {
        maxWind: 7,
        walls: 'reflective',
        rounds: 5,
      },
    });
  });

  it('keeps command navigation focus semantics and touch-sized Local controls', async () => {
    const lobby = new Lobby(root, vi.fn());
    lobby.show();
    selectLocalBattle(root);

    const shell = (lobby as unknown as {
      commandCenterShell: { focusWorkspaceDefault(): void } | null;
    }).commandCenterShell;
    shell?.focusWorkspaceDefault();
    await Promise.resolve();

    expect(document.activeElement).toBe(root.querySelector('#lobby-hotseat-player-count'));
    expect(root.querySelector('.lobby-start')?.className).toContain('primary');
    expect(root.querySelector('.lobby-start')?.className).toContain('lobby-btn');
    expect(root.querySelector('[data-command-item="local-battle"]')?.getAttribute('aria-current'))
      .toBe('true');
  });

  it('releases every Local control listener when the shell replaces its workspace', () => {
    const onReady = vi.fn<(config: LobbyConfig) => void>();
    const lobby = new Lobby(root, onReady);
    lobby.show();
    selectLocalBattle(root);
    const stalePlayerCount = root.querySelector<HTMLSelectElement>('#lobby-hotseat-player-count')!;
    const staleName = root.querySelector<HTMLInputElement>('[aria-label="Player 1 name"]')!;
    const staleColor = root.querySelector<HTMLButtonElement>('.lobby-row:first-child .lobby-swatch:nth-child(3)')!;
    const staleController = root.querySelector<HTMLSelectElement>('.lobby-row:first-child .lobby-control')!;
    const staleRounds = root.querySelector<HTMLInputElement>('input[aria-label="Rounds"]')!;
    const staleWind = root.querySelector<HTMLInputElement>('input[aria-label="Wind"]')!;
    const staleWalls = root.querySelector<HTMLSelectElement>('#lobby-hotseat-direct-walls')!;
    const staleAdvanced = root.querySelector<HTMLButtonElement>('.lobby-advanced-trigger')!;
    const staleStart = root.querySelector<HTMLButtonElement>('.lobby-start')!;
    const staleGarageOpen = root.querySelector<HTMLButtonElement>(
      '.lobby-garage[data-owner="player-1"] .lobby-garage__open',
    )!;

    root.querySelector<HTMLButtonElement>(
      '[data-command-surface="rail"][data-command-category="skirmishes"]',
    )!.click();
    expect(root.contains(staleStart)).toBe(false);

    stalePlayerCount.value = '4';
    stalePlayerCount.dispatchEvent(new Event('change', { bubbles: true }));
    staleName.value = 'Detached Ranger';
    staleName.dispatchEvent(new Event('input', { bubbles: true }));
    staleColor.click();
    staleController.value = 'easy';
    staleController.dispatchEvent(new Event('change', { bubbles: true }));
    staleRounds.value = '5';
    staleRounds.dispatchEvent(new Event('input', { bubbles: true }));
    staleWind.value = '7';
    staleWind.dispatchEvent(new Event('input', { bubbles: true }));
    staleWalls.value = 'reflective';
    staleWalls.dispatchEvent(new Event('change', { bubbles: true }));
    staleAdvanced.click();
    staleGarageOpen.click();
    staleStart.click();

    const internal = lobby as unknown as {
      players: Array<{ name: string; color: string; ai?: string }>;
      settings: { rounds: string; maxWind: string; walls: string };
      settingsOpen: boolean;
      openGarageOwner: string | null;
    };
    expect(onReady).not.toHaveBeenCalled();
    expect(internal.players).toHaveLength(2);
    expect(internal.players[0]).toMatchObject({ name: 'Player 1', color: '#e84d4d' });
    expect(internal.players[0]?.ai).toBeUndefined();
    expect(internal.settings).toMatchObject({ rounds: '', maxWind: '', walls: '' });
    expect(internal.settingsOpen).toBe(false);
    expect(internal.openGarageOwner).toBeNull();
    expect(root.querySelector('[data-skirmish-command-view]')).not.toBeNull();
  });

  it('contributes authenticated Verified Operations as an owned sibling workspace', () => {
    const buildLocalBattleWorkspace = vi.fn(() => document.createElement('section'));
    const buildVerifiedOperationsWorkspace = vi.fn(() => {
      const workspace = document.createElement('section');
      workspace.setAttribute('aria-label', 'Verified operations workspace');
      return workspace;
    });
    const context: MultiplayerCommandContext = {
      verifiedOperationsAvailable: true,
      buildLocalBattleWorkspace,
      buildVerifiedOperationsWorkspace,
      buildOnlineBattleWorkspace: () => document.createElement('section'),
      releaseOnlineBattleWorkspace: vi.fn(),
    };
    const contribution = createMultiplayerCommandCategoryContribution();
    const registry = resolveCommandRegistry([contribution], context);

    expect(registry.categories[0]?.items.map((item) => item.id)).toEqual([
      'local-battle',
      'verified-operations',
      'online',
    ]);

    const host = document.createElement('div');
    const controller = new AbortController();
    const verified = registry.categories[0]!.items[1]!;
    const view = verified.createView(host, context, {
      signal: controller.signal,
      isCurrent: () => true,
      run: (effect) => { effect(); return true; },
    });
    expect(buildVerifiedOperationsWorkspace).toHaveBeenCalledWith(controller.signal);
    expect(host.querySelector('[data-multiplayer-command-view="verified-operations"]'))
      .not.toBeNull();
    expect(host.querySelector('[aria-label="Verified operations workspace"]')).not.toBeNull();
    view.dispose();
  });

  it('omits Verified Operations when its authenticated owner is unavailable', () => {
    const context: MultiplayerCommandContext = {
      verifiedOperationsAvailable: false,
      buildLocalBattleWorkspace: () => document.createElement('section'),
      buildVerifiedOperationsWorkspace: () => document.createElement('section'),
      buildOnlineBattleWorkspace: () => document.createElement('section'),
      releaseOnlineBattleWorkspace: vi.fn(),
    };
    const contribution = createMultiplayerCommandCategoryContribution();

    expect(resolveCommandRegistry([contribution], context).categories[0]?.items.map((item) => item.id))
      .toEqual(['local-battle', 'online']);
  });
});
