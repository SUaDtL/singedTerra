# Hot-Seat Client Lifecycle Coverage Sprint Spec

> Status: **APPROVED — user approved 2026-07-22**
> Date: 2026-07-22
> Tracks: GitHub issue #134 (HotSeatClient slice only)

## Goal

Add deterministic Vitest coverage for `HotSeatClient`, the browser wrapper that runs the shared
engine directly for hot-seat play, without changing production behavior.

## Current state

Fresh `npm run coverage:client` on `origin/main` passes 21 files and 168 tests with 66.58% overall
statement coverage, but reports `client/src/client/HotSeatClient.ts` at 0% for statements, branches,
functions, and lines.

The wrapper owns behavior not covered by the existing pure `fastForward.ts` harness:

- synchronous initial-state emission before the first animation frame;
- idempotent start and restart-after-stop lifecycle;
- one fixed engine tick per normal frame;
- eight fixed ticks during fast-forward, with an early break when a shot settles;
- cancellation of the currently scheduled animation frame;
- action forwarding, state/gravity accessors, and listener unsubscribe behavior.

Its constructor-injected `GameEngine` and browser `requestAnimationFrame` globals provide complete
test seams. A lightweight engine stand-in can isolate wrapper orchestration without simulating
terrain or physics.

## Proposed design

Create `client/src/client/HotSeatClient.test.ts`. Use a typed minimal engine stand-in plus a fake rAF
queue that captures callbacks and deterministic numeric frame IDs.

Cover three public contracts:

1. **Lifecycle:** `start()` emits synchronously, schedules one frame, ignores a duplicate start,
   ticks/emits/reschedules when that frame runs, `stop()` cancels the latest frame idempotently, and
   a later `start()` resumes with a new initial emission.
2. **Fixed-step fast-forward:** a normal frame ticks once; an unsettled fast-forward frame ticks
   exactly eight times; a later fast-forward frame stops on the tick that changes phase out of
   `FIRING`/`RESOLVING` rather than spinning the remaining budget.
3. **Public bridge:** actions are passed unchanged to `engine.applyAction()`, state and effective
   gravity are returned unchanged, and unsubscribed listeners receive no later emissions.

The tests may cast the intentionally minimal stand-in through `unknown` to `GameEngine`; they must
not access `HotSeatClient` private fields or duplicate engine physics.

## Alternatives rejected

### Use a real GameEngine

That would mix wrapper lifecycle assertions with terrain generation and projectile simulation. The
engine already has deterministic harnesses; this slice should isolate rAF orchestration.

### Test InputHandler first

Input handling is valuable but spans 307 lines of keyboard, touch, and drag behavior. The 77-line
hot-seat wrapper is the smaller restart-safe cell and covers one of the architecture's two execution
contexts directly.

### Add Vitest coverage for retry.ts or audioEdges.ts first

Both already have deterministic root harnesses. HotSeatClient has no direct test at any layer, so it
adds more new behavioral confidence per unit of work.

## SMARTS decision

| Lens | HotSeatClient lifecycle | InputHandler first | Duplicate pure harnesses |
|---|---|---|---|
| Scalable | Strong: protects a stable client boundary. | Strong but broad. | Adequate. |
| Maintainable | Strong: one focused suite beside the wrapper. | Adequate: larger fixture surface. | Weak: duplicated intent. |
| Available | Strong: existing injection and browser globals suffice. | Strong. | Strong. |
| Reliable | Strong: covers the entire hot-seat scheduling lifecycle. | Strong for input only. | Adequate. |
| Testable | Strong: deterministic queued callbacks and fake engine. | Adequate: more DOM geometry. | Strong. |
| Securable | Neutral: no trust-boundary change. | Neutral. | Neutral. |

Recommendation: HotSeatClient lifecycle coverage. Strength: **strong**. Confidence: **high**.

## Acceptance criteria

### AC-1: start/stop lifecycle is pinned

The suite proves immediate initial emission, duplicate-start idempotence, frame tick/emission and
rescheduling, cancellation of the latest frame, idempotent stop, and restart after stop.

### AC-2: fixed-step budgets are pinned

Normal mode performs one tick. Fast-forward performs eight ticks while the phase stays live and
breaks on the exact tick that settles to a non-`FIRING`/`RESOLVING` phase.

### AC-3: the public bridge is pinned

`sendAction`, `getState`, `getEffectiveGravity`, and the unsubscribe function preserve their public
contracts without inspecting private fields.

### AC-4: coverage is mutation-sensitive

Temporary mutations must make the focused suite fail for:

- removing duplicate-start protection;
- disabling `setFastForward()`;
- removing the settle-early break;
- removing scheduled-frame cancellation from `stop()`.

Every production mutation is restored before final verification.

### AC-5: repository gates stay green

Fresh verification before commit and PR:

```powershell
npm -w @singedterra/client exec vitest run src/client/HotSeatClient.test.ts
npm run coverage:client
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

The PR references #134 without closing it because InputHandler, retry, and audioEdges coverage remain
separate slices. It stays unmerged and is watched until every available check is green.

## Non-goals

- Changing `HotSeatClient`, `GameEngine`, fast-forward constants, tick semantics, or rendering.
- Testing shared engine physics, terrain, weapon outcomes, or wall-clock timing.
- Covering InputHandler, retry.ts, audioEdges.ts, or the remaining issue #134 backlog.
- Adding a dependency or changing the lockfile, workflow, Supabase, or deployment behavior.
