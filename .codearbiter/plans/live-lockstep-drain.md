# Live lockstep buffered-action drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that live NetworkClient replay drains a buffered next action only after the preceding projectile finishes.

**Architecture:** Reuse the existing `NetworkClient.lockstep.test.ts` fake Supabase channel and add a controlled RAF queue. The test drives the same public Realtime callback and animation loop used in live play, so it verifies the ordering contract without changing production code unless RED exposes a real defect.

**Tech Stack:** TypeScript, Vitest, SupabaseClient test seam, deterministic shared GameEngine.

## Global Constraints

- Test first: observe the new regression fail for the missing live handoff before any production edit.
- Preserve deterministic lockstep: sequence rows remain ordered by `seq` and are applied once.
- No auth, persistence schema, migration, secret, dependency, or new action-kind changes.
- Keep `.codearbiter/sprint-log.md` append-only and leave `.codearbiter/open-tasks.md.lock` untouched.

---

### Task 1: Causal live buffered-action regression

**Files:**
- Modify: `client/src/client/NetworkClient.lockstep.test.ts`
- Verify: `client/src/client/NetworkClient.ts` only if the RED test exposes a current defect

**Interfaces:**
- Consumes: `NetworkClient.initialize()`, `NetworkClient.start()`, `NetworkClient.stop()`, the captured Realtime insert callback, and the captured RAF callback.
- Produces: a regression that proves sequence 0 resolves before sequence 1 is applied, with no duplicate action application.

- [x] **Step 1: Write the failing test**

  Add a test with a queued `requestAnimationFrame` driver. Initialize with an empty log, subscribe, deliver `row(1, fire())`, then `row(0, fire())`; assert the client is in `FIRING`. Start the client, repeatedly invoke the queued RAF callback while it schedules another frame, and assert that the first action reaches a new player turn before the second action is applied. Assert the final turn/phase reflects exactly two ordered fires and the frame driver is stopped.

- [x] **Step 2: Run the focused test to verify RED**

  Run: `npm run test:client -- client/src/client/NetworkClient.lockstep.test.ts`

  Expected: the new test fails if the implementation does not perform the live RAF handoff; existing lockstep tests remain green.

- [x] **Step 3: Implement only the minimal fix if RED identifies a real defect**

  Preserve the current `wasBusy && !nowBusy` boundary and one-drain-per-frame behavior. Change only the smallest production path necessary to make the causal test pass; otherwise keep the change test-only.

- [x] **Step 4: Run focused GREEN verification**

  Run: `npm run test:client -- client/src/client/NetworkClient.lockstep.test.ts`

  Expected: the new regression and all existing lockstep tests pass with no warnings or unhandled timers.

- [x] **Step 5: Run the repository verification matrix**

  Run: `npm run check`; `npm run check:edge`; `npm run test:client`; `npm run typecheck`; `npm run build`; `npm run test:e2e`; `git diff --check`; state-free secrets scan.

- [x] **Step 6: Commit**

  Commit through the codeArbiter commit gate with a focused message: `test(network): cover live buffered action handoff`.

### Task 2: Review and landing obligations

**Files:**
- Modify: `.codearbiter/sprint-log.md` (append only)
- Modify: `.codearbiter/plans/live-lockstep-drain.md` (check completed items)

- [x] **Step 1:** Give one adversarial reviewer the complete package: spec, plan, sprint log, tests, and final diff.
- [x] **Step 2:** Resolve every Critical, High, Medium, Low, and merge-blocking finding, rerunning the affected RED/GREEN and full matrix checks.
- [ ] **Step 3:** Open the PR, require all hosted checks green on the exact reviewed head, then merge under standing authority.
- [ ] **Step 4:** Verify the production branch health; no client or Supabase deployment is needed for a test-only change unless the final diff gains production code.
