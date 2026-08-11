# Verified Replay Hosted Probe - Sprint Evidence

This bounded report replaces writes to the malformed legacy `.codearbiter/sprint-log.md` for this sprint. It is the recovery ledger for SMARTS decisions, test-first evidence, reviews, exact-head delivery, and production verification.

## Recorded intent

- Conform to accepted ADR-0011: account JWT identity is validated by Supabase Auth and remains separate from gameplay seat credentials.
- Conform to accepted ADR-0013: the shared engine may run in one verification-only Supabase Edge context; no duplicate verifier is permitted.
- Conform to accepted ADR-0014: deterministic completion replay is required before rank-eligible progression.
- Conform to proposed ADR-0015, explicitly authorized by SUaDtL on 2026-08-10: the first hosted milestone is authenticated and non-awarding.
- Conform to `.codearbiter/security-controls.md`: no credentials in source/logs, no client-supplied user authority, explicit Auth validation, named rate limiting, and no player-state mutation.
- No deferred `[CONFIRM-NN]` item conflicts with this slice.

## SMARTS auto-decisions

### Use a server-owned probe workload instead of accepting arbitrary transcripts - strong - confidence: high - intent: per ADR-0015 and security-controls.md

Securable and Scalable reject a new untrusted compute surface before persistent verification exists. Reliable and Testable still get production proof of bundling, Auth, engine execution, and deterministic output. Maintainable keeps the future transcript API unconstrained until its session and idempotency contract are designed. Available is unchanged because this is an operator probe, not gameplay traffic.

### Run two fixtures covering both independent execution ceilings - strong - confidence: high - intent: per ADR-0013 and ADR-0014

The maximum-action/total-tick fixture does not reach the maximum per-turn bound. Running both immutable fixtures closes that evidence gap for negligible bounded cost and prevents a false production-feasibility claim.

### Keep gateway JWT verification disabled and validate exactly one Bearer through Supabase Auth in-handler - strong - confidence: high - intent: per ADR-0011 and security-controls.md

This matches every existing account-aware function, produces one consistent generic 401 boundary, and derives identity only from the Auth authority. It avoids a second gateway-versus-handler JWT policy while preserving explicit test seams.

### Add a no-body request-wrapper mode - strong - confidence: high - intent: per hosted-probe spec

Rejecting and cancelling any body before JSON parsing prevents the probe from becoming a payload or parser surface. A narrow shared wrapper option preserves existing functions and is directly mutation-testable.

### Queue account-to-lobby identity continuity separately - strong - confidence: high - intent: per user steering 2026-08-10

Suppressing a false signed-out CTA and removing redundant host/join name entry form one coherent account/lobby UX slice. Mixing that client state repair into an Auth-sensitive Edge runtime probe would expand callers, tests, and deployment surfaces without helping the current proof.

## Baseline evidence

- `npm ci`: 145 packages installed; 0 vulnerabilities.
- `npm run check`: passed on exact `origin/main` baseline `775b795e28dd58e9c5173c79d6d156f0db014b67`.
- `npm run check:edge`: 283 passed, 0 failed.
- `npm run test:client`: 153 files, 1220 tests passed.

## Test-first evidence

