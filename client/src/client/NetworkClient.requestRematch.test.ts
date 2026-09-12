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
import { buildClientEngineOptions } from './gameEngineOptions';
import { rematchToConfig } from './rematchConfig';
import { GameEngine } from '@shared/engine/GameEngine';

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
    2,
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

  it('normalizes walls only for a protected-floor successor', async () => {
    async function resolveSuccessor(walls: unknown, rulesetVersion: 1 | 4) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve({
          data: {
            id: 'room-next',
            code: 'NEXT42',
            seed: 42,
            options: { maxPlayers: 2, maxWind: 8, gravity: 0.2, walls, rulesetVersion, commandProtocolVersion: 2 },
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

    const current = await resolveSuccessor('wrap', 4);
    expect(current.options.walls).toBe('wrap');
    expect(current.options.rulesetVersion).toBe(4);

    expect((await resolveSuccessor('invalid', 4)).options.walls).toBe('open');
  });

  it('refuses a legacy successor before it can construct a mixed-floor rematch', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({
        data: {
          id: 'room-legacy', code: 'OLD42', seed: 42,
          options: { maxPlayers: 2, maxWind: 8, gravity: 0.2, rulesetVersion: 3 },
          players: [
            { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
            { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
          ],
        },
        error: null,
      }),
    };
    const client = makeClient({ from: () => query } as unknown as SupabaseClient);
    const listener = vi.fn();
    client.onRematch(listener);

    await (client as unknown as { handleRematch(newRoomId: string): Promise<void> }).handleRematch('room-legacy');

    expect(listener).not.toHaveBeenCalled();
  });

  it.each([undefined, 1] as const)('refuses a successor with command protocol %s', async (commandProtocolVersion) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({
        data: {
          id: 'room-command-legacy', code: 'OLDCP', seed: 42,
          options: {
            maxPlayers: 2, maxWind: 8, gravity: 0.2, rulesetVersion: 4,
            ...(commandProtocolVersion === undefined ? {} : { commandProtocolVersion }),
          },
          players: [
            { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
            { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
          ],
        },
        error: null,
      }),
    };
    const client = makeClient({ from: () => query } as unknown as SupabaseClient);
    const listener = vi.fn();
    client.onRematch(listener);

    await (client as unknown as { handleRematch(newRoomId: string): Promise<void> })
      .handleRematch('room-command-legacy');

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps polling when the successor appears after the old eight-attempt cutoff', async () => {
    let reads = 0;
    const successor = {
      id: 'room-late',
      code: 'LATE42',
      seed: 42,
      options: { maxPlayers: 2, maxWind: 8, gravity: 0.2, rulesetVersion: 4, commandProtocolVersion: 2 },
      players: [
        { id: 'player-abc', name: 'Alice', color: '#e84d4d' },
        { id: 'player-def', name: 'Bob', color: '#4d8ce8' },
      ],
    };
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => {
        reads += 1;
        return Promise.resolve({
          data: reads > 8 ? successor : null,
          error: null,
        });
      },
    };
    const client = makeClient({ from: () => query } as unknown as SupabaseClient);
    const listener = vi.fn();
    client.onRematch(listener);

    await (client as unknown as {
      handleRematch(newRoomId: string): Promise<void>;
    }).handleRematch('room-late');

    expect(reads).toBe(9);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].roomId).toBe('room-late');
  });

  it('preserves every authoritative successor option and CPU seat through callback, config, and engine projection', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({
        data: {
          id: 'room-rich',
          code: 'RICH42',
          seed: 4242,
          options: {
            maxPlayers: 4,
            maxWind: 6,
            gravity: 0.25,
            rulesetVersion: 4,
            commandProtocolVersion: 2,
            walls: 'reflective',
            battlefieldWorld: 'obsidian-caldera',
            hazards: 'lava',
            rounds: 5,
            interestRate: 0.15,
            suddenDeathTurn: 12,
            armsLevel: 3,
            teamMode: true,
          },
          players: [
            { id: 'player-abc', name: 'Alice', color: '#e84d4d', team: 1 },
            { id: 'player-def', name: 'CPU Bob', color: '#4d8ce8', ai: 'medium', team: 1 },
            { id: 'player-ghi', name: 'Carol', color: '#a855f7', team: 2 },
            { id: 'player-jkl', name: 'Dan', color: '#f59e0b', team: 2 },
          ],
        },
        error: null,
      }),
    };
    const client = makeClient({ from: () => query } as unknown as SupabaseClient);
    const listener = vi.fn();
    client.onRematch(listener);

    await (client as unknown as { handleRematch(newRoomId: string): Promise<void> }).handleRematch('room-rich');

    const info = listener.mock.calls[0]![0];
    const config = rematchToConfig(info, 'player-abc');
    const options = buildClientEngineOptions({ ...config, mode: 'network' });
    expect(options).toMatchObject({
      maxPlayers: 4,
      maxWind: 6,
      gravity: 0.25,
      walls: 'reflective',
      battlefieldWorld: 'obsidian-caldera',
      hazards: 'lava',
      rounds: 5,
      interestRate: 0.15,
      suddenDeathTurn: 12,
      armsLevel: 3,
      teamMode: true,
    });
    expect(info.options.commandProtocolVersion).toBe(2);
    expect(config.settings.commandProtocolVersion).toBe(2);
    expect(options.players[1]).toMatchObject({ id: 'player-def', ai: 'medium' });
    const engine = new GameEngine(options);
    expect(engine.getState()).toMatchObject({ round: 1, totalRounds: 5 });
    expect(engine.getState().tanks).toHaveLength(4);
    expect(engine.getState().tanks.map((tank) => tank.team)).toEqual([1, 1, 2, 2]);
    expect(engine.getState().tanks[1]).toMatchObject({ id: 'p2', ai: 'medium' });
  });
});
