# Sandhog Tunneling Weapon Implementation Plan

## Task 1: Pin the missing weapon in RED

- [x] Add a deterministic `sandhog` harness that fails on the absent weapon and
  pins ground-entry, fixed burrow motion, tunnel deformation, endpoint damage,
  bounds, direct-tank impact, turn completion, clone, and replay behavior.
- [x] Add failing shared/client/Edge tests for the exhaustive weapon catalog,
  default inventory, validator allowlists, weapon glyph, projectile profile,
  and burrowing presentation.
- [x] Add failing browser acceptance for real Arsenal selection, command-console
  synchronization, live fire, progressive corridor deformation, and endpoint
  resolution without aim prediction.

## Task 2: Implement the deterministic drill

- [x] Add the Sandhog definition, economy, initial ammo, behavior constants, and
  optional `ProjectileState` burrow marker.
- [x] Convert swept ground impact into fixed-step burrowing, deform one bounded
  tunnel disc per tick, and detonate at the fixed/boundary endpoint.
- [x] Preserve direct tank impact, OOB/wall behavior, settle/burial, damage,
  credits, turn rotation, clone, and replay contracts.

## Task 3: Carry the weapon through presentation and boundaries

- [x] Add the exact Sandhog allowlist value to Edge validation and every
  exhaustive weapon consumer without broadening accepted payloads.
- [x] Add a distinct drill glyph, command/Arsenal/Store identity, projectile
  silhouette/profile, and reduced-motion-safe underground wake.
- [x] Prove the live carved corridor and endpoint blast remain fitted and
  visually readable across desktop, compact touch, and small-window projects.

## Task 4: Review, verify, and deliver

- [x] Resolve all Critical, High, gameplay, determinism, rendering,
  accessibility, performance, security, and coverage findings.
- [x] Run focused tests, root deterministic checks, client coverage, Edge tests,
  production build, full E2E, runtime audit, diff hygiene, and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [ ] Prove exact-head hosted CI and CodeQL green, merge under standing
  authority, deploy Pages, and verify the public Sandhog.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current implementation. Current source/oracles: `shared/src/engine/GameEngine.ts`, `scripts/checks/sandhog.mjs`.

The latest change to this historical plan reachable from `origin/main` is `2ea03d0e3001` (docs(governance): record Sandhog PR handoff). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
