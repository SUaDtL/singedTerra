# Sprint log — start-here-sweep

Append-only. Every autonomous "as-the-user" decision, with the options weighed, the SMARTS-style
verdict, the choice, and a confidence flag (`high` = strong; `low` = moderate/tied → review these).
Hard-gate stops are recorded here too.

Spec: `.codearbiter/specs/start-here-sweep.md` · Plan: `.codearbiter/plans/start-here-sweep.md`
Branch: `feat/start-here-sweep`

---

## Phase 1 — spec & plan (interactive gate)

- **Scope** — user chose the **whole** `Start here` block (all 6 items), #2 verify-then-auto-fix, backend verified via Deno unit tests. (User-decided.)
- **#3 + #4 merged into T-07/T-09.** Code read showed #4's "fire-and-forget cursor" was already fixed (awaited + 3-retry); surviving defect is the *non-atomic* insert-then-cursor pair, which one transactional RPC fixes alongside #3's seq race. SMARTS: strong. Confidence: **high**.

## Phase 2 — autonomous execution

- **[T-12] TEMPcheck.log — accept as no-op (already satisfied).** File absent; `.gitignore` already carries `*.log` (matches TEMPcheck.log); `git check-ignore` exit 0, `git ls-files` untracked. Fabricating a delete of a non-existent file is scope-noise. SMARTS: strong. Choice: accept as no-op. Confidence: **high**.

- **[T-13/E] Canvas — verify verdict: COHERENT, no live bug.** `index.html:12` canvas is `width=1200 height=600`; `TerrainRenderer` offscreen = `CANVAS_WIDTH×CANVAS_HEIGHT` (1200×600), blits 1:1; all renderer/input paths use the shared constants. The feared 800×500 backing store does not exist. Stale "800x500" text survives only in comments: `TerrainRenderer.ts:23,48`, `Lobby.ts:237`. SMARTS: strong. Choice: **close E as the spec's "already coherent → no-op + stale-doc update" branch**; T-14 reduces to a doc-only comment fix (handled inline, grep-verified). Confidence: **high**.
- **[T-03/A] Scope expansion — add `GameEngine.clone()` to shared/.** Options: (a) incremental shadow engine with rollback bookkeeping, kept in NetworkClient only; (b) add a real deep `clone()` to GameEngine and clone the live engine (which already holds appliedLog), apply only the pending action. `getState()` returns terrain by reference (GameEngine.ts:203), so no existing deep-copy primitive exists. (a) is determinism-risky (manual rollback of a 720k bitmap + tanks + projectile) and error-prone; (b) is provably behavior-identical and O(1)-per-shot. SMARTS: favors (b), but it widens T-03's path from `NetworkClient.ts` into determinism-sensitive `shared/src/engine/GameEngine.ts`. Choice: **(b)**, guarded by the T-01 clone-parity harness. Confidence: **low** (scope touches the shared engine — flagged for review).

- **[T-14/E] Canvas doc fix applied (doc-only).** Corrected stale "800x500" → 1200×600 in `TerrainRenderer.ts:23,48` and `Lobby.ts:237`; also fixed same-block stale pixel counts "400k" → "720k" (1200×600=720k) in `TerrainRenderer.ts` (same resize staleness — fixing one and not the other would be sloppy; comment-only, zero behavior risk). SMARTS: strong. `grep -rn "800x500|800×500" client/src` → no matches. Full `npm run typecheck` deferred to the Phase-5 combined sweep (Task A is concurrently editing client/shared TS). Confidence: **high**.

## Dispatched (Phase 2 author wave — running)
- Task A (T-01/T-02-partial/T-03): GameEngine.clone() + seat_reuse.mjs + computeNextSeat refactor — ca:backend-author.
- Task C (T-10/T-11): envvars.mjs parity check + .env.example fix — ca:backend-author.
- Task B-prep (T-04/T-06): extract+test referee nextCursor (behavior-preserving) — ca:backend-author.
- Held for hard-gate sign-off: T-07 (migration) + T-08 + T-09 (referee→RPC rewire).
- Orchestrator owns central package.json wiring (T-02/T-05/T-11) after agent files land.

