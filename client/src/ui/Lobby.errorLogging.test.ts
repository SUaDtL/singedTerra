/**
 * Lobby.errorLogging.test.ts — #124 (observability-002).
 *
 * The 6 network-error catch sites in Lobby.ts used to swallow the caught error
 * with zero console signal, so a failed lobby action was undiagnosable (the
 * browser console is the only surface — no APM). These tests force the injected
 * transport to reject (via a rejecting global fetch, the same seam the
 * characterization harness uses) and assert the caught error is now LOGGED:
 * console.error for the 5 user-facing failures, console.debug for the
 * best-effort leave. Behavior otherwise unchanged — the user-facing onlineError
 * message and view transitions still hold (pinned in detail by
 * Lobby.network.test.ts; re-checked lightly here to prove flow is preserved).
 *
 * Mock seam mirrors Lobby.network.test.ts: SDK mocked, fetch/env stubbed, and the
 * private methods reached through a typed-through-unknown cast.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Lobby } from './Lobby';

vi.mock('@supabase/supabase-js', () => {
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  return {
    createClient: vi.fn(() => ({ channel: vi.fn(() => channel), removeChannel: vi.fn() })),
  };
});

interface LobbyInternals {
  handleCreateRoom(): Promise<void>;
  handleJoinRoom(): Promise<void>;
  fetchRooms(): Promise<void>;
  handleReadyUp(): Promise<void>;
  handleLeaveRoom(): Promise<void>;
  updateMe(fields: { name?: string; color?: string }): Promise<void>;
  cleanupWaitingChannel(): void;
  [key: string]: unknown;
}
const internals = (l: Lobby) => l as unknown as LobbyInternals;

/** True if any spy call carried the thrown Error (ties the log to the real caught error). */
function loggedTheError(spy: Mock): boolean {
  return spy.mock.calls.some((args) => args.some((a) => a instanceof Error && a.message === 'boom'));
}

/** Seed a clean, clash-free single-seat waiting room for THIS client. */
function seedWaiting(l: Lobby): void {
  Object.assign(internals(l), {
    waitingRoomId: 'room-1',
    waitingRoomCode: 'ABCD',
    waitingPlayerId: 'p-1',
    waitingToken: 'tok',
    waitingSeed: 42,
    waitingOptions: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
    waitingPlayers: [{ id: 'p-1', name: 'Alice', color: '#e84d4d', ready: false }],
  });
}

describe('Lobby network-error logging (#124)', () => {
  let root: HTMLDivElement;
  let lobby: Lobby;
  let errorSpy: Mock;
  let debugSpy: Mock;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
    // Every catch site is reached by a rejecting transport call.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) as unknown as Mock;
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {}) as unknown as Mock;
    root = document.createElement('div');
    document.body.appendChild(root);
    lobby = new Lobby(root, vi.fn());
  });

  afterEach(() => {
    try { internals(lobby).cleanupWaitingChannel(); } catch { /* nothing to clean */ }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    root.remove();
  });

  it('create_room: logs the caught error and still shows the network-error message', async () => {
    internals(lobby).onlineName = 'Alice';
    await internals(lobby).handleCreateRoom();
    expect(loggedTheError(errorSpy)).toBe(true);
    expect(internals(lobby).onlineError).toBe('Network error. Try again.');
  });

  it('join_room: logs the caught error and still shows the network-error message', async () => {
    Object.assign(internals(lobby), { joinCode: 'WXYZ', onlineName: 'Bob' });
    await internals(lobby).handleJoinRoom();
    expect(loggedTheError(errorSpy)).toBe(true);
    expect(internals(lobby).onlineError).toBe('Network error. Try again.');
  });

  it('list_rooms: logs the caught error on the browse view', async () => {
    internals(lobby).onlineSubView = 'browse';
    await internals(lobby).fetchRooms();
    expect(loggedTheError(errorSpy)).toBe(true);
    expect(internals(lobby).onlineError).toBe('Network error. Try again.');
  });

  it('ready_up: logs the caught error and does not ready up', async () => {
    seedWaiting(lobby);
    await internals(lobby).handleReadyUp();
    expect(loggedTheError(errorSpy)).toBe(true);
    expect(internals(lobby).onlineError).toBe('Network error. Try again.');
    expect(internals(lobby).waitingThisPlayerReady).toBe(false);
  });

  it('update_player: logs the caught error', async () => {
    seedWaiting(lobby);
    await internals(lobby).updateMe({ name: 'Zed' });
    expect(loggedTheError(errorSpy)).toBe(true);
  });

  it('leave_room (best-effort): logs via console.debug and still returns to the create view', async () => {
    Object.assign(internals(lobby), {
      waitingRoomId: 'room-1',
      waitingPlayerId: 'p-1',
      waitingToken: 'tok',
      onlineSubView: 'waiting',
    });
    await internals(lobby).handleLeaveRoom();
    expect(loggedTheError(debugSpy)).toBe(true);
    expect(internals(lobby).onlineSubView).toBe('create');
  });
});
