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
import { describe, it, expect, vi } from 'vitest';

type QueryResult = { data: unknown; error: { message?: string } | null };

let nextResult: QueryResult = { data: null, error: null };
let fromArg: string | undefined;
let eqArgs: [string, unknown] | undefined;

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => ({
      from: (table: string) => {
        fromArg = table;
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = (col: string, val: unknown) => {
          eqArgs = [col, val];
          return builder;
        };
        builder.maybeSingle = () => Promise.resolve(nextResult);
        return builder;
      },
    })),
  };
});

// Imported after the mock so the lazily-created client picks it up.
import { LobbyTransport } from './LobbyTransport';

describe('LobbyTransport.fetchRoom (T-08)', () => {
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
