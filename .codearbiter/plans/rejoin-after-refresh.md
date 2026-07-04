# Plan: Rejoin an in-progress game after refresh (#46)

**Spec:** `.codearbiter/specs/rejoin-after-refresh.md` (APPROVED 2026-07-04). **Stage:** 1.
**Governs:** `client/src/client/NetworkClient.ts`, `client/src/ui/Lobby.ts`,
`client/src/client/LobbyTransport.ts`, `client/src/lib/sessionDescriptor.ts` (new),
`client/src/main.ts`, `scripts/checks/*`, `package.json`.

## Planning finding — Phase A is already built (spec drift, resolved)

The spec frames Phase A (criteria 1–2, "chunked, non-freezing replay") as the unbuilt gating
prerequisite. **It is already shipped:** `NetworkClient.initialize()` (NetworkClient.ts:278–291)
replays via `replayInChunks(rows, …, REPLAY_CHUNK_SIZE = 16, () => setTimeout(r, 0))`, and
`scripts/checks/chunkreplay.mjs` already proves the yield-count / order / final-state contract.
Consequently Phase A here is **verify-only (AC-01) + one test-only addition (AC-02)** — NOT a build.
No `tdd` red phase is authored against the already-correct chunked replay; T-01 records AC-01 as
covered by the existing green harness.

**Tunable name (user-confirmed 2026-07-04):** keep the shipped `REPLAY_CHUNK_SIZE`; the spec's
`REPLAY_YIELD_EVERY` is treated as a naming variant, no rename. `[NEEDS-TRIAGE]` none — decided.

The one real Phase-A gap: `replayInChunks` is exercised only by a no-op array-push harness, so
criterion 2's *engine-level* byte-identical (chunked ≡ synchronous) assertion does not exist. T-02
adds it.

## Acceptance-criteria ledger

| ID | Criterion (from spec §Acceptance criteria) |
|----|--------------------------------------------|
| **AC-01** | Chunked, non-freezing reconnect replay — `initialize()` yields ≥ `floor(N / REPLAY_CHUNK_SIZE)` times for N logged actions. |
| **AC-02** | Determinism preserved — engine state after chunked replay is byte-identical to synchronous replay (activePlayerId, phase, turn, tanks, terrain digest). |
| **AC-03** | Session descriptor `{ roomId, roomCode, playerId }` persisted to a single documented `localStorage` key on `create_room`/`join_room` success. |
| **AC-04** | Descriptor cleared on GAME_OVER, on explicit leave, and on a stale-validation. |
| **AC-05** | Rejoin affordance shown ONLY for a valid live session (stored descriptor AND rooms row `active` with seat present); otherwise hidden. |
| **AC-06** | Rejoin restores the seat — re-instantiates NetworkClient with stored `playerId` + persisted token + `roomId`, replays, subscribes, reaches current `(turn, activePlayerId, phase)`; input accepted on the seat's turn. |
| **AC-07** | Stale session fails gracefully — finished/deleted/seat-gone does not throw; clears descriptor, surfaces a short message, returns to normal lobby. |

## Task table (status is the resume ledger; `subagent-driven-development` flips to `ACCEPTED`)

### Phase A — replay prerequisite (verify + determinism assertion)

| id | path(s) | verification | maps-to (tdd obligation) | covers | depends-on | status |
|----|---------|--------------|--------------------------|--------|------------|--------|
| **T-01** | `scripts/checks/chunkreplay.mjs` (existing), `client/src/client/NetworkClient.ts` (`initialize`) | **VERIFY-ONLY, no impl.** `npx tsx scripts/checks/chunkreplay.mjs` PASSES; confirm `replayInChunks` + `REPLAY_CHUNK_SIZE` still present in `initialize()`. Records AC-01 as pre-satisfied. | AC-01 yield-count (already green) | AC-01 | — | ACCEPTED |
| **T-02** | `scripts/checks/replay_determinism.mjs` (new) | `npx tsx scripts/checks/replay_determinism.mjs` exits 0: builds one engine, replays a fixed `(seed + ≥3-action log incl. a fire)` SYNCHRONOUSLY and again via `replayInChunks` (small chunkSize, e.g. 2) with the SAME apply+tickToCompletion callback, asserts the two end-state digests (activePlayerId, phase, turn, serialized tanks, terrain digest) are byte-identical. | AC-02 engine-level chunked≡sync | AC-02 | — | ACCEPTED |
| **T-03** | `package.json` (`check` script) | Append `&& npx tsx scripts/checks/replay_determinism.mjs` to the `check` chain; `npm run check` executes it and passes. (Guard: `check` is a hardcoded `&&`-chain, not a glob — unregistered harnesses silently never run.) | AC-02 (harness actually runs in CI) | AC-02 | T-02 | ACCEPTED |

### Phase B — persistence, affordance, restore, stale handling

