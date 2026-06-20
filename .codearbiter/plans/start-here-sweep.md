# Plan — "Start here" sweep

Spec: `.codearbiter/specs/start-here-sweep.md` (approved). Stage 1 (prototype) gates.
Test substrate: `.mjs` harnesses via `npx tsx` (chained in `npm run check`); Deno available locally
for Edge Function unit tests. No test framework, no linter (`tsc --noEmit` strict is the static gate).

## Acceptance-criteria ledger

| ID | Criterion (from spec) |
|----|------------------------|
| AC-01 | `computeNextSeat` derives the post-turn seat from the live engine's resolved state; parity with full-replay across a multi-turn log (elimination + round boundary). |
| AC-02 | That derivation is O(1) per turn-ending action — no throwaway `GameEngine` / `appliedLog` loop in the per-submit path. |
| AC-03 | New migration adds a plpgsql RPC that, in one transaction, allocates `seq=COALESCE(MAX(seq)+1,0)`, inserts the action, and (turn-ending only) advances `rooms.active_player_index`/`turn`. |
| AC-04 | `submit_action` calls the RPC in place of read-MAX→insert→separate-UPDATE; `UNIQUE(room_id,seq)` stays the guard; the `409 seq_conflict retry` contract is preserved. |
| AC-05 | Deno unit tests cover the seat-decision branch: turn-ending vs buy, round-over opener, dead-seat guard, modulo fallback. |
| AC-06 | Backend tests run via a committed script (`npm run check:edge`). |
| AC-07 | `.env.example` documents the var the loader actually reads (`SUPABASE_SERVICE_ROLE_KEY`). |
| AC-08 | `TEMPcheck.log` absent and git-ignored. |
| AC-09 | Canvas backing-store / terrain-offscreen / renderer coherent with `CANVAS_WIDTH=1200`/`HEIGHT=600`; fix if mismatched else no-op + stale-doc update. |

## Tasks

