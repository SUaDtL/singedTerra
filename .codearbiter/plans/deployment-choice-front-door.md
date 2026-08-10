# Plan: Deployment Choice Front Door

**Spec:** `.codearbiter/specs/deployment-choice-front-door.md`
**Task:** `ux.pregame.0005`
**Approval:** standing bounded-spec and plan authority

## 1. Prove the chooser contract RED

- [x] Extend `LobbyShellView` tests to require a chooser state with exactly Quick Duel, Local Battle, and Play Online actions and no preparation panel.
- [x] Require Quick Duel to be the sole primary action; require Local and Online callbacks to dispatch once.
- [x] Require flow state to render a named return action, the existing content, preview, and controls without the chooser.
- [x] Run the focused test and capture the expected failures against the peer-row implementation.

## 2. Implement the smallest shell state

- [x] Add a typed chooser/preparation surface to `LobbyShellView` instead of adding a router or new persistence owner.
- [x] Preserve the rejoin banner, account surface, semantic landmarks, and existing flow content.
- [x] Make Quick Duel dominant and the two preparation choices secondary but equally reachable.
- [x] Run focused shell tests GREEN and refactor only after green.

## 3. Prove Lobby state and focus behavior RED → GREEN

- [x] Add Lobby tests showing ordinary entry starts at the chooser, invite deep links enter Online join directly, and each choice opens only its owning flow.
- [x] Add causal tests for Back focus restoration and preservation of Local/Online working state across chooser round trips.
- [x] Implement one Lobby-owned surface field and bounded focus restoration; do not change session, transport, account, or game configuration contracts.
- [x] Run affected Lobby unit suites GREEN.

## 4. Prove production geometry and hierarchy

- [x] Add browser assertions for exactly three chooser choices, absent setup controls before selection, and Quick Duel's measurable visual prominence.
- [x] Prove Local and Online round trips, containment, minimum physical target size, and no document overflow on desktop, compact fine-pointer, and landscape touch.
- [x] Demonstrate mutation sensitivity by temporarily restoring setup-on-entry or peer prominence and observing the intended oracle fail; revert the mutation.

## 5. Verify, review, and deliver

- [x] Run fresh targeted tests, full client tests, deterministic checks, typecheck, build, dependency audit, and exact staged secret scan.
- [x] Write `.codearbiter/reports/2026-08-10-deployment-choice-front-door-sprint-evidence.md` with RED/GREEN, SMARTS, mutation, browser, and H-05 evidence.
- [x] Give the single adversarial reviewer the approved spec, plan, evidence report, exact tests, and final diff. Resolve every Critical, High, and merge-blocking finding and re-review the corrected diff.
- [x] Mark `ux.pregame.0005` done through the sanctioned task helper.
- [ ] Run commit gate, open the PR, require exact-reviewed-head hosted CI green, merge under standing authority, verify Pages production, and add a delivery receipt through the governed docs lane.
