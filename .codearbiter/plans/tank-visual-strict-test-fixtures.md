# Tank Visual Strict Test Fixtures Implementation Plan

> **For agentic execution:** Follow sequentially. Preserve visual assertion semantics; compiler failure is the primary RED.

**Goal:** Add seven tank-visual suites to the enforced strict-test set and close their 31 indexed-fixture findings.

**Architecture:** Extend the explicit include list; use assertion-fatal local guards and tuple narrowing only in target suites. Keep production and complete compile unchanged.

### Task 1: Extend enforcement and capture RED

- [x] Add the seven tank-visual suites to `tsconfig.tests-strict.json`.
- [x] Capture exact RED: 8 + 8 + 5 + 4 + 3 + 2 + 1 findings; prior migrated suites remain zero.

### Task 2: Migrate tank visual fixtures

- [x] Replace exact unchecked accesses with causal guards, tuples, or narrowed lookups.
- [x] Run the strict migrated project GREEN.
- [x] Run all seven focused suites and preserve 57 tests.
- [x] Prove the full strict remainder is 69 findings across 17 files, with zero migrated errors.

### Task 3: Verify, review, land, and deploy

- [x] Run full local repository gates.
- [x] Obtain the single adversary's exact-package and coverage verdict; fix all Critical, High, Medium, and merge blockers.
- [ ] Pass commit/PR gates, exact-head hosted CI, standing-authority squash merge, deployment provenance, and live smoke.
- [ ] Update issue #70 and select the next bounded cell.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Superseded temporary compiler project. Current source/oracles: `client/tsconfig.json`, `client/src/renderer/TankPartArt.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `8adaa7cda180` (test(client): enforce tank visual fixture bounds (#262)). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
