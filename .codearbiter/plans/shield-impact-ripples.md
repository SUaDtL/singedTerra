# Shield Impact Ripples Implementation Plan

**Goal:** Make absorbed damage feel visible, powerful, and truthful.

## Task 1: Pin the transition

- [x] Add a per-tank shield-delta oracle and run RED.
- [x] Prove first observation, activation, recharge, unchanged state, and zero
  baseline cannot create false impacts.
- [x] Prove overflow may independently retain health-damage feedback.

## Task 2: Implement and tune

- [x] Add the minimum shield-impact state and bounded Canvas treatment.
- [x] Kill and restore trigger, lifetime, geometry, reduced-motion, and reset mutations.
- [x] Compare idle shield, light absorption, and heavy absorption in the real browser.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene, and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [x] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages deployment.