| ID | Path(s) | Verification | maps-to | covers | depends-on | status |
|----|---------|--------------|---------|--------|------------|--------|
| T-01 | `scripts/checks/seat_reuse.mjs` (new) | `npx tsx scripts/checks/seat_reuse.mjs` exits 0 — asserts `engine.clone()` + apply-next-action yields the same `{seatIndex, phase===ROUND_OVER}` as a full from-scratch replay, across a scripted multi-turn log with an elimination + a round boundary (validates clone correctness + the reuse property). | AC-01 parity obligation | AC-01 | — | ACCEPTED (seat_reuse: OK; elimination + round-boundary steps parity-verified) |
| T-02 | `package.json` | `npm run check` executes `seat_reuse.mjs` and passes. | AC-01 | AC-01 | T-01 | ACCEPTED (wired; `npm run check` exit 0) |
| T-03 | `client/src/client/NetworkClient.ts`, `shared/src/engine/GameEngine.ts` (add `clone()`) | `npm run typecheck` passes; `seat_reuse.mjs` green; diff shows `computeNextSeat` clones the live engine + applies only the pending action — no `new GameEngine` rebuild, no `appliedLog` loop. | AC-01 / AC-02 | AC-01, AC-02 | T-01 | ACCEPTED (clone() reviewed — all 17 fields + full GameState deep-copied, terrain .slice(); 19 determinism harnesses green) |
| T-04 | `supabase/functions/_shared/mod.ts`, `supabase/functions/submit_action/index.ts` | `deno check supabase/functions/submit_action/index.ts` passes — seat-decision logic extracted to a pure exported `nextCursor(...)`, handler calls it (behavior-preserving). | AC-05 | AC-05 | — | ACCEPTED (deno check exit 0; logic byte-identical to inline; DB calls untouched) |
| T-05 | `package.json` | `npm run check:edge` runs `deno test supabase/functions/**/*.test.ts` (exits 0 with zero tests). | AC-06 | AC-06 | — | ACCEPTED (`check:edge` added; `deno test` exit 0, 10/10) |
| T-06 | `supabase/functions/_shared/mod.test.ts` (new) | `npm run check:edge` runs `nextCursor` cases: turn-ending vs buy, round-over opener honored, dead-seat guard (`reported !== activeIndex`), out-of-bounds → `modulo` fallback. | AC-05 | AC-05 | T-04, T-05 | ACCEPTED (10/10 deno tests fresh-verified; wiring into check:edge = central T-05) |
| T-07 | `supabase/migrations/004_atomic_submit_action.sql` (new) + `VERIFY_004.md` | Documented local-supabase recipe (`npx supabase db reset` + psql) asserting: one call inserts action AND advances cursor; a forced failure rolls back the insert (no orphan); two concurrent calls lose no action (one commits, other hits unique path). **HARD GATE — migration.** | AC-03 | AC-03 | — | ACCEPTED (migration-reviewer PASS; MEDIUM lock-miss hardening + LOW down-path/lockstep notes applied) |
| T-08 | `supabase/functions/submit_action/index.test.ts` (new) | `npm run check:edge` — failing test first: asserts handler invokes `supabase.rpc(<fn>, <args>)` and returns the `409 { ok:false, error:'seq_conflict', retry:true }` contract on a simulated unique violation (mocked client). | AC-04 | AC-04 | T-05 | ACCEPTED (3/3 rpcResultToResponse tests; security-reviewer PASS — 409 contract preserved) |
| T-09 | `supabase/functions/submit_action/index.ts` | T-08 test green; `deno check` passes — read-MAX→insert→separate-UPDATE replaced by the RPC call; 409 contract preserved. **HARD GATE — referee / trust boundary.** | AC-04 | AC-04 | T-04, T-07, T-08 | ACCEPTED (security-reviewer PASS — trust boundary preserved byte-for-byte, no priv-esc; deno 13/13) |
| T-10 | `scripts/checks/envvars.mjs` (new) | `npx tsx scripts/checks/envvars.mjs` — reads `_shared/mod.ts` + `.env.example` as text, asserts every `Deno.env.get('X')` key appears in `.env.example`. Red now (example has `SUPABASE_SECRET_KEYS`). | AC-07 | AC-07 | — | ACCEPTED (red→green fresh-verified, exit 0) |
| T-11 | `supabase/functions/.env.example` | `npx tsx scripts/checks/envvars.mjs` green; wire into `npm run check`. | AC-07 | AC-07 | T-10 | ACCEPTED (wired into `npm run check`; suite exit 0) |
| T-12 | `.gitignore`, repo root | `git check-ignore TEMPcheck.log` exits 0 AND `git ls-files TEMPcheck.log` is empty. | AC-08 | AC-08 | — | ACCEPTED (no-op: file absent, `*.log` already ignores it) |
| T-13 | (read) `client/index.html`, `client/src/main.ts`, `client/src/renderer/*` | Documented evidence: the `<canvas>` backing-store width/height and any offscreen/sky-fill sizing recorded against `1200×600`; verdict mismatch-or-coherent written to `sprint-log.md`. | AC-09 verify | AC-09 | — | ACCEPTED (verdict: COHERENT — index.html canvas 1200×600, offscreen 1:1; no live bug) |
| T-14 | stale comments only: `client/src/renderer/TerrainRenderer.ts` (23, 48), `client/src/ui/Lobby.ts` (237) | Doc-only (coherent branch): "800x500" comments corrected to 1200×600 / `CANVAS_WIDTH×CANVAS_HEIGHT`; `grep -rn "800x500\|800×500" client/src` returns none; `npm run typecheck` passes. | AC-09 | AC-09 | T-13 | ACCEPTED (grep clean; typecheck exit 0 in combined sweep) |

## Order & MVP slice

**MVP slice (core robustness + perf): T-01 → T-09.** The headline defects — the per-shot O(turns²)
replay (A) and the seq-race + non-atomic insert/cursor freeze (B). Shippable on its own; satisfies the
spec's core criteria (AC-01..AC-06).

**Incremental finishers (independent, any order after MVP): T-10..T-14** — env-var doc (C), housekeeping
(D), canvas verify-then-fix (E). Each is self-contained and low-risk; none depends on the MVP slice.

Dependency notes: T-04 precedes T-09 (same file); T-07 (migration) precedes T-09 (RPC call). T-13 (verify)
gates T-14 (fix-or-doc). No cycles.

## Hard-gate surfaces (will halt and surface under `/sprint` Phase 2)

- **T-07** — DB migration (additive: new plpgsql function, no destructive DDL, no data loss). migration-reviewer runs.
- **T-09** — referee turn-gate change (trust boundary). Hardens atomicity only; does not weaken the trust-client posture (CONTEXT.md CONFIRM-01).
