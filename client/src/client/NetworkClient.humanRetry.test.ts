import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkClient } from './NetworkClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  rulesetVersion: 4 as const,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

function supabaseFixture(): SupabaseClient {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'order', 'abortSignal']) builder[method] = () => builder;
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { from: () => builder } as unknown as SupabaseClient;
}

function accepted(init?: RequestInit) {
  const command = JSON.parse(String(init?.body)).command;
  return {
    ok: true,
    json: async () => ({
      ok: true, protocolVersion: 2, intentId: command.intentId,
      seq: command.expectedRevision, revision: command.expectedRevision + 1,
      actorPlayerId: command.actorPlayerId, actorTankId: 'p1',
    }),
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>): NetworkClient {
  vi.stubGlobal('fetch', fetchMock);
  return new NetworkClient(supabaseFixture(), 'room-1', 'player-abc', OPTIONS, 'seat-token-test', 2);
}

describe('NetworkClient — human command-v2 retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'human-intent') });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('retries transport uncertainty once with the identical v2 body', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockImplementationOnce((_url, init) => Promise.resolve(accepted(init)));
    const client = makeClient(fetchMock);

    client.sendAction({ type: 'fire' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(second.body).toBe(first.body);
    expect(JSON.parse(String(first.body)).command).toMatchObject({
      version: 2, intentId: 'human-intent', expectedRevision: 0,
    });
    client.stop();
  });

  it('does not retry or re-envelope a determinate revision conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'revision_conflict', currentRevision: 1 }),
    });
    const client = makeClient(fetchMock);
    const failure = vi.fn();
    client.onFireFailed(failure);

    client.sendAction({ type: 'fire' });
    await settle();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledWith('Turn changed — review the updated game and try again.');
    expect(client.isFiring).toBe(false);
    client.stop();
  });

  it('bounds transport uncertainty at two attempts and releases the firing lock after recovery', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    const client = makeClient(fetchMock);
    const failure = vi.fn();
    client.onFireFailed(failure);

    client.sendAction({ type: 'fire' });
    await settle();
    await vi.advanceTimersByTimeAsync(200);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(client.isFiring).toBe(false);
    client.stop();
  });

  it('invalidates a pending retry when the client stops', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    const client = makeClient(fetchMock);

    client.sendAction({ type: 'fire' });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    client.stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
