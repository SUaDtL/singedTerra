# Authenticated Production Diagnostics Final Review Package

**Frozen:** 2026-08-11
**Branch:** `codex/authenticated-diagnostics`
**Base and current HEAD before commit:** `a0b64cbf2392013e9c69b7c6eb4a0aa70036b613`
**Review target:** the complete working-tree diff plus every untracked file named below

## Governing artifacts

- Spec: `.codearbiter/specs/authenticated-production-diagnostics.md`
- Plan: `.codearbiter/plans/authenticated-production-diagnostics.md`
- ADR: `.codearbiter/decisions/0016-allowlisted-authenticated-production-diagnostics.md`
- Decision audit: `.codearbiter/decisions/decision-log.md`
- SMARTS audit: `.codearbiter/sprint-log.md`
- Sprint evidence: `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-sprint-evidence.md`
- Project vocabulary: `.codearbiter/CONTEXT.md`
- Security boundary: `.codearbiter/security-controls.md`
- Approved H-18 exception: final line of `.codearbiter/overrides.log`

## Test-first evidence

- Runner contract/lifecycle RED preceded `ProductionDiagnostics.ts`; hostile envelopes, exact response shape, no-body invocation, timeout, single-flight, readiness cancellation, stale work, disposal, and recursively frozen sanitized receipts are covered in `client/src/client/ProductionDiagnostics.test.ts`.
- Carson's first final review blocked merge. New failing regressions then proved same-auth receipt loss and one-check-only execution. `ProductionDiagnostics.multiCheck.test.ts` now uses a test-only second compile-time descriptor to prove frozen-snapshot order, independent validation, complete receipt cardinality, descriptor-driven rendering, per-check timeout isolation, and rejection of a late completion from a prior descriptor index.
- Carson's second final review blocked merge because ordered descriptors still shared one validator/projector. A materially different two-contract RED now proves each immutable descriptor owns its closed validator and sanitized public-details projector, both contracts can PASS with distinct receipts, and malformed secondary output fails only its owning check.
- Carson's third review returned MERGE ELIGIBLE. Its sole Low is also closed: exported public-details types now derive from descriptor projector return types, eliminating a separate type-model edit when a reviewed production check is added.
- T-11 is now accepted and T-12 delivery is in progress. This final freeze includes only that audit/status transition after the zero-finding verdict.
- Modal RED preceded `ProductionDiagnosticsView.ts`; state copy, accessibility, close/Escape, live status, callback containment, receipt copying, and post-rerender focus resolution are covered in `client/src/ui/ProductionDiagnosticsView.test.ts`.
- Lobby integration RED was 8 failed / 13 passed before `Lobby.ts` consumed the fourth diagnostics factory. Activation, inactive behavior, async factory, account handoff, one-shot autorun, manual run/copy, stale work, URL cleanup, disposal, and live focus are covered in `Lobby.account.test.ts` and `Lobby.anonymousAccount.test.ts`.
- Browser containment is covered by `e2e/diagnostics.spec.ts`: exact inactive/malformed activation, no navigation entry, stable inner-card geometry, inert layering, hit testing/z-order, bounded scroll ownership, non-vacuous anonymous Account replacement, no reload, URL preservation, and exact `Local Battle` focus.

## Fresh verification evidence

- `npm run check` — GREEN.
- `npm run check:edge` — GREEN, 310 passed.
- `npm run test:client` — GREEN, 156 files / 1,351 tests.
- `npm run build` — GREEN.
- `npm run audit:deps` — GREEN, 0 vulnerabilities.
- Isolated production-bundle Playwright matrix — GREEN, 12/12 across `desktop-fine`, `small-window`, and `pixel-touch`.
- `git diff --check` — GREEN; line-ending conversion warnings only.

## Final-diff freeze

The reviewer MUST inspect `git diff --binary` and all untracked files directly in this worktree. The tracked patch excluding this package had SHA-256 `52ebfeac34b81cb82e38684b3e7aa3988355b234e185d5d1920f52f874c89e74` at the final pre-commit freeze. Its tracked summary was 1,042 insertions and 12 deletions across nine files.

Untracked file SHA-256 manifest at freeze:

- `557a8733d42c3c6dc8b6b9b38d76d04c966211b52b9429b478d5eda77b57c221` `.codearbiter/decisions/0016-allowlisted-authenticated-production-diagnostics.md`
- `aaea00ff685d00f596c4db8f96dd7ae5e78e3bc4a2d34fc0c1f4d12d7e1b2f27` `.codearbiter/plans/authenticated-production-diagnostics.md`
- `0720cf8460ef0befe5ba0683138d1449916f1528df7a6b3e6caac90f6445aa5d` `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-sprint-evidence.md`
- `a151dc7fda22671024a8d8275dd102b6251cac0f3514ecb157dae34a7cbabadc` `.codearbiter/specs/authenticated-production-diagnostics.md`
- `56528315420ac8ced40d775b8dc056303133446b3e480abd4c0332e069a792e3` `client/src/client/ProductionDiagnostics.multiCheck.test.ts`
- `4a97e0290779853bebcb8f4d5b4df7fb21aebe8a5643891dcda39de0f62a2598` `client/src/client/ProductionDiagnostics.test.ts`
- `cca3c5b1dc51e121068e187e95fa939ef0b64d6c88a160254e8f82d4cd6a3345` `client/src/client/ProductionDiagnostics.ts`
- `888c6e399ccd94fc2e0c3d128606a495cd244c94a790a41d40dc6ebbfb02fe33` `client/src/client/ProductionDiagnosticsRegistry.ts`
- `2b2428dbfc80a123a7566134c4e78fde694c7c43a4a405600ed5278e171c05cb` `client/src/ui/ProductionDiagnosticsView.test.ts`
- `7a9617bd1e4bfcda699032b5f09addbb60053033aacdb8e978b9cdd59441d153` `client/src/ui/ProductionDiagnosticsView.ts`
- `9815a51c818a6c45a8dc3f32353351c3d942f5c32a4721fe425fab3ee683c04b` `e2e/diagnostics.spec.ts`

## Adversarial review contract

Review as if no prior approval implies correctness. Attack authorization confusion, credential/token leakage, generic request capability, exact response validation, timeout/single-flight races, stale async completion, receipt sanitization, modal/inert/focus lifecycle, query activation and cleanup, inactive-player regression, rendered overlap/reflow/overflow, test mutation resistance, governance/audit integrity, and scope creep into backend/data/progression/gameplay. Report Critical, High, Medium, Low, and an explicit merge-blocking verdict. Every Critical, High, and other merge blocker must be resolved and the package re-frozen before commit.

## Delivery boundary

This package does not claim AC-13. After a no-blocker verdict, the exact reviewed diff must pass the commit gate, become a PR, clear hosted CI on the exact reviewed PR head, merge, publish through GitHub Pages, and produce a PASS receipt from the existing signed-in production browser session without token extraction.
