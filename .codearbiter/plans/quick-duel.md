# Quick Duel versus CPU implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player start a standard human-versus-medium-CPU artillery match from the ordinary lobby in one activation.

**Architecture:** Extend the existing shell view with a callback-driven immediate-action briefing, then keep match construction inside `Lobby`, which already owns the hot-seat configuration seam. Reuse the existing `onReady` path so game startup, progression, first-salvo coaching, and teardown behavior do not fork.

**Tech stack:** TypeScript, DOM view builders, Vitest/jsdom, Playwright production-bundle geometry tests, existing Canvas and hot-seat engine.

## Global constraints

- Work test-first and observe the expected RED before production edits.
- Emit exactly two players: current primary human and one medium CPU.
- Emit no advanced settings and make no Supabase, Auth, migration, dependency, or engine changes.
- Keep the action visible and at least 46 CSS pixels high at every configured viewport.
- Keep the briefing and Hot Seat / Play Online tablist in one horizontal mode-rail row; do not add a deployment grid row.
- Do not read or write `.codearbiter/sprint-log.md` under the recorded marker-root exception.

---

### Task 1: Shell action and lobby configuration

**Files:**
- Modify: `client/src/ui/LobbyShellView.test.ts`
- Modify: `client/src/ui/LobbyShellView.ts`
- Create: `client/src/ui/Lobby.quickDuel.test.ts`
- Modify: `client/src/ui/Lobby.ts`

**Interfaces:**
- `LobbyShellViewOptions.onQuickDuel: () => void`
- `Lobby.startQuickDuel(): void` remains private and emits through the existing `onReady(config)` callback.

- [ ] Add a shell-view test that requires one `Quick Duel vs CPU` briefing inside the mode rail immediately before the tablist and proves one callback invocation.
- [ ] Run `npm run test:client -- client/src/ui/LobbyShellView.test.ts` and verify RED because the option and action do not exist.
- [ ] Add a Lobby integration test that clicks the real action and asserts a two-seat hot-seat config, medium CPU, unique colors, normalized loadouts, no settings, and exactly one callback.
- [ ] Run `npm run test:client -- client/src/ui/Lobby.quickDuel.test.ts` and verify RED because the action is absent.
- [ ] Implement the minimal shell action and `Lobby.startQuickDuel()` wiring.
- [ ] Run both focused tests and verify GREEN.
- [ ] Refactor only duplicated hot-seat player normalization if the tests expose a clear local seam, then rerun the focused tests.

### Task 2: Command-shell layout and production journey proof

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Modify: `e2e/pregame-command-shell.spec.ts`

**Interfaces:**
- `.lobby-quick-duel` is the briefing container.
- `.lobby-quick-duel__action` is the unique launch control.

- [ ] Add a browser test that requires the Quick Duel action to be reachable, at least 46 CSS pixels high, contained in the lobby frame, and positioned inside the mode rail immediately before the tablist at every configured viewport.
- [ ] Add a browser journey assertion that activates the action and observes a visible running HUD plus CPU opponent.
- [ ] Run the focused production-bundle Playwright spec and verify RED because the action is absent.
- [ ] Add the minimal desktop and compact mode-rail CSS for the immediate-action briefing without adding a deployment grid row.
- [ ] Build and rerun the focused Playwright spec until GREEN.
- [ ] Mutation-check the journey by temporarily disconnecting `onQuickDuel`; verify the browser or integration test fails, then restore production code.

#### SMARTS-approved fix round 2/5 correction

- [ ] Update shell unit and production-browser geometry tests first; observe RED because Quick Duel is still a separate deployment child and row.
- [ ] Move the existing `.lobby-quick-duel` container into `.lobby-deployment__mode-rail` immediately before `.lobby-tabs`; preserve the nested `.lobby-quick-duel__action` and callback.
- [ ] Remove the dedicated `quick-duel` deployment grid area/row in desktop and compact layouts; make the rail a single horizontal command row.
- [ ] Preserve direct initial action containment checks before any scrolling helper, frame overflow checks, and the production journey assertion.
- [ ] Run focused unit/typecheck/build, the full `pregame-command-shell` matrix, and `online-garage-layout.spec.ts`, `tank-garage.spec.ts`, plus `garage-spotlight.spec.ts` on isolated port 4174.

Standing approval applies. Comparative production runs established 23/23 garage passes with one expected skip before Quick Duel versus five overflow failures with the dedicated row. The same-row correction scores highest for scope fit, player value, evidence, reversibility, and risk containment, so no separate pause is required.

### Task 3: Full verification and review package

**Files:**
- Modify only test or implementation files needed to resolve review findings.

- [ ] Run `npm run test:client`.
- [ ] Run `npm run check`.
- [ ] Run `npm run check:edge`.
- [ ] Run `npm run audit:deps`.
- [ ] Run `npm run build`.
- [ ] Run the full non-live Playwright matrix.
- [ ] Assemble the adversarial review package containing this spec, this plan, the sprint-log exception, tests, and exact final diff.
- [ ] Resolve every Critical, High, and merge-blocking finding, then rerun affected tests and exact-final-diff review.
- [ ] Exit through `$ca-commit` and `$ca-pr`, require green hosted checks on the exact reviewed head, merge with an expected-head guard under standing authority, verify Pages provenance and production health, and persist a delivery receipt.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Later Command Center and normalized match owners. Current source/oracles: `client/src/ui/Lobby.ts`, `client/src/ui/Lobby.quickDuel.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `0af6ca137d23` (feat(lobby): add one-click CPU duel). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
