# Hot-Seat Client Lifecycle Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** APPROVED — user approved 2026-07-22.

**Goal:** Cover `HotSeatClient` lifecycle, fixed-step scheduling, and public bridge behavior with a
deterministic focused Vitest suite.

**Architecture:** Inject a minimal `GameEngine` stand-in through the existing constructor and stub
the browser animation-frame functions with a deterministic callback queue. Exercise only public
`HotSeatClient` methods and observable engine/listener calls.

**Tech Stack:** TypeScript, Vitest, jsdom, existing `HotSeatClient`; no new dependency.

## Global constraints

- Test the real `HotSeatClient`; do not reimplement its scheduling loop in a helper.
- Do not inspect or cast into `HotSeatClient` private fields.
- Keep engine state minimal and deterministic; do not simulate physics.
- Preserve fixed-step tick counts and all production behavior.
- Production edits are temporary mutation checks only and must finish byte-identical to `HEAD`.
- No dependency, lockfile, workflow, Supabase, Edge Function, or deployment change.
- Task workers leave all changes uncommitted; codeArbiter owns one landing commit.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | HotSeatClient lifecycle coverage | — | focused GREEN plus four temporary RED mutations | ACCEPTED |
| T2 | Review closure, full matrix, commit, PR, and green CI | T1 | reviews, commit gate, hosted checks | IN PROGRESS |

---

### Task 1: Cover HotSeatClient orchestration

**Files:**

- Create: `client/src/client/HotSeatClient.test.ts`
- Temporarily mutate and restore: `client/src/client/HotSeatClient.ts`

**Required test harness:**

- A minimal engine stand-in with mocked `tick`, `applyAction`, `getState`, and
  `getEffectiveGravity`, cast through `unknown` to `GameEngine`.
- `requestAnimationFrame` returns increasing ids and records each callback.
- `cancelAnimationFrame` records and removes its target id.
- Each test stops the client and restores all globals/mocks.

- [x] **Step 1: Add lifecycle and listener coverage**

Prove through public methods that:

- `stop()` before `start()` is a no-op;
- the first `start()` emits the current state synchronously and schedules one callback;
- a second `start()` emits and schedules nothing;
- running the queued callback ticks once, emits the post-tick state, and schedules the next callback;
- `stop()` cancels the latest callback exactly once and a second stop is a no-op;
- starting after stop emits and schedules again;
- an unsubscribed listener receives no later frame emissions.

- [x] **Step 2: Add fixed-step budget coverage**

Drive queued callbacks explicitly and prove:

- with fast-forward off and phase `FIRING`, one frame calls `tick()` once;
- after `setFastForward(true)`, a frame that remains `FIRING` calls `tick()` eight times;
- a later frame whose third tick changes phase to `PLAYER_TURN` calls `tick()` exactly three times;
- each executed frame emits once and schedules exactly one successor.

- [x] **Step 3: Add public bridge coverage**

Prove:

- `sendAction(action)` passes the same object to `engine.applyAction()`;
- `getState()` returns the exact state supplied by the engine;
- `getEffectiveGravity()` returns the exact engine value.

- [x] **Step 4: Prove baseline GREEN**

```powershell
npm -w @singedterra/client exec vitest run src/client/HotSeatClient.test.ts
```

Expected: one focused file passes. Correct test-only typing or fixture defects without weakening the
observable assertions.

- [x] **Step 5: Prove four mutation REDs**

Use `apply_patch` for each temporary mutation, run the focused command, require the named case to
fail, restore the exact source line, and rerun GREEN before the next mutation:

1. Remove `if (this.rafId !== null) return` from `start()`.
2. Change `this.fastForward = on` to `this.fastForward = false`.
3. Remove the phase-based `break` from the tick loop.
4. Remove `cancelAnimationFrame(this.rafId)` from `stop()`.

Finish with `git diff --exit-code -- client/src/client/HotSeatClient.ts`.

- [x] **Step 6: Run task verification**

```powershell
npm run typecheck
npm run test:client
npm run coverage:client
git diff --check
git diff --quiet -- package-lock.json
```

Require `HotSeatClient.ts` coverage to be materially above 0% across statements, branches,
functions, and lines. Record exact counts rather than inventing a target before the suite exists.

- [x] **Step 7: Request independent task review**

The reviewer must confirm real wrapper use, public-only observations, correct queued-rAF lifecycle,
normal/eight/early-break tick budgets, listener cleanup, all four mutation kills, and no production
or dependency drift.

---

### Task 2: Close review and open a green pull request

- [x] **Step 1: Run whole-diff review and coverage audit**

Require zero Critical/Important or CRITICAL/HIGH findings. Coverage must explicitly evaluate missing
initial emission, duplicate loops, stale frame cancellation, fixed-step budget drift, failure to stop
on settlement, listener leaks, and action/accessor drift.

- [x] **Step 2: Run the complete final matrix**

```powershell
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

Every command must exit 0. Record exact unit, coverage, build, and E2E counts from the live run.

- [x] **Step 3: Append SMARTS and verification receipts**

Record issue #134 slice selection, baseline coverage, approved design, mutation RED/GREEN evidence,
review results, exact final counts, unchanged dependency state, and branch/base SHA in
`.codearbiter/sprint-log.md`.

- [ ] **Step 4: Run `$ca-commit`**

Stage exact intended paths only. Classification is `test(client)` unless a genuine production defect
requires a separately reviewed fix. Reference #134 without closing the issue.

- [ ] **Step 5: Run `$ca-pr` and `$ca-watch`**

Open a ready PR that references #134, never merge it, and watch every available check to green.
