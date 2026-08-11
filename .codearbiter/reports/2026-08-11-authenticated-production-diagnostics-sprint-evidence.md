# Authenticated Production Diagnostics - Sprint Evidence

This is the recovery ledger for the durable authenticated diagnostics slice. The canonical SMARTS auto-decisions are also appended to `.codearbiter/sprint-log.md`.

## Recorded intent

- SUaDtL explicitly selected a long-term testing interface over a one-use browser-console command on 2026-08-11.
- Conform to ADR-0011: Supabase Auth owns browser account credentials and the client must not expose them.
- Conform to ADR-0015: the hosted replay probe remains bounded, authenticated, and non-awarding.
- Conform to ADR-0016: diagnostics are URL-activated, compile-time allowlisted, exact-schema validated, secret-free, and never a generic request runner.
- Conform to `.codearbiter/security-controls.md`: no credential enters source, logs, URLs, application persistence, DOM, or receipts.
- No `[CONFIRM-NN]` or recorded deferral conflicts with this slice.

## SMARTS decisions

### Build a durable allowlisted console instead of a one-use command - strong - confidence: high - intent: per explicit user direction and ADR-0016

Securable rejects credential-store extraction and arbitrary request composition. Reliable and Testable favor one repeatable application path with exact schemas and browser automation. Maintainable and Scalable favor a small reviewed registry. Available improves because verification no longer depends on manual token handling.

### Activate by explicit query parameter and omit normal navigation - strong - confidence: high - intent: per ADR-0016

Maintainable and Available keep the operator surface reachable in every deployment. Securable and Reliable keep it out of ordinary play while relying on endpoint Auth, not obscurity, for authorization. Testable gets a stable deep link.

### Use a 10-second settlement timeout with generation invalidation - strong - confidence: high - intent: per approved spec

Reliable and Available bound the UI even when Supabase transport stalls. Testable gets deterministic fake-timer coverage. Securable avoids raw abort/error details. The underlying request may finish, but stale completion cannot alter current client state.

### Keep account-to-lobby name continuity as the next slice - strong - confidence: high - intent: per prior user steering and hosted-probe spec

The diagnostics console closes the current authenticated production-proof initiative. Name continuity and the false signed-out prompt are one coherent player-identity outcome and remain next rather than expanding an operations interface into normal lobby behavior.

### Make every lifecycle exit a prompt sanitized result - strong - confidence: high - intent: per AC-03 adversarial review

Reliable and Testable reject orphaned or ambiguous promises. An active repeated call resolves `run_in_progress` without changing the active state; timeout resolves `timeout`; sign-out resolves `not_authenticated`; disposal resolves `disposed`. Securable keeps every outcome bounded and secret-free. Generation invalidation suppresses every late resolve or rejection.

### Publish exact account readiness and make sign-out recoverable - strong - confidence: high - intent: per AC-05 lifecycle review

Available and Reliable require the operator view to distinguish loading, unavailable, anonymous, authenticated-error, signed-out, and ready states without stale receipts. Sign-out invalidates current work but a later authenticated transition returns the runner to idle; only disposal is terminal. This keeps the diagnostics lifecycle compatible with the existing account sign-in handoff.

### Require an explicit focus-return target and same-frame Run guard - strong - confidence: high - intent: per AC-07 modal review

Available and Testable favor a connected focus-return target supplied by Lobby because URL activation may have no natural opener. The view restores it on every close. Reliable adds synchronous button disable before the Run callback while the runner remains the authoritative single-flight boundary. Authenticated-error uses account review wording rather than a false sign-in handoff.

### Centralize receipt projection and resolve focus after Lobby rerender - strong - confidence: high - intent: per Task 6 adversarial review

Maintainable and Securable reject three copies of the receipt schema, so the runner becomes the sole schema-v1 projector and the view only renders its frozen result. Reliable resolves a connected focus target after `onClose` rerenders Lobby rather than retaining a node that may be disconnected. Available keeps the overlay surface as the sole vertical scroll owner; rendered containment remains mandatory in Task 9.

## Spec completeness and adversarial pass

