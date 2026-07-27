# Armor Hit Bursts Implementation Plan

**Goal:** Give every surviving visible unshielded health drop an immediate,
bounded chassis-local flash and metal-spark response.

## Task 1: Pin the visual envelope

- [x] Add a pure armor-hit profile oracle and run RED.
- [x] Prove damage scaling, exact radius/spark caps, lifetime, and malformed
  input rejection.

## Task 2: Integrate the real health-delta route

- [x] Add coalesced per-tank burst state and bounded Canvas rendering.
- [x] Admit only living visible health drops while preserving existing numeric,
  shield, lethal, buried, and first-observation behavior.
- [x] Prove reduced motion, multi-tank independence, reset/expiry, Canvas
  containment, draw order, and real-render routing.
- [x] Compare light and heavy hits in the real browser.

## Task 3: Review, verify, and land

- [x] Resolve all Critical, High, Important, or coverage findings.
- [x] Run focused tests, full checks/coverage, Edge, build, E2E, diff hygiene,
  and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [ ] Merge only after clean hosted CI/CodeQL, then prove exact-SHA Pages
  deployment.
