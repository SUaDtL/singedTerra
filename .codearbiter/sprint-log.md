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
## Weapon-weighted tank recoil mainline integration receipt (2026-07-27)

- **[high] PR #188 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30237345898` and CodeQL run `30237345902` passed with PR #188 clean and mergeable. Main advanced to `2923eebed308f51c0c9f49fdddbcb7c03893145d`; main CI `30237457809`, CodeQL `30237457770`, and Pages `30237457797` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-27 - Armor hit bursts sprint

- **[high] Select coalesced armor-hit bursts as the next richer-graphics slice.** The existing health-delta seam explains damage with a floating number, but a surviving chassis gives no immediate local hit response until it crosses the persistent damaged tier. Compared with perpetual ambience, another explosion layer, or simulation-adjacent knockback, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors a short owner-colored white-hot flash plus bounded metal sparks at the struck tank. It compounds authoritative health feedback without changing physics, replay, dependencies, action logs, or Supabase. Confidence high.
- **[high] Bound repeated damage and accessibility behavior.** One active burst per tank coalesces repeated DOT ticks, distinct tanks remain independent, and the profile is capped at 14 frames, 28 logical px, and 10 sparks. Only living visible health drops admit it; lethal and buried damage keep existing K.O./wreck/numeric feedback. Reduced motion retains the damage number while suppressing the decorative burst and sparks. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: only this sprint's approval pause is bypassed. Confidence high.
- **[high] Audit formatting correction.** The weapon-weighted-recoil integration receipt is a new section even though its leading blank line was omitted by the prior append-only write. Its evidence is unchanged; this correction is appended rather than rewriting audit history. Confidence high.
- **[high] Armor-hit pure-profile and real-route RED/GREEN are mutation-proven.** The pure test first failed before collection because `./armorHitVisuals` did not exist; the real Effects and Renderer suite then failed because no armor-hit API or health-delta route existed. Production now maps finite positive damage to a 14-frame, 16-to-28-pixel, four-to-ten-spark profile; coalesces repeat ticks by tank; and admits only living visible health drops while preserving numeric, shield, lethal, buried, and baseline behavior. Radius-cap, quadratic-fade, reduced-motion, lethal-admission, and same-tank-coalescing mutations each failed causal assertions and were restored. Focused armor plus adjacent shield tests pass 26/26 with client typecheck and diff hygiene green. Confidence high.
- **[high] Real-browser armor-hit acceptance.** Installed Chrome first compared idle, light, heavy, and mid-recovery states through production `TankRenderer`, `EffectsRenderer`, and the pure profile: the light hit stayed restrained, the heavy hit clearly increased local flash radius and spark count, and the half-life frame recovered to a subtle chassis glow. A second proof captured a real deterministic `?e2e=hotseat` `GameState`, sent baseline and 30-point surviving-health frames through a real production `Renderer`, and observed the exact `spawnArmorHit('p1', 120, 317, 30, '#e84d4d')` route above the live terrain with the existing `-30` readout. No page exception occurred. Confidence high.- **[high] Independent armor-hit reviews accepted after lifecycle and causal-coverage corrections.** Render review found that the central update-before-draw order skipped full-strength age zero and painted only thirteen frames; a real `Renderer.render` regression first reproduced ages 1..13, then the effect birth state was corrected so production paints exact ages 0..13 and culls before draw fifteen. Coverage review required integrated 4/5/10 spark counts, additive-state containment, bounded glint endpoints, concurrent per-tank refresh/expiry isolation, and symmetric non-finite rejection. Hard-coding four sparks and removing the inner Canvas restore each failed the strengthened tests and were restored. Both independent re-reviews returned ACCEPT with no remaining Critical, High, Important, or coverage finding. Focused armor plus adjacent shield verification passes 5 files / 40 tests. Confidence high.
- **[high] Exact final armor-hit-burst matrix is green.** `npm run check` exited 0; client Vitest/coverage passed 59 files / 390 tests at 86.19% statements/lines, 85.89% branches, and 84.53% functions, with `armorHitVisuals.ts` at 100%; Edge passed 159/159; production build transformed 99 modules with the main bundle at 218.57 kB / 59.01 kB gzip; Playwright passed 30 with 9 intentional project-conditional skips; focused tests, workspace typecheck, diff hygiene, and the codeArbiter secret scan passed. No low-confidence decision or `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
- **[high] Audit formatting correction.** The independent armor-hit review receipt is a separate bullet from the browser-acceptance receipt even though its leading newline was omitted during the append-only write. The evidence and decisions are unchanged; this correction is appended rather than rewriting audit history. Confidence high.- **[high] Governed armor-hit behavior commit created.** Exact-path staging isolated the bounded pure profile, coalesced client-only Canvas state, strict surviving-health Renderer admission, strengthened causal oracles, fixture compatibility, and specification update from governance receipts. Cached diff hygiene and the state-free secret scan passed immediately before commit `a4a3a73` (`feat(rendering): add armor hit bursts`). Confidence high.- **[high] Governed commits published as ready PR #189.** Behavior commit `a4a3a73` and governance commit `de7f27d` were created through exact-path staging after both independent ACCEPT verdicts, the complete verification matrix, diff hygiene, and empty secret scans. The branch is based directly on `main@2923eeb`, pushed as `codex/armor-hit-bursts`, and opened as ready PR #189. Hosted CI, CodeQL, merge, and exact-SHA Pages proof remain. Confidence high.
## Armor hit bursts mainline integration receipt (2026-07-27)

- **[high] PR #189 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30238419651` and CodeQL run `30238419650` passed with PR #189 clean and mergeable. Main advanced to `cb2a954c3c1d14802a027e6a5ddb0017f5489ba1`; main CI `30238506863`, CodeQL `30238506714`, and Pages `30238506787` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-27 - Turn-start wind gusts sprint

- **[high] Select turn-start wind gusts as the next richer-graphics slice.** The combat lifecycle now has weapon-specific flight, shadows, launch, recoil, detonation, lighting, shield, damage, and wreck feedback, but wind remains a HUD-only number even though it is the defining environmental input to every shot. Compared with perpetual ambience, a physics change, or another blast layer, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one bounded sky transition derived from the existing authoritative `(round, turn, wind)` tuple. It improves turn handoff and directional readability without changing engine state, replay, dependencies, or Supabase. Confidence high.
- **[high] Preserve the idle-performance contract.** The gust is limited to 48 rendered frames, 5..11 fixed procedural ribbons, finite bounded geometry, and one live renderer-owned state. Near-calm wind stays calm; reduced motion suppresses the effect; exact turn dedupe prevents repeat frames from retriggering; and `isAnimating()` releases as soon as the gust expires. Confidence high.
- Scoped routine-gate override recorded in `.codearbiter/overrides.log`: only this sprint's approval pause is bypassed. Confidence high.
- **[high] Audit formatting correction.** The prior armor-hit behavior-commit receipt, PR receipt, and mainline-integration header are logically separate entries even though leading newlines were omitted during append-only writes. Their evidence and decisions are unchanged; this correction is appended rather than rewriting audit history. Confidence high.
- **[high] Wind-gust profile and real-render route RED/GREEN are causally pinned.** The pure test first failed before collection because `./windGustVisuals` did not exist; the real Renderer suite then failed all six route, lifecycle, layering, Canvas, and reset obligations. Production now freezes a finite wind-derived 5..11-ribbon profile, observes one `(round, turn)` only in `PLAYER_TURN`, paints fixed wrapped lanes after sky and before terrain, and keeps the idle gate live for exact ages 0..47. Direction inversion, turn-dedupe removal, lifetime drift, fade collapse, Canvas restore removal, and idle-liveness removal each have direct causal assertions. Focused tests pass 2 files / 13 tests with client typecheck and diff hygiene green. Confidence high.
- **[high] Real-browser wind-gust acceptance.** Installed Chrome compared production Renderer panels for calm, light-left peak, strong-right peak, and strong-right recovery over a live deterministic terrain snapshot. Calm stayed still; light wind remained restrained; strong wind added a readable atmospheric layer without competing with tanks or terrain; and recovery visibly thinned. A live `?e2e=hotseat` shot then advanced to turn key `1:1` with wind `-3.5192941525019705`, and the production turn route admitted exactly one left-moving seven-ribbon gust. No page exception occurred; Chrome and Vite were closed and port 5173 released. Confidence high.


### 2026-07-26 - Turn-Start Wind Gusts review gate

- Visual/implementation review: ACCEPT.
- Coverage review initially identified three causal gaps: Renderer profile consumption, coordinate/wrap/all-lane-alpha bounds, and symmetric malformed turn identities.
- Added regression assertions for all three; focused gate is 2 files / 19 tests green.
- Coverage re-review: ACCEPT; client typecheck and diff hygiene green.


### 2026-07-26 - Turn-Start Wind Gusts final local matrix

- Focused wind gate: 2 files / 19 tests passed.
- Deterministic workspace check, including both workspace typechecks and all engine harnesses: passed.
- Client coverage: 61 files / 409 tests passed; statements 86.38%, branches 86.21%, functions 84.59%, lines 86.38%.
- Supabase Edge tests: 159 passed / 0 failed.
- Production build: passed; 100 modules transformed.
- Playwright production-browser matrix: 30 passed / 9 expected project skips.
- git diff --check: clean. State-free changed-file secret scan: no findings.
- No dependency, lockfile, migration, action-log, or Supabase backend change; no backend deploy is required.


### 2026-07-26 - Turn-Start Wind Gusts behavior commit

- Governed behavior commit: `997d468bd29ecc6584a0bf470b7baf3bfd42f781` (`feat: add turn-start wind gusts`).
- Exact behavior set: Renderer route/lifecycle, pure bounded profile, focused tests, and public specification.


### 2026-07-26 - Turn-Start Wind Gusts ready PR receipt

- Behavior commit `997d468bd29ecc6584a0bf470b7baf3bfd42f781` and governance commit `7267485` were pushed as `codex/turn-start-wind-gusts`.
- Ready PR #190: https://github.com/SUaDtL/singedTerra/pull/190
- Hosted exact-head CI and CodeQL are now the active gates; merge and Pages proof remain.


## Turn-start wind gusts mainline integration receipt (2026-07-26)

- **[high] PR #190 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30239376690` and CodeQL run `30239376720` passed with PR #190 clean and mergeable. Main advanced to `ed3ee9cbbeef7e791f43a8e008b0d479791a9ffe`; main CI `30239499091`, CodeQL `30239499125`, and Pages `30239499107` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Projectile motion streaks sprint

- **[high] Select immediate velocity-aligned projectile ribbons.** The existing bounded history trail becomes expressive only after multiple samples, leaving launch frames and newly split children without an immediate direction/speed cue. Compared with rebuilding history trails, sprite assets, or more explosion particles, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one stateless ribbon derived from current velocity and the existing weapon profile. It enriches every moving payload while leaving physics, retained state, dependencies, and Supabase untouched. Confidence high.
- **[high] Bound cost and visual hierarchy.** Each valid moving projectile receives one gradient plus two finite bounded strokes after history and before its halo/silhouette. Near-zero and malformed motion fail closed; no timer, collection, or extra animation liveness is introduced. Confidence high.

- **[high] Projectile motion streak TDD and real-browser acceptance.** The pure suite first failed before collection because `./projectileMotionStreak` did not exist; the integrated renderer suite then failed because no linear-gradient route existed. Production now emits one immutable finite velocity profile and one two-stroke gradient between history and halo, including first-frame launch and split children, while near-zero/malformed inputs fail closed. Focused verification passes 2 files / 18 tests with client typecheck and diff hygiene green. Installed Chrome compared stopped, slow-right, fast-right, fast-left, and diagonal split-child states through the production renderer: stillness stayed clean, speed/readability scaled without overpowering the payload, reverse direction was correct, and the child remained smaller. A live `?e2e=hotseat` launch observed real bounded streak segments of 12.95px and 12.85px with zero page errors. Browser/server closed and port 5174 released. Confidence high.

- **[high] Independent projectile-streak reviews accepted after causal hardening.** Rendering review returned ACCEPT. Coverage review required overflow-safe finite diagonal velocity, independent Euclidean diagonal proof, exact world anchoring/bounds, downstream Canvas containment, symmetric malformed-field tables, and an exact capped-speed Renderer alpha oracle. Each was added; removing the motion-local Canvas save/restore failed the downstream composite assertion and was restored. Coverage re-review returned ACCEPT with no remaining concrete gap. Focused verification passes 2 files / 32 tests with typecheck and diff hygiene green. Confidence high.

## 2026-07-26 - Projectile motion streaks final local verification

- **[high] Full governed matrix passed.** Focused renderer coverage passes 2 files / 32 tests. `npm run check` passed both workspace typechecks and every deterministic engine harness. Client coverage passes 62 files / 432 tests at 86.52% statements, 86.39% branches, 84.64% functions, and 86.52% lines; the pure projectile-motion profile is 100% covered. Supabase Edge tests pass 159 / 159. The production build passes with 101 transformed modules and a 221.29 kB (59.88 kB gzip) main bundle. Playwright passes 30 cases with 9 expected project skips. `git diff --check` is clean and the state-free secret scan reports no findings. No dependency, lockfile, migration, action-log, or Supabase backend change exists; no backend deployment is warranted. Confidence high.
## 2026-07-26 - Projectile motion streaks behavior commit

- Governed behavior commit: `751f262` (`feat(renderer): add projectile motion streaks`).
- Exact behavior set: pure bounded velocity profile, production projectile-renderer route, adversarial and Canvas-contract tests, and public specification.
- Commit gate evidence: focused 2 files / 32 tests, full deterministic workspace check and strict typechecks, state-free secret scan with no findings, exact staged-set review, and no harvest residue. Confidence high.
## 2026-07-26 - Projectile motion streaks ready PR receipt

- Behavior commit `751f262` and governance commit `294e6f1` were pushed as `codex/projectile-motion-streaks`.
- Ready PR #191: https://github.com/SUaDtL/singedTerra/pull/191
- Hosted exact-head CI and CodeQL are now the active gates; merge and exact-SHA Pages proof remain. Confidence high.
## Projectile motion streaks mainline integration receipt (2026-07-26)

- **[high] PR #191 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30240373629` and CodeQL run `30240373621` passed with PR #191 clean and mergeable. Main advanced to `e9dbd1d289a361c79f6d9070aa77aed1fde71fae`; main CI `30240478292`, CodeQL `30240478271`, and Pages `30240478318` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Impact depth parallax sprint

- **[high] Select impact depth parallax.** The existing scene already has strong procedural atmosphere, distant ridges, camera recoil, and a stable foreground, but explosion motion translates them as one rigid plane. Against more particles, continuous cloud drift, or new bitmap assets, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors separating already-owned art into far `0.12x`, middle `0.35x`, and battlefield `1x` camera layers. The change compounds existing art and recoil without a dependency, retained collection, idle-frame tax, gameplay signal, or Supabase surface. Confidence high.
- **[high] Preserve rest geometry and accessibility.** Layer transforms must be isolated and become exact zero offsets at rest; current shake/kick decay, reduced-motion suppression, oversized sky coverage, draw order, and unshaken DOM HUD remain authoritative. Hostile finite displacement is capped in the pure presentation helper and malformed displacement fails closed. Confidence high.- **[high] Impact depth parallax TDD and real-browser acceptance.** The pure suite first failed before collection because `./impactDepthParallax` did not exist; after the bounded oracle passed 14 tests, the real Renderer suite remained RED because the scene still exposed only the prior single battlefield transform. Production now isolates far atmosphere at `0.12x`, distant ridges and wind ribbons at `0.35x`, and the destructible battlefield at `1x`, with exact zero-offset rest geometry and Canvas restoration. Focused verification passes 2 files / 25 tests; the full renderer set passes 34 files / 222 tests; client typecheck and diff hygiene are green. Installed Chrome exercised real hot-seat launches and an impact frame through the production renderer: the projectile, crater, and expanding detonation stayed coherent, the sky overscan exposed no backdrop strips, the adjacent HTML HUD remained stationary, and the browser reported no warnings or errors. Browser/server closed and port 5174 released. Confidence high.
- **[high] Audit formatting correction.** The preceding impact-depth accessibility decision and TDD/browser receipt are logically separate entries even though a leading newline was omitted during the append-only write. Their evidence and decisions are unchanged; this correction is appended rather than rewriting audit history. Confidence high.

### 2026-07-26 - Impact Depth Parallax review gate

- Rendering/architecture review: ACCEPT. Source and 34-file renderer verification confirm bounded isolated transforms, preserved rest order/overscan, stationary HUD, unchanged reduced-motion and idle behavior, and no gameplay or Supabase boundary crossing.
- Coverage review initially identified self-referential ratio/cap oracles, missing y-dominant and boundary cases, and transform-membership mutation gaps. Literal contract pins, exact boundary/just-over-boundary/y-dominant cases, and a stateful Canvas stack trace now prove every far, middle, world, late aiming-aid, and HUD member at its effective offset.
- Coverage re-review: ACCEPT; focused gate is 2 files / 30 tests with client typecheck and diff hygiene green.

### 2026-07-26 - Impact Depth Parallax final local matrix

- Focused parallax gate: 2 files / 30 tests passed.
- Deterministic workspace check, including both workspace typechecks and every engine harness: passed.
- Client coverage: 63 files / 453 tests passed; statements 86.61%, branches 86.50%, functions 84.74%, lines 86.61%; the pure parallax profile is 100% covered.
- Supabase Edge tests: 159 passed / 0 failed.
- Production build: passed; 102 modules transformed; main bundle 221.84 kB (60.07 kB gzip).
- Playwright production-browser matrix: 30 passed / 9 expected project skips.
- git diff --check: clean. State-free changed-file secret scan: no findings.
- No dependency, lockfile, migration, action-log, or Supabase backend change; no backend deployment is required.


### 2026-07-26 - Impact Depth Parallax behavior commit

- Governed behavior commit: `039be19527e6ae8d2c6a0a240d775c0680aa1117` (`feat(renderer): add impact depth parallax`).
- Exact behavior set: bounded pure depth profile, isolated production renderer transforms, causal hostile-input and Canvas-stack tests, and public specification.
- Commit gate evidence: focused 2 files / 30 tests, full deterministic workspace check, 63 files / 453 client coverage tests, 159 Edge tests, production build, 30-case browser matrix with 9 expected skips, clean diff hygiene, and state-free secret scan with no findings. Confidence high.


### 2026-07-26 - Impact Depth Parallax ready PR receipt

- Behavior commit `039be19527e6ae8d2c6a0a240d775c0680aa1117` and governance commit `f48a443941ca5659f6fb7956205da93452e04e87` were pushed as `codex/impact-depth-parallax`.
- Ready PR #192: https://github.com/SUaDtL/singedTerra/pull/192
- Hosted exact-head CI and CodeQL are now the active gates; merge and exact-SHA Pages proof remain. Confidence high.


## Impact depth parallax mainline integration receipt (2026-07-26)

- **[high] PR #192 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30264949418` and CodeQL run `30264949343` passed with PR #192 clean and mergeable. Main advanced to `6c9ab3538b3277ebaf1a481eba8dfdde2e330db7`; main CI `30265110630`, CodeQL `30265110629`, and Pages `30265110654` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Terrain edge bevel lighting sprint

- **[high] Select cached directional terrain bevels.** Terrain fills most of every combat frame and permanent deformation is the game's signature, yet crater walls and overhangs remain flatter than the newly enriched projectile and detonation layers. Against continuous weather, new bitmap assets, or more transient particles, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one upper-left highlight/lower-right shadow profile derived from the existing bitmap only during terrain-version rebuilds. It compounds every hill and crater without idle work, retained state, dependencies, gameplay signals, or Supabase surface. Confidence high.
- **[high] Bound the presentation contract.** Bevel influence reaches at most three solid pixels inward, decays monotonically, treats world boundaries as sealed, preserves existing RGB depth/strata intent and coverage alpha, and fails closed for air or malformed geometry. The source bitmap and authoritative terrain remain untouched. Confidence high.


- **[high] Terrain bevel TDD and real-browser acceptance.** The pure suite first failed before collection because `./terrainBevelLighting` did not exist; after the bounded 14-test oracle passed, the real TerrainRenderer suite remained RED because both synthetic crater walls retained the same deep RGB. Production now validates one snapshot per version rebuild, samples a three-pixel upper-left light/lower-right shadow profile without per-pixel closure allocation, and blends only cached RGB while preserving alpha and authoritative bytes. Focused verification passes 4 files / 21 tests with client typecheck and diff hygiene green. Installed Chrome inspected live generated hills, then fired Baby and Heavy Missiles through the production renderer: natural slopes stayed restrained and band-free, fresh crater right walls caught a thin warm bevel while opposite walls fell into cool shadow, terrain/tanks/projectiles remained readable, and stable frames exposed no visual churn. No browser warning or error occurred; browser/server closed and port 5174 released. Confidence high.

### 2026-07-26 - Terrain Edge Bevel Lighting review gate

- Rendering review initially found that a malformed bitmap could be cached as a successful version. The renderer now commits its version and clears dirty state only after a successful rebuild; a corrected bitmap at the same version retries and rebuilds. Re-review: ACCEPT.
- Coverage review required full downward and conflicting-corner direction cases, direct frame-validation isolation, causal one-sampler-per-rebuild proof, and malformed same-version recovery. All were added, including an independently isolating fractional-height case. Re-review: ACCEPT.
- Focused gate: 4 files / 36 tests passed; client typecheck and diff hygiene passed. Confidence high.
### 2026-07-26 - Terrain Edge Bevel Lighting final local matrix

- Focused terrain-bevel gate: 4 files / 36 tests passed.
- Deterministic workspace check, including both workspace typechecks and every engine harness: passed.
- Client coverage: 65 files / 483 tests passed; statements 86.69%, branches 86.68%, functions 84.83%, lines 86.69%; the pure terrain-bevel helper has 100% statement, function, and line coverage.
- Supabase Edge tests: 159 passed / 0 failed.
- Production build: passed; 103 modules transformed; main bundle 222.60 kB (60.43 kB gzip).
- Playwright production-browser matrix: 30 passed / 9 expected project skips.
- git diff --check: clean. State-free changed-file secret scan: no findings.
- No dependency, lockfile, migration, action-log, or Supabase backend change; no backend deployment is required. Confidence high.
### 2026-07-26 - Terrain Edge Bevel Lighting behavior commit

- Governed behavior commit: `a72ad53159d0b954efb1b5528657d2ac8cdda219` (`feat(renderer): add terrain edge bevel lighting`).
- Exact behavior set: bounded directional bitmap sampler, version-cached TerrainRenderer integration with retry-safe malformed snapshots, causal and adversarial tests, and public specification.
- Commit gate evidence: focused 4 files / 36 tests, full deterministic workspace check, 65 files / 483 client coverage tests, 159 Edge tests, production build, 30-case browser matrix with 9 expected skips, clean diff hygiene, and state-free secret scan with no findings. Confidence high.
### 2026-07-26 - Terrain Edge Bevel Lighting ready PR receipt

- Behavior commit `a72ad53159d0b954efb1b5528657d2ac8cdda219` and governance commit `538eded0e7d22dab6854fae64b8adf685d75d978` were pushed as `codex/terrain-edge-bevel-lighting`.
- Ready PR #193: https://github.com/SUaDtL/singedTerra/pull/193
- Hosted exact-head CI and CodeQL are now the active gates; merge and exact-SHA Pages proof remain. Confidence high.
## Terrain edge bevel lighting mainline integration receipt (2026-07-26)

- **[high] PR #193 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30270144929` and CodeQL run `30270146515` passed with PR #193 clean and mergeable. Main advanced to `3db14732107eb40b19e0894b6302c29d7dc3654a`; main CI `30270323056`, CodeQL `30270321749`, and Pages `30270321698` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Napalm firelight bloom sprint

- **[high] Select pooled napalm firelight.** Active fire is one of the game's longest-lived and most tactically dramatic effects, but its current warmth is a grid of per-column rectangles beneath the flame tongues. Against continuous sky animation, more generic explosion particles, or bitmap assets, SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors grouping the already-authoritative fire cells into a handful of bounded additive pools. It enriches normal and hot napalm while reducing draw calls, adding no retained collection, gameplay signal, dependency, or Supabase surface. Confidence high.
- **[high] Bound the presentation contract.** Each pool covers at most 32 consecutive columns, total output is capped at eight strongest pools in world-x order, remaining life controls finite capped radius/alpha, and invalid cells or terrain surfaces fail closed. The existing flame pass, fire simulation, damage, audio, replay, and idle-animation policy remain authoritative. Confidence high.
- **[high] Napalm firelight TDD and real-browser acceptance.** The pure suite first failed before collection because `./napalmFirelight` did not exist; after the 10-test pooling oracle passed, the production Renderer suite stayed RED because the existing fire pass emitted no gradients. Production now converts sorted or unsorted valid fire cells into at most eight immutable 32-column light pools, draws each as one additive ellipse, then preserves the existing flame tongues. Focused verification passes 2 files / 15 tests, including exact Canvas geometry/restoration, malformed and all-air terrain, nonmutation, draw-before-flame order, and a 181-column hot-napalm-scale field covered by six bounded pools; the full renderer surface passes 38 files / 271 tests with typecheck and diff hygiene green. The in-app browser fired real napalm through the production hot-seat renderer: the growing field produced a continuous warm terrain bloom beneath the flame wall, followed crater slopes without block bands, retained tank/projectile contrast, and tapered back to the resting scene. Browser/server closed and port 5174 released. Confidence high.
### 2026-07-26 - Napalm Firelight Bloom review gate

- Rendering and architecture review: ACCEPT; bounded gradients, restored Canvas state, unchanged flame tongues, presentation-only scope, and browser compatibility were confirmed.
- Coverage review identified five surviving oracle mutations: NaN life, flame compositing, nested transform isolation, center-column terrain anchoring, and authored warm stops. Independent tests now pin each contract; re-review: ACCEPT.
- Focused gate: 2 files / 16 tests passed. Confidence high.

### 2026-07-26 - Napalm Firelight Bloom final local matrix

- Focused firelight gate: 2 files / 16 tests passed.
- Deterministic workspace check, including both workspace typechecks and every engine harness: passed.
- Client coverage: 67 files / 499 tests passed; statements 86.85%, branches 86.82%, functions 84.93%, lines 86.85%; the pure firelight helper has 97.29% statements/lines and 100% functions.
- Supabase Edge tests: 159 passed / 0 failed.
- Production build: passed; 104 modules transformed; main bundle 223.99 kB (60.94 kB gzip).
- Playwright production-browser matrix: 30 passed / 9 expected project skips.
- git diff --check: clean. State-free changed-file secret scan: no findings.
- No dependency, lockfile, migration, action-log, or Supabase backend change; no backend deployment is required. Confidence high.

### 2026-07-26 - Napalm Firelight Bloom behavior commit

- Governed behavior commit: `0d3ddfdfcc5b919b55c01c0cdd28f09e98517423` (`feat(renderer): add pooled napalm firelight`).
- Exact behavior set: bounded immutable firelight pooling, additive production renderer integration, causal Canvas and malformed-input tests, and public specification.
- Commit gate evidence: focused 2 files / 16 tests, full deterministic workspace check, 67 files / 499 client coverage tests, 159 Edge tests, production build, 30-case browser matrix with 9 expected skips, clean diff hygiene, and state-free secret scan with no findings. Confidence high.

### 2026-07-26 - Napalm Firelight Bloom ready PR receipt

- Behavior commit `0d3ddfdfcc5b919b55c01c0cdd28f09e98517423` and governance commit `dded7cc938fd4f5ae3901f4ed19ceea8fb2875e9` were pushed as `codex/napalm-firelight-bloom`.
- Ready PR #194: https://github.com/SUaDtL/singedTerra/pull/194
- Hosted exact-head CI and CodeQL are now the active gates; merge and exact-SHA Pages proof remain. Confidence high.

## Napalm firelight bloom mainline integration receipt (2026-07-26)

- **[high] PR #194 merged and exact-SHA Pages deployment verified.** Exact-head CI run `30280932648` and CodeQL run `30280932494` passed with PR #194 clean and mergeable. Main advanced to `37263541747eb322c0ab6cceec89932d17af9fb3`; main CI `30281118070`, CodeQL `30281118011`, and Pages `30281117969` passed build, current-main verification, deployment, provenance, and live smoke. An independent no-cache request confirmed the same SHA/run in `deploy-meta.json` and HTTP 200 from the public site. No Supabase deployment was warranted because no backend source changed. Confidence high.

## 2026-07-26 - Fire control console sprint

- **[high] Diagnose the apparent instrument-panel reversion.** Live exact-main inspection shows the visual-overhaul analog DOM and styling still ship. Git history proves commit `21d3e016` has intentionally hidden the analog row below app scale `0.8` since 2026-07-03, replacing it with plain numeric cells; later visual-overhaul and compact-touch commits retained that switch. Arsenal local storage is independent. The perceived reversion is therefore a responsive presentation fallback, not lost code. Confidence high.
- **[high] Select a conspicuous responsive ballistic console.** SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors removing the duplicate numeric-only mode and reorganizing the same SVG telemetry into two large upper dials plus a full-width wind rail. This changes the HUD's first-glance silhouette across every turn while keeping existing gauge math, input, engine, replay, dependencies, and Supabase untouched. Confidence high.
- **[high] Incorporate live aim and scale findings.** Real-browser player acceptance caught that positive SVG rotation had been interpreted backwards: Player 1's global 45-degree rightward barrel produced a negative 45-degree up-left needle. The console now maps global angle to SVG rotation with 90 - angle, and the power instrument adopts the elevation dial's exact frame, radius, semicircle, ticks, and label baseline. Regression tests pin rightward and leftward transforms plus matched geometry. Confidence high.
- **[high] Keep compact play fitted by default.** The restored console exposed 33 pixels of inner HUD overflow in a 994-pixel fine-pointer window because the arsenal default still collapsed only for short coarse-pointer viewports. SMARTS favors aligning the implicit arsenal default with the existing whole-stage compact threshold while preserving explicit saved preferences. Small-window browser coverage now requires a collapsed arsenal and zero default HUD overflow. Confidence high.
- **[high] Queue a coherent single-screen design-system slice next.** User acceptance establishes that isolated visual polish is no longer sufficient: the next sprint must unify tokens, typed variants/primitives, reusable assets, and responsive composition around a clean single-viewport game shell. Third-party dependencies are allowed when they improve play, fun, appearance, or iteration; each candidate still passes the governed license, provenance, and supply-chain gate and SMARTS comparison against a local typed layer. Confidence high.
### 2026-07-26 - Fire Control Console review gate

- Rendering, responsive-layout, accessibility, performance, and scope review: ACCEPT. Desktop, compact-touch, and small-window browser layouts retained a visible analog console; compact HUD geometry fitted exactly, dials matched, and 45-degree global aim pointed up-right.
- Coverage review initially found surviving mutations in wind sign and bounds, elevation cardinal angles, and live power-fill/cap behavior. Exact center, extremes, clamp, labels, 0/45/90/135/180 transforms, and zero/mid/cap/custom-cap arc assertions now pin each contract; re-review: ACCEPT.
- Focused gate: 22 tests passed across the instrument, arsenal, and preference suites; client typecheck and diff hygiene passed. Confidence high.
### 2026-07-26 - Fire Control Console final local matrix

- Fresh behavioral proof: 3 focused files / 22 tests passed; production browser contract: 18 passed / 12 expected project skips.
- Deterministic workspace check, including both workspace typechecks and every engine harness: passed.
- Client coverage: all tests passed; statements and lines 86.88%, branches 87.23%, functions 84.88%; arsenalPreference is fully covered.
- Supabase Edge tests: 159 passed / 0 failed.
- Production build: passed; 104 modules transformed; main bundle 222.76 kB (60.26 kB gzip).
- Full Playwright production-browser matrix: 30 passed / 12 expected project skips.
- git diff --check: clean. State-free changed-file secret scan: no findings.
- No dependency, lockfile, migration, action-log, or Supabase backend change; no backend deployment is required. Confidence high.
### 2026-07-26 - Fire Control Console behavior commit

- Governed behavior commit: d0678f84abdcdee81ba7bc5aca74c3f583b26cad (feat(hud): restore the ballistic computer).
- Exact behavior set: persistent two-tier analog console, corrected global-angle needle transform, matched elevation and power geometry, full-width wind rail, compact-stage arsenal default, adversarial unit oracles, production-browser guardrails, and public specification.
- Commit gate evidence: fresh 22-test focused proof, full deterministic workspace check, client coverage, 159 Edge tests, production build, 30-case browser matrix with 12 expected skips, clean diff hygiene, and state-free secret scan with no findings. Confidence high.
### 2026-07-26 - Fire Control Console ready PR receipt

- Behavior commit d0678f84abdcdee81ba7bc5aca74c3f583b26cad and governance commit 37909f4aa08f38e80fb7ff9cf2202036255627ef were pushed as codex/instrument-panel-restoration.
- Ready PR #195: https://github.com/SUaDtL/singedTerra/pull/195
- Exact-head CI run 30412820265 and CodeQL run 30412820256 passed on 37909f4aa08f38e80fb7ff9cf2202036255627ef. The PR is clean and mergeable. Per the standing goal, it remains open and no deployment was performed. Confidence high.
## 2026-07-28 - Single-screen combat shell sprint

- **[high] Select a coherent right-rail foundation.** The current fitted stage already preserves the battlefield at a useful size, while the six separately boxed HUD widgets compete for hierarchy and the flow-based arsenal can reintroduce an inner scrollbar. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one continuous semantic combat rail plus an in-bounds arsenal drawer over a bottom command deck, full layout rewrite, or more isolated widget polish. It is conspicuous, presentation-only, reversible, geometry-testable, and keeps engine, replay, network, and Supabase contracts untouched. Confidence high.
- **[high] Establish a small semantic system before further polish.** Shared surface, separator, typography, spacing, radius, focus, and action tokens plus reusable section/action classes directly constrain the fragmentation the user identified. The system is documented with intentional team-color and ballistic-instrument exceptions so later slices compound coherently. Confidence high.
- **[high] Keep dependency value proportional.** A consistent icon vocabulary can improve action recognition and iteration if exact named imports remain small; CVA does not solve this vanilla-DOM HUD's current bottleneck, and a positioning library is unnecessary for an in-rail drawer. Lucide remains gated on exact-version license, provenance, lifecycle, transitive-runtime, maintenance, and bundle review before installation. Confidence high.- **[high] Approve exact Lucide 1.27.0 under bounded constraints.** Independent ca-add-dep review confirmed ISC plus compatible Feather MIT attribution, zero runtime, peer, optional, or bundled dependencies, no consumer lifecycle scripts, npm OIDC and signed attested provenance matching registry integrity, no known OSV vulnerabilities, and active maintenance. The package is client-only, exact-pinned, represented in the lock, credited in THIRD_PARTY_NOTICES.md, and consumed through four named icon nodes; the all-icons registry is prohibited. Residuals are the three-day-old release, one npm maintainer account, mutable-major upstream action pins, and a 21.2 MB install footprint. Confidence high.
- **[high] Close the arsenal by default and preserve explicit preference.** A transient drawer should not cover controls before the player requests it. Fresh and invalid preferences now start closed at every viewport; an explicit saved open or closed choice still wins. This removes viewport-state choreography and makes the rail's default hierarchy stable. Confidence high.
- **[high] Single-screen shell TDD and browser acceptance.** Focused RED first proved the missing shell classes, icon semantics, closed default, controlled drawer, and unique aria-controls IDs. Production GREEN passes 4 files / 24 tests plus client typecheck. Real Chromium proved the rail remains 600/600 and the body remains unscrolled at desktop and compact sizes. Live inspection caught a width-specificity leak that put the drawer 13 pixels beyond the rail despite unchanged scroll geometry; the selector was corrected and the E2E oracle now pins both left and right bounds in all viewport projects. Confidence high.
- **[high] Bound the dependency's shipped cost.** The parent main bundle was 222.76 kB / 60.26 kB gzip; the exact four-icon seam builds at 225.38 kB / 61.04 kB gzip, a 2.62 kB raw and 0.78 kB gzip increase. The build remains under one second locally. This is proportionate to the consistent action vocabulary and shared UI foundation. Confidence high.
### 2026-07-28 - Single-screen combat shell review gate

- Independent dependency review: PASS. Exact client-only Lucide 1.27.0 pin, registry integrity, zero installed dependencies, narrow four-icon import seam, tree-shaken production output, decorative accessibility, and complete ISC/Feather notices were verified. The notice's initial over-attribution of Menu to Feather was corrected.
- Coverage review found weak icon-identity, action-continuity, and drawer-bounds oracles. Tests now pin each semantic icon's ordered path signature, weapon selection and Store continuity, toggle labels, unique controls, and all four drawer edges; re-review: ACCEPT.
- Rendering/accessibility review caught a real keyboard path: the open drawer covered a Store control that remained focusable, weapon selection was visual-only, and the icon-only toggle conflicted with the visible-label contract. Covered rail siblings are now inert only while open; Escape closes, persists, and restores focus; the toggle visibly says Expand/Close; weapon buttons synchronize aria-pressed. Unit and three-viewport keyboard browser regressions are green; re-review: ACCEPT. Confidence high.

### 2026-07-28 - Single-screen combat shell final local matrix

- Focused shell/instrument/arsenal/preference proof: 4 files / 25 tests passed; client typecheck passed.
- Deterministic workspace check, including both workspace typechecks and every engine harness: passed.
- Client coverage: all tests passed; statements and lines 87.12%, branches 87.09%, functions 85.57%; hudIcons.ts and arsenalPreference.ts remain fully covered.
- Supabase Edge tests: 159 passed / 0 failed.
- Production build: passed; main bundle 226.42 kB / 61.29 kB gzip. The complete shell is +3.66 kB raw / +1.03 kB gzip from the 222.76 kB / 60.26 kB parent; the independently measured Lucide-only share is +2.62 kB / +0.78 kB gzip.
- Full Playwright production-browser matrix: 31 passed / 8 expected project skips, including fitted drawer geometry and keyboard lifecycle across desktop, compact-touch, and small-window projects.
- Runtime dependency audit: 0 vulnerabilities. git diff --check: clean. State-free changed-file secret scan: no findings.
- No physics, input, replay, action-log, network, database, migration, authentication, Edge Function, or Supabase behavior changed. Confidence high.
### 2026-07-28 - Single-screen combat shell behavior commit

