# Commander Career Loop - Milestone 1 Adversarial Review

**Date:** 2026-08-10
**Reviewer:** Newton the 2nd (`019feea3-9f0d-74e0-91e0-2779e1389af4`)
**Initial package diff blob:** `5fd081443b8b032d851bfe307054a79111e8a5df`
**Initial verdict:** BLOCK

## Findings and dispositions

1. **HIGH - delayed Account A result could become an Account B receipt.** Resolved. `AccountSession` captures both account generation and profile ID and rejects before and after refresh if either identity changes. The adversarial test uses Account B with the exact XP delta that fooled the previous value-only guard.
2. **MEDIUM / merge-blocking - promotion browser oracle did not use each real project viewport.** Invalidated by ADR-0013/0014 and removed. The oracle fabricated an unreachable casual promotion path.
3. **MEDIUM / merge-blocking - rank and promotion copy fell below a physical legibility floor.** Partially superseded. Reachable verified rank typography now clears the eight-physical-pixel browser floor; promotion presentation is deferred.
4. **MEDIUM / merge-blocking - no causal coverage for a promotion earned after a loss.** Invalidated. Casual win and loss receipts are now both required to make no promotion claim.
5. **MEDIUM / merge-blocking - the spec promised insignia but shipped only a textual code.** Resolved for reachable verified rank surfaces. The dossier and Player Record use one stable visible insignia with an accessible label; no receipt renders rank.

## Superseding coverage-audit note

The earlier promotion-browser resolution above was invalidated by the final coverage audit:
its browser oracle fabricated unreachable promotion markup. Because ADR-0013 and ADR-0014
freeze verified awards and prohibit casual rank claims, the correction removes that oracle
instead of manufacturing a production test bypass. Current browser coverage exercises only
reachable account rank and ordinary After Action Report behavior. Promotion presentation is
deferred until a verified award path exists.

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
