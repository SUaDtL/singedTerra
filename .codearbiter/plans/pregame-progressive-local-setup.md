# Progressive Local Preparation Plan

Task: `ux.pregame.0003`
Standing approval applies.

## Constraints

- Presentation hierarchy only; preserve all Hot Seat defaults and callbacks.
- Use a native `details`/`summary` disclosure with accessible text and keyboard
  behavior rather than a custom hidden-state controller.
- Invalid state must force the disclosure open.
- Keep the launch action outside the disclosure and physically reachable.
- No backend, engine, Auth, persistence, dependency, or migration changes.
- Do not read or edit `.codearbiter/sprint-log.md`.

## Test-first execution

### 1. RED: define the local-preparation contract

- Modify `client/src/ui/LobbyHotSeatView.test.ts` to require the ready summary,
  closed valid disclosure, open invalid disclosure, preserved setup order, and a
  launch action outside the disclosure.
- Modify `e2e/pregame-command-shell.spec.ts` to prove the default crew manifest is
  hidden, the disclosure reveals it, and the launch action remains visible and
  reachable across supported projects.
- Run the focused unit and browser tests and retain the causal failures.

### 2. GREEN: implement the smallest semantic change

- Modify `client/src/ui/LobbyHotSeatView.ts` to add the ready summary and native
  disclosure around the existing setup nodes.
- Modify only scoped Hot Seat CSS in `client/src/ui/Lobby.ts` to integrate the
  summary/disclosure into the command-surface visual language.
- Preserve current nodes, callbacks, selectors, validation behavior, and action
  ownership.

### 3. REFACTOR and adversarial proof

- Run focused unit tests and the full pregame browser matrix.
- Force the valid disclosure open by default, prove the browser assertion fails,
  revert, and rerun green.
- Run full client, deterministic, Edge, type/build, audit, and secret-scan gates.
- Write the UTF-8 sprint evidence report and mark `ux.pregame.0003` done only after
  all implementation evidence is complete.
- Give one adversarial reviewer the spec, plan, sprint evidence, tests, and exact
  final diff. Resolve all Critical, High, and merge-blocking findings.

### 4. Deliver

- Commit only through the governed commit gate.
- Open a PR through `$ca-pr`, require every hosted check green on the exact reviewed
  head, merge under standing authority, verify the Pages deployment and production
  behavior, and persist a delivery receipt.
