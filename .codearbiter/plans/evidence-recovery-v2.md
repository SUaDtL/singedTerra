# Evidence-backed recovery v2 execution ledger

Approved scope: active user goal, 2026-09-09; spec: ../specs/evidence-recovery-v2.md. This is the sole execution-status ledger. Original JSON remains immutable review input. Parent owns integration and this file; task agents return proof without editing this ledger.

## Task status and coverage
| Task | Obligation IDs | Dependencies | Worker / effort | Reviewer / effort | Status |
|---|---|---|---|---|---|
| R00 | AC-001, AC-002, AC-003 |  | gpt-6-astra / high | gpt-6-astra / high | ACCEPTED |
| R01 | AC-004, AC-005, AC-006 | R00 | gpt-6-astra / high | gpt-6-astra / high | ACCEPTED |
| R02 | AC-007, AC-008, AC-009 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | ACCEPTED |
| R03 | AC-010, AC-011, AC-012 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R04 | AC-013, AC-014, AC-015, AC-016 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R05 | AC-017, AC-018, AC-019 | R04 | gpt-5.6-terra / high | gpt-5.6-sol / high | PENDING |
| R06 | AC-020, AC-021, AC-022, AC-023, AC-024 | R00, R01, R13 | gpt-5.6-sol / xhigh | gpt-6-astra / high | PENDING |
| R07 | AC-025, AC-026, AC-027, AC-028 | R06 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R08 | AC-029, AC-030, AC-031, AC-032 | R06 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R09 | AC-033, AC-034, AC-035, AC-036 | R00, R03 | gpt-5.6-terra / high | gpt-5.6-sol / high | PENDING |
| R10 | AC-037, AC-038, AC-039, AC-040 | R00, R03 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R12 | AC-041, AC-042, AC-043, AC-044 | R00, R02 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R13 | AC-045, AC-046, AC-047, AC-048 | R00 | gpt-5.6-terra / high | gpt-5.6-sol / high | ACCEPTED |
| R14 | AC-049, AC-050, AC-051, AC-052 | R01, R13 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R15 | AC-053, AC-054, AC-055, AC-056 | R00 | gpt-5.6-terra / high | gpt-5.6-sol / high | PENDING |
| R16 | AC-057, AC-058, AC-059, AC-060 | R00, R02 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R19 | AC-061, AC-062, AC-063, AC-064 | R07, R08, R14 | gpt-5.6-terra / high | gpt-5.6-sol / high | PENDING |
| R21 | AC-065, AC-066, AC-067, AC-068 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | CHANGES_REQUIRED |
| R22 | AC-069, AC-070, AC-071 | R00, R21 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R23 | AC-072, AC-073, AC-074, AC-075 | R21, R22, R07 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R24 | AC-076, AC-077, AC-078 | R00 | gpt-5.6-terra / high | gpt-6-astra / high | ACCEPTED |
| R25 | AC-079, AC-080, AC-081, AC-082 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | ACCEPTED |
| R20 | AC-083, AC-084, AC-085, AC-086 | R00, R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R12, R13, R14, R15, R16, R19, R21, R22, R23, R24, R25 | gpt-6-astra / high | gpt-5.6-sol / high | PENDING |

## Dispatch boundaries and verification

Integration: C:/Users/brenn/projects/singedTerra-worktrees/evidence-recovery-v2, branch codex/evidence-recovery-v2; audit baseline 3902cad662aea03cec913d984d17aa9573b89bd0. R00/R01 records committed as aad9dce597f64e2f2befe1aef1ed533f9dea03fd and R24 as df9d9958e88becd1a2bef51c4eb1ced2f49a91c3 after governed commit gates, each with a clean resulting tree. Parent alone owns this ledger, integration, commits, and the sole localhost. Task worktrees below share the audit baseline; task acceptance is distinct from release. No production or remote-setting action has occurred.

