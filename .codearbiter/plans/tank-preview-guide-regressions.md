# Tank Preview and Launch Guide Regression Plan

## Task 1: Pin both regressions in RED

- [x] Add focused guide tests requiring every rendered sample to remain on the
  muzzle ray across representative angles and powers.
- [x] Add catalog tests requiring tight source crops, distinct destination
  geometry, a layered side-view stack, and exact barrel mounts.
- [x] Capture the focused failing evidence before production edits.

## Task 2: Repair composition and direction

- [x] Replace padded full-cell sampling with measured per-kit component crops
  and tuned destination geometry.
- [x] Preserve shared barrel pivot and muzzle geometry for all four kits and
  mixed loadouts.
- [x] Remove the decorative guide flourish while preserving its bounded,
  power-responsive length and non-authoritative semantics.

## Task 3: Prove the visible result

- [x] Update causal browser probes to use catalog crops and variable part
  dimensions.
- [x] Prove complete and mixed Garage silhouettes are connected, vertically
  layered, distinct, and fitted across supported viewports.
- [x] Prove the complete canvas guide projects straight from the visible barrel
  in a live hot-seat game.

## Task 4: Review, verify, and deliver

- [x] Resolve all Critical and High findings plus SMARTS-selected valuable
  lower-severity findings from one adversarial review.
- [x] Run focused tests, deterministic checks, client coverage, Edge tests,
  production build, full E2E, runtime audit, diff hygiene, and secret scan.
- [ ] Commit through the governed gate, open a ready PR, prove exact-head hosted
  CI and CodeQL green, merge, deploy Pages, and verify the public game.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current authored preview and guide owners. Current source/oracles: `client/src/renderer/TankPartArt.ts`, `client/src/renderer/aimGuide.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `d2a547618ac5` (fix: restore tank silhouettes and straight aim guide (#219)). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
