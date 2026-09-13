import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TANK_LOADOUT } from '@shared/types/TankLoadout';
import { NetworkClient } from './NetworkClient';
import type { GameClient } from './GameClient';
import { LobbyTransport } from './LobbyTransport';
import { projectAuthoritativeNetworkMode } from './modeConfig';
import { readSession, writeSession } from '../lib/sessionDescriptor';

const credential = ['fixture', 'seat', 'credential'].join('-');
const options = {
  seed: 1, maxPlayers: 2,
  players: [
    { id: 'human-a', name: 'Alice', color: '#e84d4d' },
    { id: 'human-b', name: 'Bob', color: '#4d8ce8' },
  ],
};

function fixture() {
  let roomUpdate: ((payload: { new: Record<string, unknown> }) => void) | undefined;
  const query: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'order', 'gte', 'abortSignal']) query[name] = () => query;
  query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve);
  query.maybeSingle = () => Promise.resolve({ data: null, error: null });
  const supabase = {
    from: () => query,
    channel: () => {
      const channel = {
        on: (_type: string, filter: { event: string }, callback: typeof roomUpdate) => {
          if (filter.event === 'UPDATE') roomUpdate = callback;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient;
  const client = new NetworkClient(supabase, 'room-a', 'human-a', options, credential, 2);
  return { client, roomUpdate: (row: Record<string, unknown>) => roomUpdate?.({ new: row }) };
}

describe('network room presence and explicit departure — RL-01/02/07/08', () => {
  const clients: NetworkClient[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-fixture-key');
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })));
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => client.stop());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('pulses immediately and every 30 seconds without frames or actions, with one owned timer', async () => {
    const { client } = fixture(); clients.push(client);
    client.start(); client.start();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://example.test/functions/v1/heartbeat', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ roomId: 'room-a', playerId: 'human-a', token: credential }),
    }));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    client.stop();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retires outstanding and captured heartbeat work on generic stop without sending leave', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const { client } = fixture(); clients.push(client);
    client.start();
    expect(fetch).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    const callback = intervals.mock.calls[0]?.[0] as (() => void) | undefined;
    client.stop();
    callback?.();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the presence cadence after transport failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    const { client } = fixture(); clients.push(client);
    client.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['room_abandoned', 'This game ended after everyone left. Return to the lobby to start a new game.'],
    ['seat_left', 'You have left this game. Return to the lobby to start a new game.'],
  ])('stops from the authenticated %s heartbeat when the terminal broadcast was missed', async (error, message) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error }), { status: 409 }));
    const { client } = fixture(); clients.push(client);
    const notice = vi.fn(); client.onFireFailed(notice);
    writeSession({ roomId: 'room-a', playerId: 'human-a', roomCode: 'ROOM' });
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(notice).toHaveBeenCalledExactlyOnceWith(message);
    expect(readSession()).toBeNull();
    client.sendAction({ type: 'fire' });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.getState().phase).toBe('PLAYER_TURN');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [409, { error: 'room_not_active' }],
    [500, { error: 'room_abandoned' }],
    [200, { error: 'seat_left' }],
    [409, { error: ['room_abandoned'] }],
  ])('does not infer abandonment from unrelated or malformed heartbeat response %s %j', async (status, body) => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify(body), { status }));
    const { client } = fixture(); clients.push(client);
    const notice = vi.fn(); client.onFireFailed(notice);
    writeSession({ roomId: 'room-a', playerId: 'human-a', roomCode: 'ROOM' });
    client.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(notice).not.toHaveBeenCalled();
    expect(readSession()?.roomId).toBe('room-a');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['newer-pulse', 'successor-client'])('ignores a terminal result retired by %s', async (retirement) => {
    let settleOld!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { settleOld = resolve; }));
    const first = fixture(); clients.push(first.client);
    const firstNotice = vi.fn(); first.client.onFireFailed(firstNotice);
    first.client.start();
    if (retirement === 'newer-pulse') {
      await vi.advanceTimersByTimeAsync(30_000);
    } else {
      first.client.stop();
      const second = fixture(); clients.push(second.client);
      second.client.start();
    }
    const currentDescriptor = { roomId: 'current-room', playerId: 'human-a', roomCode: 'LIVE' };
    writeSession(currentDescriptor);
    settleOld(new Response(JSON.stringify({ error: 'room_abandoned' }), { status: 409 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(firstNotice).not.toHaveBeenCalled();
    expect(readSession()).toEqual(currentDescriptor);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('stops the old heartbeat as soon as a rematch is observed without signaling quit', async () => {
    const test = fixture(); clients.push(test.client);
    await test.client.initialize();
    test.client.start();
    test.roomUpdate({ rematch_room_id: 'successor' });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/heartbeat');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends one explicit authenticated leave and stops heartbeats before it', async () => {
    const { client } = fixture(); clients.push(client);
    client.start();
    const leaving = client as GameClient & { leaveRoom?: () => Promise<void> };
    await leaving.leaveRoom?.();
    await leaving.leaveRoom?.();
    client.stop();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith('https://example.test/functions/v1/leave_room', expect.objectContaining({
      body: JSON.stringify({ roomId: 'room-a', playerId: 'human-a', token: credential }),
    }));
  });

  it('shows abandonment and freezes the client without fabricating a game outcome', async () => {
    const test = fixture(); clients.push(test.client);
    await test.client.initialize();
    const notice = vi.fn(); test.client.onFireFailed(notice);
    writeSession({ roomId: 'room-a', playerId: 'human-a', roomCode: 'ROOM' });
    test.client.start();
    const before = test.client.getState();
    test.roomUpdate({ status: 'finished', abandoned_at: '2026-09-12T16:00:00Z' });
    test.client.sendAction({ type: 'fire' });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(notice).toHaveBeenCalledWith('This game ended after everyone left. Return to the lobby to start a new game.');
    expect(readSession()).toBeNull();
    expect(test.client.getState()).toBe(before);
    expect(test.client.getState().phase).toBe('PLAYER_TURN');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('advertises lifecycle support at admission and preserves only authoritative capability', async () => {
    const transport = new LobbyTransport();
    await transport.createRoom({
      playerName: 'Alice', color: '#e84d4d', loadout: DEFAULT_TANK_LOADOUT, bots: [], maxPlayers: 2,
      visibility: 'public', maxWind: '', gravity: '', walls: '', rounds: '', interestRate: '', suddenDeath: '', armsLevel: '',
    });
    await transport.joinRoom({ code: 'ROOM', playerName: 'Alice', color: '#e84d4d', loadout: DEFAULT_TANK_LOADOUT });
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>);
    expect(bodies.map((body) => body.roomLifecycleVersion)).toEqual([1, 1]);
    const room = { roomId: 'room-a', code: 'ROOM', seed: 1, players: options.players, options: {
      maxPlayers: 2, maxWind: 10, gravity: 0.15, roomLifecycleVersion: 1 as const,
    } };
    expect(projectAuthoritativeNetworkMode(room, { playerId: 'human-a' }).settings).toHaveProperty('roomLifecycleVersion', 1);
    const { roomLifecycleVersion: _capability, ...legacyOptions } = room.options;
    expect(projectAuthoritativeNetworkMode({ ...room, options: legacyOptions }, { playerId: 'human-a' }).settings)
      .not.toHaveProperty('roomLifecycleVersion');
  });
});
