# Sprint spec — Stabilize & Juice 2

> Status: **APPROVED** by user 2026-06-20 (Phase 1 gate, `/ca:sprint`)
> Slug: `stabilize-and-juice-2` · Drafted 2026-06-20
> Theme: user-selected **heavy item (animated terrain collapse)** + **balanced** stabilization companions.
> Follow-up to `stabilize-and-juice` (PR #21). This sprint deliberately crosses the "safe cut"
> line the prior sprint held: it **does** change deterministic-engine timing — but in a contained,
> convergent way (see the Determinism contract). It does **not** cross a trust boundary.

## Goal

One headline engine/physics feature plus two low-risk netcode-correctness companions, kept balanced:

1. **Track A — Animated terrain collapse (the heavy item).** Replace the instant single-tick dirt
   snap with a deterministic, fixed-step *multi-tick settle* during the end-of-turn `RESOLVING`
   phase, so craters cascade and buried tanks sink progressively instead of teleporting. Engine
   timing changes; determinism is preserved by construction (see contract).
2. **Track B — Netcode correctness (safe-cut companions).** Two small robustness gaps from the
   open-tasks backlog: a retry on the best-effort `finish_game` POST, and a bounded/yielding
   action-log replay on join so late joiners and long matches don't freeze the tab.

## Determinism contract (the load-bearing constraint)

The animated collapse lives entirely in `shared/` and runs identically on every lockstep client, so
it never desyncs *by itself*. The contract that keeps it safe:

- **Convergence parity.** A full settle (stepped to completion) MUST produce a bitmap **byte-identical**
  to today's instant `applyGravity` compaction, for the same deform. This is the property a harness pins.
- **Instant mid-flight, animated at rest.** While projectiles are still in flight (cluster/MIRV detonate
  many times mid-arc), the engine settles each detonation **to convergence within that same tick** — so
  every bomblet's collision and the final terrain shape are byte-identical to today. ONLY the final
  end-of-turn settle (no projectiles remain, fire burned out) is spread across multiple `RESOLVING` ticks
  for the animation. Net effect: terrain *shape* is unchanged everywhere; only *timing* (extra RESOLVING
  ticks) changes.
- **Fixed-step, no wall-clock.** Settle advances by a named `COLLAPSE_PX_PER_TICK` constant per tick; no
  `Math.random`, no `Date`, no `performance.now`. Bounded by `ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK)`.
- **No network-contract change.** The action log / `seq` protocol is untouched — collapse is replayed
  identically because every client runs the same engine ticks; no new action types, no `GameState` on the wire.
- **Action-log replay is unaffected for correctness** — replaying the log re-runs these same ticks, landing
  every client on the identical converged terrain.

The `scripts/checks/*.mjs` harnesses (23 today) are the safety net. Terrain-*shape* assertions MUST stay
green unchanged; only tick-count / per-tick-snapshot assertions are re-pinned, and the re-pin is justified
in the receipt.

## Acceptance criteria

Each criterion becomes one `tdd` Phase-1 obligation. "Harness" = a new/extended `scripts/checks/*.mjs`
(Node/tsx, engine-only) run by `npm run check`. Canvas drawing no headless test can assert is verified by
**extracting a pure helper and unit-testing that**, plus a manual-visual note in the receipt.

### Track A — Animated terrain collapse

- **AC-1 Stepped settle with convergence parity.** Extract a pure, exported
  `settleStep(bitmap, xStart, xEnd, pxPerTick) → boolean` (returns whether any pixel moved) in
  `shared/src/engine/Terrain.ts`. `applyGravity` is re-expressed as "loop `settleStep` to convergence"
  and remains exported with its current signature/behavior (the converge-to-completion path).
  - A new harness asserts **convergence parity**: for a representative grid of deforms (seeds ×
    crater positions/radii, incl. cluster/MIRV-style overlapping discs), settling via repeated
    `settleStep` reaches a bitmap **byte-identical** to a single `applyGravity` snap.
  - `settleStep` is deterministic (no random/clock) and moves at most `COLLAPSE_PX_PER_TICK` px/column/call.
  - `COLLAPSE_PX_PER_TICK` is a named, exported constant (default **4** — playtest-tunable, not magic).
  - `npm run check` green (including the re-pinned harnesses).

- **AC-2 Progressive end-of-turn settle + burial in the engine.** During FIRING (projectiles still in
  flight), `detonate()` settles to convergence within the tick (parity preserved). When the turn reaches
  `RESOLVING` with no projectiles and no fire, the engine advances the settle **one `settleStep` per
  `tick()`** until converged, then runs the existing `resolve()` turn-machine. Each settle step re-runs the
  existing post-terrain tank resolution so a tank over a settling column **lowers progressively** and its
  `buried` state is re-derived each step.
  - A harness drives a known deform-under-a-tank and asserts: tank `y` is **monotonically non-decreasing**
    across settle ticks (sinks, never jitters up) and the **final** `(y, buried)` equals today's
    instant-resolution result; the engine remains in `RESOLVING` until converged, then transitions exactly
    as before (`PLAYER_TURN` / `ROUND_OVER` / `GAME_OVER`).
  - Settle completes in **≤ `ceil(CANVAS_HEIGHT / COLLAPSE_PX_PER_TICK)`** ticks; the existing flight-tick
    budget harness is re-pinned and the worst observed total stays well under the `10_000` cap (report it).
  - Determinism harness: two identically-seeded engines fed the same action produce byte-identical
    per-tick terrain + tank state through the whole settle.
  - Manual-visual note recorded (dirt cascades; tank buries progressively).

### Track B — Netcode correctness (safe-cut)

- **AC-3 `finish_game` POST retries once.** The best-effort `finish_game` POST
  (`client/src/client/NetworkClient.ts` ~918-948) retries **once** on a transient failure before giving
  up, relying on the existing `UNIQUE(room_id)` on `match_scores` for idempotency (a duplicate succeeds
  harmlessly). A small retry helper (e.g. `postOnceWithRetry(fn, attempts=2)`) is extracted and harness-tested:
  fail-then-succeed → called twice and resolves ok; succeed-first → called once; both-fail → resolves to a
  handled non-throwing failure (never rejects the caller). No behavior change on the happy path.

- **AC-4 Bounded action-log replay on join.** `initialize()`
  (`client/src/client/NetworkClient.ts` ~200-218) replays the historical log in **bounded chunks that
  yield to the event loop** between batches, instead of one synchronous sweep that freezes the tab for late
  joiners / long matches. A pure `replayInChunks(actions, applyOne, chunkSize, yield)` helper is extracted
  and harness-tested: final engine state after chunked replay is **identical** to a one-shot synchronous
  replay; actions are applied in strict `seq` order; no batch exceeds `chunkSize`; an empty log is a no-op.

## Out of scope / anti-goals

- **No referee / trust-boundary change.** Referee seat re-derivation stays held out (it would hard-gate).
- **No action-log / `seq` contract change**, no `GameState` on the wire, no new action types.
- **Deferred juice that pairs with collapse but is NOT in this sprint:** falling settling debris,
  anti-aliased destruction edges, terrain-thud vs tank-clang audio (still needs the `ExplosionEvent`
  hit-type signal). Logged as next-sprint follow-ups.
- **No prod deploy** — Edge/client code lands on the branch / open-PR; no `supabase functions deploy`.
- **No new client test framework** (no vitest/jest) — verification stays `tsc --noEmit` + extracted-helper
  harnesses + manual visual playtest.
- **No tuning of other gameplay constants** (damage, gravity, prices). `COLLAPSE_PX_PER_TICK` ships at a
  sensible default; feel-tuning is a separate playtest.

## Verification summary

- `npm run check` — typecheck + determinism harnesses (23 today → + new AC-1/AC-2/AC-3/AC-4 coverage),
  exit 0; terrain-shape assertions unchanged, only timing snapshots re-pinned (justified in receipt).
- `npm run typecheck` — client + shared, exit 0.
- Manual visual playtest items (AC-2 cascade/burial animation) listed in the receipt for the user's eyes —
  they cannot be asserted headless and are NOT claimed as auto-verified.

## Landing

Per `/ca:sprint`: `commit-gate` → `finishing-a-development-branch` auto-selects **open-PR**. The sprint
never merges to `main` and never deploys. Branch: `sprint/stabilize-and-juice-2`.
