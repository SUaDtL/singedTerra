# Projectile Motion Streaks Implementation Plan

**Goal:** Add an immediate bounded velocity ribbon to each live projectile
without changing its existing history trail or deterministic state.

## Task 1: Pin the pure motion contract

- [x] Add a pure motion-streak oracle and run RED.
- [x] Prove direction, near-zero/non-finite rejection, monotonic scaling, exact
  bounds, submunition scale, and immutability.

## Task 2: Integrate the projectile draw route

- [x] Draw one gradient ribbon and bright core after history but before halo.
- [x] Prove first-frame parent/split-child coverage, live velocity consumption,
  draw order, bounded geometry, accent ownership, and Canvas restoration.
- [x] Tune stopped/slow/fast/reverse/split states in a real browser and exercise
  a live hot-seat shot.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene,
  and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [ ] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages
  deployment.
