# Compact Pre-game Command Legibility Sprint Evidence

Task: `ux.pregame.0004`
Base: `d31810fe3feb7eb484f0d1cefa98a0a35e6c37b3`
Status: implementation and final adversarial review GREEN; delivery pending

## Recorded intent and SMARTS

- User intent: continue the complete pre-game UX overhaul and repair previously
  identified broken visual layering rather than treating the old adversarial report
  as a reason to skip it.
- Production evidence: at 1024x599 the live shell rendered route/support labels at
  roughly 8-11 physical pixels and showed the decorative card preview plane beneath
  the real Vehicle Bay.
- Selected: compact-only lobby typography/hierarchy correction plus removal of the
  duplicate plane.
- Rejected: border-only cleanup (insufficient player outcome) and global stage-scale
  rewrite (broader HUD/gameplay risk, previously deferred).
- SMARTS strength: strong; confidence: high; intent: standing improvement goal plus
  live production evidence and `ux.pregame.0001` / `ux.menu.0002`.
- Governing records: conform to ADR-0004. No Auth, trust-boundary, dependency,
  migration, or accepted-ADR variance.

## TDD ledger

- RED attempt 1 was rejected as evidence: local Playwright reused an unrelated
  service already listening on port 4173, so `#lobby` never mounted.
- The production bundle was rebuilt and served on isolated port 4175 without
  touching the unrelated listener.
- Valid RED: `small-window` failed because `getComputedStyle(card, '::before').content`
  returned `""` instead of `none`, proving the duplicate generated plane exists.
- Follow-on RED quantified protected text at 4.9-11.7 physical pixels. The first
  compact correction passed its focused oracle but full-matrix testing caught
  expanded Hot Seat launch below the stage. Narrowing the large setup title to
  first-contact summaries reduced but did not eliminate the Pixel deficit.
- Initial SMARTS auto-decision: keep the mode rail visible as the compact
  route-switching surface while hiding its Quick Duel child when Hot Seat
  customization is open. The adversarial review later rejected the hidden action;
  the final implementation retains Quick Duel and uses inverse-zoom sizing.
- Visual review caught compact Vehicle Bay ellipsis after numeric GREEN. A new
  overflow oracle failed on `Mobility` and `Armor Hull`; the compact grid now uses
  its available width and a sans part-value face while coarse-pointer sizing retains
  the 10px physical floor.
- Mutation proof: restoring `lobby-card::before` failed on both routes with generated
  content `""`; reducing protected operational type to 14 logical pixels failed all
  12px physical-size assertions at 8.61px. Both mutations were reverted.
- The first complete browser matrix exposed five causal regressions: convoy overlap,
  Pixel Online overflow, and an unreachable route tab. Geometry-guided corrections
  moved the compact convoy down, retained the route rail, and used a coarse-pointer
  two-column Online setup with one-row actions. Focused Garage/Online regression
  coverage then passed: 23 passed, 1 expected desktop skip.
- Initial adversarial final review BLOCKED on three merge-blocking findings: the
  customization state hid Quick Duel, shrank compact route targets below 24px,
  and contradicted the staged secret-scan status. A new browser test failed on
  both compact profiles before correction. The implementation now retains Quick
  Duel and derives a logical command-choice height from the actual stage zoom;
  Quick Duel and both route tabs clear a 24px physical floor, keyboard route
  switching reaches Online, and the expanded launch action remains contained.
- Corrected compact/pre-game matrix: 30 passed, 3 expected desktop skips.
- Corrected exact all-browser non-live matrix at eight workers: 262 passed,
  32 expected skips, 0 failures in 50.7 seconds. A prior 16-worker run's lone portrait focus timeout
  passed immediately in isolation and did not recur in the bounded-concurrency run.
- Live local production-bundle review at 1024x599 confirmed one preview plane,
  readable Hot Seat and Online hierarchy, complete `Mobility` and `Armor Hull`
  labels, reachable actions, and no document overflow.
- The corrected repository gates remain green: client 150 files / 1,171 tests;
  deterministic/type checks green; Edge 267 passed / 0 failed; production build
  green; dependency audit 0 vulnerabilities; coverage 93.40% statements, 83.89%
  branches, 87.54% functions, and 95.41% lines.
- Exact staged state-free secret scan returned `[]` with no findings.
- Corrected adversarial review verified staged hash `f8715da9` and returned PASS:
  no Critical, High, Medium, or merge-blocking findings. Its sole Low finding,
  duplicate acceptance-criterion numbering, is corrected in the final package.
- The `$ca-pr` coverage audit then BLOCKED on one High finding: the 50px CSS
  fallback let physical target assertions pass without proving `main.ts` published
  the inverse-zoom token. The corrected browser oracle directly requires the token
  to equal `ceil(24 / actualZoom)`. Removing the assignment failed both compact
  profiles with `NaN` against expected 50 and 40; restoring it returned GREEN.
- Hosted browser CI on PR #390 exposed deterministic Linux font-metric failures:
  `Mobility` and `Armor Hull` exceeded their compact quarter cells, and compact
  fine-pointer Online setup reached 637px inside a 600px card. The compact
  technical labels now use tighter explicit tracking without reducing font size,
  and the proven two-column Online compaction applies to every compact pointer.
  The focused cross-route set passed 47 with 4 intentional skips; the corrected
  full matrix passed 262 with 32 intentional skips in 49.6 seconds.
- Hosted CI, deployment, and production-health evidence remain pending.
