# Lobby Join View Builder Spec

**Issue:** #129
**Type:** behavior-preserving refactor
**Approval:** maintainer standing passion-project sprint authority, logged per sprint

## Goal

Extract the complete Join-by-Code DOM composition from `Lobby.renderJoinForm()` into a stateless, directly tested builder while preserving every observable behavior and keeping all state, normalization, navigation, transport, and rendering effects in `Lobby`.

## Behavior contract

- Preserve the exact subcopy, Room code label/input type/class/max length/value/placeholder, child order, button classes/order/text, and busy/disabled state.
- Route raw input through a Lobby-owned normalizer callback and immediately replace the input value with the returned canonical code.
- Append the exact prebuilt name/color, Garage, and online-status nodes in their current order.
- Route Join, Create, and Browse clicks to Lobby-owned callbacks. Lobby retains code state, error clearing, sub-view state, render calls, join validation, network requests, loadout normalization, session writes, polling, and waiting-room transition.
- Do not change CSS, existing tests, dependencies, lockfiles, backend, auth, crypto, migrations, workflows, or shared engine behavior.

## Approved surface

| File | Purpose |
| --- | --- |
| `.codearbiter/overrides.log` | Append sprint-specific standing approval and later merge receipt. |
| `.codearbiter/sprint-log.md` | Append SMARTS, TDD, verification, review, and hosted receipts. |
| `.codearbiter/specs/lobby-join-view-builder.md` | This approved contract. |
| `.codearbiter/plans/lobby-join-view-builder.md` | Governed implementation plan. |
| `client/src/ui/Lobby.ts` | Replace inline Join DOM with a thin state/effect adapter. |
| `client/src/ui/LobbyJoinView.ts` | Stateless DOM builder. |
| `client/src/ui/LobbyJoinView.test.ts` | Direct causal builder tests. |

## Acceptance

1. Pre-existing focused Lobby tests, the unchanged 15-case browser matrix, and baseline coverage pass before production edits; `Lobby.ts` line and branch coverage clear 60%.
2. Direct builder tests prove exact structure/order, canonical input routing, busy state, and all three actions through a valid behavioral RED then GREEN.
3. Full deterministic, client, Edge, Playwright, coverage, build, dependency-audit, secret, Pages-base, and diff gates pass.
4. One adversarial reviewer returns CLEAN / READY after every Critical, High, Medium, and merge blocker is corrected.
5. Delivery uses a PR, exact-head hosted CI, a separately logged standing merge receipt, governance-only adversarial follow-up, fresh final-head CI, squash merge, matching Pages provenance, and live smoke.
