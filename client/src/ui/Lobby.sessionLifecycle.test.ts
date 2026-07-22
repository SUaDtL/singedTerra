/**
 * Characterization oracle for Lobby's owned Realtime waiting-room lifecycle.
 * This deliberately reaches the current private surface: a later LobbySession
 * extraction must preserve these public effects without weakening this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Lobby } from './Lobby';
import type { NetworkPlayer, RoomOptions } from '../client/LobbyTransport';

interface CapturedChannel {
  name: string;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  update?: (payload: { new: Record<string, unknown> }) => void;
  delete?: () => void;
}

// `getSupabase()` reaches this SDK through a lazy import. Hoisting keeps that
// import attached to this stable callback-capturing client rather than a live
// Supabase project.
const realtime = vi.hoisted(() => {
  const channels: CapturedChannel[] = [];
  const removeChannel = vi.fn();
  const channel = vi.fn((name: string) => {
    const captured = { name } as CapturedChannel;
    captured.on = vi.fn((_kind: string, filter: { event: string }, callback: unknown) => {
      if (filter.event === 'UPDATE') captured.update = callback as CapturedChannel['update'];
      if (filter.event === 'DELETE') captured.delete = callback as CapturedChannel['delete'];
      return captured;
    });
    captured.subscribe = vi.fn(() => captured);
    channels.push(captured);
    return captured;
  });
  return { channels, channel, removeChannel };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: realtime.channel,
    removeChannel: realtime.removeChannel,
  })),
}));

interface LobbyInternals {
  subscribeWaitingRoom(): Promise<void>;
  cleanupWaitingChannel(): void;
  render(): void;
  waitingRoomId: string;
  waitingRoomCode: string;
  waitingPlayerId: string;
  waitingToken: string;
  waitingPlayers: NetworkPlayer[];
  waitingSeed: number;
  waitingOptions: RoomOptions;
  waitingThisPlayerReady: boolean;
  waitingChannel: unknown;
  activeTab: string;
  onlineSubView: string;
  onlineError: string;
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals;
}

function expectRoomSubscription(channel: CapturedChannel, roomId: string): void {
  expect(channel.name).toBe(`rooms:${roomId}`);
  expect(channel.on).toHaveBeenCalledTimes(2);
  expect(channel.on).toHaveBeenNthCalledWith(1, 'postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
  }, expect.any(Function));
  expect(channel.on).toHaveBeenNthCalledWith(2, 'postgres_changes', {
    event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
  }, expect.any(Function));
  expect(channel.subscribe).toHaveBeenCalledTimes(1);
}

const waitingPlayers = [
  { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false, lastSeen: 100 },
  { id: 'p-2', name: 'CPU', color: '#4d8ce8', ready: true, ai: 'medium' as const, lastSeen: 100 },
];

const waitingOptions = { maxPlayers: 3, maxWind: 7, gravity: 0.2, rounds: 3 };

function waitingRow(lastSeen = 100): Record<string, unknown> {
  return {
    status: 'waiting',
    seed: 42,
    options: waitingOptions,
    players: waitingPlayers.map((player) => ({ ...player, lastSeen })),
  };
}

function activeRow(): Record<string, unknown> {
  return {
    status: 'active',
    seed: 42,
    options: {
      ...waitingOptions,
      interestRate: 0.15,
      suddenDeathTurn: 12,
      armsLevel: 3,
    },
    players: waitingPlayers,
  };
}

describe('Lobby waiting-room session lifecycle (characterization)', () => {
  let root: HTMLDivElement;
  let onReady: Mock;
  let lobby: Lobby;

  function seedWaiting(roomId = 'room-1'): void {
    Object.assign(internals(lobby), {
      waitingRoomId: roomId,
      waitingRoomCode: 'ABCD',
      waitingPlayerId: 'p-1',
      waitingToken: 'tok',
      waitingPlayers: [],
      waitingSeed: 0,
      waitingOptions: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
      waitingThisPlayerReady: true,
      activeTab: 'online',
      onlineSubView: 'waiting',
      onlineError: '',
    });
  }

  function expectGone(message: string): void {
    expect(internals(lobby).waitingRoomId).toBe('');
    expect(internals(lobby).waitingRoomCode).toBe('');
    expect(internals(lobby).waitingPlayerId).toBe('');
    expect(internals(lobby).waitingToken).toBe('');
    expect(internals(lobby).waitingPlayers).toEqual([]);
    expect(internals(lobby).waitingThisPlayerReady).toBe(false);
    expect(internals(lobby).onlineSubView).toBe('create');
    expect(internals(lobby).onlineError).toBe(message);
    expect(root.textContent).toContain(message);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    realtime.channels.length = 0;
    realtime.channel.mockClear();
    realtime.removeChannel.mockClear();
    localStorage.clear();
    root = document.createElement('div');
    document.body.appendChild(root);
    onReady = vi.fn();
    lobby = new Lobby(root, onReady);
  });

  afterEach(() => {
    try {
      internals(lobby).cleanupWaitingChannel();
    } catch {
      // A failed setup has no owned lifecycle to clean up.
    }
    vi.useRealTimers();
    root.remove();
  });

  it('owns one filtered subscription, replaces it on resubscribe, and tears it down idempotently', async () => {
    seedWaiting();
    const setInterval = vi.spyOn(globalThis, 'setInterval');

    await internals(lobby).subscribeWaitingRoom();

    const first = realtime.channels[0];
    expectRoomSubscription(first, 'room-1');
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 10_000);
    expect(vi.getTimerCount()).toBe(1);

    internals(lobby).waitingRoomId = 'room-2';
    await internals(lobby).subscribeWaitingRoom();

    const second = realtime.channels[1];
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    expect(realtime.removeChannel).toHaveBeenCalledWith(first);
    expectRoomSubscription(second, 'room-2');
    expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function), 10_000);
    expect(vi.getTimerCount()).toBe(1);

    internals(lobby).cleanupWaitingChannel();
    internals(lobby).cleanupWaitingChannel();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(2);
    expect(realtime.removeChannel).toHaveBeenLastCalledWith(second);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adopts waiting broadcasts but does not re-render heartbeat-only lastSeen changes', async () => {
    seedWaiting();
    await internals(lobby).subscribeWaitingRoom();
    const render = vi.spyOn(internals(lobby), 'render');
    const update = realtime.channels[0].update;
    expect(update).toBeTypeOf('function');

    update!({ new: waitingRow() });

    expect(internals(lobby).waitingPlayers).toEqual(waitingPlayers);
    expect(internals(lobby).waitingSeed).toBe(42);
    expect(internals(lobby).waitingOptions).toEqual(waitingOptions);
    expect(render).toHaveBeenCalledTimes(1);

    update!({ new: waitingRow(200) });

    const runtimePlayers = internals(lobby).waitingPlayers as Array<NetworkPlayer & { lastSeen?: number }>;
    expect(runtimePlayers[0].lastSeen).toBe(200);
    expect(runtimePlayers[1].lastSeen).toBe(200);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('converts an active broadcast to one complete network config after lifecycle cleanup', async () => {
    seedWaiting();
    await internals(lobby).subscribeWaitingRoom();
    const channel = realtime.channels[0];

    channel.update!({ new: activeRow() });

    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    expect(realtime.removeChannel).toHaveBeenCalledWith(channel);
    expect(vi.getTimerCount()).toBe(0);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith({
      mode: 'network',
      players: [
        { id: 'p-1', name: 'Alice', color: '#e84d4d' },
        { id: 'p-2', name: 'CPU', color: '#4d8ce8', ai: 'medium' },
      ],
      playerNames: ['Alice', 'CPU'],
      roomCode: 'ABCD',
      roomId: 'room-1',
      playerId: 'p-1',
      token: 'tok',
      settings: {
        seed: 42,
        maxWind: 7,
        gravity: 0.2,
        rounds: 3,
        interestRate: 0.15,
        suddenDeathTurn: 12,
        armsLevel: 3,
      },
    });
  });

  it('resets after removal from an UPDATE and after a DELETE only once', async () => {
    seedWaiting();
    await internals(lobby).subscribeWaitingRoom();
    const missingPlayerChannel = realtime.channels[0];

    missingPlayerChannel.update!({
      new: {
        status: 'waiting',
        players: [{ id: 'p-2', name: 'CPU', color: '#4d8ce8', ready: true, ai: 'medium' }],
      },
    });

    expect(realtime.removeChannel).toHaveBeenCalledWith(missingPlayerChannel);
    expect(vi.getTimerCount()).toBe(0);
    expectGone('You are no longer in this room.');

    lobby = new Lobby(root, onReady);
    seedWaiting();
    await internals(lobby).subscribeWaitingRoom();
    const deleteChannel = realtime.channels[1];
    const render = vi.spyOn(internals(lobby), 'render');

    deleteChannel.delete!();

    expect(realtime.removeChannel).toHaveBeenCalledTimes(2);
    expect(realtime.removeChannel).toHaveBeenLastCalledWith(deleteChannel);
    expect(vi.getTimerCount()).toBe(0);
    expectGone('This room is no longer available.');
    expect(render).toHaveBeenCalledTimes(1);

    deleteChannel.delete!();

    expect(realtime.removeChannel).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
