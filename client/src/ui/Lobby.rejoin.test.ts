/**
 * Lobby.rejoin.test.ts — rejoin-after-refresh (#46), T-09.
 *
 * Drives BOTH branches of AC-05: the "Rejoin your game" affordance is shown
 * ONLY when a stored session descriptor exists AND an anon `rooms` SELECT
 * confirms the room is `active` with the stored seat present; otherwise it is
 * hidden. `LobbyTransport.fetchRoom` is stubbed directly (no real Supabase
 * call), mirroring the fake-transport seam already used elsewhere in the
 * Lobby test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Lobby, type LobbyConfig } from './Lobby';
import { LobbyTransport, type FetchedRoom } from '../client/LobbyTransport';
import { writeSession, readSession, type SessionDescriptor } from '../lib/sessionDescriptor';
import { NetworkClient } from '../client/NetworkClient';

interface LobbyInternals {
  transport: LobbyTransport;
  checkRejoinCandidate(): Promise<void>;
  cleanupWaitingChannel(): void;
  handleRejoin(): Promise<void>;
  rejoinCandidate: { descriptor: SessionDescriptor; room: FetchedRoom } | null;
  onlineError: string;
}

function internals(lobby: Lobby): LobbyInternals {
  return lobby as unknown as LobbyInternals;
}

/** Let the void-ed checkRejoinCandidate()'s fetchRoom await + re-render settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const REJOIN_TEXT = 'Rejoin your game';

function activeRoom(overrides: Partial<FetchedRoom> = {}): FetchedRoom {
  return {
    id: 'room-1',
    code: 'ABCD',
    seed: 1,
    options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
    players: [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: true }],
    status: 'active',
    ...overrides,
  };
}

describe('Lobby rejoin affordance (T-09, AC-05)', () => {
  let root: HTMLDivElement;
  let lobby: Lobby;

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom localStorage always present, but stay defensive */
    }
    root = document.createElement('div');
    document.body.appendChild(root);
    lobby = new Lobby(root, vi.fn());
  });

  afterEach(() => {
    try {
      internals(lobby).cleanupWaitingChannel();
    } catch {
      /* nothing to clean */
    }
    root.remove();
    vi.restoreAllMocks();
  });

  it('SHOWN: stored descriptor + fetchRoom resolving to an active room with the seat present', async () => {
    writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' });
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(activeRoom());

    lobby.show();
    await flush();

    expect(root.textContent).toContain(REJOIN_TEXT);
  });

  it('HIDDEN: no stored descriptor at all', async () => {
    const fetchRoom = vi.spyOn(internals(lobby).transport, 'fetchRoom');

    lobby.show();
    await flush();

    expect(fetchRoom).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain(REJOIN_TEXT);
  });

  it('HIDDEN: descriptor present but the room is finished', async () => {
    writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' });
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(
      activeRoom({ status: 'finished' }),
    );

    lobby.show();
    await flush();

    expect(root.textContent).not.toContain(REJOIN_TEXT);
  });

  it('HIDDEN: descriptor present but the room no longer exists (null row)', async () => {
    writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' });
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(null);

    lobby.show();
    await flush();

    expect(root.textContent).not.toContain(REJOIN_TEXT);
  });

  it('HIDDEN: descriptor present but the stored seat is absent from the room\'s players', async () => {
    writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' });
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(
      activeRoom({ players: [{ id: 'someone-else', name: 'Bob', color: '#4d8ce8', ready: true }] }),
    );

    lobby.show();
    await flush();

    expect(root.textContent).not.toContain(REJOIN_TEXT);
  });

  // T-11 (AC-07) — load-time staleness: a stale descriptor is forgotten
  // silently (no banner, no error message) so it stops being re-validated
  // on every future lobby entry.
  it('load-time stale room clears the stored descriptor and shows no error message', async () => {
    writeSession({ roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' });
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(
      activeRoom({ status: 'finished' }),
    );

    lobby.show();
    await flush();

    expect(root.textContent).not.toContain(REJOIN_TEXT);
    expect(readSession()).toBeNull();
    expect(internals(lobby).onlineError).toBe('');
  });
});

/**
 * A minimal SupabaseClient stand-in, mirroring the seam in
 * NetworkClient.initializeGap.test.ts: `from()` resolves the queued
 * room_actions log fetch, `channel()` captures the subscribe status callback.
 */
function makeFakeSupabase(actionsLog: unknown[]): { supabase: SupabaseClient } {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'abortSignal']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: actionsLog, error: null }).then(resolve);

  const makeChannel = () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = (cb?: (s: string) => void) => {
      // Fire SUBSCRIBED asynchronously so initialize()'s fetch-then-subscribe
      // ordering is preserved, matching real Supabase behaviour.
      if (cb) queueMicrotask(() => cb('SUBSCRIBED'));
      return ch;
    };
    return ch;
  };

  const supabase = {
    from: () => builder,
    channel: () => makeChannel(),
    removeChannel: () => {},
  } as unknown as SupabaseClient;

  return { supabase };
}

