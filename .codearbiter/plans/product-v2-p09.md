# P09 function-hotspot diagnostic implementation plan

The maintainer approved the bounded diagnostic seam in `.codearbiter/specs/product-v2-p09.md` on 2026-09-13.

## Acceptance ledger

- **AC-01:** Disabled mode preserves the accepted R17 path and emits no P09 artifacts.
- **AC-02:** Enabled mode emits 18 bounded raw profiles and one receipt through Playwright output paths.
- **AC-03:** Each sample is bound to profile bytes, scenario identity, candidate identity, long-task observations, and diagnostic-only semantics.
- **AC-04:** Pure analysis validates streams and reports same-origin self time plus descriptive recurrence without a hard dominance threshold.
- **AC-05:** Capture cleanup runs on success and error while preserving the scenario error.
- **AC-06:** Only governance and diagnostic/test paths change; production and accepted R17 artifacts do not.

## Ordered tasks

| ID | Path(s) | Verification | Maps to | Covers | Depends on | Status |
|---|---|---|---|---|---|---|
| T-01 | `e2e/performanceCpuProfile.ts`, `scripts/checks/performance_profile.mjs` | `npx --no-install tsx scripts/checks/performance_profile.mjs` exercises valid and malformed streams, forward timestamp attribution, startup/tail disclosure, zero-width sample counting, interval bounds, exact-origin filtering, ordering, bounded names, and recurrence. | O-04 | AC-04 | none | ACCEPTED after independent-review correction |
| T-02 | `e2e/performance-baseline.spec.ts` | The targeted TypeScript no-emit command from the accepted R17 record passes for the harness and helper; parent browser execution remains T-03. | O-01, O-02, O-03, O-05 | AC-01, AC-02, AC-03, AC-05 | T-01 | ACCEPTED |
| T-03 | `.codearbiter/specs/product-v2-p09.md`, `.codearbiter/plans/product-v2-p09.md`, `e2e/performance-baseline.spec.ts`, `e2e/performanceCpuProfile.ts`, `scripts/checks/performance_profile.mjs`, `test-results/**/p09-*.cpuprofile`, `test-results/**/p09-function-hotspot-diagnostic.json` | `git diff --check`; scoped diff proves no production or accepted artifact changes; parent runs the exact headed command and verifies 18 attached profiles plus the receipt. | O-02, O-03, O-06 | AC-02, AC-03, AC-06 | T-02 | ACCEPTED: 18 profiles and bounded no-change decision independently verified |

## MVP slice

T-01 through T-02 are the implementation MVP. T-03 is the required parent-owned exclusive-browser evidence and scope freeze before P09 can select an optimization or no-change result.

## Bijection

Every AC is covered by at least one task, and every task advances at least one AC. If all criteria pass, the diagnostic seam is complete; the only remaining work is the explicitly separate evidence-driven optimization/no-change decision.

## Accepted outcome

The parent completed the exclusive desktop diagnostic and independent Astra
verification accepted no production optimization for that observed candidate.
The durable archive and limitations are in docs/performance/p09-desktop-diagnostic.md.
The capture-time source binding is retained unchanged; this plan closeout was
recorded after capture and does not relabel that historical source identity.
