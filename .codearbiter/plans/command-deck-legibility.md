# Command Deck Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop Command Deck legible and visually coherent with the tactical HUD without changing command behavior.

**Architecture:** Keep the existing semantic five-cell DOM and change only its embedded CSS. Extend the real-browser HUD guardrail to measure computed typography, rendered geometry, primary-row emphasis, and overflow across both fine-pointer projects.

**Tech Stack:** TypeScript, DOM/CSS embedded in `HUD.ts`, Playwright, Vitest, Vite.

## Global Constraints

- Fine-pointer command order remains Aim, Power, Move, Weapon, Fire.
- Coarse-pointer touch controls and all input callbacks remain byte-for-byte unchanged.
- Panel width is exactly 236 logical pixels; title >= 10.5px; mode >= 7.5px; labels >= 10px; keycaps >= 8.5px.
- Glyph frames are >= 30x30; ordinary rows are >= 46px; primary Fire row is >= 42px.
- No engine, input semantics, dependency, lockfile, backend, auth, schema, migration, or destructive operation change.

---

### Task 1: Pin the production Command Deck contract

**Files:**
- Modify: `e2e/hud-layout.spec.ts`
- Test: `e2e/hud-layout.spec.ts`

**Interfaces:**
- Consumes: existing `[data-ui="command-deck"]`, `.st-hud__control-cell`, `.st-hud__control-label`, `.st-hud__keypair`, `kbd`, and `.st-ui-glyph` DOM seams.
- Produces: a production-bundle geometry contract for the CSS implementation in Task 2.

- [x] **Step 1: Strengthen the existing fine-pointer browser assertion**

  Extend `command deck and touch dock stay causal, strong, and fitted` to collect
  panel width, header and row typography, row and glyph geometry, the primary
  row's computed border color, and scroll dimensions from the production DOM.
  Assert the exact/minimum values from Global Constraints, the first four rows
  share the ordinary height, the final row meets the primary height, the Fire
  row spans at least 1.8x an ordinary row, and all scroll dimensions fit.

- [x] **Step 2: Run the focused production-browser test and observe RED**

  ```powershell
  npx playwright test e2e/hud-layout.spec.ts --grep "command deck and touch dock" --project=desktop-fine --project=small-window
  ```

  Expected: both fine-pointer projects fail on the new 236px, typography,
  30x30 glyph, and row-height thresholds while the existing semantic assertions
  continue to pass.

- [x] **Step 3: Record the causal RED receipt**

  Append the exact command, failure count, and failed thresholds to
  `.codearbiter/sprint-log.md` without modifying prior entries.

### Task 2: Rebalance the Command Deck presentation

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Test: `e2e/hud-layout.spec.ts`
- Test: `client/src/ui/HUD.commandInput.test.ts`

**Interfaces:**
- Consumes: Task 1's measured DOM contract and the existing shared HUD tokens.
- Produces: the same semantic deck with a larger, production-coherent visual hierarchy.

- [x] **Step 1: Apply the minimal CSS implementation**

  Update only the `.st-hud__controls*`, `.st-hud__control-*`, and compact
  fine-pointer rules to use a 236px panel, 10px padding, 10px corner radius,
  24px header, 10.5px title, 7.5px mode chip, 6px grid gap, 46px ordinary rows,
  42px primary row, 30px glyph frames, 10px labels, and 8.5px keycaps.
  Strengthen only existing token-derived borders, highlights, and ember emphasis;
  do not add a new color literal or DOM state.

- [x] **Step 2: Run the focused browser test and observe GREEN**

  Run the exact Task 1 command. Expected: 2/2 projects pass with no localhost
  listener left behind after Playwright exits.

- [x] **Step 3: Run focused semantic and full HUD layout coverage**

  ```powershell
  npm exec --workspace client vitest run src/ui/HUD.commandInput.test.ts
  npx playwright test e2e/hud-layout.spec.ts
  ```

  Expected: semantic unit tests and all three Playwright projects pass; the
  pixel-touch project continues to hide the keyboard deck and expose the
  unchanged touch dock.

- [x] **Step 4: Perform visual and scope self-review**

  Capture desktop-fine and small-window screenshots from the production bundle.
  Confirm the deck reads at first glance, Fire remains the sole emphasis, the
  upper-left battlefield remains usable, and no non-HUD production file changed.

### Task 3: Clear landing gates

**Files:**
- Modify: `.codearbiter/open-tasks.md` via `taskwrite.py` only
- Append: `.codearbiter/sprint-log.md`

**Interfaces:**
- Consumes: the complete Task 1-2 diff.
- Produces: one reviewed, verified, PR-ready package.

- [x] **Step 1: Run the complete local gate**

  ```powershell
  npm run coverage:client
  npm run check
  npm run check:edge
  npm run build
  npm run test:e2e
  npm run audit:deps
  git diff --check
  ```

  Also run the state-free secret scan and prove ports 4173 and 5173-5177 are
  not listening.

- [x] **Step 2: Dispatch one designated adversarial review**

  Require clearance of Critical, High, Medium/Important, causal-coverage,
  regression, accessibility, responsive-layout, and governance findings. Fix
  every blocker and rerun affected gates.

- [x] **Step 3: Route commit and PR through `$ca-commit` and `$ca-pr`**

  Mark `hud.feature.0001` done only after implementation and local review pass.
  Commit only through the fresh commit gate, push the isolated branch, and open
  a ready PR against `main`.

- [ ] **Step 4: Clear exact-head hosted CI, merge, deploy, and verify production**

  Log the PR-specific merge-stop override under standing authority only after
  the behavior head clears its hosted gates. Require the final governance head
  to re-clear the designated adversary and all hosted checks, squash merge, then
  verify exact merge-SHA Pages provenance, HTTP 200, and the hosted live smoke.
