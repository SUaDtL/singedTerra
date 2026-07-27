# Turn-Start Wind Gusts Implementation Plan

**Goal:** Turn each new authoritative wind value into a brief, bounded,
directional sky transition without defeating idle rendering.

## Task 1: Pin the wind-to-visual contract

- [x] Add a pure wind-gust profile oracle and run RED.
- [x] Prove calm/non-finite rejection, sign, monotonic scaling, exact bounds,
  and immutability.

## Task 2: Integrate the real turn/render route

- [x] Add one renderer-owned gust with exact turn dedupe, reset, and lifetime.
- [x] Draw fixed procedural ribbons after sky and before terrain with balanced
  Canvas state and bounded wrapping.
- [x] Prove reduced motion, first observation, round/turn isolation, exact
  idle-gate liveness, directional movement, and draw order.
- [x] Tune calm/light/strong/recovery states in a real browser and exercise a
  live hot-seat turn transition.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene,
  and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [ ] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages
  deployment.
