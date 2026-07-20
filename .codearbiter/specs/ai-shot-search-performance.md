# Sprint spec — Deterministic AI shot-search performance

> Status: **IMPLEMENTED — awaiting commit gate**
> Slug: `ai-shot-search-performance` · Drafted 2026-07-20
> Branch: `codex/ai-shot-search-performance` from `origin/main` at `0079efb`
> Tracks: `.codearbiter/open-tasks.md` AI coarse-to-refine item and GitHub issue #63

## Goal

Remove the player-visible main-thread stall caused by the exhaustive computer-opponent
shot search. A hard bot currently evaluates 86 angles × 81 powers = **6,966 ballistic
trajectories** synchronously on every client. The replacement must retain deterministic
lockstep, bot difficulty ordering, and equivalent aim quality while evaluating far fewer
trajectories.

The user approved **quality parity rather than exact historical shot parity**: an optimized
bot may select a different shot when the new result is deterministic and meets the quality
limits below.

## Selected approach

Use a deterministic **coarse-to-fine, multi-basin search**:

1. Evaluate a coarse lattice across the complete legal angle/power domain.
2. Retain a small, fixed number of distinct best basins using stable score, angle, then
   power ordering.
3. Re-evaluate each basin's neighborhood at the existing difficulty resolution.
4. Deduplicate overlapping fine candidates by integer angle/power identity.
5. Permit an early exit only after a candidate crosses a named, geometry-derived
   direct-hit-quality threshold.

Weapon selection, targeting, seeded aim error, fallback behavior, and the public
`computeAiPlan()` contract remain in `AI.ts`. Ballistic probing and search mechanics move
to a focused `AiShotSearch.ts` module. No dependency is added.

## SMARTS decision

| Lens | Coarse-to-fine | Fixed probe budget | Web Worker exhaustive search |
|---|---|---|---|
| Scalable | Strong. Cuts repeated trajectory work on every bot client. | Adequate. Caps work but wastes probes on weak candidates. | Weak. Every client still performs the exhaustive search. |
| Maintainable | Strong. A pure search seam isolates policy from AI strategy. | Adequate. Simple loop limit couples quality to enumeration order. | Weak. Worker messaging and lifecycle duplicate engine integration concerns. |
| Available | Strong. Remains synchronous, local, and dependency-free. | Strong. Remains synchronous, local, and dependency-free. | Weak. Worker startup or messaging failure needs recovery behavior. |
| Reliable | Strong. Full-domain coarse coverage precedes bounded refinement. | Weak. Truncation can systematically miss later candidate regions. | Adequate. Exact search survives, but lifecycle adds failure modes. |
| Testable | Strong. Probe counts, regret, ordering, and determinism are directly assertable. | Adequate. Probe count is easy; representative quality is weaker. | Weak. Browser-worker integration expands the required test surface. |
| Securable | Indifferent. No option changes trust boundaries or secrets. | Indifferent. No option changes trust boundaries or secrets. | Indifferent. No option changes trust boundaries or secrets. |

**Recommendation: coarse-to-fine. Strength: strong.** Maintainability, reliability, and
testability align; no SMARTS lens favors retaining exhaustive work.

**Non-SMARTS considerations:** coarse-to-fine changes some shot coordinates by design.
The Web Worker preserves exact output but spends more implementation and maintenance time.
All three options have zero monetary cost; the selected option adds no package.

## Architecture and data flow

### `shared/src/engine/AI.ts`

- Continues to own target selection, weapon selection, seeded aim error, and `AiPlan`.
- Calls the new search seam with immutable state, shooter, target, gravity, and the
  difficulty's base angle/power resolution.
- Preserves the existing shield branch and sensible-lob fallback unchanged.

### `shared/src/engine/AiShotSearch.ts`

- Owns the plain-ballistic `simulateImpact()` probe currently nested in `AI.ts`.
- Owns exhaustive reference search only as harness-side code; production ships only the
  optimized search.
- Returns the chosen pre-jitter angle/power plus deterministic search statistics needed
  to prove the probe budget.
- Uses the real `launchVelocity`, `stepProjectile`, `sweepCollide`, `barrelTip`, terrain,
  tanks, wind, and gravity. It never mutates engine state.
- Keeps all ordering explicit; it does not depend on `Set` iteration as a tie-break.

### Candidate rules

- Legal domain remains 5–90° rightward or 90–175° leftward, power 20–100.
- Domain endpoints are always included even when a coarse step does not divide the span.
- Fine neighborhoods clamp to the legal domain and align to the difficulty's existing
  base resolution.
