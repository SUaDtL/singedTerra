# Napalm Firelight Bloom Implementation Plan

**Goal:** Turn existing deterministic fire columns into a bounded, pooled
battlefield bloom without adding gameplay or backend state.

## Task 1: Pin the pure pooling contract

- [x] Add a pure firelight-pool oracle and run RED.
- [x] Prove grouping, chunking, life scaling, caps, ordering, malformed inputs,
  duplicates, and source immutability.

## Task 2: Integrate the existing fire pass

- [x] Replace per-cell ember blocks with additive elliptical pool gradients
  before the unchanged flame tongues.
- [x] Prove exact world anchoring, bounded Canvas geometry, compositing/order,
  malformed-surface handling, and state restoration.
- [x] Compare normal napalm in a real browser and pin hot-napalm-scale coverage
  for warmth, banding, readability, and bounded frame cost.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene,
  and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [ ] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages
  deployment.
