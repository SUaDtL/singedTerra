# Hosted Verified Replay Probe Implementation Plan

**Status:** Approved under the maintainer's standing bounded-sprint authority on 2026-08-10
**Spec:** `.codearbiter/specs/verified-replay-hosted-probe.md`

## Global constraints

- Work test-first: each implementation task begins with the named failing test and preserves the RED output in the sprint evidence report.
- No client-selected replay config or transcript and no player, match, verification, progression, rank, reward, or entitlement writes.
- Keep `verify_jwt = false` and validate exactly one strict Bearer credential through Supabase Auth in the handler.
- Preserve all existing `withCors` behavior and every deterministic replay ceiling.
- No migration and no new dependency.
- The final adversarial reviewer receives the spec, this plan, sprint evidence, tests, and final diff.

## Acceptance-criterion ledger

- **AC-01:** A `withCors` handler configured for no-body mode returns 400 and cancels a supplied body before its wrapped handler runs, while an absent body reaches the handler and all existing JSON/optional-body tests remain unchanged.
- **AC-02:** `verified_replay_probe` returns 401 for a missing, malformed, duplicated, or Supabase-rejected Bearer credential and invokes neither replay fixture.
- **AC-03:** With a Supabase-accepted Bearer credential and no body, the probe returns exactly probe version 1, engine version 1, ruleset version 3, and the pinned deterministic results for `maximumLifecycle` and `maximumTurn`.
- **AC-04:** The production fixture module reaches the accepted limits exactly: `maximumLifecycle` consumes 15 actions and 448 total ticks, while `maximumTurn` consumes 198 ticks in one turn; the existing workload test imports these fixtures so endpoint and ceiling evidence cannot drift independently.
- **AC-05:** The handler performs no table, RPC, or persistence operation and returns no account id, credential, timing, progression, rank, reward, entitlement, or request-controlled field; only Supabase Auth validation and the outer operational rate-limit wrapper may access the service client.
- **AC-06:** Any replay exception returns status 500 with `{ "error": "probe_unavailable" }`; operational logging is bounded to the probe stage and safe replay error code and does not contain the Bearer token, authenticated user id, stack, or raw exception message.
- **AC-07:** `supabase/config.toml`, the shared limiter tests, and `security-controls.md` explicitly register `verified_replay_probe` as an account-authenticated, no-award, 10-per-minute function with no domain-state writes.
- **AC-08:** After exact-head hosted CI and merge, deploying only `verified_replay_probe` requires no migration; production returns the generic 401 contract without a valid account Bearer and returns both pinned deterministic fixture results with a Supabase-accepted account Bearer.

## Ordered task table

| ID | Paths | Verification | Maps to | Covers | Depends on | Status |
|---|---|---|---|---|---|---|
| T-01 | `supabase/functions/_shared/mod.test.ts` | Add no-body wrapper tests, then run `deno test --allow-env supabase/functions/_shared/mod.test.ts`; capture the initial type/test failure before implementation. | TDD obligation O-01: request body rejected before handler/JSON path | AC-01 | none | ACCEPTED |
| T-02 | `supabase/functions/verified_replay_probe/index.test.ts`, `supabase/functions/_shared/verifiedMatchReplay.workload.test.ts` | Add auth, exact-result, no-write, generic-failure, and shared-fixture tests; run both Deno test files and capture RED caused by missing production modules. | O-02 through O-06: auth, fixed results, ceiling identity, no writes, safe failures | AC-02, AC-03, AC-04, AC-05, AC-06 | none | ACCEPTED |
| T-03 | `supabase/functions/_shared/mod.ts`, `supabase/functions/_shared/verifiedReplayProbeFixture.ts`, `supabase/functions/_shared/mod.test.ts`, `supabase/functions/_shared/verifiedMatchReplay.workload.test.ts` | Implement no-body mode and the two immutable fixtures; both focused Deno suites pass without modifying expected values. | O-01 and O-04: bounded request seam and non-drifting ceiling fixtures | AC-01, AC-04 | T-01, T-02 | ACCEPTED |
| T-04 | `supabase/functions/verified_replay_probe/index.ts`, `supabase/functions/verified_replay_probe/index.test.ts`, `supabase/functions/_shared/mod.ts`, `supabase/functions/_shared/mod.test.ts`, `supabase/config.toml`, `.codearbiter/security-controls.md` | Implement the handler, named 10/min bucket, explicit config, and boundary docs; focused probe tests plus `npm run check:edge` pass. | O-02, O-03, O-05, O-06, O-07: authenticated deterministic no-award endpoint | AC-02, AC-03, AC-05, AC-06, AC-07 | T-03 | ACCEPTED |
| T-05 | `.codearbiter/reports/2026-08-10-verified-replay-hosted-probe-sprint-evidence.md`, `.codearbiter/reports/2026-08-10-verified-replay-hosted-probe-final-review-package.md` | Run dependency audit, `npm run check`, `npm run check:edge`, `npm run test:client`, build, diff/security gates, adversarial review, exact-head hosted CI, merge, deploy only the function, then verify production 401 and authenticated exact response. | O-08: reviewed exact-head delivery and hosted proof | AC-08 | T-04 | PENDING |

## Order and MVP slice

Execution order is T-01 and T-02, then T-03, T-04, and T-05. T-01 and T-02 are independent RED tasks and may be prepared in parallel; T-03 must satisfy both before T-04 wires the endpoint.

**MVP slice:** T-01 through T-04. This is the smallest complete non-awarding hosted probe implementation. T-05 is the mandatory governed delivery and production-proof closeout.

## Bijection proof

- Every acceptance criterion is covered: AC-01 by T-01/T-03; AC-02, AC-03, AC-05, and AC-06 by T-02/T-04; AC-04 by T-02/T-03; AC-07 by T-04; AC-08 by T-05.
- Every task advances at least one criterion: T-01 -> AC-01; T-02 -> AC-02 through AC-06; T-03 -> AC-01/AC-04; T-04 -> AC-02/AC-03/AC-05/AC-06/AC-07; T-05 -> AC-08.
- Negative completeness check: if every AC passed, no in-scope behavior would remain unproven; future transcript parsing, durable verification, awards, UI, and account-to-lobby identity continuity are explicitly out of scope.
