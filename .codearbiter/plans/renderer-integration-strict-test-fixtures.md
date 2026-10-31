# Renderer Integration Strict Test Fixtures Implementation Plan

### Enforce and prove RED

- [x] Add ten renderer integration suites to the strict include list.
- [x] Capture exact 29-error RED with prior suites clean.

### Migrate and prove GREEN

- [x] Replace unchecked trace accesses with causal guards, tuples, or narrowing.
- [x] Pass strict compile and all 76 focused tests.
- [x] Prove the full remainder is exactly 40 findings across 7 files.

### Verify and ship

- [x] Pass full local gates and single-adversary coverage review.
- [ ] Commit, open PR, pass exact-head hosted CI, log merge override, and re-pass final-head CI.
- [ ] Squash merge, verify deployment provenance/live smoke, update issue #70, and continue.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Superseded temporary compiler project. Current source/oracles: `client/tsconfig.json`, `client/src/renderer/Renderer.impactMonitor.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `e4414de7bb65` (test(client): enforce renderer integration bounds (#263)). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