| Task | Current ownership and evidence |
|---|---|
| R00 | ACCEPTED after package/schema/graph/source/provenance checks and independent Astra/high review. Detailed baseline receipts remain below. |
| R02 | ACCEPTED, integrated atop65fc625 after source correction. Fresh final Astra/high review, triage, aggregate PASS AC007..009; sole LOW winner wording corrected in receipt. Parent confirms normal0, nonlethal1, actual resolver-deferral1, omitted-flush1 with intended diagnostics: settled pre-shot, unsupported dirt before one real pending flush, settled terminal terrain. Integrated client200files1789tests, build/typecheck and full check all exit0; session50562 completed. Logs ../recovery-v2-r02-integrated-{client,build,check}.log. All task source leases released; parent completes governed commit. |
| R01 | Seven reviewed documents plus task receipt integrated. Fresh Astra/high review, triage, and aggregate PASS AC-004..006. Parent verifies 20 relative links, preserved history/frontmatter, diff-check and secrets scan exit 0. Commit checks: test:client 200 files/1776 tests exit 0; npm run check exit 0, retained in ../recovery-v2-r01-commit-client.log and ../recovery-v2-r01-commit-check.log. One LOW existing version-prose discrepancy remains assigned R19; historical ADR-0018 approval receipt is unknown. |
| R24 | Four-file fix and receipt integrated after R25 released shared paths. Fresh final Astra/high review, triage, aggregate PASS AC-076..078 with zero findings. Parent focused 53/53 exit 0; final integrated coverage/client suite 200 files/1779 tests exit 0, Windows lines 93.19% (8112/8704) and branches 81.62% (4771/5845). Full npm run check and build/typecheck exit 0. Logs: ../recovery-v2-r24-integrated-{coverage,check,build}.log. Preserves exact D09 plus real operation-selected opening/escalated/reset guide versus live projectile regression. Live browser/Supabase/verified replay is not claimed by route mocks. |
| R21 | Worktree ../recovery-v2-r21, branch codex/recovery-v2-r21. Tier-filter fix plus four-file tests/receipt is CHANGES_REQUIRED. Fresh Astra/high review, triage, aggregate: HIGH ineffective preparation unchecked at NetworkClient.ts:1266/1292 and main.ts:1070; MEDIUM local fixture bypasses driver and failed preparation is untested. AC-068 incomplete; original receipt overstates coverage. AC-065..067 passed. Parent AI harness, NetworkClient 8/8 and complete npm run check exit 0; ../recovery-v2-r21-check.log. Completion worktree ../recovery-v2-r21-completion, branch codex/recovery-v2-r21-completion, now starts at65fc625 with the initial four-file diff preserved; original worktree retained. Sol/high /root/r21_recovery_preparation will own the six source/test paths plus receipt after parent releases integration writes. Required driver-outcome handling stays R21; R22 waits. Ordinary mixed-client policy compatibility remains R06/R07/R19's release gate. |
| R25 | ACCEPTED; committed as d8e236a157d611025dfe46e50fcc28e82bfeb884. Same-seat round correction red149/green49, actual InputHandler via main with mocked client transition; actual engine reset-before-ROUND_OVER timing independently inspected. Fresh final Astra/high review, triage, aggregate PASS zero findings AC079..082. Parent combined R24/R25 coverage200files1789tests exit0, lines93.20%8123/8715 and branches81.67%4791/5866; build/typecheck0; full check0. Logs ../recovery-v2-r25-integrated-{coverage,build,browser}.log and ../recovery-v2-r13-r25-integrated-check.log. Combined-preview normal purchase/200power/fire/seatreset1/1 exit0. Single preview PID35612/session71382 port5198, integration client/dist index86f462bd6c2a6cd372a83a653b8332eb4a953ed8ebc6b673281d1cfa233a0976 and entryassets byte-verified. Startup from repo root failed for absent root dist; corrected client cwd, no second listener. Resolved R24/R25 test-helper signature conflict preserving gravity arg plus optional callback; source frozen for governed commit. |
| R13 | ACCEPTED; committed as 65fc62547630b789ebe430ad24405ee8e50f8706. Fresh final Sol/high coverage/security review, triage, aggregate PASS zero findings AC045..048 after threeMEDIUM corrected. Parent integrated9/9 Git tests0, history20/comments26 check0, combined fullcheck0; ../recovery-v2-r13-r25-integrated-check.log. No SQL diff; remote Actions/SHAfetch not yet observed and no production-applied claim. Source frozen for governed commit. |

Exclusive task paths:
- R24: client/src/main.ts, renderer/aimGuidePresentation.ts and its test, main.hotSeatProgression.test.ts. Integrated; parent owns its commit. Source frozen.
- R21 active completion lease: shared/src/engine/AI.ts, scripts/checks/ai.mjs, client/src/client/NetworkClient.ts and NetworkClient.botRetry.test.ts, client/src/main.ts and main.hotSeatProgression.test.ts, plus task receipt. Sol/high /root/r21_recovery_preparation owns these paths in ../recovery-v2-r21-completion at65fc625. Parent holds the second writer slot for nonoverlapping R02 integration records and commit.
- R25: client/src/input/InputHandler.ts; main.ts; ui/HUD.ts (necessary existing presentation producer, already justified); ui/battleConsole/types.ts, projectState.ts, components/CompactConsole.tsx, components/SemanticContractTree.tsx, pixi/scene.ts. Reserved tests: InputHandler.test.ts, HUD.battleConsoleIntegration.test.ts, battleConsole/projection-contract.test.ts, CompactConsole.runtime.test.tsx, semantic-parity.test.tsx, visual-state-contract.test.ts, pixi/live-instruments.test.ts, main.hotSeatProgression.test.ts, e2e/power-cap-controls.spec.ts. Topology-only test is not in its write set.
- R13: scripts/checks/migration_classification.mjs, migration_classification.test.mjs, .github/workflows/ci.yml. No SQL edits. Protected inventory derives from trusted base-tree history; this does not assert remote applied status.
- Each worker may write only its task evidence receipt in .codearbiter/reports/ in addition to its reserved paths; parent alone updates canonical status.

