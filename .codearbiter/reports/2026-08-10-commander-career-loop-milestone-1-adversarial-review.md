# Commander Career Loop - Milestone 1 Adversarial Review

**Date:** 2026-08-10
**Reviewer:** Newton the 2nd (`019feea3-9f0d-74e0-91e0-2779e1389af4`)
**Initial package diff blob:** `5fd081443b8b032d851bfe307054a79111e8a5df`
**Initial verdict:** BLOCK

## Findings and dispositions

1. **HIGH - delayed Account A result could become an Account B receipt.** Resolved. `AccountSession` captures both account generation and profile ID and rejects before and after refresh if either identity changes. The adversarial test uses Account B with the exact XP delta that fooled the previous value-only guard.
2. **MEDIUM / merge-blocking - promotion browser oracle did not use each real project viewport.** Resolved. The oracle now uses the supplied project page, preserves its viewport, checks horizontal and vertical ordering, disjointness from title/score/actions/tank, viewport containment, and document overflow.
3. **MEDIUM / merge-blocking - rank and promotion copy fell below a physical legibility floor.** Resolved. Compact typography was raised and browser tests require at least eight physical pixels for every new career identity element.
4. **MEDIUM / merge-blocking - no causal coverage for a promotion earned after a loss.** Resolved. A loss crossing Level 5 receives Artillerist promotion treatment. Temporarily gating promotion on `receipt.won` made this test fail.
5. **MEDIUM / merge-blocking - the spec promised insignia but shipped only a textual code.** Resolved. Every rank now has a stable visible insignia mark and accessible label, rendered in the dossier, Player Record, ordinary receipt, and promotion receipt.

## Correction verification

- Focused client tests: 105 passed.
- Full client tests: 153 files, 1,214 tests passed.
- Deterministic checks: passed.
- Edge tests: 267 passed.
- Coverage: 95.58% lines, 84.01% branches.
- Dependency audit: zero vulnerabilities.
- Corrected focused browser pass: 21 passed, 3 intentional skips.
- Full production-bundle browser matrix: 258 passed, 30 intentional skips.

## Current gate

The corrected exact package must be hash-verified and returned to the same reviewer. Milestone 1 remains blocked until that reviewer returns no Critical, High, or merge-blocking finding.
