# Plan — Stabilize & Juice 2

> Spec: `.codearbiter/specs/stabilize-and-juice-2.md` (DRAFT — awaiting approval) · Slug: `stabilize-and-juice-2`
> Branch: `sprint/stabilize-and-juice-2` · Drafted 2026-06-20
> Execution: `/ca:sprint` autonomous (premium subagent path). Verification: `npm run check`, `npm run typecheck`.

## Acceptance-criterion ledger (from the spec, verbatim intent)

| AC | Criterion |
|----|-----------|
| AC-01 | Pure exported `settleStep(bitmap, xStart, xEnd, pxPerTick) → boolean`; `applyGravity` re-expressed as loop-to-convergence; named exported `COLLAPSE_PX_PER_TICK` (default 4); a harness proves **convergence parity** (stepped settle == single `applyGravity` snap, byte-identical) over a deform grid; deterministic; `npm run check` green. |
| AC-02 | During FIRING, `detonate()` settles to convergence within the tick (parity). At end-of-turn `RESOLVING` (no projectiles, no fire) the engine advances **one `settleStep` per tick** until converged, re-running post-terrain tank resolution each step so tanks lower progressively; tank `y` monotonically non-decreasing, final `(y, buried)` == today's instant result; stays in `RESOLVING` until converged then transitions exactly as before; settle bounded by `ceil(H / COLLAPSE_PX_PER_TICK)` ticks, flight-tick budget re-pinned and well under 10k; two-engine per-tick determinism; manual-visual note. |
| AC-03 | Best-effort `finish_game` POST retries **once** on transient failure (idempotent via `UNIQUE(room_id)`); extracted `postOnceWithRetry(fn, attempts=2)`; harness: fail-then-succeed → 2 calls + ok, succeed-first → 1 call, both-fail → handled non-throwing failure; happy path unchanged. |
| AC-04 | `initialize()` replays the log in **bounded chunks that yield to the event loop** between batches; extracted pure `replayInChunks(actions, applyOne, chunkSize, yield)`; harness: chunked final state == one-shot synchronous replay, strict `seq` order, no batch exceeds `chunkSize`, empty log is a no-op. |

## Task table

Status legend: `PENDING` → `ACCEPTED` (flipped by `subagent-driven-development` on acceptance). Each
verification **maps to** a `tdd` obligation — it does not replace tdd's own red→green gates.

