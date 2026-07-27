# Weapon-Weighted Tank Recoil Implementation Plan

**Goal:** Give every launch a brief, weapon-weighted chassis kick without
changing authoritative tank or projectile state.

## Task 1: Pin the recoil envelope

- [x] Add a pure recoil-pose oracle and run RED.
- [x] Prove opposite-barrel direction, heavy-over-light ordering, bounded peak,
  monotonic recovery, and exact expiry.
- [x] Prove malformed inputs fail closed.

## Task 2: Integrate the real render route

- [x] Add one renderer-owned recoil record on the existing launch edge.
- [x] Apply the pose to only the active visible shooter with balanced Canvas
  state and authoritative projectile/muzzle geometry unchanged.
- [x] Prove reduced motion, reset, missing/dead/buried shooters, and
  `isAnimating` behavior.
- [x] Compare light and heavy launch poses in the real browser.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene,
  and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [x] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages
  deployment.