- Candidate identity is the integer `angle:power` pair; each pair is simulated at most
  once per plan.
- Ranking is ascending impact distance, then angle, then power.
- `null` impacts remain unranked. If every candidate is `null`, `AI.ts` uses the existing
  fallback shot.

## Acceptance criteria

### AC-1 — Determinism remains a hard invariant

- Repeated calls on identical state return byte-identical plans.
- Independently constructed engines at identical state return byte-identical plans.
- No `Math.random()`, wall clock, worker, mutable cross-turn cache, or concurrency enters
  `shared/src/engine/`.
- Existing `ai_determinism.mjs`, replay, engine-purity, and full `npm run check` harnesses
  remain green.

### AC-2 — Search work is deterministically bounded

A new `ai_search.mjs` harness asserts per-plan unique probe counts no greater than:

- **Hard:** 500 probes, down at least 92% from 6,966.
- **Medium:** 400 probes, down at least 77% from 1,763.
- **Easy:** 300 probes, down at least 50% from 609.

The harness prints exhaustive and optimized probe counts by difficulty. Probe count is the
hard CI oracle. A separate fresh local benchmark must also show a warmed 20-run hard-plan
median no greater than **8 ms** and at least **7× faster** than the same-state exhaustive
reference; elapsed time is recorded in the sprint receipt rather than asserted in CI because
shared-runner timing is noisy.

### AC-3 — Aim quality matches the exhaustive reference

The harness compares optimized pre-jitter impact distance against an independent exhaustive
reference over a fixed corpus covering both firing directions, near/far targets, strong
positive/negative wind, varied seeds, and obstructing terrain.

For every resolving scenario, optimized-search regret must stay within:

- **Hard:** `max(4 px, exhaustive score × 10%)`.
- **Medium:** `max(6 px, exhaustive score × 15%)`.
- **Easy:** `max(10 px, exhaustive score × 25%)`.

The optimized search must resolve every scenario the exhaustive reference resolves. A
scenario where both searches return `null` is valid and must preserve the existing fallback.

### AC-4 — Difficulty and gameplay behavior remain intact

- Existing AI harnesses continue to prove hard bots outperform easy bots over their fixed
  seed corpus.
- Shield, weapon selection, restocking, and seeded aim-error behavior remain unchanged.
- No action-log shape, physics constant, terrain representation, renderer, client driver,
  Edge Function, or database behavior changes.

### AC-5 — The seam is focused and reusable

- `AI.ts` delegates ballistic probing/search without duplicating physics.
- `simulateImpact()` is reusable by a future tracer/ranging-shot feature without exposing
  mutable state or importing client code into `shared/`.
- Named search constants explain coarse spacing, retained basin count, refinement radius,
  and the direct-hit threshold; no scattered magic numbers.

### AC-6 — Tracking and verification close cleanly

- `scripts/checks/ai_search.mjs` is wired into `npm run check`.
- The legacy prose entry in `.codearbiter/open-tasks.md` remains unchanged because the commit
  gate accepts only structured task transitions; the sprint receipt carries verification evidence.
- The PR closes GitHub issue #63.
- Fresh `npm run check`, `npm run test:client`, and `npm run build` pass before commit/PR.

## Error handling and fallbacks

- Search remains a pure total function over valid engine state; it throws no recoverable
  runtime errors and performs no I/O.
- A non-resolving candidate is ignored exactly as today.
- All-null search results return `null` to `AI.ts`, which preserves the existing lob fallback.
- Invalid or non-finite engine state is outside this sprint; existing clamps and engine
  invariants remain authoritative.

## Out of scope / anti-goals

- No Web Worker, asynchronous planner, memoization across turns, or server-side AI.
- No bot personality, targeting, loadout, difficulty, weapon-balance, or physics changes.
- No new package, package upgrade, audit fix, backend deploy, migration, or trust-boundary
  change.
- No exact historical shot-coordinate guarantee.
- No broad `AI.ts` refactor beyond the search seam required by this sprint.

## Verification and landing

Baseline from the isolated worktree: `npm run check` passed in **50.3 seconds** on
2026-07-20. Ten same-state hard plans averaged **62.0 ms**; the nine warmed samples ranged
from **60.0–64.1 ms**. `npm ci` reported six pre-existing audit findings; dependency state
was not changed.

Landing follows `$ca-sprint`: two-pass review, fresh verification, `commit-gate`, then
`finishing-a-development-branch` auto-selects **open PR**. The sprint never merges or
deploys autonomously.
