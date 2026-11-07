# Mobile Single-Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing portrait launch bay the only first-load phone-portrait handoff while preserving the title splash everywhere else.

**Architecture:** Keep `OrientationGate` unchanged as the sole owner of fullscreen/orientation requests, focus containment, app inertness, and rotation exit. Add one synchronous initial-viewport decision at the `Splash.ts` mount boundary; browser tests bind the full portrait-to-landscape journey and unit tests bind match/non-match behavior.

**Tech Stack:** TypeScript, Vitest/jsdom, Playwright production Chromium, existing Vite client.

## Global Constraints

- Match exactly `(orientation: portrait) and (max-width: 480px)`.
- Decide only when `mountSplash()` runs; do not subscribe to later media-query changes.
- Preserve splash behavior for phone landscape, portrait widths above 480px, desktop, and environments without `matchMedia`.
- Preserve the existing orientation launch bay, lobby, deterministic E2E bypass, engine, network, Supabase, assets, dependencies, and lockfile.
- Do not edit malformed `.codearbiter/sprint-log.md`; persist evidence in the exact review package and delivery receipt.

---

### Task 1: Bind the initial mobile handoff in RED

**Files:**
- Modify: `client/src/ui/Splash.test.ts`
- Modify: `e2e/portrait-gate.spec.ts`

**Interfaces:**
- Consumes: production `mountSplash(): void`, `#st-splash`, `#st-splash-style`, `#portrait-warn`, `#portrait-launch`.
- Produces: causal unit and production-browser contracts for the single handoff.

- [x] **Step 1: Add production-mount unit scenarios**

  Stub `window.matchMedia` before importing `Splash.ts`. Require an initial phone-portrait match to leave both `#st-splash` and `#st-splash-style` absent. Require phone landscape, 481px portrait, desktop, and absent `matchMedia` to retain the splash.

- [x] **Step 2: Run the focused unit test and observe RED**

  Run `npm -w @singedterra/client exec vitest run src/ui/Splash.test.ts`. Expected RED: phone portrait still mounts `#st-splash`.

- [x] **Step 3: Extend the production journey oracle**

  In the 393x851 authored-launch test, remove splash dismissal. Assert `#st-splash` is absent on first paint, `#portrait-warn` is visible and actionable, rotation hides the gate, the lobby is visible, and `#st-splash` remains absent after rotation.

- [x] **Step 4: Run the focused browser route and observe RED**

  Build with fixture-safe Vite environment values, serve on isolated port 4174, and run `npx playwright test e2e/portrait-gate.spec.ts`. Expected RED: the splash still exists and prevents the launch button from being ready.

### Task 2: Implement the one-decision splash boundary

**Files:**
- Modify: `client/src/ui/Splash.ts`
- Test: `client/src/ui/Splash.test.ts`
- Test: `e2e/portrait-gate.spec.ts`

**Interfaces:**
- Produces: `PHONE_PORTRAIT_QUERY` and `shouldSkipSplashForInitialViewport(view?: Window): boolean`.
- Preserves: public `mountSplash(): void` and all existing splash dismissal behavior.

- [x] **Step 1: Add the pure initial-viewport helper**

  Define the exact query constant and return `false` unless `view.matchMedia` is callable. Otherwise return `view.matchMedia(PHONE_PORTRAIT_QUERY).matches`.

- [x] **Step 2: Guard the production mount before style injection**

  After the existing idempotency check, return from `mountSplash()` when `shouldSkipSplashForInitialViewport()` is true. Do not create an observer or remember the result outside this mount.

- [x] **Step 3: Run focused GREEN**

  Run the Splash unit file and the isolated portrait browser file. Expected: all focused scenarios pass, including the direct portrait-to-landscape lobby handoff.

- [x] **Step 4: Prove causal mutations**

  Temporarily remove the skip guard and verify the phone-portrait unit/browser oracle fails. Restore it. Temporarily weaken the query to orientation-only and verify the 700px portrait or 481px preservation oracle fails. Restore the exact query.

### Task 3: Complete local verification and exact-package review

**Files:**
- Add: `.superpowers/sdd/mobile-single-handoff/progress.md`
- Add: `.superpowers/sdd/mobile-single-handoff/final-review-package.md`

**Interfaces:**
- Produces: one immutable package containing spec, plan, sprint evidence, tests, mutations, verification, and exact staged diff.

- [x] **Step 1: Run restored verification**

  Run `npm run test:client`, `npm run check`, `npm run check:edge`, `npm run audit:deps`, a fixture-configured `npm run build`, the complete isolated Playwright matrix, the state-free secret scan, and `git diff --check`. Preserve unrelated listeners and stop only the exact preview PIDs started by this slice.

- [x] **Step 2: Stage only intended files and build the review package**

  Stage the spec, plan, `Splash.ts`, `Splash.test.ts`, and `portrait-gate.spec.ts`. Embed `git diff --cached --unified=20` and record the package SHA256.

- [ ] **Step 3: Dispatch one adversarial reviewer**

  Give the reviewer the exact package. Resolve every Critical, High, Medium/Important, accessibility, responsive, interaction, governance, and merge-blocking finding test-first. Regenerate and re-review after every correction.

### Task 4: Land and verify the slice

**Files:**
- Commit only the exact reviewed staged set.
- Add a delivery receipt after production verification through a docs-only PR.

- [ ] **Step 1: Route through `$ca-commit` and `$ca-pr`**

  Record fresh security and migration passes, commit without amend, push, and open one ready PR against `main` with review, mutation, and verification evidence.

- [ ] **Step 2: Require exact-head hosted green and merge**

  Verify the PR head still equals the reviewed commit. Require build/harness, Edge, rendering E2E, CodeQL, and required status contexts to pass before merging under standing authority.

- [ ] **Step 3: Verify deployment and production health**

  Require the Pages run for the merge commit to pass build, current-main verification, deployment provenance, and live smoke. Independently verify HTTP 200, the application mount, and `deploy-meta.json` exact merge SHA/run ID.

- [ ] **Step 4: Persist the receipt and select the next slice**

  Record exact commit, PR, merge, CI, package, mutation, Pages, and production evidence. Merge the docs-only receipt after exact-head green, then SMARTS-select the next remaining adversarial player-experience finding.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current splash/orientation owners. Current source/oracles: `client/src/ui/Splash.ts`, `client/src/ui/Splash.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `559352a96299` (feat(mobile): unify landscape handoff). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
