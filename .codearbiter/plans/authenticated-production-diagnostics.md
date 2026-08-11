# Authenticated Production Diagnostics Implementation Plan

**Status:** Approved under the maintainer's standing bounded-initiative authority on 2026-08-11
**Spec:** `.codearbiter/specs/authenticated-production-diagnostics.md`

## Global constraints

- Work test-first. Every behavior task records a causal RED before production implementation.
- Use only the existing Supabase singleton and browser-managed session. No credential read, argument, header construction, storage inspection, or secret-bearing output.
- Keep the production registry compile-time, immutable, allowlisted, body-free for `verified_replay_probe`, strictly validated, timeout-bounded, and non-generic.
- Keep diagnostics absent from normal navigation and layered over the lobby without reflow.
- No dependency, Edge Function, migration, database write, progression change, or gameplay behavior change.
- Final review is adversarial and receives the spec, this plan, sprint audit, tests, browser evidence, and exact diff.

## Acceptance-criterion ledger

- **AC-01:** The runner exposes only registered ids, sends no body or manual header, validates the exact successful replay-probe contract, and rejects widened responses.
- **AC-02:** Provider and transport failures collapse to safe codes and no secret-like value enters state, DOM, logs, or copied receipts.
- **AC-03:** Every check is timeout-bounded and single-flight; stale, closed, signed-out, superseded, and disposed work cannot update state.
- **AC-04:** Explicit activation renders a true accessible modal without base-layout reflow; inactive diagnostics are absent and unlinked.
- **AC-05:** Every account-readiness and run-result state has distinct usable UI, including handoff to existing Account sign-in.
- **AC-06:** Autorun waits for authenticated readiness, runs exactly once, and never loops after rerenders or terminal states.
- **AC-07:** Close, Escape, URL cleanup, focus containment, and focus restoration work without reload or motion.
- **AC-08:** Desktop, compact landscape, and supported mobile-landscape layouts align without overlap, reflow, or horizontal overflow.
- **AC-09:** Existing account, lobby, hot-seat, online, anonymous, and no-Supabase behavior is unchanged when diagnostics are inactive.
- **AC-10:** Security controls and project vocabulary define an allowlisted test interface, never an authorization control or generic request runner.
- **AC-11:** Static, audit, type, and deterministic gates prove that the forbidden server, data, dependency, reward, and gameplay surfaces remain untouched.
- **AC-12:** One frozen adversarial package covers the spec, plan, sprint audit, tests, browser evidence, and final diff with no merge blocker remaining.
- **AC-13:** Exact reviewed-head CI, merge, Pages publication, and signed-in Chrome produce a production PASS receipt without credential extraction.

## Ordered task table

