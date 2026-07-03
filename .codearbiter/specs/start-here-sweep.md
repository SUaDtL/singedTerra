# Sprint spec — "Start here" sweep

> Source: `.codearbiter/open-tasks.md` → `## Start here (highest impact-per-effort)` (2026-06-20 sweep).
> Scope decided with maintainer 2026-06-20: **all 6 Start-here items**, #2 handled **verify-then-auto-fix**,
> backend verified via **Deno unit tests + documented migration check**.

## Problem

The six highest-impact-per-effort items from the latest review are unstarted. They span a real
client-side perf cliff (`computeNextSeat` re-sims the whole match on every shot), two corroborated
networking-robustness defects in the referee (`seq` race + a non-atomic insert/cursor write that can
freeze a room forever), a deploy-breaking env-var doc mismatch, a stray committed log file, and a
suspected live canvas-sizing mismatch. Each is cheap relative to its impact, but together they need a
test home the backend currently lacks (zero Edge Function coverage today).

## Scope

**In scope** — the full `Start here` block:

1. **(#1)** Kill the `computeNextSeat` O(turns²) full-log replay — derive the post-resolution seat from the live engine.
2. **(#3 + #4, merged)** Replace the read-MAX→insert→separate-UPDATE in `submit_action` with **one transactional Postgres RPC** that allocates `seq`, inserts the action, and advances the cursor atomically.
3. **(#6)** Fix the `.env.example` env-var name so a fresh deploy doesn't 500.
4. **(#5)** Delete `TEMPcheck.log` and `.gitignore` it.
5. **(#2)** Verify canvas-sizing coherence end-to-end; fix if it's a real mismatch, else close as a documented no-op + stale-doc update.

Backend changes get a **new Deno unit-test harness** (the "add Edge Function tests" task is pulled in as the vehicle), wired into a committed check script. The migration SQL's atomicity is proven by a documented local-supabase/manual recipe.

**Out of scope (explicit boundary):**
- The rest of `open-tasks.md` (stabilization, perf, physics/visual, feature-expansion, governance sections).
- Any change to the **trust-client posture** — the referee still validates turn ownership and never simulates physics (`CONTEXT.md` CONFIRM-01). This sprint hardens *atomicity*, not the trust boundary.
- The Postgres-Changes → Realtime-Broadcast transport swap (separate decided task).
- Introducing a linter; enacting the MIT license; any RLS/auth weakening.

## Acceptance criteria

Each criterion is one `tdd` Phase-1 obligation.

### Task A — `computeNextSeat` perf (#1)

1. For a turn-ending action, the reported `{ index, endsRound }` is derived from the live engine's already-resolved post-turn state, **not** from a freshly-constructed `GameEngine` replaying the full `appliedLog`. **Test:** a harness scripts a multi-turn log (incl. an elimination and a round boundary) and asserts the new derivation returns byte-identical `{index, endsRound}` to the current full-replay implementation at every turn-ending action (parity), establishing no behavior change.
2. The derivation is O(1) per turn-ending action (no per-call full-log replay). **Test:** asserted structurally — the replacement reads live engine state and does not instantiate a throwaway `GameEngine` / loop over `appliedLog` in the per-submit path (spy/counter or absence-of-construction assertion).

### Task B — atomic + transactional `submit_action` (#3 + #4)

3. A new migration under `supabase/migrations/` adds a plpgsql RPC that, **in a single transaction**, computes `seq = COALESCE(MAX(seq)+1, 0)` for the room, inserts the action row, and — for turn-ending actions only — updates `rooms.active_player_index` and `turn` to the values the caller supplies. A logged action can therefore never exist without its matching cursor advance. **Test:** documented local-supabase (or manual) recipe asserting (a) a single call inserts the action AND advances the cursor, (b) a forced failure rolls back the insert too (no orphaned action), (c) two concurrent calls never produce a lost action — one commits, the other gets the unique-violation path.
4. `submit_action/index.ts` calls the RPC in place of the read-MAX → insert → separate `rooms` UPDATE; the `UNIQUE(room_id, seq)` constraint remains the final guard and a unique violation still returns the existing `409 { ok:false, error:'seq_conflict', retry:true }` contract. **Test:** Deno unit test with a mocked Supabase client asserting the RPC is invoked with the right args and the 409 contract is preserved on a simulated unique violation.
5. The referee's seat-decision branch (`reportedValid` / `modulo` / `roundOver`, currently `index.ts:261-273`) is covered by Deno unit tests: turn-ending vs turn-neutral (buy) action, the round-over opener-honoring branch, the dead-seat/`reported !== activeIndex` guard, and the bounds fallback to `modulo`. **Test:** the Deno unit suite above, each branch a case.
6. The Deno test harness is runnable via a **committed script** (e.g. `npm run check:edge`, or folded into `npm run check`) so backend coverage is durable. **Test:** the script exists, runs the new tests, and exits non-zero on failure.

### Task C — env-var doc (#6)

7. `supabase/functions/.env.example` documents the exact variable the loader reads (`SUPABASE_SERVICE_ROLE_KEY`, per `_shared/mod.ts:99`) rather than `SUPABASE_SECRET_KEYS`. **Test:** a check asserts every `Deno.env.get('...')` key the shared loader reads appears in `.env.example` (parity), so the example can never drift from the loader again.

### Task D — housekeeping (#5)

8. `TEMPcheck.log` is absent from the repo and `.gitignore` ignores it (explicit entry or a `*.log` glob). **Test:** a check asserts the path is git-ignored (`git check-ignore` succeeds) and the file is not tracked.

### Task E — canvas-sizing verify-then-fix (#2)

9. The main `<canvas>` backing-store dimensions, the terrain offscreen + sky fill, and the renderer draw math are confirmed coherent against `CANVAS_WIDTH=1200` / `CANVAS_HEIGHT=600` (`Terrain.ts:21-22`). **Test:** an assertion that the canvas backing-store width/height equal `CANVAS_WIDTH`/`CANVAS_HEIGHT`. If a mismatch is found (e.g. backing store 800×500), it is corrected so the terrain blit aligns 1:1 with no oversized rebuild; the stale "800×500" renderer doc/comments are updated to 1200×600. If already coherent, the task closes as a **no-op** with the evidence recorded in the sprint log and only the stale doc/comment corrected.

## Determinism & risk notes

- Tasks A and E **must not change engine determinism**: A reuses already-computed engine state (no new physics), E is render-only. The Task-A parity test (AC1) is the determinism guard.
- **Hard-gate surfaces (will surface for sign-off under `/sprint` Phase 2):** Task B introduces a DB **migration** (additive — a new function, no destructive DDL, no data loss) and touches the **referee turn-gate** (a trust boundary). These halt and surface per `SPRINT.md`; the migration-reviewer / security path runs. Everything else is non-gated.

## Open questions

_None._ The five 2026-06-20 architectural forks are resolved in `CONTEXT.md`; no new `[CONFIRM-NN]` raised by this spec.
