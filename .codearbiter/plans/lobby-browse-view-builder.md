# Lobby Browse View Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` task-by-task, `superpowers:test-driven-development` for the new exported seam, and `superpowers:verification-before-completion` before delivery.

**Goal:** Extract `Lobby.renderBrowse()` into a directly tested stateless view builder with zero observable behavior change.

**Architecture:** Lobby remains the state/effect owner. It supplies three already-built shared DOM sections plus current room/busy data and callbacks. `LobbyBrowseView` composes the existing Browse DOM and owns no transport or lifecycle.

**Tech Stack:** TypeScript, DOM APIs, Vitest/jsdom, Playwright production preview; no dependency.

## Global constraints

- Stay inside the approved surface table in the spec.
- Preserve visible text, classes, styles, DOM order, callback timing, and current method ownership.
- Do not modify any pre-existing test file.
- No state, polling, transport, session, CSS, dependency, backend, auth, crypto, migration, or workflow change.

---

### Task 1: Prove the unmodified parity oracle

- [x] Install the lockfile-pinned workspace dependencies.
- [x] Run the pre-existing Lobby client tests and 15-case Lobby browser matrix before production edits.
- [x] Run client coverage and record the Windows `Lobby.ts` line/branch baseline; both must clear the stage-1 60% floor.
- [x] Confirm the named production surface is clean and no pre-existing test is modified.

### Task 2: Pin and implement the exported seam

**Files:**

- Create: `client/src/ui/LobbyBrowseView.test.ts`
- Create: `client/src/ui/LobbyBrowseView.ts`
- Modify: `client/src/ui/Lobby.ts`

- [x] Write direct tests for prebuilt-section placement, empty rooms, populated metadata, full/busy disabling, Join code routing, and both back-navigation callbacks.
- [x] Add only the compile shell needed for the exported builder and observe the direct tests fail on missing Browse behavior while all pre-existing tests stay green.
- [x] Move the existing Browse DOM construction mechanically into `buildLobbyBrowseView()`.
- [x] Reduce `Lobby.renderBrowse()` to state-to-options adaptation with the existing callback effects.
- [x] Run direct tests, pre-existing Lobby client tests, and the 15-case browser oracle green; confirm no pre-existing test diff.

### Task 3: Verify, review, and deliver

- [x] Run full Playwright, `npm run check`, client and Edge tests, client coverage, build, dependency audit, secret scan, and diff hygiene.
- [x] Confirm `Lobby.ts` line/branch coverage does not regress below the recorded baseline or stage-1 floor.
- [x] Give one adversarial reviewer the spec, plan, surface table, exact diff, and evidence; correct every Critical, High, Medium, and merge blocker.
- [ ] Commit through `$ca-commit`, open a ready PR referencing but not closing #129, obtain exact-head hosted CI, merge under standing PR-only authority, and verify Pages provenance plus live smoke.
- [ ] Select the next bounded #129 view extraction.
