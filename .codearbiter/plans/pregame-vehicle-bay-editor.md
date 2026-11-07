# Pre-game Vehicle Bay editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the compact Garage dialog into a named, readable Vehicle Bay editor while preserving every current loadout action.

**Architecture:** Keep `Lobby.renderGarage` as the sole owner of Garage DOM and loadout callbacks. Add semantic summary and grouping nodes only while a Garage is editing, then use scoped Lobby CSS to compose those nodes into a compact editor. Extend the current unit and Playwright Garage contracts so behavior and geometry are causal.

**Tech Stack:** TypeScript, DOM UI, CSS in `client/src/ui/Lobby.ts`, Vitest, Playwright.

## Global Constraints

- Client UI only. No auth, backend, Supabase, migration, dependency, renderer, game-rule, or generated-art change.
- Preserve preset and slot callback semantics, keyboard trap, Escape close, and focus return.
- Use the existing dark squared command language. No rounded cheerful card treatment.
- Keep the working spec and plan under `.codearbiter/`.
- Do not read or modify `.codearbiter/sprint-log.md` because of the sanctioned malformed UTF-8 marker-root exception.

---

### Task 1: Define Vehicle Bay DOM contracts

**Files:**
- Modify: `client/src/ui/Lobby.garage.test.ts`
- Modify: `client/src/ui/Lobby.ts:2165-2283`

**Interfaces:**
- Produces `.lobby-garage__editor-header`, `.lobby-garage__build-summary`, `.lobby-garage__preset-group`, and `.lobby-garage__component-group` inside an editing Garage.
- Consumes `TankLoadout`, `TANK_KIT_IDS`, `TANK_KIT_LABELS`, `TANK_PART_SLOTS`, and `TANK_PART_VARIANT_LABELS` already used by `renderGarage`.

- [ ] **Step 1: Write failing unit contracts**

```ts
expect(editing.querySelector('.lobby-garage__editor-header')?.textContent)
  .toContain('Vehicle Bay: Player 1');
expect(editing.querySelector('.lobby-garage__build-summary')?.textContent)
  .toContain('Foundry loadout');
expect(editing.querySelector('.lobby-garage__preset-group')?.getAttribute('aria-label'))
  .toBe('Preset loadouts');
expect(editing.querySelector('.lobby-garage__component-group')?.getAttribute('aria-label'))
  .toBe('Component bay');
```

Add a mixed-loadout fixture by clicking a single slot after a preset and assert the summary says `Mixed assembly` and includes the selected part labels.

- [ ] **Step 2: Run the focused unit test and confirm it fails**

Run: `npm -w @singedterra/client run test -- Lobby.garage.test.ts`

Expected: FAIL because the Vehicle Bay summary and groups do not exist.

- [ ] **Step 3: Add the minimal semantic editor structure**

```ts
const uniformKit = TANK_KIT_IDS.find((kit) =>
  TANK_PART_SLOTS.every((slot) => loadout[slot] === kit),
);
summary.textContent = uniformKit
  ? `${TANK_KIT_LABELS[uniformKit]} loadout`
  : `Mixed assembly: ${TANK_PART_SLOTS.map((slot) => TANK_PART_VARIANT_LABELS[slot][loadout[slot]]).join(' · ')}`;
```

Create labelled preset and component group containers, move only the existing `presets` and `slots` nodes into them, and append editor-only structure when `openGarageOwner === owner`. Keep existing buttons and listeners intact.

- [ ] **Step 4: Run the focused unit test and confirm it passes**

Run: `npm -w @singedterra/client run test -- Lobby.garage.test.ts`

Expected: PASS with existing preset, slot, focus, and online-Garage contracts preserved.

### Task 2: Compose the compact Vehicle Bay

**Files:**
- Modify: `client/src/ui/Lobby.ts:790-1055, 2165-2283`
- Modify: `e2e/tank-garage.spec.ts:209-355`

**Interfaces:**
- Consumes the editor classes from Task 1.
- Produces a compact dialog with header, summary, preset group, component group, and Done action contained in order.

- [ ] **Step 1: Write the browser geometry contract first**

Add a helper that serializes the editing dialog, `.lobby-garage__editor-header`, `.lobby-garage__build-summary`, both labelled groups, and the Done button. Assert each region has visible height, clears the following region, and stays inside dialog left and right edges. Invoke it after opening Player 1 Garage in all existing projects.

- [ ] **Step 2: Run the targeted browser test and confirm the new contract fails before layout support**

Run: `npx playwright test e2e/tank-garage.spec.ts --grep "keeps customization legible"`

Expected: FAIL because the semantic editor regions have no finished compact composition.

- [ ] **Step 3: Add scoped Vehicle Bay styling**

Use `.lobby-garage.editing` for a compact grid with explicit region spacing, a named header, one summary strip, a two-column component group, and a full-width Done action. Remove only editing-dialog dead space. Preserve the existing non-editing compact `Customize tank` presentation and desktop inline Garage.

- [ ] **Step 4: Run the targeted browser test and confirm it passes**

Run: `npx playwright test e2e/tank-garage.spec.ts --grep "keeps customization legible"`

Expected: PASS across desktop, Pixel touch, and small window projects.

- [ ] **Step 5: Prove causal geometry**

Temporarily add a production-only compact rule that collapses `.lobby-garage__build-summary` to zero height. Rebuild the production bundle and run the targeted browser test. Record its expected failure at the summary visibility or region-clearance assertion. Remove the mutation with `apply_patch` before final verification.

### Task 3: Verify, review, and deliver

**Files:**
- Verify: `client/src/ui/Lobby.ts`, `client/src/ui/Lobby.garage.test.ts`, `e2e/tank-garage.spec.ts`

- [ ] **Step 1: Run final local gates**

Run: `npm run test:client`, `npm run check`, `npm run check:edge`, `npm run audit:deps`, `npm run build`, and `git diff --check`.

Expected: all pass.

- [ ] **Step 2: Run the production-bundle browser matrix**

Run the existing Playwright suite against a controlled production bundle with local Supabase test variables.

Expected: every non-live test passes at desktop, touch, and compact viewports.

- [ ] **Step 3: Review and deliver**

Stage only the spec, plan, Lobby source, Lobby Garage unit test, and Garage browser test. Run the canonical changed-file secrets scan. Give an adversarial reviewer the exact staged diff, spec, plan, tests, final gate output, and mutation evidence. Resolve every Critical, High, and merge-blocking finding. Commit, open a PR, require hosted CI to pass on the reviewed head, merge with a head guard, let Pages deploy, and verify direct production provenance.

## Plan self-review

- Spec coverage: Tasks 1 and 2 implement identity, uniform and mixed summaries, grouped controls, preserved interactions, and compact geometry. Task 3 carries every delivery gate.
- Placeholder scan: no deferred implementation text or unspecified test work remains.
- Type consistency: Task 1 introduces every class consumed by Task 2. Existing `TankLoadout` and catalog constants remain the only state inputs.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Later Garage owner. Current source/oracles: `client/src/ui/LobbyGarageView.ts`, `client/src/ui/LobbyGarageView.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `c35fd15726a8` (feat(pregame): compose the Vehicle Bay editor). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