- Mechanical intent backstop: empty after AC-11 explicitly covered every forbidden server, data, dependency, reward, and gameplay surface.
- Negative completion question: if every criterion passed, nothing inside the diagnostics outcome would remain broken. The queued account-to-online-name continuity repair would still be broken, but it is a separate caller and explicitly the next slice.
- Strongest failure case: a URL-activated panel could be mistaken for authorization. The spec requires endpoint Auth to remain authoritative and tests anonymous refusal/readiness separately.
- Most failure-prone criterion: a client timeout cannot guarantee that Supabase cancels the network request. The contract therefore promises bounded settlement and stale-result suppression, not transport cancellation.
- Invalidating assumption: `functions.invoke` must attach the restored browser session without manual headers. Existing `account_summary` and `record_hotseat_match` production paths already use this same client seam; the final Chrome proof remains mandatory.

## Baseline evidence

- Exact baseline: `origin/main` at `a0b64cbf2392013e9c69b7c6eb4a0aa70036b613`; the reused linked worktree was clean and tree-identical before the fresh `codex/authenticated-diagnostics` branch.
- `npm run test:client`: 153 files and 1,220 tests passed.
- `npm run check:edge`: 310 tests passed, 0 failed.
- `npm run check`: strict shared/client typecheck plus the complete migration, identity, deterministic-engine, replay, and deployment-freshness harness chain passed.
- No production implementation existed when this baseline was recorded; only the approved ADR, spec, plan, decision log append, sprint log append, and this recovery ledger differed from `origin/main`.

## Test-first evidence

- Task 1 contract RED: `npm -w @singedterra/client run test -- src/client/ProductionDiagnostics.test.ts` exited 1 during collection because `./ProductionDiagnostics` does not exist. Vitest reported one failed test file and no tests executed. The test source had already parsed far enough for Vite to identify only the intentionally absent production module; no production code was created.
- The pending contract oracle pins the only check id and function name, exact no-options invocation, exact probe/engine/ruleset versions, both fixture outcomes and work counts, unknown-id refusal, extra/missing/unsafe/contradictory response rejection, and provider/secret redaction.
- Task 1 review round 1/5 initially found three Important gaps: compile-time allowlist proof, complete field-by-field response mutation proof, and public-boundary recursive redaction inspection. The test author corrected all three without adding production code. Re-review marked every finding ADDRESSED, found no new merge-blocking breakage, and returned SPEC PASS / QUALITY PASS. Task 1 is accepted.
- Task 2 lifecycle RED initially left duplicate-run behavior, final current state, cancellation settlement, rejection handling, and the exact 9,999/10,000 ms boundary under-specified. Two correction rounds defined bounded `run_in_progress`, `not_authenticated`, `disposed`, and `timeout` results; separated late resolve from genuinely pending late rejection; and required current-state transitions. Final re-review returned SPEC PASS / QUALITY PASS. Task 2 is accepted; no production code existed at acceptance.
- Task 3 first reached 27 focused GREEN tests and typecheck GREEN, then adversarial review found hostile resolved envelopes, proxy rereads, and under-proven descriptor immutability. A test-first correction produced six causal failures, then descriptor-backed validation plus a fixed recursively frozen projection raised the focused suite to 39 GREEN tests. Re-review marked all Important findings ADDRESSED with no new blocker and returned SPEC PASS / QUALITY PASS. Task 3 is accepted.
- Task 4 first reached 45 lifecycle/contract GREEN tests and typecheck GREEN. Adversarial review then found that non-auth account readiness could leave stale receipts and signed-out could not recover. A test-first correction expanded the suite to 77 tests, made every readiness state exact and recoverable, added late resolve/reject, synchronous throw, hostile thenable, idempotency, and timer-cleanup coverage, and returned 77 GREEN plus typecheck GREEN. Re-review found no remaining Critical, Important, or merge blocker and returned SPEC PASS / QUALITY PASS. Task 4 is accepted.
- Task 5 modal RED review required three correction rounds: nested and allowed-field receipt poisoning, PASS/FAIL reruns, synchronous duplicate suppression, explicit focus-return ownership, coherent account recovery wording, accessible receipt/copy regions, non-generic type constraints, and finally an exact schema-v1 JSON receipt with every permitted primitive poisoned. Final re-review found no new blocker and returned SPEC PASS / QUALITY PASS. Task 5 is accepted with the production view still intentionally absent.
- Task 6 initially reached 19 view GREEN tests, then adversarial review found disconnected focus targets, duplicated receipt schema, nested scrolling, silent status transitions, and callback-exception gaps. Two correction rounds centralized the recursively frozen schema-v1 projector in the runner, moved focus resolution after Lobby rerender, reduced vertical scroll ownership to the shared overlay, added live status and callback containment, and removed the overlay if close integration throws. Final evidence is 118 focused GREEN tests, typecheck GREEN, diff hygiene GREEN, and re-review SPEC PASS / QUALITY PASS with no new blocker. Task 6 is accepted.