Actual dispatch selections verified from session turn_context (no substitutions):
| Unit | Actual model / effort | Session |
|---|---|---|
| R01 author | gpt-6-astra / high | 01a08911-dda2-7e63-8a22-c3e0d76a9abf |
| R01 independent review | gpt-6-astra / high | 01a08926-006d-7ba1-828d-3894b660b70c |
| R21 author | gpt-5.6-sol / high | 01a08911-4d13-7622-9436-8bd90bcd441b |
| R21 independent review | gpt-6-astra / high | 01a08922-ac2e-7a11-af3b-98b4b84405fe |
| R24 first review | gpt-6-astra / high | 01a0891d-f503-73a2-a2fd-2e02340d738e |
| R24 remediation | gpt-5.6-terra / high | 01a08921-f3a1-7791-9ce8-08bd3235d620 |
| R24 final review | gpt-6-astra / high | 01a0892e-b24d-78f0-8bb2-e47f4d19fa47 |
| R25 author | gpt-5.6-sol / high | 01a0891f-31e4-7ea0-82bb-4f76f565f756 |
| R13 author | gpt-5.6-terra / high | 01a0892a-3314-7c01-bad6-fecd9dee120f |
| R13 first review | gpt-5.6-sol / high | 01a08941-0eea-7d20-94ed-389b2f8f47b6 |
| R25 first review | gpt-6-astra / high | 01a08947-aef5-7860-90f8-8798570bfec1 |
| R02 author | gpt-5.6-sol / high | 01a08949-6e73-7390-b0c1-305406b41ca2 |

Rollback: retain original dirty checkout and immutable input. Each unpromoted task can be reverted as its isolated change; destructive removal requires normal approval. Preserve existing ADRs, SQL history, verified receipts, and unrelated work. Task acceptance does not claim release or production proof. Dependency order is binding, with at most three active subagents and two nonoverlapping writers including the parent.

