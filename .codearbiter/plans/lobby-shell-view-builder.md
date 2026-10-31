# Lobby Shell View Builder Implementation Plan

**Goal:** Extract the remaining top-level lobby composition into a directly tested stateless builder with zero observable behavior change.

**Architecture:** Lobby selects the active per-view node and owns all effects. The builder creates the card shell, optional rejoin banner, tabs, and exact online wrapper.

## Constraints

- Approved seven-file surface only; no pre-existing test changes.
- Preserve text, attributes, classes, node identity/order, conditional presence, wrapper depth, callback timing, and garage inert/focus behavior.
- No CSS, dependency, backend, auth, crypto, migration, workflow, shared-engine, issue, or task-tracker change.

### Task 1: Baseline

- [x] Install dependencies; run focused pre-existing tab/rejoin/network tests, the 15-case browser matrix, and coverage.
- [x] Record `Lobby.ts` baseline above the stage-1 60% line/branch floor and prove clean scope.

### Task 2: TDD extraction

- [x] Add direct tests for exact shell order, conditional rejoin, active-tab routes, detached-node identity, and online wrapper.
- [x] Observe behavioral RED against a compile-only builder shell while focused pre-existing tests stay green.
- [x] Move shell/tab/rejoin/wrapper DOM mechanically into `buildLobbyShellView()` and `buildLobbyOnlineView()`; keep `render()` as the state/effect adapter.
- [x] Pass direct/focused/browser/typecheck gates without modifying pre-existing tests.

### Task 3: Verify and deliver

- [x] Pass full deterministic, client, Edge, Playwright, coverage, build, audit, secret, Pages-base, and diff gates.
- [x] Clear one adversarial review with every Critical/High/Medium/merge blocker corrected.
- [ ] Commit, PR, exact-head CI, logged merge authority, fresh final-head CI, squash merge, Pages provenance, and live smoke.
- [ ] Audit issue #129 acceptance and either close it with evidence or select the next bounded helper extraction.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Later Command Center shell. Current source/oracles: `client/src/ui/LobbyShellView.ts`, `client/src/ui/commandCenter/CommandCenterShell.ts`.

The latest change to this historical plan reachable from `origin/main` is `7d6fef2a94ab` (refactor(lobby): extract shell view builder (#252)). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