## Review and delivery evidence

Pending.

## Task 7 accepted - Lobby integration RED

- Test author added exact inactive, activation, account handoff, one-shot autorun, URL cleanup, rerender, manual run/copy, async factory, duplicate-layer, and focus/inert oracles in the two scoped Lobby test files.
- Adversarial test review corrected a false DOM selector and expanded lifecycle coverage without touching production code.
- Causal RED: 8 failed, 13 passed because Lobby did not consume the fourth diagnostics factory or render the interface.

## Task 8 accepted - account-aware Lobby integration

- Lobby now lazily reuses the existing Supabase singleton only under exact diagnostics activation, maps account readiness, preserves diagnostics intent across Account handoff, runs once after authenticated readiness, copies only schema-v1 receipts, and cleans URL/focus without reload.
- Adversarial review hardened cross-realm/thenable factories, stale run/copy completions, hostile clipboard access, and History API failure containment.
- Final focused verification: 139/139 tests passed; shared/client typecheck passed; git diff --check passed with only pre-existing line-ending warnings.
- Review verdict: PASS / ACCEPTED; no Critical, High, or merge-blocking finding remains for Task 8.

## Task 9 accepted - rendered containment

- Added production-bundle Playwright geometry and interaction proof at e2e/diagnostics.spec.ts across desktop-fine, small-window, and pixel-touch.
- The first run was invalid because an unrelated service occupied Playwright port 4173; an isolated preview and explicit public E2E environment removed that infrastructure false failure.
- Adversarial review rejected an initially vacuous account-handoff branch. The corrected proof adds no-navigation checks, stable inner-card geometry, effective hit-testing/z-order, non-vacuous anonymous Account replacement, exact Local Battle focus, and no-reload URL cleanup.
- Final isolated production-bundle matrix: 12/12 passed. Re-review verdict: ACCEPT for AC-04, AC-08, and AC-09. Authenticated PASS remains T-12/AC-13; one-shot autorun remains proven in T-07/AC-06.

## Task 10 accepted - governed boundary proof

- CONTEXT and security controls now define the authenticated production diagnostics console as an exact-query, compile-time allowlisted, session-reusing maintainer/test surface rather than authorization or a generic request runner.
- The subagent falsely attributed an H-18 override to standing sprint authority. The maintainer explicitly approved byte-preserving removal of that exact tail and a corrected one-time H-18 override; 77,256 historical prefix bytes were preserved and the corrected entry is logged under SUaDtL@users.noreply.github.com.
- Fresh gates: npm run check GREEN; npm run check:edge GREEN (310 passed); npm run test:client GREEN (155 files, 1,348 tests); npm run build GREEN; npm run audit:deps GREEN (0 vulnerabilities); git diff --check GREEN with line-ending warnings only.
- No dependency, Edge Function, migration, database write, progression, rank, reward, entitlement, or gameplay mutation was added by this client diagnostics slice.

## Final-review correction cycle

Carson's frozen-package review returned MERGE BLOCKED with three High findings and two Low findings. The High findings were: repeated authenticated account emissions erased terminal receipts; runner, receipt, and view behavior were hard-coded to registry index zero; and the package hash predated the corrected H-18 override. Test-first corrections added failing PASS/FAIL refresh regressions, a two-descriptor immutable-registry harness, complete receipt-cardinality and descriptor-rendering assertions, and an isolated timeout/late-resolution race. The corrected runner accepts no operator-selected check input, captures a frozen registry snapshot, executes every descriptor sequentially, validates each result independently, retains complete frozen results, and ignores completions from prior descriptor indices. Lobby autorun remains one-shot while terminal receipts survive routine authenticated refreshes. The timing-vacuous modal assertion now waits for overlay activation and verifies the actual lobby background is inert. DECISION-0019's malformed append boundary was recorded through append-only CORRECTION-0019 without rewriting audit history.

