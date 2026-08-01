import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkClient } from './NetworkClient';

const OPTIONS = {
  maxPlayers: 2,
  seed: 1,
  players: [
    { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
    { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
  ],
};

const conflict = () => ({
  ok: false,
  json: async () => ({ ok: false, error: 'seq_conflict', retry: true }),
});

const accepted = () => ({
  ok: true,
  json: async () => ({ ok: true, seq: 0 }),
});

async function settleFetch(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeClient(
  fetchMock: ReturnType<typeof vi.fn>,
  rulesetVersion?: 1 | 2,
): NetworkClient {
  vi.stubGlobal('fetch', fetchMock);
  return new NetworkClient(
    {} as unknown as SupabaseClient,
    'room-1',
    'player-abc',
    { ...OPTIONS, ...(rulesetVersion === undefined ? {} : { rulesetVersion }) },
    'seat-token-test',
  );
}

describe('NetworkClient — human seq-conflict retry (#120)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('retries one human conflict at 40ms with the identical payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(accepted());
    const client = makeClient(fetchMock);

    client.sendAction({ type: 'fire' });
    await settleFetch();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(39);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(retryInit.body).toBe(firstInit.body);
    expect(JSON.parse(firstInit.body as string).rulesetVersion).toBe(1);

    client.stop();
  });

  it('preserves an authoritative v2 room version across a human retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(accepted());
    const client = makeClient(fetchMock, 2);

    client.sendAction({ type: 'fire' });
    await settleFetch();
    await vi.advanceTimersByTimeAsync(40);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(JSON.parse(init.body as string).rulesetVersion).toBe(2);
    }

    client.stop();
  });

  it('bounds persistent conflicts at five retries and releases the firing lock', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => conflict());
    const client = makeClient(fetchMock);
    const failure = vi.fn();
    client.onFireFailed(failure);

    client.sendAction({ type: 'fire' });
    await settleFetch();
    expect(failure).not.toHaveBeenCalled();
    expect(client.isFiring).toBe(true);
    let expectedPosts = 1;
    for (const delay of [40, 80, 160, 240, 240]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetchMock).toHaveBeenCalledTimes(expectedPosts);
      expect(failure).not.toHaveBeenCalled();
      expect(client.isFiring).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expectedPosts += 1;
      expect(fetchMock).toHaveBeenCalledTimes(expectedPosts);
      if (expectedPosts < 6) {
        expect(failure).not.toHaveBeenCalled();
        expect(client.isFiring).toBe(true);
      }
    }

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledWith('Shot kept colliding — try again.');
    expect(client.isFiring).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);

    client.stop();
  });

  it('cancels a scheduled retry when the client stops', async () => {
    const fetchMock = vi.fn().mockResolvedValue(conflict());
    const client = makeClient(fetchMock);

    client.sendAction({ type: 'fire' });
    await settleFetch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    client.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