| ID | Paths | Verification | Maps to | Covers | Depends on | Status |
|---|---|---|---|---|---|---|
| T-01 | `client/src/client/ProductionDiagnostics.test.ts` | Add exact registry, invocation-shape, validator, and redaction tests; `npm -w @singedterra/client run test -- src/client/ProductionDiagnostics.test.ts` fails because production diagnostics do not exist. | O-01 exact allowlist and safe contract | AC-01, AC-02 | none | ACCEPTED |
| T-02 | `client/src/client/ProductionDiagnostics.test.ts` | Add timeout, single-flight, stale-run, sign-out, and disposal tests; the same focused command fails on missing lifecycle behavior. | O-02 bounded lifecycle | AC-03 | T-01 | ACCEPTED |
| T-03 | `client/src/client/ProductionDiagnostics.ts` | Implement the immutable descriptor and exact validator; focused tests from T-01 pass without weakening assertions. | O-01 exact allowlist and safe contract | AC-01, AC-02 | T-01 | ACCEPTED |
| T-04 | `client/src/client/ProductionDiagnostics.ts` | Implement sequential run state, timeout, cancellation generation, and sanitized receipts; all focused diagnostics tests pass. | O-02 bounded lifecycle | AC-02, AC-03 | T-02, T-03 | ACCEPTED |
| T-05 | `client/src/ui/ProductionDiagnosticsView.test.ts` | Add readiness, running, pass/fail, copy, close, Escape, semantics, and focus tests; `npm -w @singedterra/client run test -- src/ui/ProductionDiagnosticsView.test.ts` fails on the missing view. | O-03 accessible modal behavior | AC-04, AC-05, AC-07 | T-04 | ACCEPTED |
| T-06 | `client/src/client/ProductionDiagnostics.ts`, `client/src/client/ProductionDiagnostics.test.ts`, `client/src/ui/ProductionDiagnosticsView.ts`, `client/src/ui/ProductionDiagnosticsView.test.ts`, `client/src/style.css` | Centralize schema-v1 receipt projection in the runner, implement the modal view and command-deck styles, restore focus through a post-rerender resolver, and keep one vertical scroll owner; focused tests and `npm run typecheck` pass. | O-03 accessible modal behavior | AC-02, AC-04, AC-05, AC-07, AC-08 | T-05 | ACCEPTED |
| T-07 | `client/src/ui/Lobby.account.test.ts`, `client/src/ui/Lobby.anonymousAccount.test.ts` | Add inactive, activation, account handoff, one-shot autorun, URL cleanup, and rerender tests; focused lobby tests fail on missing integration. | O-04 account-aware activation | AC-04, AC-05, AC-06, AC-07, AC-09 | T-06 | ACCEPTED |
| T-08 | `client/src/ui/Lobby.ts` | Integrate diagnostics session and modal into Lobby; `npm -w @singedterra/client run test -- src/ui/Lobby.account.test.ts src/ui/Lobby.anonymousAccount.test.ts` passes. | O-04 account-aware activation | AC-04, AC-05, AC-06, AC-07, AC-09 | T-07 | ACCEPTED |
| T-09 | `e2e/diagnostics.spec.ts` | Add inactive, desktop, compact, and mobile-landscape browser oracles; `npx playwright test e2e/diagnostics.spec.ts` passes with no overlap, reflow, or horizontal overflow. | O-05 rendered containment | AC-04, AC-08, AC-09 | T-08 | ACCEPTED |
| T-10 | `.codearbiter/CONTEXT.md`, `.codearbiter/security-controls.md`, `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-sprint-evidence.md` | Record vocabulary, security boundary, RED/GREEN evidence, and SMARTS decisions; `npm run check`, `npm run check:edge`, `npm run test:client`, `npm run build`, `npm run audit:deps`, and `git diff --check` pass. | O-06 governed boundary proof | AC-10, AC-11 | T-09 | ACCEPTED |
| T-11 | `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-final-review-package.md` | Freeze spec, plan, sprint audit, tests, browser evidence, and full diff; one adversarial reviewer returns no Critical, High, or merge blocker after remediation. | O-07 adversarial merge gate | AC-12 | T-10 | ACCEPTED |
| T-12 | `.codearbiter/plans/authenticated-production-diagnostics.md`, `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-sprint-evidence.md` | Commit through the sanctioned gate, open PR, require exact-head hosted green, merge, verify Pages exact head, and obtain signed-in Chrome PASS from `?diagnostics=1`. | O-08 exact-head production delivery | AC-13 | T-11 | IN PROGRESS |

## Task 1: Contract RED tests

- **Paths:** `client/src/client/ProductionDiagnostics.test.ts`
- **Verification:** Add exact registry, invocation-shape, validator, and redaction tests. `npm -w @singedterra/client run test -- src/client/ProductionDiagnostics.test.ts` must fail because production diagnostics do not exist.
- **Maps to:** O-01 exact allowlist and safe contract.
- **Covers:** AC-01, AC-02.
- **Depends on:** none.

## Task 2: Lifecycle RED tests

- **Paths:** `client/src/client/ProductionDiagnostics.test.ts`
- **Verification:** Add timeout, single-flight, stale-run, sign-out, and disposal tests. The focused command must fail on missing lifecycle behavior.
- **Maps to:** O-02 bounded lifecycle.
- **Covers:** AC-03.
- **Depends on:** Task 1.

## Task 3: Exact descriptor and validator implementation

- **Paths:** `client/src/client/ProductionDiagnostics.ts`
- **Verification:** Implement the immutable descriptor and exact validator. Task 1 tests pass without weakened assertions.
- **Maps to:** O-01 exact allowlist and safe contract.
- **Covers:** AC-01, AC-02.
- **Depends on:** Task 1.

## Task 4: Bounded runner implementation

- **Paths:** `client/src/client/ProductionDiagnostics.ts`
- **Verification:** Implement sequential run state, timeout, cancellation generation, and sanitized receipts. All focused diagnostics tests pass.
- **Maps to:** O-02 bounded lifecycle.
- **Covers:** AC-02, AC-03.
- **Depends on:** Tasks 2 and 3.

## Task 5: Modal-view RED tests

- **Paths:** `client/src/ui/ProductionDiagnosticsView.test.ts`
- **Verification:** Add readiness, running, pass/fail, copy, close, Escape, semantics, and focus tests. `npm -w @singedterra/client run test -- src/ui/ProductionDiagnosticsView.test.ts` fails on the missing view.
- **Maps to:** O-03 accessible modal behavior.
- **Covers:** AC-04, AC-05, AC-07.
- **Depends on:** Task 4.

