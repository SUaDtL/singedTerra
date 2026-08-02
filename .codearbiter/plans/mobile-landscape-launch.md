# Mobile Landscape Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic portrait-phone dead end with a branded, resilient path into the existing landscape touch battlefield.

**Architecture:** Keep the existing portrait boundary authoritative. Add semantic launch markup, a pure progressive-enhancement helper, token-based responsive styling, and exact production-browser contracts without changing the fixed battlefield or game behavior.

**Tech Stack:** TypeScript, Vitest/jsdom, HTML/CSS, Playwright production Chromium, existing splash raster.

## Global Constraints

- Preserve `(orientation: portrait) and (max-width: 480px)` exactly.
- Fullscreen/orientation APIs are optional and failure-safe; never emit an
  unhandled rejection or imply that the browser guaranteed rotation.
- Physical rotation remains sufficient; the action is not a new gate.
- Reuse existing public art and UI tokens; no new asset or dependency.
- Client presentation only; no canvas/HUD reflow, input, engine, network,
  backend, auth, schema, migration, or lockfile change.

---

### Task 1: Pin the launch contract in RED

**Files:**
- Create: `client/src/ui/OrientationGate.test.ts`
- Modify: `e2e/portrait-gate.spec.ts`
- Test: `client/index.html`
- Test: `client/src/style.css`

- [x] **Step 1: Add failing pure-helper and DOM assertions**

  Require finite `locked`, `fullscreen`, and `manual` results across supported,
  missing, and rejecting ports. Require one idempotently bound action and one
  accessible live status update.

- [x] **Step 2: Add failing production portrait assertions**

  At 393x851 require authored art, semantic title, launch action, manual hint,
  44px action target, viewport containment, and reduced-motion behavior while
  preserving all current width/orientation boundary cases.

- [x] **Step 3: Observe and log causal RED**

  Run the focused Vitest file and portrait-gate Playwright route against untouched
  production. Failures must be attributable to the absent helper and launch UI,
  while the prior boundary assertions remain green.

### Task 2: Build the resilient mobile launch bay

**Files:**
- Create: `client/src/ui/OrientationGate.ts`
- Modify: `client/index.html`
- Modify: `client/src/main.ts`
- Modify: `client/src/style.css`
- Modify: `docs/PLAYING.md`

- [x] **Step 1: Implement the pure progressive-enhancement request**

  Attempt fullscreen, then landscape lock when available. Absorb each failure and
  return the strongest honest result without coupling to game state.

- [x] **Step 2: Mount one semantic action and live status**

  Bind once, keep the control keyboard/touch native, disable only while awaiting,
  and report locked, fullscreen-only, or manual fallback copy.

- [x] **Step 3: Author the launch-bay composition**

  Reuse the splash hero, dusk/ember/gold tokens, a CSS device-turn motif, safe-area
  padding, strong focus, and reduced-motion rules. Keep every element inside the
  phone viewport and leave non-phone layouts untouched.

- [x] **Step 4: Update player documentation**

  Explain that portrait phones offer a fullscreen/landscape shortcut and that
  rotating manually always works.

- [x] **Step 5: Observe focused GREEN and visual self-review**

  Run the helper tests, exact portrait route, typecheck, and production build.
  Inspect Pixel 5 portrait and landscape captures for visual continuity,
  legibility, action strength, no overflow, and an unobscured landscape game.
  Prove ports 4173 and 5173-5177 are empty afterward.

### Task 3: Clear landing gates

**Files:**
- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only
- Append: `.codearbiter/sprint-log.md`

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

  Also run the state-free secret scan and prove ports 4173 and 5173-5177 are not
  listening.

- [x] **Step 2: Dispatch one designated adversarial review**

  Supply the spec, plan, sprint log, focused/broad evidence, captures, and exact
  diff. Resolve every Critical, High, Important/Medium, accessibility,
  responsive-layout, interaction, governance, and merge-blocking finding.

- [x] **Step 3: Route commit and PR through `$ca-commit` and `$ca-pr`**

  Mark the sprint task done only after implementation and local review. Commit,
  push, and open one ready PR against `main`.

- [ ] **Step 4: Clear exact-head hosted CI, merge, deploy, and verify production**

  After the behavior head is green, log the PR-specific merge-stop override under
  standing authority. Require the governance-only final head to re-clear hosted
  CI and exact-package adversarial review, squash merge, then verify exact
  merge-SHA Pages provenance, HTTP 200, hosted live smoke, and localhost hygiene.