### R00 - Pin the working baseline and resolve Codex capabilities
Scope paths from approved input: package.json, .nvmrc, .github/workflows/, docs/SOFTWARE_RECOVERY.md, Codex session configuration
- Record current main, local changes, this audit SHA and candidate/deployed provenance. Preserve every existing worktree and uncommitted change.
- Verify only the actual model/effort profiles needed for the authorized task. Record an explicitly approved substitution if unavailable; do not claim an unselected model was used.
- Read current package scripts and read-only deployment/migration metadata where available. Record missing access as unknown. Do not archive or rewrite prior work during preflight.
Verification commands declared by review input (resolve current scripts before dispatch): none listed.
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R01 - Replace contradictory instructions with one current ownership and decision contract
Scope paths from approved input: CLAUDE.md, docs/ARCHITECTURE.md, docs/SOFTWARE_RECOVERY.md, .codearbiter/, docs/recovery/
- Keep one short current task entry and source-of-truth map. Clearly separate immutable historical facts from current implementation choices.
- Supersede only conflicting guidance relevant to authorized work, with a reason and replacement. Preserve applied migration and verified-result compatibility requirements.
- Retain GameSessionComposition, MatchSessionLifecycle and existing room/presentation owners; no compulsory file-size or module-count targets.
Verification commands declared by review input (resolve current scripts before dispatch): none listed.
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R02 - Make collapse regression scenarios fail when their prerequisites are absent
Scope paths from approved input: scripts/checks/collapse_flush.mjs, scripts/checks/collapse_engine.mjs, shared/src/engine/ test fixtures
- Repair the required Path B fixture using an explicit deterministic setup; assert its lethal/deformation preconditions before testing consequences.
- Make failure to exercise that required branch fail. Keep intentional viewport-specific or exploratory skips explicitly classified rather than banning every test.skip.
- Inspect existing gameover/sandhog/terminal checks before adding duplicates; add a negative control demonstrating delayed terminal resolution is detected.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:client; npm run check; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R03 - Retain real-control tests and retire the circular appearance oracle
Scope paths from approved input: client/src/ui/battleConsole/BattleConsoleRoot.tsx, client/src/ui/battleConsole/appearanceRuntime.ts, e2e/battle-console-integrated/, e2e/product-completion/
- Inventory the assertions in e2e/product-completion/console.spec.ts and existing real rendering tests. Preserve their actual interaction, geometry, focus and purchase checks.
- Treat RuntimeAppearanceProbe as a test of its own marker, not proof of real control appearance. Identify any consumers before removing it; keep purely structural checks honestly named.
- Add negative tests for real control font/containment/disabled/focus failures with the expectation records unchanged. Observe actual controls, not self-published appearance datasets.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:e2e; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R04 - Build one tested release candidate and gate Pages promotion on it
Scope paths from approved input: .github/workflows/ci.yml, .github/workflows/deploy-pages.yml, scripts/ci/
- Unify or explicitly connect the trusted release graph so required checks apply to the exact release candidate SHA.
- Build the release artifact with the same base/configuration intended for deployment, test that artifact, record its digest, and promote it without a second untested build.
- Preserve stale-main protection, least privilege, concurrency and public provenance. Define a separate approved rollback selection path for a prior tested artifact.
Verification commands declared by review input (resolve current scripts before dispatch): none listed.
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R05 - Align branch protection and rollback policy with the release graph
Scope paths from approved input: Repository rules/settings, docs/DEVELOPMENT.md
- Prepare an exact required-check/rules change with current context names. Include the critical browser gate and document admin/bypass policy.
- Show the proposed settings diff to B before any remote administration. Confirm emergency rollback is narrow, logged and bound to known-good artifacts.
- Verify the rules against a harmless failed-check PR or equivalent read-only policy evidence after approved application.
Verification commands declared by review input (resolve current scripts before dispatch): none listed.
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R06 - Introduce an atomic, revision-checked room-command transaction
Scope paths from approved input: supabase/migrations/ new forward migration, supabase/functions/submit_action/, supabase/functions/_shared/, shared/src/net/
- Design a versioned envelope with intended actor, expected room/log revision and a stable logical intent identity. For CPU proxies define a shared logical command scope; independently generated per-client UUIDs alone do not deduplicate the same bot turn.
- Within the existing room serialization domain, verify active status, current authorized seat/proxy and expected revision. Return an existing receipt for an identical retry, reject changed-payload reuse, append once and advance state coherently.
- Make actor binding explicit on replay; a duplicate row must not become a command for whichever engine seat is active later. Specify simultaneous action/finish behavior.
- Test with two real disposable-Postgres connections synchronized at the stale-read boundary. Define server/client rollout and old-room compatibility before deployment; do not silently upgrade historical rules.
Verification commands declared by review input (resolve current scripts before dispatch): npm run check:edge; npm run check
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R07 - Carry stable command identity and revision through client retries
Scope paths from approved input: client/src/client/NetworkClient.ts, client/src/client/OrderedActionSession.ts, client/src/client/retry.ts, shared/src/net/
- Create each human logical intent once. Derive/coordinate CPU intent identity under R06; preserve the same payload, actor and expected revision across retry.
- Reconcile receipt versus ordered echo without duplicate application. Reject an actor/log mismatch explicitly rather than applying the row to the current active seat.
- Bound resync and invalidation at leave/rematch/account/generation changes. Replanning after a real accepted preparation is distinct from retrying an uncertain write.
- Do not automatically resubmit stale user intent against a different turn after resync. Use the current UI recovery path and an explicit user retry when necessary.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:client; npm run check; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R08 - Make casual completion atomic and explicitly unverified
Scope paths from approved input: supabase/functions/finish_game/index.ts, supabase/functions/claim_match/index.ts, supabase/migrations/ new forward migration, client/src/client/matchClaim.ts
- Commit the room terminal result and its score coherently under the room serialization boundary. Keep terminal animation and local gameplay independent of persistence success.
- Allow a matching retry to retrieve the immutable terminal receipt even after the room is no longer active. Specify legacy absent/malformed-score handling instead of accidentally breaking old clients.
- Validate unique roster entries, bounded numeric fields and consistent room/score winners. Do not relabel participant-reported casual results as replay-verified.
- Exercise score-write failure, response loss, two contradictory reporters, finish/action races and claim_match readiness. Preserve the existing separate verified-completion implementation.
Verification commands declared by review input (resolve current scripts before dispatch): npm run check:edge; npm run check
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R09 - Remove raw governance and appearance-test archives from the production graph
Scope paths from approved input: client/src/ui/battleConsole/, scripts/build/, .codearbiter/contracts/battle-console/, client/vite.config.ts
- Use the measured eight-object inventory to map every live field consumer. First move retirement/appearance/proof-only data out of the production import graph. A runtime query flag does not remove bytes.
- Retain minimal typed layout/semantic data needed by current controls. Prefer an explicit small runtime module or the existing asset build step over a new schema-generation framework.
- Keep ordinary production smoke on the actual release build. Move synthetic setup-only fixtures to an explicitly separate test build where necessary, without representing fixture entry as a first-run path.
- Record before/after exact emitted bytes and compressed bytes separately. Remove raw governance import paths through a build guard and run existing real-control tests. R18 may later eliminate the wide semantic snapshot interpreter.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:client; npm run check; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R10 - Restore supported graphics capability handling and independent semantic readiness
Scope paths from approved input: client/src/ui/battleConsole/pixi/adapter.ts, client/src/ui/battleConsole/mount.tsx, client/src/ui/battleConsole/resources.ts
- Publish a live semantic owner capable of state/layout updates before optional decoration finishes. Existing lifecycle.update currently drops updates until record.mounted exists. Preserve one generation owner.
- Bound optional decoration work and prevent a forever-pending texture mount from indefinitely holding the cleanup barrier. Use real cancellation or detached stale-work guards, not a fabricated zero resource count.
- Reproduce the retained Pixi probe concern independently. Replace fake global capability priming with supported library behavior and documented stable singleton retention, then test real initialization/context-loss fallback.
- Keep the current Canvas battlefield and dynamic instrument functions. Removing Pixi entirely requires a separate measured equivalence decision; it is not mandated by this task.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:e2e; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R12 - Decouple simulation and effect pacing from refresh rate; make RAF stop final
Scope paths from approved input: client/src/client/HotSeatClient.ts, client/src/client/NetworkClient.ts, client/src/client/fastForward.ts, new shared client clock adapter
- Keep engine.tick deterministic and unchanged. Put a fixed-rate accumulator and bounded catch-up policy in existing browser clients, covering both hot-seat and network playback. Select the rate from the intended current pacing, not a silent physics retune.
- Keep renderer effect age on presentation time or an explicitly paced render clock. Do not advance simulation only at a fixed rate while leaving explosion/hit-stop lifetimes refresh-dependent.
- Define hidden-tab/resume behavior, verified deadlines and fast-forward separately. Preserve ordered replay and receipt outcomes.
- Make running/generation state explicit in HotSeatClient, checking after synchronous emission and before scheduling the next RAF. Stop/restart from a listener cannot revive a stale loop.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:client; npm run check; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R13 - Make migration history checks use real base/head evidence
Scope paths from approved input: scripts/checks/migration_classification.mjs, .github/workflows/ci.yml, supabase/migrations/ inventory
- Replace implicit HEAD^ comparisons with explicit supported base/head inputs and fetch the necessary Git objects.
- Enumerate protected applied migrations through an intentional inventory/version policy, including versions after 010.
- Keep comment-only SQL validation separate from historical immutability and fail when required comparison evidence is unavailable.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:client; npm run check; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R14 - Make backend releases pinned, compatible and recoverable
Scope paths from approved input: .github/workflows/deploy-backend.yml, package.json, docs/DEVELOPMENT.md, Supabase release manifest
- Align local and CI backend commands, pin approved tool versions and record the exact source/migration/function tuple.
- Require explicit production approval and a read-only compatibility preflight. Publish server capability before clients depend on it, with drain/retry behavior for active historical sessions.
- Use disposable database tests for forward migrations. Document whether recovery is safe rollback or fix-forward; do not imply applied schema or old results can be erased.
Verification commands declared by review input (resolve current scripts before dispatch): none listed.
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R15 - Extend existing browser suites with untouched entry and declared-engine coverage
Scope paths from approved input: playwright.config.ts, e2e/, .github/workflows/ci.yml
- Keep the standard suite and separate product-completion invocation. Map assertions to those actual workflow commands before adding tests.
- Add a normal guest entry that does not remove the splash or use ?e2e fixture state, then reach an ordinary shot and terminal/retry path.
- Add a small critical path in each browser engine actually claimed as supported. Distinguish automated engine coverage, touch emulation and physical-device review.
- Upload failure artifacts and report deliberate profile skips separately. Do not recreate a nonexistent integrated-suite directory just because an old ignore pattern names it.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:e2e; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R16 - Separate verified terminal presentation from canonical engine mutation
Scope paths from approved input: shared/src/engine/GameEngine.ts, shared/src/types/, client/src/client/GameClient.ts, client/src/client/HotSeatClient.ts, client/src/client/NetworkClient.ts
- Replace main's live state.phase/state.winner overwrite for capped verified completion with a detached terminal presentation/outcome projection owned at the existing presentation boundary.
- Trace the projection through HUD, TerminalMatchView, field-order observation, diagnostics and resume so all views agree without changing canonical controller/engine state. Preserve V2/V3 policy dispatch and immutable receipts.
- Then narrow borrowed read types where useful. Typed-array readonly properties do not prohibit buffer mutation; do not freeze or deep-copy full terrain per frame. Isolate existing mutation-based test fixtures explicitly.
- Document construction-options ownership. A small defensive configuration copy/freeze at construction may be justified, but it is separate from per-frame state publication and needs next-round/clone tests.
Verification commands declared by review input (resolve current scripts before dispatch): npm run test:client; npm run check; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R19 - Reconcile runtime versions, trust tiers and current operations documentation
Scope paths from approved input: docs/ARCHITECTURE.md, docs/DEVELOPMENT.md, shared/src/net/, supabase/functions/_shared/verifiedDeployment.ts, current release manifest
- Reconcile docs to implemented ordinary room rules, verified policy tuples and actual server/client rollout behavior. Remove demonstrably obsolete constraints and comments only in affected scope.
- Preserve immutable historical-result semantics and state clearly which ordinary outcomes are participant-trusted.
- Keep command protocol, simulation/AI policy version and reward evidence separate; a model assignment is not a game ruleset.
Verification commands declared by review input (resolve current scripts before dispatch): npm run check:edge; npm run check
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R21 - Keep CPU restock plans legal under the current room arms level
Scope paths from approved input: shared/src/engine/AI.ts, client/src/main.ts, client/src/client/NetworkClient.ts, scripts/checks/ai.mjs, client/src/client/NetworkClient.botRetry.test.ts
- Thread armsLevel into weapon-buy eligibility, preserving owned opening weapons even when they exceed the purchase tier.
- Test rich/exhausted bots at each arms level; keep an always-legal fallback rather than selecting unavailable ammunition.
- Treat preparation that did not change usable inventory as a failed plan, not as proof the attack can proceed. Keep recovery bounded and visible.
- Keep verified CPU V2/V3 untouched. Assess ordinary multiplayer CPU policy/version compatibility before release; multiple clients must not calculate incompatible bot intents.
Verification commands declared by review input (resolve current scripts before dispatch): npm run typecheck; npm run check; npm run test:client; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R22 - Make ordinary CPU target selection team-aware without changing FFA
Scope paths from approved input: shared/src/engine/AI.ts, scripts/checks/ai.mjs, scripts/checks/teams.mjs
- Exclude a same-team tank only when valid team metadata establishes an alliance; undefined/null team values do not make FFA players allies.
- Preserve deterministic target tie breaking and existing phase/death handling. Add team fixtures with nearer allies and farther enemies.
- Do not change verified-duel CPU policies. Coordinate the ordinary bot behavior version with multiplayer compatibility before promotion.
Verification commands declared by review input (resolve current scripts before dispatch): npm run typecheck; npm run check; npm run test:client; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R23 - Cache and execute the complete ordinary network CPU preparation plan
Scope paths from approved input: client/src/client/NetworkClient.ts, client/src/client/NetworkClient.botRetry.test.ts, shared/src/engine/AI.ts, client/src/main.ts
- Place an early pending/generation guard before expensive planning. Reuse a plan for unchanged relevant state/revision; invalidate it after accepted preparation or a relevant state change.
- Represent the small preparation sequence explicitly, including accessory and weapon purchases before the attack. Own it in the existing client, not a second match coordinator.
- Integrate R07 intent/receipt semantics, counting both planner work and committed actions. A transient retry must reuse the same logical intent.
- Keep local visible aiming delays distinct. Test stale callbacks and missing/failed/duplicate echoes without letting a committed no-op preparation wedge the turn.
Verification commands declared by review input (resolve current scripts before dispatch): npm run typecheck; npm run check; npm run test:client; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R24 - Use the client’s actual effective gravity for the trajectory guide
Scope paths from approved input: client/src/main.ts, client/src/renderer/aimGuidePresentation.ts, client/src/renderer/aimGuidePresentation.test.ts, client/src/main.hotSeatProgression.test.ts
- Read existing GameClient.getEffectiveGravity() for the guide. Keep visibility/ownership projection but remove duplicate gravity reconstruction from global turn.
- Use authoritative normalized client setup and handle any unavailable client explicitly; do not silently fall back to a different rules calculation mid-match.
- Add a first/subsequent-round regression using the real client/engine, including an operation-selected sudden-death setting. No physics change is necessary.
Verification commands declared by review input (resolve current scripts before dispatch): npm run typecheck; npm run check; npm run test:client; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R25 - Carry the active power limit through existing human controls and gauges
Scope paths from approved input: client/src/input/InputHandler.ts, client/src/main.ts, client/src/ui/battleConsole/types.ts, client/src/ui/battleConsole/projectState.ts, client/src/ui/battleConsole/components/CompactConsole.tsx, client/src/ui/battleConsole/components/SemanticContractTree.tsx, client/src/ui/battleConsole/pixi/scene.ts
- Extend the existing input/presentation projection with the active permitted power cap; update it immediately after purchases and seat changes, not only at construction.
- Use it consistently for keyboard steps, touch nudges, direct pointer mapping and gauge normalization/readout. Preserve currently selected power where legal.
- Keep verified-duel power policy at its allowed maximum; ordinary Battery capability does not broaden a verified contract.
- Test engine, input, console and real purchase/fire path together, including switching from an upgraded tank to a baseline tank and carrying the cap into a new round.
Verification commands declared by review input (resolve current scripts before dispatch): npm run typecheck; npm run check; npm run test:client; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

