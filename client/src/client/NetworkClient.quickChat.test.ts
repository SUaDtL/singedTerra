import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

interface CapturedChannel {
  name: string;
  broadcastHandler: ((value: { payload?: unknown }) => void) | null;
  send: ReturnType<typeof vi.fn>;
  channelObject?: unknown;
}

function makeFakeSupabase(): {
  supabase: SupabaseClient;
  channels: CapturedChannel[];
  removeChannel: ReturnType<typeof vi.fn>;
} {
  const channels: CapturedChannel[] = [];
  const removeChannel = vi.fn();
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    channel: (name: string) => {
      const captured: CapturedChannel = {
        name,
        broadcastHandler: null,
        send: vi.fn(() => Promise.resolve({ status: 'ok' })),
      };
      const channel = {
        on: (event: string, _filter: unknown, handler: (value: { payload?: unknown }) => void) => {
          if (event === 'broadcast') captured.broadcastHandler = handler;
          return channel;
        },
        subscribe: () => channel,
        send: captured.send,
      };
      captured.channelObject = channel;
      channels.push(captured);
      return channel;
    },
    removeChannel,
  } as unknown as SupabaseClient;
  return { supabase, channels, removeChannel };
}

describe('NetworkClient quick chat broadcast', () => {
  afterEach(() => vi.useRealTimers());

  it('receives only known messages and resolves the roster display name', async () => {
    const { supabase, channels } = makeFakeSupabase();
    const received: Array<{ key: string; playerId: string; playerName: string }> = [];
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS, undefined, 2);
    client.onQuickChat?.((message) => received.push(message));
    await client.initialize();

    const chat = channels.find((channel) => channel.name === 'quick_chat:room-1');
    expect(chat).toBeDefined();
    chat?.broadcastHandler?.({ payload: { key: 'nice_shot', playerId: 'player-def' } });
    chat?.broadcastHandler?.({ payload: { key: 'free_text', playerId: 'player-def' } });
    chat?.broadcastHandler?.({ payload: { key: 'ready', playerId: 'unknown' } });

    expect(received).toEqual([{ key: 'nice_shot', playerId: 'player-def', playerName: 'Bob' }]);
  });

  it('sends a catalog payload once per 800ms and removes its channel on stop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { supabase, channels, removeChannel } = makeFakeSupabase();
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS, undefined, 2);
    await client.initialize();
    const chat = channels.find((channel) => channel.name === 'quick_chat:room-1')!;

    expect((client.sendQuickChat as (key: string) => boolean)('free_text')).toBe(false);
    expect(client.sendQuickChat?.('watch_wind')).toBe(true);
    expect(client.sendQuickChat?.('oops')).toBe(false);
    expect(chat.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'quick_chat',
      payload: { key: 'watch_wind', playerId: 'player-abc' },
    });

    vi.advanceTimersByTime(800);
    expect(client.sendQuickChat?.('oops')).toBe(true);
    client.stop();
    expect(removeChannel).toHaveBeenCalledWith(chat.channelObject);
  });

  it('ignores a broadcast delivered after teardown', async () => {
    const { supabase, channels } = makeFakeSupabase();
    const received: unknown[] = [];
    const client = new NetworkClient(supabase, 'room-1', 'player-abc', OPTIONS, undefined, 2);
    client.onQuickChat?.((message) => received.push(message));
    await client.initialize();
    const chat = channels.find((channel) => channel.name === 'quick_chat:room-1')!;
    client.stop();

    chat.broadcastHandler?.({ payload: { key: 'ready', playerId: 'player-def' } });
    expect(received).toEqual([]);
  });
});
