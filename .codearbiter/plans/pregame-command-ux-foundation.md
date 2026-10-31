# Pre-game Deployment UX Foundation Implementation Plan

**Goal:** Make every route before a match feel like one deliberate deployment experience while retaining the established Hot Seat and Online behavior.

**Architecture:** `LobbyShellView.ts` becomes the semantic owner of the shared deployment hierarchy. `Lobby.ts` supplies current route content and applies scoped visual tokens without changing its match/account/room state machines. Browser tests observe rendered hierarchy and physical reachability, while shell unit tests protect the accessible route contract.

**Tech Stack:** TypeScript, DOM, scoped CSS injected by `Lobby`, Vitest/jsdom, Playwright production bundle.

## Global Constraints

- Presentation and hierarchy only. Preserve gameplay, deterministic engine, room protocol, account/Auth behavior, persistence, Supabase, dependencies, and migrations.
- Retain native tab roles, Arrow/Home/End behavior, focus restoration, route callbacks, rejoin behavior, and existing accessible names where tests/contracts rely on them.
- Keep the desktop shell fitted and compact controls physically reachable after whole-stage CSS zoom.
- Use current battlefield palette/theme tokens and squared command boundaries. Do not introduce a new dependency or a generic rounded card treatment.
- Do not read or edit `.codearbiter/sprint-log.md` (H-05). Keep generated `.codearbiter/open-tasks.md.lock` untracked.

### Task 1: Prove the missing deployment hierarchy

**Files:**
- Modify: `client/src/ui/LobbyShellView.test.ts`
- Modify: `e2e/pregame-command-shell.spec.ts`

**Interfaces:**
- Consumes: `buildLobbyShellView(options: LobbyShellViewOptions): HTMLElement`
- Produces: failing behavior contracts for named deployment landmarks and one route-primary action.

- [ ] Write a shell test that expects a semantic deployment masthead, a named mode rail, and a mission brief before route content while preserving the existing tab IDs and panel linkage.
- [ ] Run `npm -w @singedterra/client run test -- LobbyShellView.test.ts` and confirm it fails because the deployment landmarks do not exist.
- [ ] Write a production-browser assertion that opens Hot Seat and Online, verifies the named shell and one dominant route action, then checks the existing fitted/reachable controls on desktop, Pixel touch, and small-window.
- [ ] Run `npx playwright test e2e/pregame-command-shell.spec.ts` on an isolated production server and confirm the new hierarchy assertion fails before implementation.

### Task 2: Build the semantic deployment shell

**Files:**
- Modify: `client/src/ui/LobbyShellView.ts`
- Modify: `client/src/ui/LobbyShellView.test.ts`

**Interfaces:**
- Consumes: current `LobbyShellViewOptions`, especially `activeTab`, `rejoinAvailable`, `account`, `vehiclePreview`, `content`, `controls`, `onTabChange`, and `onRejoin`.
- Produces: named `lobby-deployment` landmarks while retaining `.lobby-card`, `.lobby-tabs`, `lobby-mode-panel`, and current callbacks for dependent code/tests.

- [ ] Add only the semantic container/header/brief elements needed by the failing unit test. Keep the existing title, tab buttons, IDs, roles, focus behavior, and route content nodes intact.
- [ ] Keep rejoin and account actions in the masthead/control area without changing their callback implementation or accessible action name.
- [ ] Run `npm -w @singedterra/client run test -- LobbyShellView.test.ts` and confirm the new and pre-existing shell tests pass.

### Task 3: Apply a shared command-surface visual system

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Test: `e2e/pregame-command-shell.spec.ts`
- Test: `e2e/account-progression-summary.spec.ts`
- Test: `e2e/garage-spotlight.spec.ts`

**Interfaces:**
- Consumes: deployment classes from Task 2 and current scoped `#lobby` styling.
- Produces: one fitted visual treatment for masthead, mode rail, mission brief, action hierarchy, vehicle bay, account record, and controls legend.

- [ ] Add the smallest scoped CSS layer that makes the mission/action column primary and the vehicle bay contextual on desktop. Use token-backed dark surfaces, straight borders, low-glow emphasis, and a single action hierarchy.
- [ ] Add compact rules that preserve the route rail, account trigger, and primary action without overlap. Use existing scale-aware custom properties for physical control floors where required.
- [ ] Preserve existing per-route form, account, garage, and Store selectors unless a scoped shell rule needs a new class. Do not alter event handlers, transport calls, or input names.
- [ ] Run the focused Playwright shell/account/garage tests until they pass on all configured projects.

### Task 4: Validate the full pre-game foundation

**Files:**
- Modify: `.codearbiter/specs/pregame-command-ux-foundation.md`
- Modify: `.codearbiter/plans/pregame-command-ux-foundation.md`
- Modify: `.codearbiter/open-tasks.md` only through `taskwrite.py`

- [ ] Run `npm run test:client`, `npm run check`, `npm run check:edge`, `npm run build`, `npm run audit:deps`, secret scan, and isolated full production-browser suite.
- [ ] Complete an adversarial exact-final-diff review package containing spec, plan, H-05 exception, tests, and final diff. Resolve every Critical, High, and merge-blocking finding.
- [ ] Mark `ux.pregame.0001` done through `taskwrite.py`, then commit, open a PR, wait for exact-head hosted CI, merge under standing authority, deploy Pages, and verify live provenance.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Superseded shell composition. Current source/oracles: `client/src/ui/commandCenter/CommandCenterShell.ts`, `e2e/pregame-command-center.spec.ts`.

The latest change to this historical plan reachable from `origin/main` is `231586e80365` (feat(pregame): unify deployment command surface). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