### R20 - Accept evidence-backed correction scope without expanding into a rewrite
Scope paths from approved input: Recovery execution ledger, release candidate, docs/SOFTWARE_RECOVERY.md
- Check the independently reviewed fixes and applicable source/browser/database release gates for the approved correction scope. State unexecuted checks as blockers or explicit owner-approved exceptions, never as passes.
- Do not require optional R11 image optimization, R17 physical profiling completion, R18 UI refactor or any withdrawn task to begin product observation. They may be scheduled separately.
- Record exact candidate SHA/artifact, compatibility state and remaining risks. An accepted audit or plan is not an approved production deploy.
- Close the finite approved work; later discoveries become separately triaged tasks rather than reopening an unlimited recovery campaign.
Verification commands declared by review input (resolve current scripts before dispatch): npm run check; npm run test:client; npm run check:edge; npm run test:e2e; npm run build
Acceptance: all mapped AC rows in the spec; fresh parent verification, independent assigned reviewer, and applicable quality reviews. Evidence receipt records base/result SHA, actual model/effort, paths, commands/exit codes, artifact paths, review, remaining risks and rollback.

## R00 baseline evidence
- Integration worktree: C:/Users/brenn/projects/singedTerra-worktrees/evidence-recovery-v2; branch codex/evidence-recovery-v2; source 3902cad662aea03cec913d984d17aa9573b89bd0. Fetched origin/main equals audit SHA. Original checkout remains dirty at 214cf4e7037873c3993d88bfcb3cf3950cb2da2f; preserve all prior worktrees.
- Read-only GitHub evidence: CI 34329078429 and Pages 34329078394 succeeded at audit SHA. Live deploy-meta.json returned the same SHA and run ID. Only open PR #415 belongs to unrelated older checkout.
- Node 24.18.0; Deno 2.8.2; PowerShell 7.6; Python 3.14.6. npm ci exited 0 with zero reported vulnerabilities and no manifest changes; esbuild lifecycle script is not approved and was not enabled.
- ZIP: all 31 SHA256 entries match, independently repeated by reviewer. PowerShell Test-Json accepted the full supplied schema. Separate Python standard-library validation passed unique IDs, reciprocal references, DAG, withdrawn/deferred exclusions, R20 closure, report anchors and no-font policy (43 tasks, 37 findings, 62 sources). Original Python validator cannot run without jsonschema; that command is not claimed as passed.
- Runtime turn_context metadata verifies actual gpt-6-astra/high for /root/r00_review (01a08907-2a2d-7743-ad06-901c8ccfb8ea), gpt-5.6-terra/high for /root/r00_terra_capability (01a08909-cce0-7b71-804c-e1a289129101), and gpt-5.6-sol/high for /root/r00_sol_capability (01a08909-f40f-7d51-8f1a-a165bd9027f4). Evidence is session JSONL metadata under C:/Users/brenn/.codex/sessions/2026/09/09, not agent self-identification. No substitutions.
- Fresh baseline focused client command passed 2 files / 50 tests: npm -w @singedterra/client run test -- src/renderer/aimGuidePresentation.test.ts src/main.hotSeatProgression.test.ts (exit 0). These existing tests do not yet catch R24.
- Docker was initially unavailable; the resolved local database baseline is recorded below. Fresh browser execution and production database/migration-definition parity were not established by R00. Historical CI success does not supply those local/live observations.
- Plan-review challenge: R05 remote rules and R20 release evidence cannot be called complete from local preparation. R06/R08 require actual synchronized PostgreSQL transactions. Historical docs contain stale pacing and exactly-once claims; R01 owns their bounded correction.

