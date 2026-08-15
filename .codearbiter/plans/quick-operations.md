# Quick Operations Plan

**Spec:** `.codearbiter/specs/quick-operations.md`
**Initiative:** `career.initiative.0001`

## Task 1 — Pure operation catalog

- [x] Add failing tests for the complete catalog, stable ids, exact option
  projections, immutable returns, and unknown-id fallback.
- [x] Implement a pure shared-or-client catalog with Standard, Crosswind Range,
  Caldera Run, and Last Light Siege. Use only existing `GameOptions` fields.
- [x] Add a deterministic engine replay/clone regression per non-standard card.

## Task 2 — Quick Duel composition

- [x] Add failing Lobby/view tests for the card chooser, Standard default,
  selected-card briefing, and exact selected options passed into the existing
  Quick Duel start path.
- [x] Implement the chooser as part of the existing deployment flow; do not add
  a modal or duplicate launcher.
- [x] Add failing HUD tests for an inert operation identity in the ledger/report
  and verify all non-Quick-Duel routes receive none.

## Task 3 — Real-browser player loop

- [x] Add desktop, compact, and Pixel RED browser journeys for card selection,
  actual launch, one fire/settle, report identity, and visual containment.
- [x] Implement responsive composition and preserve existing touch target,
  no-scroll, and safe-rail invariants.

## Task 4 — Governed delivery

- [x] Append SMARTS, RED/GREEN, and exact-package evidence to the sprint log.
- [x] Run focused tests, full client, deterministic harnesses, Edge suite,
  typecheck, build, and complete Playwright matrix.
- [x] Give spec, plan, log, tests, and final diff to an adversarial reviewer;
  resolve all Critical, High, and merge-blocking findings.
- [x] Commit, open PR, require exact-head hosted CI/CodeQL/Pages, merge under
  standing authority, verify deployed provenance and one production launch.