## Task 6: Modal view, centralized receipt, and command-deck styling

- **Paths:** `client/src/client/ProductionDiagnostics.ts`, `client/src/client/ProductionDiagnostics.test.ts`, `client/src/ui/ProductionDiagnosticsView.ts`, `client/src/ui/ProductionDiagnosticsView.test.ts`, `client/src/style.css`
- **Verification:** Centralize schema-v1 receipt projection in the runner; implement the modal and styles; prove post-rerender focus resolution and one vertical scroll owner. Focused runner/view tests and `npm run typecheck` pass.
- **Maps to:** O-03 accessible modal behavior.
- **Covers:** AC-02, AC-04, AC-05, AC-07, AC-08.
- **Depends on:** Task 5.

## Task 7: Lobby integration RED tests

- **Paths:** `client/src/ui/Lobby.account.test.ts`, `client/src/ui/Lobby.anonymousAccount.test.ts`
- **Verification:** Add inactive, activation, account handoff, one-shot autorun, URL cleanup, and rerender tests. Focused lobby tests fail on missing integration.
- **Maps to:** O-04 account-aware activation.
- **Covers:** AC-04, AC-05, AC-06, AC-07, AC-09.
- **Depends on:** Task 6.

## Task 8: Lobby account-aware integration

- **Paths:** `client/src/ui/Lobby.ts`
- **Verification:** Integrate the diagnostics session and modal. `npm -w @singedterra/client run test -- src/ui/Lobby.account.test.ts src/ui/Lobby.anonymousAccount.test.ts` passes.
- **Maps to:** O-04 account-aware activation.
- **Covers:** AC-04, AC-05, AC-06, AC-07, AC-09.
- **Depends on:** Task 7.

## Task 9: Rendered containment browser proof

- **Paths:** `e2e/diagnostics.spec.ts`
- **Verification:** Add inactive, desktop, compact, and mobile-landscape browser oracles. `npx playwright test e2e/diagnostics.spec.ts` passes with no overlap, reflow, or horizontal overflow.
- **Maps to:** O-05 rendered containment.
- **Covers:** AC-04, AC-08, AC-09.
- **Depends on:** Task 8.

## Task 10: Governed boundary proof

- **Paths:** `.codearbiter/CONTEXT.md`, `.codearbiter/security-controls.md`, `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-sprint-evidence.md`
- **Verification:** Record vocabulary, security boundary, RED/GREEN evidence, and SMARTS decisions. `npm run check`, `npm run check:edge`, `npm run test:client`, `npm run build`, `npm run audit:deps`, and `git diff --check` pass.
- **Maps to:** O-06 governed boundary proof.
- **Covers:** AC-10, AC-11.
- **Depends on:** Task 9.

## Task 11: Frozen adversarial merge gate

- **Paths:** `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-final-review-package.md`
- **Verification:** Freeze the spec, plan, sprint audit, tests, browser evidence, and full diff. One adversarial reviewer returns no Critical, High, or merge blocker after remediation.
- **Maps to:** O-07 adversarial merge gate.
- **Covers:** AC-12.
- **Depends on:** Task 10.

## Task 12: Exact-head production delivery

- **Paths:** `.codearbiter/plans/authenticated-production-diagnostics.md`, `.codearbiter/reports/2026-08-11-authenticated-production-diagnostics-sprint-evidence.md`
- **Verification:** Commit through the sanctioned gate, open PR, require exact-head hosted green, merge, verify Pages exact head, and obtain signed-in Chrome PASS from `?diagnostics=1`.
- **Maps to:** O-08 exact-head production delivery.
- **Covers:** AC-13.
- **Depends on:** Task 11.

## Order and MVP slice

Execution order is T-01 through T-12 in dependency order. T-01 through T-09 form the MVP implementation slice: a complete, locally rendered diagnostics console. T-10 through T-12 are mandatory governance, review, and production delivery, not optional polish.

## Bijection proof

- Every acceptance criterion is covered: AC-01/AC-02 by T-01/T-03/T-04; AC-03 by T-02/T-04; AC-04 through AC-09 by T-05 through T-09; AC-10/AC-11 by T-10; AC-12 by T-11; AC-13 by T-12.
- Every task advances at least one criterion and no task exists only for bookkeeping.
- If all criteria pass, the maintainer has a reusable secret-free production diagnostics console and the authenticated replay runtime is proven through the actual deployed player session.