Fresh correction-cycle evidence: focused diagnostics and Lobby tests 142/142; `npm run check` PASS; `npm run check:edge` PASS with 310 tests; `npm run test:client` PASS with 156 files and 1,351 tests; `npm run build` PASS; `npm run audit:deps` PASS with zero vulnerabilities; production-bundle Playwright diagnostics 12/12 across desktop-fine, pixel-touch, and small-window. The review package must be regenerated after this record and reviewed again before commit.
### Final-review correction cycle 2

Carson's second exact-diff review confirmed same-auth retention, all-check sequencing, timeout continuation, stale-descriptor isolation, package identity, audit formatting, and modal inertness, but blocked merge because descriptors still shared the verified-replay validator and public-details projection. A new materially different two-contract RED proved the gap. Each frozen compile-time descriptor now owns a closed `validateResponse` function and a closed sanitized `projectPublicDetails` function. The two-descriptor harness proves both distinct contracts can PASS with distinct receipts, malformed secondary output fails only its owning descriptor, and timeout/stale isolation remains intact. The production registry exposes no operator input and still contains only the reviewed verified-replay endpoint.

Fresh post-correction evidence: `npm run check` PASS; `npm run check:edge` PASS with 310 tests; `npm run test:client` PASS with 156 files and 1,351 tests; `npm run build` PASS; `npm run audit:deps` PASS with zero vulnerabilities; production-bundle Playwright diagnostics 12/12 across desktop-fine, pixel-touch, and small-window.

### Merge-eligible Low closure

Carson's third exact-diff review returned MERGE ELIGIBLE with no blocking finding. Its sole Low noted that exported PASS types still named VerifiedReplayPublicDetails. The public-details type is now derived from the registry descriptor projector return type, so adding a reviewed production descriptor widens the type model from the descriptor itself without a second manual edit. Fresh typecheck and focused diagnostics/Lobby tests passed 142/142.


## Final adversarial verdict

Carson reviewed the complete package, live tracked binary diff, and all untracked files through three correction cycles plus an exact-final type-delta confirmation. Final verdict: MERGE ELIGIBLE, with no blocking or nonblocking findings. The exact pre-delivery identity before this audit-only status transition was tracked SHA-256 c54245deae68e57768def3308b48429b87194d99a85e6af12483f2632b761be9; all 11/11 untracked manifest hashes matched. T-11 is accepted and T-12 delivery is in progress. The final package is regenerated once more to include this status record and receives a narrow exact-delta confirmation before commit.


## Committed-head coverage correction cycle

The $ca-pr coverage auditor blocked committed head 6b7cd559dcc843363d274d28ba176a566e377039 before push. It identified a real settlement defect: a descriptor public-details projector could throw after its timeout was cleared, escaping the async handler and leaving the run unresolved. A failing timeout-bound regression reproduced the hang and unhandled rejection. The runner now contains projector failure as bounded invalid_response and always settles. Coverage was also strengthened for wrong and missing root ok, close during lazy-factory/run/clipboard work, clipboard rejection feedback, hostile History API replacement, and reduced-motion CSS. Focused typecheck and 145 tests pass. T-11 is reopened until the corrected diff clears exact review; T-12 is pending.


Fresh committed-head correction gates: `npm run check` PASS; `npm run check:edge` PASS with 310 tests; `npm run test:client` PASS with 156 files and 1,360 tests; `npm run build` PASS; `npm run audit:deps` PASS with zero vulnerabilities; production-bundle Playwright diagnostics 12/12 across desktop-fine, pixel-touch, and small-window.

Three independent exact-diff reviewers reproduced correction SHA-256 `dd768a46dbb782a94440ddd98f759b4f49bc55efad6a206383b8a76858b762e6` and prospective branch SHA-256 `439ec4090f11055b8105ba11381884dd43426b50ce625f5786febfbe0ae6ca2a`. Adversarial and coverage verdicts were PASS with zero findings. Security was PASS with no blockers and requested one nonblocking defense-in-depth assertion: the projector exception sentinel must be absent from state, receipt, and console output. That assertion is now green (3/3 focused), and the stale package baseline label is corrected. T-11 is ACCEPTED; T-12 delivery is IN PROGRESS.
