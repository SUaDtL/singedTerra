# Pre-game Online Operations Board Implementation Plan

**Goal:** Make Browse Rooms and the Waiting Room feel like tactical stages of
the same online operation while preserving their current network behavior.

**Architecture:** `LobbyBrowseView` and `LobbyWaitingView` keep their current
option contracts and callbacks. They gain semantic route, section, and state
seams. `Lobby.ts` supplies one shared squared operations-board style layer, and
existing browser fixtures prove the live request and readiness paths still fit.

**Tech stack:** TypeScript DOM builders, existing Lobby CSS injection, Vitest,
and Playwright.

## Constraints

- Client UI only. Preserve all transport callbacks, busy gates, and room data.
- Keep each available Join or Ready Up action primary. Keep copying, leaving,
  and online-route alternatives secondary.
- No dependencies, Auth, Supabase, migrations, assets, or gameplay changes.
- H-05 forbids accessing or modifying the sprint log.

### Task 1: Establish failing operations-board contracts

**Files:**
- Modify: `client/src/ui/LobbyBrowseView.test.ts`
- Modify: `client/src/ui/LobbyWaitingView.test.ts`
- Modify: `e2e/lobby-layout.spec.ts`

- [ ] Add failing unit assertions for Browse and Waiting route identity, named
  sections, row/roster semantics, exact primary actions, and retained callback
  and disabled behavior.
- [ ] Add a failing production-bundle geometry assertion that measures each
  board heading, first operational section, and actionable control on compact
  fixtures.
- [ ] Run the focused tests and confirm they fail because the semantic board
  seams and containment relationship do not yet exist.

### Task 2: Build semantic Browse and Waiting boards

**Files:**
- Modify: `client/src/ui/LobbyBrowseView.ts`
- Modify: `client/src/ui/LobbyWaitingView.ts`

- [ ] Add route headers and named sections around the existing Browse list and
  Waiting mission, roster, and action content.
- [ ] Replace only affected inline visual declarations with stable classes.
- [ ] Keep existing option values, room metadata, callbacks, direct text, and
  disabled decisions intact.
- [ ] Run focused Vitest coverage to prove the new semantic contract passes.

### Task 3: Apply a contained shared operations-board language

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Modify: `e2e/lobby-layout.spec.ts`

- [ ] Add shared dark, squared board styles for headers, sections, room rows,
  roster state, and compact spacing without altering the deployment shell.
- [ ] Keep visible headings in normal layout flow so first controls cannot be
  painted underneath them.
- [ ] Run focused Browse and Waiting browser fixtures on desktop and compact
  projects, then inspect any measured geometry failure before changing CSS.

### Task 4: Verify, review, and deliver

**Files:**
- No additional application file is planned.

- [ ] Run `npm run test:client`, `npm run check`, `npm run check:edge`,
  `npm run audit:deps`, `npm run build`, the full production-bundle Playwright
  suite, the state-free secret scan, and `git diff --check`.
- [ ] Send the final spec, plan, tests, staged diff, and H-05 sprint-log
  exception to one adversarial reviewer.
- [ ] Resolve every Critical, High, and merge-blocking finding, repeat the
  exact-diff review after corrections, then use the commit and PR gates.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current extracted view and frame owners. Current source/oracles: `client/src/ui/LobbyBrowseView.ts`, `client/src/ui/LobbyWaitingView.ts`.

The latest change to this historical plan reachable from `origin/main` is `ad9f643b7ebc` (feat(pregame): stage online operations). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
