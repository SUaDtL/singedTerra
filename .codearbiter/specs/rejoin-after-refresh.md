# Spec: Rejoin an in-progress game after refresh (#46)

**Status:** APPROVED 2026-07-04 by SUaDtL <brennonhuff@gmail.com>. Next: `writing-plans`.
**Issue:** #46 (Session permanence). **Stage:** 1.
**Governs:** client/src/client/NetworkClient.ts, client/src/ui/Lobby.ts, client/src/main.ts

## Problem

A networked player who refreshes, backgrounds a mobile tab, or briefly drops connection
mid-match permanently loses access to their still-live seat. The in-memory `playerId` and
`roomId` die on reload, so the seat token already persisted in `localStorage` (keyed by
`playerId`, per ADR-0009) becomes unreachable, and an `active` room has no visible door back
in (the public browser lists only `waiting` rooms). The surviving opponent sees a
"may have disconnected" notice and the game cannot continue.

**Caller:** a human in a networked match whose tab reloads. **Done:** they return to their
seat with current game state and can take their turn.

## Key finding (scopes the work)

A disconnect does **not** evict the server seat. `leave_room` is called only from the explicit
"Leave" button in the waiting room; there is no `beforeunload`/`unload` handler, and
`NetworkClient.stop()` is local teardown that never POSTs a leave. Active rooms are never
reaped (heartbeat/reap is `waiting`-status only). The seat persists in `room.players`, so
**rejoin is achievable client-side with no referee, endpoint, or migration change.** The
canonical state already recovers via `seed + room_actions` replayed by
`NetworkClient.initialize()`.

## Scope

**In:**
- A bounded/chunked reconnect replay (the gating prerequisite — user decision).
- A persisted session descriptor and its lifecycle.
- A lobby "Rejoin your game" affordance driven by the validated descriptor.
- Graceful handling of a stale/invalid stored session.

**Out (explicit boundary):**
- Accounts / real auth — identity stays ephemeral (ADR-0006).
- Cross-device or cross-browser session transfer.
- Spectator / rejoin-as-observer.
- Any referee, Edge Function, or database migration change (the key finding removes the need).
- Rejoin into a `finished`/GAME_OVER room (that path clears the descriptor instead).

## Acceptance criteria

Each is verifiable by a single test (one `tdd` Phase 1 obligation per criterion).

1. **Chunked, non-freezing reconnect replay.** `NetworkClient.initialize()` replays the action
   log by yielding to the event loop between logged actions (chunk-and-yield), bounded by a
   named tunable (e.g. `REPLAY_YIELD_EVERY` actions per macrotask). Given a log of N logged
   actions, the replay yields at least `floor(N / REPLAY_YIELD_EVERY)` times.
2. **Determinism preserved (ADR-0002, load-bearing).** For an identical `(seed + ordered log)`,
   the engine state after the chunked replay is byte-identical to the state after the current
   synchronous replay (same `activePlayerId`, phase, turn, tanks, terrain digest). A
   determinism assertion pins this.
3. **Session descriptor persisted.** On a successful `create_room`/`join_room`, the client
   writes `{ roomId, roomCode, playerId }` to `localStorage` under a single documented key
   (alongside the existing per-seat token). A unit test asserts the descriptor is present after
   join with the correct fields.
4. **Descriptor cleared on end-of-session.** The descriptor is removed when the match reaches
   `GAME_OVER`, when the player explicitly leaves, and when a rejoin attempt validates the
   stored room as stale (criterion 6). A test asserts the key is absent after each.
5. **Rejoin affordance shown only for a valid live session.** On load, if a stored descriptor
   exists AND an anon `rooms` SELECT confirms the room is `active` with the stored seat present
   in `players`, the lobby renders a "Rejoin your game" affordance; otherwise no affordance is
   shown. A test drives both branches (valid → shown, absent/invalid → hidden).
6. **Rejoin restores the seat.** Activating the affordance re-instantiates `NetworkClient` with
   the stored `playerId` + the persisted token + `roomId`, replays the log (criterion 1),
   subscribes, and the returning client's engine reaches the room's current
   `(turn, activePlayerId, phase)`; when it is the returning seat's turn, input is accepted.
   A harness test (fake Supabase + the existing seams) asserts the restored state.
7. **Stale session fails gracefully.** If the stored room is `finished`, deleted, or the seat
   is no longer in `players`, the rejoin does not throw: it clears the descriptor (criterion 4),
   surfaces a short message, and returns to the normal lobby. A test drives each stale case.

## Non-goals / notes

- Idempotent re-subscribe: rejoin reuses the existing out-of-order buffering + first-SUBSCRIBED
  resync (#118) and stale-seq drop, so a returning client never double-applies. No new logic;
  covered transitively by criterion 6.
- The `REPLAY_YIELD_EVERY` budget is a named tunable constant, not a blocking unknown.

## Plan shape (for writing-plans)

- **Phase A (prerequisite):** criteria 1–2 — chunked, determinism-preserving replay. Land and
  verify before Phase B (rejoin is worthless on a freezing or drifting replay).
- **Phase B:** criteria 3–7 — persistence, validation, lobby affordance, rejoin, stale handling.

## Open questions

None blocking. All brainstorming trade-offs resolved by the user (2026-07-04): rejoin via a
lobby prompt/banner (not auto-rejoin); descriptor cleared on GAME_OVER + explicit leave; #46
gated on the chunked replay landing first.
