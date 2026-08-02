# Victory After-Action Report Implementation Plan

> **For agentic workers:** use the repository's test-first and verification gates
> for each task. Every non-hard decision is SMARTS-scored in the sprint log.

**Goal:** Make the final match state feel like the climax of the current game while
preserving all winner, replay, and network behavior.

**Architecture:** Extend the persistent HUD's existing `GAME_OVER` overlay only.
Reuse the existing loadout preview painter and game state; expose one deterministic,
local-only E2E terminal fixture for production-layout acceptance.

**Tech stack:** TypeScript, Canvas 2D preview painter, Vitest/jsdom, HTML/CSS,
Playwright production Chromium.

## Global constraints

- Presentation only; engine/network/backends and winner calculation are immutable.
- No new dependency, generated asset, downloaded asset, or lockfile change.
- Existing restart/rematch and quit callbacks remain the only actions.
- Draws must not imply a winner.
- Modal isolation and reduced-motion behavior are acceptance requirements.

---

### Task 1: Pin the report in RED

**Files:**
- Create: `client/src/ui/HUD.victoryReport.test.ts`
- Create: `e2e/victory-report.spec.ts`
- Test: `client/src/ui/HUD.ts`
- Test: `client/src/main.ts`

- [x] **Step 1: Add failing HUD contracts**

  Require semantic modal markup, exact winner identity/color/loadout preview,
  winner-highlighted standings, honest draw state, underlying inertness, initial
  focus, focus containment, cleanup, and exactly-once Play-again/Main-menu actions.

- [x] **Step 2: Add failing production acceptance**

  Reach a deterministic local terminal fixture through the production bundle.
  Require the authored report, decoded battlefield art, winner preview signature,
  bounded geometry, zero document overflow, keyboard activation, isolation release,
  and reduced-motion behavior across relevant projects.

- [x] **Step 3: Record causal RED**

  The focused unit and browser failures must be attributable to the absent report,
  not setup, unrelated layout, or engine behavior.

### Task 2: Build the After-Action Report

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/main.ts`
- Modify: `docs/PLAYING.md`

- [x] **Step 1: Compose semantic report structure**

  Add outcome eyebrow/status, winner hero canvas, final-standings label, and clear
  Play-again/Main-menu actions inside the existing modal root.

- [x] **Step 2: Project exact terminal state**

  Paint the winner through `paintTankLoadoutPreview(..., 'spotlight')`, project the
  winner color as a CSS accent, highlight matching score cells, and clear/hide art
  for draws or report exit.

- [x] **Step 3: Enforce the real modal lifecycle**

  Isolate modal-root siblings while open, focus the primary action once, contain
  Tab/Shift+Tab, restore prior focus where valid, and release every inert/ARIA state
  through both phase exit and `hideEndScreens()`.

- [x] **Step 4: Author the fitted visual system**

  Reuse the dusk raster and UI tokens for a compact two-column report with strong
  winner hierarchy, readable score rows, safe action targets, short-height fit,
  and reduced-motion fallbacks.

- [x] **Step 5: Add the deterministic browser fixture and docs**

  Extend only the existing local E2E query entrypoint with an inert terminal
  presentation fixture; document the report without changing normal startup.

- [x] **Step 6: Observe focused GREEN and visually inspect**

  Run focused unit/type/browser tests and inspect desktop plus Pixel 5 landscape
  production captures. Prove no overflow, clipped report content, hidden actions,
  or leftover localhost listener.

### Task 3: Clear landing gates

**Files:**
- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only
- Append: `.codearbiter/sprint-log.md`

- [x] **Step 1: Run the complete local gate**

  Run client coverage, `npm run check`, Edge tests, production build, full E2E,
  dependency audit, diff hygiene, state-free secret scan, and localhost hygiene.

- [x] **Step 2: Clear one designated adversarial review**

  Supply exact spec/plan/diff, RED/GREEN evidence, and captures. Resolve every
  Critical, High, Important/Medium, accessibility, responsive, interaction,
  governance, and merge-blocking finding.

- [x] **Step 3: Commit and open one ready PR**

  Mark `hud.feature.0003` done after local review, route through `$ca-commit` and
  `$ca-pr`, and preserve the branch/worktree.

- [ ] **Step 4: Clear exact-head CI, merge, deploy, and verify**

  Log the PR-specific merge override only after the behavior head is green. Require
  the governance-only final head to re-clear hosted CI and adversarial review,
  squash merge, then prove exact Pages provenance, hosted smoke, HTTP 200, and
  localhost hygiene.
