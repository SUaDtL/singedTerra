# Jackal Wheeled Tank Kit Implementation Plan

## Task 1: Pin the fourth-family contract in RED

- [x] Extend shared/browser and Deno allowlist tests to require `jackal`, exact
  valid parsing, and unchanged invalid/Foundry fallback behavior.
- [x] Add failing catalog and atlas tests for a fourth 128-pixel row, sixteen
  occupied cells, preserved legacy rows, and distinct wheeled silhouettes.
- [x] Add failing Garage, hot-seat, network, and Edge tests for the preset,
  descriptive labels, four-way cycling, and exact handoffs.

## Task 2: Author and integrate Jackal

- [x] Generate and prepare one transparent authored Jackal row, preserving the
  first three atlas rows exactly and aligning all established mount anchors.
- [x] Append Jackal to the shared and Deno kit allowlists and renderer catalog.
- [x] Add the preset and per-slot labels, then fit the four-preset Garage layout
  across desktop, touch, and small-window viewports.

## Task 3: Prove causal browser and network behavior

- [x] Prove complete and mixed Jackal selections draw through the live authored
  renderer at gameplay scale without affecting deterministic state.
- [x] Prove create, join, update-player, active Realtime, stored roster, and
  rematch paths preserve exact Jackal values.
- [x] Deploy every Edge Function that imports the changed Deno validator after
  the client PR is merged.

## Task 4: Review, verify, and deliver

- [x] Resolve all Critical, High, gameplay, rendering, accessibility,
  performance, security, and coverage findings.
- [x] Run focused tests, deterministic checks, client coverage, Edge tests,
  production build, full E2E, runtime audit, diff hygiene, and secret scan.
- [x] Commit through the governed gate and open a ready PR.
- [x] Prove exact-head hosted CI and CodeQL green, merge under standing
  authority, deploy Pages and affected Edge Functions, and verify public play.