## Baseline verification and environment follow-up

- Fresh npm run check completed exit 0 at audit SHA, including pinned verified policy/corpus checks. R02 remains required: separately rerun collapse_flush.mjs exits 0 while required Path B reports SKIPPED because the shot did not kill P2. This green is not terminal-collapse evidence.
- Fresh npm run check:edge completed exit 0: 365 passed, 0 failed. PostgreSQL transaction proof is distinct.
- Docker Desktop backend log identifies failure initializing inference manager at C:/Users/brenn/AppData/Local/Docker/run/dockerInference: inaccessible system reparse point. Hidden Desktop start and CLI start did not restore engine; CLI observation handles stopped after the backend exited. Attempted reversible rename failed without moving the socket. No reset or data deletion. User asked asynchronously to restore Docker; independent work continues.
- Sole current localhost listener is 127.0.0.1:5198 PID58328, served by recovery-final-preview Vite preview. It is not the recovery-v2 candidate; deploy-meta request returned HTML fallback, not provenance. Do not use it to accept changed source. Parent owns any preview replacement and will retain one localhost.
- User restored Docker. Fresh docker version reports server 29.7.2, then npm run check:database exited 0 with actual disposable PostgreSQL FK, rollback, ACL, concurrent-rematch and verified-start/resume regressions. This baseline does not prove the new R06/R08 races, whose tests are still required.
- Original R24 author (Terra/high) recorded right-reason red (3 new failures, 49 existing passes), then focused green (52 passes). Later remediation and the current lease state are recorded in the dispatch table above.