| id | path(s) | verification | maps-to | covers | depends-on | status |
|----|---------|--------------|---------|--------|------------|--------|
| T-01 | `shared/src/engine/Terrain.ts` | Add exported `COLLAPSE_PX_PER_TICK = 4` and pure `settleStep(bitmap, xStart, xEnd, pxPerTick): boolean`; re-express `applyGravity` to loop `settleStep` to convergence (no signature change). `npm run typecheck` exit 0; existing `burial.mjs` + `collision.mjs` stay green via `npm run check`. | AC-01 obligation (settleStep parity) | AC-01 | — | ACCEPTED |
| T-02 | `scripts/checks/collapse.mjs`, `package.json` | New harness: over a grid of deforms (seeds × crater x/radius incl. overlapping discs), assert repeated `settleStep` converges to a bitmap **byte-identical** to one `applyGravity` snap, and that `settleStep` moves ≤ `COLLAPSE_PX_PER_TICK` px/column/call. Wire `collapse.mjs` into the `check` script. `npx tsx scripts/checks/collapse.mjs` exits 0; `npm run check` runs it. | AC-01 obligation | AC-01 | T-01 | ACCEPTED |
| T-03 | `shared/src/engine/GameEngine.ts` | Restructure RESOLVING: add a settle-in-progress field; on entering RESOLVING with no projectiles/fire, advance **one `settleStep` per `tick()`** until converged, THEN call existing `resolve()`. `detonate()` settles to convergence within the tick while projectiles remain (mid-flight parity). Verify via collapse.mjs (T-05) that engine stays `RESOLVING` until converged then transitions exactly as before; `npm run check` green. | AC-02 obligation (RESOLVING settle loop) | AC-02 | T-01 | ACCEPTED |
| T-04 | `shared/src/engine/GameEngine.ts` | Re-run the existing post-terrain tank resolution each settle step so a tank over a settling column lowers progressively and `buried` is re-derived per step. Verify (collapse.mjs T-05): tank `y` monotonically non-decreasing across settle ticks; final `(y, buried)` == today's instant-resolution result. | AC-02 obligation (progressive burial) | AC-02 | T-03 | ACCEPTED |
| T-05 | `scripts/checks/collapse.mjs`, `scripts/checks/flightticks.mjs`, `scripts/checks/burial.mjs`, `scripts/checks/motion.mjs` | Extend `collapse.mjs` with AC-02 cases: monotonic tank-y, bounded settle ≤ `ceil(H/COLLAPSE_PX_PER_TICK)` ticks (report worst observed), two identically-seeded engines byte-identical per-tick through the settle. **Re-pin** any timing/tick-count assertions disturbed by the multi-tick RESOLVING in `flightticks.mjs`/`burial.mjs`/`motion.mjs` (terrain-shape assertions must NOT change). `npm run check` exit 0. | AC-02 obligation (bound + determinism + re-pin) | AC-02 | T-03, T-04 | ACCEPTED |
| T-06 | `client/src/client/retry.ts`, `client/src/client/NetworkClient.ts` | Extract pure `postOnceWithRetry(fn, attempts = 2)` into a dependency-free `retry.ts`; call it from the best-effort `finish_game` POST (~`NetworkClient.ts:918-948`). `npm run typecheck` exit 0. | AC-03 obligation | AC-03 | — | ACCEPTED |
| T-07 | `scripts/checks/netretry.mjs`, `package.json` | New harness importing only `retry.ts`: fail-then-succeed → fn called twice and resolves ok; succeed-first → called once; both-fail → resolves to a handled non-throwing failure (never rejects). Wire into `check`. `npx tsx scripts/checks/netretry.mjs` exit 0. | AC-03 obligation | AC-03 | T-06 | ACCEPTED |
| T-08 | `shared/src/net/replay.ts`, `client/src/client/NetworkClient.ts` | Add pure `replayInChunks(actions, applyOne, chunkSize, yield)` to `replay.ts` (depends on nothing); use it in `initialize()` (~`NetworkClient.ts:200-218`) to replay the log in event-loop-yielding chunks. `npm run typecheck` exit 0. | AC-04 obligation | AC-04 | — | ACCEPTED |
| T-09 | `scripts/checks/chunkreplay.mjs`, `package.json` | New harness: chunked replay final state == one-shot synchronous replay; actions applied in strict `seq` order; no batch exceeds `chunkSize`; empty log is a no-op. Wire into `check`. `npx tsx scripts/checks/chunkreplay.mjs` exit 0. | AC-04 obligation | AC-04 | T-08 | ACCEPTED |

## Order & MVP slice

Dependency order: **T-01 → T-02**, **T-01 → T-03 → T-04 → T-05** (Track A); **T-06 → T-07**, **T-08 → T-09**
(Track B, independent of Track A — different files, no cross-dependency). No cycles.

- **MVP slice (shippable on its own): T-01 → T-05** — the animated terrain collapse, the headline feature.
  Coherent and shippable alone: deterministic stepped settle + progressive burial, fully harness-guarded.
- **Incremental remainder: T-06 → T-09** — the two netcode-correctness companions (Track B). Independent;
  each shippable on its own once its harness is green.

## Coverage proof

- AC-01 ← T-01, T-02 · AC-02 ← T-03, T-04, T-05 · AC-03 ← T-06, T-07 · AC-04 ← T-08, T-09.
- Every AC covered by ≥1 task; every task covers ≥1 AC. Bijective. ✔

## Out of scope (tagged)

- `[NEEDS-TRIAGE]` Falling settling debris, anti-aliased destruction edges, terrain-thud vs tank-clang
  audio — deferred juice that pairs with collapse; next-sprint follow-ups, not this plan.
- `[NEEDS-TRIAGE]` Referee seat re-derivation — held out (trust-boundary; would hard-gate).
