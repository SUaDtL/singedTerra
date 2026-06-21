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
