/**
 * B2-01: hiding the Lobby cancels the ownership of in-flight create/join work.
 * Like Lobby.network/sessionLifecycle, drive the existing private action methods
 * behind public buttons, but keep the real controller/session/render/persistence.
 * Only the transport response and Realtime SDK boundary are controlled doubles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from './Lobby';
import type { LobbyTransport, CreateRoomResponse } from '../client/LobbyTransport';
import type { EdgeResult } from '../lib/edgeFunctions';
import { readSession } from '../lib/sessionDescriptor';

const realtime = vi.hoisted(() => {
  const live = new Set<unknown>();
  const channel = vi.fn((name: string) => {
    const resource = {
      name,
      on: vi.fn(() => resource),
      subscribe: vi.fn(() => { live.add(resource); return resource; }),
    };
    return resource;
  });
  const removeChannel = vi.fn(async (resource: unknown) => { live.delete(resource); });
  return { live, channel, removeChannel };
});

vi.mock('../lib/supabase', () => ({
  supabase: { channel: realtime.channel, removeChannel: realtime.removeChannel },
}));

interface LobbyActions {
  transport: LobbyTransport;
  onlineName: string;
  joinCode: string;
  handleCreateRoom(): Promise<void>;
  handleJoinRoom(): Promise<void>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const acceptedRoom: EdgeResult<CreateRoomResponse> = {
  ok: true, status: 200,
  data: {
    roomId: 'late-room', code: 'LATE', playerId: 'late-player', token: 'late-seat-token',
    options: { maxPlayers: 2, maxWind: 10, gravity: 0.15, rulesetVersion: 4 },
    players: [{ id: 'late-player', name: 'Alice', color: '#e84d4d', ready: false }],
  },
};

describe('Lobby pending room admission cancellation', () => {
  let root: HTMLDivElement;
  let lobby: Lobby;
  let actions: LobbyActions;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    realtime.live.clear();
    realtime.channel.mockClear();
    realtime.removeChannel.mockClear();
    root = document.createElement('div');
    document.body.append(root);
    lobby = new Lobby(root, vi.fn());
    actions = lobby as unknown as LobbyActions;
    actions.onlineName = 'Alice';
    actions.joinCode = 'LATE';
    vi.spyOn(actions.transport, 'heartbeat').mockResolvedValue({ ok: true, status: 200, data: {} });
  });

  afterEach(() => {
    lobby.hide();
    vi.restoreAllMocks();
    vi.useRealTimers();
    root.remove();
    localStorage.clear();
  });

  it.each(['create', 'join'] as const)('ignores a successful %s response after hide has released the Lobby', async (kind) => {
    const response = deferred<EdgeResult<CreateRoomResponse>>();
    const staleLeave = vi.spyOn(actions.transport, 'leaveRoom')
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const transport = vi.spyOn(actions.transport, kind === 'create' ? 'createRoom' : 'joinRoom')
      .mockReturnValue(response.promise);
    // Warm the same lazy SDK module used by LobbySession so flushing the queued
    // subscription continuation does not rely on a network or arbitrary timeout.
    await import('../lib/supabase');
    const pending = kind === 'create' ? actions.handleCreateRoom() : actions.handleJoinRoom();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(root.childElementCount).toBeGreaterThan(0);

    lobby.hide();
    expect(root.childElementCount).toBe(0);
    expect(root.hidden).toBe(true);
    expect(realtime.live.size).toBe(0);
    const timersAfterHide = vi.getTimerCount();
    expect(readSession()).toBeNull();

    response.resolve(acceptedRoom);
    await pending;
    await vi.advanceTimersByTimeAsync(0);

    // These are independent observable effects of one stale continuation; soft
    // assertions retain the complete failure proof for the implementation owner.
    expect.soft(root.hidden).toBe(true);
    expect.soft(root.childElementCount, 'late admission must not repopulate the hidden Lobby').toBe(0);
    expect.soft(readSession(), 'late admission must not replace the persisted room descriptor').toBeNull();
    expect.soft(localStorage.getItem('singedterra:seat:late-player'), 'late admission must not persist a new seat token').toBeNull();
    expect.soft(realtime.live.size, 'late admission must not reopen a waiting-room channel').toBe(0);
    expect.soft(vi.getTimerCount(), 'late admission must not restart the waiting heartbeat').toBe(timersAfterHide);
    expect.soft(staleLeave, 'late remote seat must be released without local adoption').toHaveBeenCalledWith({
      roomId: 'late-room',
      playerId: 'late-player',
      token: 'late-seat-token',
    });
  });
});