## Parent dispatch correction

Live session turn_context for parent 01a08903-975a-7d03-870c-716e809207fa records gpt-6-astra / medium, including latest active turn, despite the user goal requiring high. Earlier summary assumptions of parent high are withdrawn; worker/reviewer explicit selections remain independently verified. Parent is attempting the supported task follow-up model/effort override to gpt-6-astra/high, then must verify the next actual turn_context before claiming correction. No substitution is approved or claimed.

Final reviewer selections verified: R13 gpt-5.6-sol/high session01a08950-e4ab-7f50-acd3-56901a15b580; R25 gpt-6-astra/high session01a08956-5955-73a3-9a8e-8bd7c6bb3d48; R02 gpt-6-astra/high session01a08957-e3c8-7b60-b095-c8065c66a987.

Next-turn verification now records gpt-6-astra/high in the latest parent turn_context; the supported task override succeeded. The earlier medium-effort history remains disclosed. R02 aggregate is complete with AC007 partial; Sol/high author has the two collapse harnesses and task receipt leased for a necessary-compaction fixture and omitted-flush negative control. Parent owns the second writer slot for integration records and commits.

## Current handoff

Integration is clean after governed R25 commit d8e236a and R13 commit65fc625. R13 commit wrapper initially hit H20 because PowerShell -ne was misread as a commit skip flag; separating the message-file write and plain git commit succeeded with all hooks enabled, no override. Fresh current-turn R25 focused proof92/92 and R13 nine Git regressions/history-classification/secrets/diff checks exited0. No push or PR yet.