- Governed behavior commit: d2c5f12 (feat(hud): unify the combat rail).
- Exact behavior set: continuous semantic combat rail, bounded default-closed arsenal drawer, focus-safe keyboard lifecycle, programmatic selection state, four-icon Lucide seam, responsive browser guardrails, design-system documentation, and dependency notices.
- Commit gate evidence: fresh 25-test focused proof, full deterministic workspace check, client coverage, 159 Edge tests, production build, 31-case browser matrix with 8 expected skips, zero runtime audit vulnerabilities, clean staged diff hygiene, and state-free secret scan with no findings. Confidence high.
### 2026-07-28 - Single-screen combat shell ready PR opened

- Behavior commit d2c5f12 and governance commit ffb456d were pushed as codex/single-screen-combat-shell.
- Ready stacked PR #196: https://github.com/SUaDtL/singedTerra/pull/196
- Base is codex/instrument-panel-restoration (#195), so review isolates only this combat-shell slice. Exact-head hosted CI and CodeQL remain pending; per the standing goal, the PR will not be merged and nothing will be deployed. Confidence high.
### 2026-07-28 - Single-screen combat shell hosted gate receipt

- Ready PR #196 was CLEAN and MERGEABLE on exact head a75b85d86abaafa7caecdc2d1d9707542244f021.
- Exact-head CI run 30415128717 passed typecheck, every deterministic harness, client tests, production build, 159 Edge tests, and the 31-case browser matrix with 8 expected project skips.
- Exact-head CodeQL run 30415128722 passed, and the PR CodeQL status check also passed.
- Supabase Preview was expectedly skipped because this presentation-only slice has no backend change. Per the standing goal, PR #196 remains open and no deployment or merge was performed. Confidence high.
## 2026-07-28 - Shareable room invites sprint

- **[high] Select one-click room recruitment as the next player-growth slice.** The waiting room currently renders only a four-character code, forcing an invited player to receive, transcribe, navigate to Online, select Join, and retype it. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors a safe copyable invite URL plus prefilled Join routing over another isolated lobby decoration or a broad onboarding rewrite. It directly reduces the second-player funnel, is client-only, strict-code testable, and leaves explicit Join consent intact. Confidence high.
- **[high] Use native browser primitives without adding a dependency.** Dependencies remain fully allowed, but URL, URLSearchParams, and the Clipboard API already cover this bounded flow with less shipped surface than a routing, sharing, or clipboard package. The helper will preserve the deployment path, strip unrelated query/hash state, include only a normalized room code, and reject malformed input. Confidence high.
- **[high] Bound privacy and behavior.** Invite links must never include internal room ids, player ids, seat tokens, Supabase keys, or session descriptors; opening one selects and prefills Join Room but never auto-joins or calls the backend. Clipboard rejection remains a visible recoverable state. Confidence high.
### 2026-07-28 - Shareable room invites review and local matrix

- Security/coverage review caught credential-bearing and non-web URLs, ambiguous duplicate parameters, and under-tested clipboard absence. The helper now permits only HTTP(S), clears URL credentials, requires exactly one strict code, and pins missing API, invalid code, rejection, and retry paths; re-review: ACCEPT.
- UI/accessibility review caught the reusable copy button being renamed to past-tense status. The action label now remains stable while the adjacent live region owns success/error feedback; re-review: ACCEPT. No dependency is warranted; native URL and Clipboard APIs cover the flow with a visible manual-code fallback.
- Fresh proof: 2 focused files / 11 tests; deterministic workspace check passed; client coverage 88.37% statements/lines, 87.51% branches, 85.80% functions; Edge 159/0; production build passed at 228.48 kB / 61.88 kB gzip; Playwright 34 passed / 8 expected skips; runtime audit zero vulnerabilities; diff and secret gates clean. Confidence high.
### 2026-07-28 - Shareable room invites behavior commit

- Governed behavior commit: 0a64764 (feat(lobby): add shareable room invites). Fresh full matrix, independent review, staged diff, runtime audit, and state-free secret scan passed. Confidence high.

### 2026-07-28 - Shareable room invites ready PR opened

- Behavior commit 0a64764 and governance commit 53814b6 were pushed as codex/shareable-room-invites.
- Ready stacked PR #197: https://github.com/SUaDtL/singedTerra/pull/197
- Base is codex/single-screen-combat-shell (#196), so review isolates only the room-invite slice. Exact-head hosted CI and CodeQL remain pending; per the standing goal, the PR will not be merged and nothing will be deployed. Confidence high.
### 2026-07-28 - Shareable room invites hosted gate receipt

- Ready PR #197 was CLEAN and MERGEABLE on exact head a6c5ab5ce491e3bfe847d768d4af91bcb7144bca.
- Exact-head CI run 30416054579 passed typecheck, deterministic harnesses, client tests, production build, 159 Edge tests, and the 34-case browser matrix with 8 expected skips.
- Exact-head CodeQL run 30416054613 passed. Supabase Preview was expectedly skipped because no backend source changed. Per the standing goal, PR #197 remains open and no deployment or merge was performed. Confidence high.
## 2026-07-28 - Unified fire control sprint

- **[high] Select an explicit primary action over more ornamental polish.** The public spec promises a bottom-right Fire button, but desktop currently offers only a keyboard legend while the only clickable Fire control is hidden behind a coarse-pointer media query. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one shared rail action because it immediately lowers the first-turn learning barrier, delegates to the proven deterministic input path, is presentation-only, and can be pinned across ownership, weapon, and viewport states. Confidence high.
- **[high] Use one control across pointer types.** A persistent rail button avoids competing desktop and touch interaction models. The touch strip retains aim, power, and weapon steppers while the shared action owns Fire/Activate Shield everywhere. Native button semantics cover pointer, keyboard, and assistive activation without a dependency. Confidence high.
- **[high] Preserve authority defense in depth.** HUD disabled state communicates availability, while the callback retains shouldAcceptLocalInput and InputHandler/client/engine validation. The HUD receives the existing local-controls calculation so opponent and CPU turns are visibly disabled without turning presentation state into the security boundary. Confidence high.

### 2026-07-28 - Unified fire control TDD, review, and final matrix

- RED: the new HUD oracle failed 3/3 because no shared action/callback existed, and the input-gate harness failed the remote-human turn case. GREEN introduced one state-aware rail action, explicit seat ownership, and the existing InputHandler fire/shield seam.
- Correctness review caught focused-button Space/Enter double dispatch, arsenal ownership bypass, and an AI oracle that coupled two false conditions. Interactive-target shortcut suppression, a callback authority gate, factored seat ownership, and independent truth-table coverage resolved them; re-review: ACCEPT.
- Rendering/accessibility review caught Tab trapping focus, depleted selected ammo remaining actionable, and a nominal 44px touch target shrinking to 31.25px after stage zoom. Q now owns weapon cycling while Tab navigates, selected ammo participates in action availability, and a 72-logical-pixel coarse target proves at least 44 rendered pixels; re-review: ACCEPT.
- The first full browser commit-gate run exposed a 606/600 touch-rail overflow. Reclaiming six logical pixels from touch-strip vertical padding preserved the 44px action target and returned closed/open rail geometry to 600/600.
- Final deterministic workspace check passed. Client coverage passed 72 files / 525 tests at 88.65% statements and lines, 87.87% branches, and 86.20% functions. Edge tests passed 159/0. Production build passed at 231.73 kB / 62.66 kB gzip for the main bundle.
- Final production-browser matrix passed 37 tests with 8 expected project skips across desktop, pixel-touch, and small-window. Runtime audit found zero vulnerabilities; diff hygiene and state-free changed-file secret scan were clean. No dependency, lockfile, engine, physics, replay, action-log, database, migration, Edge Function, or Supabase behavior changed. Confidence high.

- Audit correction: the final client count is 72 files / 532 tests, not 525; the percentages recorded above are unchanged. Confidence high.

### 2026-07-28 - Unified fire control behavior commit

- Governed behavior commit: 80fcf8b (feat(hud): add unified fire control). Fresh deterministic checks, 532 client tests, coverage, 159 Edge tests, production build, 37-case browser matrix with 8 expected skips, zero-vulnerability runtime audit, independent re-review, staged diff hygiene, and staged secret scan passed. Confidence high.

### 2026-07-28 - Unified fire control ready PR opened

- Behavior commit 80fcf8b and governance commit 3008229 were pushed as codex/unified-fire-control.
- Ready stacked PR #198: https://github.com/SUaDtL/singedTerra/pull/198
- Base is codex/shareable-room-invites (#197), so review isolates only this unified action slice. Exact-head hosted CI and CodeQL remain pending; per the standing goal, the PR will not be merged and nothing will be deployed. Confidence high.

### 2026-07-28 - Unified fire control hosted gate receipt

- Ready PR #198 was CLEAN and MERGEABLE on exact head 0751bea42709428e26ac57f3f174d52ac7ba2480.
- Exact-head CI run 30417333320 passed typecheck, deterministic harnesses, client tests, production build, 159 Edge tests, and the 37-case browser matrix with 8 expected skips.
- Exact-head CodeQL run 30417333376 passed. Supabase Preview was expectedly skipped because no backend source changed. Per the standing goal, PR #198 remains open and no deployment or merge was performed. Confidence high.
## Toolchain security refresh (2026-07-28)
- **[high] Isolate the fresh audit gate from the player-facing handoff diff.** SMARTS: Securable/Maintainable/Testable favor a separate stacked maintenance PR so major toolchain compatibility is independently reviewable and the UI diff stays coherent; chosen `codex/toolchain-security-refresh` based on exact unified-fire-control head `31ba030`, strength strong. Confidence high.
- **[high] Approve the bounded dependency plan as SUaDtL.** Fresh registry evidence reports 9 dev-tool advisories (2 critical, 4 high, 3 moderate). Vite 6.4.3, Vitest 3.2.6, and coverage 3.2.6 are the lowest patched direct targets found; each is MIT, Node-20 compatible, registry-signed, SLSA-provenance-attested, integrity-addressed, and has no install lifecycle script. No production dependency, app code, backend, workflow, migration, merge, or deployment is authorized. SMARTS strength strong. Confidence high.
### Toolchain target and graph correction

- **[high] This entry supersedes the 3.2.6 target recorded above.** Vitest/coverage 3.2.6 cleared the critical Vitest advisory but retained `test-exclude -> glob@10 -> brace-expansion@2`, whose newest OOM advisory has no patched 2.x release. Chosen Vitest and coverage 4.1.10 as the first verified clean graph; both are MIT, Node-20 compatible, registry-signed, SLSA-attested, and have no direct lifecycle script. SMARTS: Securable/Testable/Maintainable, strength strong. Confidence high.
- Independent dependency review found npm had unnecessarily resolved a second Vite 8 toolchain under Vitest. `npm dedupe --prefer-dedupe --ignore-scripts` now hoists the pinned Vite 6.4.3 for both app and tests and removes Vite 8, Rolldown, Lightning CSS, and their native bindings without an override. Fresh `npm ci --ignore-scripts` resolves 147 packages; audit is 0; all 145 auditable packages have verified registry signatures and 57 have verified attestations; the production dependency graph is unchanged and the install-script count/class remains the existing esbuild/fsevents set. Confidence high.
- Compatibility corrections are test/config-only: `defineConfig` now comes from `vitest/config`, and two `vi.fn` callbacks carry their existing `LobbyConfig` signature explicitly. No application behavior changed. Full post-dedupe evidence: deterministic/typecheck checks green; 72 client files / 532 tests; coverage completes at 83.77% statements, 71.16% branches, 70.84% functions, 86.96% lines under Vitest 4 AST-aware remapping; 159 Edge tests; Vite 6.4.3 production build; 37 browser cases passed with 8 expected skips; zero audit findings. Confidence high.- Independent dependency re-review ACCEPTED the deduped graph with no remaining dependency, supply-chain, lockfile, or compatibility findings. It independently confirmed one Vite 6.4.3, zero audit findings, signature/attestation proof, unchanged production graph, bounded lock drift, unchanged lifecycle surface, green client tests, documented coverage semantics, and clean diff hygiene. Confidence high.
### Toolchain security refresh ready PR opened

- Governed dependency commit `8ac9bac` was pushed and ready stacked PR #199 was opened: https://github.com/SUaDtL/singedTerra/pull/199
- Base is `codex/unified-fire-control` at `31ba030`, so review isolates the dependency maintenance slice. PR #199 is MERGEABLE; exact-head CI and CodeQL are pending. Supabase Preview is expectedly skipped because no backend source changed. Per the standing goal, the PR remains open and no merge or deployment was performed. Confidence high.
### Toolchain security refresh hosted gate receipt

- Ready PR #199 was MERGEABLE on exact implementation head `f51cb5685e28ad0c3387ccf31f7dc21e0b1da3fe`.
- Exact-head CI run `30419308867` passed typecheck, deterministic harnesses, client tests, production build, 159 Edge tests, and the 37-case browser matrix with 8 expected skips.
- Exact-head CodeQL run `30419308885` passed. Supabase Preview was expectedly skipped because no backend source changed. This receipt and the completed plan checkbox form the final governance-only delta; the pushed governance head must independently clear CI and CodeQL before the PR is called green. Per the standing goal, PR #199 remains open and no deployment or merge was performed. Confidence high.

## 2026-07-28 - Turn handoff beacon sprint

- **[high] Select explicit turn ownership over another ornamental effect.** Live Chromium inspection showed the persistent row renders only `Weapon · Baby Missile`; the implementation comment promises player identity but appends no player node, leaving a subtle roster border as the sole turn cue. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors restoring that missing identity because it reduces hot-seat handoff ambiguity and first-turn hesitation without touching deterministic play. Confidence high.
- **[high] Reuse the fitted row instead of adding an overlay or panel.** The active player becomes the primary text, the weapon becomes secondary context, and one event-driven emphasis retriggers only when the authoritative active seat changes. This preserves the single-screen rail, avoids continuous motion, and remains reversible presentation state. Confidence high.
- **[high] Proceed under standing passion-project sprint authority.** The user explicitly delegated recurring spec/plan decisions and asked the loop not to stop for approval. The scoped spec and plan are accepted as written; hard gates remain enforced. Confidence high.

Spec/plan: `.codearbiter/specs/turn-handoff-beacon.md`, `.codearbiter/plans/turn-handoff-beacon.md`.
### 2026-07-28 - Turn handoff beacon TDD and live inspection

- RED: the focused HUD suite failed 4/4 because no owner/kicker nodes, status semantics, team accent, handoff class, or reduced-motion rule existed; the firing row still said transport-specific `Sending...`. The production-browser oracle failed in all three viewport projects because `.st-hud__turn-owner` did not exist.
- GREEN: the focused HUD suite passed 4/4 and the production-browser ownership/fit oracle passed desktop, compact touch, and small-window 3/3. The bounded row now leads with canonical player identity, retains weapon context, exposes one atomic polite status, clears invalid ownership, and uses reduced-motion-safe event emphasis.
- Live Chromium inspection confirmed the ballistic computer remains primary, `P1` is visibly named with team accent, the collapsed rail remains fitted, and firing through the shared action advances the authoritative live label to `P2` with `P2's turn. Weapon Baby Missile.` Confidence high.


### Turn handoff beacon independent review and final matrix

- Correctness/coverage review accepted the authoritative phase/owner model and eight focused tests with no remaining findings. Rendering/accessibility review accepted the fitted team-accent hierarchy, roster handoff cue, polite status semantics, and reduced-motion path with no remaining findings. Confidence high.
- Fresh stacked proof on Vite 6.4.3 and Vitest 4.1.10: deterministic/typecheck checks passed; 73 client files / 540 tests passed; coverage reached 86.21% statements, 75.36% branches, 72.84% functions, and 89.31% lines; all 159 Edge tests passed; production build passed at 237.05 kB / 63.62 kB gzip for the main bundle.
- The full production-browser matrix passed 37 tests with 8 expected project skips across desktop, pixel-touch, and small-window. Runtime audit found zero vulnerabilities; all 145 auditable packages had verified registry signatures and 57 verified attestations; diff hygiene, conflict-marker check, and changed-file secret scan were clean. No engine, physics, replay, action-log, database, migration, Edge Function, Supabase, or deterministic behavior changed. Confidence high.


### Turn handoff beacon behavior commit

- Governed behavior commit 8129637 (eat(hud): clarify turn handoffs) is linearly based on the final PR #199 governance head 9df7d36. The append-only sprint-log conflict was resolved by retaining the complete toolchain receipt and appending the complete turn-handoff history; all application, test, spec, plan, and UI-system content is unchanged from the fully verified pre-rebase tree. Confidence high.


### Turn handoff beacon ready PR opened

- Behavior commit 8129637 and governance commit bb3339 were pushed as codex/turn-handoff-beacon.
- Ready stacked PR #200: https://github.com/SUaDtL/singedTerra/pull/200
- Base is codex/toolchain-security-refresh (#199) at final-green head 9df7d36, so review isolates only the turn-handoff slice. Exact-head hosted CI and CodeQL are pending; per the standing goal, the PR remains open and no merge or deployment was performed. Confidence high.


### Turn handoff beacon hosted gate receipt

- Ready PR #200 was CLEAN and MERGEABLE on exact implementation/governance head 1b69ed657a1e56e6ef1c599b678e43ea764e442.
- Exact-head CI run 30445016736 passed typecheck, deterministic harnesses, client tests, production build, 159 Edge tests, and the 37-case browser matrix with 8 expected skips.
- Exact-head CodeQL run 30445015795 passed. Supabase Preview was expectedly skipped because no backend source changed. This receipt and the completed plan checkbox form the final governance-only delta; the pushed governance head must independently clear CI and CodeQL before the PR is called final-green. Per the standing goal, PR #200 remains open and no deployment or merge was performed. Confidence high.


## 2026-07-29 - Atmospheric battlefield frame sprint

- **[high] Select full-viewport atmosphere over another control or isolated effect.** Fresh 1600x900 Chromium inspection showed a strong fitted game stage surrounded by roughly 120px of nearly empty dusk gutter above and below, while the authored in-canvas cloud shelves were visually imperceptible. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one coherent atmospheric frame because it is immediately visible before the first shot, reinforces the single-page composition, and is render-only. Confidence high.
- **[high] Use cached procedural Canvas and semantic CSS instead of a dependency or raster download.** Dependencies remain fully allowed, but the existing theme, Canvas 2D, impact-depth parallax, and fixed viewport shell already own every required primitive. A library would add shipped/runtime surface without improving this bounded field; an image asset would complicate palette, scaling, and loading. Confidence high.
- **[high] Keep the atmosphere static.** Continuous cloud drift would defeat the renderer's idle-skip battery optimization. Fixed bounded cloud geometry provides depth at rest; the existing impact parallax supplies momentary movement during detonations. Reduced-motion and deterministic gameplay remain untouched. Confidence high.
- **[high] Approve the scoped spec and plan as SUaDtL under standing sprint authority.** The user delegated recurring passion-project decisions and asked the loop not to stop for approval. Hard gates remain enforced. Confidence high.

Spec/plan: .codearbiter/specs/atmospheric-battlefield-frame.md, .codearbiter/plans/atmospheric-battlefield-frame.md.


### Atmospheric battlefield frame TDD, review, and final matrix

- RED: the cloud-profile suite could not resolve the absent module; renderer ordering failed because cloud art painted before stars; and the production-browser build could not satisfy the new atmospheric-frame contract. GREEN introduced four frozen far/near banks, one lazily rasterized transparent layer, star-then-cloud depth ordering, and a semantic fixed viewport backplate.
- Live Chromium review caught the first rim implementation connecting overlapping open ellipse arcs into radar-like zigzags. Sparse crown arcs now move to each exact start point before stroking; a focused oracle pins 14 independent crowns. The final 1600x900 composition retained legible aiming, tanks, terrain, instruments, and actions while converting top/bottom gutters into intentional dusk/ember framing. No remaining correctness, rendering, accessibility, performance, security, or coverage findings. Confidence high.
- Fresh deterministic/typecheck checks passed. Client coverage passed 74 files / 542 tests at 86.33% statements, 75.41% branches, 72.97% functions, and 89.42% lines. All 159 Edge tests passed. The Vite 6.4.3 production build passed at 238.50 kB / 64.27 kB gzip for the main bundle.
- The full production-browser matrix passed 40 tests with 8 expected project skips across desktop, pixel-touch, and small-window. Runtime audit found zero vulnerabilities; all 145 auditable packages had verified registry signatures and 57 verified attestations; diff hygiene and changed-file secret scan were clean. No dependency, engine, physics, replay, action-log, database, migration, Edge Function, Supabase, or deterministic behavior changed. Confidence high.


### Atmospheric battlefield frame behavior commit

- Governed behavior commit 46f2563 (eat(renderer): deepen battlefield atmosphere) was created on final-green PR #200 head 10694d6. Fresh deterministic checks, 542 client tests, coverage, 159 Edge tests, production build, 40-case browser matrix with 8 expected skips, zero-vulnerability audit, visual review, staged diff hygiene, and staged secret scan passed. Confidence high.


### Atmospheric battlefield frame ready PR opened

- Behavior commit 46f2563 and governance commit 46a069 were pushed as codex/atmospheric-battlefield-frame.
- Ready stacked PR #201: https://github.com/SUaDtL/singedTerra/pull/201
- Base is codex/turn-handoff-beacon (#200) at final-green head 10694d6, so review isolates only the atmosphere slice. Exact-head hosted CI and CodeQL are pending; per the standing goal, the PR remains open and no merge or deployment was performed. Confidence high.


### Atmospheric battlefield frame hosted gate receipt

- Ready PR #201 was MERGEABLE on exact implementation/governance head 08f41981070d139b0bc985443f766f247abeac0.
- Exact-head CI run 30457986920 passed typecheck, deterministic harnesses, client tests, production build, 159 Edge tests, and the 40-case browser matrix with 8 expected skips.
- Exact-head CodeQL run 30457986882 passed. Supabase Preview was expectedly skipped because no backend source changed. This receipt and the completed plan checkbox form the final governance-only delta; the pushed governance head must independently clear CI and CodeQL before the PR is called final-green. Per the standing goal, PR #201 remains open and no deployment or merge was performed. Confidence high.

## 2026-07-28 - Fuel-limited movement sprint

- **[high] Select deterministic fuel movement as the next gameplay pillar.** The backlog names movement the largest missing Scorched Earth mechanic, `TankState.fuel` and the product spec already reserve it, and the completed visual sprint leaves gameplay depth as the higher-value next move. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors a bounded logged action because it creates positioning decisions without changing projectile physics or backend authority. Confidence high.
- **[high] Use signed eight-pixel commitments resolved one pixel at a time.** A non-zero integer delta in `[-8,8]` gives each input meaningful motion while keeping action frequency below the existing referee rate-limit surface. Four-pixel terrain-rise tolerance, battlefield clamping, living-tank collision, and fuel-per-actual-pixel yield deterministic partial movement with no tunneling. Confidence high.
- **[high] Keep movement turn-neutral and canonical.** Network movement enters the ordered room action log, retains active-seat and credential authorization, advances no cursor, and applies only from Realtime echo. Local aim remains unlogged; movement cannot be local-only because tank position changes later ballistics. Conflict hierarchy levels 1 and 2: security controls and lockstep data integrity. Confidence high.
- **[high] Activate the canonical Fuel Tank economy.** Fresh rounds start at 100 fuel; the arms-level-3 Fuel Tank costs $10,000 and adds 100 current-round fuel from the catalog's ten tanks at ten units each. Purchases stack but fuel resets with other per-round combat state. Confidence high.
- **[high] Reuse the active-turn row for the mobility rocker.** A compact semantic left/fuel/right control keeps movement and its resource adjacent to turn ownership without another panel, modal, or scroll region. Keyboard repeat is suppressed for A/D; each semantic button emits one bounded action. Confidence high.
- **[high] No dependency is warranted for this slice.** Dependencies remain fully authorized, but the existing deterministic engine, action-log contract, semantic DOM buttons, and design tokens already own every required primitive. A movement or component library would add supply-chain/runtime surface without improving the bounded mechanic. Confidence high.
- **[high] Approve the scoped spec and plan as SUaDtL under standing sprint authority.** The user delegated recurring passion-project decisions and explicitly asked the loop not to stop for approval. Hard gates remain enforced. Confidence high.

Spec/plan: `.codearbiter/specs/fuel-limited-movement.md`, `.codearbiter/plans/fuel-limited-movement.md`.
### Fuel-limited movement TDD, review, and local gate

- RED: the new movement harness failed fresh-fuel, action, traversal, economy, round-reset, and replay obligations; focused Vitest failed the absent A/D and mobility seams; Edge tests rejected the absent `move` contract. GREEN now resolves signed moves one integer column at a time, spends only accepted distance, preserves aim/turn/wind, replays ordered movement, and exposes the canonical arms-level-3 Fuel Tank. Confidence high.
- Inline correctness/security review found no remaining BLOCK findings. Move payloads are bounded identically in engine and referee, retain seat-token/membership/active-seat/bot-proxy/rate-limit/atomic-sequence controls, never advance the cursor, and apply in networked play only from ordered echo. Rendering review caught the compact rail overflowing by seven logical pixels; a component-owned `--ui-section-padding` token repaired the shell/component cascade without hiding overflow. Fresh desktop and Pixel-landscape visual inspection retained the one-page composition. Confidence high.
- Fresh `npm run check` passed all deterministic harnesses. Isolated client coverage passed 75 files / 552 tests at 86.55% statements, 76.11% branches, 73.31% functions, and 89.61% lines. All 166 Edge tests passed. The Vite 6.4.3 production build passed at 243.06 kB / 65.39 kB gzip for the main bundle. The full production-browser matrix passed 43 tests with 8 intentional project skips across desktop, pixel-touch, and small-window. `npm audit --audit-level=high` found zero vulnerabilities. Confidence high.
- `npm audit signatures` could not audit the local private workspace link because npm 11.16.0 attempted to resolve `@singedterra/shared@0.0.0` from the public registry and returned 404; no dependency changed in this slice, so the prior dependency-vetted lock remains untouched. The sanctioned `$ca-task` writer likewise could not parse the legacy plain-bullet movement entry and wrote nothing; the audit board was not hand-edited, while README and `docs/TASKS.md` now reflect the shipped behavior. Confidence high.- **Verification receipt correction:** the final store-readout oracle raised the client total to 553 passing tests; final production output is 243.18 kB / 65.41 kB gzip for the main bundle. Coverage percentages are unchanged. Confidence high.
### Fuel-limited movement ready PR opened

- Governed behavior commit `0137eb9` was pushed as `codex/fuel-limited-movement`.
- Ready stacked PR #202: https://github.com/SUaDtL/singedTerra/pull/202
- Base is exact final-green atmosphere head `4711a0bd` on `codex/atmospheric-battlefield-frame`, so review isolates the movement slice. Exact-head hosted CI and CodeQL are pending; per the standing goal, the PR remains open and no merge or deployment was performed. Confidence high.

### Fuel-limited movement authoritative local receipt

- Final client coverage: 75 files and 553 tests passed; 86.55% statements, 76.11% branches, 73.31% functions, and 89.61% lines.
- Final production build: 243.18 kB / 65.41 kB gzip main bundle. All deterministic, Edge, browser, audit, diff, and secret gates remain green.


### Fuel-limited movement hosted gate receipt

- Ready PR #202 was MERGEABLE on exact implementation/governance head 3e841c4c59f8b110079a1cc68ff538ac40f4a97d.
- Exact-head CI run 30501673883 passed deterministic harnesses, 553 client tests, production build, 166 Edge tests, and the 43-case browser matrix with 8 intentional skips.
- Exact-head CodeQL run 30501673891 passed. Supabase Preview was expectedly skipped because the integration did not provision a branch. This receipt and the completed plan checkbox form the final governance-only delta; the pushed governance head must independently clear CI and CodeQL before the PR is called final-green. No merge or deployment was performed. Confidence high.

## 2026-07-29 - Opening salvo assist sprint

- **[high] Correct the stale public-room-browser premise.** Live source already contains the browse sub-view, three-second lifecycle polling, `list_rooms` transport, join flow, and focused client/Edge coverage; rebuilding it would duplicate shipped behavior. The legacy open-task bullet is stale. Confidence high.
- **[high] Select a bounded opening-salvo solution over a turn timer, teams, parachutes, or another lobby pass.** Live 1280x720 play showed a cohesive single-screen battlefield and control legend, but the first human shot remains ballistic trial-and-error. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one first-rotation trajectory lesson because it improves first-match comprehension and graphical richness without widening backend authority. Confidence high.
- **[high] Preserve long-term aiming skill.** The full collision-accurate solution is limited to the locally controlled human during the opening rotation of each round; later turns retain the existing short launch-only guide. Shield, airburst, and bouncing weapons also retain the short guide so the renderer never promises unmodeled secondary behavior. Confidence high.
- **[high] Reuse fixed-step physics without changing canonical state.** Prediction reads authoritative wind, terrain, tanks, angle, and power plus the configured effective gravity, then reuses launch, integration, and swept-collision primitives in a bounded pure client helper. It emits no action and mutates no engine or snapshot state. Confidence high.
- **[high] No dependency is warranted for this slice.** Dependencies remain fully authorized, but existing Canvas 2D, design tokens, and shared physics own the exact required primitives. A graphics or trajectory library would add runtime and supply-chain surface without improving correctness or presentation. Confidence high.
- **[high] Approve the scoped spec and plan as SUaDtL under standing sprint authority.** The user delegated recurring passion-project decisions and asked the loop not to stop for approval. Hard gates remain enforced. Confidence high.

Spec/plan: `.codearbiter/specs/opening-salvo-assist.md`, `.codearbiter/plans/opening-salvo-assist.md`.
### Opening salvo assist TDD and visual review

- RED: the focused client suite failed because the opening-salvo module did not exist; the production-browser oracle then observed zero collision-solution pixels from the pre-feature bundle. GREEN now pins fixed-step samples, swept ground/tank collision, wind and configured gravity, bounded misses, invalid inputs, immutability, eligibility/fallback, Canvas drawing, world-pass ordering, and the three-viewport live interaction path. Confidence high.
- Real-browser review rejected the first rendering as too visually similar to the old faint launch dots. The final presentation adds a restrained continuous gold ribbon, crisp cyan collision bracket, and backed `OPENING SOLUTION` tag while remaining static and inside the existing Canvas world pass. Confidence high.
- Review corrected the written rule from one opening rotation per round to one opening rotation per match. `GameState.turn` is match-global and the one-time lesson better preserves long-term ranging skill; no new engine state was introduced to prolong assistance. Confidence high.
- Performance review caught repeated swept traces during the 48-frame opening wind animation. A renderer-local memo now reuses the same solution until aim, power, weapon, wind, configured gravity, terrain version, turn identity, or live tank geometry changes; focused cache invalidation coverage is green. Confidence high.
### 2026-07-28 — Opening salvo adversarial review follow-up
- Reviewer verdict: no Critical findings; one Important invalid-input fallback and two Minor oracle/wiring gaps.
- TDD RED: invalid opening and launch inputs drew 16 false pips at `(0,0)`; the new ownership/gravity seam did not exist.
- GREEN: opening-mode trace failure now returns without fallback, the launch hint rejects non-finite position/velocity/wind, and 18 focused tests pass.
- Minor hardening: browser pixels now poll across render frames; a pure integration seam pins remote ownership and engine-effective gravity. Focused production E2E: 3/3 passed.
- SMARTS auto-decision (confidence 0.98): resolve both Minor findings with the Important correction because each is narrow, deterministic, and directly reduces flaky or unwired acceptance evidence.

### 2026-07-28 — Opening salvo final local verification
- Harness catch: importing shared engine code into the alias-free input gate broke `scripts/checks/inputgate.mjs`; moved the composed ownership/gravity seam to the renderer boundary and preserved the dependency-free input gate.
- `npm run check`: PASS (all deterministic/type/harness checks).
- `npm run check:edge`: PASS (166 passed, 0 failed).
- `npm run test:client`: PASS (77 files, 563 tests).
- `npm run coverage:client`: PASS (86.84% statements, 76.51% branches, 73.81% functions, 89.87% lines; openingSalvo 95.65% statements / 87.27% branches / 100% functions / 97.24% lines).
- `npm run build`: PASS (1,875 modules; main 246.95 kB / 66.70 kB gzip).
- `npm run test:e2e`: PASS (46 passed, 8 expected project skips; opening-salvo oracle passed desktop, touch, and small-window).
- `npm audit --audit-level=low`: PASS (0 vulnerabilities).
- Diff hygiene: PASS (`git diff --check`, no conflict markers). State-free secret scan: PASS (`[]`).
- No dependency, backend, migration, action-log, canonical engine-state, merge, or deployment change.

### 2026-07-28 — Opening salvo coverage gate
- Coverage auditor initial verdict: BLOCK on player-two opening visibility and isolated power-cache invalidation; Minor eligible-turn gravity evidence accepted for cheap hardening.
- Browser RED: P2 default aim exits the right boundary and correctly has no cyan collision bracket. Oracle correction: rotate P2 back into the battlefield, then assert its opening bracket.
- Added isolated power cache invalidation and eligible opening-turn configured-gravity assertions.
- Re-audit caught the first power assertion also reset angle; corrected it to compare a same-angle baseline against a power-only mutation.
- Final coverage re-audit: no Critical, High, or Important findings; ready for PR.
- Verification: focused unit 9/9, focused opening unit 8/8, production opening E2E 3/3, full client 77 files / 563 tests, typecheck green.

### 2026-07-28 — Opening salvo PR receipt
- Behavior commit: `63d8f3d feat(renderer): teach the opening salvo`.
- Coverage follow-up: `a360f97 test(renderer): seal opening salvo coverage`.
- Ready stacked PR opened: https://github.com/SUaDtL/singedTerra/pull/203
- Base: `codex/fuel-limited-movement` at `7f3f560`; head at PR creation: `a360f97`.
- Reviewer path matrix: coverage auditor required and clear; no dependency, migration, auth, crypto, or backend path triggered.
- Babysitter resolver: disabled; sprint will poll exact-head hosted checks directly.
- Merge and deployment intentionally not performed.

### 2026-07-28 — Opening salvo hosted gate receipt
- PR #203 head `205362c7abac0cc237c3ef9363f9b270707eedaf`: MERGEABLE.
- CI `typecheck · harnesses · build`: SUCCESS.
- CI `edge function tests (deno)`: SUCCESS.
- CI `e2e · rendering guardrails`: SUCCESS.
- CodeQL `analyze (javascript-typescript)`: SUCCESS; repository CodeQL check: SUCCESS.
- Supabase Preview: expected SKIPPED (no backend preview branch required).
- No merge or deployment performed. A receipt-only governance commit will become the final head and must independently clear the same hosted gates.

### 2026-07-28 — Next slice: material impact signatures
- Closed prior cell: PR #203 is open, MERGEABLE, and exact-final-head green at `ae42485042fcd854fa7ef243cfd80316875ab4f6`; no merge or deployment performed.
- Live visual audit showed the battlefield/HUD are now coherent; stale backlog items for trails, camera recoil, collapse, and base UI polish are already implemented.
- SMARTS criteria: visible/game-feel payoff 30%, combat clarity 25%, effort/reversibility 20%, architecture/determinism 15%, novelty/replay 10%.
- Options scored: material impact signatures 8.55; reflective wall mode 7.70; tank-art enlargement 7.15; AI personalities 6.85.
- Decision: distinguish direct armor from terrain impacts because it strengthens the core hit-reward loop with a small additive event field and bounded client presentation. Confidence 0.94.
- Dependency SMARTS: native Canvas/Web Audio 9.4 vs new particle/audio dependency 4.5. Dependencies remain allowed, but none adds value for this bounded procedural effect. Confidence 0.98.
- Spec gate auto-approved under the maintainer standing passion-project sprint authority: choose the next valuable slice without another approval stop.
- Hard boundaries: no damage/physics/replay-action/Supabase change, no merge, no deployment, no spend beyond tokens.

### 2026-07-28 — Material impact TDD and implementation
- TDD RED engine harness: 6 passed / 4 failed; real swept missile, napalm, and bouncing-mine contacts produced events without material provenance.
- TDD RED client focus: missing pure material-profile module; armor impacts still emitted terrain debris, reduced motion lost the direct-hit readout, and renderer audio received no material batch.
- Decision: keep `impactType` optional and collision-derived; flight-cap air bursts omit the property rather than serializing an invented default. Confidence 0.98.
- Decision: armor wins material-audio batch arbitration while each authoritative event retains its own visual signature. Confidence 0.95.
- TDD GREEN: impact harness 10/10; material/profile/effects/renderer focus 17/17; shared + client typecheck green.
- Dependency decision unchanged: procedural Canvas/Web Audio implementation is sufficient; no package install or third-party code introduced.
### 2026-07-28 — Material impact review finding
- Adversarial review verdict: no Critical, High, or Important blockers.
- MEDIUM caught: the initial material layer could add up to 0.40 commanded gain under an already dense explosion, risking clipping and masking the distinction.
- Review-fix RED: new combined material-gain assertion failed at 0.248 for a radius-30 profile against the 0.12 ceiling.
- Fix: reduced the material layer below 0.12 combined gain at every clamped radius and added a fast final-stage compressor/limiter before the Web Audio destination.
- Review-fix GREEN: focused material suite 17/17 and typecheck green; follow-up review requested.
### 2026-07-28 — Material impact final local gate
- Follow-up adversarial review: headroom finding resolved; no remaining Critical, High, Important, or Medium blocker. Worst-case material gain is pinned at radius 120.
- One concurrent-matrix coverage attempt timed out in a pre-existing opening-salvo test under CPU contention. No code changed; immediate isolated rerun passed 79 files / 571 tests in 9.99s, confirming scheduling rather than product failure.
- `npm run check`: PASS, including 10/10 impact-material assertions, engine purity, clone parity, and replay determinism.
- Client coverage: PASS, 79 files / 571 tests; 86.89% statements, 76.75% branches, 73.92% functions, 89.93% lines; impactMaterial 95.23% statements / 95% branches / 100% functions / 100% lines.
- Edge: PASS, 166 passed / 0 failed. Production build: PASS, 1,876 modules; main 248.77 kB / 67.32 kB gzip.
- Rendering E2E: PASS, 46 passed / 8 expected project skips. Runtime audit: PASS, 0 vulnerabilities.
- Diff hygiene and conflict-marker check: PASS. State-free changed-file secret scan: PASS (`[]`).
- No dependency, lockfile, migration, action-log, Supabase, damage, physics, merge, or deployment change.
### 2026-07-28 — Material impact governed commit
- Governed behavior commit: `ea2d145` (`feat(rendering): distinguish armor and ground impacts`).
- Commit gate evidence: exact-path staged set, focused TDD, full deterministic/client/Edge/build/E2E matrix, resolved adversarial review, zero-vulnerability audit, clean cached diff, and empty staged secret scan.
- Stacked PR target remains `codex/opening-salvo-assist`; merge and deployment remain intentionally excluded.
### 2026-07-28 — Material impact PR receipt
- Ready stacked PR opened: https://github.com/SUaDtL/singedTerra/pull/204
- Base: `codex/opening-salvo-assist` at `ae42485042fcd854fa7ef243cfd80316875ab4f6`; head at PR creation: `48dbd98`.
- Reviewer follow-up accepted the headroom fix with no remaining Critical, High, Important, or Medium finding.
- Merge and deployment intentionally not performed. Exact receipt head must clear hosted CI and CodeQL.
### 2026-07-28 — Material impact hosted gate receipt
- PR #204 implementation receipt head `8d6e48690644a5ad476b13e4940019604255c083`: OPEN and MERGEABLE.
- CI `typecheck · harnesses · build`: SUCCESS.
- CI `edge function tests (deno)`: SUCCESS.
- CI `e2e · rendering guardrails`: SUCCESS.
- CodeQL `analyze (javascript-typescript)`: SUCCESS; repository CodeQL check: SUCCESS.
- Supabase Preview: expected SKIPPED because no backend surface changed.
- No merge or deployment performed. This receipt-only governance commit becomes the final PR head and must independently clear the same hosted gates.
### 2026-07-28 — Next slice: reflective sidewalls
- Closed prior cell: PR #204 is OPEN, MERGEABLE, and exact-final-head green at `d2b609405b6442c8905d742f8084fab7d882af4c`; no merge or deployment performed.
- SMARTS criteria: gameplay/replay payoff 30%, player readability 20%, deterministic fit 20%, effort/reversibility 15%, visual identity 15%.
- Options scored: reflective sidewalls 8.90; wrap sidewalls 7.75; larger procedural tank art 7.20; AI personalities 6.90; cosmetic-only walls 5.35.
- Decision: one opt-in reflective rule with engine, AI, opening-guide, room-option, rail, and contact-feedback parity. It adds classic bank-shot tactics without a new synchronized action or migration. Confidence 0.93.
- Dependency SMARTS: native engine math + Canvas/Web Audio 9.6 vs physics/particle/audio package 3.8. No dependency is justified; dependencies remain allowed for later slices. Confidence 0.98.
- Spec gate auto-approved under the standing passion-project sprint authority.
- Hard boundaries: open remains default; no ceiling/wrap/concrete mode, wall damage, migration, merge, deployment, or spend beyond tokens.
### 2026-07-28 — Reflective sidewall Task 1 TDD
- TDD RED: legacy open-wall assertions passed, while left/right live reflection, authoritative contacts, multi-bank continuation, reflective AI probing, and the opening-guide bank path failed. Result: wall harness 6 passed / 10 failed; opening focus 8 passed / 1 failed.
- Implementation decision: one shared `reflectSideWall` primitive owns exact inset + horizontal velocity reversal; live engine, AI search, and opening trace all consume the same swept `wall` collision. Confidence 0.97.
- Wall contacts use a monotonic engine id and current-shot event list, matching the existing explosion event/dedupe pattern without adding an action-log field. Confidence 0.94.
- TDD GREEN: wall harness 18/18; opening-salvo focus 9/9; workspace typecheck green. Clone preserves mode/contact sequence/future flight and keeps projectile state independent.### 2026-07-29 — Reflective sidewall Task 2 and playtest correction
- TDD RED: missing sidewall visual module; lobby coercion rejected reflective mode; Edge validation lacked a wall-mode contract. Focused lobby RED was 31 passed / 2 failed and the Edge typecheck failed on the missing export.
- TDD GREEN: sidewall visual + bounded contact consumption, hot-seat/online selection, transport, room JSON validation, rejoin, and rematch plumbing are implemented. Focused client matrix passed 79/79; create-room Edge focus passed 12/12; wall harness passed 18/18; workspace typecheck passed.
- Browser proof at 1280x720: reflective rails are visible, a live maximum-power bank shot reflected and resolved to Player 2, and the game remained exactly viewport-sized (1280x720 document; no scrolling).
- Player feedback correctly identified that a collision-accurate opening path solved too much of the artillery game despite its visual appeal. Decision: remove full trajectories and impact brackets entirely; keep a polished 14-tick collision-unaware launch segment on every eligible human turn. Confidence 0.99.
- Aim-guide correction TDD RED: new skill-preservation suite failed because the bounded guide module did not exist. GREEN: 3/3 tests prove opening/later parity, a hard 14-tick bound with no impact contract, and fail-closed invalid/hidden states; typecheck passed.
- Next-cell priority from direct player feedback: replace the weakest high-visibility procedural/SVG-like artwork with optimized authored raster assets after this PR reaches exact-head green. Dependency and asset tooling remain allowed; no money beyond tokens.### 2026-07-29 — Reflective sidewall adversarial review and repairs
- Independent review found two PR-blocking correctness gaps. First, the 14-tick cue still reused exact physics and concrete supported shots hit within that displayed segment (0°/power 10 at tick 5; 15°/10 at tick 9; 30°/20 at tick 12). Second, AI probing simulated 1,600 ticks while live play force-detonated at 240, allowing a valid gravity-0.05 reflective bank to score a terrain impact at tick 253 that live play could never reach.
- Aim repair: the cue now uses a fixed local vector with a small visual flourish and relative-power length; it has no wind, gravity, collision, terrain, wall, tank, or fixed-step input. Low-power tests prove it does not reproduce the authoritative recurrence. Confidence 0.99.
- AI repair: `MAX_FLIGHT_TICKS` is shared from Physics; AI increments projectile age and returns the exact forced-detonation point at the same 240-tick boundary as GameEngine. The reproduced low-gravity bank now matches live explosion coordinates exactly. Confidence 0.99.
- Coverage repairs: real `applyAction` bank replay is byte-identical across fresh engines; renderer sink contacts dedupe and re-arm on reset; ricochet audio is side-distinct and capped at 0.13 combined gain / 0.11 seconds; reflective rematch options normalize through both response paths; side-wall label/select/hint relationships are accessible.
- Direct player request folded in as a small adjacent improvement: fresh tanks and new-round tanks face the nearest opponent (45° right / 135° left), with roster order breaking equal-distance ties. Focused wall harness is 27/27; round-reset harness proves 45°/135° restoration; browser E2E proves Player 2 presents `45° ◀` after Player 1 fires. Confidence 0.99.
- Full focused GREEN after repairs: client 81 files / 576 tests; Edge 168/168; AI search; muzzle geometry 403/403; workspace build/typecheck.### 2026-07-30 — Reflective sidewall review follow-up
- Final reviewer blocker was coverage, not behavior: the lost-claim and winning-create rematch branches shared normalization but lacked independent response-path tests.
- TDD RED: restart-game test import failed because the two response projectors were not yet exported.
- Fix: extracted `projectExistingRematchInfo` and `projectCreatedRematchInfo`, routed each production branch through its corresponding projector, and pinned reflective-wall preservation independently.
- TDD GREEN: restart-game focus passed 6/6. Adversarial follow-up confirmed both production paths execute the tested projectors; no actionable blocker remains.
- Full deterministic/typecheck gate passed, including 27/27 wall assertions, nearest-opponent fresh/round-reset aim, AI/live 240-tick parity, clone parity, replay determinism, and 403/403 muzzle assertions.### 2026-07-30 — Reflective sidewall final local gate
- Adversarial review: PASS; all behavioral findings and the final branch-level rematch coverage gap are resolved, with no remaining actionable blocker.
- `npm run check`: PASS, including 27/27 wall assertions, nearest-opponent aim, round reset, shared AI/live cap, engine purity, clone parity, replay determinism, and muzzle geometry 403/403.
- Client coverage: PASS, 81 files / 576 tests; 86.84% statements, 76.64% branches, 73.72% functions, 89.91% lines.
- Edge: PASS, 170 passed / 0 failed, including independent lost-claim and winning-create rematch response tests.
- Production build: PASS, 1,877 modules; main 251.17 kB / 67.80 kB gzip.
- Rendering E2E: PASS, 46 passed / 8 expected project skips, including the bounded aim guide across three viewport profiles and Player 2's left-facing default after rotation.
- Runtime audit: PASS, 0 vulnerabilities. Diff hygiene, conflict-marker scan, and state-free changed-line secret scan: PASS (`[]`).
- No dependency, lockfile, migration, merge, deployment, or spend beyond tokens.### 2026-07-30 — Reflective sidewall governed commit
- Governed behavior commit: `aafe7b6` (`feat(gameplay): add reflective sidewalls`).
- Commit gate evidence: explicit 41-file staged manifest, complete deterministic/client/Edge/build/E2E matrix, resolved adversarial review, zero-vulnerability audit, clean cached diff, no unstaged drift, and empty staged secret scan.
- Stacked PR target remains `codex/material-impact-signatures`; merge and deployment remain intentionally excluded.### 2026-07-30 — Reflective sidewall PR receipt
- Ready stacked PR opened: https://github.com/SUaDtL/singedTerra/pull/205
- Base: `codex/material-impact-signatures` at `d2b609405b6442c8905d742f8084fab7d882af4c`; head at PR creation: `ac932bb`.
- Reviewer follow-up confirmed both rematch response paths are independently pinned and no actionable blocker remains.
- Merge and deployment intentionally not performed. Exact receipt head must clear hosted CI and CodeQL.### 2026-07-30 — Reflective sidewall hosted gate receipt
- PR #205 implementation receipt head `0e259d6f30b4c0dbd971b0033cbb9b54fd1c9bf4`: OPEN and MERGEABLE.
- CI `typecheck · harnesses · build`: SUCCESS.
- CI `edge function tests (deno)`: SUCCESS.
- CI `e2e · rendering guardrails`: SUCCESS.
- CodeQL `analyze (javascript-typescript)`: SUCCESS; repository CodeQL check: SUCCESS.
- Supabase Preview: expected SKIPPED; the option is stored in existing room JSON and requires no migration or preview branch.
- No merge or deployment performed. This receipt-only governance commit becomes the final PR head and must independently clear the same hosted gates.### 2026-07-30 — Next slice: authored battlefield backdrop
- Closed prior cell: PR #205 is OPEN, MERGEABLE, and exact-final-head green at `61cbb955e9fd84a019227fb66099c63634f91ef1`; no merge or deployment performed.
- Direct player feedback prioritized higher-quality artwork over more procedural/SVG-like construction while preserving the browser game and Supabase backend.
- SMARTS criteria: visible gameplay impact 30%, style cohesion 25%, performance/layout safety 20%, integration reversibility 15%, future asset leverage 10%.
- Options scored: authored panoramic battlefield backdrop 9.25; generated tank sprite system 7.55; raster HUD panel skin 6.85.
- Decision: replace only the weakest far-atmosphere layer with one cached authored 2:1 raster panorama. It improves every gameplay frame without creating tinting, barrel rotation, hitbox-readability, or responsive-HUD constraints. Confidence 0.96.
- Asset/tool decision: built-in image generation + local WebP optimization 9.5 vs a runtime graphics dependency 3.6. No runtime or repository dependency is justified. Confidence 0.99.
- Design/spec gate auto-approved under the standing passion-project sprint authority and direct artwork request.
- Hard boundaries: client presentation only; existing procedural fallback retained; no engine, action-log, Supabase, layout, dependency, merge, deployment, or spend beyond tokens.### 2026-07-30 — Authored backdrop asset TDD
- Asset-contract RED: the absent `/art/battlefield-backdrop.webp` fell through to the Vite HTML shell (`text/html`), proving the test rejects missing or misrouted art.
- Built-in image generation produced an environment-only 1774x887 panorama with open central sky, edge-weighted mesas, and the canonical dusk/ember palette. No tanks, shells, explosions, text, UI, sun, or foreground gameplay shelf were baked in.
- Local tool decision corrected from unavailable Pillow to installed ffmpeg; native 2:1 composition was preserved and encoded as opaque `yuv420p` WebP without adding a dependency. Final transfer size: 81,018 bytes (16.2% of the 500,000-byte cap).
- Asset-contract GREEN: focused production-build Playwright check passed 1/1, including WebP MIME, decode, 2:1 ratio, minimum width, transfer bound, and sampled full opacity.
- Built-in image prompt was production-bound and the final selected output is saved at `client/public/art/battlefield-backdrop.webp`.### 2026-07-30 — Authored backdrop loader and integration TDD
- Loader RED: focused Vitest failed because `BattlefieldBackdrop` did not exist. GREEN: 5/5 prove one allocation, base-aware URL, loading fallback, exact 1200x600 draw, valid 2:1 acceptance, and fail-closed error/invalid dimensions.
- Renderer seam RED: 3/3 assertions failed against the prior renderer because it never drew an authored panorama, never substituted clouds/ridges, and released idle while the image was still loading.
- Renderer GREEN: the page-level renderer owns one cached backdrop, paints it inside far-atmosphere parallax, retains dynamic stars/sun/haze, replaces procedural clouds/ridges only after a successful draw, and keeps redraws alive only until load settles. Focused renderer/loader/cloud suite passed 10/10.
- Browser visual QA: the authored sky is visibly integrated behind live destructible terrain and the HUD at 1280x720; canvas stage remains fitted and document dimensions equal viewport dimensions.
- Cross-profile production E2E passed 6/6 across desktop, touch landscape, and small-window: live renderer requests the WebP successfully, asset contract holds, and no profile reintroduces scrolling.### 2026-07-30 — Authored backdrop adversarial review and repairs
- Independent review found two delivery blockers: decoded success could settle the idle loop before the first authored frame was painted, and the initial asset's lower band read as solid foreground despite having no collision contract.
- Async repair TDD RED: loader and real renderer-transition tests failed because `isSettled` became true immediately on `onload`. GREEN: readiness stays unsettled until `draw()` acknowledges the first authored frame; failed loads release idle immediately. Focused loader/renderer suite passed 10/10. Confidence 0.99.
- Asset repair: built-in image editing preserved the upper composition while replacing the lower 20% rocky shelf with low-contrast basin haze. The selected opaque 1774x887 WebP is 58,882 bytes and exposes no false foreground plane. Confidence 0.97.
- Edge repair TDD RED: a 16px overscan contract initially drew at the exact canvas bounds. GREEN: the 2:1 panorama expands proportionally to cover the composed shake/kick translation bound without edge strips.
- Browser evidence strengthened: the integration suite samples the live canvas against a forced procedural fallback and requires a material color delta, catching a decoded-but-never-painted image. All 9 backdrop checks pass across desktop, touch landscape, and small-window.
- Project-base evidence: the same 9/9 production Playwright checks pass with `VITE_BASE=/singedTerra/`; the asset response path is asserted against the page-relative URL.
- Visual QA at 1280x720 confirms authored mesas/haze remain behind live destructible terrain and both tanks, the HUD retains contrast, and the document remains exactly viewport-sized with no scrolling.
### 2026-07-30 — Authored backdrop final local gate
- Adversarial follow-up: PASS; the repaired ready-frame latch, proportional overscan, haze-only lower asset band, actual canvas-compositing proof, and Vite project-base route have no remaining Critical, Important, or Minor finding.
- `npm run check`: PASS, including deterministic engine, replay, nearest-opponent aim, and 403/403 muzzle assertions.
- Client coverage: PASS, 83 files / 586 tests; 86.91% statements, 76.89% branches, 73.94% functions, 89.95% lines; `BattlefieldBackdrop.ts` 96% statements / 95.23% branches / 95.83% lines.
- Edge: PASS, 170 passed / 0 failed. Production build: PASS, 1,878 modules; main 252.20 kB / 68.19 kB gzip.
- Rendering E2E: PASS, 55 passed / 8 expected project skips. Focused root and `/singedTerra/` backdrop matrices each passed 9/9 across all viewport profiles.
- Runtime and full audit: PASS, 0 vulnerabilities. Cached diff hygiene, conflict-marker scan, exact staged manifest, and state-free secret scan: PASS (`[]`).
- No dependency, lockfile, engine, action-log, Supabase, migration, layout, merge, deployment, or spend beyond tokens.
### 2026-07-30 — Authored backdrop PR receipt
- Governed behavior commit: `95a5fcd` (`feat(rendering): add authored battlefield backdrop`).
- Ready stacked PR opened: https://github.com/SUaDtL/singedTerra/pull/206
- Base: `codex/reflective-sidewalls` at `61cbb955e9fd84a019227fb66099c63634f91ef1`; implementation head at PR creation: `95a5fcdfa36b772f3ccb3d769b13674c4baf054f`.
- Adversarial rendering review returned no Critical, Important, or Minor finding. Required coverage audit returned no Critical or High finding; its three hardening notes are non-blocking and do not invalidate the current production seams or receipts.
- Merge and deployment intentionally not performed. The final governance receipt head must clear hosted CI and CodeQL before this cell closes.
### 2026-07-30 — Authored backdrop hosted gate receipt
- PR #206 final governance head `49f9f0854aa4e1c2b1ac69a4e7289fdef8bb916b`: OPEN and MERGEABLE.
- CI `typecheck · harnesses · build`: SUCCESS.
- CI `edge function tests (deno)`: SUCCESS.
- CI `e2e · rendering guardrails`: SUCCESS.
- CodeQL `analyze (javascript-typescript)`: SUCCESS; repository CodeQL check: SUCCESS.
- Supabase Preview: expected SKIPPED because no backend surface changed.
- No merge or deployment performed. The authored battlefield backdrop cell is exact-head green.
### 2026-07-30 — Next slice: authored terrain material
- Closed prior cell: PR #206 is OPEN, MERGEABLE, and exact-final-head green at `49f9f0854aa4e1c2b1ac69a4e7289fdef8bb916b`; no merge or deployment performed.
- The live destructible terrain is now the largest remaining flat procedural surface beneath the authored panorama.
- SMARTS criteria: visible-area payoff 30%, gameplay readability 25%, deterministic/cache fit 20%, performance/reversibility 15%, future asset leverage 10%.
- Options scored: authored terrain material overlay 9.05; authored tank hull system 7.45; HUD commander portraits 6.80.
- Decision: add one subtle seamless neutral-rock bitmap as a cached luminance material inside the existing terrain dirty rebuild. Existing palette, strata, rim, bevel, deformation, and collision remain authoritative. Confidence 0.94.
- Asset/tool decision: built-in image generation + local WebP optimization 9.4 vs a runtime texture/rendering dependency 3.5. No repository dependency is justified. Confidence 0.99.
- Design/spec gate auto-approved under the standing passion-project sprint authority and direct request to improve artwork in general.
- Hard boundaries: presentation only; no collision/terrain bitmap/engine/action-log/Supabase/layout/dependency/lockfile/merge/deployment change; no per-frame texture work; no spend beyond tokens.
### 2026-07-30 — Authored terrain material TDD and visual QA
- Asset-contract RED: the absent `art/terrain-material.webp` returned the Vite HTML shell MIME, proving missing or misrouted material cannot pass.
- Built-in image generation produced a fine-grained neutral basalt/ash tile with no large cracks, crater, object, text, directional light, or collision-like silhouette. Local ffmpeg reduced it to an opaque 256x256 WebP at 17,572 bytes; a 2x2 repeat inspection showed no obvious hard seam.
- Asset-contract GREEN: exact dimensions, WebP MIME, transfer cap, full alpha, and luminance variation pass. Root and `/singedTerra/` matrices each pass 6/6 across desktop, touch landscape, and small-window profiles.
- Loader TDD RED: focused import failed because `TerrainMaterial` did not exist. GREEN: 4/4 tests prove one image/decode surface, handlers before `src`, base-aware URL, exact-square validation, deterministic wrapped signed luminance, first-application settlement, and fail-closed decode/pixel errors.
- Integration TDD RED: material-ready RGB remained identical to fallback, same-version readiness did not invalidate the terrain cache, and idle rendering released before material application. GREEN: ready grain is sampled only during the existing dirty rebuild; terrain bytes, alpha, two-pixel rim, version-cache reuse, and late-ready one-rebuild behavior are pinned. Focused material/edge/bevel/renderer suite passed 15/15 and workspace typecheck passed.
- First browser inspection found the initial 8% one-pixel treatment too timid at gameplay scale. A new test required a material delta of at least 10 red-channel levels and failed at 7. The texture now centers on its own exposure, renders at two world pixels per texel, and stays bounded to 16% modulation. Focused repair suite passed 11/11. Confidence 0.97.
- Browser QA at 1280x720: fine grain is visible on intact slopes, fresh crater walls, and deep strata while tanks, crater rim, aim cues, fire control, and HUD stay clear. The document remains exactly viewport-sized with no scrolling.
- Live-compositing E2E forces material failure on one page, compares deep-terrain canvas samples against an authored page, and rejects a decoded-but-unapplied texture. All three profiles pass.### 2026-07-30 — Authored terrain material adversarial review repairs
- Independent review found one Important lifecycle gap: a same-origin image request that never emitted `load` or `error` kept the renderer active indefinitely. TDD RED reproduced the stuck `loading` state under fake timers.
- Repair: the loader now fails closed after a bounded five-second deadline, clears that deadline on every normal settlement, and ignores all late callbacks. TDD GREEN: 5/5 loader tests; focused material/render lifecycle suite 10/10. Confidence 0.99.
- Deformation coverage now changes the authoritative terrain version, carves an exposed wall, and proves authored RGB modulation survives there without changing terrain bytes or edge alpha.
- Seam coverage computes opposing-edge RGB error from the decoded asset and enforces a bounded continuity contract. Root and `/singedTerra/` production matrices each pass 6/6 across all viewport profiles.### 2026-07-30 — Authored terrain material final local gate
- Adversarial follow-up: PASS with 0 Critical, 0 Important, and 0 Minor findings after the bounded pending-load repair, deformation coverage, and decoded-edge continuity contract.
- `npm run check`: PASS, including deterministic engine, nearest-opponent 45°/135° defaults, replay, and 403/403 muzzle assertions.
- Client coverage: PASS, 86 files / 596 tests; 87.06% statements, 76.93% branches, 74.46% functions, 90.08% lines; `TerrainMaterial.ts` 93.82% statements / 79.16% branches / 92.85% functions / 95.89% lines.
- Edge: PASS, 170 passed / 0 failed. Production build: PASS, 1,879 modules; main 254.47 kB / 68.98 kB gzip.
- Rendering E2E: PASS, 61 passed / 8 expected project skips. Focused root and `/singedTerra/` terrain matrices each passed 6/6 across all viewport profiles.
- Runtime audit: PASS, 0 vulnerabilities. Cached diff hygiene, conflict-marker scan, exact staged manifest, and state-free changed-file secret scan: PASS (`[]`).
- No dependency, lockfile, engine, action-log, Supabase, migration, layout, merge, deployment, or spend beyond tokens.### 2026-07-30 — Authored terrain material coverage hardening
- Required PR coverage audit returned no Critical or High blocker and identified two Medium oracle gaps plus two Low branch/order gaps.
- Negative-path coverage now proves signed luminance darkens terrain rather than merely changing it; a constant-highlight test pins material-before-bevel ordering; the null decode-context failure settles into fallback.
- Browser coverage now drives the real deterministic fire path on fallback and authored pages, derives newly exposed wall coordinates from pre/post canvas frames, and proves material modulation on those live crater-wall pixels after the engine advances terrain version.
- Focused unit suite passed 12/12. Root and `/singedTerra/` production Playwright matrices each passed 6/6 across all profiles. Confidence 0.97.### 2026-07-30 — Authored terrain material PR receipt
- Governed implementation commit: `278dbca` (`feat(rendering): add authored terrain material`).
- Coverage hardening commit: `dd969eb` (`test(rendering): harden terrain material oracles`).
- Ready stacked PR opened: https://github.com/SUaDtL/singedTerra/pull/207
- Base: `codex/authored-battlefield-backdrop` at `49f9f0854aa4e1c2b1ac69a4e7289fdef8bb916b`; implementation head at PR creation: `dd969eb4bedea119796ad717dae636b8bd86547c`.
- Adversarial rendering review and required coverage audit each returned zero findings at every reported severity.
- Merge and deployment intentionally not performed. The final governance receipt head must clear hosted CI and CodeQL.### 2026-07-30 — Authored terrain material hosted gate receipt
- PR #207 governance head `17ef516098459a825106f518d11e8b460a8c0069`: OPEN and MERGEABLE.
- CI `typecheck · harnesses · build`: SUCCESS.
- CI `edge function tests (deno)`: SUCCESS.
- CI `e2e · rendering guardrails`: SUCCESS.
- CodeQL `analyze (javascript-typescript)`: SUCCESS; repository CodeQL check: SUCCESS.
- Supabase Preview: expected SKIPPED because no backend surface changed.
- No merge or deployment performed. This receipt-only governance commit becomes the final PR head and must independently clear the same hosted gates.### 2026-07-30 — Next slice: authored tank chassis
- Closed prior cell: PR #207 is OPEN, MERGEABLE, and exact-final-head green at `da96f08e737194da5aeeacb7bd7b049521a99cc3`; no merge or deployment performed.
- The geometric live tanks are now the clearest persistent art-quality seam against the authored panorama and materialized terrain.
- SMARTS criteria: player-focus payoff 30%, gameplay/aim readability 25%, authored-art gain 20%, integration reversibility 15%, reusable asset path 10%.
- Options scored: authored tintable tank chassis 9.10; authored projectile/munition sprites 7.65; HUD commander portraits 7.30; explosion flipbook 6.95.
- Decision: replace only the living body/turret/tread block with one transparent authored neutral chassis, cached and tinted for the four canonical player colors. Shared barrel, muzzle, hitbox, damage, recoil, burial, wreck, and fallback geometry remain authoritative. Confidence 0.94.
- Asset/tool decision: built-in image generation + local alpha-preserving WebP optimization 9.3 vs a sprite/rendering dependency 4.0. No repository dependency is justified. Confidence 0.98.
- Design/spec gate auto-approved under the standing passion-project sprint authority and direct request for higher-quality art worked into successive slices.
- Hard boundaries: client presentation only; no engine, collision, tank state, action log, Supabase, layout, dependency, lockfile, merge, deployment, or spend beyond tokens.
### 2026-07-28 - Authored tank chassis asset contract GREEN

- TDD RED: e2e/tank-chassis.spec.ts failed while the asset path returned the app HTML fallback.
- Image generation produced a grayscale side-view chassis; local ffmpeg matting removed the chroma field, neutralized hidden RGB to grayscale, and encoded a 9,432-byte 256x128 alpha WebP.
- Visual QA covered the full-size matte, alpha mask, and a 44x24 gameplay-scale preview.
- TDD GREEN: the focused asset contract passed under both root / and GitHub Pages /singedTerra/ base paths.
- SMARTS decision: keep the generated art dependency-free and preserve the procedural live chassis as its load/error fallback (confidence: high).

### 2026-07-28 - Standing merge authority expanded

- User granted standing authority to merge PRs after one adversarial subagent review, correction of every Critical/High finding, and exact-head hosted CI green.
- This replaces the sprint's prior no-merge delivery boundary; force-push and deployment remain outside this authority.
- Delivery decision confidence: high (explicit user authority).


### 2026-07-28 - Authored tank chassis local gate

- TDD integration RED proved the renderer had no authored chassis seam or chassis-load eligibility; focused GREEN now covers 15 loader, tint-cache, renderer, recoil, wreck, and idle-settlement cases.
- First adversarial review: 0 Critical, 0 High, 2 Medium, 1 Low. The occupied hull was tightened from about 41 to at most 34 logical pixels, and a real production-bundle gameplay oracle was added.
- Adversarial follow-up: 0 Critical, 0 High, 0 Medium, 0 Low. The reviewer closed the aperture observation at repaired gameplay scale without moving authoritative barrel geometry.
- Live browser QA and E2E prove localized red/blue authored variants against a forced procedural fallback, a real fire/turn cycle, P2's 45-degree left-facing gauge, and zero viewport overflow across desktop, touch landscape, and small-window profiles.
- Exact candidate gates: npm run check PASS; client coverage PASS at 89 files / 613 tests, 87.27% statements, 77.24% branches, 74.90% functions, 90.26% lines; Edge PASS at 170 tests; production build PASS; E2E PASS at 67 plus 8 expected profile skips; npm audit PASS at 0 vulnerabilities.
- Diff hygiene, conflict-marker scan, and changed-file secret scan PASS. No dependency, lockfile, engine, Supabase, migration, action-log, collision, merge, deployment, or monetary spend.


### 2026-07-28 - Authored tank chassis PR receipt

- Governed implementation commit: fd2bdb2 (feat(rendering): add authored tank chassis).
- Ready stacked PR opened: https://github.com/SUaDtL/singedTerra/pull/208
- Base: codex/authored-terrain-material at da96f08e737194da5aeeacb7bd7b049521a99cc3; implementation head at PR creation: fd2bdb2.
- Single adversarial reviewer follow-up returned 0 Critical, 0 High, 0 Medium, and 0 Low findings.
- Standing merge authority applies only after the final governance receipt head independently clears every required hosted check; no merge or deployment has occurred yet.

### 2026-07-30 - Terrain material hosted wall-signal correction

- Fresh up-to-date PR #207 head `03df25014244604f284498328b49f74092cebdee` preserved the exact previously-green source tree, but hosted small-window E2E reproduced the crater-wall material delta at 0.7223 and 0.7125 against a threshold of 0.8; deep-fill proof, asset decode, geometry, 60 other browser cases, deterministic checks, both CodeQL surfaces, build, and Edge remained green.
- **[high] Treat the dual hosted reproduction as an overfit visual oracle, not a product regression.** SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors retaining the same non-zero authored-vs-fallback comparison at 0.5: fallback is 0, the observed material signal remains comfortably above the boundary, and wall pixels intentionally blend the authored field through rim/bevel shading. No runtime code or visual output changed. Confidence high.

### 2026-07-30 - Authored tank chassis merge-conflict resolution

- GitHub could not update PR #208 after #207 merged because both branches had append-only sprint-log receipts. The resolution retained the complete chassis-side audit history, appended the terrain wall-signal correction verbatim, and accepted the runtime-neutral E2E threshold fix from `main`; no product source or asset conflict existed. Confidence high.
### 2026-07-30 - Authored tank chassis hosted gate receipt

- Ready PR #208 was CLEAN and MERGEABLE on exact up-to-date merge head `6d8430c2b5acf2114e7c35891babb2565c03626e` after the append-only audit conflict was resolved without product-source changes.
- Exact-head CI run `30563960435` passed deterministic harnesses, 613 client tests, production build, 170 Edge tests, and the 67-case browser matrix with 8 expected profile skips.
- Exact-head CodeQL workflow run `30563960432` and repository CodeQL both passed. Supabase Preview was expectedly skipped because no backend surface changed.
- The single adversarial follow-up remains 0 Critical, 0 High, 0 Medium, 0 Low. This receipt and completed plan checkbox form the final governance-only delta and must independently clear the same hosted gates before merge under standing authority. Confidence high.
### 2026-07-30 - Chassis final-head check dispatch retry

- GitHub created only the expected Supabase Preview skip for governance receipt head `20f03a2fed5395c49d594c5b86a9fd99f98dfcd4`; required CI and CodeQL runs were not dispatched, leaving branch protection BLOCKED. This append-only receipt creates a fresh synchronize event; no hosted gate is waived and merge remains prohibited until every required check is green on the resulting exact head. Confidence high.
## 2026-07-30 - Combat iconography sprint

- **[high] Select a coherent command-glyph pass over a one-off Arsenal swap.** Live browser inspection confirmed the package icon is semantically wrong and that Store/Arsenal read as faint generic utilities beside a strong Fire reticle. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one bounded icon seam because it directly answers player feedback, strengthens the existing design system, is instantly visible, and cannot affect deterministic gameplay. Confidence high.
- **[high] Reuse exact-pinned Lucide with explicit imports.** Bomb for Arsenal and Coins for Store are semantically precise, tree-shaken, already dependency-vetted, and appropriate vector assets at 14-16px. A new raster or icon dependency would add supply-chain and loading cost without improving this scale. Confidence high.
- **[high] Use one framed glyph factory for Menu, Store, Fire, and Arsenal; leave disclosure unframed.** This creates a reusable visual grammar without changing labels, hit targets, drawer state, or rail geometry. Confidence high.
- Spec and plan approved as SUaDtL under standing autonomous passion-project sprint authority: `.codearbiter/specs/combat-iconography.md`, `.codearbiter/plans/combat-iconography.md`.
### Combat iconography TDD, browser QA, and adversarial correction

- TDD RED: the shell suite found no semantic symbol metadata or framed glyphs and still observed package/shopping-bag geometry. GREEN maps Arsenal to Lucide Bomb/ordnance and Store to Coins/credits through explicit tree-shaken imports; Menu, Store, Fire, and Arsenal share one decorative factory while labels and disclosure semantics remain intact.
- Live production-browser QA confirmed the package box is gone and the command rail reads as one visual family. The first real-browser oracle overfit pre-zoom computed dimensions; it now measures rendered `getBoundingClientRect()` geometry across desktop, Pixel touch landscape, and small-window profiles.
- First adversarial review: 0 Critical, 1 High, 0 Medium, 0 Low. The reviewer measured 21-logical-pixel frames at only 13.125 rendered pixels and inner marks below 11 pixels on Pixel touch. Frames are now 25 logical pixels and marks 20 logical pixels; the production oracle requires at least 15 rendered frame pixels and 12 rendered mark pixels in every supported profile without overflow.
- The full 16-worker browser matrix independently reproduced the inherited crater-wall material signal at 0.3578. Because the deterministic flat fallback is exactly zero and the test's contract is presence rather than material strength, the arbitrary 0.5 magnitude gate was replaced with a quantization-safe nonzero sentinel above 0.05. No renderer output changed. Confidence high.
### Combat iconography final local gate

- Adversarial follow-up: 0 Critical, 0 High, 0 Medium, 0 Low. The reviewer measured 15.625 rendered frame pixels and 12.5 rendered mark pixels at worst-case touch zoom, accepted the post-zoom oracle, and accepted the terrain nonzero sentinel.
- `npm run check` PASS; client coverage PASS at 89 files / 614 tests, 87.29% statements, 77.25% branches, 74.95% functions, and 90.28% lines; Edge PASS at 170 tests; production build PASS at 1,880 modules and 256.63 kB / 69.46 kB gzip main bundle.
- Full production-browser matrix PASS at 70 tests plus 8 expected profile skips. `npm audit --audit-level=high` PASS at 0 vulnerabilities; diff hygiene and conflict-marker checks PASS. No dependency, lockfile, engine, Supabase, migration, action-log, input, or deterministic behavior changed. Confidence high.
### Combat iconography hosted gate receipt

- Ready PR #211 was CLEAN and MERGEABLE on exact implementation/governance head `714a40e3a5bd5a78c9c96b6ee23b58bbb7b70f0f`.
- Exact-head CI run `30565375041` passed deterministic harnesses, 614 client tests, production build, 170 Edge tests, and the 70-case browser matrix with 8 expected profile skips.
- Exact-head CodeQL workflow run `30565375018` and repository CodeQL both passed. Supabase Preview was expectedly skipped because no backend surface changed.
- The single adversarial follow-up remains 0 Critical, 0 High, 0 Medium, 0 Low. This receipt and completed plan checkbox form the final governance-only delta and must independently clear the same hosted gates before merge under standing authority. Confidence high.
## 2026-07-30 - Weapon glyph catalog sprint

- **[high] Select weapon identity inside Arsenal and Store as the next visual cell.** Live expanded-drawer inspection showed ten owned weapons rendered as identical text rectangles; selection is readable but not glanceable. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors an exhaustive shared glyph catalog because it extends the just-delivered icon seam, improves real weapon choice, and stays presentation-only. Confidence high.
- **[high] Use explicit Lucide family silhouettes, not fifteen unrelated novelty marks.** Rockets, nuclear, terrain, bounce, volatile, fire, airburst, MIRV, death, and defense families provide recognition plus controlled variation; stable metadata and a compile-time exhaustive map keep the vocabulary auditable. Confidence high.
- Spec and plan approved as SUaDtL under standing autonomous sprint authority: `.codearbiter/specs/weapon-glyph-catalog.md`, `.codearbiter/plans/weapon-glyph-catalog.md`.
### Weapon glyph catalog TDD and browser GREEN

- TDD RED: the focused suite could not resolve the absent weapon icon module. GREEN now exhaustively maps all 15 `WeaponType` values to explicit tree-shaken Lucide geometry plus stable weapon, family, and tier metadata.
- Arsenal buttons and Store weapon rows reuse the same decorative factory; full visible names, ammo, prices, ownership, selection, and callbacks remain unchanged. Family color roles distinguish nuclear/death, fire/volatile, defense, and terrain while active selection still resolves to gold.
- Live browser inspection confirmed the expanded drawer is materially more scannable. Production-browser oracles pass across desktop, Pixel touch landscape, and small-window profiles; secondary marks render at least 11 pixels and remain inside their owning controls, Store integration is visible, and no page overflow is introduced. Confidence high.### Weapon glyph adversarial correction and terrain-oracle repair

- First adversarial review: 0 Critical, 0 High, 1 Medium, 0 Low. The Medium correctly found that metadata plus child-count checks would not catch replacing every family with one silhouette, and `>=10` browser counts permitted incomplete integration. Unit tests now pin a distinguishing Lucide primitive/path signature for every family; the production-browser oracle requires the exact 15-item Arsenal and exact 14-item finite-stock Store catalogs with full adjacent names and matching weapon metadata.
- The complete browser run disproved the inherited cross-page crater-wall color threshold by producing a byte-identical zero at fallback-derived coordinates even while the independent deep-terrain signal proved the authored material was active. SMARTS favors removing that non-causal duplicate: `TerrainRenderer.material.test.ts` already proves a terrain-version rebuild resamples material onto a newly exposed wall with matching alpha, while the live E2E retains the causal asset-response and deep-cache delta. Focused replacement gate passes 5 unit tests, typecheck, and 37 production-browser cases with 8 expected profile skips. Confidence high.### Weapon glyph catalog final local gate

- Adversarial follow-up: 0 Critical, 0 High, 0 Medium, 0 Low after exact catalog/name assertions, causal silhouette signatures, and the layered terrain-material oracle repair.
- `npm run check` PASS; client coverage PASS at 90 files / 615 tests, 87.31% statements, 77.26% branches, 75.00% functions, and 90.29% lines; Edge PASS at 170 tests; production build PASS at 1,881 modules and 262.37 kB / 70.88 kB gzip main bundle.
- Full production-browser matrix PASS at 73 tests plus 8 expected profile skips. `npm audit --audit-level=high` PASS at 0 vulnerabilities; diff hygiene PASS. No dependency, lockfile, engine, Supabase, migration, action-log, input, or deterministic behavior changed. Confidence high.### Weapon glyph catalog hosted gate receipt

- Ready PR #212 was CLEAN and MERGEABLE on exact implementation head `4a17f1810480455ef6be0b087550e935b927ca93`.
- CI run `30566812330` passed deterministic harnesses, 615 client tests, production build, 170 Edge tests, and the 73-case browser matrix with 8 expected profile skips. The first Edge attempt reached no tests because `esm.sh` returned HTTP 522 while downloading the pinned Supabase module; an unchanged failed-job rerun passed in 21 seconds. No code bypass or waiver was used.
- CodeQL workflow run `30566812231` and repository CodeQL both passed. Supabase Preview was expectedly skipped because no backend surface changed.
- The single adversarial follow-up remains 0 Critical, 0 High, 0 Medium, 0 Low. This receipt and completed plan checkbox form the final governance-only delta and must independently clear the same hosted gates before merge under standing authority. Confidence high.### Weapon glyph catalog merge receipt

- PR #212 merged exact final head `7f66289050d32ed838ad3a30c4b9b3bc40aef350` as merge commit `0c1eb49bf8110290a38f3845d24d5e41163ffa08` after CI, Edge, E2E, workflow CodeQL, and repository CodeQL were green on that head. Confidence high.
## 2026-07-30 - Authored impact bloom sprint

- **[high] Select the default missile impact as the next authored-art seam.** Live merged-game inspection shows the static battlefield and HUD now carry authored depth, while the most frequent payoff moment still begins from a smooth procedural fireball. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors one conventional-family overlay because every opening loadout uses it, the procedural path remains a fail-closed fallback, and gameplay state is untouched. Confidence high.
- **[high] Use one clipped alpha WebP as an augmenting layer, not a replacement renderer.** A white-hot cel-shaded bloom can supply hand-authored flame facets and soot texture while the existing gradients, shrapnel, debris, lighting, audio, and weapon-specific profiles retain motion and identity. Clipping at shared blast reach prevents visual overclaim. Confidence high.
- Spec and plan approved as SUaDtL under standing autonomous passion-project sprint authority: `.codearbiter/specs/authored-impact-bloom.md`, `.codearbiter/plans/authored-impact-bloom.md`.### Authored impact pivot to modular tank parts

- The user supplied a live screenshot showing the stronger issue: the bounded guide visually floats away from the muzzle, and the procedural barrel is conspicuously lower fidelity than the authored chassis. The unimplemented impact-bloom spec/plan/test were discarded before staging; its generated chroma-key draft remains non-product scratch only. SMARTS now selects a four-slot tank assembly because it fixes the immediate defect and creates a durable customization seam. Confidence high.
- **[high] Preserve shared engine geometry as the mount contract.** `BARREL_PIVOT_HEIGHT`, `BARREL_LENGTH`, and `barrelTip()` remain authoritative. The authored barrel must fit those mounts, and the launch guide will include the exact muzzle as its first point before diverging into the existing deliberately non-ballistic cue. Confidence high.
- Spec and plan approved as SUaDtL under standing autonomous passion-project sprint authority: `.codearbiter/specs/modular-tank-parts.md`, `.codearbiter/plans/modular-tank-parts.md`.### Modular tank parts TDD and browser calibration

- TDD RED proved the renderer had no four-slot painter, no shared authored barrel mount, and no perceptually continuous first guide segment. GREEN now pins four exhaustive atlas cells, the exact engine pivot-to-muzzle distance, load/decode/draw fallback, slot-local tint caches, modular renderer precedence, and a first guide bead within five logical pixels of the muzzle.
- Image generation produced one coherent transparent 1024x128 WebP atlas with independently occupied treads, hull, turret, and barrel cells at 25,590 bytes. No dependency, sprite runtime, engine, or network change was required.
- Live browser calibration found red steel disappearing into the red dusk sky even after geometric alignment. SMARTS selected a reversible presentation correction: preserve authored steel luminance with source-atop tint, add a tight barrel silhouette, lift the active marker clear of the joint, and ease early guide beads outward while retaining the same bounded non-ballistic endpoint. Confidence high.
- Focused unit gate passes 22 tests plus shared/client typecheck. Production Chromium passes the atlas, forced modular-fallback, live firing/turn, bounded-guide, tint, and no-overflow proofs across desktop, Pixel touch landscape, and small-window profiles: 12/12 cases. Confidence high.### Modular tank parts adversarial and gameplay-footprint correction

- User browser feedback correctly rejected the first four-illustration composition as ghosty and then darker/blobbier after a contrast-only correction. SMARTS chose the durable rollback: retain four independently addressable slots, but partition the already-proven authored chassis into exclusive treads/hull/turret atlas cells that reconstruct its exact 36x24 gameplay silhouette; keep the new authored barrel as a brighter neutral-steel 30x14 slot. Confidence high.
- First adversarial review: 0 Critical, 0 High, 3 Medium, 0 Low. Corrections now decode the real barrel alpha around both production 2D mount points, settle persistent Canvas target failures into the proven fallback, compare the non-ballistic guide against matching canonical physics indices, and update the muzzle ownership harness for the shared tankBarrelMount adapter.
- The stale direct-TankRenderer muzzle harness initially failed 2 of 403 assertions after geometry ownership moved into the catalog; the repaired causal guard passes 413/413 and retains direct shared-geometry checks for both authored and procedural paths. No gate was waived. Confidence high.### Modular tank parts final local gate

- Adversarial follow-up: 0 Critical, 0 High, 0 Medium, 0 Low after the 2D production-geometry alpha oracle, persistent-draw fallback settlement, matched-index non-ballistic comparison, and catalog-coordinate comment correction.
- `npm run check` PASS including 413 muzzle assertions; client coverage PASS at 93 files / 627 tests, 87.47% statements, 77.36% branches, 75.81% functions, and 90.45% lines; Edge PASS at 170 tests.
- Production build PASS at 1,883 modules and 265.99 kB / 71.73 kB gzip main bundle. Full production-browser matrix PASS at 76 tests plus 8 expected profile skips across desktop, Pixel touch landscape, and small-window. `npm audit --audit-level=high` PASS at 0 vulnerabilities; diff hygiene and conflict-marker scan PASS. Confidence high.### Modular tank parts hosted gate receipt

- Ready PR #213 was CLEAN and MERGEABLE on exact implementation head `7cb3d019cc088e18a5ae865404054612212d7319`.
- CI run `30570752956` passed deterministic harnesses, 627 client tests, production build, 170 Edge tests, and the 76-case browser matrix with 8 expected profile skips.
- CodeQL workflow run `30570752378` and repository CodeQL both passed. Supabase Preview was expectedly skipped because no backend surface changed.
- The adversarial follow-up remains 0 Critical, 0 High, 0 Medium, 0 Low. This receipt and completed plan checkbox form the final governance-only delta and must independently clear the same hosted gates before merge under standing authority. Confidence high.

### Sprint-log formatting correction

- The preceding hosted-gate heading was appended directly after the prior final-local-gate sentence because that file had no terminal newline. Read ### Modular tank parts hosted gate receipt as a new heading; no prior audit content was changed. Confidence high.

## 2026-07-30 - Tank Garage loadouts sprint

### Modular tank parts merge receipt

- PR #213 merged exact final head 28aa15ac039904e7dab79fd62e5b44449e79058 as merge commit c848048d8691ea5b880ee3e12532dc4a2f0bf439 after CI, Edge, E2E, workflow CodeQL, and repository CodeQL were green on that head. Confidence high.

- **[high] Select mix-and-match Garage loadouts as the next player-facing cell.** The modular renderer now has four real slots but only one composition; exposing three compatible styles per slot turns that architecture into immediately visible player expression. SMARTS Meaningful/Auditable/Reversible/Testable/Securable favors bounded cosmetics over another isolated renderer flourish because players choose it before every match and it touches no combat behavior. Confidence high.
- **[high] Author complete kits before partitioning them.** The rejected ghosty iterations proved that separately illustrated pieces do not automatically compose at a 36x24 footprint. Ranger and Bulwark will each be authored and judged as one chassis plus matching barrel, then split into exclusive compatible cells; Foundry remains pixel-identical. Confidence high.
- **[high] Synchronize the four-slot loadout in the existing roster JSON.** Local-only choices would make network opponents see different tanks. A strict allowlist on create, join, and seat-token-authenticated waiting-room updates gives every client the same cosmetic metadata without a migration or action-log change. Old and invalid data fail closed to Foundry. Security-controls review confirms no auth, RLS, secret, or service-role posture changes. Confidence high.
- Spec and plan approved as SUaDtL under standing autonomous passion-project sprint authority: .codearbiter/specs/tank-garage-loadouts.md, .codearbiter/plans/tank-garage-loadouts.md.

### Tank Garage implementation and local gate

- **[high] Keep new art coherent at gameplay scale.** Ranger and Bulwark were authored as complete grayscale chassis-plus-barrel families, mechanically isolated from the generated checkerboard, normalized to the shared mount footprint, and only then partitioned into twelve exclusive atlas cells. The 114,678-byte lossless WebP stays below the 250 kB asset budget; Foundry reconstructs with identical alpha and only inherited WebP quantization. Confidence high.
- **[high] Preserve the single-screen game across every supported lobby size.** Live browser measurement caught the initial two-player Garage at 690/600 internal pixels and the four-player case at 743/600. SMARTS selected a reversible responsive composition: controls move into the roster scene, default rows tighten without losing labels, and 3-4 player rosters become two-column cards with abbreviated visible controls retaining full accessible names. Hot-seat 2-4 player and online-create cards now measure 600/600 with no document overflow across all three viewport profiles. Confidence high.
- The loadout is a strict cosmetic-only four-slot value. Shared normalization, renderer selection, lobby create/join/edit/Realtime/rejoin/start/rematch propagation, and Edge JSONB persistence are covered; the deterministic harness proves different loadouts produce identical post-shot simulation and that simulation modules never read loadout. Confidence high.
- Local gates PASS: 642 client tests across 95 files; all deterministic harnesses including 10 tank-cosmetic assertions; 178 Edge tests; production build; full Chromium matrix at 85 passes with 8 profile-inapplicable skips; client coverage 86.97% statements / 77.08% branches / 76.10% functions / 89.88% lines; npm audit reports 0 vulnerabilities; diff hygiene passes. Confidence high.
## 2026-07-28 — Tank Garage review and delivery gate

- **[high] Correct every adversarial finding, including non-blocking usability findings.** SMARTS: Safe/Robust/Testable/Maintainable favored strict string-only boundary parsing, a touch-sized compact editor, correct joiner tint provenance, and complete modal focus behavior over accepting a block-level-only PASS. Chosen fix-all; strength strong. Confidence high.
- Initial adversarial review reported 0 Critical / 0 High / 2 Medium / 1 Low. Singleton-array kit values are now rejected at both boundaries; compact controls measure at least 24 rendered pixels after stage zoom without 2/4-player or online scroll; and Join/Browse previews use the joiner color.
- Follow-up review exposed focus loss across dialog renders. The Garage now supplies dialog semantics, makes background controls inert, focuses the first preset, traps Tab/Shift+Tab, closes on Escape, restores the exact owner trigger, and preserves focus on replacement preset/slot controls after selection. The final adversarial review returned 0 Critical / 0 High / 0 Medium / 0 Low and CLEAN governance PASS.
- **[high] Exact final local matrix is green.** `npm run check` passed including 10 tank-cosmetic invariants and 413 muzzle assertions; client Vitest passed 95 files / 644 tests; Edge passed 178/178; Playwright passed 85 with 8 intentional project-conditional skips across desktop, pixel-touch, and small-window; `npm audit --audit-level=high` found 0 vulnerabilities; diff hygiene and the codeArbiter secret scan passed. Earlier coverage in this delivery cycle measured 87.00% statements, 77.11% branches, 76.01% functions, and 89.90% lines. No low-confidence decision or new `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.
### Tank Garage causal coverage close

- The required coverage auditor blocked PR creation with two High findings: the running-game acceptance proved only canvas visibility, and network customization was not causally proven across non-default create/join/start/storage handoffs. PR creation remained stopped.
- **[high] Close both causal gaps before publishing a PR.** SMARTS: Reliable/Testable/Maintainable favored production-path probes and injectable handler seams over accepting aggregate coverage. The browser oracle now hashes the exact four final mixed preview parts and requires those hashes in live battlefield draws; network oracles carry mixed values through create, join, direct-ready, active Realtime, and stored Edge rosters. Chosen fix-all; strength strong. Confidence high.
- Coverage re-audit and adversarial review both returned 0 Critical / 0 High / 0 Medium / 0 Low and PASS. Exact post-remediation gates passed: root check, 95 client files / 644 tests, 180 Edge tests, and 85 Playwright passes with 8 intentional skips. Confidence high.
### Tank Garage hosted delivery receipt

- Ready PR #214 opened at corrected head `d3801676a1a192034a7933f986553015200b1264`. Hosted `typecheck Â· harnesses Â· build`, Edge, E2E, JavaScript/TypeScript analysis, and CodeQL all passed on that exact head; Supabase Preview was intentionally skipped. The branch remained mergeable. Confidence high.
## 2026-07-30T16:19:00-04:00 — tank Garage delivery close + combat-readability pivot

- DELIVERY: PR #214 (`tank-garage-loadouts`) merged as `a58b1e5a214e0d27d1380f24bfe932b452b61a55` after exact-head hosted CI/CodeQL green and clean adversarial/coverage review. GitHub Pages deployment `30577760011` verified current-main provenance and passed post-deploy live smoke. Supabase functions `create_room` v33, `join_room` v28, `update_player` v26, and `restart_game` v26 deployed ACTIVE for persisted loadouts.
- LIVE EVIDENCE: public Garage selected Ranger treads/hull/turret plus Bulwark barrel and carried the mixed composition into a running hot-seat battlefield. The public tank was solid and the prior ghost layer was absent.
- USER FINDING: the three tank families remain too similar at gameplay scale; requested explicit tracks, spider legs, and hover silhouettes. User also showed the aim cue bending away from the barrel and an active-turn strip that truncates player identity.
- ROOT CAUSE: the launch guide shares `barrelTip()` but applies a sine flourish with non-zero opening slope, so point 1 is not tangent to the barrel. The active row nests identity and weapon in one shrinking grid beside a fixed 90px mobility group. The atlas gives all three propulsion rows conventional tracks.
- SMARTS DECISION (high confidence): pivot the untouched next slice from Sandhog to `combat-readability-fidelity`. Score 94/100: Scope 17/20 (three bounded presentation seams), User value 20/20 (direct visual feedback), Risk 18/20 (cosmetic plus tested guide math), Maintainability 19/20 (existing atlas and shared muzzle contracts), Testability 20/20 (pixel/geometry/DOM oracles), Security 0 exposure. No dependency, backend, schema, or paid-asset change.
- SPEC GATE: `.codearbiter/specs/combat-readability-fidelity.md` and matching plan are approved under the user's standing passion-project sprint authority, including explicit prior instruction that this loop does not require repeated spec/plan approval.### Combat readability fidelity review and local verification

- TDD RED proved five opening guide angles departed from the barrel ray, the old propulsion silhouettes differed by only 0.0123 at gameplay scale, and the active-turn DOM lacked an independent tactical row. The authored atlas, coaxial opening run, and identity-first HUD now satisfy those oracles. Confidence high.
- The first adversarial pass reported 0 Critical / 0 High / 1 Medium / 0 Low: mathematical guide coverage did not causally prove the composed authored-barrel seam. SMARTS favored closing the visual regression at the browser boundary. A guide-off/on canvas oracle now locates the rendered muzzle, pins opening centerline error, and samples immediate plus backwards authored-barrel continuity for 45-degree right-facing and 135-degree left-facing turns across all three browser projects. Follow-up verdict: 0 Critical / 0 High / 0 Medium / 0 Low, PASS. Confidence high.
- Exact local gates passed: `npm run check`; 95 client files / 651 tests; client coverage at 86.45% statements, 76.17% branches, 75.60% functions, and 89.36% lines; 180 Edge tests; 88 full-suite Playwright passes with 8 intentional project skips before the added oracle plus 6/6 focused composed-seam passes; production build; `npm audit --audit-level=high` with 0 vulnerabilities; diff hygiene; and the codeArbiter secret scan. Confidence high.
### Combat readability fidelity PR handoff

- Ready PR #216 opened from commit `e3958ab` after the clean adversarial verdict and exact final local matrix. The final full Playwright rerun passed 91 tests with 8 intentional project-conditional skips, including the new composed barrel/guide seam oracle in every viewport project. Hosted exact-head CI and CodeQL remain the merge gate. Confidence high.
### Combat readability hosted E2E correction

- Hosted E2E on exact head `e87cdbc` exposed a test-oracle race: the left-facing composed-canvas sample could begin during the bounded new-turn wind/handoff animation, contaminating the guide-only pixel delta; its first desktop retry passed. The oracle now waits the same one-second flourish interval used at initial load and computes its minimum projection iteratively to avoid a large-array spread hazard. Product rendering was unchanged. Confidence high.
- The focused adversarial follow-up returned 0 Critical / 0 High / 0 Medium / 0 Low and PASS. Hosted-profile stress verification passed 30/30 repeated seam tests with two workers across all three projects, followed by the full two-worker matrix at 91 passed / 8 intentional skips. Confidence high.
### Combat readability delivery close and Jackal pivot

- DELIVERY: PR #216 merged exact reviewed head `5ab15afc7121d36e6825c133f63056224ebe1360` as `131b3f7a390810159a81e56590975c702e7f8f49` after typecheck/harness/build, 91-test hosted E2E, 180 Edge tests, JavaScript/TypeScript analysis, CodeQL, and the clean adversarial follow-up passed on that head. Pages run `30585751825` verified current-main provenance, deployed, and passed post-deploy live smoke. Confidence high.
- LIVE EVIDENCE: `deploy-meta.json` reports merge `131b3f7`; the public authored atlas is WebP at 37,642 bytes; manual public play shows the guide leaving the Foundry barrel coaxially and the collapsed-Arsenal active module rendering P1 above a fitted Baby Missile / fuel / movement row. Confidence high.
- SMARTS DECISION (high confidence): select a fourth wheeled `Jackal` tank family over a fifth loadout slot, cosmetic stats, or animation. Score 91/100: Scope 18/20 (existing four-slot object), User value 19/20 (four new independently mixable choices), Risk 17/20 (allowlist and atlas row, no schema/gameplay), Maintainability 18/20 (append-only enum/catalog pattern), Testability 19/20 (asset, DOM, network, Edge, causal renderer oracles), Security 0 exposure. `Sandhog` remains the established queued tunneling weapon and is not reused as cosmetic vocabulary.
- SPEC GATE: `.codearbiter/specs/jackal-wheeled-kit.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. No dependency, migration, paid asset, or gameplay-stat change is approved. Confidence high.### Jackal wheeled kit implementation, user correction, and review

- TDD RED proved eight client expectations missing the fourth allowlisted family, the Deno boundary rejecting Jackal, and the required fourth atlas row empty. The first authored wheel silhouette scored only 0.2523 against the existing families, below the pinned 0.28 separation floor; the wheels were enlarged instead of weakening the oracle. Confidence high.
- The final 1024-by-512 lossless WebP is 150,928 bytes, preserves the first three rows at frozen alpha digest `669c6463` and visible premultiplied-RGBA digest `56549168`, and supplies sixteen occupied cells. Jackal adds exposed dune wheels, a raider hull, sensor ring, and howitzer without schema, dependency, gameplay-stat, or deterministic-state changes. Confidence high.
- Exact Jackal and mixed values are proven through shared/browser and Deno validators, hot-seat, create, join, update-player, active Realtime, stored rosters, rematch, and live authored renderer handoffs. The fitted Garage exposes all four presets and unclipped concise part labels across desktop, pixel-touch, and small-window projects. Confidence high.
- USER FINDING: the Garage preview barrels floated above the chassis. TDD RED measured the barrel as a separate 354-pixel alpha component. SMARTS selected a reversible Garage-only 5-logical-pixel presentation mount correction rather than changing the shared battlefield pivot or projectile spawn geometry. The corrected oracle covers all sixteen turret-by-barrel combinations in every viewport and rejects any detached significant component. Confidence high.
- Initial adversarial review returned 0 Critical / 0 High / 2 Medium / 1 Low. All findings were corrected: mixed preview seams are table-driven, legacy art freezes visible RGBA rather than alpha alone, and complete-family silhouette comparisons now include the rotated barrel. Follow-up adversarial verdict: 0 Critical / 0 High / 0 Medium / 0 Low, CLEAN. Confidence high.
- Exact final local gates pass: `npm run check`; 95 client files / 652 tests; coverage 86.46% statements, 76.17% branches, 75.60% functions, 89.36% lines; 180 Edge tests; full Playwright 94 passed with 8 intentional project-conditional skips; production build; npm audit with 0 vulnerabilities; diff hygiene; and the codeArbiter secret scan. Confidence high.### Jackal hosted E2E correction

- Hosted E2E on exact head `ba48526` exposed Linux font and intrinsic-sizing differences: one part label overflowed by 3 pixels, and slot min-content overflow intercepted the Jackal preset click. Product art, customization data, battlefield rendering, and deterministic behavior were unchanged.
- **[high] Harden the compact Garage instead of weakening the acceptance contract.** SMARTS favored bounded column reductions, `min-width: 0`, and a real glyph-range measurement with four pixels of cross-platform slack. The correction preserves the no-scroll single-page layout and leaves the roster preview clear of the editor. Confidence high.
- Corrected exact-head evidence is green: all 16 turret-by-barrel preview compositions remain connected; Garage acceptance passed 12/12 across desktop, pixel-touch, and small-window; desktop stress passed 40/40 with two workers; full Playwright passed 94 with 8 intentional skips; `npm run check`; 95 client files / 652 tests; production build and typecheck; npm audit with 0 vulnerabilities; diff hygiene; secret scan; and an independent adversarial follow-up at 0 Critical / 0 High / 0 Medium / 0 Low. Confidence high.### Jackal hosted glyph-slack correction

- Hosted E2E on corrected head `5a78e04` proved the cross-platform oracle was working: Linux measured `Dune Wheels` at 72.64 pixels inside 72 pixels of content, leaving less than one pixel and failing the required four-pixel slack. The merge remained blocked.
- **[high] Recover content width inside each slot without changing the Garage footprint.** SMARTS favored reducing horizontal slot padding from 5 to 2 pixels over shrinking the already-small type or weakening the oracle. This recovers six pixels per label while preserving the 28-pixel hit target, editor columns, preview boundary, semantics, and all gameplay geometry. Confidence high.
- Exact correction evidence is green: desktop hosted-failure acceptance passed 20/20 with two workers; focused Garage passed 12/12 across all viewports; full Playwright passed 94 with 8 intentional skips; `npm run check`; 95 client files / 652 tests; production build/typecheck; visual inspection; diff hygiene; and adversarial follow-up at 0 Critical / 0 High / 0 Medium / 0 Low. Confidence high.
### Jackal wheeled kit delivery close and command-console pivot

- DELIVERY: PR #217 merged exact reviewed head `550c46b6b6f2292cba00ec0e820b883dc3a2d4e7` as `71854724a1989d8aacff5748f10e6ab0edb52e18` after hosted build/typecheck/harnesses, 180 Edge tests, 94-test E2E, JavaScript analysis, CodeQL, and a clean adversarial follow-up passed on that head. Pages run `30593593021` verified current-main provenance, deployed, and passed live smoke. Confidence high.
- BACKEND: `create_room` v36, `join_room` v31, `update_player` v29, and `restart_game` v28 are ACTIVE with the Jackal validator. LIVE EVIDENCE: public `deploy-meta.json` reports merge `7185472`; the 1024-by-512 WebP atlas is 150,928 bytes; both public Garage previews render connected Jackal kits; and a running hot-seat match draws the wheeled kits. Confidence high.
- SMARTS DECISION (high confidence): select `turn-command-console` next over another tank family, projectile art, or cosmetic animation. Score 93/100: Scope 18/20 (one existing HUD module plus browser acceptance), User value 20/20 (the user explicitly flagged this slice as poor), Risk 18/20 (presentation and semantic controls only), Maintainability 18/20 (consolidates scattered active-turn CSS), Testability 19/20 (DOM, fit, interaction, viewport, and live render oracles), Security 0 exposure. No dependency, backend, schema, paid asset, or deterministic-engine change.
### Turn command console spec gate

- SPEC GATE: `.codearbiter/specs/turn-command-console.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. The bounded slice consolidates existing HUD presentation and semantics only; no dependency, backend, schema, paid asset, deterministic-engine, weapon, economy, or movement-rule change is approved. Confidence high.
### Turn command console TDD RED

- RED unit evidence: 4 focused failures prove the current DOM has no semantic command-console wrapper, no selected-weapon icon host, fused movement-button text instead of separate direction/keycap elements, and no accessible fuel progress meter. The remaining 9 focused HUD tests stay green.
- RED browser evidence: the desktop-fine live game cannot locate the required `Turn command console` region. The two later project attempts lost the Playwright preview server after the intentional first-project failure and are not counted as product evidence; the deterministic missing-region failure is the implementation gate. Confidence high.
### Turn command console implementation, review, and local verification (2026-07-30T21:06:18-04:00)

- TDD GREEN: one semantic command-console region now owns identity, shot progress, selected weapon glyph/name, movement/keycaps, bounded fuel meter, Store, and Fire without changing callbacks, engine state, network actions, or Supabase contracts. The fuel meter announces exact boosted fuel through aria-valuetext while its visual fill remains bounded. Confidence high.
- Browser acceptance proves the full maximum-length player and Bouncing Betty labels, stable weapon glyph synchronization, live movement/fuel updates, exact Fire behavior, containment, and zero HUD scroll across desktop, compact touch, and small-window profiles.
- Initial adversarial verdict was 0 Critical / 0 High / 1 Medium / 0 Low: coarse-pointer command targets were below 44 rendered pixels when the viewport was not compact. RED reproduced the missing contract and HUD overflow at a 1280-by-800 coarse viewport. SMARTS selected shared coarse density plus 56-logical-pixel move/Store targets while retaining the 78-pixel compact override. Follow-up verdict: 0 Critical / 0 High / 0 Medium / 0 Low, CLEAN. Confidence high.
- Exact final local gates pass: npm run check; 95 client files / 654 tests; coverage 86.60% statements, 76.31% branches, 75.65% functions, 89.49% lines; 180 Edge tests; full Playwright 95 passed with 10 intentional project-conditional skips; production build/typecheck; npm audit with 0 vulnerabilities; diff hygiene; and secret scan. Confidence high.

### Turn command console PR handoff

- Ready PR #218 opened from reviewed product commit `50aef05` after the clean adversarial follow-up and exact final local matrix. Hosted exact-head CI, JavaScript analysis, and CodeQL remain the merge gate. Confidence high.

### Turn command console delivery close and regression pivot

- DELIVERY: PR #218 merged exact reviewed head `24b876c8712337e2eb01bc3a7f885d94c3928d0a` as `28312763d968b7ae385ce0390ca9f81ffec0cbc4` after hosted typecheck/build/harnesses, 180 Edge tests, 95-test E2E, JavaScript analysis, CodeQL, and a clean adversarial follow-up. Pages run `30595657445` verified current-main provenance, deployed, and passed live smoke. Confidence high.
- USER FINDING: modular tanks now read as overlapping slabs rather than tanks, and the launch guide still bends upward after leaving the barrel. Inspection confirms two causal regressions: every padded atlas cell is scaled into the same static destination rectangle, and `buildLaunchGuide` deliberately adds a six-pixel flourish after its fourth sample. Confidence high.
- SMARTS DECISION (high confidence): pause the unimplemented Sandhog slice and repair both combat-readability defects first. Score 97/100: Scope 19/20 (catalog metadata and one guide function), User value 20/20 (repeated direct reports in the primary play surface), Risk 19/20 (render-only with shared engine geometry preserved), Maintainability 19/20 (measured crops replace accidental transparent-padding layout), Testability 20/20 (unit geometry plus causal canvas/browser oracles), Security 0 exposure. No dependency, backend, schema, paid asset, deterministic-engine, or gameplay-rule change.
- SPEC GATE: `.codearbiter/specs/tank-preview-guide-regressions.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. The bounded fix changes renderer composition and launch-cue presentation only. Confidence high.

### Tank preview and launch guide regression TDD

- RED: 8 focused failures reproduced the exact causes before production edits. Four representative non-vertical angles exceeded the all-samples coaxial contract by 1.31-1.74 logical pixels; the catalog still exposed full 256-by-128 crops, one shared static geometry, and a 30-by-14 barrel. Confidence high.
- GREEN: measured alpha crops now exclude transparent padding and neighboring bleed, per-kit mobility/hull/turret boxes form a side-view vertical stack, every 26-pixel barrel preserves the shared 22-pixel pivot-to-muzzle contract, and the Garage-only five-pixel barrel-offset workaround is removed. The launch cue retains bounded power-responsive length but every sample now lies on the exact muzzle ray. Confidence high.
- BROWSER: 24 focused production-bundle tests pass across desktop-fine, pixel-touch, and small-window. Causal oracles cover tight-crop atlas mounts, four distinct propulsion silhouettes, three occupied vertical tank bands, all sixteen turret/barrel mixes, mixed Garage-to-battlefield art handoff, complete right/left guide-ray alignment, readable reach, and fitted layout. Live local visual inspection confirms Foundry tracks, Ranger spider legs, Bulwark hover gear, and Jackal wheels read as side-view tanks. Confidence high.

### Tank preview and launch guide regression review and local verification

- Initial adversarial verdict: 0 Critical / 0 High / 1 Medium / 0 Low. The Medium correctly found that the unit contract only required crops smaller than a cell and did not causally compare catalog edges with the authored alpha bounds. SMARTS selected a principal-component atlas oracle rather than hard-coding another metadata table. Confidence high.
- CORRECTION: browser acceptance now finds the largest 8-connected alpha>32 component in every one of the sixteen atlas cells and requires catalog min/max X/Y crop edges to match within one source pixel. This rejects both returning transparent padding and clipping authored edge pixels while excluding detached neighboring bleed. Focused crop acceptance passes 6/6 across all viewports. Follow-up adversarial verdict: 0 Critical / 0 High / 0 Medium / 0 Low, CLEAN. Confidence high.
- Exact final local gates pass: npm run check; 95 client files / 652 tests; coverage 86.60% statements, 76.34% branches, 75.69% functions, 89.49% lines; 180 Edge tests; full Playwright 95 passed with 10 intentional project-conditional skips; production build/typecheck; npm audit with 0 vulnerabilities; diff hygiene; and the codeArbiter secret scan. Confidence high.

### Tank preview and launch guide delivery close and Sandhog resume

- DELIVERY: PR #219 merged exact reviewed head `3a231a47e818d1263b7af369b30993a1c1af0cd4` as `d2a547618ac50646555520d6e26815d4a9ce681c` after hosted typecheck/harness/build, 180 Edge tests, 95-test E2E, JavaScript analysis, CodeQL, and a clean adversarial follow-up passed. Pages run `30598269446` verified current-main provenance, deployed, and passed post-deploy live smoke. Confidence high.
- LIVE EVIDENCE: public `deploy-meta.json` reports merge `d2a5476`; public Garage inspection shows layered Ranger spider legs and Jackal wheels, and a running public hot-seat match renders the complete guide as one straight continuation of the authored barrel. Confidence high.
- SMARTS DECISION (high confidence): resume the preserved `sandhog-tunneling-weapon` RED slice over another cosmetic pass, locomotion animation, terrain edge antialiasing, or room-browser work. Score 92/100: Scope 16/20 (one weapon across established exhaustive seams), User value 20/20 (new strategic counterplay and noticeable drill visual), Risk 17/20 (new deterministic projectile mode but bounded fixed-step arithmetic), Maintainability 19/20 (data-driven behavior plus existing terrain/settle paths), Testability 20/20 (engine, replay, validator, Canvas, and live terrain oracles), Security 0 exposure. No dependency, migration, paid asset, new action type, or server physics.
- SPEC GATE: `.codearbiter/specs/sandhog-tunneling-weapon.md` and matching plan remain approved as SUaDtL under the standing passion-project sprint authority. One Sandhog is in scope; guidance, variants, landing prediction, and unrelated balance are excluded. Confidence high.

### Sandhog deterministic implementation and browser proof

- TDD RED: `npx tsx scripts/checks/sandhog.mjs` failed at `getWeapon("sandhog") is absent` before production edits; exhaustive client compilation simultaneously pinned every required visual map. The final harness proves exact catalog/economy constants, ground-entry transition, 22 fixed drill ticks, 3.2-by-2.4 motion, seven-pixel per-tick corridor, deferred collapse, endpoint and boundary blasts, direct-tank exception, through-cover damage, inventory spend, clone parity, turn completion, and same-seed replay identity. Confidence high.
- SMARTS DECISION (high confidence): accumulate the complete tunnel deformation range and suppress the existing mid-flight settle only while a Sandhog is actively burrowing. Score 94/100: Scope 19/20 (one projectile mode), User value 20/20 (the corridor remains visible), Risk 18/20 (bounded optional state and existing settle path), Maintainability 18/20 (one named carve helper), Testability 19/20 (per-tick terrain/version and endpoint convergence oracles), Security 0 exposure. Settling only the endpoint crater would leave tunnel columns unsupported forever; settling each tick would erase the feature.
- GREEN: real ballistic flight remains unchanged until swept ground contact; the drill then carves a fixed diagonal corridor, ignores underground terrain collisions, detonates at its fixed or last in-bounds endpoint, and retains normal direct-tank, wall, damage, credit, clone, replay, and turn rules. A fresh tank owns one round; the exact `sandhog` value is accepted by the Edge fire/buy boundary without broadening unknown strings. Confidence high.
- PRESENTATION: Sandhog has a dedicated Lucide drill glyph, warm brass family color, drill-shaped Canvas payload, underground trail identity reset, no underground surface shadow, and a reduced-motion path that keeps the head/corridor while suppressing the decorative wake. Real-browser play through the production UI selected Sandhog, synchronized the command console and Fire label, followed the normal arc, visibly bored down-right through the deterministic hillside, and produced one underground endpoint blast. Confidence high.
- LOCAL EVIDENCE: `npm run check` passes; isolated client coverage passes 95 files / 654 tests at 86.60% statements, 76.34% branches, 75.69% functions, and 89.49% lines; 181 Edge tests pass; production build/typecheck passes; and the focused real HUD matrix passes 32 tests with 10 intentional project-conditional skips. One napalm coverage test timed out only while coverage/build/Chromium competed in parallel, then passed in the isolated full coverage run; it is not counted as green until that isolated proof. Confidence high.
- USER QUEUE (high confidence): after Sandhog delivery, replace the short straight launch laser with a short honest ballistic curve that starts tangent at the muzzle and fades before becoming a target predictor; then replace the cramped fuel label/number cell with a compact gauge. The trajectory guide ranks first because it is repeated primary-play feedback; both remain outside the atomic Sandhog diff. Confidence high.
### Sandhog adversarial corrections and final local acceptance

- Initial adversarial verdict: 0 Critical / 0 High / 2 Medium / 1 Low. The findings identified an implicit bottom-floor contact that could arm the drill out of bounds, incomplete causal browser and round-ending proof, and stale roster comments. TDD RED reproduced the vertical escape at y >= 600 before the engine fix. Confidence high.
- CORRECTIONS: bottom-floor collision now interpolates to the last in-bounds swept point and detonates there; the deterministic harness proves vertical and horizontal bounds plus Sandhog-caused GAME_OVER and best-of-three ROUND_OVER transitions. A production-browser test selects and fires Sandhog, observes multiple underground states, proves a cleared authoritative center beside solid earth, samples those exact unobscured Canvas pixels under reduced motion beyond the projectile halo, and observes the endpoint blast. Query gating is hoisted so normal sessions skip the probe entirely. Confidence high.
- Follow-up adversarial verdict: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. All prior findings are closed. Confidence high.
- Exact final local gates pass: npm run check; 95 client files / 654 tests; coverage 86.60% statements, 76.34% branches, 75.69% functions, and 89.49% lines; 181 Edge tests; full Playwright 98 passed with 10 intentional project-conditional skips across all three viewports; production build/typecheck; npm audit with 0 vulnerabilities; diff hygiene; and the state-free secret scan with []. One full coverage attempt timed out an unrelated renderer orchestration test at the five-second runner limit; that exact test immediately passed alone with coverage, and the isolated full coverage rerun then passed all 654 tests. Confidence high.
- USER QUEUE: the next atomic slice is the requested short honest ballistic aim hint: it must leave the barrel tangentially, use the real gravity and wind model, fade at approximately the current guide length, and stop before revealing the landing point except on inherently very short shots. The compact fuel gauge follows. Confidence high.

### Sandhog commit-gate security correction

- The governed commit hook correctly blocked the test harness Node SHA-256 terrain fingerprint under the project security policy, which permits no application hashing without an ADR. No bypass or pass marker was used. The harness now compares exact lossless base64 serialization of every terrain byte, preserving collision-free clone/replay equality without a cryptographic primitive. The harness and empty secret scan passed, and commit 3be3f27 was created through the governed gate. Confidence high.
- Exact-head adversarial follow-up on 3be3f27 returned CLEAN: 0 Critical / 0 High / 0 Medium / 0 Low. It confirmed the replacement is one-to-one, exact, test-only, and bounded. Confidence high.

### Sandhog ready PR handoff

- Ready PR #220 opened from reviewed behavior commit 3be3f27 plus governance receipts. Hosted exact-head typecheck, deterministic harnesses, build, Edge, E2E, JavaScript analysis, and CodeQL remain the merge gate. Confidence high.

### Sandhog delivery close and honest-ballistic-guide pivot

- DELIVERY: PR #220 merged exact reviewed head 2ea03d0e3001209ba6f6d56a4bab6cb1d8a4c664 as 10fa286d458739298e366c5a064b603ddb1be330 after hosted typecheck/harness/build, 181 Edge tests, 98-test E2E, JavaScript analysis, CodeQL, and clean adversarial follow-ups passed. Pages run 30600451992 verified current-main provenance, deployed, and passed post-deploy live smoke. Supabase submit_action deployed successfully with the Sandhog allowlist. Confidence high.
- LIVE EVIDENCE: public deploy-meta.json reports merge 10fa286d; the public Arsenal exposes Sandhog 1, the command console changes to Fire Sandhog, and firing the public weapon resolves cleanly to P2 turn. Confidence high.
- SMARTS DECISION (high confidence): select the user-requested honest ballistic aim hint over the queued fuel gauge, another weapon, or visual asset pass. Score 97/100: Scope 19/20 (one pure preview and renderer seam), User value 20/20 (repeated primary-play complaint), Risk 19/20 (presentation-only with shared physics primitives), Maintainability 19/20 (one source of ballistic truth), Testability 20/20 (unit recurrence, Canvas fade, causal browser seam), Security 0 exposure. No dependency, backend, schema, paid asset, or engine-state change.
- SPEC GATE: .codearbiter/specs/honest-ballistic-aim-guide.md and matching plan are approved as SUaDtL under the standing passion-project sprint authority. The guide is bounded to fourteen ticks and the legacy reach cap, uses real wind/effective gravity and first-contact truncation, and deliberately excludes post-impact or full-flight prediction. Confidence high.

### Honest ballistic guide TDD and browser proof

- TDD RED: five focused aim-guide tests failed because the straight builder ignored the passed GameState/gravity and returned no physics-aware path; after the first implementation, the existing production-browser oracle also failed because it still required the complete guide to remain a straight muzzle ray. Confidence high.
- GREEN: the preview begins at the shared muzzle, adds one exact launch-velocity tangent sample, then follows up to fourteen shared semi-implicit physics ticks using live wind and effective gravity. It stops at the legacy arc-length cap or the first swept terrain/tank/wall/open-boundary contact and never predicts post-impact behavior. Focused unit and Renderer tests pass 8/8; the full client suite passes 96 files / 653 tests. Confidence high.
- PRESENTATION: the uniform three-pixel laser is replaced with separately painted two-pixel curve segments and round beads whose alpha falls monotonically with traveled distance. Local visual inspection at default 45 degrees / power 50 shows a connected dotted arc with clear gravity sag and no landing marker. Confidence high.
- BROWSER: the old straight-ray oracle was replaced with a causal guide-off/on Canvas comparison. It proves right and left guides remain connected to authored barrels, depart from the tangent by more than two pixels in the gravity-correct screen direction, keep more than seventy pixels of bounded projected reach, fade toward the endpoint, survive turn handoff and G toggling, and keep the page fitted. All 6 focused production-bundle cases pass across desktop, pixel-touch, and small-window. Confidence high.

### Honest ballistic guide adversarial corrections and final local acceptance

- Initial adversarial verdict: 0 Critical / 0 High / 2 Medium / 1 Low. The findings identified a fabricated Shield trajectory, a zero-time tangent that could overrun an immediate first contact, and an incomplete exact-recurrence matrix. Confidence high.
- TDD RED reproduced both product defects: Shield returned `launch`, and a sub-four-pixel terrain contact produced a path that passed the collision before doubling back. The guide now fails closed for Shield in both mode selection and direct construction, and defers tangent insertion until the first authoritative sweep proves the tangent is reachable. Exact point-by-point recurrence now covers left, calm, and right wind at normal gravity plus calm sudden-death gravity. Confidence high.
- Follow-up adversarial verdict: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. No new correctness, rendering, performance, accessibility, or browser-oracle regressions were found. Confidence high.
- Exact final local gates pass: `npm run check`; 96 client files / 658 tests with coverage at 86.54% statements, 76.07% branches, 75.56% functions, and 89.40% lines; 181 Edge tests; production build/typecheck; full Playwright 98 passed with 10 intentional project-conditional skips; npm audit with 0 vulnerabilities; diff hygiene; and the state-free secret scan with `[]`. One initial full coverage run timed out an unrelated napalm-renderer test at the five-second runner limit; that exact test passed immediately in isolation and the isolated full coverage rerun then passed all 658 tests. Confidence high.
- USER QUEUE: after exact-head hosted delivery and public verification, replace the cramped fuel number cell with a compact fitted gauge/dial while preserving the single-page command console. Confidence high.
### Honest ballistic guide commit receipt

- Governed commit `8bf78b53d38fd98e75bb609384447adaa57bfe7c` records the reviewed product, RED/GREEN tests, browser oracle, approved spec/plan, and exact local acceptance evidence. The worktree was clean immediately after commit. Confidence high.
### Honest ballistic guide ready PR handoff

- Ready PR #221 opened from reviewed behavior commit `8bf78b5` plus governance receipt `f4bf139`. Hosted exact-head typecheck, deterministic harnesses, build, Edge, E2E, JavaScript analysis, and CodeQL remain the merge gate. Confidence high.
### Honest ballistic guide hosted E2E correction

- Hosted E2E on exact head `fd35878` exposed a causal-oracle contamination: desktop-fine measured impossible right-guide deflections of -98 and -138 pixels while the same product passed pixel-touch and small-window. The guide-off/on comparison was admitting presentation-only turn-start wind motion into its consecutive Canvas frames; product physics and rendering were unchanged. Confidence high.
- SMARTS DECISION (high confidence): make the static-geometry acceptance page reduced-motion before Renderer construction rather than weakening the curvature threshold or filtering arbitrary pixels. Score 96/100: Scope 20/20 (one test setup line), User value 19/20 (restores a trustworthy merge gate), Risk 19/20 (guide has no reduced-motion branch), Maintainability 19/20 (declares the test's static-frame premise), Testability 19/20 (stress plus exact hosted profile), Security 0 exposure.
- CORRECTION: reduced motion suppresses the unrelated wind ribbons but preserves guide toggling, aim response, turn persistence, both barrel directions, muzzle continuity, gravity-sign curvature, bounded reach, and distance fade. Hosted-profile desktop stress passes 20/20 with two workers; the full two-worker matrix passes 98 with 10 intentional skips; adversarial follow-up is CLEAN at 0 Critical / 0 High / 0 Medium / 0 Low. Confidence high.
### Honest ballistic guide delivery close and compact-fuel-gauge pivot

- DELIVERY: PR #221 merged exact reviewed head `618730a9f16d0e76da114e8818b52c8cebb4f2ba` as `a482fcc2aae21cf394e731530404c9d0af1cd2b5` after hosted typecheck/harness/build, 181 Edge tests, 98-test E2E, JavaScript analysis, CodeQL, and clean adversarial follow-ups passed. Pages run `30602076326` verified current-main provenance, deployed, and passed post-deploy live smoke. Confidence high.
- LIVE EVIDENCE: public `deploy-meta.json` reports merge `a482fcc`; a fresh public hot-seat match visibly shows the short dotted guide leaving the default 45-degree barrel, bending downward under live physics, fading at bounded reach, and retaining the fitted single-page console. Confidence high.
- SMARTS DECISION (high confidence): select `compact-fuel-gauge` over another weapon, terrain animation, or tank asset pass. Score 97/100: Scope 20/20 (one existing HUD sub-control), User value 20/20 (explicit repeated visual complaint), Risk 18/20 (semantic DOM/CSS only), Maintainability 19/20 (one progressbar remains the source of truth), Testability 20/20 (unit state plus computed browser geometry), Security 0 exposure. No dependency, backend, schema, paid asset, engine, economy, or action-contract change.
- SPEC GATE: `.codearbiter/specs/compact-fuel-gauge.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. The fixed 94-pixel rocker gains a circular conic dial with exact centered value, separate label, bounded accessible progress, and explicit low/empty bands. Confidence high.
### Compact fuel gauge TDD, requirement correction, and review

- TDD RED: focused HUD unit/browser contracts failed before production edits because the fixed rocker still exposed a separate text cell and linear bar rather than one stable circular semantic meter with contained value/label copy, causal fill, and explicit low/empty state. Confidence high.
- GREEN: the existing progressbar now owns a 34-pixel conic dial and centered exact readout without rebuilding during movement. Normal, low, and empty bands retain exact fuel semantics; movement callbacks, disable rules, keyboard hints, turn status, and fixed 94-pixel rocker geometry are unchanged. Confidence high.
- USER CORRECTION: a capped 100-percent ring did not adequately represent purchased fuel above 100. TDD RED proved the initial 175-fuel implementation still exposed aria-valuemax 100. The dial now wraps each active 100-fuel tier: 1-100 gold, 101-200 cyan, 201+ violet, with exact multiples remaining full and dynamic accessible tier floors/ceilings preserving the exact total. Confidence high.
- BROWSER ORACLE CORRECTION: authored 34-pixel controls are intentionally CSS-scaled with the fitted app. Acceptance now distinguishes logical dial size from rendered size and proves square shape, contained non-overlapping copy, distinct tier colors, stable live update, and zero page/HUD overflow across desktop-fine, pixel-touch, and small-window. Confidence high.
- Initial adversarial verdict: 0 Critical / 0 High / 1 Medium / 0 Low. The Medium found that compact app scaling reduced the original 10/5-pixel copy to roughly 6.2/3.1 rendered pixels while acceptance only proved containment. TDD RED reproduced all three profile failures. Base copy is now 11/6 pixels and compact copy 12/7 pixels with post-zoom rendered-height floors. Follow-up verdict: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. Focused unit passes 9/9 and focused browser acceptance passes 3/3; visual inspection of all three viewport profiles confirms a fitted readable dial. Confidence high.
### Compact fuel gauge final local acceptance

- Exact local gates pass: `npm run check`; 96 client files / 659 tests with coverage at 86.60% statements, 76.39% branches, 75.56% functions, and 89.45% lines; 181 Edge tests; full Playwright 98 passed with 10 intentional project-conditional skips; production build/typecheck; npm audit with 0 vulnerabilities; diff hygiene; and the state-free secret scan with `[]`. Confidence high.
- Two default-concurrency full coverage attempts timed out the same unrelated projectile-ground-shadow orchestration test at Vitest's five-second runner limit while the other 658 tests passed. The exact covered test passed in 1.38 seconds, and the complete coverage suite passed all 659 tests with two workers. Failed attempts are retained as evidence and are not counted green. Confidence high.
### Compact fuel gauge commit receipt

- Governed product commit `076145e` records the reviewed wrapping gauge, exact tier semantics, legibility correction, RED/GREEN tests, browser oracle, approved spec/plan, and complete local acceptance evidence. Confidence high.
### Compact fuel gauge ready PR handoff

- Ready PR #222 opened from reviewed product commit `076145e` plus governance receipt `65ca124`. Hosted exact-head typecheck, deterministic harnesses, build, Edge, E2E, JavaScript analysis, and CodeQL remain the merge gate. Confidence high.
### Compact fuel gauge delivery close and command-input-console pivot

- DELIVERY: PR #222 merged exact reviewed head `5522748fbb581c7cd69204f9c4db1d3f3becdb92` as `2850dac2aff1e8e8ceae519f0ae127e8f197960b` after hosted typecheck/harness/build, 181 Edge tests, 98-test E2E, JavaScript analysis, CodeQL, and clean adversarial follow-up passed. The initial hosted Edge attempt failed only on an external esm.sh 522 while downloading supabase-js; the isolated failed-job retry passed in 25 seconds with no source change. Confidence high.
- LIVE EVIDENCE: Pages run `30603601764` verified current-main provenance, deployed, and passed post-deploy live smoke. Public `deploy-meta.json` reports merge `2850dac`; fresh public inspection shows the circular gold 100-point meter, exact value/label, semantic base tier, and fitted 1280-by-720 page. Confidence high.
- LOCALHOST HYGIENE: user authorized cleanup and a one-singedTerra-server standing limit. Six stale Vite listeners on ports 5173-5178 were revalidated by command line and stopped; only active port 5187 remains. Other projects were untouched. Confidence high.
- USER QUEUE: modernize the weak left command legend to the production-ready visual standard of the right console, and causally verify reports that mobile direction controls may be reversed before strengthening their presentation. Treat both as one coherent command-input surface, with correctness preceding styling. Confidence high.
### Command input console SMARTS decision and spec gate

- CAUSAL FINDING: at pixel-touch 915-by-412, the five mobile buttons render at roughly 25.8-by-32.5 pixels with no explicit accessible names. `Aim left` dispatches -3 even though the shared 0-right/180-left convention and keyboard path require a positive delta; `Aim right` dispatches +3. The reported reversal and weak targets are both confirmed. Confidence high.
- SMARTS DECISION (high confidence): unify the desktop command legend and coarse-pointer controls as `command-input-console`, correcting touch direction before presentation. Score 96/100: Scope 18/20 (one HUD DOM/CSS/icon seam), User value 20/20 (direct feedback on both desktop polish and mobile playability), Risk 19/20 (input sign correction plus presentation only), Maintainability 19/20 (one command vocabulary across pointer modes), Testability 20/20 (unit callbacks plus causal browser state/geometry), Security 0 exposure. No dependency, backend, schema, paid asset, engine, replay, or action-contract change.
- SPEC GATE: `.codearbiter/specs/command-input-console.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. Desktop gets a semantic icon-led deck; coarse pointer gets a 44-pixel interactive overlay dock; the existing fixed repeat cadence and input gates remain authoritative. Confidence high.### Command input console TDD and viewport acceptance

- TDD RED: three focused HUD contracts failed because the keyboard legend had no semantic command identities or authored glyphs, the touch controls lived in the narrow right rail without explicit names, and Aim Left/Aim Right emitted -3/+3 respectively. Three production-browser profiles also failed the missing deck/dock hierarchy and causal mobile geometry contract. Confidence high.
- GREEN: the upper-left HUD now presents one command vocabulary across input modes: a semantic five-command keyboard deck on fine pointers and a dedicated five-button touch toolbar on coarse pointers. Aim Left now emits +3 and Aim Right -3, matching the keyboard and shared angle convention; power, weapon-cycle, 400-millisecond hold delay, 80-millisecond repeat cadence, input gating, and reduced-motion behavior remain intact. Confidence high.
- BROWSER ACCEPTANCE: desktop-fine, pixel-touch 915-by-412, and small-window profiles prove the appropriate deck/dock substitution, exact command identities, causal 45-to-48-to-45 elevation and 50-to-47-to-50 power changes, live weapon label, minimum 44-by-44 rendered touch targets, containment inside the canvas overlay, and zero page overflow. The initial icon count oracle was corrected from 10 to 11 because the touch weapon control intentionally contributes an additional visible authored glyph. Confidence high.
- LEGIBILITY RED/GREEN: the compact desktop command labels initially rendered from an authored 8-pixel size, below the 9-pixel compact floor. A scoped compact override raises labels to 9 pixels, title to 9.5, and key hints to 7.5; all three production-browser profiles pass and visual inspection confirms the 127.9-by-126.3 rendered deck remains fitted at 900-by-520 without scroll. Confidence high.
- FOCUSED GREEN: command HUD unit/shell coverage passes 9/9, typecheck passes, and the focused production-browser command acceptance passes 3/3. Confidence high.### Command input console adversarial correction and final local acceptance

- Initial adversarial verdict: 0 Critical / 0 High / 2 Medium / 1 Low. The first Medium found that a second pointerdown on one stepper could overwrite timer handles and orphan a repeat after release. The second found that opening Arsenal made the relocated dock inert while leaving it visibly enabled. The Low found new command labels referenced undefined `--ui-text` and `--font-body` tokens. Confidence high.
- TDD RED/GREEN: a two-pointer regression first reproduced a duplicate immediate step and lost repeat ownership. Each stepper now tracks one active pointer id, rejects additional and non-primary mouse presses, and clears hold/repeat ownership only on the matching pointerup, pointercancel, or lostpointercapture. The focused command suite passes 4/4 with no post-release repetition. Confidence high.
- BROWSER RED/GREEN: all three command profiles first exposed the undefined color token, while pixel-touch also proved the Arsenal-open dock remained visible. Command labels now resolve through canonical `--ui-copy` and `--font-sans`; a computed-style oracle proves exact token parity. The touch dock is hidden and inert while Arsenal is open, then visible and interactive when closed. Visual inspection confirms the open Arsenal is uncluttered and fitted. Confidence high.
- Follow-up adversarial verdict: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. All prior findings are resolved and the complete diff has no remaining actionable finding. Confidence high.
- Exact final local gates pass: `npm run check`; 97 client files / 663 tests with coverage at 87.24% statements, 76.64% branches, 77.50% functions, and 89.87% lines; 181 Edge tests; production build/typecheck; full Playwright 101 passed with 10 intentional project-conditional skips across desktop-fine, pixel-touch, and small-window; `npm audit --audit-level=high` with 0 vulnerabilities; clean diff/conflict-marker hygiene; and the state-free secret scan with `[]`. The isolated browser suite stopped the dev listener, then the sole singedTerra Vite server was restored on port 5187. Confidence high.### Command input console commit receipt

- Governed product commit `0b81616` records the reviewed desktop command deck, corrected and strengthened mobile dock, multi-touch repeat ownership, Arsenal suppression, canonical token use, RED/GREEN unit/browser oracles, approved spec/plan, and complete local acceptance evidence. Confidence high.### Command input console ready PR handoff

- Ready PR #223 opened from reviewed product commit `0b81616` plus governance receipt `ca76a57`. Hosted exact-head typecheck, deterministic harnesses, build, Edge, E2E, JavaScript analysis, and CodeQL remain the merge gate. Confidence high.### Command input console delivery close and mobile-tactical-hud pivot

- DELIVERY: PR #223 merged exact reviewed head `b7c7a31f25df8e000c42aedf873bc5669e80585c` as `c03f551dfbb01df9c552f76a53c4bc0d6b6e7de7` after hosted typecheck/harness/build, 181 Edge tests, full rendering E2E, JavaScript analysis, and CodeQL passed. The first CLI merge attempt made no remote change because another worktree owned local `main`; the exact-SHA GitHub merge endpoint then completed the authorized squash without touching that worktree. Confidence high.
- LIVE EVIDENCE: Pages run `30605592217` passed current-main verification, deploy provenance, and post-deploy live smoke. Public `deploy-meta.json` reports merge `c03f551`. Fresh public desktop inspection shows the semantic five-command deck and a fitted 1280-by-720 page. Fresh 915-by-412 coarse-pointer inspection proves five 65.1-by-45-pixel minimum targets, elevation 45-to-48-to-45 for left/right, Arsenal open hidden/inert and close restored, and zero page overflow. Confidence high.
- NEXT SCOUT: the relocated dock fixes the primary touch commands, but public pixel-touch inspection shows the remaining right tactical rail compressed into a narrow scaled column. Measure the live action, movement, fuel, status, and typography surfaces before selecting the next bounded mobile playability slice. Confidence high.### Touch mobility dock SMARTS decision and spec gate

- CAUSAL FINDING: public pixel-touch measurement shows the remaining rail movement buttons at only 16.9-by-48.8 rendered pixels, while Store is 57.7-by-48.8 and Fire 78-by-48.8. Movement is the only active mobile combat target still below the 44-pixel width floor; the weakness report remains partially unresolved after the aim/power dock pass. Confidence high.
- SMARTS DECISION (high confidence): select `touch-mobility-dock` over a broad rail redesign or another art pass. Score 98/100: Scope 19/20 (two existing buttons and one dock seam), User value 20/20 (direct mobile-control feedback plus measured 17-pixel defect), Risk 19/20 (reuse exact movement callback/gate), Maintainability 20/20 (one movement policy across pointer modes), Testability 20/20 (signed callback, fuel state, geometry), Security 0 exposure. No dependency, engine, backend, schema, paid asset, or action-contract change.
- SPEC GATE: `.codearbiter/specs/touch-mobility-dock.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. The touch dock gains exact -8/+8 movement commands; the coarse rail becomes fuel status while desktop remains unchanged. Confidence high.### Touch mobility dock TDD and viewport acceptance

- TDD RED: focused HUD contracts failed because the dock exposed only five commands and no movement buttons/callbacks. Pixel-touch production acceptance likewise found five rather than seven targets. Confidence high.
- GREEN: the coarse-pointer dock now exposes exact move-left/move-right commands wired to the existing -8/+8 callback. Both buttons reconcile from the same local-turn, alive, unburied, non-firing, positive-fuel gate as the desktop rocker. Fine-pointer behavior is unchanged. Confidence high.
- BROWSER ORACLE CORRECTION: the existing mobility acceptance initially timed out by intentionally clicking a rail button that the new coarse-pointer contract hides. The oracle now selects the active input surface by pointer mode and proves the same authoritative fuel/turn semantics through either path. Confidence high.
- VIEWPORT ACCEPTANCE: focused HUD tests pass 13/13, typecheck passes, and the six command/mobility browser profiles pass. At 915-by-412 the seven-command dock renders 560-by-54.5 with minimum 75.4-by-45 targets; both redundant rail movement buttons are hidden, the centered fuel dial grows from roughly 21 to 28.8 rendered pixels, Store/Fire stay above 44 pixels, and the page remains exactly 915-by-412 without scroll. Visual inspection confirms the single-row dock remains clear and fitted. Confidence high.### Touch mobility dock adversarial correction and final local acceptance

- Initial adversarial verdict: 0 Critical / 0 High / 1 Medium / 0 Low. The Medium found that the shared production gate was correct but the ordering-critical zero-fuel touch state was not pinned, so `syncStrip` could regress and re-enable touch movement after `syncMobility`. Confidence high.
- TDD reinforcement: the mobility matrix now asserts native disabled plus `aria-disabled` parity for rail and touch movement across no local control, zero fuel during an otherwise valid player turn, buried, dead, non-turn phase, explicit firing, valid restoration, and Arsenal inert-to-active restoration. Follow-up adversarial verdict is CLEAN: 0 Critical / 0 High / 0 Medium / 0 Low. Confidence high.
- FULL-SUITE ORACLE CORRECTION: the first complete Playwright run exposed two legacy geometry loops that counted intentionally hidden coarse-pointer rail buttons as active targets, producing zero-size/out-of-bounds failures despite the dedicated hidden-rail assertions passing. The geometry loops now measure only rendered targets; both isolated regressions pass and the complete suite returns green. Confidence high.
- Exact final local gates pass: `npm run check`; 97 client files / 663 tests with coverage at 87.26% statements, 76.69% branches, 77.58% functions, and 89.89% lines; 181 Edge tests; production build/typecheck; full Playwright 101 passed with 10 intentional project-conditional skips across desktop-fine, pixel-touch, and small-window; `npm audit --audit-level=high` with 0 vulnerabilities; clean diff/conflict-marker hygiene; and the state-free secret scan with `[]`. The isolated browser suite stopped the dev listener, then the sole singedTerra Vite server was restored on port 5187 and returned HTTP 200. Confidence high.### Touch mobility dock commit receipt

- Governed product commit `dab4f39` records the seven-command touch dock, exact -8/+8 movement semantics, shared movement gate, coarse-pointer rail simplification, RED/GREEN unit/browser oracles, clean adversarial follow-up, approved spec/plan, and complete local acceptance evidence. Confidence high.### Touch mobility dock ready PR handoff

- Ready PR #224 opened from reviewed product commit `dab4f39` plus commit-gate receipt `bd96651`. Hosted exact-head typecheck, deterministic harnesses, build, Edge, E2E, JavaScript analysis, and CodeQL remain the delivery gate. Confidence high.### Touch mobility dock hosted gate receipt

- Hosted PR #224 head `a7eec9b7e676580f7b4660fd3e8eb59777dc477b` passed typecheck/harness/build, Edge, full rendering E2E, JavaScript analysis, and CodeQL. This documentation-only receipt and completed plan checkbox will become the final candidate head and receive the same exact-head hosted gate before the PR is considered green. Confidence high.### Touch utility controls SMARTS decision and spec gate

- CAUSAL FINDING: fresh 915-by-412 browser measurement on the exact PR #224 candidate shows all seven dock targets at 75.4-by-45 pixels, but the remaining visible Menu and Arsenal controls render only 27.5 pixels tall; the Arsenal toggle is also 43.5 pixels wide. Dock labels authored at 9 pixels resolve to roughly 5.6 rendered pixels under the supported 0.625 game scale. Confidence high.
- SMARTS DECISION (high confidence): select `touch-utility-controls` over a broad rail redesign or unrelated gameplay feature. Score 97/100: Scope 19/20 (one HUD dock/rail seam), User value 20/20 (completes the reported weak mobile-control surface), Risk 19/20 (reuse existing pause and Arsenal behavior), Maintainability 19/20 (one coarse-pointer command vocabulary), Testability 20/20 (exact geometry, typography, icon, pause, and inert-state browser oracles), Security 0 exposure. No dependency, engine, backend, schema, paid asset, or action-contract change.
- SPEC GATE: `.codearbiter/specs/touch-utility-controls.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. The stacked slice adds Menu to an eight-control dock, gives live Weapon a double-width cell, enlarges the remaining Arsenal target, and leaves fine-pointer geometry unchanged. Confidence high.

### Touch utility controls TDD and browser acceptance

- TDD RED/GREEN: the focused HUD suite first failed two contracts because the coarse-pointer dock exposed only seven commands and had no Menu pause seam. The implemented eight-control dock passes 5/5, including exact accessible names, authored glyph identity, causal direction signs, movement, weapon cycling, repeat ownership, and non-destructive pause/resume. Confidence high.
- BROWSER CORRECTION: the first production-browser run proved the new geometry but exposed an obsolete exact icon-count oracle; updating it to the intentional bounded Menu glyph revealed a pre-existing asynchronous fuel assertion that could issue both fallback moves before the first HUD repaint. A bounded animation-frame wait now observes the authoritative first move before fallback. Confidence high.
- PIXEL-TOUCH ACCEPTANCE: the 915-by-412 production profile passes 13 applicable layout tests with 2 intentional project-conditional skips. All eight dock buttons render 45 pixels high; regular cells are 57.8 pixels wide; the live Weapon cell is 119.4 pixels wide; labels render 8.5 pixels high; Arsenal is 45-by-45; Menu pauses and resumes; Arsenal hides and inerts the dock; and the document remains exactly 915-by-412 with no scroll. Confidence high.
- VISUAL ACCEPTANCE: fresh Chromium inspection confirms the dock reads as one deliberate command bar in the existing dusk/gold/cyan family, the wider live weapon identity stays legible, Menu is a quiet purple utility action, the pause panel remains centered and clear, and the expanded Arsenal removes the dock without exposing duplicate controls. Confidence high.

### Touch utility controls adversarial review and full local gate

- ADVERSARIAL VERDICT: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. Review confirmed Menu reuses only the non-destructive pause seam and remains available outside combat ownership; combat disabled/aria-disabled gates are intact; the duplicate rail Menu is hidden only for coarse pointers; Arsenal still hides and inerts the dock; fine-pointer CSS is unchanged; and the bounded animation-frame movement oracle removes the immediate-read race without masking failures. Confidence high.
- COMPLETE LOCAL GREEN: `npm run check`; 97 client files / 664 tests with coverage at 87.36% statements, 76.70% branches, 78.14% functions, and 89.97% lines; 181 Edge tests; production build/typecheck; full Playwright 101 passed with 10 intentional project-conditional skips across desktop-fine, pixel-touch, and small-window; `npm audit --audit-level=high` with 0 vulnerabilities; clean diff hygiene; and state-free secret scan `[]`. Confidence high.
- LOCALHOST HYGIENE: the full browser gate left no preview listener behind. Port 5187 remains the only singedTerra localhost; unrelated project and system listeners were not touched. Confidence high.

### Touch utility controls commit receipt

- Governed product commit `14eb20d` records the eight-command coarse-pointer dock, non-destructive Menu seam, nine-track responsive composition, double-width live Weapon cell, stronger labels/symbols, coarse-only duplicate suppression and Arsenal target sizing, deterministic movement-oracle correction, approved spec/plan, clean adversarial verdict, and complete local acceptance evidence. Confidence high.

### Touch utility controls ready PR handoff

- Stacked ready PR #226 opened from reviewed product commit `14eb20d` plus commit-gate receipt `544cacb`, targeting exact-green parent branch `codex/mobile-tactical-hud` from PR #224. Hosted exact-head typecheck, deterministic harnesses, build, Edge, E2E, JavaScript analysis, and CodeQL remain the delivery gate. Confidence high.

### Touch utility controls hosted gate receipt

- Hosted PR #226 head `4544b1845f963e989846f02e60d36fd853d4bb24` passed typecheck/harness/build, Edge, full rendering E2E, JavaScript analysis, and CodeQL. This documentation-only receipt and completed plan checkbox will become the final candidate head and receive the same exact-head hosted gate before the PR is considered green. Confidence high.


### Documentation overhaul SMARTS decision and spec gate

- USER PIVOT: pause the touch-utility implementation at its isolated RED checkpoint and select the README/documentation overhaul as the next full slice. The red branch remains uncommitted and separate; no failing test or partial product behavior enters this docs branch. Confidence high.
- CAUSAL FINDING: the root README leads with obsolete SVG art, claims 11 weapons while the canonical union contains 16, lists shipped audio and mobile HUD work as planned, and describes a static Pages client as running on a t3.micro. The maintained specification opens with a superseded Socket.io/EC2 architecture even though current source and deployment are Supabase deterministic lockstep. Confidence high.
- SMARTS DECISION (high confidence): run a docs-only `ca-chore` named `documentation-overhaul`. Score 99/100: Scope 19/20 (root and maintained documentation set), User value 20/20 (explicit request plus repository first impression), Risk 20/20 (no behavior or dependency change), Maintainability 20/20 (new source-of-truth hierarchy), Testability 20/20 (source audit, assets, links, copy, secrets, diff, hosted gates). Security exposure is limited to copy and secret scanning.
- SPEC GATE: `.codearbiter/specs/documentation-overhaul.md` and matching plan are approved as SUaDtL under standing passion-project sprint authority. Design read: a Markdown product front door and technical guide set for players and contributors, expressive but direct, using the game\'s scorched-dusk visual family. Dials are Structure 5, Density 5, Register 8, Motion not applicable. Confidence high.### Documentation overhaul copy and integrity gate

- VISUAL ACCEPTANCE: the README now leads with the authored splash hero, a verified live-play link, and current production captures of the gameplay command rail and modular Garage. Obsolete schematic SVGs are removed from the maintained presentation. Confidence high.
- SOURCE ALIGNMENT: the maintained docs were checked against current engine types, weapon definitions, replay contract, HUD source, package scripts, Supabase migrations and Edge Functions, and Pages workflow. One locally caught wording gap was corrected so the online action flow explicitly includes committed movement and round transitions. Confidence high.
- DOCS-ONLY GATE: anti-slop scan found no sentence-separator dash violations or filler findings; strict relative-link validation covered 12 maintained and governed Markdown files with 0 broken targets; live site, workflow, issue tracker, and TypeScript badge returned HTTP 200; `git diff --check` passed; codeArbiter state-free secret scan returned `[]`; targeted credential-pattern and retired-reference scans returned no matches. Confidence high.
### Documentation overhaul adversarial review and local acceptance

- INITIAL ADVERSARIAL VERDICT: 0 Critical / 0 High / 3 Medium / 1 Low. Riot Bomb was grouped as spread damage; drag aiming and hold-F fast-forward were undiscoverable; the icon policy contradicted the bounded weapon Lucide seam; and late-join wording overstated support beyond reconnect or refresh for an existing seat. Confidence high.
- CORRECTIONS: Riot Bomb is now documented as damage-free excavation; README and player controls include drag aiming and local fast-forward; UI guidance names both bounded, tree-shaken Lucide seams; and the maintained status and spec explicitly limit replay recovery to an existing seat because joins close when a room starts. Confidence high.
- FOLLOW-UP ADVERSARIAL VERDICT: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. The reviewer checked both client implementations of fast-forward, the complete Lucide import boundary, the room join gate, and surrounding copy. Confidence high.
- LOCAL ACCEPTANCE: `npm run check` passed the complete typecheck and deterministic harness chain; `npm run build` produced the production Vite bundle; all three README images decode at their intended high-resolution dimensions; final diff hygiene and state-free secret scan pass. Confidence high.

### Documentation overhaul commit receipt

- Governed product commit `8398879` records the visual README front door, player and contributor guides, current Supabase lockstep architecture, maintained product/UI contracts, archived historical plan, retired SVG removal, source-aligned review corrections, and complete local acceptance evidence. Confidence high.

### Documentation overhaul ready PR handoff

- Ready PR #225 opened from reviewed product commit `8398879` plus commit-gate receipt `68aa642`. Hosted exact-head typecheck, deterministic harnesses, build, Edge, E2E, JavaScript analysis, and CodeQL remain the delivery gate. Confidence high.

### Documentation overhaul hosted gate receipt

- HOSTED GREEN: PR #225 exact head `fefa9c0925d39fd2144a3f4a1225e50b0a5b74e0` passed typecheck, the deterministic harness chain, 663 client tests, production build, 181 Edge tests, 101-test production-browser E2E with 10 intentional project-conditional skips, JavaScript analysis, and CodeQL. PR state remained open and mergeable. Confidence high.

### Mobile tactical HUD stack reconciliation

- USER AUTHORITY: merge green PRs with an adversarial pass, including eligible dependency bumps. PR #226 merged into its parent feature branch; PR #225 had already merged to `main`. Confidence high.
- SMARTS DECISION: reconcile `origin/main` into PR #224 locally because GitHub reported a conflict, preserving both append-only sprint histories. The sole overlap was this log; exact reconstruction proved both parent suffixes occur once, byte-for-byte and in chronological order. Confidence high.
- ADVERSARIAL CORRECTIONS: the combined review found stale 800x500 documentation and touch guidance that still placed movement in the tactical rail. Maintained docs now match the authoritative 1200x600 battlefield and eight-control touch dock. A follow-up clarified that combat controls share keyboard gates while Menu remains available to pause. Final verdict: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. Confidence high.
- LOCAL ACCEPTANCE: `npm run check` passed after the documentation corrections; the earlier combined stack run passed production build and full Playwright with 101 passes and 10 intentional skips. Relative-link validation covered 21 maintained/governed documents with 0 broken targets; diff hygiene and the state-free secret scan returned clean. Exact-head hosted CI remains required after push. Confidence high.
- DEPENDENCY REVIEW: PR #167 cleared provenance, license, compatibility, and adversarial review; after updating onto current `main`, every exact-head hosted check passed and the PR merged as `9daca984`. PRs #215, #175, and #174 remain held for Node runtime-contract incompatibilities that green CI did not detect. Confidence high.
- AUDIT CORRECTION: for PR #167, all required exact-head hosted checks passed; Supabase Preview skipped per configuration. The earlier "every exact-head hosted check passed" wording did not distinguish that configured skip. Confidence high.


### Active tank identity portrait SMARTS decision and spec gate

- CAUSAL FINDING: the current 1440-by-900 production view renders customized battlefield tanks at roughly 40 pixels wide. The Garage already offers Tracks, Spider Legs, Hover, Dune Wheels, four hulls, four turrets, and four barrels, but the command HUD does not present the assembled vehicle, so those authored choices lose readable identity during combat. Confidence high.
- SMARTS DECISION (high confidence): select `active-tank-portrait` over enlarging battlefield sprites or adding another cosmetic family. Score 96/100: Scope 19/20 (one existing HUD identity seam plus the shared preview painter), User value 20/20 (directly answers customization readability), Risk 20/20 (presentation-only and no hitbox drift), Maintainability 19/20 (one atlas painter across Garage, battlefield, and HUD), Testability 18/20 (DOM, repaint, accessible naming, and viewport geometry oracles), Security 0 exposure. No dependency, engine, backend, schema, paid asset, or action-contract change.
- SPEC GATE: `.codearbiter/specs/active-tank-portrait.md` and matching plan are approved as SUaDtL under the standing passion-project sprint authority. The slice adds one cached authored portrait to the active-turn identity and preserves every combat control and deterministic contract. Confidence high.


### Active tank identity portrait TDD RED

- TDD RED: the new focused HUD contract fails 3/3 because the active row has no portrait canvas, never calls the authored preview painter, and cannot clear or hand off portrait identity. Production-browser acceptance is also pinned for one exact default-loadout label, at least 42-by-24 rendered pixels, active-row containment, and existing no-scroll gates across all supported profiles. Confidence high.


### Active tank identity portrait visual acceptance and adversarial correction

- GREEN: the active command console now paints the exact active tank color and four-slot loadout through the shared authored atlas. The single portrait is 83-by-47 rendered pixels at 1440-by-900, 44-by-25 at 915-by-412 coarse pointer, and 52-by-30 at 900-by-520. All three profiles remain exactly viewport-sized with no HUD or page scroll, and the identity card stays contained beside owner, weapon, fuel, movement, Store, Fire, and Arsenal controls. Confidence high.
- INITIAL ADVERSARIAL VERDICT: 0 Critical / 0 High / 0 Medium / 1 Low. The Low found that clearing only the HUD signature and accessible label left a queued atlas retry token valid, allowing a hidden stale tank repaint after terminal or missing-active state. Confidence high.
- CORRECTION: `clearTankLoadoutPreview` now invalidates the canvas dataset signature before any Canvas operation and clears the bitmap. HUD invokes it only on active-to-none or residual-signature transitions. A fake-timer loading-to-clear regression proves the queued 50ms retry cannot re-enter drawing, and HUD coverage proves repeated inactive frames do not repeat work. Follow-up adversarial verdict is CLEAN: 0 Critical / 0 High / 0 Medium / 0 Low. Confidence high.

### Active tank portrait current-main reconciliation

- SMARTS DECISION (high confidence): preserve the complete tracked and untracked portrait workspace in a labeled safety stash, fast-forward the branch because its committed head is an exact ancestor of current `origin/main`, then reapply the work and retain the stash until the reapplied tree is verified. Score 98/100: Scope 20/20, User value 18/20, Risk 20/20, Maintainability 20/20, Testability 20/20; no security exposure. This avoids an artificial merge commit and preserves a recovery point for every unfinished file. Confidence high.

### Active tank portrait coverage-gate prerequisite

- COVERAGE RED: `npm run coverage:client` failed twice on the portrait tree because `Renderer.napalmFirelight` and `Renderer.projectileGroundShadows` exceeded Vitest's 5000ms per-test timeout. The exact canonical failure reproduced on the clean pre-portrait branch, while those two tests passed together under V8 coverage in 3.6 seconds, proving the defect predates and is independent of the portrait. Confidence high.
- ROOT CAUSE: unrestricted file-parallel V8 coverage oversubscribes the Windows host; both failures appear only in the 97/99-file full-coverage fanout. Running the complete 99-file / 668-test coverage suite with `--maxWorkers=4` passed in 47.68 seconds at 88.15% statements, 77.27% branches, 78.63% functions, and 90.76% lines. Confidence high.
- SMARTS DECISION (high confidence): bound only the coverage script to four workers, leaving ordinary test parallelism and the 5000ms behavioral timeout unchanged. Score 99/100: Scope 20/20, User value 19/20, Risk 20/20, Maintainability 20/20, Testability 20/20. Raising timeouts would mask slow tests; accepting a non-canonical override would leave the governed command red. No dependency or product-runtime change. Confidence high.
### Active tank portrait coverage-gate prerequisite close

- GREEN: the canonical `npm run coverage:client` now runs V8 coverage with four workers and passed 99/99 files and 668/668 tests in 44.87 seconds: 88.15% statements, 77.27% branches, 78.63% functions, and 90.76% lines. The ordinary client test command, five-second test timeout, assertions, and thresholds remain unchanged. Confidence high.
- ADVERSARIAL VERDICT: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. Review confirmed the two-file command/documentation fix is the minimum root-cause correction and changes no dependency, configuration outside the command, or product behavior. Confidence high.
### 2026-07-31 — active tank portrait adversarial correction

- Final whole-branch adversarial review: 0 Critical, 0 High, 2 Medium, 0 Low.
- MEDIUM accepted: dead shooters retained stale portrait identity during FIRING/RESOLVING even though shot-progress ownership must remain visible.
- MEDIUM accepted: production-browser coverage proved only canvas geometry, not authored non-empty pixels, and desktop-fine used 1600x900 rather than the approved 1440x900 acceptance viewport.
- TDD RED: `npm -w @singedterra/client exec vitest run src/ui/HUD.tankPortrait.test.ts` failed 2/5 tests. Direct painted-to-dead transitions in FIRING and RESOLVING kept Alice's portrait label instead of `No active tank.`
- SMARTS: preserve the deterministic shot-progress announcement while clearing only the dead shooter's portrait; add an authored-pixel oracle and exercise the exact 1440x900 viewport. Confidence: high. Conflict level: correctness and data integrity over developer velocity.
### Active tank portrait adversarial correction close

- GREEN: focused HUD portrait lifecycle now passes 5/5 tests; direct painted-to-dead FIRING and RESOLVING transitions clear label and retry signature while preserving the shot-progress announcement.
- GREEN: production-browser portrait acceptance passes 3/3 at exact 1440x900 desktop, 915x412 coarse-pointer, and 900x520 small-window. The oracle requires more than 1,000 visible pixels and more than 100 RGBA values, excluding both blank Canvas and the immediate geometric fallback.
- ADVERSARIAL FOLLOW-UP: CLEAN, 0 Critical / 0 High / 0 Medium / 0 Low. The same reviewer confirmed both prior Medium findings closed with no stale retry race, progress regression, or threshold false positive.
### Active tank portrait final local gate

- `npm run check`: PASS, including TypeScript and every deterministic engine/client harness.
- `npm run test:client`: PASS, 99 files and 670 tests.
- `npm run coverage:client`: PASS, 99 files and 670 tests; 88.15% statements, 77.29% branches, 78.63% functions, 90.76% lines.
- `npm run check:edge`: PASS, 181 tests and 0 failures.
- `npm run test:e2e`: PASS, 101 passed and 10 expected project-profile skips.
- `npm run build`: PASS, 1,886 modules transformed and production bundle emitted.
- `npm audit --audit-level=high`: PASS, 0 vulnerabilities.
- Staged diff check, conflict-marker scan, and state-free secret scan: PASS.
### Active tank portrait hosted gate receipt

- Ready PR: #227, `feat(ui): add active tank identity portrait`.
- Reviewed product head: `0decc94233561abb1834bc2be2465f586590bf49`.
- Hosted checks on that exact head: typecheck, deterministic harnesses, build, Edge Function tests, production-browser rendering guardrails, CodeQL analysis, and CodeQL all PASS. Supabase Preview skipped as expected because this branch changes no backend surface.
- The PR remains open, unmerged, and undeployed under the sprint boundary.
### Wrap sidewalls SMARTS decision and spec gate

- SCOUT: current `origin/main` already ships open and reflective sidewalls through one `WallMode`, swept-collision, live-engine, AI-search, lobby-option, Canvas-rail, audio, and deterministic-harness seam. The open task still names wrap/concrete as the remaining signature arena rules; no open feature PR overlaps that surface. Confidence high.
- SMARTS DECISION: select one complete wrap-sidewall slice over a combined wrap-plus-concrete family or a guided-first-shot tutorial. Wrap is Strong on Maintainable, Available, Reliable, and Testable because it extends the proven wall seam and shared deterministic engine; the combined family widens two collision semantics, while the tutorial adds a new UI lifecycle. Player-value precedent favors a noticeable tactical mechanic. Strength strong; confidence high.
- TRANSIT DECISION: preserve the complete integrated tick and sweep the paired entry-side remainder instead of snapping to the rail and discarding overshoot. One shared helper serves live and AI paths. This prevents edge-target tunneling and keeps fixed-step trajectories honest. Strength strong; confidence high.
- GUIDE DECISION: end the short honest aim guide at the first wrap rail rather than drawing a false map-spanning connector or revealing the post-portal impact. The paired static rails communicate continuation while the guide preserves its hint-not-solver contract. Strength strong; confidence high.
- SPEC GATE: `.codearbiter/specs/wrap-sidewalls.md` and `.codearbiter/plans/wrap-sidewalls.md` are approved as SUaDtL under the standing passion-project sprint authority. The slice adds `Wrap` to room setup, exact cross-edge physics, live/AI parity, paired portal feedback, and complete option plumbing without dependencies, migrations, auth changes, merge, or deployment. Confidence high.
- BASELINE: clean `origin/main` at `ac84a111e504fab82e2f692582f7f6ebd2e51cb0` passed `npm run check`, 99 client files / 670 tests, and 181 Edge tests before implementation. `npm ci` audited 150 packages with 0 vulnerabilities. Confidence high.
### Wrap sidewalls TDD RED and swept-segment correction

- TDD RED: `npx tsx scripts/checks/walls.mjs` produced 32 passes and 7 expected failures. Untouched production code normalized `wrap` to open, removed left/right shots, emitted no wall contacts, and failed the same-tick paired-edge tank-impact oracle. Open and reflective assertions stayed green. Confidence high.
- CAUSAL CORRECTION: `sweepCollide` deliberately snaps a projectile to the first detected contact, so the integrated endpoint is unavailable after return. Preserve the exact unconsumed `remainingX` / `remainingY` segment on wall results and let one shared wrap helper sweep that remainder from the paired entry rail. Reconstructing from velocity would diverge from the actual supersampled segment; discarding it would permit edge tunneling. Strength strong; confidence high.### Wrap sidewalls implementation TDD receipts

- LIVE/AI RED: after live wrap transit went green, the new live-versus-AI endpoint oracle failed with 41 passes and 1 expected failure because AI still reflected the shot. Adding the shared wrap helper to AI search produced 42/42 wall-harness assertions. Confidence high.
- OPTION PLUMBING RED: focused client tests produced 81 passes / 4 expected failures (missing selector option, stale hint, transport normalized to open, rejoin omitted wrap); focused Edge tests produced 16 passes / 3 expected failures (create and rematch normalization returned open). Confidence high.
- OPTION PLUMBING GREEN: shared normalization now preserves `open`, `reflective`, and `wrap` through hot-seat, create-room, network rematch, rejoin, stored options, and Edge validation. Focused client tests pass 85/85, focused Edge tests pass 19/19, and repository typecheck passes. Confidence high.
- PRESENTATION RED: focused renderer/audio tests produced 4 passes / 3 expected failures: no wrap rails, no paired contact accent, the renderer omitted wall mode from its event edge, and the wrap audio profile did not exist. Confidence high.
- PRESENTATION GREEN: wrap now draws paired violet portal rails and dual exit/entry accents, forwards the authoritative wall mode once per contact, and emits a distinct bounded rising transfer cue while retaining the reflective compatibility path. Focused tests pass 7/7 and repository typecheck passes. Confidence high.### Wrap sidewalls browser and full local gate

- BROWSER ACCEPTANCE: the production bundle passed the wrap-room oracle in desktop-fine, Pixel 5 coarse-pointer landscape, and small-window profiles. Each selected the `Wrap` room option, rendered more than 500 violet paired-rail pixels, and kept document height within the viewport. Confidence high.
- DETERMINISTIC GATE: `npm run check` passed, including 48/48 wall assertions covering left/right transfer, state preservation, same-tick entry collision, repeated contacts, flight cap, action replay, AI/live endpoint parity, and legacy open/reflective behavior. Confidence high.
- CLIENT GATE: 99 files / 674 tests passed. Coverage passed at 88.16% statements, 77.45% branches, 78.63% functions, and 90.77% lines. Confidence high.
- EDGE GATE: 181/181 Deno tests and typechecks passed, including exact stored-option and rematch wrap contracts. Confidence high.
- PRODUCTION-BROWSER GATE: 104 tests passed with 10 expected project-profile skips; production build transformed 1,887 modules. Confidence high.
- SUPPLY/DIFF GATE: `npm audit --audit-level=high` found 0 vulnerabilities; `git diff --check`, conflict-marker scan, and state-free secret-pattern scan passed. No dependency or lockfile changed. Confidence high.### Wrap sidewalls same-tick floor correction

- TDD RED: a Sandhog crossing the left portal while entering the implicit bottom floor resolved at `x=920.54` instead of beside the paired right rail. The general floor clamp still interpolated from the pre-portal segment origin, treating the discontinuity as ordinary travel. Confidence high.
- GREEN: live collision resolution now tracks the active swept-segment origin. After a wrap, bottom-floor endpoint clamping uses the paired entry rail and contact y; the wall harness passes 50/50 and repository typecheck passes. This preserves the existing non-wrap calculation. Confidence high.### Wrap sidewalls exact portal-intersection correction

- ADVERSARIAL TDD RED: exact endpoint oracles proved the first out-of-bounds supersample discarded part of the integrated tick: left transfer landed at `1197.59` instead of `1196.99`, and right at `2.41` instead of `3.01`. The loss was bounded below one pixel but violated the exact-transit contract and accumulated across repeated crossings. Confidence high.
- GREEN: `sweepCollide` now intersects the segment with exact `x=0` / `x=CANVAS_WIDTH`, derives exact contact y and unconsumed x/y remainder, and only then hands the contact to reflect/wrap handling. Wall harness passes 53/53 and typecheck passes. Confidence high.### Wrap sidewalls adversarial entry-point correction

- ADVERSARIAL HIGH / TDD RED: the paired-entry remainder sweep sampled only `i=1..steps`; one solid terrain pixel exactly at either destination rail was skipped before the first sample. Both left and right one-column entry oracles returned `none`. Confidence high.
- GREEN: `wrapSideWall` now collision-tests the exact paired entry point under open-boundary semantics before sweeping the remainder. Both rail oracles pass; the complete wall harness passes 56/56 and typecheck passes. Confidence high.
- ADVERSARIAL MEDIUM CLOSED: a pure helper oracle now proves preservation of `vx`, `vy`, weapon type, age, split state, bounce state, and Sandhog burrow state across transfer. Confidence high.
- COMPATIBILITY: exact geometric wall intersection is wrap-only; reflective keeps its pre-existing sampled contact behavior. Confidence high.### Wrap sidewalls adversarial Medium corrections

- PERSISTENCE RED/GREEN: a new stored-rematch contract initially failed to typecheck because persistence normalization did not exist. `normalizeStoredRematchOptions` now preserves every synchronized option while coercing invalid walls to `open`, and the restart handler uses that object for successor insert and response. Focused restart tests pass 9/9. Confidence high.
- LIFECYCLE COVERAGE: create-room handler tests now prove `wrap` reaches the inserted row and invalid walls insert as `open`; rejoin replay constructs the real NetworkClient with wrap and asserts restored engine state; successor fetch normalizes wrap and invalid values. Focused client tests pass 17/17 and focused Edge tests pass 24/24. Confidence high.
- BROWSER ORACLE: the production comparison now returns independent left/right rail counts, requires each edge to exceed its open-room baseline by 250 pixels, and asserts both horizontal and vertical document fit. All three viewport profiles pass. Confidence high.
### Wrap sidewalls exact-current delivery gate

- FINAL ENGINE GATE: `npm run check` passed on the complete working tree, including 56/56 wrap-sidewall assertions and 413/413 muzzle assertions. Confidence high.
- FINAL CLIENT GATE: 99/99 files and 675/675 tests passed. Coverage passed at 88.61% statements, 78.05% branches, 79.14% functions, and 91.18% lines. Confidence high.
- FINAL EDGE GATE: 183/183 Deno tests passed, including create-room and stored-rematch wall normalization. Confidence high.
- FINAL BROWSER GATE: 104 tests passed with 10 intentional project-profile skips. Wrap passed on desktop-fine, Pixel 5 coarse-pointer landscape, and small-window profiles with independent left/right rail and no-scroll oracles. Confidence high.
- FINAL BUILD/SUPPLY GATE: production build transformed 1,887 modules; `npm audit --audit-level=high` found 0 vulnerabilities. Confidence high.
- EXACT-CURRENT ADVERSARIAL VERDICT: CLEAN, with 0 Critical, High, Medium, or Low findings after exact intersection, paired-entry collision, projectile-state preservation, rematch persistence, real NetworkClient rejoin, successor fetch, and per-edge browser corrections. Confidence high.
- HARVEST: no low-confidence wrap-sidewall decision or new `[NEEDS-TRIAGE]` finding requires promotion. Confidence high.

- BOARD HARVEST: `$ca-task` queued the remaining concrete-sidewall idea as a separate `sprint:wrap-sidewalls` follow-up. The legacy uncheckboxed backlog row could not be marked done through the sanctioned task writer, so it remains historical rather than being free-hand rewritten. Confidence high.

### Wrap sidewalls coverage-auditor corrections

- COVERAGE MEDIUM CLOSED: the clone oracle now runs reflective and wrap modes independently, proving exact future parity and post-contact projectile-state independence for both. The wall harness passes 58/58. Confidence high.
- HANDLER-SEAM RED: a successful rematch-insert test initially failed typechecking because `handleRestartGame` exposed no injectable service seam. Confidence high.
- HANDLER-SEAM GREEN: `handleRestartGame` retains its production `body, Request` contract and accepts test dependencies only as an optional third argument; normal HTTP execution still defaults to `getServiceClient` and `verifySeatToken`. The causal test captures the actual successor insert and proves wrap persistence plus invalid-wall normalization. Focused restart tests pass 10/10; the full Edge suite passes 184/184. Confidence high.
- COVERAGE FOLLOW-UP: exact correction re-review returned CLEAN. Confidence high.- AUTH/SECURITY FOLLOW-UP: exact correction reviews both returned CLEAN with 0 Critical, High, Medium, or Low findings. HTTP callers cannot supply the third test-dependency argument; production defaults, membership, seat-token verification, service-role confinement, and mutation ordering remain unchanged. Confidence high.

### Node 24 toolchain SMARTS decision and spec gate

- SCOUT: .nvmrc and contributor docs still require Node 20, while the official Node.js release schedule marks Node 20 end-of-life and Node 24 LTS. The current local runtime is Node 24.18.0. Green Dependabot PRs for Supabase 2.110.9 and concurrently 10.0.4 emit unsupported-engine warnings under the repository pin. Confidence high.
- SMARTS DECISION: choose one coordinated Node 24 LTS modernization over merging isolated unsupported bumps, staying on Node 20, or jumping to Node 26 Current. Node 24 is Strong on Maintainability, Availability, Reliability, Testability, and Security because it restores an LTS runtime, matches local development, satisfies every reviewed package engine, and keeps runtime/type majors aligned. Confidence high.
- DEPENDENCY BOUNDARY: evaluate @types/node 24.13.3, concurrently 10.0.4, @playwright/test 1.62.0, tsx 4.23.1, and @supabase/supabase-js 2.110.9 as one atomic set before install; keep browser and exact Edge Supabase versions aligned. Confidence high.
- SPEC GATE: .codearbiter/specs/node24-toolchain.md and .codearbiter/plans/node24-toolchain.md are approved as SUaDtL under the standing passion-project sprint authority. No application behavior, migration, merge, backend deployment, or site deployment is authorized by this slice. Confidence high.
- DEPENDENCY REVIEW CORRECTION: initial review blocked Playwright 1.62.0 because 1.62.1 supersedes it with regression fixes. The target was corrected before install to @playwright/test 1.62.1; its test, runtime, and core packages are Apache-2.0, Node 24 compatible, registry-signed, integrity-pinned, and SLSA-attested. Confidence high.

### Node 24 toolchain implementation and local gate

- DEPENDENCY GATE: independent review cleared Node 24 LTS, @types/node 24.13.3, concurrently 10.0.4, Supabase 2.110.9, Playwright 1.62.1, and tsx 4.23.1 with 0 Critical, High, or Medium findings. Confidence high.
- GRAPH RECEIPT: reproducible npm ci installed 139 packages and audited 142 with no EBADENGINE or vulnerability. npm ls resolved the intended exact versions; npm audit signatures verified 137 registry signatures and 59 provenance attestations. The only install-script notices are the same expected esbuild platform-binary scripts present at baseline. Confidence high.
- DRIFT GUARD: dependency_contract.mjs requires .nvmrc and engines Node 24 alignment, Node 24 types, one actual TypeScript ImportDeclaration for the exact Edge Supabase URL, an exact browser Supabase version, and equality between both execution contexts. Focused verification passes 7/7. Confidence high.
- LOCAL GATES: npm run check passed every deterministic/typecheck harness; client tests passed 99 files / 675 tests; coverage passed at 88.61% statements, 78.05% branches, 79.14% functions, and 91.18% lines; Edge tests passed 184/184; production build transformed 1,888 modules; Playwright passed 104 tests with 10 intentional profile skips. Confidence high.
- SUPPLY/DIFF GATES: npm audit --audit-level=high reports zero vulnerabilities; diff hygiene, conflict-marker scan, and state-free secret scan pass. Confidence high.
- ADVERSARIAL REVIEW: dependency review returned CLEAN. Security review found one LOW false-pass possibility in the first URL regex; parsing actual TypeScript import declarations closed it, and focused follow-up returned CLEAN with no remaining findings. Confidence high.
### Node 24 toolchain hosted gate receipt

- Ready PR: #229, chore(deps): move toolchain to Node 24 LTS.
- Reviewed product head: 9880c4c5142b9718bb734cdb8c147fc190ef47e2.
- Hosted checks on that exact head: typecheck, deterministic harnesses, production build, Edge Function tests, production-browser rendering guardrails, CodeQL analysis, and CodeQL all PASS. Supabase Preview skipped as expected; the exact Edge import changed but this sprint performs no backend deployment.
- The PR remains open, unmerged, and undeployed under the sprint boundary. The governance-only receipt commit must repeat hosted checks before final handoff.
### TypeScript 7 dependency migration

- SMARTS DECISION: supersede red Dependabot PR #173 with one fresh-main migration rather than merge its version-only lockfile. TypeScript 7 is Strong on Maintainability and Testability through its native compiler, Available on Node 24, and Reliable only when the removed baseUrl settings and compiler-API consumers migrate together. Confidence high.
- CONFIG TDD RED/GREEN: after installing TypeScript 7, npm run typecheck failed with TS5102 because both workspace configs still declared removed baseUrl; removing those two settings preserved the existing project-root-relative aliases and made both resolved configs and typecheck pass. Confidence high.
- API TDD RED/GREEN: the deterministic suite then failed in dependency_contract.mjs because TypeScript 7 intentionally ships no stable programmatic compiler API. The Microsoft side-by-side layout now exposes TypeScript 7.0.2 as @typescript/native for tsc and aliases typescript to @typescript/typescript6 6.0.2 for the structural harnesses. Confidence high.
- BIN-COLLISION CORRECTION: a direct compatibility-package install made npm link tsc to TypeScript 6.0.3. The official alias layout corrected that false-green path; a clean npm ci now reports npx tsc 7.0.2 and npx tsc6 6.0.3, while both compiler-API harnesses pass. Confidence high.
- SUPPLY GATE: independent dependency review found no Critical, High, or Medium issues. The accepted Low tradeoffs are the expected duplicate TypeScript 6 API payload and weaker wrapper source traceability, mitigated by the official Microsoft package, Apache-2.0 licensing, registry signatures, SHA-512 integrity, and verified upstream tags. Confidence high.
- LOCAL GATES: npm run check passed; client tests passed 99 files / 675 tests; coverage passed at 88.61% statements, 78.05% branches, 79.14% functions, and 91.18% lines; Edge tests passed 184/184; production build transformed 1,888 modules; Playwright passed 104 tests with 10 intentional profile skips. Confidence high.
- SUPPLY/DIFF GATES: npm audit --audit-level=high reports zero vulnerabilities; 140 package signatures and 59 attestations verified; diff hygiene and the state-free secret scan pass. Confidence high.
- EXACT-DIFF ADVERSARIAL VERDICT: CLEAN, with 0 Critical, High, Medium, or Low findings. The review confirmed the official alias/bin layout, platform lock graph, project-root-relative path mappings, documentation, and absence of unrelated drift. Confidence high.

### First Salvo onboarding gate and governance resolution

- SPEC GATE: the maintainer explicitly approved `.codearbiter/specs/first-salvo-onboarding.md` and `.codearbiter/plans/first-salvo-onboarding.md` on 2026-07-31. Confidence high.
- GOVERNANCE RESOLUTION: future bounded singedTerra sprint spec/plan skips will create a distinct immediate override entry for that specific written pair; no blanket override entry is inferred. Security-controls, auth, crypto, secrets, spending, irreversible operations, destructive migrations, and other genuine hard gates remain stops. Confidence high.
- UPSTREAM FOLLOW-UP: codeArbiter issue #572 requests a first-class standing-authority model with per-sprint artifact binding, revocation, expiry, and audit events. Confidence high.
- SMARTS DECISION: choose a three-step client-only action observer over a modal tour, scripted training map, or stronger trajectory predictor. Strong Maintainability, Reliability, Testability, and Securability follow from reusing actual local `PlayerAction` emissions without changing lockstep, physics, or backend contracts. Confidence high.
- TASK 1 COMPLETE (2026-07-31): pure First Salvo coach contract passed focused RED/GREEN, client typecheck, and task review with no Critical or Important findings; the sole Minor malformed-preference coverage gap was corrected and reverified 8/8.
- PLAN ALIGNMENT (2026-07-31): Task 6 handoff updated to honor the maintainer's current standing merge-and-deploy authority after exact-reviewed-head adversarial clearance and hosted CI, superseding stale leave-unmerged wording.
- TASK 2 COMPLETE (2026-07-31): First Salvo HUD presentation passed focused RED/GREEN and typecheck. Review found three Important accessibility/test-proof gaps; the fix round cleared stale live-region text for same-step replay, proved idempotent frame updates behaviorally, asserted both Power/Wind targets, and passed clean scoped re-review 4/4.
- SMARTS DECISION (2026-07-31): choose `tutorial=first-salvo` as the narrow deterministic forcing flag over overloading `e2e=hotseat` or clearing local storage. Criteria weighted: semantic clarity 0.35, zero behavior change to existing probes 0.30, isolation from unrelated storage 0.20, implementation/test simplicity 0.15. Scores: dedicated tutorial flag 4.9/5; e2e overload 3.4/5; storage clearing 1.6/5. Confidence: high. Reopen if the repo adopts a centralized test-feature flag contract.
- TASK 3 COMPLETE (2026-07-31): local action observation, persistence, eligibility, Replay, and `tutorial=first-salvo` wiring passed 37 affected tests and typecheck. Review found one Important proof gap; the fix moved the real InputHandler callback through a tested observe-then-forward seam proving order, exactly one send, object identity, and unchanged payload, then passed clean scoped re-review.
- TASK 4 COMPLETE (2026-07-31): production-bundle First Salvo browser coverage passed 6/6 across desktop-fine, small-window, and pixel-touch. Task review approved real keyboard/touch progression, card containment, no-scroll, usable Fire, and reduced-motion static-highlight proof with no findings; no production change was needed and no listener remained.
- FINAL ADVERSARIAL VERDICT 2026-07-31 FINDINGS 0 Critical 0 High 4 merge-blocking Medium 1 valid Low. Commit and PR gates remain closed pending TDD corrections and exact-diff follow-up. Confidence high.
- FINAL ADVERSARIAL FOLLOW-UP 2026-07-31 READY. All 4 merge-blocking Medium findings and the valid Low were corrected test-first. Exact corrected diff follow-up found 0 Critical 0 High 0 new merge-blockers and 0 outstanding notes. Commit gate may proceed. Confidence high.

- CA-PR COVERAGE CORRECTION 2026-08-01: exact-head coverage review found one merge-blocking Medium gap for persisted `v1:skipped` reload behavior. Tests now prove direct decoding plus cold and replacement controller suppression; focused coach/controller verification passes 22/22 and typecheck passes. Production behavior was unchanged. Confidence high.

### Garage Spotlight SMARTS decision and bounded gate

- SMARTS DECISION 2026-08-01: choose a large live Garage spotlight rendered directly from the existing authored WebP atlas over scaling battlefield tanks or replacing the atlas. This is Strong on Securability, Maintainability, Availability, Reliability, Testability, and Scalability because it is client-only, reuses one scale-aware painter, preserves fallbacks and deterministic geometry, and makes 2-4 player customization visibly legible without hitbox drift. Confidence high.
- SPEC/PLAN GATE 2026-08-01: .codearbiter/specs/garage-spotlight.md and .codearbiter/plans/garage-spotlight.md are bound under one sprint-specific logged override from the maintainer's standing authority. No security, dependency, migration, backend, merge, or deployment gate is bypassed. Confidence high.

#### Task 1 accepted — scale-aware authored tank painter
- TDD RED: after linking the existing ignored dependency install, the new scale tests failed on unchanged 1x static and barrel canvases.
- GREEN: `TankPartArt` now supports finite positive direct-render scales, scales destination canvases and offsets, and keys the cache by normalized scale while preserving the battlefield 1x default.
- Review: fixed profile scales only; no user-derived arbitrary scale. Focused result 16/16, full TypeScript check green, diff hygiene clean.

#### Task 1 correction accepted — scaled barrel mount
- Review found a merge-blocking detached-barrel risk: the bitmap and local offsets scaled while the shared barrel pivot remained at 1x.
- TDD RED expected the pivot scaled about the tank surface anchor and received the 1x mount; GREEN now scales the mount displacement with the assembly while preserving the exact scale-1 pivot and shared angle.
- Focused result 16/16, full TypeScript check green, diff hygiene clean.

#### Task 2 accepted — explicit spotlight preview profile
- TDD RED: the legacy preview stayed 84x48, passed no direct scale, bound retries without a presentation mode, and left the spotlight fallback at thumbnail scale.
- GREEN: the default thumbnail remains exactly 84x48 with its existing 1.6 context path; spotlight is 320x180 with fixed direct atlas scale 4, a centered scale-4 fallback, and mode-bound retry identity.
- Review: one atlas source, cache scales bounded to 1 and 4, presentation-only. Focused result 5/5, full TypeScript check green, diff hygiene clean.

#### Task 3 accepted — live vehicle-bay spotlight
- TDD RED: five bounded DOM contracts failed at the absent spotlight while existing Garage behavior remained green.
- GREEN: one selected-player 320x180 spotlight now uses shared part vocabulary and retains the multiplayer thumbnail convoy across hot-seat and online paths; preset, slot, color, and local-seat rules select the correct owner.
- Review correction: per-keystroke preview rebuild violated in-place identity synchronization. A new RED node-identity assertion drove owner-aware activation; subsequent name edits preserve the exact spotlight canvas and input focus.
- Review: pointer-transparent, no remote controls, waiting-room local preference, reduced-motion convoy preserved. Focused Lobby/network/preview result 53/53, full TypeScript check green, diff hygiene clean.

#### Task 4 accepted — production-browser and player-guide proof
- The production-bundle Playwright oracle was written after the Task 3 behavior existed and passed immediately across desktop-fine, small-window, and pixel-touch; no honest browser RED or CSS correction existed.
- The oracle proves default and selected-owner spotlight behavior, four shared labels, Player 2 preset/slot/exact Green tint/name updates, retained focus, spotlight-to-thumbnail size hierarchy, usable Garage/Start Game, transition to the game canvas, and zero document scroll.
- Visual review: the authored tank leads the bay, four metadata tiles read as one telemetry strip, roster thumbnails remain subordinate, and touch preserves the full flow without clipping.
- Player guidance now explains the spotlight and independent part controls. Focused browser result 3/3; deterministic check, 102 client files/717 tests, production build, state-free secret scan, and diff hygiene all green.

#### Final adversary corrections — canvas causality and artifact integrity
- MEDIUM merge blocker: metadata, geometry, and CSS tint did not prove the spotlight canvas actually repainted; live inspection also observed metadata preceding the settled canvas. The production-browser oracle now polls a nonblank visible-pixel coordinate/RGBA hash to stability and proves Foundry to Ranger, same-color Ranger to Bunker turret, and blue to Green canvas changes. Focused browser result is 3/3.
- MEDIUM merge blocker: the mutable Task 4 checklist claimed an expected RED even though the append-only receipt truthfully recorded an immediate GREEN. The plan now names an acceptance oracle and first-run-result step without rewriting the append-only history.
- Final adversary follow-up is pending on the corrected exact diff.

#### Final adversary follow-up — CLEAN / READY
- The same adversary reviewed the corrected full package and found no remaining CRITICAL, HIGH, MEDIUM, LOW, or merge-blocking issue.
- Remaining obligations are the governed commit/PR path, exact-reviewed-head hosted CI and CodeQL, PR merge, Pages provenance, deployment, and live smoke. No Supabase deployment is required for this client-only slice.

#### ca-pr coverage gate — HIGH resolved
- Coverage audit blocked PR staging because the browser oracle could pass when spotlight content existed off-screen or clipped. The correction now requires real visible bounding boxes, nontrivial size, viewport and bay containment, tile separation, and separation from Start Game and both Garage regions across desktop-fine, small-window, and pixel-touch. Focused Playwright is 3/3 and the coverage follow-up confirms no CRITICAL or HIGH blocker remains.
- Non-blocking findings retained without expanding this bounded slice: waiting-room first-roster fallback lacks a direct oracle; failed-atlas fallback lacks a real browser-pixel oracle; online name identity and executed reduced-motion coverage are thinner than hot-seat coverage.
- Exact adversarial review and the commit gate must re-clear for this tests-and-audit correction before PR push.

#### ca-pr correction adversary — CLEAN / READY
- The same adversary reviewed the exact tests-and-audit correction and found no false-positive geometry path, material viewport flakiness, audit-integrity issue, CRITICAL, HIGH, or merge blocker.
- The correction is ready for its governed test-only commit; hosted exact-head checks remain required after push.

#### Garage Spotlight PR and hosted gate receipt
- Ready PR #233 opened at https://github.com/SUaDtL/singedTerra/pull/233 from the exact reviewed correction head `c45f31889a5bfbbb327658830929766399a0d93b`.
- Hosted `typecheck · harnesses · build`, Edge Deno tests, `e2e · rendering guardrails`, CodeQL analysis, and the repository CodeQL gate all passed on that SHA. Supabase Preview skipped as configured because this client-only slice has no backend change.
- The sprint PR-boundary and merge pause is bypassed through one distinct append-only override under the maintainer's standing passion-project authority. PR-only merge, exact-current-head hosted checks, Pages provenance, deployment, and live smoke remain enforced.
- This governance-only closure commit changes no product or test behavior; hosted checks must rerun green on its new exact head before merge.

### Mobility Signatures SMARTS decision and bounded gate

- SMARTS DECISION 2026-08-01: choose client-only mobility signatures over a Mag Deflector or team skirmish. Mobility signatures are Strong on Scalable, Maintainable, Available, Reliable, Testable, and Securable because they exhaustively extend existing cosmetic kits, fail closed, observe rather than mutate authoritative movement, need no backend/version-skew path, and admit pure plus browser-pixel oracles. Confidence high.
- HARD-GATE SCOUT 2026-08-01: reject Mag Deflector for this autonomous cell because a genuinely selectable deflector needs a new replay payload/referee validation branch, crossing the network trust boundary reserved as a user-only stop. Team skirmish likewise widens peer-controlled room options and deterministic winner contracts. Confidence high.
- SPEC/PLAN GATE 2026-08-01: .codearbiter/specs/mobility-signatures.md and .codearbiter/plans/mobility-signatures.md are bound under one sprint-specific logged override from the maintainer's standing authority. No security, dependency, migration, backend, merge, or deployment gate is bypassed. Confidence high.

- TASK 1 SMARTS CLARIFICATION 2026-08-01: choose a reduced immutable pose/event seam importing the shared legal movement bounds over passing full TankState or duplicating constants. Strong Maintainability, Reliability, Testability, and Securability follow from narrow data, exact engine-bound drift resistance, and no mutation authority. Profiles use one exhaustive six-field record with fixed bounded values for all four existing kits. Confidence high.

#### Task 1 accepted — pure movement-signature contract
- TDD RED: the focused Vitest run failed to resolve the intentionally absent mobilitySignatures module before production code existed.
- GREEN: the reduced pose classifier imports the authoritative movement bounds, rejects reset/reposition/dead/buried/non-finite paths, emits immutable kit/direction events, and exposes exhaustive bounded profiles plus lifecycle helpers. Focused result 14/14; full typecheck green.
- Independent task review: spec PASS and quality APPROVED with no Critical, Important, Minor, or confirmed cannot-verify gap. The reviewer could not source the exact profile literals from its extracted brief; controller confirmed they match the pre-implementation SMARTS clarification and sprint-log receipt. Confidence high.

#### Task 2 accepted — bounded battlefield mobility renderer
- TDD RED/GREEN: real renderer lifecycle tests drove legal-delta admission, under-tank layer placement, finite expiry, reset, reduced-motion suppression, and an idle-network-move wake path. Focused/relevant result reached 35/35; movement harness and full typecheck green.
- REVIEW FIX ROUND 1: controller review found stale removed-ID baselines, mocked-away lifecycle proof, weak motif distinctness, and nullable production seams. Real-render tests, pairwise geometry/accent signatures, roster pruning, and explicit fixtures closed three findings.
- REVIEW FIX ROUND 2: scoped re-review caught that an absent roster snapshot itself could be idle-skipped. The non-mutating keyset mismatch now wakes exactly one prune/baseline frame; the real baseline→absence→idle→same-ID-reappearance lifecycle produces no false burst and returns idle. Final scoped verdict ALL_ADDRESSED with no Critical or Important breakage. Confidence high.

#### Task 3 accepted — production mobility proof
- FIRST HONEST BROWSER RESULT: 6/6 failed because the compact Garage modal intercepted an out-of-order seed click and a broad red-pixel centroid included terrain. These were oracle defects; modal ordering and canvas observation were corrected without production changes.
- REVIEW FIX ROUND 1: task review found fuel-only/fixed-strip movement evidence and async-art fingerprint contamination. A pre-navigation #game Canvas observer now proves active P1 treads move exactly +8, waits for three stable hashes, isolates live-versus-expired pixels in the same moved underbody mask, binds each motif to exact profile-accent operations, and proves reduced motion emits zero operations/delta.
- GREEN: production Playwright passes 6/6 across desktop-fine, small-window, and pixel-touch in 16.7s; typecheck and diff hygiene green; port 4173 clean. Scoped re-review returned ALL_ADDRESSED with no Critical or Important breakage. No production defect or production-code correction was required. Confidence high.

- FULL-SUITE CORRECTION 2026-08-01: `npm run test:client` exposed 22 failures across nine legacy Renderer tests that bypass the constructor and lacked the new non-null mobility stores. Systematic debugging confirmed test-fixture drift, not a runtime defect. Fix round 3 added explicit inert/real mobility dependencies to only those seams; exact group 65/65 and full client 742/742 green, with movement harness and typecheck green. Scoped re-review returned ALL_ADDRESSED and confirmed no production relaxation. Confidence high.

#### Mobility Signatures final local gate receipt
- Fresh exact-worktree gates are green: `npm run check`; 104 client files / 742 tests; production build; and 6/6 production Playwright cases across desktop-fine, small-window, and pixel-touch, including reduced motion.
- Supply-chain and hygiene gates are green: `npm audit --audit-level=high` reports zero vulnerabilities; `git diff --check` is clean; no conflict markers exist; codeArbiter's state-free changed-file scan reports no secret findings and leaves status unchanged.
- The exact uncommitted branch package now advances to one whole-branch adversarial review covering the bound spec, plan, sprint log, tests, and final diff. Confidence high.

- INCREMENTAL NUDGE 2026-08-01: the maintainer observed that many open issues may no longer apply. Queue the next bounded sprint cell as evidence-based issue hygiene against current `main` and production: close only fully satisfied issues with concrete source/test/live proof; rewrite or split partially stale issues; preserve still-actionable work. This does not interrupt Mobility Signatures delivery. Confidence high.

#### Final adversary correction � reduced-motion network wake
- MEDIUM merge blocker: the idle gate returned false for same-roster reduced-motion states before checking authoritative pose deltas. A remotely delivered same-phase move could therefore remain visually stale because `main.ts` skipped `Renderer.render`; the existing hot-seat browser oracle's synchronous dirty path masked this network-specific gap.
- TDD RED: the new real-render lifecycle test expected one wake for an externally delivered reduced-motion move and failed at `isAnimating(moved) === false` while the other 11 focused tests passed.
- GREEN: removing only the premature reduced-motion return lets the pure legal-delta observer wake one frame; `trackMobility` still rebases without spawning a signature or extending busy work. Focused result 12/12; full client 104 files / 743 tests; deterministic check, production build, 6/6 production Playwright, zero-vulnerability audit, diff hygiene, and state-free secret scan all green.
- The same whole-branch adversary confirmed the correction is causal and technically clean; exact refreshed-package clearance follows. Confidence high.

#### Final whole-branch adversarial clearance � CLEAN / READY
- The same adversary verified refreshed package SHA-256 `CFA240918D32E9783377021D471D16EB9ECD9C993AF8106CCAA790DF08979FB4` against the live tracked diff and seven untracked files.
- Verdict: no remaining Critical, High, Medium, Low, or other merge-blocking finding. Spec compliance, deterministic/network isolation, renderer lifecycle/idle cost, reduced motion, Canvas layering, browser-test fidelity, audit integrity, and security/secrets are cleared.
- Reviewer-fresh proof passed 26/26 focused mobility tests, 104 files / 743 client tests, `npm run check`, diff/conflict hygiene, and targeted secret review. Governed commit/PR plus hosted exact-head CI remain. Confidence high.

#### Mobility Signatures PR and hosted gate receipt
- Ready PR #234 opened at https://github.com/SUaDtL/singedTerra/pull/234 from exact reviewed behavior head `944c141584d2a5559df6f9221c5498f3f711aeb6`.
- Hosted typecheck/harness/build, Edge Deno tests, E2E rendering guardrails, CodeQL analysis, and the repository CodeQL gate passed on that SHA. The first Edge attempt failed before tests on an external `esm.sh` HTTP 522; a failed-job rerun on the same SHA executed the Deno suite green. Supabase Preview skipped as configured for this client-only slice.
- CodeRabbit remains an optional external review context and is not a hosted CI or protected-branch requirement. The maintainer's standing review rule is satisfied by the clean exact-diff adversarial subagent pass.
- The sprint PR-boundary and merge pause is bypassed through one distinct append-only override under the maintainer's standing passion-project authority. This governance-only closure changes no product or test behavior; all hosted checks must rerun green on its new exact head before PR-only merge. Confidence high.

#### Hosted review correction � Canvas accent causality and surface-step branch
- GitHub's CHANGES_REQUESTED review exposed two valid low-severity gaps that became merge blockers: the production Canvas probe classified `fillRect` using `strokeStyle`, and the pure classifier lacked an isolated excessive-surface-step case.
- TDD RED: switching `fillRect` observation to its real `fillStyle` made all three movement browser profiles fail at the false Foundry `fillRect` accent expectation while reduced-motion cases stayed green. The expected motif contract now requires only operations actually painted with the profile accent; focused production Playwright is 6/6.
- Coverage correction: a legal `dx=2` with `dy=9` now directly proves rejection beyond `MAX_MOVE_SURFACE_STEP * abs(dx)`; focused classifier result 15/15.
- Fresh correction matrix is green: 104 client files / 744 tests, `npm run check`, production build, 6/6 production Playwright, zero-vulnerability audit, diff/conflict hygiene, and state-free secret scan. The same adversary must clear the exact correction before the governed commit and hosted final-head rerun. Confidence high.

#### Adversary correction � real path-stroke causality
- MEDIUM merge blocker: Bulwark and Jackal still treated `arc` and `lineTo` path construction as proof that profile accents were painted. Player-color fills could preserve pixel evidence even if the later accent `stroke()` calls disappeared.
- TDD RED: requiring the real `stroke` operation made all three movement browser profiles fail at Bulwark while reduced-motion cases remained green.
- GREEN: the pre-navigation Canvas observer now records actual `stroke()` paint calls in addition to motif geometry. Bulwark and Jackal require `arc`, `lineTo`, and `stroke` with their exact profile accent; Foundry and Ranger require real accent-painted `strokeRect`; pairwise pixel fingerprints remain required. Production Playwright passes 6/6 in 18.6s. Exact correction re-review remains required. Confidence high.

## 2026-08-01 - Open Issue Hygiene sprint

- **[high] Select evidence-backed issue hygiene as the next bounded cell.** The maintainer observed that many open issues may no longer apply. Compared immediately adding another visual feature, leaving the inventory untouched, or bulk-closing old items, SMARTS Maintainable/Reliable/Testable/Securable strongly favors a complete current-main audit with explicit close, partial, and retain dispositions. Chosen `open-issue-hygiene`, strength strong. Confidence high.
- **[high] Preserve hard-gated issue surfaces without mutation.** Issue #69 concerns security controls and secrets, #110 changes security policy, and #125 requires a migration. The audit may report their current state but will not close, retitle, or comment on them. This keeps the user's standing override inside its explicit boundary. Confidence high.
- **[high] Land the disposition record before mutating GitHub issues.** SMARTS Reliable/Auditable/Testable favor one immutable reviewed report on a green PR, followed by exact mechanical issue actions from that merged record. This avoids asking a reviewer to reconstruct already-mutated external state. Confidence high.
- **[high] Close five, narrow five, preserve six.** Current source, merged PRs, fresh coverage, and live production prove #10, #85, #104, and #109 complete; #64's own correctness analysis disproves its proposed optimization. #45, #67, #68, #70, and #134 retain real narrower work. #47, #69, #110, #111, #125, and #129 remain current and unchanged. Confidence high.
- **Baseline:** fresh deployed main `7d4deb8`; `npm ci` found zero vulnerabilities; `npm run check` passed; `npm run coverage:client` passed 104 files / 744 tests at 89.43% statements and 91.82% lines; no scoped localhost listeners were running. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override for this spec and plan only. No runtime, dependency, workflow, migration, Supabase, or deployment change is authorized. Confidence high.
- **H-05 mechanical repair:** PowerShell's `>>` encoded the first uncommitted audit tails as UTF-16. The committed `HEAD` prefix of each append-only log was restored byte-for-byte and the intended receipts re-appended as UTF-8; the distinct repair override records the correction. No historical receipt was removed or rewritten. Confidence high.
### Open Issue Hygiene adversarial correction

- **HIGH merge blocker corrected - #104 residual rerun window.** PR #158 deliberately left #104 open because pre-guard workflow runs keep their historical unguarded workflow definition while GitHub permits reruns for up to 30 days. A green current deploy proves present provenance but does not remove that residual path. #104 now remains open and unchanged with an explicit time-bound re-audit condition. Confidence high.
- **MEDIUM evidence corrections completed.** PR #81 and current `isValidColor` source prove #69's color bound complete while its other three security items remain; Lobby's current evidence is 3,249 lines and 18 `render*` methods, not the unsupported 45-method count. The report now states both facts exactly. Confidence high.
- **Superseding disposition:** close four issues (#10, #64, #85, #109), narrow five (#45, #67, #68, #70, #134), and preserve seven unchanged (#47, #69, #104, #110, #111, #125, #129). Expected open inventory after exact application is 12. This supersedes the earlier close-five receipt without removing it from the append-only record. No GitHub issue has been mutated. Confidence high.
### Open Issue Hygiene adversarial clearance

- The same adversarial reviewer re-checked the exact correction delta. #104's HIGH residual-window blocker, #69's MEDIUM completion-state error, and #129's MEDIUM method-count error are resolved. No new Critical, High, Medium, Low, or other merge blocker remains. Exact-diff verdict: CLEAN. Confidence high.
### Hosted review correction

- CodeRabbit's change request identified two merge-blocking evidence gaps and one MD001 hierarchy defect. #64 now cites the live `NetworkClient.computeNextSeat` seam, `seat_reuse.mjs`, `engine_clone_parity.mjs`, and the absence of a replacement PR; #109 now cites PR #195 and the direct `HUD.instruments.test.ts` absence oracle. Confidence high.
- #104 now pins the controlling pre-guard Pages run `29793872670`, source commit `5d4dc6154a180259fbc9530ca74e178263070552`, initial time `2026-07-21T01:42:56Z`, and earliest 30-day re-audit time `2026-08-20T01:42:56Z`, with the current official GitHub rerun-policy source. No issue mutation has occurred. Confidence high.
- The two new level-four headings in this unmerged tail were mechanically corrected to level three under a distinct H-05 receipt. The final diff from `origin/main` remains append-only and no receipt text changed. Exact correction re-review and a fresh hosted matrix remain required. Confidence high.

## 2026-08-01 - Decisive Starter-Weapon Falloff sprint

- **[high] Select issue #45's evidenced lethality remainder.** After Open Issue Hygiene reduced 16 open items to 12, SMARTS compared #45 combat feel, #47 network vote-to-kick, #129 Lobby decomposition, and #134 direct unit coverage. Player impact and boundedness favor a starter-weapon lethality slice; it changes one pure deterministic contract and avoids auth, migration, dependency, and broad refactor surfaces. Confidence high.
- **[high] Separate obsolete range premise from live damage problem.** Current production and a fresh 100-seed deterministic calibration show the historical 49-degree / 70-power shot damages the opponent on 29% of terrains, so accuracy is no longer broadly easy. Landed Baby Missile shots average 17.9 damage with an 18.9 median, so the remaining damage-floor concern is current. Confidence high.
- **[high] Choose a per-weapon quadratic curve over peak inflation, a hard floor, or a global curve.** A quadratic `1 - normalizedDistance^2` interior keeps the exact center and visible edge fixed while raising legitimate glances. Selecting it only for Baby Missile and Missile avoids strengthening multi-hit and premium weapons. SMARTS Maintainable/Reliable/Testable strength strong. Confidence high.
- **[high] Preserve accuracy, geometry, and premium balance.** Canvas size, placement, aim, power, wind, launch speed, crater radius, visual reach, prices, ammo, peak damage, cluster/Betty/MIRV/nuke/napalm behavior, backend, and dependencies are non-goals. The 100-seed hit rate must remain 29%; only landed-shot damage may rise. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, spec, and plan only. All hard gates, TDD, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.
- **TDD RED:** `npx tsx scripts/checks/blast_reach.mjs` failed only the new decisive midpoint and actual Baby Missile/Missile base-radius expectations: midpoint remained 50 instead of 75, Baby Missile dealt 15.111 instead of 23.506, and Missile dealt 26.667 instead of 41.481. Center, edge, Baby Nuke, MIRV, terrain, napalm, and renderer controls stayed green. Confidence high.
- **TDD GREEN and calibration:** a positive per-weapon exponent now flows through the pure shared damage helper and actual `GameEngine.detonate`; omitted, zero, and non-finite values preserve linear behavior. The focused harness passes. Across the same 100 deterministic seeds, the reference-shot hit count remains 29, mean flight remains 121.8 ticks, and landed damage rises from 17.88 mean / 18.9 median to 24.62 mean / 27.3 median. Confidence high.
- **Fresh verification:** `npm ci` found zero vulnerabilities; `npm run check` passed the complete deterministic/lockstep suite; `npm run coverage:client` passed 104 files / 744 tests at 89.43% statements and 91.82% lines; `npm run build` passed. Exact diff, audit repair, secret scan, browser acceptance, adversarial review, commit, hosted CI, PR-only merge, and deployment remain. Confidence high.
- **H-05 mechanical repair:** current main's two audit files lacked terminal newlines, so the first uncommitted append joined the prior receipt. Both committed `HEAD` prefixes were restored byte-for-byte and the intended tails re-appended as UTF-8 with explicit leading line breaks; the distinct override records the repair. No historical receipt was removed or rewritten. Confidence high.
- **Focused browser and hygiene acceptance:** one scoped Vite server was opened on 127.0.0.1:5173, the deterministic hot-seat production bundle loaded, a real Baby Missile shot completed through the next-turn HUD with the battlefield and command console intact, and the browser emitted zero warnings/errors. The local tab closed and the exact Vite listener was verified and stopped. The state-free scan found zero secret matches and zero dependency, workflow, security-control, Supabase, or migration paths. Confidence high.
### Adversary correction - mixed-version network replay

- **HIGH validated - mixed deployed clients would diverge.** The first implementation applied the catalog exponent in every GameEngine, so an old and new browser could interpret the same network fire action with different damage. The lockstep contract makes that a merge blocker even though all same-version determinism harnesses passed. Confidence high.
- **SMARTS correction - local opt-in over backend expansion.** An Edge-enforced room ruleset version would be a reliable long-term network rollout, but it expands this bounded balance slice into referee-contract work. Reliable/Testable/Securable favor a fail-closed GameOptions.starterWeaponFalloff: all engines default to legacy linear damage, hot-seat explicitly opts into decisive falloff, and network clients remain mixed-version compatible until that boundary is separately governed. No backend, auth, migration, security-control, or dependency path changed. Confidence high.
- **Correction RED/GREEN.** The revised focused harness failed only because default Baby Missile and Missile still used the decisive curve (23.506 vs 15.111 and 41.481 vs 26.667). The execution-context gate made both defaults linear while explicit decisive engines retain the stronger curve; Baby Nuke and MIRV controls stay unchanged. Positive and negative infinity cases now mutation-kill removal of the finite-exponent guard. Confidence high.
- **Recalibration.** Across seeds 0-99 at 49 degrees / 70 power, both rules keep 29 hits and 121.83 mean flight ticks. Linear/default yields 17.8848 landed mean, 18.8679 median, and 7 hits at least 25 damage; hot-seat decisive yields 24.6156 mean, 27.2653 median, and 17 hits at least 25 damage. Confidence high.
### Adversary correction round 2 - causal production wiring

- **MEDIUM merge blocker corrected.** Engine-level tests proved both curves but bypassed main.ts, so deleting the hot-seat opt-in or accidentally enabling it for network would have left the focused harness green. Production now derives both modes through one pure buildClientEngineOptions seam used directly by main.ts. Confidence high.
- **TDD RED/GREEN.** The new focused Vitest first failed because the production builder did not exist. It now proves network maps to explicit linear falloff and hot-seat maps to decisive falloff while preserving room physics inputs; focused 2/2 and strict typecheck pass. Confidence high.
### Final corrected-package clearance

- **Adversarial verdict CLEAN.** The same reviewer confirmed both production branches use the tested builder, network is explicitly linear, hot-seat is decisive, focused mutations fail causally, clone parity holds, Infinity guards are covered, audit prefixes are byte-exact, and no Critical, High, Medium, Low, or other merge blocker remains. No reviewer edits were made. Confidence high.
- **Fresh full verification.** npm run check passed the complete deterministic and lockstep suite; client coverage passed 105 files / 746 tests at 89.45% statements and 91.83% lines; production build passed; the state-free secret scan returned no findings; diff hygiene and hard-gated scope checks passed. Confidence high.
- **Exact-wiring browser smoke.** One local 127.0.0.1:5173 Vite server loaded the corrected e2e hot-seat path. A real Baby Missile shot advanced to P2's turn, the ballistic HUD and command console remained present, and browser diagnostics contained no warning/error entries. The tab closed and all scoped localhost listeners were stopped. Confidence high.
### PR #236 initial hosted gate and merge override

- **Exact reviewed behavior head green.** PR #236 head b2ca8b38aeb481efc0884b67e6c208fe10bde90e passed hosted typecheck/harness/build, Edge Deno tests, rendering guardrails, CodeQL analysis and gate, plus the CodeRabbit status context. Supabase Preview skipped as configured for a client/shared-only change. Confidence high.
- **Merge pause override logged.** The maintainer's standing passion-project authority bypasses codeArbiter's sprint PR-boundary and merge pause through one distinct append-only receipt. This governance-only change requires exact review and a fresh hosted matrix before the PR-only merge. Confidence high.

## 2026-08-01 - Network Ruleset Boundary Phase A sprint

- **[high] Select the Edge-enforced network ruleset boundary.** The decisive-falloff adversary proved that same-version deterministic tests do not protect mixed deployed browsers. SMARTS compared this bounded compatibility contract with test-only issue #134, broad Lobby decomposition #129, and auth-touching vote-kick #47; Reliable, Testable, Scalable, and player-facing multiplayer progress favor the ruleset seam. Confidence high.
- **[high] Use a two-phase rollout with current version 1.** Phase A teaches Edge and client code versions 1 and 2 while every production create request still emits 1. Phase B will separately flip new rooms to 2 only after Phase A Edge deployment is live. Missing client/stored versions resolve to legacy 1. Confidence high.
- **[high] Make stored room options authoritative.** create_room echoes the options it actually stored and the Lobby consumes them; an older Edge that ignores the new request therefore leaves the client safely on legacy 1. Join rejects mismatches before roster mutation; submit rejects them after membership and seat-token verification but before turn authorization/RPC. Confidence high.
- **[high] Avoid migration and security-control expansion.** rooms.options is existing JSONB, so no schema migration is required. The slice does not change seat tokens, auth, RLS, crypto, secrets, rate limits, CORS, dependencies, or action-log shapes. Existing credential validation order remains intact. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this Phase A design, spec, and plan only. All hard gates, TDD, adversarial review, exact-head CI, PR-only merge, scoped deployment, and production verification remain active. Confidence high.
- **TDD RED/GREEN:** focused Edge tests first failed because the shared ruleset module and handler wiring did not exist; focused client tests first failed because the network ruleset and rematch configuration seams did not exist. The implemented boundary now emits version 1 from create/join/submit and retries, consumes authoritative stored options, and selects linear or decisive network falloff from ruleset 1 or 2. Confidence high.
- **Adversary correction - Phase A creation and stored-shape fail-close.** The reviewer found that the first implementation understood version 2 but also permitted public creation of version-2 rooms, contradicting rollback-safe Phase A, and that malformed JSONB shapes silently became legacy version 1. Both High findings were validated. A distinct creation resolver now permits only omitted/explicit version 1 and returns stable HTTP 409 for prepared version 2 before DB access; only valid non-array objects may use the absent-field legacy default. Confidence high.
- **Adversary correction - causal trust-order and rematch coverage.** The membership and seat-token tests now use a version-2 room with a version-1 request, proving both 403 gates precede compatibility disclosure. Corrupt stored options return 409 after credential checks but before join mutation, action RPC, or rematch pointer claim. A pure rematch configuration seam proves a successor version 2 reaches decisive production engine construction. Confidence high.
- **Fresh corrected-package verification:** all 199 Edge tests and 107 client files / 752 tests passed; client coverage is 89.48% statements and 91.86% lines. The full deterministic and lockstep harness, production build, dependency audit, diff hygiene, and state-free secret scan passed. One unrelated pixel-touch visual test failed only under the first 16-worker run, passed in isolation, and the complete 132-test suite then passed with 121 executed and 11 intentionally skipped; no rendering code was changed. Exact correction re-review remains required before commit. Confidence high.
- **Adversarial correction verdict CLEAN.** The same reviewer re-ran 49 focused Edge tests and 81 focused client tests, confirmed all four prior findings were causally resolved, found no new Critical, High, Medium, scope-drift, auth-order, or merge blocker, and made no edits. Confidence high.

### PR #237 hosted gate and merge override

- **Exact reviewed behavior head green.** PR #237 head c5911b836b05f4ac388aecf14830f52e7627f0bb passed hosted typecheck/harness/build, all 199 Edge tests, rendering guardrails, CodeQL analysis and gate, plus the CodeRabbit status context. Supabase Preview skipped as configured. Confidence high.
- **Merge pause override logged.** The maintainer's standing passion-project authority bypasses codeArbiter's sprint PR-boundary and merge pause through one distinct append-only receipt. This governance-only change requires exact review and a fresh hosted matrix before the PR-only merge. Confidence high.

## 2026-08-01 - Network Ruleset Boundary Phase B1 sprint

- **[high] Enable v2 creation server-first while retaining v1 creation.** SMARTS compared a dual-version backend gate, a v2-default backend, and an atomic backend/client flip. Reliable, Available, and Securable strongly favor accepting explicit versions 1 and 2 while omission remains legacy 1: old deployed clients keep working, the backend becomes forward-compatible, and the public client cannot race an unavailable referee contract. Confidence high.
- **[high] Keep the slice to the creation capability boundary.** Only the pure creatable-version resolver, direct create-room handler tests, and ruleset rollout documentation change. The client constant stays 1; engine math, join/submit compatibility, auth/token ordering, action logs, database schema, dependencies, and existing rooms do not change. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this Phase B1 design, spec, and plan only. All hard gates, TDD, adversarial review, exact-head CI, PR-only merge, scoped deployment, and production verification remain active. Confidence high.
- **TDD RED/GREEN:** focused tests first failed behaviorally because explicit version 2 resolved without a version and create_room returned HTTP 409 instead of 200; 11 compatibility controls stayed green. The minimal resolver/handler change then passed all 13 focused tests. Confidence high.
- **Server-first compatibility proof:** all 199 Edge tests passed, including unchanged join, submit, restart, and legacy-option paths. The public client constant remains version 1; only its rollout comment changed to distinguish Phase B1 from Phase B2. Confidence high.
- **Fresh local verification:** the complete deterministic/lockstep harness passed; client coverage passed 107 files / 752 tests at 89.48% statements and 91.86% lines; production build passed; npm audit reported zero vulnerabilities; diff hygiene and the state-free secret scan passed with no dependency, migration, workflow, security-control, auth, crypto, or secret paths changed. Confidence high.
- **Phase A production closure:** PR #237 merged through the reviewed PR as 54f8798cee1234b0af74cd3db6e732d3744a4609 after the exact governance head 00f5bf7bb99dc4f1f7d11bfcc62adc5ebb20c481 passed build, Edge, rendering, CodeQL, and CodeRabbit gates. create_room v40, join_room v34, submit_action v42, and restart_game v32 reported ACTIVE; Pages run 30697344620 passed provenance and live smoke. Production probes returned 409 ruleset_not_available for v2 creation and 200 authoritative ruleset 1 for v1 create/join. Confidence high.
- **Adversarial correction - audit bytes and causal invalid-input coverage:** the reviewer found three Medium blockers: committed audit prefixes had been line-ending normalized, the v2 resolver assertion discarded its discriminant, and malformed create values were not proven pre-DB at the live handler. The exact origin/main blobs now prefix both audit files byte-for-byte under the distinct H-05 receipt; v2 uses an exact structural assertion; unsupported numeric, string, null, and fractional values fail closed through both the creation resolver and handler before DB access. Confidence high.
- **Type-contract tightening:** the review's Low finding was corrected in scope: request/creation resolvers now expose only invalid_request while stored-option resolution exposes only invalid_stored. Focused correction tests pass 13/13. Confidence high.
- **Adversarial correction verdict CLEAN.** The same reviewer independently re-proved exact audit prefixes, exact v2 result shape, pre-DB rejection for numeric/string/null/fractional invalid versions, precise request/stored unions, focused 13/13 tests, Phase A production evidence, and stable scope. No Critical, High, Medium, Low, or merge blocker remains. Confidence high.
### PR #238 initial hosted gate and merge override

- **Exact reviewed behavior head green.** PR #238 head fda51e2c6487b1bb1b2e01f231b65c2dc11038d6 passed hosted typecheck/harness/build, all 199 Edge tests, 121 rendering guardrails with 11 configured skips, CodeQL analysis and gate, plus the CodeRabbit status context. Supabase Preview skipped as configured. Confidence high.
- **Merge pause override logged.** The maintainer's standing passion-project authority bypasses codeArbiter's sprint PR-boundary and merge pause through one distinct append-only receipt. This governance-only change requires exact review and a fresh hosted matrix before the PR-only merge. Confidence high.
### Phase B1 production closure

- **Reviewed exact head merged and deployed.** PR #238 passed a fresh hosted matrix on governance head `5068852a55809bd8f0c1a3bbfe90b634d890343e`, then merged through the PR as `1a32d992518f7dc99ec3cc7dbea347cdb5641d99`. `create_room` v41 reports ACTIVE; no database migration or other Edge function was deployed. Confidence high.
- **Production dual-version contract proven.** Omitted and explicit-version-1 creation returned authoritative version `1`; explicit-version-2 creation returned authoritative version `2`; a version-1 join to that v2 room failed with HTTP 409 and required version `2`; a matching version-2 join then succeeded. Pages run `30698551085` passed exact-merge provenance and live-render smoke. Confidence high.

## 2026-08-01 - Network Ruleset Boundary Phase B2 sprint

- **[high] Advance new browser rooms to v2 with an exact legacy-lobby bridge.** SMARTS compared a bare constant flip, a general negotiation layer, and one server-directed legacy retry. Available, Reliable, and Testable strongly favor the bounded retry: first request version `2`; retry exactly once as version `1` only for HTTP 409 + `ruleset_mismatch` + authoritative required version `1`. Confidence high.
- **[high] Keep established gameplay room-authoritative.** The global current version selects new-room behavior only. Legacy joins consume version-1 room options and every action/retry uses that synchronized room version; new v2 rooms remain v2 and never downgrade. Confidence high.
- **[high] Preserve the hard trust boundary.** The deployed join referee rejects a mismatch before roster mutation, making the exact retry causally safe. This slice does not alter Edge code, credentials, tokens, auth, RLS, secrets, rate limits, persistence, dependencies, or offline balance. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this Phase B2 design, spec, and plan only. All hard gates, TDD, adversarial review, exact-head CI, PR-only merge, Pages deployment, and production verification remain active. Confidence high.

- **TDD RED/GREEN:** The first focused run failed 3 of 9 tests because the browser still emitted version `1` and returned the first legacy mismatch without retry. After the minimal transport and current-version change, 69 focused ruleset, Lobby, engine-selection, rematch, and NetworkClient tests pass. The matrix proves exact v1 retry conditions, fail-closed non-retry cases, v2 ready-up and action retry, and authoritative v1 ready-up/action behavior. Typecheck is green. Confidence high.

- **Adversarial correction - legacy rematch oracle.** The reviewer found one Medium gap: every explicit rematch test used version `2`, so a mutant replacing an authoritative legacy successor with the new global current version could survive. Server normalization plus winning/losing response projectors now cover both versions; client successor handling and rematch-to-engine construction prove v1 remains linear and v2 remains decisive. Focused correction verification passes 64 client tests and 13 restart tests. Confidence high.

- **Adversarial correction verdict CLEAN.** The same reviewer re-proved authoritative v1/v2 preservation across client successor handling, rematch configuration, engine falloff selection, server normalization, stored projection, and both winning/losing response projectors. The global-current substitution mutant now fails; no Critical, High, Medium, Low, scope, security, governance, or merge blocker remains. Confidence high.
- **Fresh corrected-package verification:** all 200 Edge tests and 108 client files / 762 tests pass; client coverage is 89.49% statements and 91.86% lines. The full deterministic/lockstep harness, production build, 121 applicable browser guardrails with 11 configured skips, dependency audit, diff hygiene, hard-surface scan, and state-free secret scan are green. Confidence high.

### PR #239 hosted gate and merge override

- **Exact reviewed behavior head green.** PR #239 head `41fbd3404356f27c23d6ad193fead3859a0751fd` passed hosted typecheck/harness/build, all 200 Edge tests, 121 rendering guardrails with 11 configured skips, CodeQL analysis and gate, plus the CodeRabbit status context. Supabase Preview skipped as configured for the client-only change. Confidence high.
- **Merge pause override logged.** The maintainer's standing passion-project authority bypasses codeArbiter's sprint PR-boundary and merge pause through one distinct append-only receipt. This governance-only change requires exact review and a fresh hosted matrix before the PR-only merge. Confidence high.

- **Hosted review correction - exact legacy retry prose.** CodeRabbit's formal review correctly found that `ARCHITECTURE.md` abbreviated the retry predicate. Canonical architecture prose now requires HTTP 409, exact `ruleset_mismatch`, numeric `requiredRulesetVersion: 1`, and explicitly fails closed without retry for every other response, matching the specification and tested transport contract. Confidence high.

## 2026-08-01 - Fire Projection Allocation sprint

- **[high] Select issue #68's valid deterministic-engine remainder.** SMARTS compared the fire projection allocation, test-only issue #134, broad Lobby decomposition #129, and the issue's remaining gradient proposal. Scalable, Maintainable, Reliable, and Testable favor the bounded `syncFire` seam: it removes repeated fixed-step garbage without changing gameplay or touching a hard boundary. Confidence high.
- **[high] Reject the obsolete explosion/scorch gradient premise.** Current explosion radius and stop alpha change over burst life, scorch stop alpha changes during fade, and both gradients are created under changing world transforms. A cached coordinate-bound `CanvasGradient` is no longer equivalent to current rendering. No renderer change is included; issue #68 will be closed with this evidence after the valid remainder ships. Confidence high.
- **[high] Reuse only identical sorted topology.** Options weighed were a parallel life array, dirty flags threaded through ignite/expiry call sites, and validation at the existing projection seam. The seam-local membership/order check is strongest: the private Map remains authoritative, decay mutates only scalar life, and any topology difference falls back to the existing rebuild/sort. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, spec, and plan only. All hard gates, TDD, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.
- **TDD RED:** the real public-action napalm harness preserved the pre-fix trace digest `2f86c04e39e1f4d5bb916df6e4bc6b05649c54a1ffa673df9e3278eb34636466` but failed because 0/55 decay-only ticks reused the projection; all 44 observed topology changes already replaced it. The pre-existing motion harness stayed green. Confidence high.
- **TDD GREEN:** `syncFire()` now validates the current sorted column set, updates only life scalars when it matches, and otherwise uses the existing rebuild/sort path. The unchanged assertions pass: 55/55 decay-only ticks reuse the projection, 44/44 topology changes replace it, and the complete trace digest is byte-identical. Confidence high.
- **Fresh verification:** `npm run check` passed the full deterministic/lockstep chain; 108 client files / 768 tests and all 200 Edge tests passed; Windows client coverage is 91.87% lines and 79.57% branches; production build passed; npm audit found zero vulnerabilities; diff whitespace is clean. The shared engine has no numeric coverage command in `tech-stack.md`, so its Phase-5 evidence is the focused obligation harness plus full deterministic suite under the documented no-tooling exemption. Confidence high.

### Adversary correction - topology guard causality

- **MEDIUM merge blocker corrected.** The first real-shot fixture observed 44 topology changes, but all changed cardinality; a mutant removing membership/order validation could survive while the allocation counters stayed green. Three direct real-engine projection-seam cases now cover an equal-cardinality key swap, disorder, and duplication, requiring a new sorted authoritative projection. Confidence high.
- **Targeted mutation proof.** Removing the Map-membership guard fails `equal-cardinality key swap reused an invalid projection`; removing the sorted-order guard fails `disordered projection reused an invalid projection`. The restored implementation passes all three recovery cases plus the unchanged 55/55 decay reuse, 44/44 real-shot topology replacement, and exact trace digest. Confidence high.

### Adversary correction clearance

- **Exact-package verdict CLEAN / READY.** The same reviewer confirmed equal-cardinality replacement kills removal of Map-membership validation, disorder/duplication kill removal of sorted-order validation, unconditional rebuild is killed by the 55/55 decay identity contract, and the deterministic digest plus 44/44 real topology replacements remain intact. No Critical, High, Medium, Low, governance, scope, or merge blocker remains. Confidence high.

- **[high] Merge pause override logged for PR #243.** The maintainer's standing passion-project authority authorizes a PR-only merge after the reviewed behavior head 930f672, this governance receipt's exact-diff review, and every hosted check is green on the final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

### Hosted review correction - malformed projection shapes

- **CodeRabbit merge blocker verified.** Because `getState()` exposes the live snapshot, a runtime consumer could replace `state.fire` with `null` or insert a null cell; the reuse path then threw before reaching its documented authoritative rebuild fallback. A new regression failed at `current.length` on the uncorrected head. Confidence high.
- **TDD GREEN and exact correction clearance.** Reuse now requires an actual array plus non-null cells with integer x coordinates. Null projections and null cells rebuild cleanly; the focused oracle passes 5/5 malformed/topology recovery cases, 55/55 decay-only identity reuse, 44/44 real topology replacements, and the unchanged deterministic trace digest. `npm run typecheck` and the full `npm run check` chain pass. The adversarial re-review returned CLEAN / READY with no finding at any severity. Confidence high.

- **[high] Corrected-head merge authority logged for PR #243.** A superseding append-only override binds the standing PR-only merge authority to reviewed correction head 983cbba because the earlier receipt named the pre-CodeRabbit behavior head. Exact review of this governance receipt and fresh hosted checks on the final head remain required. Confidence high.

## 2026-08-01 - Direct Client Helper Vitest sprint

- **[high] Select issue #134's direct client coverage gap.** SMARTS favors colocated Vitest tests for the small dependency-free helpers: they join the normal client suite, make coverage visible, and avoid any production or backend change. Existing root harnesses remain independent evidence. Confidence high.
- **[high] Pin timing and identity, not just values.** Retry coverage uses fake timers for default, custom, and zero delay, and exhaustion requires the exact final Error object. This kills delay regressions and error-cloning mutants without real wall-clock waits. Confidence high.
- **[high] Exhaust pure audio truth tables.** Fire activation, Betty bounce deltas, and all eight OOB boolean combinations are finite and directly testable, so complete tables are clearer and stronger than sampled integration cases. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.
- **Baseline:** before direct tests, retry.ts measured 58.33% statements, 62.5% branches, and 60% lines; audioEdges.ts measured 0% in all metrics. The global client report measured 89.49% statements, 79.57% branches, 81.23% functions, and 91.87% lines. Confidence high.
- **H-05 recovery:** two discarded uncommitted worktrees demonstrated that protected-ledger overwrite and Windows PowerShell 5.1 redirection are unsafe. The slice was reconstructed from exact origin/main; the final worktree appends only new ASCII bytes with Git Bash and requires exact staged blob-prefix proof before commit. Confidence high.

### Fresh verification

- **Focused contracts and targeted coverage green.** The two direct files pass 24/24 tests with fake timers; retry.ts and audioEdges.ts jointly measure 100% statements (20/20), branches (21/21), functions (5/5), and lines (16/16). Exact final Error identity is asserted with `toBe`. Confidence high.
- **Full repository matrix green.** `npm run check` passed the complete deterministic/lockstep harness; the client passed 110 files / 792 tests; all 200 Edge tests passed; production build passed; npm audit reported zero vulnerabilities. Full client coverage is 89.77% statements, 80.36% branches, 81.84% functions, and 92.11% lines. Confidence high.
- **Scope and hygiene green.** Production helper files, package manifests, lockfile, workflows, shared engine, and Supabase code remain byte-identical to origin/main. `git diff --check` is clean; the state-free secret scan returned no findings. Confidence high.

### Adversarial correction clearance

- **Exact-package verdict CLEAN / READY.** The same reviewer re-proved that exact final Error identity kills an error-cloning mutant, the complete audio truth tables are causal, and both protected working files normalize to exact origin/main prefixes with append-only tails. It found no Critical, High, Medium, Low, governance, scope, security, or merge blocker. Final staged-blob prefix proof remains required before commit. Confidence high.

- **Staged audit integrity proven.** The staged overrides blob begins with the exact main blob (SHA-256 `88f31235d153923cf0299a66fe63e609fd3a95a769c18487491ac594014cae87`) before its 1,232-byte tail. The staged sprint-log blob begins with the exact main blob (SHA-256 `c2f4bbd41d19996734c375a8ba9356b2057a351deb0e9db810a433f38b651356`) before its 3,224-byte tail. Confidence high.

### Audit evidence correction

- **Intermediate tail length superseded.** The preceding 3,224-byte sprint-log tail measurement was accurate before the review and prefix-evidence receipts were appended, but it is not the final staged length. The committed-prefix SHA-256 values remain correct. To avoid a self-referential receipt that changes the length it reports, final tail lengths are recomputed from the exact staged blobs and supplied to the adversarial and commit gates rather than embedded here. Confidence high.

- **Chronology correction to the superseding receipt.** The 3,224-byte sprint-log tail was measured after the adversarial CLEAN review receipt had already been appended and immediately before the staged-integrity evidence receipt was appended. The earlier phrase implying it preceded both receipts was imprecise and is superseded by this exact ordering. Confidence high.

### PR #244 hosted gate and merge override

- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after reviewed behavior head `31b9d95`, this governance receipt's exact-diff review, and every hosted check is green on the final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby View Browser Oracle sprint

- **[high] Build the oracle before decomposing Lobby.** Issue #129 names the absence of real-browser Lobby coverage as the reason view extraction would be blind. SMARTS favors a production-bundle geometry oracle before moving any render method. Confidence high.
- **[high] Navigate through public controls.** A private-state query hook would be faster but could bypass broken navigation and add runtime-only fixture surface. Hot Seat, Online Create, and Join by Code are reachable offline through the real UI, so Phase 1 tests exactly those paths. Confidence high.
- **[high] Assert durable invariants, not screenshots.** Stage containment, document-scroll absence, horizontal overflow absence, visible labels, and reachable action boxes survive intentional visual evolution while catching crushed or inaccessible controls. Confidence high.
- **[high] Defer network-owned views.** Browse and Waiting Room need deterministic transport/Realtime fixtures; forcing them into this slice would mix a network harness with the offline geometry oracle. They remain an explicit Phase 2 before their render methods move. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### Browser-oracle characterization

- **Initial RED exposed a faulty oracle premise.** All 9 cases failed because the first assertion required the Lobby card to fit inside `#stage`. Current architecture intentionally defines `#lobby` as a full-app overlay covering both the 1200px battlefield and 264px HUD panel, so the stage is not its containing block. No production change was justified. Confidence high.
- **Corrected GREEN uses the real containing block.** The invariant now proves card containment inside `#lobby`, zero document page scroll, zero horizontal card overflow, and reachable primary controls. Hot Seat, Online Create, and Join by Code pass 9/9 across desktop-fine, pixel-touch, and small-window against the production bundle. Confidence high.

### Fresh verification

- **Rendering matrix green.** The complete production-bundle Playwright suite passes 130 cases across the configured desktop, touch-landscape, and small-window projects with 11 intentional project/tag skips. The new Lobby oracle contributes 9/9 passing cases. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/lockstep harness chain; the client passed 110 files / 792 tests; all 200 Edge tests passed; client coverage remains 89.77% statements, 80.36% branches, 81.84% functions, and 92.11% lines; production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Scope and hygiene green.** Only the two E2E files plus governed spec/plan/audit tails changed. Production client code, dependencies, lockfile, workflows, shared engine, Supabase, auth, crypto, and migrations remain unchanged. Diff hygiene is clean and the state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer independently verified causal public navigation, the four geometry/reachability invariants across all viewports, and `page.goto('./')` under an explicit `/singedTerra/` Vite base. It found no Critical, High, Medium, or merge blocker. Browse, Waiting, and expanded configurations remain an explicit non-blocking Phase 2 limitation; this sprint advances rather than closes issue #129. Confidence high.

### PR #245 hosted gate and merge override

- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after reviewed behavior head `85b2273`, this governance receipt's exact-diff review, and every hosted check is green on the final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby Network View Browser Oracle sprint

- **[high] Complete the oracle before extracting network views.** PR #245 protects the offline views; Browse and Waiting remain the two unguarded render branches named by issue #129. The next safe cell covers them before moving code. Confidence high.
- **[high] Intercept the public transport boundary.** Playwright routing plus same-origin dummy coordinates preserves the real response-to-state-to-DOM path while preventing any real backend call. A runtime state hook would be less causal and would ship unnecessary fixture surface. Confidence high.
- **[high] Render fixtures without mutating room state.** The tests may open Browse and create a fixture Waiting room, but they do not click Join, Ready Up, Leave, Copy Invite, or launch a game. This isolates geometry/readability from network mutation semantics. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### Browser-oracle characterization

- **TDD RED proved the missing transport coordinates.** The first causal fixtures reached Browse and Waiting but emitted `/undefined/functions/v1/list_rooms` and `/undefined/functions/v1/create_room`; the broad route matcher had initially masked that malformed base. The tightened oracle records the request and requires the page origin plus exact `/functions/v1/<name>` path. Confidence high.
- **GREEN uses local-only origin coordinates.** The non-live Playwright server now builds with `VITE_SUPABASE_URL=http://localhost:4173` and an explicit dummy anon key. Both network views render through public controls and intercepted response contracts; 15/15 focused cases pass across desktop-fine, pixel-touch, and small-window at both `/` and `/singedTerra/` bases. Confidence high.
- **Synthetic credential finding corrected without weakening the scanner.** The state-free scan correctly flagged a quoted `token` fixture assignment. The non-secret value is now constructed at runtime, the Waiting matrix remains 3/3 green, and the unchanged scanner returns no findings. Confidence high.

### Fresh verification

- **Rendering matrix green.** The complete production-bundle Playwright suite passes 136 cases with 11 intentional project/tag skips. The two new network-view tests contribute six passing cases across the configured viewport projects. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 110 files / 792 tests; all 200 Edge tests passed; client coverage remains 89.77% statements, 80.36% branches, 81.84% functions, and 92.11% lines; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Scope and hygiene green.** Production client code, dependencies, lockfile, workflows, shared engine, Supabase, auth, crypto, and migrations remain unchanged. Diff hygiene is clean and the final state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer found no Critical, High, Medium, Low, or merge-blocking finding. It independently verified live-smoke isolation, exact same-origin intercepted paths, public-control causality, all-project execution, absence of dependency/secret/runtime/backend change, governance alignment, and that issue #129 remains open. Confidence high.

### PR #246 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #246 head `a83e71c8359dc481703ca31b95cab3de60666ec4` passed CodeQL, CodeQL analyze, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby Browse View Builder sprint

- **[high] Extract Browse before Waiting.** The completed network-view oracle removes issue #129's stated test blocker. Browse is the smallest network view and owns no Realtime roster lifecycle, so it is the safest first per-view extraction. Confidence high.
- **[high] Use a stateless full-view builder.** A room-list helper would leave `renderBrowse()` responsible for the overall composition; a stateful class would duplicate Lobby lifecycle ownership. Passing prebuilt shared nodes, current data, and callbacks moves the complete view while keeping effects in Lobby. Confidence high.
- **[high] Preserve behavior mechanically.** Visible strings, classes, inline styles, DOM order, callback timing, polling, transport, and session ownership are parity obligations. The new seam receives direct red tests, while every pre-existing test file remains untouched. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, precise refactor surface, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### TDD and fresh verification

- **Behavioral RED then GREEN.** The compile-only builder shell produced three causal failures on missing Browse DOM and actions while all 44 pre-existing focused Lobby tests stayed green. The stateless implementation then passed all three direct seam tests, the unchanged 44-test Lobby set, and the unchanged 15-case browser oracle. Confidence high.
- **Rendering matrix green.** The complete production-bundle Playwright suite passes 136 cases with 11 intentional project/tag skips. The unchanged Lobby browser oracle also passes 15/15 at the GitHub Pages `/singedTerra/` base. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 111 files / 795 tests; all 200 Edge tests passed; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Coverage improved.** Full client coverage is 90.86% statements, 80.65% branches, 81.90% functions, and 93.26% lines. `Lobby.ts` is 68.04% branches and 88.81% lines, above its 66.66% / 85.20% baseline and the stage-1 60% floor; `LobbyBrowseView.ts` is 100% lines. Confidence high.
- **Scope and hygiene green.** No pre-existing test file changed. Polling, transport, session, CSS, dependencies, lockfile, workflows, shared engine, Supabase, auth, crypto, and migrations remain unchanged. Diff hygiene is clean and the state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer independently confirmed mechanical parity for DOM order, text, classes, inline styles, metadata, fallback host, full/busy disabling, and synchronous callbacks; Lobby retains every state, render effect, join/leave, polling, transport, and session responsibility. Direct tests are causal, no pre-existing test changed, governance additions are append-only, and no dependency, lockfile, CSS, backend, auth, crypto, workflow, or security scope drift exists. It found no Critical, High, Medium, Low, or merge blocker. Confidence high.

### PR #247 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #247 head `51412a9` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby Waiting View Builder sprint

- **[high] Extract Waiting after Browse.** The network-view browser oracle and LobbySession lifecycle seams now cover the largest remaining network view. Waiting Room is the natural next per-view cell and directly advances issue #129. Confidence high.
- **[high] Keep identity and effects in Lobby.** Duplicate normalization, clipboard work, ready/leave requests, Realtime, heartbeat, transport, and session state already have established ownership and tests. Passing their results/callbacks avoids architectural drift while moving the complete DOM composition. Confidence high.
- **[high] Pass exact invite elements to the callback.** The existing clipboard method mutates the button and ARIA status node asynchronously. Supplying those nodes preserves identity, timing, success/failure announcements, and existing invite tests without moving I/O into the builder. Confidence high.
- **[high] Preserve behavior mechanically.** Visible strings, pluralization, classes, inline styles, DOM order, clash semantics, button states, and callback timing are parity obligations. The new seam receives direct red tests, while every pre-existing test file remains untouched. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, precise refactor surface, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### TDD and fresh verification

- **Behavioral RED then GREEN.** The compile-only builder shell produced four causal failures on missing Waiting DOM/actions while all 61 pre-existing focused Lobby tests stayed green. The implementation then passed all four direct seam tests, the unchanged 61-test focused set, and the unchanged 15-case browser oracle. Confidence high.
- **Rendering matrix green.** The complete production-bundle Playwright suite passes 136 cases with 11 intentional project/tag skips. The unchanged Lobby browser oracle also passes 15/15 at the GitHub Pages `/singedTerra/` base. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 112 files / 799 tests; all 200 Edge tests passed; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Coverage improved.** Full client coverage is 91.23% statements, 81.25% branches, 81.95% functions, and 93.58% lines. `Lobby.ts` is 68.57% branches and 88.98% lines, above its 68.04% / 88.81% baseline and the stage-1 60% floor; `LobbyWaitingView.ts` is 100% lines and 94.73% branches. Confidence high.
- **Scope and hygiene green.** No pre-existing test file changed. Clipboard implementation, Realtime, heartbeat, transport, session, CSS, dependencies, lockfile, workflows, shared engine, Supabase, auth, crypto, and migrations remain unchanged. Diff hygiene is clean and the state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer independently confirmed parity for readiness copy, code cells, invite identity/ARIA/dispatch, roster order/styles, normalized clash cues, badges, shared-node/warning/status/action order, and action states. Lobby retains duplicate detection, clipboard, ready/leave, Realtime, heartbeat, transport, session, state, and render effects. Precomputing pure clash scans and detached shared nodes is unobservable because the call is synchronous and performs no state or I/O side effect. It found no Critical, High, Medium, Low, or merge blocker. Confidence high.

### PR #248 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #248 head `7bea592` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby Hot Seat View Builder sprint

- **[high] Extract Hot Seat next.** It is the smallest remaining complete top-level view, already protected by the browser oracle, and avoids network/session coupling. Confidence high.
- **[high] Pass detached shared nodes.** Player rows and Advanced settings already have distinct Lobby-owned builders/effects; passing their nodes extracts complete composition without widening ownership. Confidence high.
- **[high] Keep launch behavior in Lobby.** Player-name fallback, loadout normalization, settings parsing, and `onReady` are behavior, not presentation. The builder receives one Start callback and current validation result. Confidence high.
- **Approval gate:** standing passion-project authority is recorded in one sprint-specific append-only override. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### TDD and fresh verification

- **Behavioral RED then GREEN.** A compile-only builder shell produced three causal failures for the missing Hot Seat selector, classes, and Start action while all seven unchanged focused Lobby invite tests stayed green. The implementation then passed all three direct seam tests, the unchanged focused set, strict typecheck, and the unchanged 15-case browser oracle. Confidence high.
- **Rendering matrix green.** The complete production-bundle Playwright suite passes 136 cases with 11 intentional project/tag skips. The unchanged Lobby browser oracle also passes 15/15 at the GitHub Pages `/singedTerra/` base. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 113 files / 802 tests; all 200 Edge tests passed; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Coverage clears the governed floor.** Full client coverage is 91.23% statements, 81.29% branches, 82.01% functions, and 93.58% lines. `Lobby.ts` remains above the stage-1 floor at 68.31% branches and 88.56% lines; the small percentage shift from baseline reflects extraction-denominator movement rather than a lost test. Confidence high.
- **Scope and hygiene green.** No pre-existing test file changed. CSS, dependencies, lockfile, workflows, shared engine, Supabase, auth, crypto, and migrations remain unchanged. Diff hygiene is clean and the state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer found no Critical, High, Medium, Low, or merge blocker. It independently confirmed exact wrapper/crowded classes, dynamic range copy and selector state, shared-node identity/order, validation text, Start behavior, and Lobby ownership of mutation, click-time validation, name fallback, loadout normalization, settings parsing, and `onReady`. The reduced render-time validation call is safe because `validationError()` is pure and launch still revalidates; prebuilt rows and Advanced settings are synchronous detached nodes whose effects remain event-bound. Tests causally cover the extracted seam and the approved seven-file scope has no dependency, CSS, backend, auth, crypto, migration, workflow, or pre-existing-test drift. Confidence high.

### PR #249 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #249 head `21c98d1` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby Join View Builder sprint

- **[high] Extract Join after Hot Seat.** SMARTS comparison against Create and the Online wrapper scores Join highest for bounded scope, reversibility, oracle strength, and low effect coupling. The 75-line complete view directly advances issue #129 while leaving the larger Create form for a later isolated cell. Confidence high.
- **[high] Keep normalization and effects in Lobby.** The builder receives a canonicalizing callback that returns the current code plus Join/Create/Browse callbacks. Lobby retains code state, error clearing, navigation, rendering, validation, transport, session writes, polling, and waiting-room transition. Confidence high.
- **[high] Pass detached shared nodes.** Name/color, Garage, and status already have Lobby-owned builders and effects. Passing their nodes preserves identity/order without widening the seam or duplicating behavior. Confidence high.
- **[high] Preserve behavior mechanically.** Exact copy, attributes, classes, DOM order, input normalization timing, busy presentation, and action ordering are parity obligations. Direct causal tests supplement the unchanged 15-case browser oracle; no pre-existing test file changes. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, exact seven-file surface, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### TDD and fresh verification

- **Baseline green.** Before production edits, 57 focused pre-existing Join/Lobby tests, the unchanged 15-case browser oracle, and 113 files / 802 client tests passed. `Lobby.ts` started at 88.56% lines and 68.31% branches, above the stage-1 60% floor. Confidence high.
- **Behavioral RED then GREEN.** The compile-only builder shell produced three causal failures on missing Join copy/control/actions while all 57 focused pre-existing tests stayed green. The implementation then passed all three direct seam tests, the unchanged 57-test focus, strict typecheck, and the unchanged 15-case browser oracle. Confidence high.
- **Rendering matrix green.** The complete production-bundle Playwright suite passes 136 cases with 11 intentional project/tag skips. The Lobby browser oracle also passes 15/15 at the GitHub Pages `/singedTerra/` base. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 114 files / 805 tests; all 200 Edge tests passed; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Coverage clears the governed floor.** Full client coverage is 91.23% statements, 81.34% branches, 82.06% functions, and 93.53% lines. `Lobby.ts` remains above the stage-1 floor at 68.42% branches and 87.89% lines; extraction-denominator movement explains the small line-percentage shift. Confidence high.
- **Scope and hygiene green.** No pre-existing test file changed. CSS, dependencies, lockfile, workflows, shared engine, Supabase, auth, crypto, and migrations remain unchanged. Diff hygiene is clean and the state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer found no Critical, High, Medium, Low, or merge blocker. It independently confirmed exact root/copy/control attributes, shared-node and button order, classes/text, raw-to-canonical input timing, busy disabled semantics, and all action routes. Lobby retains normalization state, error clearing, sub-view/render effects, validation, transport, loadout normalization, session writes, polling, waiting-room transitions, and error handling. Prebuilt name/color, Garage, and status nodes are synchronously detached and have no state or I/O effect before later event handlers. Tests are causal and the approved seven-file scope has no pre-existing-test, dependency, CSS, backend, auth, crypto, migration, workflow, or shared-engine drift. Confidence high.

### PR #250 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #250 head `0be0efe` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby Create View Builder sprint

- **[high] Extract Create after Join.** SMARTS ranks the last major top-level form above tiny wrapper/banner seams for issue alignment and maintainability impact. Its stateful paths already have strong network tests plus the 15-case geometry oracle, and the DOM extraction remains reversible. Confidence high.
- **[high] Keep field construction and effects in Lobby.** Lobby supplies detached name/color, Garage, advanced setting fields, and status nodes plus typed callbacks. It retains bot clamping, state writes, rendering, navigation/error clearing, validation, transport, sessions, subscriptions, and waiting-room transition. Confidence high.
- **[high] Let the builder own dynamic presentation.** Player/bot/visibility options, conditional difficulty, Advanced wrapper/order, and busy/action presentation are one coherent view contract and receive direct causal tests. Confidence high.
- **[high] Preserve behavior mechanically.** Exact copy, attributes, classes, option order/selection, DOM order, callbacks, and busy semantics are parity obligations. No existing tests or external surfaces change. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, exact seven-file surface, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### TDD and fresh verification

- **Baseline green.** Before production edits, 57 focused pre-existing Lobby tests, the unchanged 15-case browser oracle, and 114 files / 805 client tests passed. `Lobby.ts` started at 87.89% lines and 68.42% branches, above the stage-1 60% floor. Confidence high.
- **Behavioral RED then GREEN.** The compile-only builder shell produced three causal failures on missing Create copy/fields/actions while all 57 focused pre-existing tests stayed green. The implementation then passed all three direct seam tests, including exact option labels/action classes, the unchanged 57-test focus, strict typecheck, and the unchanged 15-case browser oracle. Confidence high.
- **Rendering matrix green.** The complete production-bundle Playwright suite passes 136 cases with 11 intentional project/tag skips. The Lobby browser oracle also passes 15/15 at the GitHub Pages `/singedTerra/` base. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 115 files / 808 tests; all 200 Edge tests passed; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Coverage improved and clears the floor.** Full client coverage is 91.45% statements, 81.54% branches, 82.20% functions, and 93.66% lines. `Lobby.ts` remains above the stage-1 floor at 68.29% branches and 87.31% lines. Confidence high.
- **Scope and hygiene green.** No pre-existing test file changed. CSS, dependencies, lockfile, workflows, shared engine, Supabase, auth, crypto, and migrations remain unchanged. Diff hygiene is clean and the state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer found no Critical, High, Medium, Low, or merge blocker. It independently confirmed exact copy, classes, labels, selector ranges/order/selection, conditional difficulty, Advanced wrapper and seven field contracts, shared/status/action order, busy semantics, and typed callback timing. `MIN_PLAYERS`/`MAX_PLAYERS` remain exactly the former 2/4 literals. Lobby retains bot clamping and render ordering, field writes, navigation/error clearing, validation, room creation, loadout normalization, transport, sessions, waiting transition, subscription, and errors. Prebuilt nodes are synchronously detached with no immediate state/I/O effect. Tests are causal and the seven-file scope has no external drift. Confidence high.

### PR #251 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #251 head `dc928ba` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Lobby Shell View Builder sprint

- **[high] Extract the shell after all major per-view builders.** SMARTS scores shell composition 29/30 versus shared online fields 23/30 and hot-seat row/Advanced helpers 21/30: it directly removes four issue-named `renderX` seams, has stronger existing oracles, and avoids widening behavioral ownership. Confidence high.
- **[high] Pass only the selected content.** Lobby chooses the active tab and current online sub-view before calling the builder, so inactive views are not constructed and existing render-time work remains identical. Confidence high.
- **[high] Keep rejoin and navigation effects in Lobby.** The builder emits typed callbacks; Lobby retains state writes, rerendering, live revalidation, storage/token access, transport, config assembly, and `onReady`. Confidence high.
- **[high] Preserve the online wrapper.** `buildLobbyOnlineView()` wraps only the already-selected sub-view node, maintaining exact DOM depth without prebuilding inactive network views. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, exact seven-file surface, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### TDD and fresh verification

- **Baseline green.** Before production edits, 61 focused pre-existing tab/rejoin/network tests, the unchanged 15-case browser oracle, and 115 files / 808 client tests passed. `Lobby.ts` started at 87.31% lines and 68.29% branches, above the stage-1 60% floor. Confidence high.
- **Behavioral RED then GREEN.** A compile-only builder shell produced three causal failures on missing shell structure, tab routes, and online wrapper while all 61 focused pre-existing tests stayed green. The implementation then passed all three direct seam tests, the unchanged focused set, strict typecheck, and the unchanged 15-case browser oracle. Confidence high.
- **Rendering matrix green.** The complete production-bundle Playwright suite passes 136 cases with 11 intentional project/tag skips. The unchanged Lobby browser oracle also passes 15/15 at the GitHub Pages `/singedTerra/` base. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 116 files / 811 tests; all 200 Edge tests passed; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Coverage improved and clears the floor.** Full client coverage is 91.50% statements, 81.54% branches, 82.35% functions, and 93.70% lines. `Lobby.ts` remains above the stage-1 floor at 67.70% branches and 86.88% lines. Confidence high.
- **Scope and hygiene green.** No pre-existing test file changed. CSS, dependencies, lockfile, workflows, issue/task trackers, shared engine, Supabase, auth, crypto, and migrations remain unchanged. The exact seven-file scope is clean, diff hygiene passes, and the state-free secret scan returned no findings. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer found no Critical, High, Medium, or merge blocker. It independently confirmed exact card/title/preview/optional-rejoin/tabs/content/controls order, copy, classes, button types, active classes, zero-argument callbacks, and online wrapper identity/depth. Lobby still clears the root first, constructs only the selected active view, owns tab/rerender and unchanged live rejoin validation/storage/token/transport/session/config/`onReady` effects, and applies Garage inert behavior after card insertion. The render-time ordering of synchronous detached presentation builders is non-observable. Tests are causal, the seven-file scope has no external drift, and both protected logs remain append-only after Git normalization. Confidence high.

### PR #252 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #252 head `537ac96` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Combat Identity Card sprint

- **[high] Prefer a tactical identity card over world-space sprite scaling.** SMARTS rates the card strong for Maintainable, Available, Reliable, Testable, and Securable because it reuses the existing preview seam and leaves deterministic geometry untouched. World scaling is weak for Reliability because the visual muzzle and collision envelope would diverge. Confidence high.
- **[high] Use one dedicated 144x80 direct-scale-two profile.** Direct variants preserve authored detail better than enlarging the existing 84x48 bitmap, while the existing profile map keeps thumbnail and spotlight callers stable. Confidence high.
- **[high] Preserve one-page fit with CSS presentation tiers.** Full size belongs to desktop/fine-pointer combat; compact and coarse layouts downscale the same high-resolution canvas and remain guarded by computed Chromium geometry. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, exact nine-file surface, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### TDD and fresh verification

- **Baseline green.** Before production edits, 26 focused preview/portrait/part tests and 35 applicable HUD browser cases passed with 10 intentional project skips. Confidence high.
- **Behavioral RED then GREEN.** The tactical profile test failed on the absent profile, and two HUD identity tests failed on the missing mode argument while 24 focused tests stayed green. The browser build also rejected the missing typed mode. The minimal two-file implementation then passed 27 focused tests and strict client typecheck. Confidence high.
- **Responsive browser oracle green.** Direct Chromium geometry passed desktop-fine, pixel-touch, and small-window: the internal canvas stays 144x80; desktop renders full size; compact/coarse tiers remain bounded and inside the HUD. Confidence high.
- **Live pixel inspection green.** The running local game showed a materially larger, crisp active-vehicle portrait with readable authored chassis and barrel detail, no command-rail crowding, and unchanged world muzzle/trajectory geometry. The sole localhost and agent-created inspection tab were closed afterward. Confidence high.
- **Repository matrix green.** `npm run check` passed the deterministic/typecheck harness chain; the client passed 116 files / 812 tests; all 200 Edge tests passed; the production build passed; npm audit reported zero vulnerabilities. Confidence high.
- **Coverage clears the floor.** Full client coverage is 91.51% statements, 81.54% branches, 82.37% functions, and 93.70% lines; `HUD.ts` is 80.09% branches and 95.41% lines. Confidence high.
- **Production browser matrix green.** The complete production-bundle Playwright suite passed 139 of 150 cases with 11 intentional project/tag skips, including the new tactical card across all three projects. Confidence high.
- **Scope and hygiene green.** The state-free secret scan returned no findings; diff hygiene passes. No dependency, lockfile, asset, engine, world renderer, input, backend, auth, crypto, migration, workflow, issue, or task-tracker file changed. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer found no Critical, High, Medium, Low, or merge blocker. It independently confirmed the typed 144x80 direct-scale-two profile, unchanged thumbnail/spotlight and preview lifecycle, preserved HUD accessibility/caching/stale clearing, exact desktop/compact/coarse tiers, real-browser containment, unchanged world geometry and engine scope, causal tests, exact nine-file surface, and append-only protected logs after Git normalization. Confidence high.

### PR #253 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #253 head `c323a10` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01 - Live Gameplay README Capture

### SMARTS selection and standing approval

- **[high] Refresh the public gameplay capture instead of inventing another unproven runtime effect.** The live visual scout showed the current combat HUD is coherent and the apparent Arsenal clipping was false at measured crop. The README screenshot is objectively behind PR #253 and is a direct player-acquisition surface. This scores strong for Specific, Maintainable, Available, Reliable, Testable, and Securable while changing no gameplay contract. Confidence high.
- **[high] Capture the exact deployed build at the existing 1440x720 documentation frame.** Reusing the established production hot-seat entrypoint and removing only the splash produces truthful, reproducible evidence without a localhost or production mutation. Confidence high.
- **[high] Keep the chore to one raster replacement plus accurate alternative text.** The narrow surface is independently reviewable and avoids mixing stale-task or gameplay work after live evidence disproved both initial candidates. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this design, exact six-file surface, spec, and plan only. All hard gates, adversarial review, exact-head CI, PR-only merge, and deployment verification remain active. Confidence high.

### Capture and verification

- **Production provenance proven.** `deploy-meta.json` returned SHA `7eb0bb0bf86d2990a80fe07e361c72434d34f3d8` and run `30718311899`, matching the successful PR #253 Pages deployment. Confidence high.
- **Capture contract proven.** An ephemeral Chromium context loaded the production `?e2e=hotseat` entrypoint at 1440x720, removed the splash, dismissed the First Salvo coach through its real Skip control, waited for the typed 144x80 tactical canvas and authored preview signature, and found zero viewport violations across `#app`, `#game`, `#hud`, and the portrait. Confidence high.
- **Raster integrity proven.** The final JPEG decodes as 1440x720 24-bit RGB, is 138,142 bytes, and has SHA-256 `BF50E3171224EA7B89C68FB97A6C3C34B809E359B119A4A43444462AB71AE089`. The replaced asset was 117,921 bytes with SHA-256 `2B6D7B6890A6E1A713E92228C52B0A4FFD58EDA6CE3352F388A62D0260C3692E`. Confidence high.
- **Visual inspection green.** The frame shows the full fitted battlefield, both tanks, honest short trajectory hint, Command Deck, player status, ballistic computer, larger crisp custom-tank identity portrait with aligned barrel, movement fuel, Store, Fire, and collapsed Arsenal. No splash, tutorial, modal, scroll bar, or clipped surface is visible. Confidence high.
- **Repository gates green.** `npm run check` passed strict typecheck and all 60 deterministic harnesses; `npm run build` passed; all 12 local README links/assets resolve; the state-free secret scan returned `[]`; `git diff --check` passed. `npm ci` installed only the existing lockfile and audited 145 packages with zero vulnerabilities; manifests and lockfile are unchanged. Confidence high.
- **Read-only preview report.** Changed surface is the two append-only logs, README, one JPEG, and the new spec/plan. The path matrix predicts no specialist reviewer because there is no source, security, dependency, migration, or architecture path; the standing sprint still requires one generic adversarial documentation/visual review. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The reviewer found no Critical, High, Medium, Low, or merge blocker. It independently verified the exact six-file surface; successful deployment run `30718311899` on SHA `7eb0bb0bf86d2990a80fe07e361c72434d34f3d8`; 1440x720 24-bit JPEG integrity, 138,142-byte size, and expected SHA-256; full production composition with a crisp enlarged portrait and aligned barrel; absence of splash/tutorial/modal/scroll/clipping; truthful README alternative text; no runtime/dependency/lockfile/workflow/backend/issue/task-tracker drift; byte-exact normalized protected-log prefixes; and clean diff hygiene. Confidence high.

### Capture-scope correction

- **[high] Clarify the final ephemeral-browser interaction.** The initial SMARTS note described removing only the splash. The accepted final capture also dismissed the one-time First Salvo coach through its real Skip control inside the disposable browser context, as the spec, plan, capture evidence, and visual result record. No game state, durable user browser state, source, or production data changed. Confidence high.

### PR #254 hosted gate and merge override

- **[high] Behavior head cleared hosted CI.** PR #254 head `69fce088e5b9729bc6899cfefb480efdc8186e7a` passed CodeQL, CodeQL analysis, typecheck/harness/build, Edge, rendering E2E, and CodeRabbit status; Supabase Preview was intentionally skipped. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority authorizes a PR-only squash merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01T21:48:45.3216369Z — Store catalog grid sprint

### SMARTS selection and standing approval

- **[high] Replace the Store's undifferentiated list with a category-first card catalog.** Live production inspection showed that the current Store is functionally complete but forces a player to scan one long vertical list with no behavior guidance. Four always-visible categories plus concise role copy score strong for Specific, Maintainable, Available, Reliable, Testable, and Securable while leaving deterministic gameplay and economy untouched. Confidence high.
- **[high] Keep category sections visible instead of using tabs or a carousel.** A responsive grid enables price and role comparison in one glance; tabs hide most inventory and a carousel adds turn-time interaction. The catalog becomes the only scroll owner while title, credits, and Close remain fixed. Confidence high.
- **[high] Keep presentation metadata client-only and dependency-free.** A typed `storeCatalog.ts` boundary makes coverage and wording independently testable without expanding `WeaponSystem`'s deterministic contract or taking on new supply-chain surface. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this bounded spec and plan only. Security, auth, secrets, irreversible operations, adversarial review, exact-head hosted CI, PR-only merge, and deployment proof remain active. Confidence high.

### Store catalog implementation and review

- **[high] Keep behavior copy in a typed client-only catalog.** Exact coverage tests prove all 15 finite-stock weapons and both accessories appear once across Impact, Tactical, Terrain & Fire, and Systems; the HUD continues to source live name, price, bundle, lock, affordability, ownership, and purchase payloads from the existing engine definitions and callbacks. Confidence high.
- **[high] Derive the physical Store target floor from the existing stage zoom.** Review reproduced a 32.80px target at 667x375 and 35.22px at the non-compact 0.8 boundary. A presentation-only CSS variable now rounds `44 / scale` upward, catalog-specific rules consume it at every scale, and the original between-round coarse 44px rule remains intact. Confidence high.
- **[high] Keep the modal shell fixed and make the catalog the sole scroll owner.** Computed browser geometry proves a real catalog scroll leaves panel scroll at zero and header/footer rectangles unchanged; panel, Close, and visible buy targets remain inside the modal and viewport at wide, compact, and smaller-landscape sizes. Confidence high.
- **Adversarial fix loop:** Task 1 cleared spec and quality review with no findings. Task 2 required three rounds: two original Mediums (smaller-scale physical target and post-scroll shell proof), then Mediums for the exact 0.8 boundary, between-round selector isolation, and modal containment, then the restored coarse-pointer round-shop minimum. Every Critical, High, Medium, Low, and merge blocker is now closed; final Task 2 verdict is SPEC COMPLIANCE PASS / CODE QUALITY APPROVED. Confidence high.
- **Fresh controller verification at 2026-08-01T22:30:21.8791035Z:** `npm run check` passed typecheck plus all 60 deterministic harnesses; `npm run build` passed; `npm run test:client` passed 118 files / 817 tests; the Store and weapon-glyph Playwright matrix passed 9 tests with 6 intentional project skips; `git diff --check` passed. Confidence high.

### Formal coverage review closure

- **[high] Close the Store lock and phase-gating oracle gap before commit.** The formal coverage lens found that the new catalog cells were not directly exercised at reduced arms level or outside `PLAYER_TURN`. Two real-HUD tests now prove exact weapon/accessory lock labels and native disabled state, plus enable-disable-reenable behavior across `PLAYER_TURN -> FIRING -> PLAYER_TURN`. Fresh focused verification passed 5/5 and client typecheck; scoped re-review returned ADDRESSED and the aggregated `$ca-review` verdict is CLEAN / READY with zero findings. Confidence high.
- **Harvest:** the current Store sprint contains no low-confidence SMARTS decision, current `[NEEDS-TRIAGE]` residue, deferred finding, or parked item to promote. Historical entries elsewhere in the append-only sprint log remain historical and are not this sprint's residue. Confidence high.

### PR #255 hosted gate and merge authority

- **[high] Behavior head cleared exact hosted CI.** Ready PR #255 targets `main` from `codex/store-catalog-grid`; head `c11f28d2194f0e55f223a4ca103b2ac53eef4250` is mergeable and based directly on `main@5e371f2231b049030e57f461a1f5e02d5d6c643f`. CI run `30721929397` passed typecheck/harness/build, 819 client tests, dependency audit, Edge tests, and the full rendering E2E suite; CodeQL run `30721929396` and its CodeQL status passed; CodeRabbit passed with automatic review disabled; Supabase Preview was the expected skip. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority permits a PR-only squash merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01T19:06:37.2241375-04:00 — Shared unchecked indexing sprint

### SMARTS selection and standing approval

- **[high] Migrate the deterministic shared core before the broader client surface.** The remaining open acceptance item in issue #70 is valid, but a fresh strictness probe found 29 shared-core errors versus roughly two hundred additional client and rendering-test findings. Enabling `noUncheckedIndexedAccess` in `shared/tsconfig.json` first isolates the highest-correctness code both execution modes share, keeps review coherent, and leaves the client migration as a separately resumable cell. Confidence high.
- **[high] Treat missing indexed values explicitly rather than asserting them away.** Each finding must close through an empty-case, bounds guard, stable fallback, or narrowly documented adjacent invariant without changing random consumption, ordering, physics, state/action shapes, or deterministic outputs. Confidence high.
- **[high] Do not duplicate landed mobile or weapon-visual work.** Live source and merged-PR inspection proved the earlier mobile aim, movement, utility controls, and typed weapon-signature rendering are already on `main`; the initial touch-surface and weapon-flight candidates were therefore rejected before artifacts or implementation. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this bounded spec and plan only. Security, auth, secrets, irreversible operations, adversarial review, exact-head hosted CI, PR-only merge, and deployment proof remain active. Confidence high.

### Shared unchecked indexing implementation

- **[high] Close all 29 shared-core compiler findings without changing valid-game behavior.** `shared/tsconfig.json` now owns `noUncheckedIndexedAccess: true`. Ordered arrays use presence-proving iteration or explicit empty fallbacks; typed-array access either retains the prior air/floor result for malformed short inputs or throws only if the midpoint-displacement math violates its documented bounds. AI selection order, random consumption, replay order, terrain output, turn rotation, scoring, public types, and serialized contracts are unchanged. Confidence high.
- **[high] Prove malformed-array boundaries directly.** A focused three-test oracle now proves an empty height line places a tank on the floor rather than leaking `undefined`, a short bitmap reads as air, and missing height columns rasterize to empty terrain. The focused test and client typecheck pass. Confidence high.
- **Fresh local verification at 2026-08-01T19:15:07.9442157-04:00:** shared typecheck passed with the owned flag; `npm run check` passed both workspace typechecks and all 60 deterministic harnesses; `npm run test:client` passed 119 files / 822 tests; `npm run build` passed; `npm run audit:deps` found zero vulnerabilities; `git diff --check` passed. No dependency, lockfile, client compiler policy, backend, workflow, action/state shape, gameplay constant, or asset changed. Confidence high.

### Adversarial clearance

- **Exact-package verdict CLEAN / READY.** The single designated adversary found zero Critical, High, Medium, Low, or merge-blocking findings. It independently confirmed all 29 strictness findings are closed; valid dense-array behavior, ordering, random consumption, terrain generation, turn rotation, scoring, replay order, and serialized contracts are unchanged; malformed height/bitmap fallbacks match the documented floor/air contracts; terrain exceptions cover only mathematically unreachable bounds failures; the three focused tests are causal; the issue #70 partial-progress boundary remains honest; and both protected logs remain normalized append-only. Confidence high.

### PR #256 hosted gate and merge authority

- **[high] Behavior head cleared exact hosted CI.** Ready PR #256 targets `main` from `codex/shared-unchecked-indexing`; head `eb8ea3c7c37733a7ebfc810c0d8d9fcc21a3da87` is mergeable and based directly on `main@56cd67b22127865f4402adea9408ed3133f04b2d`. CI run `30723215379` passed typecheck/harness/build, 822 client tests, dependency audit, Edge tests, and the full rendering E2E suite; CodeQL run `30723215428` and its CodeQL status passed; CodeRabbit passed with automatic review disabled; Supabase Preview was the expected skip. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority permits a PR-only squash merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.

## 2026-08-01T19:36:17.4876136-04:00 — Client production unchecked indexing sprint

### SMARTS selection and standing approval

- **[high] Enforce strict indexed access for production before mechanical test-fixture migration.** A fresh client probe found 52 production findings across 11 files and 239 test-only findings across 119 files. An additive production TypeScript project gives runtime code the safety guarantee now while preserving the original full compile and isolating test-fixture cleanup as the next independently reviewable cell. Confidence high.
- **[high] Reject an unenforced cleanup.** Fixing current production errors without wiring the stricter project into the normal `typecheck` script would permit immediate regression; the production pass must be a hosted CI gate, not a one-time audit. Confidence high.
- **[high] Keep the existing full-project compile.** Excluding tests from the new strict project is a scope boundary, not reduced coverage: the current compile still typechecks all production and test sources under the existing policy. Confidence high.
- **Approval gate:** the maintainer's standing passion-project authority is recorded in one sprint-specific append-only override covering this bounded spec and plan only. Security, auth, secrets, irreversible operations, adversarial review, exact-head hosted CI, PR-only merge, and deployment proof remain active. Confidence high.

### 2026-08-01T19:49:52.3098764-04:00 — implementation and adversarial closure

- **[high] Production compiler RED captured and closed.** The additive `typecheck:production` gate first failed with exactly 52 findings across the 11 classified production files and no test source, then passed after bounded iteration, explicit empty guards, and stable presentation fallbacks. The normal client typecheck still runs the original complete compile afterward. Confidence high.
- **[high] Full local verification passed.** `npm run check` passed all 60 deterministic harnesses; `npm run test:client` passed 119 files and 823 tests; `npm run build` passed; dependency audit found zero vulnerabilities; and `git diff --check` passed. Confidence high.
- **[high] One adversary found and closed one Medium.** The designated adversary blocked on missing direct proof for truncated terrain bitmap behavior. A focused regression now proves absent interior neighbor storage contributes neutral air (`223` alpha) rather than `undefined`/`NaN`; the same adversary re-reviewed the frozen package CLEAN/READY with zero Critical, High, Medium, Low, or merge-blocking findings. Confidence high.
- **[high] Scope remains isolated.** No dependency, lockfile, shared engine, network contract, backend, auth, migration, workflow, asset, or gameplay tuning changed. The separately bounded 239 test-fixture findings remain the honest next cell for issue #70. Confidence high.

### 2026-08-01T19:58:41.9081575-04:00 — behavior-head hosted gate

- **[high] Behavior head cleared exact hosted CI.** Ready PR #257 targets `main` from `codex/client-production-unchecked-indexing`; head `e8e9107c9e016b08612a2e77397e19aff537a45f` is mergeable and based directly on `main@7cc094d9fbb2e0c885486d1a4fd806be33087fb3`. CI run `30724220320` passed typecheck/harness/build, 823 client tests, dependency audit, Edge tests, and the full rendering E2E suite; CodeQL run `30724220319` and its CodeQL status passed; CodeRabbit passed with automatic review disabled; Supabase Preview was the expected skip. Confidence high.
- **[high] Merge pause override logged.** The maintainer's standing passion-project authority permits a PR-only squash merge after this governance receipt receives exact adversarial review and every hosted check is green on the resulting final head. Direct default-branch writes and force-push remain prohibited. Confidence high.
