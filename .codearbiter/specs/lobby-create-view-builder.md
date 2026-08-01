# Lobby Create View Builder Spec

**Issue:** #129
**Type:** behavior-preserving refactor
**Approval:** maintainer standing passion-project sprint authority, logged per sprint

## Goal

Extract the complete Create Room DOM composition from `Lobby.renderCreateForm()` into a stateless, directly tested builder while preserving every observable behavior and keeping all state, field construction, navigation, transport, and session effects in `Lobby`.

## Behavior contract

- Preserve exact subcopy, shared-node and field order, Players/CPU/Visibility option ranges and selection, conditional difficulty selector, Advanced summary/field order, status placement, and button classes/order/text/busy state.
- Builder callbacks receive typed current select values. Lobby retains bot clamping, state writes, render calls, navigation/error clearing, field callbacks, room validation/creation, loadout normalization, session writes, subscriptions, and waiting-room transition.
- Lobby supplies detached name/color, Garage, advanced setting fields, and status nodes; builder composes them without owning their effects.
- Do not change CSS, existing tests, dependencies, lockfiles, backend, auth, crypto, migrations, workflows, or shared engine behavior.

## Approved surface

| File | Purpose |
| --- | --- |
| `.codearbiter/overrides.log` | Append sprint-specific standing approval and later merge receipt. |
| `.codearbiter/sprint-log.md` | Append SMARTS, TDD, verification, review, and hosted receipts. |
| `.codearbiter/specs/lobby-create-view-builder.md` | This approved contract. |
| `.codearbiter/plans/lobby-create-view-builder.md` | Governed implementation plan. |
| `client/src/ui/Lobby.ts` | Replace inline Create DOM with a state/effect adapter. |
| `client/src/ui/LobbyCreateView.ts` | Stateless DOM builder. |
| `client/src/ui/LobbyCreateView.test.ts` | Direct causal builder tests. |

## Acceptance

1. Pre-existing focused Lobby tests, unchanged 15-case browser matrix, and baseline coverage pass before production edits; `Lobby.ts` line and branch coverage clear 60%.
2. Direct tests prove exact structure/order, dynamic selectors, conditional difficulty, typed routing, busy state, and all three actions through behavioral RED then GREEN.
3. Full deterministic, client, Edge, Playwright, coverage, build, dependency-audit, secret, Pages-base, and diff gates pass.
4. One adversarial reviewer returns CLEAN / READY after every Critical, High, Medium, and merge blocker is corrected.
5. Delivery uses a PR, exact-head hosted CI, separately logged merge receipt, governance-only review, fresh final-head CI, squash merge, Pages provenance, and live smoke.
