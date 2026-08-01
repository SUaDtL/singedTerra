# Lobby Hot Seat View Builder Implementation Plan

**Goal:** Extract `Lobby.renderHotSeatTab()` into a directly tested stateless builder with zero observable behavior change.

**Architecture:** Lobby owns state/effects and supplies detached shared nodes plus callbacks. The builder composes the existing Hot Seat DOM only.

## Constraints

- Approved seven-file surface only; no pre-existing test changes.
- Preserve text, classes, styles, DOM order, callback timing, validation, and ownership.
- No CSS, dependency, backend, auth, crypto, migration, or workflow change.

### Task 1: Baseline

- [x] Install dependencies; run pre-existing Lobby tests, 15-case browser matrix, and coverage.
- [x] Record `Lobby.ts` baseline above the stage-1 60% line/branch floor and prove clean scope.

### Task 2: TDD extraction

- [x] Add direct tests for selector options/routing, shared-node order/crowded classes, validation, Start states, and callbacks.
- [x] Observe behavioral RED against a compile-only builder shell while pre-existing tests stay green.
- [x] Move Hot Seat DOM mechanically into `buildLobbyHotSeatView()` and make `renderHotSeatTab()` a thin adapter.
- [x] Pass direct/focused/browser/typecheck gates without modifying pre-existing tests.

### Task 3: Verify and deliver

- [x] Pass full deterministic, client, Edge, Playwright, coverage, build, audit, secret, Pages-base, and diff gates.
- [x] Clear one adversarial review with every Critical/High/Medium/merge blocker corrected.
- [ ] Commit, PR, exact-head CI, logged merge authority, fresh final-head CI, squash merge, Pages provenance, and live smoke.
- [ ] Select the next bounded #129 view extraction.
