/**
 * sessionDescriptor.ts — rejoin-after-refresh (#46), T-04 + T-05.
 *
 * PUBLIC-only session descriptor + the pure validation predicate that decides
 * whether a stored session is still live and rejoinable. NEVER carries the
 * secret seat token (ADR-0009) — only ids a client is allowed to hold openly.
 *
 * T-05 adds the localStorage persistence primitives (writeSession/readSession/
 * clearSession) below `isLiveSession`. They are the ONLY functions in this
 * module that touch `localStorage`, and they do so lazily inside the function
 * bodies (never at module top level) so this file stays importable under
 * `npx tsx` (Node, no DOM/localStorage) — see scripts/checks/session.mjs.
 */

/** Public-only session descriptor persisted across a refresh. */
export interface SessionDescriptor {
  roomId: string;
  roomCode: string;
  playerId: string;
}

/**
 * Minimal structural shape of a `rooms` row, aligned with the fields
 * `LobbyTransport.fetchRoom` returns (`{ id, code, seed, options, players, status }`).
 * Only the fields this predicate needs are required here.
 */
export type SessionRoom =
  | {
      status: string;
      players: Array<{ id: string }>;
    }
  | null
  | undefined;

/**
 * Pure predicate: is this descriptor's session live and rejoinable?
 *
 * True iff `room` is non-null AND `room.status === 'active'` AND `room.players`
 * contains an entry whose `id === descriptor.playerId`. False for a deleted
 * room (`null`/`undefined`), a non-`active` status (e.g. `finished`), or a
 * seat absent from `players`.
 */
export function isLiveSession(descriptor: SessionDescriptor, room: SessionRoom): boolean {
  if (!room) return false;
  if (room.status !== 'active') return false;
  return room.players.some((p) => p.id === descriptor.playerId);
}

// localStorage key under which the (public-only) rejoin session descriptor is
// persisted, as JSON — single documented key, sibling of NetworkClient's
// `singedterra:seat:` prefix. Guarded by try/catch everywhere: private-mode /
// disabled storage must not crash the game.
const SESSION_KEY = 'singedterra:session';

/** Best-effort persist of the session descriptor; never throws. */
export function writeSession(descriptor: SessionDescriptor): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(descriptor));
  } catch {
    /* localStorage unavailable — descriptor just isn't persisted across reloads */
  }
}

/**
 * Best-effort read of the persisted session descriptor; never throws.
 * Returns `null` if the key is absent, the JSON is malformed, the parsed
 * value isn't an object, or it's missing any of the three required string
 * fields.
 */
export function readSession(): SessionDescriptor | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { roomId, roomCode, playerId } = parsed as Record<string, unknown>;
    if (typeof roomId !== 'string' || typeof roomCode !== 'string' || typeof playerId !== 'string') {
      return null;
    }
    return { roomId, roomCode, playerId };
  } catch {
    return null; // localStorage unavailable or malformed JSON — treat as absent
  }
}

/** Best-effort removal of the persisted session descriptor; never throws. */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* localStorage unavailable — nothing to clear */
  }
}
