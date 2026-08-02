# Interactive Command Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop Command Deck a causal mouse-and-keyboard control surface without changing game semantics.

**Architecture:** Preserve the five-cell deck, replace inert key hints with semantic buttons, route them through existing HUD callbacks, and extend the existing state reconciliation and production-browser contracts.

**Tech Stack:** TypeScript, DOM/CSS embedded in `HUD.ts`, Vitest/jsdom, Playwright, Vite.

## Global constraints

- Preserve command order, 236px panel bounds, Fire hierarchy, Impact Monitor clearance, and the fine/coarse pointer split.
- Reuse existing callbacks and exact signed deltas; never dispatch synthetic `KeyboardEvent`s.
- Command buttons must honor local-turn, phase, firing, ammo, fuel, alive, and burial gates already owned by the HUD.
- No engine, network, backend, dependency, lockfile, auth, schema, migration, or asset change.

---

### Task 1: Pin the causal desktop command contract

**Files:**
- Modify: `client/src/ui/HUD.commandInput.test.ts`
- Modify: `e2e/hud-layout.spec.ts`

- [x] **Step 1: Add the focused unit contract**

  Require nine semantic keycap buttons with exact accessible names/actions,
  exact signed callback payloads, Fire callback reuse, and disabled/aria-disabled
  parity across ownership and movement-specific gates.

- [x] **Step 2: Add the production-browser contract**

  On fine-pointer projects, prove the interactive keycaps remain inside the
  existing panel, a command click changes the live ballistic readout, and Fire
  produces the existing busy/disabled state. Retain the coarse-pointer isolation
  assertions.

- [x] **Step 3: Observe and log TDD RED**

  ```powershell
  npm exec --workspace client vitest run src/ui/HUD.commandInput.test.ts
  npx playwright test e2e/hud-layout.spec.ts --grep "interactive Command Deck" --project=desktop-fine --project=small-window
  ```

  Expected: the new unit and browser contracts fail because the desktop keycaps
  are inert `<kbd>` elements and expose no action buttons.

### Task 2: Implement the shared command surface

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Test: `client/src/ui/HUD.commandInput.test.ts`
- Test: `e2e/hud-layout.spec.ts`

- [x] **Step 1: Build semantic keycap buttons**

  Keep the five cell containers; create nine cached command buttons, wire exact
  existing callbacks/deltas, add accessible names and First Salvo target seams,
  and identify the header mode as mouse plus keys.

- [x] **Step 2: Reconcile command availability**

  Extend `syncMobility()` and `syncStrip()` so desktop buttons mirror the same
  native disabled and `aria-disabled` state as their existing causal controls.
  Fire mirrors selected-ammo eligibility; movement keeps its stricter gate.

- [x] **Step 3: Add interaction styling without reflow**

  Preserve current geometry while adding token-derived hover, active,
  focus-visible, and disabled treatment to the nested keycap buttons.

- [x] **Step 4: Observe focused GREEN and self-review**

  Run Task 1 commands plus `npx playwright test e2e/hud-layout.spec.ts`. Inspect
  desktop-fine and small-window production screenshots, verify no duplicate
  dispatch, and prove watched localhost ports are empty afterward.

### Task 3: Clear landing gates

**Files:**
- Modify: `.codearbiter/open-tasks.md` via `taskwrite.py` only
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

  Also run the state-free secret scan and prove ports 4173 and 5173-5177 are not listening.

- [x] **Step 2: Dispatch one designated adversarial review**

  Supply the spec, plan, sprint log, focused/broad test evidence, and final diff.
  Resolve every Critical, High, Medium/Important, causal-coverage, accessibility,
  responsive-layout, governance, and merge-blocking finding.

- [x] **Step 3: Route commit and PR through `$ca-commit` and `$ca-pr`**

  Mark the minted HUD feature task done only after implementation and local
  review pass. Commit, push, and open one ready PR against `main`.

- [ ] **Step 4: Clear exact-head hosted CI, merge, deploy, and verify production**

  After the behavior head is green, log the PR-specific merge-stop override under
  standing authority. Require the final governance head to re-clear hosted CI and
  exact-package adversarial review, squash merge, then verify exact merge-SHA Pages
  provenance, HTTP 200, hosted smoke, and localhost hygiene.
