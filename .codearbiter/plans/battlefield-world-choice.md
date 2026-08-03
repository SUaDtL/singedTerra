# Implementation plan: battlefield world choice

## 1. Establish the closed contract

- Add `BattlefieldWorldId` and a fail-closed normalizer in a shared/client
  presentation contract without importing renderer code into `shared/`.
- Extend `GameOptions`, lobby settings, `RoomOptions`, `StoredOptions`, and
  the Edge validation/normalization paths with the optional identifier.
- Write contract tests for valid ids, `automatic`, missing values, and hostile
  values.

## 2. Add test-first lobby wiring

- Add RED tests for hot-seat and online controls, request body serialization,
  room response parsing, and rematch config preservation.
- Add the world choice to the existing advanced settings UI with Automatic as
  the default and no new screen or dependency.
- Pass the selected value through `LobbyConfig` and `buildClientEngineOptions`
  while keeping it outside `GameEngine` physics inputs.

## 3. Make renderer consumption explicit and safe

- Add a renderer selection seam accepting an optional world id.
- Prefer the explicit catalog entry when valid; otherwise use the existing
  terrain-derived selection.
- Add tests proving explicit selection is stable, automatic preserves the old
  hash-based result, and terrain mutation cannot switch a frozen world.

## 4. Verify and review

- Run focused RED tests before implementation, then the focused GREEN suite.
- Run `npm run typecheck`, `npm run check`, `npm run check:edge`,
  `npm run test:client`, `npm run build`, `git diff --check`, and the staged
  codeArbiter secrets scan.
- Give Euler the complete review package: this spec, this plan, the sprint
  log, task board, tests, and final diff. Resolve every Critical, High, and
  merge-blocking finding before the PR.
- Require exact-head hosted CI, Edge tests, CodeQL, E2E, and CodeRabbit green
  before merge. Deploy only the client if the diff remains migration- and
  Edge-free, then verify production assets.
