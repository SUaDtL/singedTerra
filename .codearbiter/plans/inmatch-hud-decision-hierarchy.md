# In-match HUD decision hierarchy plan

## Task 1: Test-drive deterministic combat focus

**Files:**

- Modify: `.codearbiter/open-tasks.md`
- Create: `.codearbiter/specs/inmatch-hud-decision-hierarchy.md`
- Create: `.codearbiter/plans/inmatch-hud-decision-hierarchy.md`
- Create: `.codearbiter/reports/2026-08-10-inmatch-hud-decision-hierarchy-sprint-evidence.md`
- Create: `client/src/ui/HUD.combatFocus.test.ts`
- Modify: `client/src/ui/HUD.ts`
- Modify: `e2e/hud-layout.spec.ts`

### Step 1: RED

- Add unit assertions for `decision`, pending-fire `outcome`, `FIRING` outcome, `RESOLVING` outcome, terminal state, assistive-state attributes, and restoration on the next player turn.
- Add browser assertions for the real Fire transition, outcome-first visual order, computed opacity/emphasis, containment, and reduced-motion stability across all configured profiles.
- Run the focused unit and browser commands and record the expected failures before production changes.

### Step 2: GREEN

- Derive and synchronize the focus mode in `HUD.update()` without changing action availability.
- Apply focus mode to the side rail and overlay command decks.
- Add authored outcome emphasis and demotion CSS, including reduced-motion handling.
- Run focused tests until green.

### Step 3: Mutation proof

- Remove or invert the focus-mode transition and prove the causal unit/browser tests fail.
- Remove outcome visual-order/emphasis rules and prove computed browser assertions fail.
- Restore each mutation before continuing.

### Step 4: Full verification and review

- Run `npm run check`, `npm run coverage:client`, `npm run check:edge`, `npm run audit:deps`, the production build, and the full HUD browser guardrail spec.
- Run the state-free secret scan and diff checks.
- Give one adversarial reviewer the spec, plan, sprint evidence, tests, and exact final diff; resolve every Critical, High, Important, and merge-blocking finding.
- Complete `$ca-commit` and `$ca-pr`, require exact-head hosted CI, merge under standing authority, verify Pages provenance and public production behavior, and persist the delivery receipt.
