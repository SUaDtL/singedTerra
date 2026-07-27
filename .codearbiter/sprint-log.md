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

## Phase 3 — Receipt
- Commit 6175a18 (30 files, +2966/-145) → pushed → **PR #21** (base main). commit-gate cleared (explicit staging, secret scan clean, all suites green). finishing-a-development-branch auto-selected open-PR per /ca:sprint — NOT merged, NOT deployed (merge decision is the user's).
- Standup marker `.codearbiter/.markers/standup-2026-06-20` deliberately EXCLUDED from the sprint commit (unrelated /ca:standup artifact).
- **Auto-decisions:** all logged here; **zero `low`-confidence** survived to review (clean run — the safe-cut scope kept SMARTS verdicts strong throughout). No hard gates tripped.
- **Follow-ups:** (1) update `docs`/`open-tasks.md` to mark the 9 backlog items done (post-merge hygiene, mirrors PR #20 pattern); (2) manual canvas/audio playtest checklist in PR #21; (3) deferred: thud-vs-clang audio (needs engine signal), + the two held-out heavyweights (animated collapse, referee re-derive seat).

---

# Sprint: stabilize-and-juice-2 (2026-06-20)

Spec `specs/stabilize-and-juice-2.md` + plan `plans/stabilize-and-juice-2.md` — USER-APPROVED at the
Phase-1 STOP gate ("approved"). Branch `sprint/stabilize-and-juice-2`. Follow-up to PR #21; takes on
the held-out heavy item (animated terrain collapse) + 2 safe-cut netcode companions.

## Phase 1 — spec & plan decisions (interactive gate, user-attributed)

- **Scope tier:** user chose "Take on a heavy item" (over safe-cut / safe-cut+signal). (User-decided.)
- **Heavy item:** user chose "Animated terrain collapse" (over referee seat re-derivation, which would
  hard-gate). (User-decided.)
- **Priority:** user chose "Balanced". (User-decided.)
- **Spec + plan approval:** user typed "approved". Interactive STOP gate cleared; autonomy begins.

## Phase 2 — execution auto-decisions

- **[high] Subagent granularity = one fresh subagent per acceptance criterion (4), not per plan-task (9).**
  `tdd` is test-first, so each AC's failing-harness task and impl task are one red→green unit; splitting
  them across two fresh contexts would hand the impl subagent a test authored in a different context.
  SMARTS: strong. Chosen: 4 per-obligation subagents (each red→green over its coupled task pair).
- **[high] Sequential dispatch (AC-01 → AC-02 → AC-03 → AC-04).** All four obligations edit the root
  `package.json` `check` script (wire their new harness in) — a shared-file conflict point; AC-02 also
  depends on AC-01. Parallel risks lost edits for no worthwhile wall-clock win. SMARTS: strong.
  Orchestrator owns the central `package.json` `check`-chain wiring (mirrors the prior two sprints).
- **[high] REFINEMENT — parallel-where-disjoint.** Because subagents never touch package.json (orchestrator
  owns that wiring), the package.json conflict point is removed. Real overlaps: AC-02 depends on AC-01's
  `settleStep`; AC-03 + AC-04 both edit `NetworkClient.ts`. But Track A (Terrain.ts/GameEngine.ts) and
  Track B (retry.ts/NetworkClient.ts/replay.ts) are file-disjoint, so AC-01 ‖ AC-03 launched in PARALLEL.
  Order: {AC-01 ‖ AC-03} → {AC-02 after AC-01 ‖ AC-04 after AC-03}. SMARTS: strong (real wall-clock win,
  zero added collision risk).
- **Wave 1 dispatched (parallel, disjoint files):** AC-01 (Terrain.ts settleStep + collapse.mjs parity
  harness, ca:backend-author) ‖ AC-03 (retry.ts postOnceWithRetry + finish_game rewire + netretry.mjs,
  ca:frontend-author).

## Phase 3 — spec-compliance reviews

- **[AC-03] PASS (review, fresh-verify pending Phase 5).** `postOnceWithRetry<T>(fn, attempts=2)` is a
  pure discriminated-union helper that never rejects (loop swallows every throw → `{ok:false,error}`).
  `callFinishGame` wraps the real fetch, throws on `!res.ok` so non-2xx triggers the one retry,
  `void`-prefixed (fire-and-forget preserved), original `console.error` on final failure preserved.
  Scope clean (retry.ts + callFinishGame + netretry.mjs only). RED failed correctly (module missing),
  GREEN 3/3.
- **[AC-01] RETURNED to Phase 2 — real defect caught.** `settleStep` shipped a RIGID-BLOCK model
  (anchors all column solids at the topmost solid, slides as one block). Convergence parity held (final
  state correct) so the harness "passed" — but it reported worst-case settle ticks = 0, i.e. NO case
  exercised the multi-tick path. The bug: a `solid→air-gap→solid-floor` column (a crater carved through
  a hill) would lift the resting lower ground UP into the gap mid-settle — non-downward, and it would
  yank the floor out from under a tank resting on the lower ground. AC-02's progressive burial needs a
  monotonically descending surface, so this had to be fixed BEFORE AC-02 builds on it. Corrective brief:
  replace with a supported-dirt sand model (pxPerTick one-px sub-steps, bottom-up; supported grains stay,
  only unsupported dirt falls) + strengthen collapse.mjs to include overhang cases that require >=2
  settle calls and assert downward-only (solid count conserved, surface monotonically descends, bottom
  resting run never loses pixels). This is exactly the value of not trusting a self-reported green: a
  vacuously-green harness over an unexercised code path. Confidence: high (defect concrete + reproduced).
- **[AC-04] PASS (review, fresh-verify pending Phase 5).** `replayInChunks<A>` added to `shared/net/replay.ts`
  — pure, no `GameEngine` import (shared-purity intact), strict index order, yields after every `chunkSize`
  apps except the last, `chunkSize<1`→1, empty array no-op. `initialize()` swaps its synchronous for-loop for
  `await replayInChunks(rows, row=>{applyNetworkAction;tickToCompletion}, 16, ()=>setTimeout(r,0))`; isReplaying
  bracket + `nextExpectedSeq=rows.length` preserved → byte-identical replay result, only event-loop yields added.
  Scope clean (replay.ts helper + initialize() + chunkreplay.mjs). RED failed correctly, GREEN 5/5.
- **[AC-01 corrective] DISPATCH NOTE — fork failed, re-routed to fresh backend-author.** First corrective
  used `subagent_type: fork`, which inherited the orchestrator persona and NARRATED the fix back (0 tool uses,
  no edits) instead of executing it. No harm (tree unchanged). Lesson logged: `fork` = "continue my reasoning",
  wrong for isolated implementation; a fresh `ca:backend-author` arrives as an implementer. Re-dispatched the
  same corrective brief to a fresh backend-author. Confidence: high.

## Phase 5 (partial) + Phase 2 wave 2

- **[AC-01] corrective VERIFIED by orchestrator (fresh run).** Sand model confirmed in code (bottom-up
  1px substeps; supported dirt/floor inert). `npx tsx scripts/checks/collapse.mjs` = 72 passed / 0 failed,
  worst-case settle ticks **70** (>=2, multi-step path genuinely exercised; limit 150). Existing 29 harnesses
  + typecheck green. AC-01 is Phase-3+5 clean (final ACCEPT deferred to the once-per-scope Phase 4).
- **[AC-02] dispatched (fresh ca:backend-author, solo — Track B done, GameEngine.ts free).** Design briefed:
  deferred-final-settle. detonate() defers gravity into `pendingSettle` + tank-resolution moved to
  `resolveTanksToTerrain()`; `flushSettleInstant()` keeps terrain compacted while projectiles/fire remain
  (mid-flight collision parity byte-identical); only the final settle (survivors==0, no fire, >1 alive)
  animates one `settleStep`/tick during RESOLVING; game-ending path instant-settles (preserves #14 banner
  immediacy). PARITY GATE: all final-state harnesses must stay green UNCHANGED; only timing harnesses
  (flightticks, maybe motion/timestep counts) may be re-pinned; if a final-state harness needs new expected
  values, the subagent STOPs and surfaces (hard-gate-class signal). New `collapse_engine.mjs` covers the
  animation (monotonic tank descent, RESOLVING spans >=2 ticks, bounded, per-tick determinism, #14).

- **[AC-02] GREEN (engine), but review caught an INCOMPLETE obligation across the client boundary.**
  Engine impl clean: `pendingSettle` + `flushSettleInstant`/`settleStepAnimated`/`resolveTanksToTerrain` +
  RESOLVING tick branch; worst RESOLVING 7 ticks (cluster, limit 150). PARITY HELD: all final-state harnesses
  green with ZERO assertion-value changes — the 21 re-pins are loop-condition only (`FIRING` → `FIRING||RESOLVING`
  so the harness ticks through the new multi-tick phase to the SAME final state). flightticks worst 702 (was ~600),
  still << 5000 threshold (unchanged). This is the textbook "convergent final state → only timing re-pins" outcome.
  - **Caught (completeness):** the subagent surfaced `[NEEDS-TRIAGE]` that `NetworkClient.tickToCompletion` loops
    on `phase==='FIRING'` only. On review this is NOT defer-for-later — it's an INCOMPLETE AC-02 obligation: the
    spec's Determinism Contract promises replay stays correct, but a client replay loop halting at RESOLVING leaves
    the engine mid-settle. Found 3 client sites with the same root cause: `tickToCompletion` (replay driver),
    `tickEngineToCompletion` (next-seat clone → wrong cursor if it stops pre-resolve()), and the `start()` rAF flush
    trigger (`wasFiring && phase!==FIRING` → after FIRING→RESOLVING the flush never re-fires on RESOLVING→PLAYER_TURN
    → buffered-action queue stalls, a P0-2 regression). The engine harnesses missed all 3 because they drive the
    SHARED engine directly, never NetworkClient's fast-forward/queue logic — the bug lives in the layer harnesses
    don't reach. SMARTS: strong (real correctness defect in the networked half of the product). Confidence: high.
  - **Completion fix dispatched** (fresh ca:frontend-author, NetworkClient.ts now free post-AC-04): mirror the
    engine's `FIRING||RESOLVING` busy predicate at all 3 sites; scan for sibling busy-checks; Renderer.ts:300
    FIRING-only render gate left untouched (correct). No client harness exists → verified by typecheck + written
    traces + flagged for the 2-browser manual playtest in the receipt.

## Orchestrator TODO before landing
- Central `package.json` `check`-chain wiring for the 4 NEW harnesses: `collapse.mjs`, `collapse_engine.mjs`,
  `netretry.mjs`, `chunkreplay.mjs` (subagents created the files; orchestrator owns the wiring per the sequencing
  decision above). Then run authoritative `npm run check` + `npm run typecheck`.

- **[AC-02 completion fix] ACCEPTED (review + traces).** All 3 NetworkClient sites mirror `FIRING||RESOLVING`;
  siblings scanned (Renderer.ts:300 render gate + main.ts PLAYER_TURN AI gate correctly left alone; HotSeatClient
  ticks unconditionally — fine). typecheck + check green.
- **[ORCHESTRATOR] package.json wiring applied + authoritative fresh-run.** Appended collapse.mjs, collapse_engine.mjs,
  netretry.mjs, chunkreplay.mjs to `check`. `npm run check` exit 0 — 33 harnesses (29 prior + 4 new), typecheck
  included. collapse_engine worst RESOLVING 7/150 ticks, per-tick determinism green, #14 preserved.

## Phase 4 — quality review (combined diff, independent reviewer)

- **Determinism/correctness reviewer: PASS — no CRITICAL/HIGH.** Verified all 7 determinism-contract points:
  pendingSettle reset on every game/round boundary (constructor + startNextRound + all flush paths; null at
  GAME_OVER); resolveTanksToTerrain moved byte-identical (diffed vs `main`); RESOLVING branch resolves exactly
  once, convergence guaranteed; instant-flush == applyGravity by construction; the 3 NetworkClient fixes correct
  (seat-derivation clone fix flagged LOAD-BEARING — without it AC-02 returns the wrong next seat); no new
  Math.random/Date/float-nondeterminism in engine. Verdict: lockstep integrity intact, live == replay, safe to ship.
- **MEDIUM disposition (as-user, SMARTS moderate → ACCEPT + document). Confidence: LOW (review this).**
  Same-tick multi-detonation: two projectiles detonating in ONE tick now collide #2 against #1's un-compacted
  overhang (single flush runs after the projectile loop, not per-blast). NOT a desync (deterministic; all clients
  identical) — a gameplay-parity shift vs main for rare same-tick seeds. Spec promised "byte-identical bomblet
  collision," so this is a real deviation from an approved promise → logged low-confidence. ACCEPTED because: (a)
  lockstep integrity (the property that matters) is intact; (b) affected case is uncommon + deterministic; (c) the
  reviewer's suggested fix (compact per-blast in-loop) would instant-compact the FINAL blast and DEFEAT the
  animation — perfect mid-flight parity and deferred-settle animation are fundamentally in tension; (d) gameplay
  constants are explicitly playtest-tunable. Documented in-code (GameEngine path-A comment) + receipt + open-tasks.
- **LOW dispositions:** (1) no harness pins the in-flight-flush paths A/B/D specifically — open-tasks follow-up
  (existing suite + collapse_engine cover the main paths). (2) postOnceWithRetry has no backoff / no attempts<1
  guard — harmless (call site hardcodes 2); open-tasks follow-up. (3) CANVAS 600 vs CLAUDE.md doc drift —
  pre-existing, already tracked; not this diff.
- **Phase 4 GATE: PASS.** No CRITICAL/HIGH across combined diff. All 5 units (AC-01..04 + completion fix) ACCEPTED.

---

# Sprint — "Scorched Earth parity: economy & match-flow" (`se-parity-economy`, 2026-06-21)

Branch `feat/se-parity-economy`. Spec: `.codearbiter/specs/se-parity-economy.md`. Ultracode pass; SDD→TDD
maintained per feature (spec → failing harness → implement → green). Four SE-parity features, three
engine-only + one contract-touching, all determinism-harness-validated.

## Features (each: spec ACs → one harness, red→green)
- **Credit interest at ROUND_OVER** — `GameOptions.interestRate`; `floor(credits*rate)` integer interest on
  the carried (post-payout) balance in `startNextRound`; `clone()` copies the rate. Harness `interest.mjs`
  (5 checks: back-compat, floor math, single-round no-op, once-per-transition, determinism+clone parity).
- **Sudden-death gravity escalation** — `GameOptions.suddenDeathTurn`; `effectiveGravity(base,turn,sdTurn)`
  pure function ramps gravity past the threshold, threaded into the projectile integration. Harness
  `suddendeath.mjs` (precise straight-up y re-sim pins the exact gravity; within-config AC8 range; AI check).
- **Arms-level room setting** — `GameOptions.armsLevel` (0–4, default 4=everything); `applyBuy` rejects a
  weapon above the room level. Harness `armslevel.mjs` (5 checks incl. both shop paths).
- **Batteries accessory** — `TankState.powerCap` (default 100), `buy.accessory='battery'` raises it +100
  ($5000 catalog bundle); extended through `PlayerAction`/`replay.ts`/the Deno referee
  (`validate.ts`+`index.ts`); carried across rounds. Harness `batteries.mjs` (6 checks) + 4 new referee
  Deno cases.

## Verification
- `npm run check` exit 0 — typecheck (shared + client) + **38 harnesses** (34 prior + 4 new).
- Deno referee suite: **41 passed** (38 prior + 3 new), backward-compatible contract change.

## Adversarial review (Workflow, 4 lenses × independent verify) — 5 confirmed findings, all addressed
- **BLOCKER (2 lenses, conf 5) — referee fire-power ceiling.** A Battery raises powerCap>100, the engine
  clamps `set_power` to powerCap (power 150 legit), the client POSTs 150, but the referee still hard-capped
  `fire` power at `[0,100]` → battery shot REJECTED networked but works hot-seat = a real cross-context
  divergence. **Real miss.** Fix: relaxed the referee bound (finite+>=0 only; the engine clamps to powerCap
  authoritatively on replay — trust-client, CONFIRM-01). Pinned by a new `batteries.mjs` engine-authoritative-
  clamp assertion + updated Deno tests (power 150 passes; NaN/Inf/neg rejected).
- **MAJOR — AI planner ignored sudden-death gravity** (deterministic, not a desync; bots fall short once
  escalation kicks in). Fix: exported `effectiveGravity()` + public `getEffectiveGravity()`; added it to the
  `GameClient` interface (HotSeat/Network delegate to their engine); both AI drivers now plan with effective
  gravity. Proven by a new `suddendeath.mjs` check (bot lands 10px vs 300px from target).
- **MINOR — `suddendeath.mjs` AC8 test proved ON-vs-OFF, not the literal within-config across-turn.** Fix:
  rewrote Check 4 to fire one config at turn==T vs turn>T and assert range shrinks (ON-vs-OFF kept as bonus).
- **MINOR — buy with BOTH weapon+accessory unenforced** (silently dropped the weapon). Fix: referee now
  400-rejects both-fields + a Deno test.
- Second-pass review on the FIXES dispatched (referee relaxation / AI wiring / completeness).

## Deferred (documented in open-tasks.md)
- **UI exposure** (lobby toggles for interest/sudden-death/arms-level; a Store button for Batteries — the
  HUD store is `WeaponType`-keyed and needs a small accessory generalization). The engine+contract is
  complete and harness-validated; the UI affordance is the remaining surface.
- **Backend redeploy** (`npm run deploy:backend`) for the battery referee shape (additive/back-compat).
- **Tank movement** (new networked action; own sprint) and **Parachutes** (needs a NEW fall-damage mechanic
  first — the `[H/S]` estimate undercounts it; re-tagged `[H/M]` in open-tasks).

## Second-pass review (on the FIXES) — completed; no new blocker; 4 findings, all dispositioned
- **MINOR — sudden death keyed off match-global `state.turn`** (never reset per round) → in a best-of-N
  match later rounds opened already-escalated. **Fixed:** added a `turnAtRoundStart` baseline (reset in
  `startNextRound`, copied by `clone()`); `currentGravity()` now uses the PER-ROUND turn. New `suddendeath.mjs`
  Check 7 plays through a round boundary and asserts round 2 opens at base gravity (global turn 11).
- **MINOR — both-fields buy guard was referee-only.** **Fixed:** `applyBuy` now no-ops a both-fields buy too
  (two-context symmetry) + new `batteries.mjs` Check 2b.
- **NIT — stale `[0,100]` one-liner comment** in `validate.ts`. **Fixed.**
- **NIT — Deno edge tests run via `check:edge`, not `npm run check`.** ACCEPTED + tracked: overlaps the
  existing open-tasks governance item ("wire `deno check`/`deno lint` into a committed script"); forcing
  deno + network into the Node-only primary gate is undesirable. Referee tests pass via `check:edge` (41).
- Final state: `npm run check` exit 0 (typecheck + 38 harnesses); `check:edge` 41 passed. The
  `fix-determinism` lens found NOTHING — the AI effective-gravity wiring is lockstep-safe (every client's
  engine is at the same turn, so all compute the identical plan).

---

# Sprint: se-parity-ui (2026-06-21) — UI exposure of the SE-parity economy

Spec: `.codearbiter/specs/se-parity-ui.md` · Plan: `.codearbiter/plans/se-parity-ui.md` · Branch:
`feat/se-parity-ui` (cut from `feat/se-parity-economy`, carries the unmerged engine commit 7552170).

## Spec-gate decisions (user, 2026-06-21)
- Arms-level visual store gate: **IN** (UI-only `HUD.setArmsLevel`, no GameState/determinism change).
- Scope: **full hot-seat + networked** (additive `create_room` change + NetworkClient accessory fix).

## Auto-decisions (append-only)

- **[high] Execution mode: direct orchestrator implementation, not per-task fresh subagents.**
  Options: (a) dispatch one fresh subagent per task per subagent-driven-development; (b) implement
  directly in this context. SMARTS: the 14 tasks have heavy file overlap (`HUD.ts` in B1/B2/F1,
  `main.ts` in B3/D2/E4/F2, `Lobby.ts` in D1/D2/E1/E4) — fresh subagents would each re-read the same
  large files and risk edit races; a single coherent context is lower-drift here. Gate discipline
  preserved: harness-first for testable seams, typecheck per slice, full `npm run check` + `deno test`
  before commit-gate. Chosen (b). Confidence high (the value of fresh contexts — no accumulated drift —
  is outweighed by the coordination cost on tightly-coupled shared-file edits).

- **[high] armsLevel control as a number field, not a `<select>`.** Spec suggested a 0–4 select. Used
  the existing `numberField`/`onlineNumberField` helpers (0–4 integer input + descriptive hint "0 =
  basic … 4 = full arsenal") in BOTH forms instead. SMARTS: a select needs a new string-bound helper
  in two places for marginal UX gain; the number field reuses tested code and stays consistent across
  both forms. Confidence high; trivially upgradeable to a select later if playtest wants labels.
- **[high] `parseOnlineEconomy()` shared helper.** The create-room body and the local `waitingOptions`
  MUST agree on the values (else the host's engine could differ from what the room stores). Extracted
  one parse helper used by both, mirroring the existing `parseOnlineRounds()`. Confidence high.
- **[high] `create_room/validate.ts` extraction.** AC1 needs a unit-testable coercion seam without a
  live Supabase. Extracted a pure `coerceEconomyOptions` (mirrors `submit_action/validate.ts`) +
  Deno tests. Coercion is omit-on-invalid (never 400s) so a bad economy value can't fail room
  creation. Confidence high.
- **[high] Verification:** `npm run check` (typecheck + 39 harnesses) green; `npm run build` clean;
  `check:edge` 57 passed (incl. 6 new create_room cases). New harness `accessories.mjs` (drift guard)
  + `batteries.mjs` check 5c (NetworkClient rebuild contract) added to the chain.

## Owed at close (Receipt)
- OPS: `npm run deploy:backend` — additive `create_room` (economy fields) + battery referee shape.
- Manual 2-browser networked playtest + hot-seat arms-gate/battery/interest visual check.

---

# Sprint: checkpoint-quick-kills (2026-06-21)

Spec/plan: `.codearbiter/specs/checkpoint-quick-kills.md`, `plans/checkpoint-quick-kills.md`.
Source: the 6-reviewer checkpoint `.codearbiter/checkpoints/2026-06-21.md` — the 8 findings tagged
(quick-kill → sprint). User approved spec + plan at the Phase 1 gate before autonomy.

## Auto-decisions

- **[high] XSS fix: escape inside `cell()`, not a `textContent` rebuild.** T1 had two routes — (a)
  rebuild the rows with `document.createElement` + `.textContent`, or (b) add an `esc()` HTML-escaper
  applied to every interpolated value inside the existing `cell()` helper. SMARTS: (b) is the smaller,
  lower-risk diff, preserves the working layout, and is future-proof (every cell escaped, not just
  today's `name`). Chose (b). `client/src/ui/HUD.ts` buildScoreboard. Confidence high.
- **[high] XSS sink audit came back clean elsewhere.** Grepped all 13 `playerName`/`playerLabel`
  refs in HUD.ts: 246/667/670/763/810/848/854/909/912/951/962 all assign via `.textContent`; 958 is
  `innerHTML = ''` (clear). `buildScoreboard:1024` was the ONLY `innerHTML` sink with user data. No
  further change needed. Confidence high.
- **[high] `playerId` log: truncate to an 8-char prefix, not drop.** T5 — `this.playerId?.slice(0, 8)`
  keeps session-distinguishing diagnostic value without exposing the full identity token. Confidence high.
- **[high] config.toml: disable `[auth]` only.** T4 — set `enabled`/`enable_signup` false in the
  `[auth]` block (lines 29-33) ONLY; left the `enabled = true` under `[api]`/`[db]`/`[realtime]`/
  `[studio]` untouched (required subsystems). Confidence high.
- **[high] `random.mjs` asserts the documented NaN/Infinity coincidence, not distinctness.** `hashSeed`
  folds every non-finite seed to `0x9e3779b9`, so `createRng(NaN)` and `createRng(Infinity)` SHARE a
  stream by design — the harness pins that fold + reproducibility/range, rather than wrongly demanding
  they differ. Confidence high.
- **[high] `resync_guard.mjs`: extend, don't duplicate.** Check B/D already cover `seq==nextExpected`
  and one-behind; added only a new Check F for the uncovered extreme values (large gap, ±Infinity,
  negative seq). Confidence high.

## Verification (fresh run)
- `npm run check`: typecheck clean + 41 harnesses green (38 existing + new `math.mjs`, `random.mjs`;
  extended `resync_guard.mjs`). `npm run check:edge`: 57 Deno cases passed. `tsx@^4.19.0` now
  lockfile-pinned (3 packages added). Determinism unbroken.

## Hard gates
- None tripped. The XSS fix is trust-boundary-adjacent but ADDS escaping (bypasses no control) — flagged
  for the commit-gate security pass. No `/override`, no migration, no merge-to-default (auto open-PR).

## Owed at close (Receipt)
- OPS: the `_shared/mod.ts` pin (`@2.107.0`) and `config.toml` `[auth]=false` take effect on the NEXT
  `npm run deploy:backend` — NOT deployed by this sprint (source-only change).

---

# Sprint: public-ready (2026-06-21)

Spec/plan: `.codearbiter/specs/public-ready.md`, `plans/public-ready.md`. Part 1 of 2 of "going
public" (user chose full community-ready · CI gate+hygiene · implement the limiter). This is the SAFE
half — CI, hygiene, docs; zero backend/trust-boundary change. Sprint B `public-hardening` (limiter,
threat-model, ADRs) runs next, gated by this CI. User approved spec + plan at the Phase 1 gate.

## Auto-decisions

- **[high] CodeQL guarded on repo visibility.** Uploading CodeQL results needs a public repo (or GHAS);
  on the currently-private repo a naive job would fail its upload and paint a red check on this very PR.
  Guarded the analyze job with `if: github.event.repository.visibility == 'public'` so it's SKIPPED
  (neutral) while private and self-activates at the flip — no edit needed later. Confidence high.
- **[high] CI edge job calls `deno test` directly, not via `npm run`.** The edge runtime is Deno; the
  job uses `denoland/setup-deno@v2` + `deno test supabase/functions/` rather than installing Node just
  to shell `npm run check:edge`. The referee tests import only the pure `validate.ts` (no remote
  imports), so no `--allow-net`/`--allow-import` is needed. Confidence high.
- **[high] README harness count → 41, table kept as a representative sample.** The prose said 16 and the
  table lists 16 rows; there are now 41 harnesses. Updated all four "16" references to 41 and reworded
  the table as "a representative selection" + a "…and 25 more" note, rather than bloating it to 41 rows.
  Confidence high. (Count verified: 39 original chain entries + math + random = 41.)
- **[high] No "play it live" link added.** The README has no live URL today; rather than guess a
  Netlify alias (a dead link in a public README is worse than none), left it blank and flagged it as a
  user action at flip time. Confidence high.
- **[high] One npm Dependabot entry, grouped.** The root lockfile governs the whole workspaces monorepo,
  so a single `npm` ecosystem entry at `/` covers client + shared; grouped minor/patch to cut PR noise.
  Confidence high.
- **[high] `private: true` deliberately KEPT.** Confirmed unchanged — it blocks accidental `npm publish`
  and is unrelated to GitHub visibility. Recorded in the exposure-audit doc so it isn't "fixed" later.

## Verification (fresh run)
- `npm run check` (typecheck + 41 harnesses) green; `npm run build` green; all four YAML files parse;
  `private: true` intact. Edge functions untouched → `check:edge` unaffected (CI's edge job re-runs it
  on the PR). AC1 (CI green) is confirmed by the PR's own checks.

## Hard gates
- None tripped. All work is file creation under `.github/` + root docs + a light README edit; no
  engine/client/Edge Function/migration change. The repo flip, branch protection, and repo
  description remain USER ACTIONS (outward-facing/irreversible) — not automated.

## Owed at close (Receipt)
- USER: after merge, enable branch protection on `main` requiring the `check` + `edge` checks; set repo
  description/topics; add the canonical play URL to the README; flip to public AFTER Sprint B lands.
- NEXT: Sprint B `public-hardening` — rate limiter (CONFIRM-04), `/ca:threat-model`, ADRs (CONFIRM-05).

---

# Sprint: public-hardening (2026-06-21)

Spec/plan: `.codearbiter/specs/public-hardening.md`, `plans/public-hardening.md`. Part 2 of 2 of "going
public". Branched off main AFTER #32 merged, so its PR is gated by the CI from #32. User approved the
spec at the gate and locked the rate-limiter design: **Postgres counter table, default caps**, execute
after #32 merges; deploy + repo flip stay the user's.

## Auto-decisions

- **[high] Limiter hooks into `withCors()`, the single chokepoint.** All 10 functions already wrap
  through `withCors`; added a `rateLimit?: string` (bucket) opt there + an `enforceRateLimit()` helper,
  rather than editing 10 handlers. One seam, per-function caps via `RATE_LIMITS`/`RATE_LIMIT_DEFAULT`.
- **[high] RPC returns the count; the app decides.** `bump_rate_limit` returns the post-increment count;
  the pure, unit-tested `checkRateLimit(count, limit)` makes the allow/deny call. Keeps the limits in the
  app (tunable without a migration) and the decision testable without a live DB.
- **[high] Fail OPEN on limiter error.** An RPC/DB hiccup logs and allows the request — a limiter outage
  must not take the game down. MissingEnvError still propagates to the canonical 500.
- **[high] `rateWindow(nowMs)` takes the time as an argument** (pure) so it's unit-testable; `withCors`
  passes `Date.now()`. Wall-clock is fine here — Edge Functions are NOT the deterministic engine.
- **[high] Migration 005 security comment written accurately** (unlike 004's, which the checkpoint
  flagged): states the real control is the REVOKE-PUBLIC/GRANT-service_role grant, since the caller is
  service_role and bypasses RLS. Table also carries a data-classification comment.
- **[high] Threat model (T1): no CRITICAL.** STRIDE surfaced the DoS gap (fixed by this sprint) plus an
  accepted Spoofing vector — `playerId` is NOT secret (it's in the publicly-SELECTable action log), so a
  reader could act as another player ON THAT SEAT'S TURN; bounded by the turn-gate + seq-unique +
  bot-only-proxy, and accepted under the ephemeral-identity decision. Recorded for the threat-model owner.

## HARD GATE encountered (not a stop — scope-adjusted)
- **[HARD GATE — H-11] ADR authoring blocked.** The pre-write hook prohibits batch-writing ADR files;
  ADRs must go through `/ca:adr` with explicit user attribution ("never author an ADR as its own
  judgment"). CORRECT behavior — I did NOT work around it. Scope-adjusted: the rate-limiter (code,
  tested) shipped; the **decision** to formalize ADRs is recorded, but authoring the 7 ADRs is a
  `/ca:adr` follow-up (user-attributed). CONFIRM-05 is "decided, authoring pending"; CONFIRM-04 fully
  resolved. open-questions.md + security-controls.md adjusted to not reference not-yet-authored ADRs.

## Verification (fresh run)
- `"$HOME/.deno/bin/deno.exe" test supabase/functions/`: **67 passed** (57 + 10 new rate-limit cases:
  checkRateLimit boundary, clientIp parsing, rateWindow, rateLimitFor). `npm run check` (typecheck + 41
  harnesses) + `npm run build` green. Shared/client untouched.

## Hard gates / owed
- **OPS deploy (USER):** `npm run deploy:backend` applies migration 005 + the 10 functions — the limiter
  does nothing until deployed. Then a manual `curl` 429 check (live DB not in CI).
- **ADRs (USER):** author ADR-001..007 via `/ca:adr` (I can drive them interactively).
- **Repo flip to public (USER).**

---

# Sprint: ai-shot-search-performance (2026-07-20)

Spec/plan: `.codearbiter/specs/ai-shot-search-performance.md`, `plans/ai-shot-search-performance.md`.
User approved quality parity, then approved the combined spec + plan gate. Autonomous execution authorized.

## Auto-decisions

- **[high] Deterministic multi-basin coarse-to-fine search over fixed truncation or a Web Worker.** SMARTS: Scalable/Maintainable/Reliable/Testable favor cutting probes behind a pure seam; chosen coarse-to-fine, strength strong. Confidence high.
- **[high] No new dependency.** SMARTS: Maintainable/Available/Testable/Securable favor existing TypeScript and physics seams; every proposed approach was dependency-free, so package state stays unchanged. Strength strong. Confidence high.
- **[high] External worktree from current `origin/main`.** SMARTS: Reliable/Maintainable preserve the stale merged checkout and untracked `AGENTS.md`; chosen `codex/ai-shot-search-performance` in `singedTerra-worktrees`. Strength strong. Confidence high.
- **[high] Tighten hard-mode ceiling from 1,000 to 500 probes after live issue and benchmark inspection.** SMARTS: Reliable/Testable require removing the frame stall, not merely improving throughput; 60.0-64.1 ms warmed baseline supports the stricter gate. Strength strong. Confidence high.
- **[high] Correct the drafted TDD sequence before dispatch.** SMARTS: Reliable/Testable reject an unhandled missing-import error and a manufactured duplicate-identifier failure; chosen controlled feature-missing RED then green-refactor-green integration. Strength strong. Confidence high.

## Task 3 fresh-verification receipt (2026-07-20)

- Full fresh suite: `npm run check` exit 0 in 40.925 s; the command visibly included `ai_search.mjs`, whose 24 scenario/difficulty cases passed the probe, exhaustive-reference regret, resolution-parity, and repeat-determinism gates.
- Client suite: `npm run test:client` exit 0; 20 files and 158 tests passed. Error-path logging was expected characterization output.
- Production build: `npm run build` exit 0; shared/client typechecks passed, Vite transformed 86 modules, and the production bundle built in 481 ms.
- Diff hygiene: `git diff --check` exit 0; only line-ending conversion warnings were emitted.
- New paired benchmark run: `npx tsx scripts/checks/ai_search.mjs --benchmark` exit 0 on the same warmed `ridge-right` hard-mode state with 20 samples per path: optimized median **3.42 ms**, independent exhaustive median **67.42 ms**, speedup **19.70x**. This passes the enforced optimized <=8 ms and speedup >=7x gates; hard search used 276 optimized probes versus 6,966 exhaustive probes.
- Scope/dependencies: only sprint implementation and governance files changed; `package-lock.json` has no diff, no dependency was added, and `AiShotSearch.ts` contains no `Math.random`, `Date.now`, or `performance.now` use.
- Landing: T1/T2/T3 accepted; spec implemented and awaiting the controller-owned commit gate. No low-confidence SMARTS decisions or `[NEEDS-TRIAGE]` findings.- **[high] Fix the final review's Important oracle gap and both related Minor findings in one wave.** SMARTS: Reliable/Testable/Maintainable favor independent grids, observed probes, reachable early-exit semantics, and alternated timing; chosen fix-all, strength strong. Confidence high.

- **[high] Canonical T4 decision (format correction; prior append joined the receipt line).** SMARTS: Reliable/Testable/Maintainable favor fixing the oracle gap, reachable early exit, and alternated timing together; chosen fix-all, strength strong. Confidence high.


## T4 final-review correction receipt (2026-07-20)

- **RED — observer/direct-hit seam:** after the independent harness assertions landed but before production changed, `npx tsx scripts/checks/ai_search.mjs` exited 1. The independent exhaustive grids stayed at easy **3/4 = 630**, medium **2/2 = 1,804**, and hard **1/1 = 6,966** probes; every production observer reported **0 observed calls** against nonzero reported counts, and the known `right-near-calm/hard` 5.65 px shot failed to short-circuit at 276 probes.
- **RED — oracle-independence mutation:** changing only production base steps to 85/80 made the same harness exit 1 while its independent exhaustive counts remained **630/1,804/6,966**. It caught regret failures in `right-far-headwind/easy` (66.87 px), `right-far-headwind/hard` (26.03 px), `right-far-tailwind/hard` (4.62 px), `left-far-tailwind/hard` (4.15 px), and `ridge-left/easy` (79.91 px), plus the direct-hit score regression to 6.67 px. The mutation was restored before GREEN.
- **GREEN — independent quality/probe oracle:** `npx tsx scripts/checks/ai_search.mjs` exit 0 across all 24 scenario/difficulty cases. The harness pins its own base steps and exact exhaustive counts, independently re-simulates the returned angle/power before regret comparison, and wraps the injected ballistic probe. Reported probes equaled observed unique calls in every case (easy 102-198, medium 138-234, hard 159-228), with no duplicate calls.
- **Direct-hit proof:** the geometry threshold is `Math.min(TANK_WIDTH, TANK_HEIGHT) / 2` = **6 px**. The known `right-near-calm/hard` case independently scored **5.68 px**, had **0.48 px** regret within the unchanged hard limit, and short-circuited at **180 probes** versus the prior 276-probe full refinement.
- **Alternated benchmark:** `npx tsx scripts/checks/ai_search.mjs --benchmark` exit 0 using 20 same-state pairs with optimized/exhaustive order alternated by pair: optimized median **1.96 ms**, exhaustive median **67.40 ms**, speedup **34.41x**. The unchanged <=8 ms and >=7x executable gates passed.
- **Focused verification:** `npm -w @singedterra/shared run typecheck` exit 0; `npx tsx scripts/checks/engine_purity.mjs` exit 0 (`ENGINE PURITY CHECK: PASSED`); `git diff --check` exit 0 with only pre-existing line-ending conversion warnings.
- **Review closure:** production search policy is no longer exported; `searchShot` has an optional per-call probe seam defaulting to `simulateImpact`, with no global test hook or mutable cross-turn cache. T4 **ACCEPTED**. Commit/PR remain behind the controller-owned codeArbiter commit gate.

- **[high] Add the canonical codeArbiter state-free secrets command to `tech-stack.md` as a separate docs prerequisite.** SMARTS: Maintainable/Reliable/Securable/Testable require the commit gate to use an explicit discovered scanner rather than guess or bypass; chosen minimal governance repair before feature commit, strength strong. Confidence high.

- **[high] Preserve the legacy `open-tasks.md` prose entry and close GitHub issue #63 instead.** SMARTS: Maintainable/Reliable/Testable favor the commit gate structured-transition invariant over an arbitrary legacy-board rewrite; chosen issue-backed completion with unchanged product acceptance, strength strong. Confidence high.

# Sprint: mobile-hud-overflow (2026-07-20)

Spec/plan: `.codearbiter/specs/mobile-hud-overflow.md`, `.codearbiter/plans/mobile-hud-overflow.md`. Awaiting the required approval gate.

## Auto-decisions

- **[high] Select issue #107 over #120 and #64.** SMARTS: Available/Reliable/Testable favor the current player-facing Pixel HUD defect with an existing Chromium reproduction; chosen mobile HUD overflow, strength strong. Confidence high.
- **[high] Reject issue #64 as the immediate slice despite its allocation cost.** SMARTS: Reliable/Testable reject the proposed alive-seat scan because pending kills, burial, deadlock release, and round resets require post-action semantics; chosen defer for deeper prediction design, strength strong. Confidence high.
- **[high] Responsive implicit collapse with explicit persisted override over spacing-only or a drawer.** SMARTS: Maintainable/Reliable/Testable favor one pure policy plus media-query lifecycle and Chromium geometry; chosen responsive default, strength strong. Confidence high.
- **[high] No new dependency.** SMARTS: Maintainable/Available/Securable favor existing matchMedia, localStorage, Vitest, and Playwright surfaces; chosen platform APIs only, strength strong. Confidence high.
- **[high] External worktree from current origin/main.** SMARTS: Reliable/Maintainable preserve the stale original checkout and its untracked AGENTS.md; chosen codex/mobile-hud-overflow at the established external worktree root, strength strong. Confidence high.

- **[high] Approved gate resumed without re-brainstorming.** The user explicitly approved the existing mobile HUD overflow spec and plan; status moved to APPROVED and autonomous Phase 2 began. Confidence high.
- **[high] Make the saved-preference and viewport-transition Playwright cases executable before dispatch.** SMARTS: Reliable/Testable/Maintainable reject leaving exact acceptance behavior implicit in prose; chosen concrete pre-navigation storage and 720px-to-412px viewport tests without changing scope, strength strong. Confidence high.

## T1 preference-policy receipt (2026-07-20)

- RED: the pure-policy test failed because the helper module did not exist; the HUD lifecycle test then failed the absent compact-touch default and media-change behavior.
- GREEN: focused Vitest passed 2 files and 11 tests; client typecheck passed.
- Independent task review: spec compliant and quality approved with no Critical, Important, or Minor findings.
- Controller fresh verification repeated the focused 11 tests and client typecheck successfully. T1 ACCEPTED; commit remains deferred to the codeArbiter landing gate.

## T2 compact-geometry receipt (2026-07-20)

- RED: Pixel Playwright ran 8 tests with 7 passing and the new expanded scroll-hint assertion failing because the hint did not yet exist.
- GREEN: Pixel production-build project passed 8/8; full desktop-fine, pixel-touch, and small-window matrix passed 16 with 8 intentional non-Pixel skips.
- Computed geometry: the first-visit Pixel test proves hud.scrollHeight <= hud.clientHeight + 1 while collapsed; saved expansion, expanded hint visibility, ARIA state, responsive transitions, and manual override all passed.
- Independent task review: spec compliant and quality approved with no Critical, Important, or Minor findings.
- Controller fresh verification repeated Pixel 8/8 and the full matrix 16 passed/8 skipped. T2 ACCEPTED; no dependency or out-of-scope subsystem changed.

## Superseding approval-state correction (2026-07-20)

- **[high] Supersedes the earlier mobile-hud-overflow header stating that approval was awaited.** The user approved the required spec/plan gate; the sprint is now at final-review correction/landing. This append preserves the prior append-only record and corrects the current state without rewriting history.

- **[high] Close the complete final-review finding set before landing.** SMARTS: Reliable/Testable/Maintainable favor direct fine-pointer state assertions, both negative hint states, append-only audit correction, and accurate task status; chosen one fix wave, strength strong. Confidence high.

## T3 pre-commit verification and review receipt (2026-07-20)

- Deterministic gate: npm run check exited 0 in 38.2 s after shared/client typecheck and the complete configured engine harness chain.
- Client gate: npm run test:client exited 0 with 21 files and 164 tests passed; emitted stderr is the suite's existing intentional error-path characterization output.
- Build gate: npm run build exited 0; Vite transformed 87 modules and built the production bundle in 487 ms.
- Browser gate after final-review fixes: npx playwright test e2e/hud-layout.spec.ts exited 0 with 18 passed and 9 intentional project skips across 27 tests. Desktop-fine and small-window now directly prove expanded first-visit state; Pixel proves fitted collapsed geometry plus the expand-collapse hint lifecycle.
- Scope gate: git diff --check exited 0; package-lock.json has no diff; origin/main remains df20dc3, the branch base; no engine, network, Supabase, physics, input mapping, package version, or lockfile changed.
- Review gate: both task reviews passed without findings. Whole-branch review's one Important browser-oracle gap and three Minor governance/negative-state findings were resolved in one wave. Re-review reports no Critical or Important findings and Ready to merge: Yes; its remaining Minor receipt request is satisfied by this tracked append.
- T3 Steps 1-3 complete. Commit, PR, and CI remain behind the controller-owned landing gates.

- **[high] Close both non-blocking PR coverage gaps before opening the PR.** SMARTS: Reliable/Testable strongly favor four small HUD-boundary tests over deferring explicit saved-state and storage-failure obligations; chosen test-only follow-up, strength strong. Confidence high.

## PR coverage hardening receipt (2026-07-20)

- Added mutation-sensitive HUD/media tests for saved collapsed preference, invalid stored values, throwing storage reads, and throwing storage writes; test cleanup restores prototype spies before clearing browser state.
- Controller focused verification passed 2 files and 15 tests; client typecheck and diff hygiene passed.
- Coverage re-review verified both prior Medium findings resolved and returned PASS with no Critical, High, Medium, or Low findings.
- Production code and dependency state remain unchanged from commit 14a1fb6; the follow-up is test plus this append-only governance receipt.

## 2026-07-20 — pages-stale-deploy-guard sprint

- **Sprint selection:** Compared issue #104 (retrograde Pages publication), #108 (portrait gate), #120 (NetworkClient wiring coverage), #153 (barrel drift guard), and a coordinated Vite/Vitest migration. SMARTS verdict: **issue #104, strong**. Reliable, Available, and Securable dominate because the defect has already overwritten a newer production bundle and can silently undo any player-facing fix. Choice: draft the stale-deploy guard sprint next. Confidence: **high**.
- **Prevention topology:** Compared a pre-publish HEAD guard plus sentinel, always rebuilding current `main`, and post-deploy detection/repair. SMARTS verdict: **HEAD guard plus sentinel, strong**. Exact provenance, fail-closed behavior, no new permission, and mutation-sensitive tests dominate. Choice: `build -> freshness -> publish`, with only `publish` holding Pages concurrency. Confidence: **high**.
- **Queue correction:** Whole-workflow concurrency was rejected after review because GitHub retains only one pending group member; a stale rerun could displace a legitimate pending current run before its guard executes. Choice: stale runs fail in `freshness` before entering the `pages` queue; publish verifies the live sentinel before releasing its job-level lock. SMARTS: **strong** across Reliable, Available, and Testable. Confidence: **high**.
- **Historical-run boundary:** GitHub reruns use the workflow version at the original SHA, so a new guard cannot govern already-created pre-fix runs. Choice: document the 30-day residual window, reference rather than auto-close #104, and do not delete historical runs without a separate destructive-action approval. SMARTS: **strong** for honest Reliability and Securable audit posture. Confidence: **high**.
- **[high] Supersede the single pre-queue Pages guard with two fail-closed checkpoints.** SMARTS: Reliable/Available/Testable favor rejecting known-stale runs before concurrency and rechecking `main` after the publish lock is acquired; chosen pre-queue plus in-lock equality checks, strength strong. This closes the time-of-check/time-of-use gap without a new permission, dependency, or publisher. Confidence high.
- **[high] Reconcile the guard plan to the dependency-maintenance baseline.** SMARTS: Maintainable/Testable/Securable favor preserving the independently deployed `actions/configure-pages` v6 and `actions/deploy-pages` v5 pins while testing them structurally; chosen current exact SHAs with no package or lockfile change, strength strong. Confidence high.- **[high] Share sentinel serialization and verification instead of inline JSON parsing.** SMARTS: Reliable/Testable/Securable favor one dependency-free policy for exact keys, SHA, run ID, and generic diagnostics; chosen `check`/`write`/`verify` CLI modes plus bounded semantic retries, strength strong. This also keeps Task 1 green by delaying root-harness wiring until the workflow contract passes. Confidence high.

- **[high] Canonical sentinel-policy decision (supersedes the joined receipt immediately above).** SMARTS: Reliable/Testable/Securable favor one dependency-free policy for exact keys, SHA, run ID, and generic diagnostics; chosen `check`/`write`/`verify` CLI modes plus bounded semantic retries, strength strong. Root-harness wiring waits until the workflow contract is green so Task 1 leaves the configured suite passing. Confidence high.

- **[high] Approval gate cleared.** The user explicitly approved the issue #104 stale Pages deployment guard spec and implementation plan through the requested approval phrase. Phase 2 autonomous execution begins on the existing `codex/pages-stale-deploy-guard` worktree. Confidence high.
- **[high] Controller-owned landing supersedes the generic per-task commit template.** The approved plan and codeArbiter commit hard rule require workers to leave task changes uncommitted; chosen uncommitted diff packages plus one controller commit gate at landing. This is a rule application, not an implementation variance. Confidence high.

- **[NEEDS-TRIAGE] Dependency audit baseline.** Fresh `npm install` on current `main` reported 8 existing advisories (3 moderate, 3 high, 2 critical) and two install scripts awaiting allow-scripts approval. No audit fix or script approval was attempted because dependency changes are outside the approved issue #104 slice; harvest this after the sprint for source-level triage. Baseline `npm run check` remained green in 41.8s.

## T1 provenance-policy receipt (2026-07-20)

- RED: `npx tsx scripts/checks/pages_freshness.mjs` exited 1 because the imported `scripts/ci/pagesFreshness.mjs` did not exist; the missing production seam was the expected failure.
- GREEN: `npx tsx scripts/checks/pages_freshness.mjs --policy-only` exited 0; the unchanged `npm run check` also exited 0. The full harness remains deliberately red only on the T2 workflow graph.
- Review: fresh task review returned spec compliant and quality approved with no Critical, Important, or Minor findings. Controller fresh policy-only verification and task-scoped diff hygiene both exited 0.
- T1 ACCEPTED. No package, lockfile, workflow, staging, or commit change occurred.

- **[high] Normalize the reviewed workflow to deterministic LF for the CRLF-portability repair.** SMARTS: Maintainable/Testable/Reliable favor restoring the validated mutation-free intended content with canonical LF over preserving incidental mixed Windows line endings; chosen verified backup normalization, strength strong. Final workflow SHA-256 is `d2451b54eb59e711ebc22b8cd9b74aa9b16faccbab9de3933c9f9bba48c1c15c`, with zero CRLF and lone-CR sequences. Confidence high.

## T2 Pages workflow receipt (2026-07-20)

- RED/GREEN: the full freshness harness first failed on the absent workflow topology, then passed after metadata creation, the pre-queue freshness job, publish-only concurrency, the immediate in-lock recheck, exact deployed-sentinel validation, and downstream live smoke were wired.
- Mutation proof: fail-open comparator and inserted pre-deploy-step mutations each made the focused harness fail; both were restored. Negative CLI subprocess, non-disclosure, exact guard/deploy adjacency, CRLF normalization, and provenance-curl timeout assertions remain in the accepted harness.
- Reliability correction: SMARTS Reliable/Testable required `--connect-timeout 5 --max-time 15` so the nine-attempt provenance loop bounds each network operation as well as its attempt count. Its missing-timeout mutation failed before the minimal workflow fix passed.
- Full task matrix: `npm run check`, `npm run test:client` (21 files, 168 tests), `npm run check:edge` (158 pass), `npm run build` (87 modules), `npm run test:e2e` (18 pass, 9 intended skips), and scoped diff hygiene all exited 0.
- Review: the independent reviewer found and then cleared two Important harness defects (missing negative/mutation-sensitive coverage and LF-only adjacency matching). Final re-review after the bounded-curl correction reports spec compliance approved and task quality approved, with no Critical, Important, or Minor findings.
- Controller acceptance: fresh focused harness and `npm run check` exited 0 in 41.8 s. Final workflow SHA-256 is `f4e4930b1afac7cfa1f1a3e09dab24e8c85c200be51d21feb33906c4bbc28e02`, with zero CRLF and lone-CR sequences. Hosted concurrency and Pages-cache convergence remain reserved for the first post-merge main run.
- T2 ACCEPTED. No dependency, permission, secret, target, package-lock, staging, or commit change occurred.

## T2 verification-audit correction (2026-07-20)

- **[high] Canonical receipt supersedes the T2 workflow receipt above.** A final coverage audit found that the accepted harness did not yet prove every fail-closed invariant: the fallback comparator, `if: always()` bypass, duplicate deploy action, exact trigger set, complete pinned-action inventory, exact root wiring, aggregate curl retry bound, and negative `write` CLI inputs. The implementation, spec, plan, and harness now encode those requirements without changing the approved deployment topology.
- RED mutation evidence: the focused harness exited 1 for each independently introduced regression: `|| current_sha="$GITHUB_SHA"`; `if: always()` on the deployment step; a second `actions/deploy-pages` use; removal of `workflow_dispatch`; replacement of a pinned action with `actions/cache@v6`; removal of `pages_freshness` from the root `check` script; and removal of `--retry-max-time 50`. Every mutation was restored before GREEN verification.
- Negative CLI evidence: subprocess cases reject a missing `write` argument set, an invalid SHA, run ID `0`, and a metadata path whose parent is missing. The verifier still bounds the response body at 4096 bytes before accumulation and emits generic diagnostics.
- Final policy: both freshness jobs use the exact fail-closed GitHub API request and exact SHA comparator; exactly one pinned `actions/deploy-pages` step immediately follows the in-lock comparator and has no conditional; triggers and the full pinned `uses` inventory are exact; root wiring occurs exactly once. Live provenance curl uses `--connect-timeout 5 --max-time 15 --max-filesize 4096 --retry 2 --retry-delay 1 --retry-max-time 50 --retry-all-errors`.
- GREEN: `npx tsx scripts/checks/pages_freshness.mjs` exited 0 in 1.4 s. The complete `npm run check` gate exited 0 in 40.1 s and included the freshness harness.
- Final workflow SHA-256 is `7dca8ca8d9aa8947f8707946cb95bee650fa81d29f209a6538fda1197dfbb30f` (git blob `58f43c92d508af47a6244bd90e082239bd951331`). Hosted concurrency and Pages-cache convergence remain reserved for the first post-merge main run.
- T2 ACCEPTED after verification-audit correction. No dependency, permission, secret, target, package-lock, staging, or commit change occurred.


## T2 deploy-step key-order correction (2026-07-20)

- **[high] This append supersedes the broad `if: always()` coverage claim in the immediately preceding verification-audit receipt.** Exact characterization inserted `if: always()` after the pinned `actions/deploy-pages` `uses` line; the focused harness incorrectly exited 0 in 1.2 s, proving that its adjacency prefix did not inspect the remainder of the deployment step.
- Harness correction: the test now locates the unique pinned deploy action, finds the preceding and following YAML step boundaries, slices the entire deploy step, and explicitly rejects an `if:` key anywhere in that slice regardless of key ordering.
- RED/GREEN: replaying the exact after-`uses` mutation exited 1 at the new whole-step assertion. After restoring the workflow, `npx tsx scripts/checks/pages_freshness.mjs` exited 0 in 1.4 s and `npm run check` exited 0 in 40.3 s.
- Production workflow content did not change. Its SHA-256 remains `7dca8ca8d9aa8947f8707946cb95bee650fa81d29f209a6538fda1197dfbb30f` (git blob `58f43c92d508af47a6244bd90e082239bd951331`). No files were staged or committed.

- **[high] Harvest promoted dependency-audit residue.** SMARTS: Securable/Maintainable/Testable favor source-level triage before any audit fix or install-script approval; queued one work item in `open-tasks.md` from `sprint:pages-stale-deploy-guard`. No dependency or script authorization was granted. Confidence high.

## 2026-07-21 — portrait-phone-gate sprint

- **[high] Select issue #108 as the next sprint.** Compared the player-facing portrait false-positive with issue #64's allocation optimization, issue #120's stateful coverage seam, and issue #153's geometry drift guard. SMARTS: Available/Reliable/Testable favor the live input-blocking bug because it denies otherwise-playable devices and has a small real-browser oracle; chosen #108, strength strong. Confidence high.
- **[high] Gate on layout capacity, not inferred device identity.** Compared `(orientation: portrait) and (max-width: 480px)`, retaining coarse pointer plus width, aspect ratio alone, and JavaScript device heuristics. SMARTS: Maintainable/Reliable/Testable favor one CSS width-and-orientation rule; chosen inclusive 480px boundary with pointer type irrelevant, strength strong. Confidence high.
- **[high] Use isolated browser contexts instead of expanding the global Playwright project matrix.** Dedicated contexts cover touch and fine pointer at exact viewports without making every existing HUD test run against blocked portrait layouts; chosen focused `portrait-gate.spec.ts`, strength strong across Scalable/Testable/Maintainable. Confidence high.
- **[high] Approval gate cleared.** The user explicitly approved the issue #108 design and plan on 2026-07-21. Phase 2 autonomous execution begins on `codex/portrait-phone-gate`. Confidence high.
- **[high] Do not duplicate dependency-audit residue across parallel PRs.** Fresh setup reproduced the same 8 advisories and two blocked install scripts already harvested into the green, open PR #158. No audit fix, script approval, dependency edit, or duplicate board task was made here. SMARTS: Maintainable/Securable favor one canonical follow-up, strength strong. Confidence high.
## T1 browser contract receipt (2026-07-21)

- TDD RED: `npx playwright test e2e/portrait-gate.spec.ts --project=desktop-fine` exited 1 against the pre-change coarse-pointer rule with 3 failed and 1 passed. The failures were the intended fine-pointer phone, coarse-pointer 700px portrait, and 481px boundary contradictions.
- TDD GREEN: the same focused command exited 0 after the exact CSS-only correction with 4 passed. Controller reproduction also exited 0 with 4 passed in 5.6 s.
- Task verification: `npm run typecheck` exited 0; `npm run test:e2e` exited 0 with 30 passed and 9 intentional skips; scoped `git diff --check` exited 0.
- Scope receipt: only `client/src/style.css`, the comment in `client/index.html`, and `e2e/portrait-gate.spec.ts` changed for implementation. No application TypeScript, shared engine, Supabase, workflow, dependency, or lockfile changed.
- Independent task review returned spec approved and task quality approved with no Critical, Important, or Minor findings. T1 is ACCEPTED.
## T2 pre-commit verification receipt (2026-07-21)

- Whole-branch review: no Critical, Important, or Minor findings; Ready to commit: Yes.
- Coverage audit: PASS. The 393px fine-pointer case detects restored pointer gating, the 480px assertion detects a 479px threshold, and the 481px assertion detects a 481px threshold.
- `npm run check` exited 0 in 40.2 s after strict shared/client typecheck and the complete deterministic harness chain.
- `npm run test:client` exited 0 with 21 files and 168 tests passed; emitted stderr is the suite's existing intentional error-path characterization output.
- `npm run check:edge` exited 0 with 158 passed and 0 failed.
- `npm run build` exited 0; Vite transformed 87 modules and built the production bundle in 475 ms.
- `npm run test:e2e` exited 0 with 30 passed and 9 intentional skips across 39 project-test combinations.
- `git diff --check` exited 0; `package-lock.json` has no diff; the intended changed set is six paths and contains no dependency, lockfile, workflow, engine, network, or Supabase change.

## 2026-07-22 — Lobby session lifecycle oracle sprint

- **[high] Select issue #128's lifecycle oracle as the next independent slice.** Compared duplicating issue #134 retry/audio-edge Vitest coverage, issue #59 Supabase boundary typing, issue #109 CSS cleanup, issue #64's invalid clone-removal premise, and the missing pre-refactor Lobby oracle. SMARTS Reliable/Maintainable/Testable favor pinning Realtime subscription, heartbeat ownership, broadcast state, and terminal cleanup before the planned `LobbySession` extraction. Chosen one test-only lifecycle sprint, strength strong. Confidence high.
- **[high] Use a focused callback-capturing jsdom test file.** Compared extending the 800-line transport-action test, extracting production first, and live Supabase E2E. SMARTS Maintainable/Testable/Available favor a distinct fake channel per subscription, captured real callbacks, and fake timers without credentials or production seams. Chosen `Lobby.sessionLifecycle.test.ts`, strength strong. Confidence high.
- Approval gate pending: `.codearbiter/specs/lobby-session-lifecycle-oracle.md` and `.codearbiter/plans/lobby-session-lifecycle-oracle.md` are proposed; no implementation begins before explicit approval.- **[high] Approval gate cleared.** The user explicitly approved the issue #128 Lobby session lifecycle oracle spec and plan on 2026-07-22. Phase 2 autonomous execution begins on `codex/lobby-session-lifecycle-oracle`. Confidence high.

- **[high] Canonical approval receipt (supersedes the joined pending/approved line immediately above).** The user explicitly approved the issue #128 Lobby session lifecycle oracle spec and plan on 2026-07-22. Phase 2 autonomous execution begins on `codex/lobby-session-lifecycle-oracle`. Confidence high.

## Lobby session lifecycle oracle implementation receipt (2026-07-22)

- **[high] T1 ACCEPTED: callback-driven lifecycle oracle landed without production changes.** Four focused Vitest cases capture distinct Realtime channels and real UPDATE/DELETE callbacks; assert exact room-specific filters, two handlers and one subscribe per channel; prove resubscription cleanup and the exact 10,000 ms heartbeat cadence; adopt waiting state without lastSeen-only render flicker; emit the full active-session config; and cover player-removal and room-deletion terminal teardown. Confidence high.
- **[high] Nine independent mutation REDs prove the oracle is causal.** The focused suite failed when pre-subscribe cleanup, heartbeat start, waiting-player assignment, lastSeen de-flickering, active cleanup, or DELETE handling was removed; when the heartbeat cadence changed to 9,999 ms; when replacement filters retained room-1; and when a third handler was registered. Every mutation was restored before GREEN. Focused result: 1 file, 4 tests passed. Confidence high.
- **[high] Review fleet cleared after two concrete test-strength fixes.** Task review required exact heartbeat cadence and then approved with zero Critical/Important/Minor findings. Whole-diff review and coverage audit required room-2 filter/cardinality assertions and rendered terminal-message proof; after correction both returned ready-to-commit with zero Critical/Important/Minor and zero Critical/High/Medium coverage findings. Confidence high.
- **[high] Fresh full matrix GREEN.** `npm run check` exited 0; `npm run test:client` and `npm run coverage:client` passed 22 files / 172 tests; coverage was 76.73% statements and lines, 79.69% branches, and 76.36% functions; `npm run check:edge` passed 158 tests; `npm run build` transformed 87 modules; `npm run test:e2e` passed 18 with 9 project-conditional skips; `git diff --check` passed. Confidence high.
- **[high] Protected runtime and dependency surfaces are exact.** `Lobby.ts` blob c6705fa330b3cf3925c18e408da8264f89666b60, `LobbyTransport.ts` a4d4872731c664000b4a1432aab7d463a2a68f8b, root package manifest b05c4080098c755978fa0c5b10807cb7b577197a, client manifest 80bb9f4df37a1ac9071752dfaccf74c33d31b03f, shared manifest 810b077850a866e22e3fc34747a4eba41a5acf6a, and lockfile 55d3e9b15f1eda17d60ad1cb8bbca39a378b0f0b all match `origin/main`. No dependency, production, permission, secret, or deployment change occurred. Confidence high.
- Harvest: no low-confidence decision or review residue requires promotion.

## PR #159 mainline conflict-resolution receipt (2026-07-22)

- **[high] Preserve both append-only sprint histories in chronological order.** Merging main at `c2fc47e` produced one EOF conflict in `.codearbiter/sprint-log.md`; the resolved file retains the complete portrait-phone-gate record, then appends the complete merged Lobby lifecycle record verbatim. No source, test, spec, plan, dependency, lockfile, workflow, migration, or deployment hunk required manual resolution. SMARTS Maintainable/Reliable/Auditable favor append union over choosing either side. Confidence high.
- Fresh integration verification: `npm run check` exited 0; `npm run coverage:client` passed with 76.57% statements/lines, 79.32% branches, and 76.36% functions; `npm run check:edge` passed 158 tests; `npm run build` transformed 87 modules; the focused portrait Playwright file passed 4/4; and `npm run test:e2e` passed 30 with 9 project-conditional skips. A deliberately concurrent Playwright invocation first collided on shared port 4173; the port was verified free and both browser gates passed serially without code changes.
- Harvest: no low-confidence decision or review residue requires promotion.


## 2026-07-21 — barrel-geometry-source sprint

- **[high] Select issue #153 as the next sprint.** Compared the renderer/physics drift guard with issue #120's narrowed retry-coverage path, issue #109's CSS cleanup, and issue #64's invalid clone-removal premise. SMARTS: Reliable/Maintainable/Testable favor eliminating a previously shipped cross-layer drift class with a small legal client-to-shared refactor; chosen #153, strength strong. Confidence high.
- **[high] Remove geometry copies and guard ownership structurally.** Compared shared imports plus a TypeScript-AST guard, literal equality checks, and Canvas draw-call mocks. SMARTS: shared imports remove synchronization work, while the existing independent 20/22 numerical oracle plus AST ownership checks cover both behavior and future source drift; chosen shared imports plus AST guard, strength strong. Confidence high.

- **[high] Approval gate cleared.** The user explicitly approved the issue #153 shared barrel geometry spec and plan on 2026-07-21. Phase 2 autonomous execution begins on `codex/barrel-geometry-source`. Confidence high.


## T1 shared barrel geometry receipt (2026-07-21)

- Baseline: the unmodified `npx tsx scripts/checks/muzzle.mjs` exited 0 with 385 passed and 0 failed, pinning the existing 20px pivot and 22px barrel behavior.
- TDD RED: after adding compiler-API ownership assertions before renderer edits, the same harness exited 1 with 385 numerical passes and 11 intended structural failures for missing shared imports/calls and existing mirror constants.
- GREEN: both renderer consumers now use shared `BARREL_LENGTH`, `BARREL_PIVOT_HEIGHT`, and `barrelTip`; the focused harness exits 0 with 396 passed and 0 failed.
- Review caught one Important bypass: name-based mirror detection and unused shared calls could satisfy the first guard. The fix binds shared-tip data to the actual `lineTo`, `spawnMuzzle`, and aim-guide sinks and rejects top-level numeric 20/22 mirrors regardless of identifier name.
- Mutation proof: a renamed `MUZZLE_LENGTH = 22` mirror failed 395/1; inert shared calls plus restored manual arithmetic at all three consumers failed 393/3. Every mutation was restored before final GREEN.
- Controller fresh proof: focused muzzle 396/0, strict typecheck, collision 54/0, AI determinism 36/36 plus null scenarios, sudden-death, and scoped diff hygiene all exited 0.
- Re-review returned spec approved and task quality approved with no Critical, Important, or Minor findings. T1 is ACCEPTED. No dependency, lockfile, workflow, Supabase, or visible-art change occurred.

## T1 review-driven guard redesign correction (2026-07-21)

- **[high] This append supersedes the sink-bound and 396-assertion claims in the T1 receipt immediately above.** Repeated whole-branch review proved that extending the structural guard into Canvas path, effect-sink, alias, and receiver dataflow created an open-ended partial interpreter: it grew to 1,042 lines and still admitted ordinary TypeScript value-flow variants. SMARTS: Maintainable/Testable/Reliable favor the approved narrow source-ownership contract over continuing the syntax arms race; chosen TypeChecker-resolved imports, direct shared calls in the three production methods, pivot ownership, used/legacy top-level mirror rejection, and the unchanged numerical oracle. Strength strong; confidence high.
- The compact redesign removes Canvas lifecycle, sink tracing, custom alias/dataflow, and receiver normalization. `scripts/checks/muzzle.mjs` is 369 lines and its branch diff is `+200/-1`, a 673-added-line reduction from the discarded peak while preserving 14 ownership assertions.
- AC-4 mutation proof: missing required imports failed 390/9; replacing the three direct shared calls with the original manual arithmetic failed 396/3; replacing the pivot with `y - 20` failed 398/1; each legacy mirror failed; a referenced renamed `MUZZLE_LENGTH = 22` failed 398/1; unused unrelated 20/22 and formatting-only changes remained green; changing shared 20/22 geometry failed 390/9 in the independent oracle.
- The final focused harness exits 0 with 399 passed and 0 failed. Deliberate inert shared calls beside live manual rendering are explicitly outside the automated ownership contract and remain a code-review concern, consistent with the approved rejection of a full Canvas mock.
- Final whole-branch review reports no Critical or Minor findings, coverage PASS, and approves the implementation and guard as proportionate and maintainable. Its sole Important governance finding is resolved by this append-only correction. No dependency, lockfile, workflow, Supabase, physics, or visible-art change occurred.
## T2 final verification receipt (2026-07-21)

- `npm run check` exited 0 in 42.2 seconds after shared/client typecheck and the complete configured deterministic harness chain; the redesigned muzzle ownership guard passed 399/0.
- `npm run test:client` exited 0 with 21 files and 168 tests passed. Emitted stderr/stdout is existing intentional error-path characterization output.
- `npm run check:edge` exited 0 with 158 tests passed and 0 failed.
- `npm run build` exited 0 after typecheck; Vite transformed 87 modules and completed the production bundle in 498 ms.
- `npm run test:e2e` exited 0 with 18 passed and 9 intentional project skips across 27 tests.
- `git diff --check` exited 0; `package-lock.json` is unchanged; no dependency, workflow, Supabase, migration, or generated bundle is in the diff.
- Branch HEAD and `origin/main` both resolve to `cb39cfc`. The pre-rebase recovery stash remains preserved as `stash@{0}` and was not dropped or modified.
- Whole-branch review and coverage audit are clear after the append-only redesign correction: no Critical, Important, or Minor implementation findings remain, and coverage is PASS. Commit, PR, and hosted CI remain behind their governed gates.

## PR #160 mainline conflict-resolution receipt (2026-07-22)

- **[high] Preserve both append-only sprint histories in chronological order.** Merging current main at `6552339` produced one EOF conflict in `.codearbiter/sprint-log.md`; the resolved file retains the complete current-main history verbatim, then appends the complete barrel-geometry sprint record. No source, test, spec, plan, dependency, lockfile, workflow, migration, or deployment hunk required manual resolution. SMARTS Maintainable/Reliable/Auditable favor append union over choosing either side. Confidence high.
- Fresh integration verification: `npm run check` exited 0 with the focused muzzle guard at 399/0; `npm run coverage:client` passed with 76.57% statements/lines, 79.32% branches, and 76.36% functions; `npm run check:edge` passed 158 tests; `npm run build` transformed 87 modules; and `npm run test:e2e` passed 30 with 9 project-conditional skips.
- Harvest: no low-confidence decision or review residue requires promotion.
## 2026-07-21 — human-seq-conflict-retry coverage sprint

- **Sprint selection:** Compared issue #120 (human seq-conflict retry coverage), issue #134 (broad nonblocking coverage), issue #125 (low-value metadata migration), and issue #109 (cosmetic CSS). SMARTS verdict: **issue #120, strong**. Reliable and Testable dominate because a bounded liveness path already exists in production but lacks direct human-path proof. Confidence: **high**.
- **Stale-premise correction:** Issue #120's broad constructor-wiring premise is already covered by lockstep, initialize-gap, rematch, session-clear, and bot-retry suites. The remaining scoped gap is the human `sendAction()` seq-conflict schedule, cap, failure unlock, and teardown cleanup.
- **[high] Public-API fake-timer design approved.** SMARTS favors instantiating the real `NetworkClient`, fixing jitter at zero, and observing POST timing/body, failure notification, `isFiring`, and timer cleanup over extracting a production scheduler or broadening into transport refactoring. Strength strong; confidence high.
- **[high] Approval gate cleared.** The user explicitly approved the issue #120 spec and plan on 2026-07-21. Phase 2 autonomous execution begins on `codex/human-seq-conflict-retry` at base `cb39cfc5a00e94ecf1f5d4ebab61f6dbed09d279`.
- **[high] Teardown proof tightened during plan self-review.** The `_disposed` backstop can suppress a stale timer's POST even if `clearTimeout()` is removed, so the approved case now also requires zero pending timers immediately after `stop()`. This makes removal of retry-timer cancellation independently mutation-sensitive while retaining the post-teardown POST assertion. No production design changed.
## T1 human seq-conflict retry coverage receipt (2026-07-21)

- GREEN: `npm -w @singedterra/client exec vitest run src/client/NetworkClient.humanRetry.test.ts` passed 1 file and 3 tests. The real public human `sendAction({ type: 'fire' })` path proves the exact 40/80/160/240/240ms boundaries, identical retry body, six-POST cap, one exhaustion notification, firing-lock liveness, no seventh POST, and immediate teardown timer cleanup.
- RED mutation A: setting `MAX_SEQ_RETRIES` from 5 to 0 failed all 3 focused cases, including the intermediate liveness assertion because failure/unlock occurred after the initial conflict. The constant was restored and focused GREEN repeated.
- RED mutation B: removing only `clearTimeout(this.seqRetryTimer)` from `stop()` failed the teardown case with one timer still allocated immediately after stop. The line was restored and focused GREEN repeated.
- Review correction: the first independent review found one Important gap because final-only failure/unlock assertions could miss premature recovery. The worker added no-failure and `isFiring === true` assertions after the initial conflict, before every deadline, and after each of the first four retry POSTs. Fresh re-review returned no Critical, Important, or Minor findings and approved final verification.
- Task matrix: `npm run typecheck` passed; `npm run test:client` passed 22 files and 171 tests; focused controller rerun passed 3/3; diff hygiene passed. `client/src/client/NetworkClient.ts`, `package-lock.json`, dependencies, workflows, Supabase, and deployment state remain unchanged.
- T1 ACCEPTED. The only implementation artifact is the new focused test; governance changes are the approved spec, plan, and append-only sprint receipts.
## T2 final review and local verification receipt (2026-07-22)

- Whole-diff review returned PASS with no Critical, Important, or Minor findings; fresh focused verification passed 3/3 and governance receipts matched the live narrowed issue scope.
- Independent coverage audit returned PASS with no CRITICAL, HIGH, MEDIUM, or LOW findings. It confirmed mutation sensitivity for exact delay boundaries, identical payload, five-retry/six-POST cap, failure timing/count, firing-lock lifecycle, no seventh POST, prompt timer cancellation despite the `_disposed` backstop, and no post-stop POST.
- Full matrix: `npm run check` exited 0 in 42s; `npm run test:client` passed 22 files and 171 tests; `npm run check:edge` passed 158 tests; `npm run build` typechecked and transformed 87 modules; `npm run test:e2e` passed 18 with 9 intentional project skips.
- Final scope and hygiene: `git diff --check` passed; `package-lock.json`, production code, dependencies, workflows, Supabase, and deployment state are unchanged. Intended tracked scope is the approved spec, approved plan, append-only sprint log, and one new client test.
- Branch/base: `codex/human-seq-conflict-retry` from `cb39cfc5a00e94ecf1f5d4ebab61f6dbed09d279`. PR #159 and PR #160 remain independent and unmerged.

## PR #161 mainline conflict-resolution receipt (2026-07-22)

- **[high] Preserve both append-only sprint histories in chronological order.** Merging current main at `cdef7c1` produced one EOF conflict in `.codearbiter/sprint-log.md`; the resolved file retains the complete current-main history verbatim, then appends the complete human seq-conflict retry record. The 23-line branch tail was verified as an exact append to merge-base `cb39cfc`. No production, test, spec, plan, dependency, lockfile, workflow, migration, or deployment hunk required manual resolution. SMARTS Maintainable/Reliable/Auditable favor append union over choosing either side. Confidence high.
- Fresh integration verification: the focused human-retry suite passed 3/3; `npm run check` exited 0; `npm run coverage:client` passed with 77.32% statements/lines, 80.16% branches, and 77.27% functions; `npm run check:edge` passed 158 tests; `npm run build` transformed 87 modules; and `npm run test:e2e` passed 30 with 9 project-conditional skips.
- Harvest: no low-confidence decision or review residue requires promotion.
## 2026-07-22 — HotSeatClient lifecycle coverage sprint

- **Sprint selection:** Compared issue #134's HotSeatClient, InputHandler, retry, and audioEdges slices; issue #59's broad Supabase type boundary; issue #109's CSS cleanup; and issue #64's stale clone optimization. SMARTS verdict: **issue #134 HotSeatClient slice, strong**. Reliable, Maintainable, and Testable dominate because this 77-line wrapper owns the complete hot-seat execution loop yet has no direct coverage, while retry/audioEdges already have root harnesses and InputHandler is a larger follow-on cell. Confidence: **high**.
- **Stale-premise correction:** Issue #64's proposed allocation-free seat scan is invalid for lethal shots because next-seat selection depends on simulated deaths and terrain collision. No unsafe performance change will be attempted.
- **Baseline:** Fresh `npm run coverage:client` on `origin/main` passed 21 files and 168 tests with 66.58% overall statement coverage. `HotSeatClient.ts` is 0% across statements, branches, functions, and lines. `package-lock.json` remained unchanged.
- **Proposed design:** Use the existing engine injection plus a deterministic queued-rAF harness to cover lifecycle, normal/eight/early-settle tick budgets, frame cancellation, listener unsubscribe, action forwarding, and state/gravity accessors. Production changes are mutation-only and restored. SMARTS strength strong; confidence high.
- **Issue boundary:** This PR will reference #134 but will not close it; InputHandler, retry, and audioEdges remain independent backlog slices.- **[high] Approval gate cleared.** The user explicitly approved the issue #134 HotSeatClient lifecycle coverage spec and plan on 2026-07-22. Autonomous execution begins on `codex/hotseat-client-lifecycle-coverage` at base `cb39cfc5a00e94ecf1f5d4ebab61f6dbed09d279`.
- **[high] Canonical approval receipt (supersedes the joined issue-boundary/approval line immediately above).** The PR references #134 without closing it because InputHandler, retry, and audioEdges remain independent slices. The user explicitly approved the HotSeatClient lifecycle coverage spec and plan on 2026-07-22; autonomous execution began on `codex/hotseat-client-lifecycle-coverage` at base `cb39cfc5a00e94ecf1f5d4ebab61f6dbed09d279`.
## T1 HotSeatClient lifecycle coverage receipt (2026-07-22)

- GREEN: `npm -w @singedterra/client exec vitest run src/client/HotSeatClient.test.ts` passed 1 file and 3 tests. Public-contract coverage includes synchronous initial emission, duplicate-start idempotence, restart, latest-frame cancellation, listener unsubscribe, one/eight/early-settle tick budgets, per-frame emission/rescheduling, action identity, and state/gravity pass-through.
- RED mutations: removing the duplicate-start guard failed on double emission; disabling `setFastForward()` failed at 1 versus 8 ticks; removing the settlement break failed at 8 versus 3 ticks; removing `cancelAnimationFrame()` failed on zero versus one cancellation. Production was restored and focused GREEN repeated after every mutation.
- Task matrix: typecheck passed; client tests passed 22 files and 171 tests; V8 coverage passed 22 files and 171 tests with 67.85% overall statements and `HotSeatClient.ts` at 100% statements, branches, functions, and lines. Diff hygiene passed; `package-lock.json` is unchanged; the production file hash matches HEAD at `9471abc43cf41039ffc9ec69cb557728a4769096`.
- Independent task review returned PASS with no Critical or Important findings and no coverage gap in the approved slice. Its sole Minor audit-format finding is superseded by the canonical approval receipt above.
- T1 ACCEPTED. The only implementation artifact is `client/src/client/HotSeatClient.test.ts`; governance changes are the approved spec, plan, and append-only receipts.
## T2 final review and local verification receipt (2026-07-22)

- Whole-diff review returned PASS with no Critical, Important, or Minor findings; fresh focused verification passed 3/3 and the canonical append-only audit correction is accurate.
- Independent coverage audit returned PASS with no CRITICAL, HIGH, MEDIUM, or LOW findings. It confirmed assertion sensitivity for initial emission, duplicate start, restart, current-frame cancellation, idempotent stop, unsubscribe, one/eight/early-settle tick budgets, per-frame emission and successor scheduling, action identity, and state/gravity accessors.
- Full matrix: `npm run check` exited 0 in 42.5s; `npm run test:client` passed 22 files and 171 tests; `npm run coverage:client` passed 171 tests with 67.85% overall statements and 100% HotSeatClient statements/branches/functions/lines; `npm run check:edge` passed 158 tests; `npm run build` transformed 87 modules; `npm run test:e2e` passed 18 with 9 intentional project skips.
- Final scope and hygiene: `git diff --check` passed; `package-lock.json`, production code, dependencies, workflows, Supabase, and deployment state are unchanged. Intended tracked scope is the approved spec, approved plan, append-only sprint log, and one new client test.
- Branch/base: `codex/hotseat-client-lifecycle-coverage` from `cb39cfc5a00e94ecf1f5d4ebab61f6dbed09d279`. This slice references but does not close issue #134.

## PR #162 mainline conflict-resolution receipt (2026-07-22)

- **[high] Preserve both append-only sprint histories in chronological order.** Merging current main at `aabc183` produced one EOF conflict in `.codearbiter/sprint-log.md`; the resolved file retains the complete current-main history verbatim, then appends the complete hot-seat lifecycle coverage record. The 23-line branch tail was verified as an exact append to merge-base `cb39cfc`. No production, test, spec, plan, dependency, lockfile, workflow, migration, or deployment hunk required manual resolution. SMARTS Maintainable/Reliable/Auditable favor append union over choosing either side. Confidence high.
- Fresh integration verification: the focused HotSeatClient suite passed 3/3; `npm run check` exited 0; `npm run coverage:client` passed with 78.59% statements/lines, 80.80% branches, and 78.69% functions; `npm run check:edge` passed 158 tests; `npm run build` transformed 87 modules; and `npm run test:e2e` passed 30 with 9 project-conditional skips.
- Harvest: no low-confidence decision or review residue requires promotion.
## 2026-07-22 — InputHandler behavioral coverage sprint

- **[high] Select InputHandler as the next issue #134 slice.** Compared InputHandler, retry, audio edges, issue #59 Supabase typing, and issue #109 CSS cleanup. SMARTS Reliable/Testable/Maintainable favor the 307-line, 0%-covered player-input boundary; retry and audio edges already have root harnesses, HotSeatClient is covered by the preceding PR, and the alternatives are either lower-value or cross-cutting. Chosen one test-only InputHandler sprint, strength strong. Confidence high.
- **[high] Use public jsdom events plus mutation proof.** Compared public DOM characterization, production seam extraction, and private-state testing. SMARTS Testable/Maintainable/Reliable favor real public methods and cancelable synthetic events with only layout mocked; temporary one-invariant mutations prove the existing-behavior tests can fail without landing production changes. Chosen one new Vitest file and byte-identical production restoration, strength strong. Confidence high.
- **[high] Approval gate cleared.** The user explicitly approved the active InputHandler coverage spec and implementation plan on 2026-07-22. Phase 2 autonomous execution begins on `codex/input-handler-coverage`. Confidence high.- **[high] Replace the unkillable duplicate-guard mutant with attached-state lifecycle proof.** Real EventTarget semantics deduplicate an identical callback, so removing only `if (this.attached) return` leaves public emissions unchanged and cannot honestly RED. Compared spying on listener-registration internals, accepting an equivalent mutant, and proving the adjacent state assignment. SMARTS Testable/Maintainable/Reliable favor removing `this.attached = true`, which causes public detach leakage and is killed by the approved lifecycle assertion; the duplicate-guard equivalence is documented. Chosen public-contract proof without an implementation-detail spy, strength strong. Confidence high.

- **[high] Canonical attached-state mutation receipt (supersedes the joined receipt immediately above).** Real EventTarget semantics deduplicate an identical callback, so removing only the duplicate-attach guard is observationally equivalent. SMARTS Testable/Maintainable/Reliable favor the public detach-leak mutant from removing `this.attached = true` over a listener-registration spy; the focused suite killed that mutation and production was restored exactly. Chosen public-contract proof, strength strong. Confidence high.

## InputHandler final verification and review receipt (2026-07-22)

- Focused restored GREEN: `InputHandler.test.ts` passed 14/14. Six observable mutation proofs failed for their intended assertions: attached-state assignment, ArrowLeft direction, redundant bound emission, detach drag cleanup, logical x scaling, and active mousemove registration. Literal duplicate-guard removal remained correctly classified as EventTarget-equivalent.
- Review gates: task review first found a missing direct projectile `triggerFire()` assertion; whole-branch review found a vacuous active-mousemove path; coverage audit found default power steps were only counted. One fix wave closed every finding. Fresh task re-review, whole-branch re-review, and coverage re-audit report no blocking findings and ready for commit.
- Deterministic gate: `npm run check` exited 0 in 45 seconds, including strict shared/client typecheck and every configured root harness.
- Client gates: `npm run test:client` and `npm run coverage:client` each passed 22 files and 182 tests. Overall coverage is 70.92% statements/lines, 79.19% branches, and 76.72% functions; `InputHandler.ts` is 100% statements/functions/lines and 93.44% branches.
- Edge, build, and browser gates: 158 Edge tests passed; Vite transformed 87 modules and built in 511 ms; Playwright passed 18 with 9 intentional project skips.
- Scope gates: `git diff --check` passed. `InputHandler.ts`, root/client package manifests, and `package-lock.json` remain identical to `origin/main`; no production, dependency, workflow, Supabase, deployment, or engine file changed.
- Harvest found no new low-confidence or `[NEEDS-TRIAGE]` residue. T1 is ACCEPTED; governed commit, PR coverage review, and hosted CI remain.

## PR #163 mainline conflict-resolution receipt (2026-07-22)

- **[high] Preserve both append-only sprint histories in chronological order.** Merging current main at `0fd4f5e` produced one EOF conflict in `.codearbiter/sprint-log.md`; the resolved file retains the complete current-main history verbatim, then appends the complete InputHandler coverage record. The 18-line branch tail was verified as an exact append to merge-base `cb39cfc`. No production, test, spec, plan, dependency, lockfile, workflow, migration, or deployment hunk required manual resolution. SMARTS Maintainable/Reliable/Auditable favor append union over choosing either side. Confidence high.
- Fresh integration verification: the focused InputHandler suite passed 14/14; `npm run check` exited 0; `npm run coverage:client` passed with 82.94% statements/lines, 81.86% branches, and 80.80% functions; `npm run check:edge` passed 158 tests; `npm run build` transformed 87 modules; and `npm run test:e2e` passed 30 with 9 project-conditional skips.
- Harvest: no low-confidence decision or review residue requires promotion.
## 2026-07-22 — Supabase service boundary types sprint

- **[high] Select issue #59 as the next independent sprint.** Compared the blocked-on-merge LobbySession extraction (#128), remaining low-marginal client coverage (#134), the harmless gauge CSS cleanup (#109), and a comment-only migration (#125). SMARTS Maintainable/Reliable/Testable/Securable favor replacing the service-role Edge Function `any` boundary so schema drift becomes a compile failure. Chosen `supabase-service-boundary-types`, strength strong. Confidence high.
- **[high] Use a migration-derived checked-in Database contract.** A read-only `npx --no-install supabase gen types typescript --project-id jdvxfxjpobtyasozxauh` attempt returned `Project must be active and healthy.` Compared requiring remote project health, starting a local Docker stack, and a RoomRow-only patch, SMARTS Available/Maintainable/Reliable favor a generated-style contract derived from committed migrations 001 through 010, with structured JSONB application shapes. Confidence high.
- **[high] Keep the dependency and deployment surfaces closed.** The existing pinned `@supabase/supabase-js@2.107.0` provides `SupabaseClient<Database>`; no package or import-version change is needed. Worktree setup reused the lockfile without modification. The install reported pre-existing audit findings already covered by the dependency/governance backlog; this sprint grants no audit-fix, install-script, migration, remote-project, or deployment authorization. Confidence high.
- Approval gate pending: `.codearbiter/specs/supabase-service-boundary-types.md` and `.codearbiter/plans/supabase-service-boundary-types.md` are proposed; no implementation begins before explicit approval.

- **[high] Approval gate cleared.** The user explicitly approved the issue #59 Supabase service boundary types spec and plan on 2026-07-22. Phase 2 autonomous execution begins on `codex/supabase-service-boundary-types`; runtime behavior, authorization, migrations, dependencies, remote project state, deployment, and merge-to-main remain outside scope. Confidence high.
## Issue #59 T1 typed service boundary receipt (2026-07-22)

- TDD RED: the compiler sentinel failed with six expected diagnostics for missing `Database`, `ServiceClient = any`, an unused unknown-table expectation, and the old incomplete `RoomRow` (`seed`, `active_player_index`, `rematch_room_id`).
- GREEN: `ServiceClient` is `SupabaseClient<Database>`; the checked-in migration-derived contract covers five tables, three RPCs, structured JSONB shapes, and truthful list-room projections. The focused sentinel passed 1/1 and the Edge suite passed 159/159.
- Mutation proof: reverting the client to `any`, removing `active_player_index`, removing `rematch_room_id`, and widening to unparameterized `SupabaseClient` each failed compilation for the intended reason; exact source was restored after every mutation.
- Review caught one Important migration-contract error: `match_scores.room_id` was initially marked many-to-one despite its unique constraint. A new compile-time cardinality assertion failed first with TS2344; the relationship was corrected to one-to-one, then focused 1/1 and Edge 159/159 returned GREEN. Re-review approved spec compliance and task quality with no remaining Critical, Important, or Minor findings.
- Runtime requests, responses, SQL operations, authorization, RLS, Realtime, migrations, dependencies, protected manifests, workflows, remote state, and deployment remain unchanged. T1 is ACCEPTED.
- Harvest: no low-confidence decision or `[NEEDS-TRIAGE]` residue requires promotion.
- **[high] User resolved the issue #59 spec-versus-SDK conflict with option A.** The approved spec now reflects pinned Supabase SDK behavior: invalid table/payload/RPC inputs fail at the call site, while an invalid `.select()` projection yields `SelectQueryError` and must be proven unconsumable as typed row data. Compared adding a custom projection wrapper/lint layer, the user-selected correction preserves the behavior-neutral scope and tests the real compiler contract. Conflict-hierarchy level 2 (correctness/data integrity); resolution explicitly attributed to the user on 2026-07-22. Confidence high.

## Issue #59 T2 final review and local verification receipt (2026-07-22)

- **[high] Pin the real SDK contract and close every compiler-proof gap.** After the user selected option A at the correctness conflict gate, the sentinel was revised to prove that an invalid projection produces an unconsumable `SelectQueryError` result. Independent reviewers then drove exact table/RPC key unions, RPC arguments/returns, bidirectional Row/Insert/Update shapes, structured JSONB literals, relationship metadata/cardinality, and closed Views/Enums/CompositeTypes. All production mutations were restored byte-exact. SMARTS Reliable/Testable/Maintainable/Auditable favor this truthful, mutation-sensitive compiler contract over a new wrapper or lint layer. Confidence high.
- Final review gates: whole-diff review found no Critical, Important, or Minor findings; coverage audit found no Critical, High, Medium, or Low gaps and all mutation categories failed for their intended reason; security/architecture review found no in-scope Critical or High concern. Ready-to-commit verdicts are unanimous.
- Fresh full matrix: `npm run check` exited 0 in 52.8s; `npm run test:client` passed 25 files and 192 tests; `npm run coverage:client` passed with 83.09% statements/lines, 82.20% branches, and 80.80% functions; `npm run check:edge` passed 159/159; `npm run build` transformed 87 modules; `npm run test:e2e` passed 30 with 9 intentional project-conditional skips.
- Scope and hygiene: focused contract 1/1 passed; `git diff --check` passed; package manifests, lockfile, migrations, workflows, deployment configuration, and remote Supabase state are unchanged. Runtime requests, responses, SQL, authorization, RLS, and Realtime behavior remain unchanged.
- **[high] Harvest the broader security-controls provenance drift as a separate board task.** The existing task at line 155 covers only the historical env-name mismatch and does not deduplicate omissions introduced by ADR-0007/0008/0009 and migrations 005/010. SMARTS Securable/Maintainable/Auditable favor a queued documentation refresh over expanding issue #59. Added via `$ca-task` with origin `sprint:supabase-service-boundary-types` and auth/secrets/database boundaries. Confidence high.
- Low-confidence decisions: 0. Hard-gate conflicts: 1, resolved explicitly by the user with option A. T2 commit, PR, and hosted-CI gates remain.


## Issue #59 PR #165 green receipt (2026-07-22)

- Governed commit `381e89564f0e630c34ce3c580302041c08091d9e` was pushed and opened as PR #165 against `main`; the PR closes issue #59 and remains open and unmerged.
- Hosted checks passed: CodeQL, JavaScript/TypeScript analysis, Edge Function tests, rendering guardrails, and typecheck/harnesses/build. Supabase Preview skipped by its configured integration rule; no deploy ran.
- T2 ACCEPTED. The sprint ends at the merge-to-default hard gate with zero unresolved review or coverage findings, zero secret findings, zero low-confidence decisions, and the preserved issue #153 stash unchanged.
## 2026-07-22 - LobbySession seam sprint

- **[high] Select issue #128's actual LobbySession extraction as the next independent sprint.** PR #164 merged the required Realtime/heartbeat oracle into `main` and its focused suite passes 4/4. Compared issue #129's explicitly dependent view decomposition, issue #134's lower-marginal coverage, issue #109's harmless CSS cleanup, and security/migration items that trip hard gates, SMARTS Maintainable/Reliable/Testable/Securable favor removing the credential-bearing lifecycle from the 2487-line Lobby now. Chosen `lobby-session-seam`, strength strong. Confidence high.
- **[high] Use an observable session service, not a state bag or reducer rewrite.** A DOM-free `LobbySession` will own the complete waiting snapshot, lazy Supabase channel, heartbeat, browse timer, and waiting-state transport operations, emitting only changed/ready/gone events. Lobby keeps forms, rendering, visible error/busy policy, persistence, and `LobbyConfig` conversion. The merged private-surface oracle stays byte-identical through private delegates/accessors. SMARTS Maintainable/Reliable/Testable favor one lifecycle owner with low parity risk; strength strong. Confidence high.
- **[high] Hold ADR-0009 as a no-change hard boundary.** The service may relocate the existing in-memory seat token but must not change its localStorage key, request bodies, authorization, logging, Realtime exposure, or persistence. No Edge Function, migration, RLS, auth, dependency, workflow, remote-state, or deployment change is authorized. Confidence high.
- Baseline on `origin/main` `e0a5842`: `npm run check` passed in 68.3s; `Lobby.sessionLifecycle.test.ts` passed 4/4; dependency installation left `package-lock.json` hash `B0844B8BB5CDC8FDF8DDC7504B0C1CC4141514F34E4DE3486B922ACA14D40658` unchanged. Existing npm audit findings remain outside scope.
- Approval gate pending: `.codearbiter/specs/lobby-session-seam.md` and `.codearbiter/plans/lobby-session-seam.md` are proposed. No implementation begins before explicit approval of both.

- **[high] Approval gate cleared.** The user explicitly approved the issue #128 LobbySession seam spec and plan on 2026-07-22. Autonomous execution begins on `codex/lobby-session-seam`; security/auth, irreversible operations, merge-to-main, and deployment remain hard stops. Confidence high.
- **[high] Correct the approved adapter detail before implementation.** Pre-flight found that test-only Lobby setters would violate the mandatory testing anti-pattern rule. Compared modifying the merged oracle, duplicating state, and using the same session-backed accessors for real create/join writes plus waiting-view reads, SMARTS Maintainable/Reliable/Testable favor the production adapter. The spec/plan now preserve their approved behavior and scope without adding test-only methods. Strength strong; confidence high.
- User steering for future selection: prioritize player-visible, passion-project work that makes the game cool after this approved reliability seam. codeArbiter overrides remain immediate-action only, so no standing gate bypass was recorded.
- **[high] Accept T1 after fresh review and one correction wave.** The DOM-free `LobbySession` focused suite passes 8/8 and client typecheck plus `git diff --check` pass. Mutation proof killed seven lifecycle defects. Fresh review caught two integration blockers: `startHeartbeat` visibility and missing terminal `ready` emission from successful `readyUp`; both were fixed, tested, and re-reviewed with no remaining Critical/Important findings. T1 is ACCEPTED; T2 begins. Confidence high.
- **[high] Apply passion-project autonomy to future routine approval gates one concrete sprint at a time.** The user explicitly authorized creative selection and routine spec/plan-gate bypass so the loop can keep making the game cool. This does not authorize security/auth/crypto changes, irreversible operations, merge-to-main, deployment, or spending money. Any future codeArbiter bypass will still be scoped and logged against the specific immediate gate rather than recorded as a standing override. Confidence high.
- **[high] Standing integration and deployment authority expanded by the user.** For singedTerra, clean reviewed PRs with green hosted CI may now be merged to `main`, and verified deployments may proceed without a fresh approval prompt. This is project-scoped authority, not permission to bypass security/auth/crypto review, destructive data operations, or spending. Issue #128 will therefore continue through green CI, merge, Pages verification, and a source-of-truth Supabase deployment audit. Confidence high.
- **[high] Canonical standing integration/deployment authority receipt (supersedes the joined receipt immediately above).** The user explicitly authorized clean, reviewed, hosted-green singedTerra PRs to merge to `main` and verified deployments to proceed without another prompt. Security/auth/crypto changes, destructive data operations, and spending remain separate gates. Issue #128 continues through merge, Pages verification, and a source-of-truth Supabase audit. Confidence high.
- **[high] Deploy verified stale Supabase functions from clean current main.** A detached origin/main@b463c87 deployment worktree passed all 159 Edge tests. Remote migration history was not modified because no migration source changed after the last backend deployment and the legacy numbered files are not represented in the CLI history table. Deployed only list_rooms, ready_up, and submit_action; all report ACTIVE, verify_jwt=false, and versions 24/26/33 respectively. A live unauthenticated list_rooms smoke returned HTTP success with the expected rooms property. GitHub Pages was already successfully deployed at the same main SHA, so no redundant Pages deployment ran. Confidence high.
- **[high] Canonical Supabase deployment receipt (supersedes the malformed receipt immediately above).** A detached `origin/main@b463c87` deployment worktree passed all 159 Edge tests. Remote migration history was not modified because no migration source changed after the last backend deployment and the legacy numbered files are not represented in the CLI history table. Deployed only `list_rooms`, `ready_up`, and `submit_action`; all report `ACTIVE`, `verify_jwt=false`, and versions 24/26/33 respectively. A live unauthenticated `list_rooms` smoke returned HTTP success with the expected `rooms` property. GitHub Pages was already successfully deployed at the same main SHA, so no redundant Pages deployment ran. Confidence high.
- **[high] Accept T2 after two review correction waves.** Initial parity/security review passed ADR-0009 but found source-specific busy ordering, duplicate terminal handoff, and deferred-loader resurrection; re-review then exposed stale callbacks from asynchronously removed channels. SMARTS Correctness/Reliable/Testable favor fixing these lifecycle races inside the new owner rather than preserving invalid concurrency behavior. TDD now distinguishes `direct`/`realtime` readiness, emits once per room, generation-cancels and memoizes lazy loads, and rejects callbacks unless both generation and room still match. Four protected tests remain byte-identical; focused/protected verification passes 77/77; client suite passes 209/209 at 83.45% statements; typecheck and diff hygiene pass. Final parity and ADR-0009 re-reviews report no findings. T2 is ACCEPTED; T3 begins. Confidence high.
- **[high] Reopen and re-accept T2 after whole-diff lifecycle review.** Final architecture and coverage review found that late rejected room-A actions, room replacement during a deferred loader, actions started after leave, and pending operations invalidated by room deletion could escape the original generation guards or leave Lobby busy. TDD now converts only invalidated success/rejection paths to typed stale outcomes while current-room failures still rethrow; loader installation requires generation plus room identity; leave/terminal/gone close the action and subscription lifecycle; and Lobby clears abandoned busy state. Controlled mutations were killed and restored. Focused review passes 102/102, full client passes 234/234 at 84.21% statements, `LobbySession` reaches 100% statements/lines/functions, protected tests remain byte-identical, and final architecture/security and coverage reviews report zero findings. T2 is ACCEPTED; T3 continues. Confidence high.
- **[high] Reconcile the seat-token storage-key record without changing behavior.** ADR-0009's prose named a room-id localStorage key, while the accepted implementation and user-approved issue #128 spec use the public `playerId` so rematches retain the credential. ADR-0010 and append-only DECISION-0013 now record the existing `playerId` key; request credentials, authorization, and exposure rules are unchanged. SMARTS Reliable/Securable/Auditable favor forward correction over editing the prior ADR. Confidence high.
- **[high] Repair uncommitted audit-tail encoding mechanically.** The LobbySession sprint tail contained one joined receipt plus three PowerShell escape control characters in a superseded deployment receipt. The two records were separated and the intended `r`/`v`/`r` letters restored; no receipt was removed, the canonical superseding entries remain, the committed prefix is unchanged, `git diff` shows an append-only tail, and the full file now contains zero control characters. Confidence high.
## LobbySession mainline integration receipt (2026-07-25)

- **[high] Preserve both append-only sprint histories in chronological order.** Merging current `origin/main@b463c87` produced one EOF conflict in `.codearbiter/sprint-log.md`. The resolved file retains all 846 current-main lines verbatim, then appends the complete 21-line LobbySession tail from commit `a60d5fb`; the pre-receipt union was verified exact. No production, test, spec, plan, dependency, lockfile, workflow, migration, or deployment hunk required manual resolution. SMARTS Maintainable/Reliable/Auditable favor the exact append union over choosing either branch. Confidence high.
- **[high] Fresh post-main integration matrix is green.** `npm run check` and `npm run test:client` passed, with 31 client files and 234 tests; `npm run coverage:client` passed at 84.21% statements/lines, 83.98% branches, and 84.61% functions, with `LobbySession` at 100% statements/lines/functions and 96.22% branches; `npm run check:edge` passed 159/159; `npm run build` transformed 88 modules; `npm run test:e2e` passed 30 with 9 project-conditional skips; and the exact 10-file LobbySession/protected-test focus passed 102/102. `git diff --check` passed, and the protected tests, manifests, lockfile, Supabase tree, and workflows are byte-identical to `origin/main`. Low-confidence decisions: 0. `[NEEDS-TRIAGE]` findings: 0. Confidence high.

## 2026-07-25 - Blast impact contract sprint

- **[high] Select issue #45's honest-blast slice as the next player-visible sprint.** Compared mobile touch controls (#10), Lobby view decomposition (#129), client coverage (#134), and vote-kick (#47), SMARTS Scalable/Maintainable/Available/Reliable/Testable/Securable favors removing the confirmed visual-versus-damage mismatch first: immediate combat feel, deterministic shared logic, no auth/backend/dependency/migration surface, and a narrow rollback. Chosen `blast-impact-contract`, strength strong. Confidence high.
- **[high] Share style-aware reach geometry between damage and rendering.** Compared shrinking the fireball to the current damage disc, adding per-weapon damage-radius fields, and using one shared `blast=1.8` / `cluster=1.4` reach contract, SMARTS Maintainable/Reliable/Testable favors the shared contract. It makes the visible edge the zero-damage edge, preserves direct-hit peaks and crater size, and avoids a new tuning field on every weapon. Strength strong. Confidence high.
- **[high] Scope issue #45 as a reviewable first slice, not the whole field-scale rebalance.** This sprint reconciles blast reach and raises the glancing-hit floor; it does not change canvas dimensions, power scale, gravity, wind, tank spacing, shop prices, ammo, or non-blast DOT. SMARTS Reliable/Testable favor landing an independently playable lethality improvement before the broader trajectory-scale playtest. Strength strong. Confidence high.
- Baseline on deployed `main@e83ea8d`: `npm run check` passed in 46.1 seconds. The repository currently uses a 1200 x 600 logical field; older 800 x 500 prose is not used as implementation evidence.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: the user's standing passion-project authority bypasses only this sprint's spec/plan approval pause. Security/auth/crypto, irreversible operations, spending, review, fresh verification, hosted CI, merge cleanliness, and deployment proof remain active.
- **[high] Correct the plan to make every task boundary commit-safe.** Preflight found that the original Task 1 ended after the mandatory RED, which would require either committing a failing root check or violating subagent-driven task bookkeeping. SMARTS Maintainable/Reliable/Testable favors one TDD task that records RED, implements the minimum GREEN, runs mutation proof, then commits. The playtest/review/landing task remains separate. Strength strong. Confidence high.

- **[high] Task 1 RED receipt — blast reach causal harness.** Command: npx tsx scripts/checks/blast_reach.mjs; exit: 1. Observed ERR_MODULE_NOT_FOUND: Cannot find module 'C:\Users\brenn\projects\singedTerra-worktrees\lobby-session-seam\shared\src\engine\BlastGeometry.ts' imported from ...\scripts\checks\blast_reach.mjs. This was the expected missing-feature failure: the test-first harness imports the not-yet-created shared blast geometry contract, before any production helper or wiring exists.
- **[high] Task 1 RED receipt correction — blast reach causal harness.** Command: npx tsx scripts/checks/blast_reach.mjs; exit: 1. Observed ERR_MODULE_NOT_FOUND: Cannot find module 'C:\Users\brenn\projects\singedTerra-worktrees\lobby-session-seam\shared\src\engine\BlastGeometry.ts' imported from ...\scripts\checks\blast_reach.mjs. This was the expected missing-feature failure: the test-first harness imports the not-yet-created shared blast geometry contract, before any production helper or wiring exists.
- **[high] Task 1 audit-tail repair receipt.** Under the logged H-05 routine override, mechanically repaired only the uncommitted blast-impact tail: separated the joined remain active / Correct the plan bullets, removed the trailing space after Command:, and restored npx tsx scripts/checks/blast_reach.mjs in the malformed RED receipt. No receipt or other record was removed; both the repaired original receipt and canonical correction remain. The committed prefix was retained byte-for-byte in the working-tree encoding.
- **[high] Accept Task 1 after one review correction round.** Initial task review approved the shared geometry and consumer wiring but found that zero-damage weapons were tested outside the danger area, Hot Napalm was absent, and the observed RED existed only in the ignored task report. The corrected harness now proves Dirt Bomb, Riot Bomb, and Shield remain damage-free at center; both Napalm variants traverse the actual projectile-impact ignition path with zero immediate damage and a created fire field; and the governed log records the expected missing-module RED. The focused harness, typecheck, full root check, and diff hygiene pass. Scoped re-review marked both Important findings ADDRESSED with no new breakage. Task 1 is ACCEPTED. Confidence high.
- **[high] Prioritize a richer graphical experience after the honest-blast slice.** The user explicitly steered the autonomous loop toward richer browser graphics while retaining the Supabase backend. SMARTS Scalable/Maintainable/Available favors client-only rendering depth derived from authoritative engine events: layered terrain light, atmosphere, weapon-specific particles, camera/tank reactions, and polished transitions, with performance and reduced-motion budgets. Gameplay truth remains in `shared/`; Supabase remains seed plus action log; cosmetics never affect collision or replay. Confidence high.
- **[high] Task 2 hot-seat visual acceptance.** In the actual Vite ?e2e=hotseat game (seed 1337), P1 fired a Baby Missile at angle 39 / power 74. The deterministic impact landed 29.06 logical px from P2's body center: outside the former 18 px damage edge and inside the shared 32.4 px visual edge. The rendered fireball visibly reached P2, the HUD showed -5 and health 95, the turn advanced to P2, and the browser console contained zero errors. The focused causal oracle separately proves damage is exactly zero at and beyond the full-grown 32.4 px fading edge, so the playtest and deterministic boundary proof agree. Confidence high.
- **[high] Task 2 fresh verification matrix.** Focused blast oracle passed; full npm run check passed; client Vitest passed 31 files / 234 tests; client coverage passed at 84.21% statements, 83.96% branches, 84.61% functions, and 84.21% lines; Edge suite passed 159/159; production build passed (89 modules, main bundle 196.13 kB / 52.87 kB gzip); Playwright guardrails passed 30 with 9 expected project skips; git diff --check passed. Confidence high.
- **[high] Task 2 playtest distance correction.** The preceding playtest receipt used an AI-search scoring convention that subtracts 10 px for target center and therefore overstated the distance as 29.06 px. Recomputing the same seed-1337 angle-39/power-74 impact with the authoritative TANK_HEIGHT / 2 body center gives 27.637115459716806 px. This corrected value remains outside the former 18 px edge and inside the shared 32.4 px edge; the observed -5 damage conclusion is unchanged. This line supersedes only the preceding receipt's distance value. Confidence high.
- **[high] Task 2 review fix RED/GREEN.** Independent review found floating-point residue could shave approximately 1e-14 health at the advertised zero edge. A stricter oracle covering Baby Missile, Missile, and cluster-style MIRV failed for Baby Missile and MIRV on exact health equality while beyond-edge cases passed. damage() now snaps the final 1e-9 px to its documented zero boundary; the strict exact-edge and beyond-edge assertions pass while base-edge damage and center peaks remain exact within the existing formula tolerance. Confidence high.
- **[high] Task 2 evidence-plan correction after review.** A one-pixel browser miss depends on catching the correct animation frame and is weaker than an authoritative state assertion. The plan now keeps the real Vite playtest for the player-visible overlap/damage reading and assigns the exact zero-edge/beyond-edge obligation to the deterministic engine oracle. The stricter oracle proves exact health preservation for normal Baby Missile/Missile and cluster-style MIRV at and beyond their full-grown edges. SMARTS: Specific, Measurable, Reproducible, and Testable improve; scope and acceptance intent are unchanged. Confidence high.
- **[high] Accept Task 2 after one review correction round.** Initial review found exact-edge floating residue and an overstated playtest distance. The strict normal/cluster at-edge and beyond-edge oracle, 1e-9 boundary clamp, append-only distance correction, and clarified evidence split address both findings. Re-review marked both Important findings resolved with no new Critical, High, Important, or coverage finding. Confidence high.
- **[high] Task 2 post-fix fresh matrix.** Focused blast oracle and full npm run check passed after the edge clamp; client Vitest passed 31 files / 234 tests; coverage passed at 84.36% statements, 84.23% branches, 84.61% functions, and 84.36% lines; Edge passed 159/159; production build passed (89 modules, main bundle 196.14 kB / 52.88 kB gzip); Playwright guardrails passed 30 with 9 expected project skips; diff hygiene passed. Confidence high.
- **[high] Final-review coverage fixes.** Added a Canvas-behavior Vitest that drives Renderer.drawExplosions with full-grown normal and cluster bursts and asserts recorded arc radii 54/42. A causal extra 0.5 renderer multiplier failed it with 27/21, then restoration passed. Added exact positive-damage assertions 1e-8 px inside Baby Missile, Missile, and MIRV edges; mutating the production boundary epsilon from 1e-9 to 1e-7 failed all three, then restoration passed. These close both final-review Important gaps without changing production reach. Confidence high.
- **[high] Final whole-branch review accepted.** After the review-driven Canvas behavior test and 1e-8-inside boundary assertions, independent re-review reported ACCEPT with no Critical, High, Important, or coverage findings. The renderer mutation produced 27/21 instead of 54/42, and the physics epsilon mutation failed all three just-inside assertions; both were restored before acceptance. Confidence high.
- **[high] Exact pre-commit matrix and governed behavior commit.** Focused blast oracle and full root check passed; client Vitest and coverage passed 32 files / 235 tests at 84.28% statements/lines, 83.94% branches, and 83.68% functions; Edge passed 159/159; production build transformed 89 modules with the main bundle at 196.14 kB / 52.88 kB gzip; Playwright passed 30 with 9 intentional skips; diff hygiene and secret scan passed. Commit 799ac17 records the exact-edge clamp and causal renderer/inner-edge tests. No low-confidence decision or [NEEDS-TRIAGE] finding required promotion. Confidence high.
## Blast impact mainline integration receipt (2026-07-26)

- **[high] PR #177 merged and exact-SHA Pages deployment verified.** Independent dependency and coverage audits accepted with zero findings. Hosted typecheck/harnesses/build, Edge tests, rendering guardrails, and both CodeQL checks passed; the PR was clean and mergeable before merge. Main advanced to `ce4bc90a9505c272d93e91746f6183cc9deb20c5`. Pages run `30215510553` passed build, current-main verification, deployment, provenance verification, and live browser smoke; the live `deploy-meta.json` reports the same SHA and the site returns HTTP 200. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Terrain silhouette polish sprint

- **[high] Select render-only terrain silhouette softening as the next richer-graphics slice.** Compared weapon-specific particles and large-detonation camera kick, SMARTS Scalable/Maintainable/Available/Reliable/Testable/Securable favors improving every hill, crater, cave lip, and dirt wall through the existing terrain-version cache. The binary gameplay bitmap remains authoritative and byte-identical; only client offscreen alpha changes. No shared engine, Supabase, dependency, workflow, migration, or remote state surface is opened. Confidence high.
- **[high] Use local eight-neighbor coverage with solid world bounds.** Fully surrounded terrain remains opaque, exposed solid pixels retain a strong bounded alpha, and air remains transparent. Treating out-of-bounds neighbors as solid prevents the world frame from fading. A pure helper plus behavioral ImageData test gives a causal contract without Canvas or rendering dependencies in shared gameplay code. Confidence high.
- **[high] Terrain edge helper RED/GREEN and mutation proof.** The first focused Vitest run failed before collection because `./terrainEdges` did not exist. The pure helper then passed air/interior/flat/vertical/corner/world-frame and immutability assertions. A full-opacity mutation failed with 255 versus expected 231, and an OOB-as-air mutation failed with 215 versus expected 255; exact production logic was restored and focused tests returned green. Confidence high.
- **[high] Terrain renderer integration RED/GREEN and mutation proof.** A controlled offscreen `ImageData` test failed while the real rebuild still wrote hardcoded alpha 255 at a flat exposed edge. Routing solid pixels through the helper produced alpha 231 at the edge, 255 inside, 0 in air, preserved the bitmap hash, and retained one rebuild for repeated terrainVersion plus a rebuild on version advance. Bypassing the helper failed the behavioral test; restoration passed 4/4 focused assertions and workspace typecheck. Confidence high.
- **[high] Terrain silhouette live visual acceptance.** The actual Vite `?e2e=hotseat` game rendered the generated hillside, then fired a real Baby Missile and rebuilt a fresh crater. Full-frame and close crater captures showed the coverage-softened rim continuous across slopes and the new circular cut while interior strata stayed opaque and world edges remained sealed. No application exception occurred; Chromium emitted only its known warning that a meta-delivered `frame-ancestors` directive is ignored. Confidence high.
- **[high] Review correction and acceptance.** Independent render review found the cardinal fast path skipped diagonal-only exposure; exact unrolled eight-neighbor coverage plus a 247-alpha diagonal regression resolved it. Coverage review found the square integration fixture could not kill an x/y swap and did not sweep all coverage levels; the renderer probe now uses x=900, the coordinate-swap mutation fails 0 versus 231, and the pure oracle pins all 0 through 8 neighbor alphas from 191 through 255. Both re-reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Confidence high.

- **[high] Exact final terrain-polish matrix is green.** The focused helper and real-renderer seam passed 6/6; `npm run check` passed; client Vitest passed 34 files / 241 tests; client coverage passed at 84.59% statements/lines, 84.61% branches, and 83.73% functions, with `terrainEdges.ts` at 100%; Edge passed 159/159; production build transformed 90 modules with the main bundle at 196.53 kB / 53.06 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
- **[high] Governed commits published as ready PR #178.** Behavior commit `2267611` and governance commit `ce2af26` were created through exact-path staging after focused tests, diff hygiene, and an empty secret scan. The two-commit branch was based directly on current `origin/main@ce4bc90` with zero base-only commits, pushed as `codex/terrain-silhouette-polish`, and opened as ready PR #178. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.

## Terrain silhouette mainline integration receipt (2026-07-26)

- **[high] PR #178 merged and exact-SHA Pages deployment verified.** Independent render and coverage reviews accepted with no remaining findings. Exact-head deterministic checks, client tests/build, Edge tests, rendering guardrails, and both CodeQL checks passed; the PR was clean and mergeable. Main advanced to `4cd26e864fe4557b544b77265fec4f619c000a3d`. Pages run `30216259096` passed build, current-main verification, deployment, provenance verification, and its post-deploy live smoke; an independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Directional impact kick sprint

- **[high] Select blast-origin-aware camera recoil as the next richer-graphics slice.** The renderer already has generic debris, sparks, smoke, flash, scorch, and random shake. Compared weapon-specific particle branches and simulation-affecting hit-stop, SMARTS Maintainable/Reliable/Testable/Securable favors a bounded directional impulse derived from each authoritative explosion event: large weapons gain distinct physical weight without changing engine ticks, replay, action ordering, dependencies, or Supabase. Small blasts retain current feel; reduced-motion remains a hard presentation gate. Confidence high.
- **[high] Scope recoil as composited renderer state.** A pure helper will map blast position/radius to a capped vector pointing toward canvas center; `Renderer` will retain the strongest simultaneous impulse, compose it with existing shake, decay it, clear it on reset, and keep the idle-redraw gate alive. Hit-stop, zoom, rotation, simulation timing, audio, damage, and serialization are explicit non-goals. Confidence high.
- **[high] Directional kick helper RED.** `npm -w @singedterra/client run test -- src/renderer/impactKick.test.ts` exited 1 before collection because `./impactKick` did not exist. This is the expected missing-feature failure before any production recoil helper or renderer state was added. Confidence high.
- **[high] Directional kick helper GREEN and mutation proof.** The pure contract passed threshold, monotonic scaling, cap, four-way direction, center safety, and invalid inputs. An initial threshold mutation survived at the exact arithmetic zero and exposed a missing below-threshold oracle; adding radius threshold-minus-one failed with -0.16 versus zero. Reversed direction then failed the left-impact sign, and removing the cap failed with magnitude 1596.16 versus 8. All production mutations were restored; focused tests and workspace typecheck returned green. Confidence high.
- **[high] Renderer recoil integration RED.** The behavioral seam drove real `ExplosionEvent` values through `consumeExplosion`, an idle render transform, `isAnimating`, reduced motion, and reset. Before production wiring, 3/4 assertions failed as expected: real events left kick at 0 instead of 4.8, idle redraw returned false, and reset retained kick 4. The reduced-motion zero assertion already passed as the no-feature baseline. Confidence high.
- **[high] Review corrections and mutation proof.** Independent render review found the former 12px sky overscan could expose a strip under composed 9px random shake plus 8px directional recoil, and that new weaker heavy blasts could be masked by a stronger kick from an older frame. Coverage review additionally found unpinned random-shake composition, axis-only liveness, decay termination, event-order arbitration, and invalid guards. Production now uses an 18px derived overscan and selects the strongest kick only within each new event batch. Twelve focused assertions cover both event orders, sequential opposing blasts, exact shake-plus-kick composition, x-only/y-only liveness, convergence to zero, sky fill bounds, and every invalid-input guard. Assignment-over-composition, prior-frame arbitration, axis-AND, no-decay, and 12px-margin mutations each failed and were restored. Confidence high.
- **[high] Browser recoil acceptance and final coverage correction.** A real Chromium/Vite Canvas probe held visual randomness neutral and compared the same impact point at radius 24 versus 54. The threshold blast translated `[0,0]`; the heavy blast translated exactly `[4.4943800523,-1.6853925196]`, matching the pure helper, then decayed to `[3.2359536377,-1.2134826141]` on the next frame. The captured frame showed the shifted heavy fireball over the terrain with no exposed backdrop and zero page errors. Final coverage re-review found Y-axis epsilon cleanup was not causal; seeding both axes made deletion of `kickY = 0` fail at -0.067392 versus zero, then production was restored. Confidence high.
- **[high] Independent re-reviews accepted.** Render review confirms the derived 18px overscan, batch-local arbitration, reduced-motion, decay, reset, Canvas composition, performance, and architecture with no remaining Critical/High/Important finding. Coverage review confirms all helper boundaries and renderer paths—including independent X/Y epsilon cleanup—are mutation-sensitive; focused verification is 12/12 with no remaining coverage finding. Confidence high.
- **[high] Exact final directional-kick matrix is green.** Focused recoil tests passed 12/12; `npm run check` passed; client Vitest passed 36 files / 253 tests; client coverage passed at 84.82% statements/lines, 84.88% branches, and 83.79% functions, with `impactKick.ts` at 100%; Edge passed 159/159; production build transformed 91 modules with the main bundle at 197.23 kB / 53.32 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
- **[high] Governed commits published as ready PR #179.** Behavior commit `55d5122` and governance commit `882916c` were created through exact-path staging after focused tests, full verification, diff hygiene, and an empty secret scan. The branch was based directly on current `origin/main@4cd26e8` with zero base-only commits, pushed as `codex/directional-impact-kick`, and opened as ready PR #179. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.

## Directional impact kick mainline integration receipt (2026-07-26)

- **[high] PR #179 merged and exact-SHA Pages deployment verified.** Independent render and coverage reviews accepted with no remaining findings. Exact-head deterministic checks, client tests/build, Edge tests, rendering guardrails, and both CodeQL checks passed; the PR was clean and mergeable. Main advanced to `f9ae561e0455c7294b8a72ed182c91d49ba5fdd0`. Pages run `30216877302` passed build, current-main verification, deployment, provenance verification, and its post-deploy live smoke; an independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Terrain-aware debris sprint

- **[high] Select terrain-aware ejecta as the next richer-graphics slice.** Compared weapon-specific particle branches, a new asset pipeline, and simulation-affecting terrain work, SMARTS Maintainable/Reliable/Testable/Securable favors correcting the existing visible defect where explosion and wreck chunks fly through hills. A bounded client-only bitmap sweep improves every detonation, needs no dependency, and cannot alter deterministic replay or Supabase. Confidence high.
- **[high] Use swept lower-edge collision with reversible support.** Each falling chunk samples its complete frame segment against the current terrain bitmap, lands at the last clear sample with translation/spin stopped, and resumes gravity if later deformation removes its support. Reading but never mutating `GameState.terrain` keeps the effect physically connected while strictly cosmetic. Malformed and out-of-bounds inputs fail open. Confidence high.
- **[high] Debris helper RED/GREEN.** The first focused Vitest run failed before collection because `./debrisMotion` did not exist. The pure helper then passed flat landing, lower-edge contact, swept diagonal collision, supported rest, support-removal resume, rising motion, malformed terrain, bounds, immutability, and finite-output assertions. Confidence high.
- **[high] Effects integration RED/GREEN.** With the pure helper present but `EffectsRenderer.update` still terrain-blind, the real effects seam failed at `y=4.32`, `vy=2.32`, `landed=false`, and `Renderer` called update with no terrain argument. Wiring the current `GameState.terrain` by identity settled the chunk while smoke, sparks, text, reduced motion, age, and bitmap immutability remained intact. Confidence high.
- **[high] Mutation proof strengthened the renderer oracle.** Collision bypass, point-only contact, one-sample motion, and permanent-landed mutations each failed focused assertions and were restored. Replacing the live terrain with a fresh empty bitmap initially survived because both arrays were empty and deep-equal; an exact-reference assertion then failed the substitution and passed after restoration. Confidence high.
- **[high] Real-browser terrain landing acceptance.** In actual Chrome/Vite `?e2e=hotseat` play with cosmetic randomness held neutral, a real Baby Missile generated five overlapping terrain-color chunks. Canvas-call tracing followed one chunk through ascent and descent to `y=373.388`, then observed that exact contact position for 14 consecutive rendered frames until its lifetime expired. The page produced zero application errors; the local browser and server were closed cleanly. Confidence high.
- **[high] Review correction replaced point sampling with an exact swept-volume query.** Independent render review supplied a concrete diagonal counterexample where three lower-edge points could miss a one-pixel ridge. The helper now enumerates only swept-AABB candidate cells and intersects their expanded X interval plus Y interval with the complete frame path. The counterexample, its mirror, and a reviewer-run 10,000-case differential probe all report zero missed continuous collisions. Confidence high.
- **[high] Coverage review corrections close every causal boundary.** Tests now isolate falling and landed left/center/right lower-edge contact, exact zero post-gravity velocity, individually malformed dimensions, solid-backed off-world edges, support removal, and exact lifetime expiry. Controlled `< 0` and `age <= life` mutations failed and were restored. Both independent final re-reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding; `debrisMotion.ts` is 100% statements/branches/functions/lines. Confidence high.
- **[high] Exact final terrain-aware-debris matrix is green.** Focused tests passed 20/20; `npm run check` passed; client Vitest passed 38 files / 265 tests; client coverage passed at 85.09% statements/lines, 85.31% branches, and 84.06% functions, with `debrisMotion.ts` at 100%; Edge passed 159/159; production build transformed 92 modules with the main bundle at 198.64 kB / 53.89 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
- **[high] Governed commits published as ready PR #180.** Behavior commit `970495c` and governance commit `d2a96f6` were created through exact-path staging after focused tests, full verification, diff hygiene, and an empty secret scan. The branch was based directly on current `origin/main@f9ae561` with zero base-only commits, pushed as `codex/terrain-aware-debris`, and opened as ready PR #180. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.

## Terrain-aware debris mainline integration receipt (2026-07-26)

- **[high] PR #180 merged and exact-SHA Pages deployment verified.** Both independent final reviews accepted with no remaining findings. Exact-head deterministic checks, client tests/build, Edge tests, rendering guardrails, and both CodeQL checks passed; the PR was clean and mergeable. Main advanced to `fb5b9c17f2f089baf455c3620aee7fdf717845f5`. Pages run `30217576736` passed build, current-main verification, deployment, provenance verification, and post-deploy live smoke; an independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Weapon-signature projectiles sprint

- **[high] Select weapon-signature projectiles as the next richer-graphics slice.** Every current shell shares one orange orb and smoke trail even though the authoritative state identifies fifteen weapon types. Compared with an asset pipeline, simulation-affecting hit-stop, and broad HUD work, SMARTS Scalable/Maintainable/Available/Reliable/Testable/Securable favors bounded client profiles keyed by existing `weaponType`, velocity, and split state. The slice exposes roster identity during flight without changing physics, replay, action ordering, dependencies, or Supabase. Confidence high.
- **[high] Keep profile data derived and render-only.** Shared weapon definitions supply accent color while the client maps semantic families to bounded silhouette, scale, glow, and trail values. Airburst children remain smaller than carriers; invalid velocity falls back to a finite neutral orientation. No profile state crosses the renderer boundary. Confidence high.- **[high] Profile helper RED/GREEN and mutation proof.** The first focused Vitest run failed before collection because `./projectileVisuals` did not exist. The pure helper then mapped the exhaustive weapon union to finite bounded profiles using the shared weapon accent, family silhouette, scale, trail, and safe velocity orientation. Heavy-to-shell, submunition-scale-to-one, and invalid-velocity-guard removals each failed causal assertions and were restored. Confidence high.
- **[high] Real Canvas seam RED/GREEN and profile-bypass proof.** Before integration, four behavioral assertions failed because the renderer still used one orange orb, fixed 5/9px radii, no velocity orientation, and no family primitives. Wiring the profile produced weapon-colored bounded trails and shell/heavy/nuclear/earth/mine/napalm/airburst/submunition glyphs with balanced Canvas state. Forcing every draw through the baby-missile profile failed color, silhouette, and split assertions, then restoration passed. Confidence high.
- **[high] Real-browser signature acceptance.** Actual Chrome/Vite hot-seat play compared a broad banded Heavy Missile, a bright Napalm droplet, and a Cluster carrier splitting into five smaller finned gold children. The post-review split capture showed clean child-only history rather than a repainted carrier arc. All captures used the real engine, HUD weapon selection, input path, and Canvas renderer; zero page errors occurred and both browser/server sessions were closed. Confidence high.
- **[high] Independent review corrected semantic trail identity.** Render and coverage review found that a co-located airburst child inherited slot 0's carrier history and that sibling resolution compacted array indices into another child's history. Production now clears the small bounded history set on every live-count transition and resets stable-count slots on weapon, split-state, age rewind, or a greater-than-100px jump. Uninterrupted split, shrink/compaction, regrowth, exact 100/100.01px boundary, 30-sample capacity, and clear assertions kill the former behavior. Confidence high.
- **[high] Coverage review strengthened Canvas causality.** A stateful context mock now proves caller fill/stroke/alpha/line state restoration, trail-before-halo-before-glyph order, unique positive/negative primitive signatures, exact old/new trail endpoints, five distinct family treatments, and exhaustive `WeaponType` silhouette mapping. Count-reset, semantic-identity, threshold, capacity, interpolation, profile-bypass, and family mutations failed and were restored. Both independent re-reviews returned ACCEPT with no Critical, High, Important, or coverage finding; `projectileVisuals.ts` is 100% statements/branches/functions/lines. Confidence high.
- **[high] Exact final weapon-signature matrix is green.** Focused tests passed 16/16; `npm run check` passed; client Vitest/coverage passed 40 files / 281 tests at 85.50% statements/lines, 85.28% branches, and 84.17% functions; Edge passed 159/159; production build transformed 93 modules with the main bundle at 203.08 kB / 54.88 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
- **[high] Audit formatting correction.** The profile-helper bullet above is logically separate from the preceding profile-boundary bullet; its leading newline was omitted during the append-only write. The evidence and decision content are unchanged, and this correction is appended rather than rewriting audit history. Confidence high.

- **[high] Governed commits published as ready PR #181.** Behavior commit `5853af0` and governance commit `48319f7` were created through exact-path staging after focused tests, the full verification matrix, diff hygiene, and empty secret scans. The branch was based directly on current `origin/main@fb5b9c1` with zero base-only commits, pushed as `codex/weapon-signature-projectiles`, and opened as ready PR #181. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.

## Weapon-signature projectiles mainline integration receipt (2026-07-26)

- **[high] PR #181 merged and exact-SHA Pages deployment verified.** Both independent final reviews accepted with no remaining findings. Exact-head deterministic checks, client tests/build, Edge tests, rendering guardrails, and CodeQL passed; the ready PR was clean and mergeable. Main advanced to `d93c331ab408cc077197cef8419ee1d5df8d5da9`. Pages run `30219797367` passed build, current-main verification, deployment, provenance verification, and post-deploy live smoke; an independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Weapon-signature detonations sprint

- **[high] Select weapon-signature detonations as the next richer-graphics slice.** Compared ambient sky polish, the already-implemented power gauge, and simulation-affecting hit-stop, SMARTS Maintainable/Reliable/Testable/Securable favors carrying the authoritative weapon identity through the most watched moment of each turn. Conventional, nuclear, earth, incendiary, scatter, funky, and mine impacts will gain bounded client treatments without changing blast truth, replay, dependencies, or Supabase. Confidence high.
- **[high] Add weapon type only as locally derived cosmetic provenance.** `ExplosionEvent.weaponType` is populated from the same replayed action already consumed by the engine; it is not added to the network action or persisted backend schema. The existing radius/style/color/duration and shared reach remain authoritative, while the client profile shapes pixels only inside that reach. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: the user's standing passion-project authority bypasses only this sprint's spec/plan approval pause. Security/auth/crypto, irreversible operations, spending, review, fresh verification, hosted CI, merge cleanliness, and deployment proof remain active.
- **[high] Task 1 weapon-provenance RED.** Focused deterministic harnesses exercised cluster children, a normal missile, all four Bouncing Betty contacts, and Hot Napalm ignition. All expected weapon identities failed as `undefined` while their existing motion, counts, ordering, detonation attributes, and deterministic replay checks remained intact. This isolates the missing `ExplosionEvent.weaponType` field at both event constructors. Confidence high.
- **[high] Task 1 GREEN and mutation proof.** Adding `weaponType` at the normal detonation and napalm ignition constructors made the focused cluster, missile, Betty, and Hot Napalm provenance checks green without disturbing their existing deterministic assertions; shared/client typecheck passes. Forcing normal events to `baby_missile` failed cluster, missile, and all Betty contacts, while forcing ignition to `napalm` failed Hot Napalm. Both mutations were restored. Confidence high.
- **[high] Task 2 profile and renderer RED.** The profile test first failed before collection because `./explosionVisuals` did not exist. After the exhaustive bounded helper passed 6/6, the real centralized Renderer seam failed three causal obligations: consumed bursts cached no profile, nuclear/earth/incendiary/scatter/funky/mine payloads still collapsed to the generic primitive pattern, and legacy spoke squares extended beyond the shared full-grown reach. Caller Canvas state already restored correctly. Confidence high.
- **[high] Task 2 mutation proof.** Nuke-to-conventional family substitution failed exhaustive profile and Canvas signature assertions; a 1% reach inflation failed exact shared-boundary and containment checks; forcing every consumed event through the Baby Missile profile failed nuclear provenance and primitives; removing the outer Canvas restore leaked fill state and failed the caller-state oracle. All mutations were restored. Focused coverage also preserves body-before-detail order, id dedupe, and exact lifetime culling. Confidence high.
- **[high] Browser detonation-signature acceptance.** A real Chromium/Vite Canvas contact sheet drove the production `Renderer` with conventional, nuclear, earth, incendiary, scatter, funky, and mine events. All seven families were visually distinct, their full-grown reaches matched the shared profile values (54, 162, 90, 61.2, 25.2, 45, and 54 logical px), and the browser reported zero application errors. Live `?e2e=hotseat` actions then fired Baby Missile, Dirt Bomb, and Napalm through the actual HUD/input/engine path; ammo and turns advanced and every action resolved without error. The contact sheet supplies exact transient comparison evidence; the live actions supply integration evidence. The local browser and Vite server were closed cleanly. Confidence high.
- **[high] Independent review corrections and final acceptance.** Initial render and coverage reviews identified a stale architecture guard plus missing causal proof for color propagation, reset behavior, simultaneous-burst alpha isolation, and stroke-width containment. The guard now follows the centralized profile seam; stateful Canvas tests prove event color reaches body and detail, reset admits restarted ids, simultaneous nuke-to-missile rendering preserves the incoming alpha for both bodies, and all strokes remain within authoritative reach including half-width. A final render correction made the nuclear branch preserve the exact incoming alpha rather than reset to one. Both independent re-reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding; focused verification passed 25/25. Confidence high.- **[high] Exact final weapon-signature-detonation matrix is green.** Focused profile and real-Canvas tests passed 25/25; `npm run check` passed with deterministic provenance for normal, airburst, Betty, and napalm events; client Vitest/coverage passed 42 files / 297 tests at 85.71% statements/lines, 85.30% branches, and 84.22% functions, with `explosionVisuals.ts` at 100%; Edge passed 159/159; production build transformed 94 modules with the main bundle at 207.08 kB / 55.90 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.- **[high] Governed behavior commit created.** Exact-path staging isolated the engine provenance, renderer/profile implementation, focused deterministic/Canvas oracles, and specification update from governance receipts. Cached diff hygiene and the secret scan passed immediately before commit `961ee32` (`feat(rendering): add weapon-signature detonations`). Confidence high.

- **[high] Audit formatting correction.** The final-matrix and governed-behavior-commit receipts above are logically separate bullets from their predecessors; their leading newlines were omitted during append-only writes. Their evidence and decision content are unchanged, and this correction is appended rather than rewriting audit history. Confidence high.

- **[high] Governed commits published as ready PR #182.** Behavior commit `961ee32` and governance commit `0ff6c2a` were created through exact-path staging after focused tests, the full verification matrix, diff hygiene, and empty secret scans. The branch was based directly on current `origin/main@d93c331` with zero base-only commits, pushed as `codex/weapon-signature-detonations`, and opened as ready PR #182. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.

## Weapon-signature detonations mainline integration receipt (2026-07-26)

- **[high] PR #182 merged and exact-SHA Pages deployment verified.** Exact-head deterministic checks, client tests/build, Edge tests, rendering guardrails, and CodeQL passed; the ready PR was clean and mergeable. Main advanced to `50e231677b5d323c358ddd3748fbac9a570dac60`. Pages run `30221207522` passed build, current-main verification, deployment, provenance verification, and post-deploy live smoke; an independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. Main CI and CodeQL reruns also passed. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Weapon-signature battlefield lighting sprint

- **[high] Select localized weapon-colored blast lighting as the next richer-graphics slice.** Compared continuously animated clouds, simulation-adjacent tank displacement, and a raster asset pipeline, SMARTS Maintainable/Reliable/Testable/Securable favors compounding the new exhaustive detonation profiles inside the existing flash pass. Nearby battlefield pixels gain spatial color and weight without changing fireball reach, gameplay truth, replay, dependencies, or Supabase. Confidence high.
- **[high] Bound the lighting budget and preserve blast truth.** At most three strongest live bursts may cast radial light per frame; every falloff is finite, capped, transparent at its edge, and presentation-only. Fireball/signature geometry remains within shared `blastReachRadius`, while illumination is explicitly not a damage-boundary cue. The existing reduced-motion and Canvas-state boundaries remain hard gates. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: the user's standing passion-project authority bypasses only this sprint's spec/plan approval pause. Security/auth/crypto, irreversible operations, spending, review, fresh verification, hosted CI, merge cleanliness, and deployment proof remain active.
- **[high] Task 1 blast-lighting RED.** The first focused Vitest run failed before collection because `./blastLighting` did not exist. This is the expected missing-feature failure before any production light profile or renderer integration was added. Confidence high.
- **[high] Task 1 GREEN and mutation proof.** The pure helper maps all seven visual families to finite bounded radius/alpha, derives spread from shared visual reach, caps extreme lights at 360 logical px, holds briefly, decays quadratically to exact zero, preserves input, and fails closed on malformed state. Nuclear-to-conventional substitution and cap removal failed causal assertions. A constant-envelope mutation initially survived monotonic non-increase, exposing a weak oracle; explicit mid/late strict-decay assertions then killed it. All mutations were restored and focused tests returned 5/5 green. Confidence high.
- **[high] Task 2 renderer RED.** With the pure helper present but `drawFlash` still limited to one warm full-canvas fill, the real `consumeExplosion`/Canvas seam failed three causal obligations: no weapon-colored radial gradient existed, no strongest-three candidates were selected, and no local additive fills were drawn. The pre-existing reduced-motion no-op remained green as the behavioral baseline. Confidence high.
- **[high] Task 2 GREEN and mutation proof.** `drawFlash` now ranks a fresh candidate array by radius-times-alpha, paints at most three authoritative weapon-color gradients in additive mode, then preserves the original warm headline exposure. The real event-consumption seam proves transparent falloff, local-before-global order, strongest-three centers, burst-order and input immutability, family alpha distinction, reduced-motion suppression, and exact caller Canvas restoration. Profile bypass, limit 3-to-4, additive-to-source-over, and restore removal each failed causal assertions and were restored. Focused lighting plus detonation regressions pass 18/18 with workspace typecheck and diff hygiene green. Confidence high.
- **[high] Browser battlefield-lighting acceptance.** A real Chrome/Vite contact sheet drove the production `Renderer` and a real seeded `GameEngine` state for conventional, nuclear, earth, incendiary, scatter, funky, and mine events. The battlefield visibly caught each authoritative color: nuclear produced the broadest white-gold illumination, earth a tight dusty pool, incendiary a saturated orange pool, scatter a compact gold flash, funky a vivid magenta pool, mine a compact ring-lit pop, and conventional the warm baseline. Live `?e2e=hotseat` play then fired Baby Missile and Napalm through the actual HUD/input/engine path; both resolved and advanced the turn. No page exception occurred; Chrome reported only the known meta `frame-ancestors` warning and a missing `favicon.ico`. Browser and Vite processes were closed and port 5173 was released. Confidence high.

- **[high] Independent-review coverage corrections are mutation-proven.** The exhaustive family table now pins every radius/alpha pair and uniqueness; the stateful Canvas recorder binds each created gradient object to its exact local fill; headline exposure alpha is exact; and mixed-age arbitration proves fresh smaller bursts can outrank a stale large blast. Forcing age to zero, bypassing the derived light radius, replacing the gradient fill with a flat color, forcing headline alpha to one, and collapsing funky into the incendiary profile each failed focused assertions and were restored. Focused client-workspace verification passes 11/11 with typecheck and diff hygiene green. Confidence high.

- **[high] Independent final lighting re-reviews accepted.** Render review reran 21 focused renderer tests plus workspace typecheck and diff hygiene; coverage review reran 29 adjacent renderer tests plus the same static gates. Both returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Confidence high.
- **[high] Exact final weapon-signature-lighting matrix is green.** Focused client-workspace tests passed 11/11; `npm run check` passed; client Vitest/coverage passed 44 files / 308 tests at 85.83% statements/lines, 85.49% branches, and 84.28% functions, with `blastLighting.ts` at 100%; Edge passed 159/159; production build transformed 95 modules with the main bundle at 208.30 kB / 56.31 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.

- **[high] Governed lighting behavior commit created.** Exact-path staging isolated the pure lighting helper, real Canvas integration, focused causal oracles, and specification update from governance receipts. Cached diff hygiene and the secret scan passed immediately before commit `9037ec2` (`feat(rendering): add weapon-signature battlefield lighting`). Confidence high.

- **[high] Governed commits published as ready PR #183.** Behavior commit `9037ec2` and governance commit `5c560c5` were created through exact-path staging after focused tests, the complete verification matrix, diff hygiene, and empty secret scans. The branch is based directly on current main and pushed as `codex/weapon-signature-lighting`; ready PR #183 is open. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.

## Weapon-signature battlefield lighting mainline integration receipt (2026-07-26)

- **[high] PR #183 merged and exact-SHA Pages deployment verified.** Both independent final reviews accepted with no remaining findings. Exact-head deterministic checks, client tests/build, Edge tests, rendering guardrails, and CodeQL passed; the ready PR was clean and mergeable. Main advanced to `2293c8df4784d1f70037524c534e0fe08bd4f0d3`. Pages run `30224364300` passed build, current-main verification, deployment, provenance verification, and post-deploy live smoke; an independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. Main CI run `30224364299` and CodeQL run `30224364293` also passed. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Projectile ground shadows sprint

- **[high] Select terrain-projected projectile shadows as the next richer-graphics slice.** The recent weapon glyph, detonation, and lighting work gives ordnance identity and impact weight, but airborne shells still lack a visual relationship to the deformable battlefield. Compared with perpetual ambient animation, another static sky repaint, or a sprite pipeline, SMARTS Maintainable/Reliable/Testable/Securable favors a bounded present-position shadow derived from the live terrain column. It adds spatial depth and trajectory readability without predicting impact, forcing idle redraws, changing lockstep, adding dependencies, or touching Supabase. Confidence high.
- **[high] Keep the cue present-tense and presentation-only.** The cue projects only the shell's current x-coordinate to the first solid terrain pixel, widens and fades with altitude, fails closed off-canvas or at/below ground, and is drawn between terrain and tanks. It is not an aim aid, landing marker, physics input, or network field. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: the user's standing passion-project authority bypasses only this sprint's spec/plan approval pause. Security/auth/crypto, irreversible operations, spending, review, fresh verification, hosted CI, merge cleanliness, and deployment proof remain active.

- **[high] Task 1 projectile-shadow RED/GREEN and mutation proof.** The first focused client Vitest run failed before collection because `./projectileGroundShadow` did not exist. The pure helper now follows the live terrain column, maps altitude to finite bounded ellipse radii and alpha, caps at 320 logical px of scaling, preserves inputs, and fails closed for malformed, off-canvas, at/below-ground, all-air, or wrong-sized terrain. Adjacent-column substitution, scale-cap removal, at-ground admission, and constant-altitude mutations each failed causal assertions and were restored. Focused tests pass 4/4 with workspace typecheck and diff hygiene green. Confidence high.

- **[high] Task 2 real-Canvas RED/GREEN and mutation proof.** Before integration, all four obligations failed: `ProjectileRenderer.drawGroundShadows` did not exist and the central renderer never invoked a terrain-linked cue pass. Production now draws one bounded neutral radial ellipse for every valid live projectile, uses exact helper geometry/alpha and transparent falloff in source-over mode, and places the pass after terrain but before visible tanks and payload glyphs. First-projectile-only, fixed-geometry, outer-restore removal, and post-payload draw-order mutations each failed causal assertions and were restored. Focused shadow plus existing projectile regressions pass 17/17 with typecheck and diff hygiene green. Confidence high.
- **[high] Browser tuning rejected an underpowered first envelope, then accepted the bounded correction.** A production-Renderer contact sheet in real Chrome compared low, medium, high, crater-adjacent, and three simultaneous split-child positions. The initial 7..24 by 2..5 px / 0.34..0.08 envelope was functionally correct but visually disappeared into the dark terrain, so visual acceptance failed. The bounded envelope was deliberately retuned to 9..30 by 3..7 px / 0.52..0.20; pixel probing on the high-altitude cue confirmed a visible roughly 20 percent local terrain darkening while the full-frame result stayed soft and did not resemble a target marker. A live `?e2e=hotseat` Baby Missile then produced 27 production unit-gradient cue frames, resolved normally, and advanced the turn. No page exception occurred; Chrome reported only the known meta `frame-ancestors` warning and missing favicon. Browser and Vite processes were closed and port 5173 released. Confidence high.
- **[high] Independent review corrections are causally proven and accepted.** Coverage review found that terrain identity, nested Canvas transform restoration, and exact unit-gradient geometry were not yet isolated. The Renderer oracle now uses non-empty terrain and asserts reference identity; the stateful Canvas recorder tracks caller transform state through multiple valid shadows; and radial-gradient arguments are pinned exactly. Fresh-terrain-copy, omitted-inner-restore, and half-radius mutations each failed the strengthened tests and were restored. Render and coverage re-reviews both returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Confidence high.
- **[high] Exact final projectile-ground-shadow matrix is green.** Focused shadow and projectile tests passed 17/17; `npm run check` passed; client Vitest/coverage passed 47 files / 316 tests at 85.94% statements/lines, 85.65% branches, and 84.33% functions, with `projectileGroundShadow.ts` at 100%; Edge passed 159/159; production build transformed 96 modules with the main bundle at 209.25 kB / 56.62 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
- **[high] Governed projectile-shadow behavior commit created.** Exact-path staging isolated the pure live-terrain projection helper, real Canvas integration, causal renderer oracles, compatibility seam, and specification update from governance receipts. Cached diff hygiene and the secret scan passed immediately before commit `cbabe59` (`feat(rendering): add projectile ground shadows`). Confidence high.

- **[high] Governed commits published as ready PR #184.** Behavior commit `cbabe59` and governance commit `fc0a18d` were created through exact-path staging after focused tests, the complete verification matrix, diff hygiene, and empty secret scans. The branch is based directly on `main@2293c8d` with zero base-only commits, pushed as `codex/projectile-ground-shadows`, and opened as ready PR #184. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.

## Projectile ground shadows mainline integration receipt (2026-07-26)

- **[high] PR #184 merged and exact-SHA Pages deployment verified.** Both independent final reviews accepted with no remaining findings. Exact-head deterministic checks, client tests/build, Edge tests, rendering guardrails, and CodeQL passed; the ready PR was clean and mergeable. Main advanced to `98bccb2a63fe01e066b107d9506553bdab7c2f6f`. Main CI run `30229603042`, CodeQL run `30229603058`, and Pages run `30229603108` passed. Pages also passed current-main verification, deployed provenance, and post-deploy live smoke; an independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Weapon-signature muzzle flashes sprint

- **[high] Select weapon-signature muzzle flashes as the next richer-graphics slice.** Flight glyphs, terrain shadows, detonations, and battlefield lighting now carry weapon identity, but the launch seam still sends the tank color to an Effects API that ignores it and paints every shot as the same generic orange cone. Compared with ambient animation, an asset pipeline, or simulation-adjacent recoil, SMARTS Maintainable/Reliable/Testable/Securable favors completing the visual lifecycle with a bounded client profile derived from the first live projectile's existing weapon type. No engine, action-log, dependency, or Supabase change is needed. Confidence high.
- **[high] Keep launch signatures transient and presentation-only.** One short-lived local flash may select accent, motif, scale, spark count, spread, speed, and lifetime. It remains anchored to shared barrel-tip geometry, is suppressed by reduced motion, clears between games, and never becomes gameplay or synchronized state. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: the user's standing passion-project authority bypasses only this sprint's spec/plan approval pause. Security/auth/crypto, irreversible operations, spending, review, fresh verification, hosted CI, merge cleanliness, and deployment proof remain active.- **[high] Muzzle-profile and Canvas RED/GREEN are mutation-proven.** The pure-profile test first failed before collection because `./muzzleVisuals` did not exist; the real Effects and Renderer seams then failed because no flash state existed and the launch still passed the tank color. Production now exhaustively maps all weapon types to bounded accents, motifs, scale, spark fan, speed, and lifetime; stores a copied short-lived flash; paints oriented additive geometry; and derives the profile from the first live projectile at the shared barrel tip. Profile bypass, fixed orientation, late lifetime culling, and missing Canvas restore each failed causal assertions and were restored. Focused muzzle, terrain-effects, launch-seam, and impact regressions pass 23/23 with typecheck and diff hygiene green. Confidence high.
- **[high] Real-browser launch-signature acceptance.** A real Chrome/Vite contact sheet drove production `EffectsRenderer` and `getMuzzleVisualProfile` for Baby Missile, Heavy Missile, Nuke, Dirt Bomb, Bouncing Betty, Funky Bomb, Hot Napalm, and Death's Head. The eight launch silhouettes were visibly distinct and retained their authoritative accents: compact needle, heavy cone, nuclear ring, earth blocks, mine cross, magenta funky diamond, flame tongue, and scatter fan. Live `?e2e=hotseat` play then fired through the actual HUD/input/engine/Renderer path; the Canvas probe observed bounded unit flashes including nine consecutive Funky Bomb frames with accent `#d65cff`, and zero page exceptions. The browser and Vite server were closed and port 5173 released. Confidence high.

- **[high] Audit formatting correction.** The muzzle-profile RED/GREEN receipt above is logically separate from the scoped routine-gate override line; its leading newline was omitted during the append-only write. The evidence and decision content are unchanged, and this correction is appended rather than rewriting audit history. Confidence high.
- **[high] Independent final muzzle-flash reviews accepted after causal coverage corrections.** Initial coverage review found that the real `FIRING` transition, six motif branches, and spark spread/speed/accent propagation were not yet isolated. The corrected tests now prove exactly-once transition behavior with leave/re-enter retriggering, all eight primitive families, and representative exact particle parameters. Deleting the real spawn call, collapsing the heavy primitive, and hard-coding spark geometry/color each failed the strengthened tests and were restored. Render and coverage re-reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Confidence high.
- **[high] Exact final weapon-signature-muzzle-flash matrix is green.** Focused muzzle and adjacent renderer tests passed 26/26; `npm run check` passed; client Vitest/coverage passed 50 files / 331 tests at 86.02% statements/lines, 85.75% branches, and 84.43% functions, with `muzzleVisuals.ts` at 100%; Edge passed 159/159; production build transformed 97 modules with the main bundle at 212.82 kB / 57.47 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.- **[high] Governed muzzle-flash behavior commit created.** Exact-path staging isolated the exhaustive launch-profile helper, transient Canvas implementation, real Renderer transition, causal oracles, and specification update from governance receipts. Cached diff hygiene and the secret scan passed immediately before commit `88644ab` (`feat(rendering): add weapon-signature muzzle flashes`). Confidence high.- **[high] Governed commits published as ready PR #185.** Behavior commit `88644ab` and governance commit `2343f73` were created through exact-path staging after focused tests, the complete verification matrix, diff hygiene, and empty secret scans. The branch is based directly on `main@98bccb2` with zero base-only commits, pushed as `codex/weapon-signature-muzzle-flashes`, and opened as ready PR #185. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.
## Weapon-signature muzzle flashes mainline integration receipt (2026-07-26)

- **[high] PR #185 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30230775163` and CodeQL run `30230775157` passed with PR #185 clean and mergeable. Main advanced to `c8de5c8884f2b189ee91b92f10dfbd1326e9d9d9`; main CI `30230848507`, CodeQL `30230848502`, and Pages `30230848468` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Persistent tank wrecks sprint

- **[high] Select persistent destroyed-tank wrecks as the next richer-graphics slice.** The existing death edge launches turret debris and smoke, but retained dead `TankState` rows are still painted through the intact body/turret/barrel path. Compared with a temporary flash or removing the vehicle entirely, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors a static procedural wreck derived only from authoritative `alive === false`. It adds round-long battlefield storytelling with no timer, dependency, engine, action-log, or Supabase change. Confidence high.
- **[high] Choose a collapsed deterministic silhouette.** Dead tanks retain a contact shadow, low damaged tread/hull, muted owner-color remnant, and static metal/scorch details; they omit the intact turret, barrel, active glow, and chevron. Existing death particles stay unchanged above the wreck. The user's standing passion-project authority supplies the routine design/spec/plan approval while all review and delivery gates remain active. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: only this sprint's approval pause is bypassed. Confidence high.


- **[high] Persistent-wreck RED/GREEN and mutation proof.** The first stateful Canvas run failed three causal obligations: the dead branch still emitted intact active geometry, lacked the specified charred owner remnant, and leaked caller styles. Production now exits through a saved/restored deterministic wreck branch keyed only on `alive === false`, drawing a contact shadow, collapsed tread, low asymmetric hull, muted owner plate, metal edge, and rivets. Inverting the alive branch, removing the early return, hard-coding the owner plate, and omitting the final restore each failed focused assertions and were restored. Focused tests pass 4/4 with workspace typecheck and diff hygiene green. Confidence high.
- **[high] Real-browser wreck acceptance.** A real Chrome contact sheet imported production `TankRenderer` through Vite and compared healthy-active, damaged-20-HP, and destroyed states at gameplay scale. The wreck read as a low charred hull with a visible but subdued owner-color plate and no turret/barrel/active marker; both alive states retained their established silhouettes. No page exception occurred. Chrome and Vite were closed and port 5173 released. Confidence high.


- **[high] Independent persistent-wreck reviews accepted after causal corrections.** Render review first found that a dead tank retaining `buried` could be routed above terrain; the renderer now partitions every buried row below terrain and suppresses dig-out beacons for dead seats. Coverage review required authoritative `alive` versus health, active-state invariance, two owner colors, exact low geometry, real Renderer partitioning, and direct `drawAll` mixed-row forwarding. Each correction is pinned by causal tests; filtering dead rows from `drawAll` failed the final oracle and was restored. Both final independent reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Confidence high.
- **[high] Exact final persistent-wreck matrix is green.** Focused wreck and renderer ordering tests passed 7/7; `npm run check` passed; client Vitest/coverage passed 52 files / 338 tests at 86.02% statements/lines, 85.75% branches, and 84.43% functions; Edge passed 159/159; the production build transformed 97 modules with the main bundle at 213.90 kB / 57.72 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.

- **[high] Governed persistent-wreck behavior commit created.** Exact-path staging isolated the authoritative dead-state Canvas branch, buried-layer correction, causal renderer oracles, and specification update from governance receipts. Cached diff hygiene and the secret scan passed immediately before commit `8a82cd2` (`feat(rendering): add persistent tank wrecks`). Confidence high.

- **[high] Governed commits published as ready PR #186.** Behavior commit `8a82cd2` and governance commit `8aea97f` were created through exact-path staging after focused tests, the complete verification matrix, diff hygiene, and empty secret scans. The branch is based directly on `main@c8de5c8` with zero base-only commits, pushed as `codex/persistent-tank-wrecks`, and opened as ready PR #186. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.


## Persistent tank wrecks mainline integration receipt (2026-07-26)

- **[high] PR #186 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30235531740` and CodeQL run `30235531744` passed with PR #186 clean and mergeable. Main advanced to `e50a333ec69197e66818aae384335a242596b783`; main CI `30235620520`, CodeQL `30235620551`, and Pages `30235620514` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Shield impact ripples sprint

- **[high] Select causal shield-impact ripples as the next richer-graphics slice.** The persistent bubble shows remaining charge, but a fully absorbed hit can change only `shieldHp` and therefore read like a miss. Compared with perpetual ambient shimmer or an asset pipeline, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors a bounded response driven by the existing per-tank shield-charge drop: paired cyan rings, energy facets, and an exact `BLOCK NN` readout. No dependency, engine, action-log, or Supabase change is needed. Confidence high.
- **[high] Keep shield impacts presentation-only and transition-driven.** First observation, activation, recharge, unchanged charge, and a zero baseline silently re-baseline; only a strict positive-to-lower charge transition spawns one response. Reduced motion retains the informational blocked-damage readout while suppressing moving decoration. Health overflow remains independently visible. The user's standing passion-project authority supplies routine design/spec/plan approval while all review and delivery gates remain active. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: only this sprint's approval pause is bypassed. Confidence high.

- **[high] Shield-impact RED/GREEN and mutation proof.** The first focused run failed seven causal obligations: `spawnShieldImpact` did not exist, authoritative shield drops emitted nothing, and reset retained the shield baseline. Production now detects one strict positive-to-lower `shieldHp` transition per tank, preserves independent health-overflow feedback, and emits a bounded `BLOCK NN` readout plus paired additive rings and eight facets through client-only EffectsRenderer state. Admitting unchanged charge, bypassing reduced motion, changing the exact lifetime, shifting ring geometry, and omitting reset cleanup each failed focused assertions and were restored. Focused tests pass 8/8; the complete client suite passes 54 files / 346 tests with typecheck and diff hygiene green. Older prototype-based Renderer fixtures were updated to initialize the new real field after the full suite correctly exposed their synthetic initialization gap. Confidence high.
- **[high] Real-browser shield-impact acceptance.** Installed Chrome loaded a Vite contact sheet that drove the production Renderer through idle 120-charge, light 24-point absorption, and heavy 100-point absorption transitions. At gameplay scale, both absorbed hits produced a crisp cyan double-ring/facet response and legible exact block readout while the idle bubble stayed unchanged; heavier absorption visibly increased line intensity without escaping the bounded envelope. No page exception occurred. Chrome and Vite were closed and port 5173 released. Confidence high.

- **[high] Independent shield-impact reviews accepted after causal corrections.** Initial render review found a round-boundary false trigger and no real `Renderer.render` seam; coverage review found gaps around activation/recharge history, per-tank isolation, animated geometry, Canvas state balance, text layering, reduced motion, rounding, sizing, and cleanup. Production now re-baselines shield history when the authoritative round changes, and the strengthened tests exercise the real two-frame render route plus each requested contract. One-by-one mutations of render routing, history updates, round clearing, animation progress, strength, facet count, nested restore, text ordering, rounding, size cap, reduced-motion decoration, and text cleanup each failed their causal oracle and were restored. Both independent re-reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Focused verification passes 12/12. Confidence high.
- **[high] Exact final shield-impact-ripple matrix is green.** `npm run check` passed; client Vitest/coverage passed 54 files / 350 tests at 86.15% statements/lines, 85.97% branches, and 84.43% functions, with the renderer group at 97.22% statements and 100% branches; Edge passed 159/159; production build transformed 97 modules with the main bundle at 215.47 kB / 58.11 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; diff hygiene and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.- **[high] Governed shield-impact behavior commit created.** Exact-path staging isolated the shield transition tracker, client-only transient Canvas response, round-boundary protection, strengthened causal oracles, fixture compatibility updates, and specification update from governance receipts. Cached diff hygiene and the secret scan passed immediately before commit `7326770` (`feat(rendering): add shield impact ripples`). Confidence high.- **[high] Governed commits published as ready PR #187.** Behavior commit `7326770` and governance commit `352a744` were created through exact-path staging after focused tests, independent acceptance, the complete verification matrix, diff hygiene, and empty secret scans. The branch is based directly on `main@e50a333`, pushed as `codex/shield-impact-ripples`, and opened as ready PR #187. Hosted CI, merge, and exact-SHA Pages proof remain. Confidence high.
## Shield impact ripples mainline integration receipt (2026-07-27)

- **[high] PR #187 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30236398705` and CodeQL run `30236398733` passed with PR #187 clean and mergeable. Main advanced to `e4db674b7b5db5d31176657d2516d58520fc13bf`; main CI `30236489603`, CodeQL `30236489613`, and Pages `30236489615` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-27 - Weapon-weighted tank recoil sprint

- **[high] Select weapon-weighted localized tank recoil as the next richer-graphics slice.** Weapon-specific flight glyphs, shadows, muzzle signatures, detonations, lighting, wrecks, and shield impacts now communicate most of the combat lifecycle, but the firing chassis remains perfectly static. Compared with perpetual ambient animation, a raster asset pipeline, or simulation-adjacent knockback, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one short renderer-owned kick opposite the live barrel direction, weighted by the existing bounded muzzle profile. It compounds an established launch seam without changing engine coordinates, projectile geometry, replay, dependencies, or Supabase. Confidence high.
- **[high] Bound the pose and preserve authoritative geometry.** Peak local translation is capped at 4 logical pixels for at most 10 rendered frames, vertical travel is damped, recovery is monotonic, only the active living visible shooter moves, and reduced motion suppresses the pose. The muzzle flash remains at the authoritative pre-recoil barrel tip so the chassis visibly separates from the departing shot without changing aim or collision truth. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: only this sprint's approval pause is bypassed. Confidence high.
- **[high] Audit formatting correction.** The shield-impact governed behavior and ready-PR receipts are logically separate bullets from their predecessors; their leading newlines were omitted during append-only writes. Their evidence and decision content are unchanged, and this correction is appended rather than rewriting audit history. Confidence high.
- **[high] Tank-recoil pure-helper RED/GREEN and mutation proof.** The first focused run failed before collection because `./tankRecoil` did not exist. The pure helper now maps finite barrel angle, existing muzzle-profile weight, and integer age to an opposite-direction local translation, caps launch weight and peak travel, damps vertical motion, recovers quadratically, and expires at exactly ten frames. Direction inversion, weight collapse, constant recovery, and cap removal each failed causal assertions and were restored. Focused helper tests pass 4/4. Confidence high.
- **[high] Real launch-route recoil integration is mutation-proven.** Production records one renderer-local pose on the existing `FIRING` edge, passes it only to the matching living visible tank through balanced `TankRenderer` Canvas state, advances it once per rendered frame, keeps the idle redraw gate alive, clears it on reset or a suppressed launch, and leaves authoritative tank and muzzle coordinates unchanged. Deleting launch admission, omitting Canvas restore, removing reduced-motion gating, removing reset cleanup, and removing idle-animation liveness each failed the strengthened real-render tests and were restored. The same `FIRING` state cannot retrigger while leave/re-enter does. Focused recoil plus adjacent launch/layer tests pass 13/13; the complete client suite passes 56 files / 359 tests with typecheck and diff hygiene green. Confidence high.
- **[high] Real-browser tank-recoil acceptance.** Installed Chrome loaded a Vite contact sheet using production `TankRenderer`, `tankRecoilPose`, muzzle profiles, and `EffectsRenderer` at gameplay scale. The baby missile produced a restrained `(-1.23, 0.39)` px kick, the nuke a visibly heavier `(-2.88, 0.91)` px kick, and the nuke recovered to `(-1.04, 0.33)` px by frame four while its muzzle flash stayed at the authoritative barrel tip. Live `?e2e=hotseat` play then fired through the actual input/engine/Renderer route and recorded the expected monotonic local Canvas translations down to the subpixel tail with zero page exception. Chrome and Vite were closed and port 5173 released. Confidence high.
- **[high] Independent tank-recoil reviews accepted after lifecycle and causal-coverage corrections.** Render review found that a short-lived pose could transfer to a same-ID tank rebuilt for the next round; production now binds recoil to the launch round and invalidates it before rendering a different round. Coverage review required the exact 4 px hostile-input cap, post-admission death/burial/disappearance suppression, every-frame idle liveness, and zero/negative weight rejection. The missing-shooter launch edge also now clears stale recoil before lookup. Each obligation is pinned by a focused regression, and both independent re-reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Focused recoil plus adjacent launch/layer tests pass 16/16. Confidence high.
- **[high] Exact final weapon-weighted-tank-recoil matrix is green.** `npm run check` exited 0; client Vitest/coverage passed 56 files / 362 tests at 86.13% statements/lines, 85.82% branches, and 84.48% functions, with `tankRecoil.ts` at 100%; Edge passed 159/159; the production build transformed 98 modules with the main bundle at 216.61 kB / 58.49 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; focused tests, workspace typecheck, diff hygiene, and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
- **[high] Governed tank-recoil behavior commit created.** Exact-path staging isolated the bounded pure recoil helper, real launch/render integration, round-bound lifecycle protection, causal oracles, and specification update from governance receipts. Cached diff hygiene and the secret scan passed immediately before commit `56e74be` (`feat(rendering): add weapon-weighted tank recoil`). Confidence high.
- **[high] Governed commits published as ready PR #188.** Behavior commit `56e74be` and governance commit `39d71c3` were created through exact-path staging after focused tests, both independent ACCEPT verdicts, the complete verification matrix, diff hygiene, and empty secret scans. The branch is based directly on `main@e4db674`, pushed as `codex/weapon-weighted-tank-recoil`, and opened as ready PR #188. Hosted CI, CodeQL, merge, and exact-SHA Pages proof remain. Confidence high.