# Verified Operations Cycle sprint evidence

**Date:** 2026-08-15
**Initiative:** `career.initiative.0001`
**Status:** local GREEN; delivery and production acceptance open

## Browser contract

Task 4 adds production-bundle browser coverage for the authenticated cycle:
First Strike briefing, restored active controller order, terminal result,
focus-owned `Brief next order`, Battery return, receipt-rotated Fire for Effect
briefing, and a fresh descriptor with a visible `0 / 6` budget. The same matrix
also asserts Field Order absence from ordinary hot-seat, anonymous local, Quick
Duel, and a running online match.

The causal RED was a temporary mutation of the accepted-report handoff guard.
With that one guard inverted, desktop-fine, pixel-touch, and small-window all
failed at the same player-visible boundary: `#lobby` stayed hidden after
`Brief next order`. The mutation was restored, `client/src/main.ts` returned to
an empty diff, and the nine new matrix cases passed.

The first full browser run found one stale test expectation for the superseded
abbreviated First Strike HUD copy. The assertion was updated to the approved
shared Field Order wording; no production copy, geometry threshold, or
verification contract changed.

## Fresh local gates

- Focused new browser matrix: 9 passed, 0 failed.
- Complete Playwright matrix: 325 passed, 38 intentional skips, 0 failed.
- Full client suite: 163 files and 1,619 tests passed.
- `npm run check`: exit 0, including strict typecheck and the complete
  deterministic harness chain.
- `npm run check:edge`: 352 passed, 0 failed.
- Standalone `npm run typecheck`: shared and client exited 0.
- Diff/whitespace checks and the state-free secret scan passed before the Task 4
  commits.

## Boundary

Task 4 changes browser coverage and governed evidence only. It adds no Auth,
schema, migration, Edge Function, protocol, award, dependency, account-summary,
or runtime product change. Adversarial review, PR creation, exact-head hosted
CI/CodeQL/Pages, deployment decision, and a bounded authenticated production
receipt remain open and must not be inferred from this local evidence.
