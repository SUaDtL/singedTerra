# Atmosphere Visual Strict Test Fixtures Implementation Plan

> **For agentic execution:** Follow sequentially. Preserve visual assertion semantics; compiler failure is the primary RED.

**Goal:** Add wind-gust and cloud suites to the enforced strict-test set and close their 21 indexed-fixture findings.

**Architecture:** Extend the explicit strict-test include list; use assertion-fatal local guards only in the two target suites. Keep production strict and the complete compile unchanged.

### Task 1: Extend enforcement and capture RED

- [x] Add `Renderer.windGusts.test.ts` and `atmosphereClouds.test.ts` to `tsconfig.tests-strict.json`.
- [x] Capture exact RED: 20 + 1 findings; prior migrated suites remain zero.

### Task 2: Migrate atmosphere fixtures

- [x] Replace exact unchecked trace accesses with causal guards or tuples.
- [x] Run strict migrated tests GREEN.
- [x] Run both focused suites and preserve 19 tests.
- [x] Prove full strict remainder is 128 across the remaining files, with zero migrated errors.

### Task 3: Verify, review, land, and deploy

- [x] Run normal typecheck, `npm run check`, `npm run test:client`, build, dependency audit, and diff checks.
- [x] Obtain one exact-package adversarial review and correct every Critical/High/Medium/merge blocker.
- [ ] Pass commit/PR gates, exact-head hosted CI, standing-authority squash merge, deployment provenance, and live smoke.
- [ ] Update issue #70 and select the next bounded cell.