## Phase 2 — task acceptances
- **[T-10/T-11/C] ACCEPTED (review + fresh-verify).** `envvars.mjs` red→green proven; `.env.example` → SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (placeholders, no secret). Standalone `npx tsx scripts/checks/envvars.mjs` exit 0. T-11 wiring into `npm run check` = central package.json step (pending). Confidence: high.
- **[T-04/T-06/B-prep] ACCEPTED (review + fresh-verify).** `nextCursor` extracted to `_shared/mod.ts`; body byte-identical to the inline rule (modulo, reportedValid, +1 turn, -1 normalization). `submit_action` calls it; DB insert + 3-retry cursor write untouched (read & confirmed). Fresh-run: 10/10 deno tests pass, `deno check` exit 0. This extraction is the clean seam T-09 will build on (compute via nextCursor → pass to the atomic RPC). Confidence: high.

- **[T-01/T-02/T-03/A] ACCEPTED (deep review + fresh-verify).** `GameEngine.clone()` reviewed field-by-field: all 17 instance fields + full GameState reconstructed via `Object.create` (skips constructor); terrain `.slice()`-copied (clone cannot mutate live engine); tanks/inventory/projectiles/explosions/fire deep-copied; windRng rebuilt from `(windRngSeed, windRngCalls)` + fast-forward (mulberry32 closure state isn't externally readable — this is the correct workaround). `computeNextSeat` now clones live engine + applies only the pending action (no full-log replay). Fresh-run: `npm run check` exit 0 — 21 harnesses incl. all 19 determinism/lockstep/netrounds (proves live replay unperturbed by windRngCalls bookkeeping) + `seat_reuse: OK`. Confidence: high (the low-confidence scope-expansion call from earlier is now de-risked by green determinism harnesses).
- **[T-05/T-11 central wiring] ACCEPTED.** package.json: `seat_reuse.mjs` + `envvars.mjs` appended to `npm run check`; new `check:edge` = `deno test supabase/functions/` (portable `deno`; user PATH has it in new terminals). Fresh-run: `npm run check` exit 0, `deno test` exit 0 (10/10).

## Phase 2 — HARD GATE reached (T-07 migration + T-09 referee→RPC). Halting to surface for user sign-off per SPRINT.md (trust-boundary change + DB migration are never auto-decided).

- **[HARD GATE — T-07/T-09] USER-SIGNED-OFF: Option A (FOR UPDATE).** Presented the full RPC design + SMARTS 6-lens scoring (A=26 strong / B=23 / C=21). User chose A. NOT auto-decided — surfaced and user-attributed per SPRINT.md. Design: plpgsql `submit_room_action` RPC, per-room `FOR UPDATE` seq serialization (removes the race per open-task #3), SECURITY INVOKER + REVOKE-from-PUBLIC + GRANT-to-service_role (no anon back-door past the referee), atomic insert+cursor. Referee validation stays in the Edge Function (trust-client posture unchanged, CONFIRM-01). No prod deploy by the sprint — lands on branch / open-PR.

- **[T-07/T-08/T-09] GREEN (review + fresh-verify), Phase-4 pending.** Migration 004 implements the approved design verbatim (SECURITY INVOKER, REVOKE PUBLIC + GRANT service_role, FOR UPDATE, atomic insert+cursor; idempotent CREATE OR REPLACE; additive — no DDL/backfill). Handler rewired to one `supabase.rpc('submit_room_action', …)` + `rpcResultToResponse` mapper; all referee auth checks (turn gate, bot-proxy, per-seat buy, action-shape) preserved BEFORE the RPC (read & confirmed). Large diff is mostly `import.meta.main` seam re-indentation, not logic. Fresh-run: `deno test supabase/functions/` 13/13, `deno check` exit 0. VERIFY_004.md manual recipe written (live DB not runnable here). Dispatched Phase-4: migration-reviewer + security-reviewer over combined diff → finding-triage next.

## Phase 4 — quality review (combined diff)
- **migration-reviewer: PASS (0 CRITICAL, 0 HIGH).** 004 confirmed additive/non-destructive/idempotent, SECURITY INVOKER + REVOKE-PUBLIC/GRANT-service_role correct (no anon back-door), no SQL-injection surface, 001/002/003 unmodified. Findings: 1 MEDIUM (unguarded FOR UPDATE lock-miss on non-existent room → TOCTOU room-delete window yields generic 500; defense-in-depth, unreachable via existing existence check), 2 LOW (no commented down-path; no data-classification tag — reviewer says no action needed, game has no PII by design).
  - **Decision (as-user):** apply the MEDIUM hardening (`IF NOT FOUND THEN RAISE … ERRCODE='no_data_found'`) + LOW down-path comment; skip the data-classification LOW (repo convention, no PII). Cheap, makes the RPC contract self-enforcing. Deferred until security-reviewer finishes reading 004 (avoid racing the review). Confidence: high.

- **security-reviewer: PASS (0 CRITICAL/HIGH/MEDIUM, 2 LOW informational).** Trust boundary preserved byte-for-byte (referee gate runs before RPC); anon blocked at two layers (no EXECUTE grant + RLS); import.meta.main seam prod-safe; no secret in logs/.env.example; no injection (parameterized JSONB); CONFIRM-01 upheld. LOWs: grant-signature lockstep (→ applied note), console.error full error object (no action — no secret, generic client body).
- **Phase 4 GATE: PASS** (no CRITICAL/HIGH across combined diff). Triage consolidated inline (2 reviewers, 0 blockers). Applied: 004 lock-miss RAISE guard, down-path comment, lockstep note. T-07/T-08/T-09 ACCEPTED.
- **ALL 11 tasks ACCEPTED.** Routing to commit-gate → finishing-a-development-branch (open-PR).

---

# Sprint: stabilize-and-juice (2026-06-20)

Spec `specs/stabilize-and-juice.md` + plan `plans/stabilize-and-juice.md` — USER-APPROVED at the
Phase-1 STOP gate. Branch `sprint/stabilize-and-juice`.

## Phase 1 — spec decisions (interactive gate, user-attributed)

- **Theme:** user chose grouping **B (Stabilization & correctness)** + **D (Physics & visual juice)**, "safe cut". (User-decided.)
- **Scope size:** user chose the **safe cut** — test-only + render/audio-only; held out animated terrain collapse and referee re-derive-seat. (User-decided.)
- **[SPEC] Audio thud-vs-clang DEFERRED.** Of the 4 backlog audio gaps, thud-vs-clang needs the engine to surface `hit.type` on `ExplosionEvent` — a `shared/` change that violates the safe-cut promise. Deferred; the other 3 (betty-hop, napalm-crackle, OOB-fizzle) are pure render-side and stay in. SMARTS: strong (safe-cut is the user's explicit constraint). Confidence: **high**.
- **[SPEC] TDD lands on extracted helpers.** Referee validation is locked behind `import.meta.main` (no test seam) and the client has zero canvas/DOM test harness. So tasks extract a pure helper and unit-test that; canvas/sound is verified by a manual-playtest checklist in the receipt, NOT claimed auto-verified. SMARTS: strong. Confidence: **high**.

## Phase 2 — autonomous execution

- **[ORCHESTRATION] Central package.json ownership.** T5/T6/T7 each append a new harness to the root `check` script; parallel edits to one line collide. Decision: authors create + standalone-verify their harness FILES; orchestrator owns the `package.json` `check`-chain wiring centrally after Wave A lands, then runs the authoritative `npm run check`. (Mirrors the start-here-sweep central-wiring pattern.) SMARTS: strong. Confidence: high.
- **Wave A dispatched (5 parallel authors, disjoint source files):** T1 referee-validation extraction (backend), T3 resync seq-guard (backend), T5 flightticks harness (backend), T6 ai_determinism harness (backend), T7 strata coloring (frontend).

## Phase 4 — Wave A review (combined diff)
- **security-reviewer: PASS.** T1 referee extraction — trust boundary BYTE-FOR-BYTE preserved (all four 403 paths + membership + regime order identical; `as string`/`action!` casts mask no missing guard; `authorizeAction`/`validateActionShape` pure, service-role client unreachable). 0 CRITICAL/HIGH/MEDIUM, 1 LOW informational (no action). No BLOCK.
- **quality-reviewer: PASS, no BLOCKs.** T3 guard correct (no off-by-one, flush untouched); T5 drives real flights (worst 700t, asserts <5000, fixed seeds); T6 two genuinely-independent seeded engines deep-compared; T7 `bandForY` pure/DOM-free, confined to rebuild(), RIM edge preserved, no shared/ change. 2 NON-BLOCK: (a) dead `const TOP` in TerrainRenderer.ts:12 — **fixed inline** (removed, comments still valid); (b) `actingId as string` cast sound/style-only — **skipped** (not worth churn). SMARTS on each: strong. Confidence: high.
- **Wave A GATE: PASS.** Authoritative fresh-run verified by orchestrator: `npm run check` exit 0 (23 harnesses incl. flightticks/ai_determinism/strata); `deno test supabase/functions/` 13/13; `npm run typecheck` exit 0. **T1, T3, T5, T6, T7 ACCEPTED.**

## Phase 2 — Wave B dispatched
- T2 referee behavioral tests (depends T1) + T4 resync_guard harness (depends T3) — both unblocked, reviewers done with their dirs. T8 smoke-trail already running (dispatched during review; package.json owned centrally).

## Phase 2 — Wave B / Track-2 acceptances
- **[T8] smoke trail ACCEPTED (self-verified).** `RingBuffer` (DOM-free, harness-tested 5/5); index-keyed slots with `DISCONTINUITY_SQ=100²` reset → split-tolerant independent trails; `projectile.clear()` wired in `Renderer.reset()`. typecheck green. package.json `ringbuffer.mjs` wired centrally. Manual-visual deferred to playtest. Confidence: high.
- **[T2] referee tests ACCEPTED.** 33 new Deno cases (endsTurn/validateActionShape/authorizeAction); full suite 46 passed | 0 failed; NO logic discrepancy vs intent (regime ordering confirmed correct). check:edge auto-discovers (no wiring). Confidence: high.
- **[T4] resync_guard harness ACCEPTED.** 5 assertions incl. the subtle contiguous-row-not-dropped case + a Map-leak simulation; standalone exit 0. package.json `resync_guard.mjs` wired centrally. Confidence: high.
- **[T9] explosion flash + scorch ACCEPTED (self-verified).** `explosionFx.ts` (DOM-free: `flashIntensity`,`scorchAlpha`); additive full-canvas flash hard-gated on `reduceMotion` (peak α≈0.25, subtle complement to the existing DOM bloom); client-side scorch decal list seeded in consumeExplosion, cleared in reset() — never touches terrain bitmap. `flash.mjs` 10/10, typecheck green, wired centrally. Manual-visual deferred. Confidence: high.
- **package.json central wiring applied:** ringbuffer + resync_guard + flash appended (in addition to Wave A's flightticks/ai_determinism/strata). No collisions (orchestrator-owned).
- **Wave C serial on Renderer.ts:** T9 done → T10 (tank damage/death) dispatched → T11 (audio) next.

## Phase 4 — Track-2 consolidated review (T8–T11, shared Renderer.ts)
- **render-only-reviewer: PASS, no BLOCKs.** Invariants verified: shared/engine + GameState UNTOUCHED by T8–T11 (only sanctioned shared/ add is T3's seqGuard.ts); reset() clears every new per-game field incl. unconditional napalm-source stop; reduceMotion split sensible; four tasks coexist on Renderer.ts with coherent call order, none clobbered another; per-frame cost bounded (no terrain scans/per-pixel loops/unbounded growth); no debug logs, no new Math.random in deterministic paths, no dead code.
- **Dispositions (as-user):**
  - NEEDS-TRIAGE "T7 strata bleed-in" → **resolved, no action**: T7 is a planned Track-2 sprint task; reviewer was scoped to T8–T11 so saw it as foreign. Intentional.
  - NON-BLOCK 5a (RingBuffer full-walk for last item, ≤240 iters) → **skipped**: negligible, pure style.
  - NON-BLOCK 3 (scorch alpha-fade not reduceMotion-gated; comment falsely calls it static) + NON-BLOCK 5b (parseColor(TERRAIN.deep) per active frame) → **FIXED inline**: cached deep-RGB as `scorchRgb` instance field; scorch alpha held constant (0.6) under reduceMotion so the continuous fade — which IS motion — is suppressed while the decal still ages/culls; comment corrected. typecheck green. SMARTS: moderate→fix (cheap a11y-correctness + reviewer caught a false comment). Confidence: high.
- **Phase 4 GATE: PASS.** Authoritative fresh-run (orchestrator): `npm run check` exit 0 (28 harnesses); `deno test supabase/functions/` 46/46; `npm run typecheck` exit 0; `npm run build` exit 0 (352 kB bundle). **All 11 tasks (T1–T11) ACCEPTED.**

## Phase 3 — Land
- Routing to commit-gate → finishing-a-development-branch (auto open-PR per /ca:sprint).