R00 corrective preflight executed under verified parent Astra/high:31 package hashes match, full Test-Json schema passes, fetched origin/main remains3902cad662aea03cec913d984d17aa9573b89bd0, integration65fc625, original checkout214cf4e on codex/bottom-instrumentation-rail retains19 dirty/untracked status entries, only openPR415 remains unrelated. Current runtime Node24.18.0/Deno2.8.2/Docker server29.7.2. Prior real disposable database and remote deployment results remain historical baseline evidence, not new-task proof. Fresh independent Astra/high revalidation of this correction is pending; no earlier medium parent work is relabeled.

R04 read-only preparation will use ../recovery-v2-r04 at65fc625; no workflow writer lease while R02 and R21 write. Parent retains ledger ownership and will wait for a writer slot before further edits.

R00 corrective revalidation: fresh Astra/high independent reviewer, triage and aggregate PASS AC001..003 with zero findings; previous medium parent history remains disclosed. Actual reviewer session01a08962-44ac-7381-a078-03971940bd30 verified Astra/high. Additional actual selections verified: R21 completion Sol/high session01a08932-3c7c-7812-8121-1df6311dbc6a; R04 read-only preparation Sol/high session01a08964-e082-7510-99b6-d90ed6094081; R02 final review Astra/high session01a08965-4902-7af3-bb16-553eac954dbc.
