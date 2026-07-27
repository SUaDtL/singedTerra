# Impact Depth Parallax Implementation Plan

**Goal:** Turn the existing explosion camera recoil into a three-layer depth cue
without changing gameplay or continuous render cost.

## Task 1: Pin the pure camera-layer contract

- [x] Add a pure bounded parallax oracle and run RED.
- [x] Prove exact layer ratios, hostile finite caps, malformed rejection,
  immutability, and source nonmutation.

## Task 2: Separate the renderer layers

- [x] Draw far atmosphere, middle ridges/gusts, and foreground battlefield under
  isolated transforms while preserving geometry and order at rest.
- [x] Prove exact transforms, strict layer order, Canvas restoration, shake/kick
  behavior, reduced motion, and idle-liveness parity.
- [x] Compare rest and impact frames in a real browser, including edge coverage
  and the unshaken HTML HUD.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene,
  and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [x] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages
  deployment.
