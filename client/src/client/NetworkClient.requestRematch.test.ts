/**
 * NetworkClient.requestRematch.test.ts — fetch-mocking capability seed.
 *
 * requestRematch() is a small, isolated fetch-calling code path (POST
 * functions/v1/restart_game) that survives independent of the big Realtime/
 * replay machinery elsewhere in NetworkClient, so it's a tractable target to
 * characterize now and keep useful once the NetworkClient refactors land.
 * (retry.ts's own retry/backoff contract is already covered by
 * scripts/checks/netretry.mjs — this test is about the fetch call SHAPE and
 * response handling, not retry semantics.)
 *
 * Demonstrates: mocking global fetch via vi.stubGlobal + vi.fn(), and stubbing
 * import.meta.env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) via vi.stubEnv —
 * no real network, no real Supabase, no dev server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NetworkClient } from './NetworkClient';

// requestRematch() never touches `supabase` (it only builds a fetch request from
// roomId/playerId/token), so an empty stand-in is sufficient — GameEngine
// construction in the NetworkClient constructor is what actually needs valid options.
//
// The seat token (ADR-0009 split-identity) is passed explicitly so the body-shape
// assertion below characterizes the real credential threading rather than the
// empty-string fallback readSeatToken() yields when localStorage is bare.
const SEAT_FIXTURE = 'seat-fixture-abc';
function makeClient(fakeSupabase = {} as unknown as SupabaseClient): NetworkClient {
  return new NetworkClient(
    fakeSupabase,
    'room-123',
    'player-abc',
    {
      maxPlayers: 2,
      seed: 1,
      players: [
        { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
        { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
      ],
    },
    SEAT_FIXTURE,
  );
}

describe('NetworkClient.requestRematch (fetch mocking + import.meta.env stubbing)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('POSTs restart_game with the room/player ids and resolves { ok: true } on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    const result = await client.requestRematch();

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://example.supabase.co/functions/v1/restart_game');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Authorization']).toBe('Bearer anon-key-test');
    expect(init.headers['apikey']).toBe('anon-key-test');
    // ADR-0009: every mutating Edge Function POST carries the secret seat token.
    expect(JSON.parse(init.body as string)).toEqual({
      roomId: 'room-123',
      playerId: 'player-abc',
      token: SEAT_FIXTURE,
    });
  });

  it('surfaces the server error message when restart_game responds { ok: false }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: 'room already restarted' }),
      }),
    );

    const client = makeClient();
    const result = await client.requestRematch();

    expect(result).toEqual({ ok: false, error: 'room already restarted' });
  });

  it('falls back to a generic error when the response body has no error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    );

    const client = makeClient();
    const result = await client.requestRematch();

    expect(result).toEqual({ ok: false, error: 'Failed to start rematch' });
  });

  it('never throws — a rejected fetch resolves to { ok: false, error: "Network error" }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    const client = makeClient();
    await expect(client.requestRematch()).resolves.toEqual({ ok: false, error: 'Network error' });
  });

  it('normalizes walls and preserves either authoritative ruleset when resolving a successor', async () => {
    async function resolveSuccessor(walls: unknown, rulesetVersion: 1 | 2) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({
          data: {
            id: 'room-next',
            code: 'NEXT42',
            seed: 42,
            options: { maxPlayers: 2, maxWind: 8, gravity: 0.2, walls, rulesetVersion },
            players: [
              { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
              { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
            ],
          },
          error: null,
        }),
      };
      const client = makeClient({
        from: () => query,
      } as unknown as SupabaseClient);
      const listener = vi.fn();
      client.onRematch(listener);

      await (client as unknown as {
        handleRematch(newRoomId: string): Promise<void>;
      }).handleRematch('room-next');

      expect(listener).toHaveBeenCalledTimes(1);
      return listener.mock.calls[0]![0];
    }

    const legacy = await resolveSuccessor('wrap', 1);
    expect(legacy.options.walls).toBe('wrap');
    expect(legacy.options.rulesetVersion).toBe(1);

    const current = await resolveSuccessor('wrap', 2);
    expect(current.options.walls).toBe('wrap');
    expect(current.options.rulesetVersion).toBe(2);

    expect((await resolveSuccessor('invalid', 2)).options.walls).toBe('open');
  });
});
