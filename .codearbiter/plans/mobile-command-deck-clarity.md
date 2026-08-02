# Mobile Command Deck Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the ambiguous flat coarse-pointer strip with a grouped, icon-led Touch Command Deck while preserving every input mapping.

**Architecture:** Keep `HUD` as the sole DOM/input presentation owner. Extend the bounded HUD icon catalog, build three semantic pair clusters plus two utilities, and strengthen the existing unit and production-browser contracts. No input-handler or engine behavior changes.

**Tech Stack:** TypeScript 6.0.2, Vitest 4, Playwright/Chromium, existing `lucide` dependency, codeArbiter TDD and commit gates.

## Global constraints

- Existing signed callbacks and repeat cadence are behavioral invariants.
- Fire remains singular in the right-rail primary action.
- Coarse targets stay at least 44 rendered CSS pixels on the installed Playwright `Pixel 5 landscape` descriptor (802x293).
- No backend, deterministic engine, dependency, or network changes.

---

### Task 0: Restore executable harness parity on Windows

**Files:**
- Add: `.gitattributes`

**Interfaces:**
- Consumes: the LF shell-script blobs already committed under `scripts/ci/`.
- Produces: LF worktree bytes even when a Windows contributor uses `core.autocrlf=true`.

- [x] Preserve the focused RED from `edge_ci_retry.mjs`: clean Windows checkout rewrites `run-edge-tests.sh` to CRLF and fake Deno is never invoked.
- [x] Add the repository rule `*.sh text eol=lf`, normalize the exact worktree file, and prove `git ls-files --eol` reports `w/lf` plus the focused executable harness passes.
- [x] Commit the one-file portability fix independently before the HUD implementation.

---

### Task 1: Build and prove the grouped Touch Command Deck

**Files:**
- Modify: `client/src/ui/hudIcons.ts`
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.commandInput.test.ts`
- Modify: `e2e/hud-layout.spec.ts`
- Modify: `playwright.config.ts`
- Verify: `client/src/ui/HUD.firstSalvo.test.ts`
- Verify: `client/src/ui/HUD.mobility.test.ts`
- Verify: `e2e/first-salvo.spec.ts`

**Interfaces:**
- Consumes: existing HUD callback seams and the coarse-pointer overlay.
- Produces: semantic `Aim`, `Power`, and `Drive` groups, explicit directional labels, bounded Lucide icons, and unchanged callback actions.

- [x] Write failing unit assertions for the Touch header/mode, three named groups, explicit child labels, bounded icon identities, unchanged signed callbacks, retained first-salvo targeting, and retained disabled/ARIA-disabled states.
- [x] Write failing Pixel 5 production-browser assertions for group geometry, 44px targets, dock containment, a maximum 78px rendered dock height, non-overlap with visible connection/toast/turn-watch/First Salvo states, and zero document/HUD overflow.
- [x] Extend the bounded HUD icon map with left, right, decrease, and increase symbols.
- [x] Build the grouped deck and responsive styling without changing callback deltas, repeat timing, or Fire ownership.
- [x] Run `HUD.commandInput`, `HUD.firstSalvo`, and `HUD.mobility` plus the Pixel 5 command-deck and First Salvo E2E contracts; expect green.
- [x] Run the complete affected `e2e/hud-layout.spec.ts` Pixel 5 project so command-deck sizing cannot hide overflow in the existing turn-console and Arsenal paths.

### Task 1.5: Preserve compact Garage touch targets on the real Pixel profile

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Modify: `e2e/tank-garage.spec.ts`

**Interfaces:**
- Consumes: the existing coarse compact Lobby controls and 24-CSS-pixel Garage target contract.
- Produces: selector-labelled target failures and fitted 50-logical-pixel swatches and closed Garage triggers under the 0.488 Pixel stage scale.

- [x] Reproduce the hosted RED at 21.484375px swatches and 23.4375px closed Garage triggers across two- and four-player compact states.
- [x] Scope the correction to coarse compact Lobby CSS without changing the open editor, desktop, wide touch, HUD, or game input.
- [x] Run the complete Pixel Garage project, complete Pixel HUD project, desktop Garage and spotlight coverage, Garage units, full client tests, typecheck, repository harnesses, and secrets scan; expect green.

### Task 2: Verify and ship

**Files:**
- Append: `.codearbiter/sprint-log.md`
- Append when authorized: `.codearbiter/overrides.log`

- [x] Run `npm run check`, `npm run test:client`, `npm run check:edge`, `npm run build`, and `npm run audit:deps`.
- [x] Run `npx playwright test e2e/hud-layout.spec.ts --project=pixel-touch --workers=1` and require the complete affected-browser suite green.
- [x] Run `npx playwright test e2e/tank-garage.spec.ts --project=pixel-touch --workers=1` and require all compact Garage target and stage-fit contracts green.
- [x] Run state-free secrets and protected-log prefix proofs.
- [x] Obtain the designated adversarial review and correct every Critical, High, Medium, and merge-blocking finding.
- [x] Commit through `$ca-commit`, open the PR, and require hosted CI green on the exact current head.
- [ ] Under standing authority, log the PR-specific merge receipt, re-pass exact-head CI, squash merge, and verify Pages provenance plus live smoke.