- Wrapper RED: 42 pre-existing tests passed and three new no-body tests failed because an absent body returned 400, supplied JSON reached the handler, and a supplied stream was not cancelled.
- Endpoint contract RED: the module-contract test reported the missing callable export; after adding only the handler skeleton, auth expected 401 but received 501, authenticated success and no-write checks expected 200 but received 501, and replay failure expected 500 but received 501.
- Wiring RED: the shared limiter lacked an explicit `verified_replay_probe` bucket and the deployed wrapper export was undefined.
- GREEN: `supabase/functions/_shared/mod.test.ts` passes 45/45, including absent-body forwarding, body rejection before handler invocation, and stream cancellation.
- GREEN after adversarial corrections: `supabase/functions/verified_replay_probe/index.test.ts` passes 12/12, covering callable wiring, exact wrapper options, executable startup registration and top-level main gating, limiter-before-body ordering, body rejection, duplicate/rejected/thrown Auth refusal, exact real-engine results, strict fixture-reference invocation, no persistence/data leakage, generic failure, and safe replay-error codes.
- GREEN after adversarial corrections: `supabase/functions/_shared/verifiedMatchReplay.workload.test.ts` passes 7/7 with recursive runtime-freeze coverage across both fixtures, a canonical whole-graph digest, and exact 15-action, 448-total-tick, and 198-single-turn boundaries.
- GREEN after adversarial corrections: `supabase/functions/_shared/mod.test.ts` passes 52/52, including limiter-before-rejection for no-body mode, the exact production bucket through the real enforcer with only its RPC bump injected, fail-open containment of a thrown limiter transport failure, contained cancellation failure, safe body cancellation on over-limit no-body requests, and preserved parse-before-limit behavior for existing JSON/optional-body modes.
- Causal served-entrypoint mutation: changing the exported handler to bypass `createVerifiedReplayProbeHandler()` made `node scripts/checks/profile_identity.mjs` fail with `verified_replay_probe must export the handler created by its configured wrapper factory`; restoring the production wiring made the check pass.
- Additional causal mutations: limiting recursive freeze to one child failed the deep-freeze test; changing an outcome-neutral `maximumTurn` player name failed the canonical digest; comment-only, trailing-comment, dead-code, short-circuit, string, and unreachable-declaration decoys failed syntax-aware production-identity checks; replacing the configured export with an inline-comment decoy failed; cloning a reviewed fixture argument failed strict reference identity; a probe-specific default-limiter bypass failed the production-option-path test; widening the handler's Auth-only client capability with `rpc` failed type checking; replacing either executable startup default with an inert callback failed the syntax-aware production-identity check.
- Full corrected-candidate matrix: `npm run check:edge` 307/307; `npm run test:client` 153 files and 1220/1220 tests; `npm run check` passed; `npm run build` passed; `npm run audit:deps` found 0 vulnerabilities; `node scripts/checks/profile_identity.mjs` passed; `git diff --check` passed.
- Edge/Deno has no numeric coverage command in `tech-stack.md`; the coverage audit used acceptance-criterion mapping and realistic mutation analysis under the documented no-tooling exemption.

## Spec approval and adversarial pass

- Mechanical review: no placeholders, unresolved questions, vague acceptance criteria, NOT-building conflicts, or uncovered in-scope bullets.
- Strongest objection: fixed fixtures do not prove future player transcript upload parsing. Disposition: accepted as the defining risk reduction of this non-awarding milestone; upload parsing belongs with verification-session and idempotency design.
- Most failure-prone criterion: one fixture cannot cover both 448 total ticks and 198 ticks in one turn. Disposition: corrected before approval by specifying two immutable fixtures.
- Invalidating assumption: Supabase Edge may fail to bundle the verification-only shared-engine import despite local Deno success. Disposition: this is the exact assumption the hosted deployment and production success-path criterion must prove.
- Approval: maintainer standing bounded-sprint authority plus explicit ADR-route approval; no blocking `[CONFIRM-NN]` remains.

## Review package and findings

