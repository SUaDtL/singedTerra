/**
 * LobbyTransport.fetchRoom.test.ts — T-08 (rejoin-after-refresh, AC-05/AC-06).
 *
 * fetchRoom(roomId) is a direct `rooms` table SELECT (not an Edge Function call),
 * used by the rejoin flow to validate a stored session descriptor against the
 * room's live status and rebuild a network config. It reads ONLY public columns
 * (id, code, seed, options, players, status) — never the secret seat token
 * (ADR-0009 split-identity keeps the token out of any queryable column).
 *
 * Mocking mirrors Lobby.network.test.ts: `../lib/supabase` lazily calls
 * `createClient()` from '@supabase/supabase-js' at module load, so we mock that
 * SDK entry point to return a fake client whose `.from('rooms')` yields a
 * chainable thenable builder we control per test.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null };

let nextResult: QueryResult = { data: null, error: null };
let queuedResults: QueryResult[] = [];
let selectedColumns: string[] = [];
let filters: [string, unknown][] = [];
let fromArg: string | undefined;
let eqArgs: [string, unknown] | undefined;

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => ({
      from: (table: string) => {
        fromArg = table;
        const builder: Record<string, unknown> = {};
        builder.select = (columns: string) => {
          selectedColumns.push(columns);
          return builder;
        };
        builder.eq = (col: string, val: unknown) => {
          eqArgs = [col, val];
          filters.push([col, val]);
          return builder;
        };
        builder.maybeSingle = () => Promise.resolve(queuedResults.shift() ?? nextResult);
        return builder;
      },
    })),
  };
});

// Imported after the mock so the lazily-created client picks it up.
import { LobbyTransport } from './LobbyTransport';

describe('LobbyTransport.fetchRoom (T-08)', () => {
  beforeEach(() => {
    queuedResults = [];
    selectedColumns = [];
    filters = [];
  });

  it('preserves a resumable legacy room when abandoned_at has not been migrated', async () => {
    const legacyRoom = {
      id: 'room-1', code: 'ABCD', seed: 42,
      options: { maxPlayers: 2 }, players: [], status: 'active',
    };
    queuedResults = [
      { data: null, error: { code: '42703', message: 'column rooms.abandoned_at does not exist' } },
      { data: legacyRoom, error: null },
    ];

    await expect(new LobbyTransport().fetchRoom('room-1')).resolves.toEqual(legacyRoom);
    expect(selectedColumns).toEqual([
      'id, code, seed, options, players, status, abandoned_at',
      'id, code, seed, options, players, status',
    ]);
    expect(filters).toEqual([['id', 'room-1'], ['id', 'room-1']]);
  });

  it('selects from the rooms table filtered by the given id', async () => {
    nextResult = {
      data: {
        id: 'room-1',
        code: 'ABCD',
        seed: 42,
        options: { maxPlayers: 2, maxWind: 5, gravity: 0.15 },
        players: [{ id: 'p1', name: 'Alice', color: '#e84d4d', ready: true }],
        status: 'active',
      },
      error: null,
    };

    const transport = new LobbyTransport();
    await transport.fetchRoom('room-1');

    expect(fromArg).toBe('rooms');
    expect(eqArgs).toEqual(['id', 'room-1']);
  });

  it.each([
    { code: '42501', message: 'permission denied for abandoned_at' },
    { code: '42703', message: 'column rooms.seed does not exist' },
    { code: '42703' },
    { message: 'column rooms.abandoned_at does not exist' },
  ])('does not retry unrelated or unidentified errors: %j', async (error) => {
    nextResult = { data: null, error };
    await expect(new LobbyTransport().fetchRoom('room-1')).resolves.toBeNull();
    expect(selectedColumns).toHaveLength(1);
  });

  it('stops after one legacy fallback and logs only the final failure', async () => {
    const missingColumn = { code: '42703', message: 'column rooms.abandoned_at does not exist' };
    queuedResults = [
      { data: null, error: missingColumn },
      { data: null, error: missingColumn },
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(new LobbyTransport().fetchRoom('room-1')).resolves.toBeNull();
      expect(selectedColumns).toHaveLength(2);
      expect(warn).toHaveBeenCalledExactlyOnceWith('LobbyTransport.fetchRoom: select failed', missingColumn);
    } finally {
      warn.mockRestore();
    }
  });

  it('returns the shaped row for a present room', async () => {
    nextResult = {
      data: {
        id: 'room-1',
        code: 'ABCD',
        seed: 42,
        options: { maxPlayers: 2, maxWind: 5, gravity: 0.15 },
        players: [{ id: 'p1', name: 'Alice', color: '#e84d4d', ready: true }],
        status: 'active',
      },
      error: null,
    };

    const transport = new LobbyTransport();
    const room = await transport.fetchRoom('room-1');

    expect(room).toEqual({
      id: 'room-1',
      code: 'ABCD',
      seed: 42,
      options: { maxPlayers: 2, maxWind: 5, gravity: 0.15 },
      players: [{ id: 'p1', name: 'Alice', color: '#e84d4d', ready: true }],
      status: 'active',
    });
  });

  it('returns null when the room does not exist', async () => {
    nextResult = { data: null, error: null };

    const transport = new LobbyTransport();
    const room = await transport.fetchRoom('missing-room');

    expect(room).toBeNull();
  });

  it('returns null (never throws) when the fake client yields an error', async () => {
    nextResult = { data: null, error: { message: 'boom' } };

    const transport = new LobbyTransport();
    await expect(transport.fetchRoom('room-1')).resolves.toBeNull();
  });
});