describe('Lobby.handleRejoin (T-10, AC-06)', () => {
  let root: HTMLDivElement;
  let lobby: Lobby;
  let onReady: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
    try {
      internals(lobby).cleanupWaitingChannel();
    } catch {
      /* nothing to clean */
    }
    root.remove();
    vi.restoreAllMocks();
  });

  it('does nothing when there is no validated rejoin candidate', async () => {
    await internals(lobby).handleRejoin();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onReady exactly once with a network config carrying the stored playerId, roomId, persisted seat token, and room-derived players/seed/settings', async () => {
    localStorage.setItem('singedterra:seat:p-1', 'secret-token-abc');

    const room = activeRoom({
      seed: 7,
      options: { maxPlayers: 2, maxWind: 12, gravity: 0.2, rounds: 3 },
      players: [
        { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: true },
        { id: 'p-2', name: 'Bob', color: '#4d8ce8', ready: true },
      ],
    });
    internals(lobby).rejoinCandidate = {
      descriptor: { roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' },
      room,
    };
    // T-11: handleRejoin re-validates via fetchRoom before committing — stub
    // it to return the SAME still-live room so this happy-path stays green.
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(room);

    await internals(lobby).handleRejoin();

    expect(onReady).toHaveBeenCalledTimes(1);
    const config = onReady.mock.calls[0][0] as LobbyConfig;
    expect(config.mode).toBe('network');
    expect(config.roomId).toBe('room-1');
    expect(config.roomCode).toBe('ABCD');
    expect(config.playerId).toBe('p-1');
    expect(config.token).toBe('secret-token-abc');
    expect(config.players).toEqual([
      { id: 'p-1', name: 'Alice', color: '#e84d4d' },
      { id: 'p-2', name: 'Bob', color: '#4d8ce8' },
    ]);
    expect(config.settings).toMatchObject({ seed: 7, maxWind: 12, gravity: 0.2, rounds: 3 });
  });

  it('the emitted config, fed into a NetworkClient against a fake Supabase with a committed action, restores the engine to the room\'s current (turn, activePlayerId, phase)', async () => {
    localStorage.setItem('singedterra:seat:p-1', 'secret-token-abc');

    const room = activeRoom({
      seed: 7,
      options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
      players: [
        { id: 'p-1', name: 'Alice', color: '#e84d4d', ready: true },
        { id: 'p-2', name: 'Bob', color: '#4d8ce8', ready: true },
      ],
    });
    internals(lobby).rejoinCandidate = {
      descriptor: { roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' },
      room,
    };
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(room);

    await internals(lobby).handleRejoin();
    expect(onReady).toHaveBeenCalledTimes(1);
    const config = onReady.mock.calls[0][0] as LobbyConfig;

    // The room's action log already committed player p-1's fire — the "current"
    // state a rejoining client must replay up to.
    const committedFire = { seq: 0, action: { type: 'fire', angle: 45, power: 50, weapon: 'baby_missile' } };
    const { supabase } = makeFakeSupabase([committedFire]);

    const nc = new NetworkClient(
      supabase,
      config.roomId!,
      config.playerId!,
      {
        maxPlayers: config.players.length,
        players: config.players.map((p) => ({ ...p, id: p.id! })),
        seed: config.settings?.seed,
        maxWind: config.settings?.maxWind,
        gravity: config.settings?.gravity,
      },
      config.token,
    );
    await nc.initialize();
    await new Promise((r) => setTimeout(r, 0));

    // During initialize()'s replay, a logged fire is ticked to completion
    // synchronously (no rAF loop yet) rather than left mid-flight — so the
    // restored engine lands on the room's CURRENT state: turn advanced past
    // tank p1's committed shot, back in PLAYER_TURN with p2 (engine tank id
    // 'p2', mapped from the room's second player) now active.
    const state = nc.getState();
    expect(state.phase).toBe('PLAYER_TURN');
    expect(state.turn).toBe(1);
    expect(state.activePlayerId).toBe('p2');
  });
});

/**
 * T-11 (rejoin-after-refresh, AC-07) — "stale session fails gracefully".
 * handleRejoin() re-validates via fetchRoom right before committing; each
 * case below drives a room that went stale in the window between the banner
 * rendering and the click.
 */
describe('Lobby.handleRejoin stale-session handling (T-11, AC-07)', () => {
  let root: HTMLDivElement;
  let lobby: Lobby;
  let onReady: ReturnType<typeof vi.fn>;

  const candidateDescriptor: SessionDescriptor = { roomId: 'room-1', roomCode: 'ABCD', playerId: 'p-1' };

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom localStorage always present, but stay defensive */
    }
    root = document.createElement('div');
    document.body.appendChild(root);
    onReady = vi.fn();
    lobby = new Lobby(root, onReady);
    writeSession(candidateDescriptor);
    internals(lobby).rejoinCandidate = { descriptor: candidateDescriptor, room: activeRoom() };
  });

  afterEach(() => {
    try {
      internals(lobby).cleanupWaitingChannel();
    } catch {
      /* nothing to clean */
    }
    root.remove();
    vi.restoreAllMocks();
  });

  async function expectGracefulStale(): Promise<void> {
    await expect(internals(lobby).handleRejoin()).resolves.toBeUndefined();

    expect(onReady).not.toHaveBeenCalled();
    expect(readSession()).toBeNull();
    expect(internals(lobby).onlineError.length).toBeGreaterThan(0);
    expect(internals(lobby).rejoinCandidate).toBeNull();
    // Back to a normal (no-affordance) lobby view.
    lobby.show();
    expect(root.textContent).not.toContain(REJOIN_TEXT);
  }

  it('finished room: does not throw, does not call onReady, clears the descriptor, surfaces a message', async () => {
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(activeRoom({ status: 'finished' }));
    await expectGracefulStale();
  });

  it('deleted room (null row): does not throw, does not call onReady, clears the descriptor, surfaces a message', async () => {
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(null);
    await expectGracefulStale();
  });

  it('seat no longer in players: does not throw, does not call onReady, clears the descriptor, surfaces a message', async () => {
    vi.spyOn(internals(lobby).transport, 'fetchRoom').mockResolvedValue(
      activeRoom({ players: [{ id: 'someone-else', name: 'Bob', color: '#4d8ce8', ready: true }] }),
    );
    await expectGracefulStale();
  });
});
