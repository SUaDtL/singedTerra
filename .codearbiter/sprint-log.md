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
