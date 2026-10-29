# Pre-game Deployment Briefs Implementation Plan

**Goal:** Make the three pre-game commitment routes read as tactical deployment briefs while preserving their existing setup behavior.

**Architecture:** The route builders keep their present callbacks and form controls. Small semantic wrappers and route-specific headings provide stable DOM seams, while `Lobby.ts` owns shared brief styling and responsive placement inside the existing deployment shell.

**Tech stack:** TypeScript DOM builders, existing Lobby CSS injection, Vitest, Playwright.

## Constraints

- No gameplay, protocol, backend, auth, persistence, migration, asset, or dependency change.
- Preserve native labels, control values, callbacks, status, disabled behavior, and keyboard access.
- Keep one visually primary commitment per route and Online alternatives secondary.
- H-05: do not access the sprint log.

### Task 1: Pin the route-brief contract with failing tests

**Files:**
- Modify: `client/src/ui/LobbyHotSeatView.test.ts`
- Modify: `client/src/ui/LobbyCreateView.test.ts`
- Modify: `client/src/ui/LobbyJoinView.test.ts`
- Modify: `e2e/pregame-command-shell.spec.ts`

- [ ] Add unit assertions for route-specific brief title, operational copy, preserved field/control ownership, and the exact primary action.
- [ ] Run the focused tests and confirm they fail before the new briefing structure exists.
- [ ] Add browser assertions at desktop and compact sizes that the route heading, field group, and commitment control fit in the active setup panel without overlap.

### Task 2: Add semantic deployment-brief wrappers

**Files:**
- Modify: `client/src/ui/LobbyHotSeatView.ts`
- Modify: `client/src/ui/LobbyCreateView.ts`
- Modify: `client/src/ui/LobbyJoinView.ts`

- [ ] Introduce a route-local briefing header and a named setup group for each builder.
- [ ] Preserve every current element, callback, `disabled` state, and alternative-route control in its existing route.
- [ ] Assign the existing Start Game, Create Room, and Join Room controls the explicit shared primary class without changing their event bindings.
- [ ] Run focused unit tests to prove the contract passes.

### Task 3: Style one compact tactical form language

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Modify: `e2e/lobby-layout.spec.ts`

- [ ] Add deployment-brief CSS for hierarchy, grouped fields, and clear commitment boundary using the established dark squared palette.
- [ ] Add desktop and compact containment assertions for all three routes.
- [ ] Run focused Playwright coverage and inspect any geometry failure before changing CSS.

### Task 4: Full verification and adversarial review

**Files:**
- Modify: `.codearbiter/open-tasks.md` only through `taskwrite.py` if the parent program status legitimately changes.

- [ ] Run `npm run test:client`, `npm run check`, `npm run check:edge`, `npm run audit:deps`, `npm run build`, the isolated full Playwright suite, secret scan, and `git diff --check`.
- [ ] Send the spec, plan, available test evidence, and final diff to an adversarial reviewer. Do not provide the H-05 sprint log.
- [ ] Resolve all Critical, High, and merge-blocking findings, repeat exact-diff review after corrections, then use the commit and PR gates.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Later shared preparation frame. Current source/oracles: `client/src/ui/PreparationFrame.ts`, `client/src/ui/LobbyCreateView.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `cfa5fdf13c9d` (feat(pregame): add tactical deployment briefs). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
