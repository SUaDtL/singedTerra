# Heavy Impact Hit-Stop Implementation Plan

**Goal:** Add a two-render-frame pre-impact hold for large detonations without
pausing or mutating deterministic simulation.

## Task 1: Pin the finite presentation policy

- [x] Add a pure hit-stop policy oracle and run the focused test RED.
- [x] Prove radius threshold, exact frame count, reduced-motion suppression, and
  malformed-input fallback.

## Task 2: Integrate the real renderer route

- [x] Admit one hold from the largest new explosion in a frame.
- [x] Preserve the prior canvas and freeze renderer-owned effect aging for two
  renders, then release into the existing impact package.
- [x] Prove small/reduced-motion pass-through, no duplicate admission,
  `isAnimating` liveness, and reset cleanup.

## Task 3: Review, verify, and land

- [x] Resolve every Critical, High, Medium, Important, coverage, and merge-blocking
  finding from the designated adversary.
- [x] Run focused tests, client suite, repository checks, Edge tests, build,
  rendering E2E, dependency audit, diff hygiene, and state-free secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [ ] Merge only after exact-head hosted CI/CodeQL and final adversarial review;
  then prove exact-SHA Pages deployment and live smoke.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current implementation. Current source/oracles: `client/src/renderer/impactHitStop.ts`, `client/src/renderer/impactHitStop.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `8d8b8c27517b` (feat(renderer): add heavy impact hit-stop (#273)). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
