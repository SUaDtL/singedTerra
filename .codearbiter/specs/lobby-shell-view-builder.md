# Lobby Shell View Builder Spec

**Issue:** #129
**Type:** behavior-preserving refactor
**Approval:** maintainer standing passion-project sprint authority, logged per sprint

## Goal

Extract the lobby card shell, rejoin affordance, primary tabs, and online sub-view wrapper from `Lobby` into a stateless, directly tested builder while preserving every observable behavior and keeping all state, navigation, session, and game-start effects in `Lobby`.

## Behavior contract

- Preserve the exact card/title/vehicle-preview/rejoin/tabs/content/controls order, classes, text, button types, active-tab class, conditional rejoin presence, and online wrapper element.
- The builder receives the already-selected active content and detached preview/controls nodes. It emits typed tab and rejoin callbacks only.
- `Lobby` retains active-tab and online-sub-view selection, render calls, rejoin validation/activation, session/token/transport access, `onReady`, garage focus/inert handling, and all per-view adapters.
- Do not change CSS, existing tests, dependencies, lockfiles, backend, auth, crypto, migrations, workflows, shared engine behavior, or issue/task trackers.

## Approved surface

| File | Purpose |
| --- | --- |
| `.codearbiter/overrides.log` | Append sprint-specific standing approval and later merge receipt. |
| `.codearbiter/sprint-log.md` | Append SMARTS, TDD, verification, review, and hosted receipts. |
| `.codearbiter/specs/lobby-shell-view-builder.md` | This approved contract. |
| `.codearbiter/plans/lobby-shell-view-builder.md` | Governed implementation plan. |
| `client/src/ui/Lobby.ts` | Replace inline shell/tab/rejoin/online-wrapper DOM with a state/effect adapter. |
| `client/src/ui/LobbyShellView.ts` | Stateless shell DOM builder and online-content wrapper. |
| `client/src/ui/LobbyShellView.test.ts` | Direct causal builder tests. |

## Acceptance

1. Pre-existing focused tab/rejoin/network tests, the unchanged 15-case Lobby browser oracle, and baseline coverage pass before production edits; `Lobby.ts` line and branch coverage clear 60%.
2. Direct tests prove exact shell order, node identity, conditional rejoin copy/action, active tabs and typed routes, content selection, and online wrapper through behavioral RED then GREEN.
3. Full deterministic, client, Edge, Playwright, coverage, build, dependency-audit, secret, Pages-base, and diff gates pass.
4. One adversarial reviewer returns CLEAN / READY after every Critical, High, Medium, and merge blocker is corrected.
5. Delivery uses a PR, exact-head hosted CI, separately logged merge receipt, governance-only review, fresh final-head CI, squash merge, Pages provenance, and live smoke.