- Required package: `.codearbiter/reports/2026-08-10-verified-replay-hosted-probe-final-review-package.md` contains the spec, plan, this sprint evidence, named tests, implementation paths, exact baseline, and canonical final-diff command.
- Initial broad adversarial verdict: BLOCK with three High findings and one merge-blocking Medium. Corrections: added exact injected-replay call/fixture assertions; added a wrapper factory whose consumed immutable options are asserted; reconciled `CONTEXT.md`, `coding-standards.md`, and the shared Edge comment with accepted ADR-0013; appended CORRECTION-0018 so proposed ADR-0015 no longer conflicts with the effective decision-log status.
- Auth/Crypto verdict: BLOCK with two merge-blocking Medium findings. Corrections: `profile_identity.mjs` now pins the probe's exact `verify_jwt = false` stanza and security boundary; endpoint tests reject comma-coalesced duplicate credentials and thrown Auth lookups before replay.
- Coverage verdict: BLOCK with one High and three merge-blocking Medium findings plus one Low. Corrections: every body-bearing request is rate-limited before rejection; config/docs are mutation-protected; thrown Auth and safe `VerifiedReplayError` branches are covered; evidence is refreshed; the Low runtime-mutability note was also resolved with a deeply frozen fixture graph.
- Security verdict: BLOCK with one merge-blocking Medium and one Low. Corrections: cancellation rejection is contained behind the generic 400 contract; the Low unmetered-rejection path was eliminated by limiter-first ordering.
- Fresh pre-final review found two additional merge blockers. Corrections: an over-limit no-body request now safely cancels its supplied stream before the generic 429, with both resolving and rejecting cancellation covered; `profile_identity.mjs` now pins the exact exported factory-created handler and the exact `Deno.serve` entrypoint, with a causal mutation proving the check fails when the factory is bypassed.
- Fresh coverage review found three additional merge-blocking Medium gaps. Corrections: JSON and optional-body modes retain their legacy parse-before-limit behavior while only no-body mode remains limiter-first; startup registration is an executable injected seam and source checks ignore decoy comments; every node in both fixture graphs is freeze-checked and the full reviewed structure is pinned by SHA-256 digest. Each correction has focused RED or causal-mutation evidence above.
- Final re-review found two narrower merge-blocking Medium test gaps. Corrections: startup now runs through a behavior-tested main gate whose invocation must be the final top-level statement, closing trailing-comment and dead-code decoys; replay-call assertions now require strict identity with all four reviewed fixture references, closing structurally equal clone mutations.
- Final mutation review found four additional composition/capability gaps. Two startup findings were generated against the pre-AST snapshot and are closed by syntax-tree validation of the unique top-level exported initializer and final standalone startup call. The remaining corrections move limiter injection below the real production enforcer so bucket/cap logic remains exercised, and narrow the handler's Supabase dependency type to Auth-only so production-environment storage branches cannot compile.
- Latest consolidated review found three merge-blocking Medium gaps. Corrections: thrown limiter transport errors now fail open through the shared enforcer and still reach safe body rejection/cancellation; AST checks pin `registerVerifiedReplayProbe` to `Deno.serve` and `startVerifiedReplayProbe` to `registerVerifiedReplayProbe`; the compile-time capability assertion now proves the probe Supabase dependency has exactly the `auth` key. Focused RED and combined causal mutations proved each guard fails under the corresponding regression.
- Fresh broad review also identified that substituting this report for malformed `.codearbiter/sprint-log.md` required a slice-specific `$ca-override`. SUaDtL explicitly authorized the exact substitution on 2026-08-11; the append-only override is logged in `.codearbiter/overrides.log`, and the legacy malformed log remains intentionally untouched.
- The H-18 partial-patch limitation on `CONTEXT.md` used the maintainer's explicit context-edit override. The override is logged, activation frontmatter was verified before and after, and only the stale architecture paragraph changed.
- Corrected exact-diff adversarial re-review: product implementation PASS with no Critical or High findings and strong coverage. Its sole merge-blocking Medium finding, the slice-specific `$ca-override` authorizing this alternate append-only sprint ledger, is resolved and logged. Final audit-only exact-diff confirmation: PASS; the reviewer verified the exact authorization, append-only UTF-8 record, Git identity, UTC timestamp, untouched byte-identical legacy sprint log, unchanged product snapshot, and clean diff.

## Exact-head CI, merge, deployment, and production health

Pending.

### Append-only delivery update — 2026-08-11

- Reviewed PR head: `af5618a4e904c8cf13094765c68103aca91e2f35`.
- Hosted checks on that exact head: typecheck/harness/build PASS; Edge PASS; E2E rendering PASS; CodeQL analysis PASS; CodeQL PASS; CodeRabbit status PASS with automated review skipped because repository auto-reviews are disabled. Supabase Preview was skipped and is not counted as an executed green check.
- PR #399 merged by squash as `78ff8b7c9b28fa1f3b4507981f6e67a7d39400b7`. The reviewed head and merge commit both resolve to tree `1783c4f012f4b5e2539715d9b4f9ac9848e4ee2e`, proving exact content equivalence despite squash ancestry.
- Deployment command targeted linked project `jdvxfxjpobtyasozxauh` through the authenticated local Supabase CLI. Asset upload completed, but hosted bundling rejected an extensionless relative import in `shared/src/engine/GameEngine.ts`; no function version was deployed.
- Production success-path health remains pending until the bounded hosted-bundle correction is reviewed, merged, and deployed. The failed deployment validates the spec's named bundler-risk assumption and is being corrected test-first through `$ca-fix`.