| id | path(s) | verification | maps-to (tdd obligation) | covers | depends-on | status |
|----|---------|--------------|--------------------------|--------|------------|--------|
| **T-04** | `client/src/lib/sessionDescriptor.ts` (new), `scripts/checks/session.mjs` (new), `package.json` | Pure `isLiveSession(desc, room)` + `SessionDescriptor` type. New tsx harness `session.mjs` (registered in `check`): TRUE when `room.status==='active'` AND `playerId` in `room.players`; FALSE for `finished`/deleted(`null` row)/seat-absent. `npm run check` runs `session.mjs` green. | AC-05/AC-07 validation predicate | AC-05, AC-07 | — | ACCEPTED |
| **T-05** | `client/src/lib/sessionDescriptor.ts`, `client/src/lib/sessionDescriptor.test.ts` (new) | Add `writeSession`/`readSession`/`clearSession` under single key `singedterra:session` (try/catch, never throws). Vitest: write→read round-trip returns `{roomId,roomCode,playerId}`; `clearSession` removes the key; disabled-storage does not throw. `npm run test:client` passes. | AC-03 persist, AC-04 clear primitive | AC-03, AC-04 | T-04 | ACCEPTED |
| **T-06** | `client/src/ui/Lobby.ts` (createRoom + joinByCode success handlers) | On `create_room`/`join_room` success, call `writeSession({roomId,roomCode,playerId})`. Vitest (fake transport): descriptor present with correct fields after create AND after join. `npm run test:client` passes. | AC-03 wired at source | AC-03 | T-05 | ACCEPTED |
| **T-07** | `client/src/ui/Lobby.ts` (`leaveRoom`), `client/src/client/NetworkClient.ts` (`emitState` GAME_OVER one-shot) | `clearSession()` on explicit leave and when a network game reaches `GAME_OVER`. Vitest: key absent after `leaveRoom`; key absent after the client's engine reaches GAME_OVER. `npm run test:client` passes. **Path refinement (during execution):** GAME_OVER clear moved `main.ts → NetworkClient.emitState` — `main.ts` is coverage-excluded bootstrap glue (untestable with the named vitest verification); NetworkClient is spec-governed, already owns seat-token persistence + a one-shot GAME_OVER hook, and has a fake-Supabase test seam. | AC-04 clear-on-end wiring | AC-04 | T-05 | ACCEPTED |
| **T-08** | `client/src/client/LobbyTransport.ts` (new `fetchRoom(roomId)`) | Anon `rooms` SELECT for `id, code, seed, options, players, status` by id (via `lib/supabase`), returning the row or null. Vitest (fake supabase): queries `rooms` filtered by id and returns the shaped row; null on absent. `npm run test:client` passes. | AC-05/AC-06 room read | AC-05, AC-06 | — | ACCEPTED |
| **T-09** | `client/src/ui/Lobby.ts` (`show`/entry render) | On entry: `readSession()` → `transport.fetchRoom` → `isLiveSession`. Vitest: stored descriptor + fake active room with seat → "Rejoin your game" affordance rendered; absent descriptor OR invalid room → affordance NOT rendered (both branches). `npm run test:client` passes. | AC-05 affordance gate | AC-05 | T-04, T-05, T-08 | ACCEPTED |
| **T-10** | `client/src/ui/Lobby.ts` (`rejoin()` activation) | Activating the affordance builds a network `LobbyConfig` from the fetched room (`seed/options/players/code`, mirroring `emitNetworkReady`) + stored `playerId` + persisted seat token, and calls `onReady`. Harness/vitest (fake Supabase + existing seams): NetworkClient instantiated with stored `playerId`+`roomId`+token; restored engine reaches the room's current `(turn, activePlayerId, phase)`; local input accepted when it is the seat's turn. `npm run test:client` passes. | AC-06 restore end-to-end | AC-06 | T-08, T-09 | ACCEPTED |
| **T-11** | `client/src/ui/Lobby.ts` (validation + activation stale branches) | Finished/deleted/seat-gone at validate OR activate: no throw; `clearSession()` called; short message surfaced; normal lobby shown (no affordance). Vitest drives each stale case. `npm run test:client` passes. | AC-07 graceful stale | AC-04, AC-07 | T-05, T-08, T-09 | ACCEPTED |

## Order & MVP slice

Dependency order (no cycles): `T-01`, `T-02` → `T-03`; `T-04` → `T-05` → {`T-06`, `T-07`};
`T-08`; {`T-04`,`T-05`,`T-08`} → `T-09` → `T-10`; {`T-05`,`T-08`,`T-09`} → `T-11`.

- **MVP slice (working, validated rejoin with clear-on-end): T-01 → T-10.** Delivers Phase A's
  determinism guarantee plus descriptor persistence, the validated affordance, seat restore, and
  descriptor clearing on leave/GAME_OVER — a rejoin that functions end-to-end.
- **Completing increment: T-11** — AC-07 stale-session hardening (required for spec-complete; the
  last increment, isolated so a stale-room edge can't wedge the MVP path).

## Coverage proof (bijective)

- AC-01 → T-01 · AC-02 → T-02, T-03 · AC-03 → T-05, T-06 · AC-04 → T-05, T-07, T-11 ·
  AC-05 → T-04, T-08, T-09 · AC-06 → T-08, T-10 · AC-07 → T-04, T-11.
- Every AC has ≥1 task; every task covers ≥1 AC. No orphan tasks, no uncovered criteria.

## Notes / guardrails carried into execution

- **ADR-0001/0002/0009 govern the touched files** — deterministic lockstep, no server-authoritative
  physics, split public seat-id / secret seat-token. Rejoin reuses the persisted seat token
  (`singedterra:seat:` per ADR-0009); the new `singedterra:session` descriptor holds only PUBLIC
  ids (`roomId`, `roomCode`, `playerId`) — never the secret token.
- **No referee / Edge Function / migration change** (spec key finding + Out-of-scope). Rejoin is
  pure client: validate → fetch room → rebuild NetworkClient → replay canonical log.
- **Idempotent re-subscribe** (spec non-goal): rejoin reuses the existing out-of-order buffer +
  first-SUBSCRIBED resync (#118) + stale-seq drop — no new dedup logic; covered transitively by T-10.
- Handoff: `executing-plans` (checkpointed) batches the remaining non-`ACCEPTED` tasks; each task
  still routes through `tdd` (T-01 is the sole verify-only exception — behavior pre-exists).
