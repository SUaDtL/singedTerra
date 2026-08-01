# Lobby Waiting View Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` task-by-task, `superpowers:test-driven-development` for the exported seam, and `superpowers:verification-before-completion` before delivery.

**Goal:** Extract `Lobby.renderWaitingRoom()` into a directly tested stateless view builder with zero observable behavior change.

**Architecture:** Lobby computes identity clashes and owns every effect/lifecycle. `LobbyWaitingView` receives current presentation inputs, prebuilt shared nodes, and callbacks, then composes the existing Waiting Room DOM without state or I/O.

**Tech Stack:** TypeScript, DOM APIs, Vitest/jsdom, Playwright production preview; no dependency.

## Global constraints

- Stay inside the approved surface table in the spec.
- Preserve visible text, classes, styles, DOM order, callback timing, and current method ownership.
- Do not modify any pre-existing test file.
- No state, clipboard implementation, Realtime, heartbeat, transport, session, CSS, dependency, backend, auth, crypto, migration, or workflow change.

---

### Task 1: Prove the unmodified parity oracle

- [x] Install lockfile-pinned workspace dependencies.
- [x] Run the pre-existing Waiting/Lobby client tests and 15-case Lobby browser matrix before production edits.
- [x] Run client coverage and record the Windows `Lobby.ts` line/branch baseline; both must clear the stage-1 60% floor.
- [x] Confirm the named production surface is clean and no pre-existing test is modified.

### Task 2: Pin and implement the exported seam

**Files:**

- Create: `client/src/ui/LobbyWaitingView.test.ts`
- Create: `client/src/ui/LobbyWaitingView.ts`
- Modify: `client/src/ui/Lobby.ts`

- [x] Write direct tests for readiness copy, room code/invite controls, roster/badges/clashes, shared-node order, warning composition, Ready states, and action callbacks.
- [x] Add only the compile shell needed for the exported builder and observe behavioral RED while all pre-existing focused tests stay green.
- [x] Move the existing Waiting Room DOM construction mechanically into `buildLobbyWaitingView()`.
- [x] Reduce `Lobby.renderWaitingRoom()` to state-to-options adaptation with all existing effects retained in Lobby.
- [x] Run direct tests, pre-existing focused tests, and the 15-case browser oracle green; confirm no pre-existing test diff.

### Task 3: Verify, review, and deliver

- [x] Run full Playwright, `npm run check`, client and Edge tests, client coverage, build, dependency audit, secret scan, and diff hygiene.
- [x] Confirm `Lobby.ts` line/branch coverage does not regress below the recorded baseline or stage-1 floor.
- [x] Give one adversarial reviewer the spec, plan, exact diff, and evidence; correct every Critical, High, Medium, and merge blocker.
- [ ] Commit through `$ca-commit`, open a ready PR referencing but not closing #129, obtain exact-head hosted CI, merge under standing PR-only authority, and verify Pages provenance plus live smoke.
- [ ] Select the next bounded #129 view extraction.
