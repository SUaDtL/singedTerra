# Authored Explosion Art Implementation Plan

**Goal:** Ship one fail-soft authored nine-frame explosion sheet for conventional
blasts without changing gameplay or erasing special-weapon visual identity.

## Task 1: Validate and contract the asset

- [x] Generate one chroma-key 3×3 source with the built-in image tool.
- [x] Remove the chroma background locally, compress the final transparent WebP,
  and inspect all frames at 48, 96, and 160 logical pixels.
- [x] Add a checked asset contract for dimensions, size, alpha, and cell coverage.

## Task 2: Build the fail-soft painter test-first

- [x] Run focused tests RED for loading, exact dimension validation, failure,
  frame progression, and radius-bounded draw geometry.
- [x] Implement the minimal image painter and return procedural fallback on every
  unavailable or invalid path.

## Task 3: Integrate the real renderer route

- [x] Snapshot authored eligibility when each conventional burst is admitted.
- [x] Keep special families and reduced-motion users on procedural signatures.
- [x] Retain glow, particles, damage, scorch, sound, hit-stop, shake, and kick.
- [x] Prove renderer liveness while the asset is loading and no mid-burst swap.

## Task 4: Review, verify, and land

- [x] Resolve every Critical, High, Medium, Important, coverage, and merge-blocking
  finding from the designated adversary.
- [x] Run focused tests, client suite, repository checks, Edge tests, build,
  rendering E2E, dependency audit, diff hygiene, and state-free secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [ ] Merge only after exact-head hosted CI/CodeQL and final adversarial review;
  then prove exact-SHA Pages deployment and live smoke.
