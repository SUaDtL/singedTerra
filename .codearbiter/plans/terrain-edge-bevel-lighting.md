# Terrain Edge Bevel Lighting Implementation Plan

**Goal:** Make cached hills and deformation read as volume with bounded
directional edge light and no idle-frame cost.

## Task 1: Pin the pure bevel contract

- [x] Add a pure bounded terrain-bevel oracle and run RED.
- [x] Prove exact direction, falloff, enclosure, frame-boundary, malformed,
  immutability, and source-nonmutation behavior.

## Task 2: Integrate the cached terrain texture

- [x] Blend bevel intensity into terrain RGB only during version-triggered
  rebuilds while preserving alpha, strata, depth ramp, and caching.
- [x] Prove synthetic crater-wall contrast, unchanged interior/alpha/source,
  and no extra per-frame work.
- [x] Compare natural terrain and fresh craters in a real browser for depth,
  banding, edge cleanliness, and gameplay readability.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene,
  and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [x] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages
  deployment.
