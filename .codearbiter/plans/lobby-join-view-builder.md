# Lobby Join View Builder Implementation Plan

**Goal:** Extract `Lobby.renderJoinForm()` into a directly tested stateless builder with zero observable behavior change.

**Architecture:** Lobby supplies current values, detached shared nodes, a canonicalizing input callback, and effect callbacks. The builder owns Join-by-Code DOM composition only.

## Constraints

- Approved seven-file surface only; no pre-existing test changes.
- Preserve text, attributes, classes, DOM order, normalization timing, busy state, and callback ownership.
- No CSS, dependency, backend, auth, crypto, migration, workflow, or shared-engine change.

### Task 1: Baseline

- [x] Install dependencies; run focused pre-existing Lobby tests, the 15-case browser matrix, and coverage.
- [x] Record `Lobby.ts` baseline above the stage-1 60% line/branch floor and prove clean scope.

### Task 2: TDD extraction

- [x] Add direct tests for exact structure/order, code attributes/canonicalization, busy state, and Join/Create/Browse routing.
- [x] Observe behavioral RED against a compile-only builder shell while pre-existing tests stay green.
- [x] Move Join DOM mechanically into `buildLobbyJoinView()` and make `renderJoinForm()` a thin adapter.
- [x] Pass direct/focused/browser/typecheck gates without modifying pre-existing tests.

### Task 3: Verify and deliver

- [x] Pass full deterministic, client, Edge, Playwright, coverage, build, audit, secret, Pages-base, and diff gates.
- [x] Clear one adversarial review with every Critical/High/Medium/merge blocker corrected.
- [ ] Commit, PR, exact-head CI, logged merge authority, fresh final-head CI, squash merge, Pages provenance, and live smoke.
- [ ] Select the next bounded #129 view extraction.
