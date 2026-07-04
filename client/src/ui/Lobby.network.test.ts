/**
 * Lobby.network.test.ts — CHARACTERIZATION harness for the Lobby's untested
 * Edge-Function network layer (7 actions, all routed through the shared
 * `callFunction(name, body)` transport in ../lib/edgeFunctions).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Lobby.ts is a ~2177-line god module with no test instantiating it. These
 * tests PIN THE CURRENT BEHAVIOR of its network layer so a follow-up refactor
 * can extract a LobbyTransport / session seam and prove parity by keeping this
 * file green, unchanged. It is the ORACLE for that refactor: the assertions are
 * deliberately tight (exact request URL + deep-equal body, exact success-state
 * transitions, exact error/guard strings) because a loose characterization test
 * is worthless as a parity anchor.
 *
 * TECHNIQUE (documented per instruction)
 * --------------------------------------
 * The 7 actions live in PRIVATE async methods reached only through DOM event
 * handlers. Rather than synthesize clicks through the whole render tree, we
 * drive each method directly: we reach its preconditions by writing the
 * relevant private fields (onlineName / join* / waiting* …) via a
 * typed-through-`unknown` cast, then invoke the private method. This is a
 * legitimate, well-known characterization technique for pinning legacy behavior
 * before a seam exists — it couples to the CURRENT internal field names on
 * purpose (that coupling is what proves the refactor preserved them).
 *
 * Mocking mirrors NetworkClient.requestRematch.test.ts / edgeFunctions.test.ts:
 *   - global `fetch` stubbed via vi.stubGlobal (no real network),
 *   - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY stubbed via vi.stubEnv.
 * The create/join SUCCESS paths call subscribeWaitingRoom(), which lazily
 * dynamic-imports ../lib/supabase → createClient(). We mock
 * '@supabase/supabase-js' so that returns a no-op fake channel, letting the REAL
 * success transition run without touching Realtime.
 *
 * This file adds ONLY tests — Lobby.ts (product code) is unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Lobby } from './Lobby';
import { readSession, writeSession } from '../lib/sessionDescriptor';

// The waiting-room Realtime subscription lazily does `await import('../lib/supabase')`,
// which calls createClient() at module load. Mock the SDK so that returns a fake
// client whose channel().on().on().subscribe() are no-op spies and removeChannel
// is a no-op — the create/join success-path state transition still runs for real.
vi.mock('@supabase/supabase-js', () => {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };
  return {
    createClient: vi.fn(() => ({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    })),
  };
});

// ---- Private-surface access (typed-through-unknown cast) -------------------

/** The private methods + fields these characterization tests reach into. */
interface LobbyInternals {
  handleCreateRoom(): Promise<void>;
  handleJoinRoom(): Promise<void>;
  fetchRooms(): Promise<void>;
  startHeartbeat(): void;
  stopHeartbeat(): void;
  handleReadyUp(): Promise<void>;
  handleLeaveRoom(): Promise<void>;
  updateMe(fields: { name?: string; color?: string }): Promise<void>;
  cleanupWaitingChannel(): void;
  [key: string]: unknown;
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals;
}

// ---- Fetch mock helpers -----------------------------------------------------

interface FakeResponse {
  ok?: boolean;
  status?: number;
  json?: () => unknown;
}

