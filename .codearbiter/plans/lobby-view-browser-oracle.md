# Lobby View Browser Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement this plan task-by-task, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates.

**Goal:** Add real-browser geometry and reachability guardrails for the three offline-reachable Lobby views before decomposing Lobby rendering.

**Architecture:** Extend the existing Playwright support seam with Lobby navigation and broad layout assertions, then add one focused spec that reaches each view through public buttons. The production app, Lobby implementation, CSS, and network paths remain unchanged.

**Tech Stack:** TypeScript, Playwright, Vite production preview; no dependency.

## Global Constraints

- Run through the existing desktop-fine, pixel-touch, and small-window Playwright projects.
- Use the ordinary Lobby entry path; do not add runtime E2E hooks.
- Assert broad geometry and player-visible semantics, not exact pixels or screenshots.
- Do not touch production, dependency, backend, auth, crypto, migration, or workflow files.
- Keep Browse and Waiting Room outside this phase.

---

### Task 1: Add reusable Lobby browser invariants

**Files:**

- Modify: `e2e/support.ts`

**Interfaces:**

- Produces: `gotoLobby(page: Page): Promise<void>`
- Produces: `assertLobbyFrame(page: Page): Promise<void>`
- Produces: `assertLobbyControlReachable(page: Page, selector: string): Promise<void>`

- [x] Add `gotoLobby` that calls `page.goto('./')`, removes `#st-splash`, and waits for visible `#lobby` plus `.lobby-card`.
- [x] Add `assertLobbyFrame` that compares full-app Lobby overlay/card bounding boxes, asserts document scroll dimensions do not exceed the viewport by more than one pixel, and asserts `card.scrollWidth <= card.clientWidth + 1`.
- [x] Add `assertLobbyControlReachable` that scrolls one selector into view, then proves its box has positive width/height and lies inside the card bounds with a one-pixel tolerance.

### Task 2: Characterize the offline Lobby views

**Files:**

- Create: `e2e/lobby-layout.spec.ts`

**Interfaces:**

- Consumes: the three helpers from Task 1.

- [x] Add a `beforeEach` that opens the ordinary Lobby with `gotoLobby`.
- [x] Add a Hot Seat test that checks the setup copy, two roster rows, controls legend, frame invariants, and reachable Start Game action.
- [x] Add an Online Create test that clicks Play Online, checks create-room copy and actions, then applies frame/reachability invariants.
- [x] Add a Join by Code test that navigates Play Online -> Join Room instead, checks the four-character code input and actions, then applies frame/reachability invariants.
- [x] Run `npx playwright test e2e/lobby-layout.spec.ts`; expect 9 passing cases (3 tests x 3 projects).

### Task 3: Verify, review, and deliver

**Files:**

- Append only: `.codearbiter/sprint-log.md`
- Append only when authorized gates are bypassed: `.codearbiter/overrides.log`

- [x] Run the full Playwright rendering suite, `npm run check`, client and Edge tests, client coverage, `npm run build`, dependency audit, secret scan, and diff hygiene.
- [x] Give one adversarial reviewer the exact spec, plan, diff, and evidence; correct every Critical, High, Medium, and merge blocker.
- [x] Commit through `$ca-commit`, push, and open a ready PR through `$ca-pr` referencing issue #129 without closing it.
- [ ] Require every hosted check green on the exact reviewed head, then use the standing PR-only merge authority.
- [ ] Verify Pages exact-main provenance and live smoke, then select the next bounded sprint cell.
