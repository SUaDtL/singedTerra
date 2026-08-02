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