/** Stub global fetch with a single canned Response-like value. */
function stubFetch(res: FakeResponse = {}): Mock {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: res.ok ?? true,
    status: res.status ?? 200,
    json: async () => (res.json ? res.json() : {}),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Decode the URL + parsed JSON body of a fetch call (defaults to the last). */
function callAt(fetchMock: Mock, i = fetchMock.mock.calls.length - 1): { url: string; body: unknown } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

const fnUrl = (name: string): string => `https://example.supabase.co/functions/v1/${name}`;

/** Let the void-ed subscribeWaitingRoom()'s dynamic import + chain settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ---- Suite ------------------------------------------------------------------

describe('Lobby network layer (characterization of the 7 Edge-Function actions)', () => {
  let root: HTMLDivElement;
  let onReady: Mock;
  let lobby: Lobby;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    try {
      localStorage.clear();
    } catch {
      /* jsdom localStorage always present, but stay defensive */
    }
    root = document.createElement('div');
    document.body.appendChild(root);
    onReady = vi.fn();
    lobby = new Lobby(root, onReady);
  });

  afterEach(() => {
    // Tear down any heartbeat interval a success-path test may have started.
    try {
      internals(lobby).cleanupWaitingChannel();
    } catch {
      /* nothing to clean */
    }
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    root.remove();
  });

  // ========================================================================
  // 1. create_room  (handleCreateRoom)
  // ========================================================================
  describe('create_room', () => {
    it('GUARD: empty name sets the error and never calls fetch', async () => {
      const fetchMock = stubFetch();
      internals(lobby).onlineName = '   '; // whitespace trims to empty

      await internals(lobby).handleCreateRoom();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(internals(lobby).onlineError).toBe('Enter your name.');
      expect(internals(lobby).onlineSubView).toBe('create');
    });

    it('REQUEST (minimal): omits every conditional field — only maxPlayers + visibility', async () => {
      const fetchMock = stubFetch({ json: () => ({ error: 'stop-here' }) });
      // All optional inputs left at their blank defaults; 0 bots.
      internals(lobby).onlineName = 'Alice';
      // onlineColor default = Red, onlineMaxPlayers default = 2, visibility default = public.

      await internals(lobby).handleCreateRoom();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, body } = callAt(fetchMock);
      expect(url).toBe(fnUrl('create_room'));
      expect(body).toEqual({
        playerName: 'Alice',
        color: '#e84d4d',
        options: { maxPlayers: 2, visibility: 'public' },
      });
      // No conditional keys leaked into the body.
      const opts = (body as { options: Record<string, unknown> }).options;
      expect('maxWind' in opts).toBe(false);
      expect('gravity' in opts).toBe(false);
      expect('rounds' in opts).toBe(false);
      expect('bots' in (body as Record<string, unknown>)).toBe(false);
    });

    it('REQUEST (full): all conditional fields + bots present; rounds forced odd; economy clamped in', async () => {
      const fetchMock = stubFetch({ json: () => ({ error: 'stop-here' }) });
      Object.assign(internals(lobby), {
        onlineName: 'Alice',
        onlineColor: '#e84d4d',
        onlineMaxPlayers: 3,
        onlineVisibility: 'private',
        onlineBots: 1,
        onlineBotDifficulty: 'hard',
        onlineMaxWind: '5',
        onlineGravity: '0.25',
        onlineRounds: '4', // even -> forced to 5
        onlineInterestRate: '0.2',
        onlineSuddenDeath: '15',
        onlineArmsLevel: '3',
      });

      await internals(lobby).handleCreateRoom();

      const { body } = callAt(fetchMock);
      expect(body).toEqual({
        playerName: 'Alice',
        color: '#e84d4d',
        // 1 CPU seat gets the first palette color NOT used by the creator (Blue).
        bots: [{ name: 'CPU 1', color: '#4d8ce8', ai: 'hard' }],
        options: {
          maxPlayers: 3,
          visibility: 'private',
          maxWind: 5,
          gravity: 0.25,
          rounds: 5,
          interestRate: 0.2,
          suddenDeathTurn: 15,
          armsLevel: 3,
        },
      });
    });

    it('REQUEST: out-of-range wind/gravity are clamped into their bounds', async () => {
      const fetchMock = stubFetch({ json: () => ({ error: 'stop-here' }) });
      Object.assign(internals(lobby), {
        onlineName: 'Alice',
        onlineMaxWind: '999', // clamp -> WIND_MAX 10
        onlineGravity: '0.001', // clamp -> GRAVITY_MIN 0.05
      });

      await internals(lobby).handleCreateRoom();

      const opts = (callAt(fetchMock).body as { options: Record<string, unknown> }).options;
      expect(opts.maxWind).toBe(10);
      expect(opts.gravity).toBe(0.05);
    });

    it('SUCCESS: adopts room/player/token, seat token persisted, transitions to waiting', async () => {
      stubFetch({
        json: () => ({
          roomId: 'room-9',
          code: 'ZZZZ',
          playerId: 'pp',
          token: 'tk',
          players: [{ id: 'pp', name: 'Alice', color: '#e84d4d', ready: false }],
        }),
      });
      internals(lobby).onlineName = 'Alice';

      await internals(lobby).handleCreateRoom();

      expect(internals(lobby).waitingRoomId).toBe('room-9');
      expect(internals(lobby).waitingRoomCode).toBe('ZZZZ');
      expect(internals(lobby).waitingPlayerId).toBe('pp');
      expect(internals(lobby).waitingToken).toBe('tk');
      expect(internals(lobby).waitingPlayers).toEqual([
        { id: 'pp', name: 'Alice', color: '#e84d4d', ready: false },
      ]);
      expect(internals(lobby).onlineSubView).toBe('waiting');
      expect(internals(lobby).onlineBusy).toBe(false);
      expect(internals(lobby).onlineError).toBe('');
      // ADR-0009 seat token persisted keyed by PUBLIC playerId.
      expect(localStorage.getItem('singedterra:seat:pp')).toBe('tk');

      await flush(); // settle the void-ed subscribeWaitingRoom()
    });

    it('SUCCESS: T-06 — writes the session descriptor { roomId, roomCode, playerId }', async () => {
      stubFetch({
        json: () => ({
          roomId: 'room-9',
          code: 'ZZZZ',
          playerId: 'pp',
          token: 'tk',
          players: [{ id: 'pp', name: 'Alice', color: '#e84d4d', ready: false }],
        }),
      });
      internals(lobby).onlineName = 'Alice';

      await internals(lobby).handleCreateRoom();

      expect(readSession()).toEqual({ roomId: 'room-9', roomCode: 'ZZZZ', playerId: 'pp' });

      await flush();
    });

    it('SUCCESS: falls back to a solo player list when the response omits players', async () => {
      stubFetch({
        json: () => ({ roomId: 'r', code: 'CCCC', playerId: 'me', token: 't' }),
      });
      Object.assign(internals(lobby), { onlineName: 'Solo', onlineColor: '#a855f7' });

      await internals(lobby).handleCreateRoom();

      expect(internals(lobby).waitingPlayers).toEqual([
        { id: 'me', name: 'Solo', color: '#a855f7', ready: false },
      ]);
      await flush();
    });

    it('ERROR: { error } response surfaces the message and does NOT transition', async () => {
      const fetchMock = stubFetch({ ok: false, json: () => ({ error: 'Name already taken' }) });
      internals(lobby).onlineName = 'Alice';

      await internals(lobby).handleCreateRoom();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(internals(lobby).onlineError).toBe('Name already taken');
      expect(internals(lobby).onlineSubView).toBe('create');
      expect(internals(lobby).waitingRoomId).toBe('');
      expect(internals(lobby).onlineBusy).toBe(false);
    });

    it('ERROR: generic fallback when a non-ok response carries no error string', async () => {
      stubFetch({ ok: false, json: () => ({}) });
      internals(lobby).onlineName = 'Alice';

      await internals(lobby).handleCreateRoom();

      expect(internals(lobby).onlineError).toBe('Failed to create room.');
      expect(internals(lobby).onlineSubView).toBe('create');
    });

    it('GUARD (contract drift): a 200 missing roomId/code/playerId/token sets the "Unexpected server response" error', async () => {
      stubFetch({ json: () => ({ roomId: 'r', code: 'CCCC' /* playerId + token missing */ }) });
      internals(lobby).onlineName = 'Alice';

      await internals(lobby).handleCreateRoom();

      expect(internals(lobby).onlineError).toBe('Unexpected server response — please try again.');
      expect(internals(lobby).onlineSubView).toBe('create');
      expect(internals(lobby).waitingRoomId).toBe('');
    });

    it('ERROR: a rejected fetch resolves to the network-error message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
      internals(lobby).onlineName = 'Alice';

      await internals(lobby).handleCreateRoom();

      expect(internals(lobby).onlineError).toBe('Network error. Try again.');
      expect(internals(lobby).onlineSubView).toBe('create');
    });
  });

  // ========================================================================
  // 2. join_room  (handleJoinRoom -> joinByCode)
  // ========================================================================
  describe('join_room', () => {
    it('GUARD: an invalid (short) code sets the error and never calls fetch', async () => {
      const fetchMock = stubFetch();
      internals(lobby).joinCode = 'AB'; // < 4 chars
      internals(lobby).onlineName = 'Bob';

      await internals(lobby).handleJoinRoom();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(internals(lobby).onlineError).toBe('Enter a 4-character room code.');
    });

    it('GUARD: a valid code but empty name sets the name error and never calls fetch', async () => {
      const fetchMock = stubFetch();
      internals(lobby).joinCode = 'WXYZ';
      internals(lobby).onlineName = '  ';

      await internals(lobby).handleJoinRoom();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(internals(lobby).onlineError).toBe('Enter your name.');
    });

    it('REQUEST: POSTs { code (upper-cased), playerName, color }', async () => {
      const fetchMock = stubFetch({ json: () => ({ error: 'stop-here' }) });
      Object.assign(internals(lobby), {
        joinCode: 'wxyz',
        onlineName: 'Bob',
        joinColor: '#4d8ce8',
      });

      await internals(lobby).handleJoinRoom();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, body } = callAt(fetchMock);
      expect(url).toBe(fnUrl('join_room'));
      expect(body).toEqual({ code: 'WXYZ', playerName: 'Bob', color: '#4d8ce8' });
    });

    it('SUCCESS: adopts room/seed/options/players + local code, persists token, transitions to waiting', async () => {
      const options = { maxPlayers: 2, maxWind: 8, gravity: 0.3, rounds: 3 };
      const players = [{ id: 'jp', name: 'Bob', color: '#4d8ce8', ready: false }];
      stubFetch({
        json: () => ({ roomId: 'jr', playerId: 'jp', token: 'jt', seed: 7, options, players }),
      });
      Object.assign(internals(lobby), { joinCode: 'WXYZ', onlineName: 'Bob' });

      await internals(lobby).handleJoinRoom();

      expect(internals(lobby).waitingRoomId).toBe('jr');
      // Room code comes from the local (uppercased) code, not the response.
      expect(internals(lobby).waitingRoomCode).toBe('WXYZ');
      expect(internals(lobby).waitingPlayerId).toBe('jp');
      expect(internals(lobby).waitingToken).toBe('jt');
      expect(internals(lobby).waitingSeed).toBe(7);
      expect(internals(lobby).waitingOptions).toEqual(options);
      expect(internals(lobby).waitingPlayers).toEqual(players);
      expect(internals(lobby).onlineSubView).toBe('waiting');
      expect(localStorage.getItem('singedterra:seat:jp')).toBe('jt');

      await flush();
    });

    it('SUCCESS: T-06 — writes the session descriptor { roomId, roomCode, playerId }', async () => {
      stubFetch({
        json: () => ({ roomId: 'jr', playerId: 'jp', token: 'jt', seed: 7 }),
      });
      Object.assign(internals(lobby), { joinCode: 'WXYZ', onlineName: 'Bob' });

      await internals(lobby).handleJoinRoom();

      expect(readSession()).toEqual({ roomId: 'jr', roomCode: 'WXYZ', playerId: 'jp' });

      await flush();
    });

    it('SUCCESS: defaults seed/options/players when the response omits them', async () => {
      stubFetch({ json: () => ({ roomId: 'jr', playerId: 'jp', token: 'jt' }) });
      Object.assign(internals(lobby), { joinCode: 'WXYZ', onlineName: 'Bob' });

      await internals(lobby).handleJoinRoom();

      expect(internals(lobby).waitingSeed).toBe(0);
      expect(internals(lobby).waitingOptions).toEqual({ maxPlayers: 2, maxWind: 10, gravity: 0.15 });
      expect(internals(lobby).waitingPlayers).toEqual([]);
      await flush();
    });

    it('ERROR: { error } response surfaces the message and does NOT transition', async () => {
      stubFetch({ ok: false, json: () => ({ error: 'Room is full' }) });
      Object.assign(internals(lobby), { joinCode: 'WXYZ', onlineName: 'Bob' });

      await internals(lobby).handleJoinRoom();

      expect(internals(lobby).onlineError).toBe('Room is full');
      expect(internals(lobby).onlineSubView).toBe('create');
      expect(internals(lobby).waitingRoomId).toBe('');
    });

    it('GUARD (contract drift): a 200 missing roomId/playerId/token sets the "Unexpected server response" error', async () => {
      stubFetch({ json: () => ({ roomId: 'jr' /* playerId + token missing */ }) });
      Object.assign(internals(lobby), { joinCode: 'WXYZ', onlineName: 'Bob' });

      await internals(lobby).handleJoinRoom();

      expect(internals(lobby).onlineError).toBe('Unexpected server response — please try again.');
      expect(internals(lobby).onlineSubView).toBe('create');
    });
  });

  // ========================================================================
  // 3. list_rooms  (fetchRooms)
  // ========================================================================
  describe('list_rooms', () => {
    it('REQUEST: POSTs an empty body to list_rooms', async () => {
      const fetchMock = stubFetch({ json: () => ({ rooms: [] }) });
      internals(lobby).onlineSubView = 'browse';

      await internals(lobby).fetchRooms();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, body } = callAt(fetchMock);
      expect(url).toBe(fnUrl('list_rooms'));
      expect(body).toEqual({});
    });

    it('SUCCESS: adopts the returned rooms and clears the error (on the browse view)', async () => {
      const rooms = [
        { roomId: 'r1', code: 'AAAA', hostName: 'Al', playerCount: 1, maxPlayers: 2, rounds: 1, armsLevel: 4, botCount: 0 },
      ];
      stubFetch({ json: () => ({ rooms }) });
      internals(lobby).onlineSubView = 'browse';
      internals(lobby).onlineError = 'stale error';

      await internals(lobby).fetchRooms();

      expect(internals(lobby).browseRooms).toEqual(rooms);
      expect(internals(lobby).onlineError).toBe('');
    });

    it('SUCCESS: defaults to an empty list when the response omits rooms', async () => {
      stubFetch({ json: () => ({}) });
      internals(lobby).onlineSubView = 'browse';

      await internals(lobby).fetchRooms();

      expect(internals(lobby).browseRooms).toEqual([]);
    });

    it('ERROR: { error } response surfaces the message (on the browse view)', async () => {
      stubFetch({ ok: false, json: () => ({ error: 'Service down' }) });
      internals(lobby).onlineSubView = 'browse';

      await internals(lobby).fetchRooms();

      expect(internals(lobby).onlineError).toBe('Service down');
    });

    it('GUARD: still fetches but ignores the result if the user navigated away from browse', async () => {
      const fetchMock = stubFetch({ json: () => ({ rooms: [{ roomId: 'x' }] }) });
      internals(lobby).onlineSubView = 'create'; // not browsing anymore

      await internals(lobby).fetchRooms();

      // The request WAS issued (fetch precedes the view check)...
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // ...but the response is dropped: no repaint, no state change.
      expect(internals(lobby).browseRooms).toEqual([]);
    });
  });

  // ========================================================================
  // 4. heartbeat  (startHeartbeat — fire-and-forget on a 10s interval)
  // ========================================================================
  describe('heartbeat', () => {
    it('REQUEST: fires heartbeat with { roomId, playerId, token } once per 10s tick', () => {
      vi.useFakeTimers();
      const fetchMock = stubFetch({ json: () => ({}) });
      Object.assign(internals(lobby), {
        waitingRoomId: 'room-1',
        waitingPlayerId: 'p-1',
        waitingToken: 'tok',
      });

      internals(lobby).startHeartbeat();

      // Nothing before the first interval elapses.
      expect(fetchMock).not.toHaveBeenCalled();
      vi.advanceTimersByTime(9999);
      expect(fetchMock).not.toHaveBeenCalled();

      // At 10s the first heartbeat POSTs synchronously (fetch is issued before
      // callFunction's first await).
      vi.advanceTimersByTime(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, body } = callAt(fetchMock);
      expect(url).toBe(fnUrl('heartbeat'));
      expect(body).toEqual({ roomId: 'room-1', playerId: 'p-1', token: 'tok' });

      // It repeats on the interval.
      vi.advanceTimersByTime(10000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      internals(lobby).stopHeartbeat();
    });
  });

  // ========================================================================
  // 5. ready_up  (handleReadyUp)
  // ========================================================================
  describe('ready_up', () => {
    /** Seed a clean, clash-free single-seat waiting room for THIS client. */
    function seedWaiting(): void {
      Object.assign(internals(lobby), {
        waitingRoomId: 'room-1',
        waitingRoomCode: 'ABCD',
        waitingPlayerId: 'p-1',
        waitingToken: 'tok',
        waitingSeed: 42,
        waitingOptions: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
        waitingPlayers: [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false }],
      });
    }

    it('GUARD: a color clash blocks ready-up (no fetch, defense-in-depth error)', async () => {
      const fetchMock = stubFetch();
      Object.assign(internals(lobby), {
        waitingPlayerId: 'p-1',
        waitingPlayers: [
          { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false },
          { id: 'p-2', name: 'Bob', color: '#e84d4d', ready: false }, // same color
        ],
      });

      await internals(lobby).handleReadyUp();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(internals(lobby).onlineError).toBe(
        'Another player already has your name or color. Change it above to start.',
      );
    });

    it('REQUEST: POSTs { roomId, playerId, token }', async () => {
      const fetchMock = stubFetch({ json: () => ({ error: 'stop-here' }) });
      seedWaiting();

      await internals(lobby).handleReadyUp();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, body } = callAt(fetchMock);
      expect(url).toBe(fnUrl('ready_up'));
      expect(body).toEqual({ roomId: 'room-1', playerId: 'p-1', token: 'tok' });
    });

    it('SUCCESS (not started): marks self ready, adopts players, does NOT emit', async () => {
      const players = [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: true }];
      stubFetch({ json: () => ({ started: false, players }) });
      seedWaiting();

      await internals(lobby).handleReadyUp();

      expect(internals(lobby).waitingThisPlayerReady).toBe(true);
      expect(internals(lobby).waitingPlayers).toEqual(players);
      expect(internals(lobby).onlineBusy).toBe(false);
      expect(onReady).not.toHaveBeenCalled();
    });

    it('SUCCESS (started): emits a network LobbyConfig built from waiting state', async () => {
      const players = [
        { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: true },
        { id: 'p-2', name: 'Bob', color: '#4d8ce8', ready: true },
      ];
      stubFetch({ json: () => ({ started: true, players }) });
      seedWaiting();

      await internals(lobby).handleReadyUp();

      expect(internals(lobby).waitingThisPlayerReady).toBe(true);
      expect(onReady).toHaveBeenCalledTimes(1);
      const config = onReady.mock.calls[0][0];
      expect(config).toEqual({
        mode: 'network',
        players: [
          { id: 'p-1', name: 'Alice', color: '#e84d4d' },
          { id: 'p-2', name: 'Bob', color: '#4d8ce8' },
        ],
        playerNames: ['Alice', 'Bob'],
        roomCode: 'ABCD',
        roomId: 'room-1',
        playerId: 'p-1',
        token: 'tok',
        settings: { seed: 42, maxWind: 10, gravity: 0.15 },
      });
    });

    it('ERROR: { error } response surfaces the message and does NOT ready up', async () => {
      stubFetch({ ok: false, json: () => ({ error: 'Not enough players' }) });
      seedWaiting();

      await internals(lobby).handleReadyUp();

      expect(internals(lobby).onlineError).toBe('Not enough players');
      expect(internals(lobby).waitingThisPlayerReady).toBe(false);
      expect(onReady).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 6. leave_room  (handleLeaveRoom — best-effort)
  // ========================================================================
  describe('leave_room', () => {
    it('REQUEST: POSTs { roomId, playerId, token } then returns to the create view', async () => {
      const fetchMock = stubFetch({ json: () => ({}) });
      Object.assign(internals(lobby), {
        waitingRoomId: 'room-1',
        waitingPlayerId: 'p-1',
        waitingToken: 'tok',
        onlineSubView: 'waiting',
        onlineError: 'stale',
      });

      await internals(lobby).handleLeaveRoom();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, body } = callAt(fetchMock);
      expect(url).toBe(fnUrl('leave_room'));
      expect(body).toEqual({ roomId: 'room-1', playerId: 'p-1', token: 'tok' });
      expect(internals(lobby).onlineSubView).toBe('create');
      expect(internals(lobby).onlineError).toBe('');
    });

    it('BEST-EFFORT: still returns to the create view when the leave POST rejects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
      Object.assign(internals(lobby), {
        waitingRoomId: 'room-1',
        waitingPlayerId: 'p-1',
        waitingToken: 'tok',
        onlineSubView: 'waiting',
      });

      await internals(lobby).handleLeaveRoom();

      expect(internals(lobby).onlineSubView).toBe('create');
    });

    it('T-07: clears the session descriptor on explicit leave', async () => {
      stubFetch({ json: () => ({}) });
      writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' });
      Object.assign(internals(lobby), {
        waitingRoomId: 'room-1',
        waitingPlayerId: 'p-1',
        waitingToken: 'tok',
        onlineSubView: 'waiting',
      });
      expect(readSession()).not.toBeNull();

      await internals(lobby).handleLeaveRoom();

      expect(readSession()).toBeNull();
    });

    it('T-07: clears the session descriptor even when the leave POST rejects (best-effort)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
      writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' });
      Object.assign(internals(lobby), {
        waitingRoomId: 'room-1',
        waitingPlayerId: 'p-1',
        waitingToken: 'tok',
        onlineSubView: 'waiting',
      });

      await internals(lobby).handleLeaveRoom();

      expect(readSession()).toBeNull();
    });
  });

  // ========================================================================
  // 7. update_player  (updateMe)
  // ========================================================================
  describe('update_player', () => {
    function seedWaiting(): void {
      Object.assign(internals(lobby), {
        waitingRoomId: 'room-1',
        waitingPlayerId: 'p-1',
        waitingToken: 'tok',
        waitingPlayers: [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false }],
      });
    }

    it('REQUEST (name only): POSTs { roomId, playerId, token, name }', async () => {
      const fetchMock = stubFetch({ json: () => ({ error: 'stop-here' }) });
      seedWaiting();

      await internals(lobby).updateMe({ name: 'Zed' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, body } = callAt(fetchMock);
      expect(url).toBe(fnUrl('update_player'));
      expect(body).toEqual({ roomId: 'room-1', playerId: 'p-1', token: 'tok', name: 'Zed' });
    });

    it('REQUEST (color only): POSTs { roomId, playerId, token, color }', async () => {
      const fetchMock = stubFetch({ json: () => ({ error: 'stop-here' }) });
      seedWaiting();

      await internals(lobby).updateMe({ color: '#4de87a' });

      const { body } = callAt(fetchMock);
      expect(body).toEqual({ roomId: 'room-1', playerId: 'p-1', token: 'tok', color: '#4de87a' });
    });

    it('SUCCESS: adopts the returned players list', async () => {
      const players = [{ id: 'p-1', name: 'Zed', color: '#e84d4d', ready: false }];
      stubFetch({ json: () => ({ players }) });
      seedWaiting();

      await internals(lobby).updateMe({ name: 'Zed' });

      expect(internals(lobby).waitingPlayers).toEqual(players);
      expect(internals(lobby).onlineBusy).toBe(false);
      expect(internals(lobby).onlineError).toBe('');
    });

    it('ERROR (taken): surfaces the server error WITHOUT mutating local players', async () => {
      const before = [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false }];
      stubFetch({ ok: false, json: () => ({ error: 'Color already taken' }) });
      seedWaiting();

      await internals(lobby).updateMe({ color: '#4d8ce8' });

      expect(internals(lobby).onlineError).toBe('Color already taken');
      expect(internals(lobby).waitingPlayers).toEqual(before); // unchanged
    });
  });
});
