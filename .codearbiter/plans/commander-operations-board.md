# Commander Operations Board Plan

**Spec:** `.codearbiter/specs/commander-operations-board.md`
**Initiative:** `career.initiative.0001`

## Task 1 — Pure board projection

**Files:**

- Modify `client/src/ui/LobbyHotSeatView.ts`
- Modify `client/src/ui/LobbyHotSeatView.test.ts`

**Implementation decision:** use a small private builder in the existing
`LobbyHotSeatView` composition module rather than a second exported view
module. The existing module already owns the Local Battery DOM and verified
view callback boundary; a new public module would only duplicate that seam.

- [x] Write failing tests for a board projection that accepts only authenticated
  account/profile data plus an existing Field Order, verified controls, and the
  immutable Quick Operations catalog. Assert exact lane order, public copy,
  one verified primary action, and no reward/account-id/session-id leakage.
- [x] Run the focused tests and record RED because the board does not exist.
- [x] Implement a small view builder that composes existing elements and
  callbacks without reproducing rank, order, configuration, or deployment
  logic. Mount it only for the authenticated Local Battle route.
- [x] Run focused tests GREEN.
- [ ] Mutation-check a duplicate verified action, a Quick Operation in the
  verified lane, and an unauthenticated board.
- [ ] Commit the independently testable projection slice.

## Task 2 — Lobby lifecycle composition

**Files:**

- Modify `client/src/ui/Lobby.ts`
- Modify `client/src/ui/Lobby.account.test.ts`
- Modify `client/src/ui/Lobby.quickDuel.test.ts`
- Modify `client/src/main.hotSeatProgression.test.ts`

- [ ] Write failing lifecycle tests that exercise start, resume, abandon,
  expiry, account replacement, and Quick Operation launch from the board.
  Assert all callbacks remain their existing routes and a verified action never
  receives local operation settings.
- [ ] Run the focused lifecycle command and record RED.
- [ ] Wire the board only at the existing authenticated Local Battle
  composition seam; preserve generic Local Battle and online route structures.
- [ ] Run focused tests GREEN, typecheck, and mutation-check that a stale
  account or terminal descriptor cannot leave the board actionable.
- [ ] Commit the lifecycle slice.

## Task 3 — Responsive player proof

**Files:**

- Modify `client/src/ui/Lobby.ts`
- Modify `e2e/pregame-command-shell.spec.ts`
- Modify `e2e/verified-deployment.spec.ts`
- Modify `e2e/quick-operations.spec.ts` when it exists; otherwise extend
  `e2e/quick-duel-pacing.spec.ts`

- [x] Write failing browser contracts at desktop, compact, and Pixel for board
  hierarchy, non-overlap, text/target floors, keyboard focus, verified launch,
  and local-practice launch with no verified-reward language.
- [x] Run the focused browser files and record RED.
- [x] Make only layout/focus corrections needed for the real rendered result.
- [ ] Run focused browser tests GREEN, capture decision-state screenshots, and
  mutation-check an overflow/duplicate-action regression.
- [ ] Commit the responsive proof slice.

## Task 4 — Governed delivery

- [ ] Append SMARTS and every observed RED/GREEN/correction decision through
  the sanctioned append-only sprint log route.
- [ ] Run full client, deterministic, Edge, typecheck, build, and full browser
  gates; give spec, plan, sprint log, tests, and exact diff to an adversarial
  reviewer and resolve every merge blocker.
- [ ] Commit through the CodeArbiter gate, open a PR, require exact-head
  hosted CI/CodeQL/Pages, merge under standing authority, and record deployed
  provenance plus an authenticated production Battery observation.
