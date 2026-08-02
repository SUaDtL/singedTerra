# Effects Renderer Strict Test Fixtures Implementation Plan

> **For agentic execution:** Follow sequentially. Preserve visual assertion semantics; compiler failure is the primary RED.

**Goal:** Add four `EffectsRenderer` suites to the enforced strict-test set and close their 28 indexed-fixture findings.

**Architecture:** Extend the explicit strict-test include list; use assertion-fatal local guards and tuple narrowing only in the four target suites. Keep production strict and the complete compile unchanged.

### Task 1: Extend enforcement and capture RED

- [x] Add the shield-impact, armor-hit, muzzle-signature, and terrain-effect suites to `tsconfig.tests-strict.json`.
- [x] Capture exact RED: 10 + 9 + 5 + 4 findings; prior migrated suites remain zero.

### Task 2: Migrate EffectsRenderer fixtures

- [x] Replace exact unchecked effect and draw-trace accesses with causal guards or tuples.
- [x] Run the strict migrated project GREEN.
- [x] Run all four focused suites and preserve 33 tests.
- [x] Prove the full strict remainder is 100 findings across 24 files, with zero migrated errors.

### Task 3: Verify, review, land, and deploy

- [x] Run normal typecheck, `npm run check`, `npm run test:client`, Edge tests, build, dependency audit, and diff checks.
- [x] Obtain the single designated adversary's exact-package and coverage verdict; correct every Critical, High, Medium, and merge blocker.
- [ ] Pass commit/PR gates, exact-head hosted CI, standing-authority squash merge, deployment provenance, and live smoke.
- [ ] Update issue #70 and select the next bounded cell.
