# Pre-game Command Shell Implementation Plan

**Goal:** Make the entire pre-game lobby read as a cohesive tactical command-preparation experience while preserving every existing room, account, Garage, and match-start behavior.

**Architecture:** Keep `Lobby` as the composition owner and its extracted view builders as behavior owners. Add only semantic shell hooks and presentation classes where tests need a stable contract, then apply one shared command visual language through the existing lobby stylesheet. No client transport, account-session, shared-engine, or Supabase code changes.

## Global constraints

- Scope is client pre-game UI only; no Auth, room, gameplay, persistence, migration, dependency, or asset change.
- Preserve current accessible labels, callbacks, focus management, and network request behavior.
- Include all pre-game states: Hot Seat, Online create/join/browse/waiting, account/progression, Garage, advanced settings, rejoin, and controls.
- Test first. The H-05 sprint-log exception applies: do not read, append, or edit `.codearbiter/sprint-log.md`.

## File map

- `client/src/ui/LobbyShellView.ts`: semantic command-preparation shell and mode hierarchy hooks.
- `client/src/ui/LobbyShellView.test.ts`: shell accessibility and stable hierarchy contract.
- `client/src/ui/AccountPanelView.ts`: small semantic hooks only if the shared account treatment cannot be expressed from existing classes.
- `client/src/ui/AccountPanelView.test.ts`: account state and interaction parity.
- `client/src/ui/Lobby.ts`: shared tactical presentation rules for the complete pre-game surface.
- `client/src/ui/Lobby*.test.ts` and `Lobby.garage.test.ts`: existing behavior contracts kept intact.
- `e2e/lobby-layout.spec.ts`: all state/route reachability and geometry assertions.
- `e2e/online-garage-layout.spec.ts`: Online + Garage transition containment.

### Task 1: Pin the command-preparation structure in RED

- [ ] Add a `LobbyShellView` test requiring a labelled pre-game command header ahead of the mode controls, a stable mode-context relationship, and unchanged Hot Seat/Play Online tabs.
- [ ] Run the focused test and confirm it fails because the command-header hook does not exist.
- [ ] Add the smallest semantic shell element/class in `buildLobbyShellView`; do not change tab IDs, roles, labels, handlers, or ordering of interactive controls.
- [ ] Re-run the focused shell test and existing `LobbyShellView` tests to green.

### Task 2: Prove account and action hierarchy without behavior drift

- [ ] Add/extend focused account and action-view tests to require stable presentation hooks for commander status, primary command, and subordinate actions while retaining every button label/callback/busy state.
- [ ] Run those tests and confirm the new assertions fail for missing hooks or classes, not unrelated behavior.
- [ ] Add only the required semantic classes in the affected view builders; do not alter AccountSession, LobbySession, LobbyTransport, request shapes, or configuration state.
- [ ] Re-run account, Hot Seat, create/join/browse/waiting, Garage, and route-action tests to green.

### Task 3: Apply the complete shared visual system

- [ ] Add a production-browser assertion that checks the command shell’s clear primary/subordinate treatment and stage containment across Hot Seat and every Online subview in desktop-fine, pixel-touch, and small-window projects. Confirm RED before CSS work.
- [ ] Replace the current disconnected rounded/bright lobby treatment in `Lobby.ts` with one dark, technical command-preparation system covering the shell, panel boundaries, field controls, tabs, account, Garage, advanced details, room rows, status, controls, primary commands, secondary routes, and exit actions.
- [ ] Preserve current compact Garage editor behavior, touch target sizing, reduced-motion rule, vehicle preview/canvas stacking, and all focus-visible affordances.
- [ ] Re-run the focussed production-browser suite and confirm the new visual/geometry contract is green for every project.

### Task 4: Verify, review, and deliver

- [ ] Run full client tests, `npm run check`, `npm run build`, `npm run audit:deps`, secret scan, and `git diff --check`.
- [ ] Give one adversarial reviewer the spec, plan, H-05 exception, test evidence, and exact final diff; resolve every Critical, High, and merge-blocking finding, then re-review the final diff.
- [ ] Commit only the reviewed files and the task-board transition, push a PR, require green hosted CI on the exact final head, merge with an expected-head guard, and verify Pages deployment plus public deploy metadata.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Superseded shell composition. Current source/oracles: `client/src/ui/commandCenter/CommandCenterShell.ts`, `e2e/pregame-command-center.spec.ts`.

The latest change to this historical plan reachable from `origin/main` is `61428894b647` (feat(lobby): unify pre-game command experience). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
