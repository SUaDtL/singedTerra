# Evidence-backed recovery v2 execution ledger

Approved scope: active user goal, 2026-09-09; spec: ../specs/evidence-recovery-v2.md. This is the sole execution-status ledger. Original JSON remains immutable review input. Parent owns integration and this file; task agents return proof without editing this ledger.

## Task status and coverage
| Task | Obligation IDs | Dependencies | Worker / effort | Reviewer / effort | Status |
|---|---|---|---|---|---|
| R00 | AC-001, AC-002, AC-003 |  | gpt-6-astra / high | gpt-6-astra / high | ACCEPTED |
| R01 | AC-004, AC-005, AC-006 | R00 | gpt-6-astra / high | gpt-6-astra / high | ACCEPTED |
| R02 | AC-007, AC-008, AC-009 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | ACCEPTED |
| R03 | AC-010, AC-011, AC-012 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | IN_PROGRESS |
| R04 | AC-013, AC-014, AC-015, AC-016 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | IN_REVIEW |
| R05 | AC-017, AC-018, AC-019 | R04 | gpt-5.6-terra / high | gpt-5.6-sol / high | PENDING |
| R06 | AC-020, AC-021, AC-022, AC-023, AC-024 | R00, R01, R13 | gpt-5.6-sol / xhigh | gpt-6-astra / high | IN_REVIEW |
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
| R21 | AC-065, AC-066, AC-067, AC-068 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | ACCEPTED |
| R22 | AC-069, AC-070, AC-071 | R00, R21 | gpt-5.6-sol / high | gpt-6-astra / high | ACCEPTED |
| R23 | AC-072, AC-073, AC-074, AC-075 | R21, R22, R07 | gpt-5.6-sol / high | gpt-6-astra / high | PENDING |
| R24 | AC-076, AC-077, AC-078 | R00 | gpt-5.6-terra / high | gpt-6-astra / high | ACCEPTED |
| R25 | AC-079, AC-080, AC-081, AC-082 | R00 | gpt-5.6-sol / high | gpt-6-astra / high | ACCEPTED |
| R20 | AC-083, AC-084, AC-085, AC-086 | R00, R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R12, R13, R14, R15, R16, R19, R21, R22, R23, R24, R25 | gpt-6-astra / high | gpt-5.6-sol / high | PENDING |

## Current ownership, 2026-09-10 01:53 local

Parent Astra/high owns integration and records; R03 Sol/high owns only its restored console/test/receipt lease. R04 and R06 are frozen under fresh Astra/high read-only review. No other writer is active. The historical entries below retain prior outcomes; this status table and current section supersede their old ownership statements.

- R22: AC069–071 locally accepted after fresh reviewer 01a089d3-5021-7ab1-a453-4141dd9a1c86, separate triage and aggregate PASS, zero findings across all three matched units. Independent teams/AI and 144-pair actual-planner metadata matrix passed. Parent verified all three source files byte-identical to the frozen author diff, integrated atop ef137055, and ran full check (92032), client (1985: 200 files, 1817 tests), build/typecheck, configured secrets scan (empty), and whitespace checks, all exit0. Logs: C:/Users/brenn/AppData/Local/Temp/recovery-v2-r22-integrated-{check,test-client,build}.log. Governed commit next; multiplayer promotion remains R06/R07/R19-gated.
- R04: original Sol/high froze its correction after regression RED11/4 then GREEN18/18. Parent independently confirmed18/18 and exact raw metadata SHA256 09c1156f823396da6b85ca061e50680725f69e0c4a23256cb459453ef1cca133. Fresh reviewer /root/r04_corrected_review session01a089da-1b1b-7070-a7a1-4e8cf7927b32 is verified Astra/high; full corrected CI-attempt, metadata-binding and rollback graph review is pending. Existing browser proof remains local, not hosted.
- R06: original Sol/xhigh froze the allowlisted structured refusal warning after production-handler RED1 then GREEN1, focused84, full Edge378 and typecheck0. Fresh reviewer /root/r06_corrected_review session01a089da-5a24-7981-bfdb-c2b04fcc5c91 is verified Astra/high. Review and integration remain pending; unchanged SQL's prior parent real-Postgres proof remains distinct. No pass markers yet.
- R03: original /root/r03_preparation session01a0896e-7909-71b3-8cc4-122fe4930fb8 resumed and reverified Sol/high. Parent verified preserved89-line console test diff at dad0c506. Lease: console.spec.ts, BattleConsoleRoot.tsx, mount.tsx, appearanceRuntime.ts, pixi/dynamic-appearance.test.ts and its receipt only. Prepare regression execution, preserve124 expectation rows; browser/server handoff belongs to parent.
- Sole listener remains127.0.0.1:5198, PID35800, serving the unchanged R04 extraction. Original checkout still214cf4e with17modified/2untracked; fetched origin/main remains3902cad. Input manifest hashes reverified. No remote, merge, production or cleanup action.

## Historical dispatch boundaries and verification

Integration: C:/Users/brenn/projects/singedTerra-worktrees/evidence-recovery-v2, branch codex/evidence-recovery-v2; audit baseline 3902cad662aea03cec913d984d17aa9573b89bd0. R00/R01 records committed as aad9dce597f64e2f2befe1aef1ed533f9dea03fd and R24 as df9d9958e88becd1a2bef51c4eb1ced2f49a91c3 after governed commit gates, each with a clean resulting tree. Parent alone owns this ledger, integration, commits, and the sole localhost. Task worktrees below share the audit baseline; task acceptance is distinct from release. No production or remote-setting action has occurred.

| Task | Current ownership and evidence |
|---|---|
| R00 | ACCEPTED after package/schema/graph/source/provenance checks and independent Astra/high review. Detailed baseline receipts remain below. |
| R02 | ACCEPTED, integrated atop65fc625 after source correction. Fresh final Astra/high review, triage, aggregate PASS AC007..009; sole LOW winner wording corrected in receipt. Parent confirms normal0, nonlethal1, actual resolver-deferral1, omitted-flush1 with intended diagnostics: settled pre-shot, unsupported dirt before one real pending flush, settled terminal terrain. Integrated client200files1789tests, build/typecheck and full check all exit0; session50562 completed. Logs ../recovery-v2-r02-integrated-{client,build,check}.log. Committed as dad0c506f3b780b4ed6eb362df89a39c1161f509 with a clean integration tree; all task source leases released. |
| R01 | Seven reviewed documents plus task receipt integrated. Fresh Astra/high review, triage, and aggregate PASS AC-004..006. Parent verifies 20 relative links, preserved history/frontmatter, diff-check and secrets scan exit 0. Commit checks: test:client 200 files/1776 tests exit 0; npm run check exit 0, retained in ../recovery-v2-r01-commit-client.log and ../recovery-v2-r01-commit-check.log. One LOW existing version-prose discrepancy remains assigned R19; historical ADR-0018 approval receipt is unknown. |
| R24 | Four-file fix and receipt integrated after R25 released shared paths. Fresh final Astra/high review, triage, aggregate PASS AC-076..078 with zero findings. Parent focused 53/53 exit 0; final integrated coverage/client suite 200 files/1779 tests exit 0, Windows lines 93.19% (8112/8704) and branches 81.62% (4771/5845). Full npm run check and build/typecheck exit 0. Logs: ../recovery-v2-r24-integrated-{coverage,check,build}.log. Preserves exact D09 plus real operation-selected opening/escalated/reset guide versus live projectile regression. Live browser/Supabase/verified replay is not claimed by route mocks. |
| R21 | Worktree ../recovery-v2-r21, branch codex/recovery-v2-r21. Tier-filter fix plus four-file tests/receipt is CHANGES_REQUIRED. Fresh Astra/high review, triage, aggregate: HIGH ineffective preparation unchecked at NetworkClient.ts:1266/1292 and main.ts:1070; MEDIUM local fixture bypasses driver and failed preparation is untested. AC-068 incomplete; original receipt overstates coverage. AC-065..067 passed. Parent AI harness, NetworkClient 8/8 and complete npm run check exit 0; ../recovery-v2-r21-check.log. Completion worktree ../recovery-v2-r21-completion, branch codex/recovery-v2-r21-completion, now starts at65fc625 with the initial four-file diff preserved; original worktree retained. Sol/high /root/r21_recovery_preparation actively owns the six source/test paths plus receipt; parent integration writes are nonoverlapping. Required driver-outcome handling stays R21; R22 waits. Ordinary mixed-client policy compatibility remains R06/R07/R19's release gate. |
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

Integration HEAD dad0c506f3b780b4ed6eb362df89a39c1161f509 contains accepted R00/R01/R24/R25/R13/R02. R02 governed commit passed full integrated check, client 200 files/1789 tests, build/typecheck, secrets and diff checks. Both normal collapse harnesses exit0; nonlethal, actual resolver-deferral and omitted-flush controls each exit1 with the intended diagnostic. No push or PR yet. Only this ledger has subsequent uncommitted updates.

Parent latest actual turn_context is Astra/high. R00 corrective preflight reverified31 package hashes, full schema, origin/main3902cad662aea03cec913d984d17aa9573b89bd0, original dirty checkout214cf4e with19 entries and unrelated openPR415. Fresh Astra/high independent review, triage and aggregate PASS AC001..003 with zero findings; earlier medium parent history remains disclosed. Actual reviewer session01a08962-44ac-7381-a078-03971940bd30 verified Astra/high.

R21 six source/test paths and corrected receipt are frozen in ../recovery-v2-r21-completion at65fc625; author final read-only inspection is complete and its source lease is released. New driver regressions first had62 passes and3 intended failures, then passed68. Parent additionally found the mutable-state timer comparison; an in-place same-seat later-turn regression failed57pass/1fail before primitive round/turn/actor capture. Author post-fix full client200files1798, typecheck/check/build/coverage exit0 (93.22 lines,81.79 branches). Parent fresh focused main+NetworkClient68/68 and AI harness exit0 on frozen source. Fresh Astra/high /root/r21_completion_review completed raw review, separate triage and aggregate BLOCKING_FINDINGS: one HIGH canonical-outcome gap. Observer/resumed clients ignore ineffective buys without their own pending attempt and choose a different next intent; AC068 remains incomplete. Reassessment after two failed AC068 cycles replaces local transport-attempt ownership with reconstruction from canonical replay/history, plus two-driver/resume and conflicting-settlement regressions. R07 protocol and R23 full-plan cache remain separate. Prior two spawn attempts hit the runtime thread limit before successful dispatch. Actual session01a0897a-c5b8-7db1-96b0-160e2e05eab1 metadata verifies Astra/high. No substitute/reused review, no integration yet. Original failed-preparation review findings remain open until this review passes.

R04 active Sol/high writer in ../recovery-v2-r04 at65fc625 owns .github/workflows/ci.yml and deploy-pages.yml; scripts/ci/releaseCandidate.mjs, releaseCandidate.test.mjs and releaseWorkflow.test.mjs; scripts/checks/pages_freshness.mjs; playwright.product-completion.config.ts; playwright.config.ts; e2e/lobby-layout.spec.ts; and task receipt. Necessary config/test expansions bind both existing browser suites to the exact Pages candidate with no rebuild, preserve default same-origin expectations while explicitly checking configured candidate backend origin, and prevent test requests reaching production. Parent retains sole server control. R13 workflow checks must remain intact. No production or rollback dispatch is authorized.

R03 read-only preparation completed, no writes. Accepted later write proposal: e2e/product-completion/console.spec.ts, BattleConsoleRoot.tsx, mount.tsx, appearanceRuntime.ts removal, pixi/dynamic-appearance.test.ts, and task receipt. Preserve existing real geometry, purchase, disabled/focus and other interaction assertions and existing CI route. Remove unused synthetic appearance hook and dependent resolver test; retain honestly named registry-shape checks. Expectation JSON remains124 rows/hash426FB13F4E0FECF37960E77A7E3BD04EB028168A5F556A03E8F7E986629D1738. Parent created isolated ../recovery-v2-r03 on codex/recovery-v2-r03 atdad0c50 for implementation; R04 config paths are excluded. R03 Sol/high implementation started in the same task context (latest actual effort reverified), added89 lines only to console.spec.ts, then froze and released its lease for prioritized R21 remediation. No tests/build/server ran, no live handle. All prior assertions retained; runtime cleanup and red/green evidence remain pending. Completed agent was interrupted only to try to release runtime capacity; its preparation is preserved.

Actual sessions verified from latest turn_context: R21 Sol/high01a08932-3c7c-7812-8121-1df6311dbc6a; R04 Sol/high01a08964-e082-7510-99b6-d90ed6094081; R03 Sol/high01a0896e-7909-71b3-8cc4-122fe4930fb8; R02 final review Astra/high01a08965-4902-7af3-bb16-553eac954dbc. R03 is frozen/read-only. R04 retains its writer lease; parent records the R21 reassessment, then returns the second writer slot to Sol/high R21 remediation on NetworkClient.ts, NetworkClient.botRetry.test.ts and its receipt only. Other R21 source remains frozen. No integration until fresh final review passes.

Prior real disposable database and remote deployment results remain historical baseline evidence, not proof of new R06/R08 changes. R13 commit initially hit H20 from a compound wrapper; plain git commit succeeded with hooks enabled and no override. No destructive cleanup, remote settings, merge, release or production action has occurred.

### Active execution update, 2026-09-10

This update supersedes the prior handoff's active leases and localhost identity. Parent latest turn_context is independently reverified gpt-6-astra/high; integration remains dad0c506 with only this ledger dirty. The preceding startup-only turn made no execution progress; execution resumed against current source and live handles.

- R21 canonical remediation v2 is frozen in recovery-v2-r21-completion. Author Sol/high reports RED10pass/4fail then Network15/15, combined drivers73/73, full client200files1803tests, typecheck/check/build/coverage/diff0 (93.13 lines/81.56 branches). The prior HIGH remains open pending fresh review. New independent /root/r21_canonical_review session01a08996-6d66-7141-9d00-cbb651c9ff09 is dispatched and verified Astra/high, read-only. No R21 writer lease or integration yet.
- R04 Sol/high remains a writer on its earlier exact paths plus e2e/portrait-gate.spec.ts and e2e/account-progression-summary.spec.ts. Actual candidate general run:264pass/14skip/67fail at16workers. Diagnostic at2workers:45pass/12fail, connection-refused class absent. Portrait's absolute-root navigation and account fixture's localhost auth key independently reproduce candidate-base/config failures; bounded environment fallbacks authorized, all assertions retained. Connection pressure is an inference, not proven cause. Full general and product matrix acceptance remains incomplete.
- Sole preview is parent-owned Python PID15784, exec87317, 127.0.0.1:5198, serving C:/Users/brenn/AppData/Local/Temp/singedterra-r04-b7009c87561d4280b9301adabcd73cf3/extracted at /singedTerra/. Live PID reverified. Exact extracted fixture digest d28d8f157d878637ee0bc6c89e1bd3dc84eb3c1845520bc5b01c873b9b0721a6; source65fc625, synthetic run4040001/CI3030001 and https://candidate-test.supabase.co config are explicit local fixture values, not hosted CI or production proof. Parent previously byte-compared HTML, provenance, JS and CSS to the extraction. No restart occurred during failed tests.
- R06 read-only preparation completed with actual Sol/xhigh session01a08985-1171-7fa2-8e3f-d3473f47553b. Parent created isolated recovery-v2-r06 atdad0c506 and grants the second writer lease after this ledger edit: new021 migration; _shared/commandProtocol.ts and tests/database.types.ts; submit_action handler/validation and existing tests; shared/net/roomCommand.ts and replay.ts; lockstep and disposable database harness; necessary create_room/join_room/restart_game protocol-advertisement handlers and their existing tests; task receipt. No historical SQL, client NetworkClient, workflows or lockfile writes. Protocolv2 is opt-in; absent staysv1; no in-place upgrade. One room lock must cover credential/actor/revision/dedup/append/cursor/status. Human IDs persist across retries; CPU IDs share room/revision/actor/kind scope, excluding payload. Room/protocol/intent uniqueness must reject changed-actor reuse as well as changed payload; competing CPU submitter IDs must not make identical logical commands conflict. Real synchronized disposable-Postgres tests are mandatory. Migration/Edge production remains unapproved.
- R03 remains frozen with its89-line test-only partial diff and no active handle. R04 has now frozen every source/receipt path and released its writer lease while continuing browser checks: product matrix81pass/19expectedskip; general session51814 still running at2workers. Latest helper/proxy assertions require post-edit runs. Parent temporarily owns the second writer slot for this update alongside R06; it will transfer to R21 remediation only after reviewer funnel completion. R22 awaits accepted R21.
- Parent independently reran R21 combined driver73/73 and AI harness0 on frozen v2. Fresh reviewer01a08996 completed raw review, separate triage and aggregate BLOCKING_FINDINGS with one HIGH at NetworkClient.ts:1247/1456: a different same-turn canonical row clears an exact still-unresolved request, permitting a duplicate submission. Reproduced both for failed preparation and successful Nuke inventory with no engine fault injection. This is a client guard regression, not deferrable server deduplication. Canonical outcome derivation now addresses the earlier observer/history finding, but AC068 remains incomplete. Reassessment separates canonical progress from transport settlement and requires pending/accepted/failed/conflict crossed with matching/different rows, both arrival orders, and stale actor/round/turn callbacks. R04 released every writer path; parent finishes this update then dispatches original Sol/high R21 author on NetworkClient.ts, botRetry.test.ts and receipt only, alongside R06. Other R21 paths stay frozen; another fresh Astra/high review is mandatory.
- R04 full general session51814 ended324pass/16expectedskip/5fail. Three diagnosed failures came from the last hardcoded candidate auth key in e2e/live-match-diagnostics.spec.ts; bounded fallback authorized and applied, then frozen. Two isolated readiness failures remain under rerun/diagnosis. Parent repository-wide auth-key search confirms account/verified already use the optional key. Strengthened proxy control initially returned204 and navigation aborted; corrected to200 tiny body, preserving actual ERR_PROXY_CONNECTION_FAILED assertion. All R04 paths are again frozen; product81pass/19skip and exact candidate bytes remain unchanged. Receipt and final review are pending.

### Current verification and ownership

- Integration remains dad0c506; parent owns pending ledger/sprint-log and R04 receipt writes as the second writer, alongside R06. Original checkout is still214cf4e with17modified/2untracked; fresh fetch again shows origin/main3902cad and only unrelated PR415. No merge, push, new PR or production change.
- R21 completion update3 is fully frozen, including receipt. Sol/high RED18pass/10fail reproduced duplicate POSTs; GREEN network28/28 and combined86/86. Author full client200files1816, check/typecheck/build/diff/coverage0 (93.17 lines81.82 branches). New fresh /root/r21_transport_review session01a089ae-0d8f-7fc3-8f8d-d651a229efaa is independently verified Astra/high; read-only review ongoing, focused86/86 passed. Both earlier HIGH findings remain preserved in the R21 receipt; no acceptance yet. R21 has no writer lease.
- R04 parent final-fixture Python general37418 ended323pass/16skip/6fail. After two failed cycles, parent captured trace22106: three static Pixi dependencies of the lazy mount received ERR_CONNECTION_REFUSED while main/mount JS and CSS returned200. Preserved trace: C:/Users/brenn/AppData/Local/Temp/recovery-v2-r04-full-traces/battlefield-backdrop-autho-d24fe-ing-the-procedural-fallback-desktop-fine/trace.zip. Python queue_size5 and burst refusals support a saturation inference; queue depth was not measured. Isolated20/20 raw and40/40 tracked Quick Duel repetitions did not substitute for full-suite acceptance. R10 owns the exposed rejected-import/semantic-readiness resilience seam.
- Parent verified/stopped only Python PID15784 after all tests were terminal and replaced it with workflow-equivalent Vite PID35800, exec26925, same5198/base, explicit outDir to the same extraction. No rebuild. assertCandidate and nine served-file byte comparisons passed, including all three refused modules. Current authoritative local payload remains d28d8f157d878637ee0bc6c89e1bd3dc84eb3c1845520bc5b01c873b9b0721a6. The author's corrupted final digest text was rejected and corrected from actual artifact metadata.
- R04 Vite full general37923 is GREEN329pass/16expectedskip, exit0,3.1min; log C:/Users/brenn/AppData/Local/Temp/recovery-v2-r04-vite-general.log. Parent product matrix89733 is still running on the same artifact/server; prior author product81pass/19skip remains distinct. Parent helper/policy12/12 exit0. Parent persisted the source/evidence receipt at recovery-v2-r04/.codearbiter/reports/recovery-v2-r04-evidence.md with author-vs-parent boundaries. Fresh R04 Astra review is pending after repeated runtime capacity refusals; no model/context substitution. Fresh R21 dispatch succeeded once other task activity completed.
- R06 actual Sol/xhigh writer: legacy real-DB RED showed both persistent psql connections pre-read1:0:0 before two rows were appended (expected1). Current author database green covers one logical CPU row/identical receipt, actor/payload reuse, stale revision, token/valid-only CPU authorization, turn-neutral revisions, finished retry, both action/finish orders, SQL-null constraints and anon ACL. Targeted Edge122/122 and typecheck green; full check and Edge still being completed. New necessary exact test lease: supabase/functions/_shared/database.types.test.ts for the approved contract additions. Any authenticated non-opener may initiate next_round with transition-initiator attribution; combat and shop retain distinct actor binding. Parent requested explicit NULL and invalid AI metadata negatives before freeze. Production schema and protocol rollout remain unapproved.

R04 parent product89733 is now terminal GREEN81pass/19expectedskip,2.8min, alongside full general329pass/16skip. Post-both-suites assertCandidate source/run/config/payload verification exit0. Both logs and exact fixture/transport boundaries are persisted in the R04 receipt, now complete for local review; hosted proof and independent review remain pending. Current sole server remains Vite35800/26925.

R21 fresh reviewer01a089ae independently passed86driver tests and complete check including verified corpora, and found no remaining transport HIGH. It reproduced one MEDIUM direct AC067 regression: main.ts1080 defaults omitted armsLevel to0 while the actual engine defaults4; new AI purchase filtering therefore suppresses valid default-room restocks. Real planner/engine probe exits1. Generic triage may classify MEDIUM deferrable, but parent requires this in-scope AC067 fix before acceptance. Correct default normalization and a real-planner production-driver regression are the bounded next correction; other R21 paths stay frozen. Triage/aggregation is ongoing; no writer lease returned yet.

R21 reviewer01a089ae completed separate triage and aggregation: generic PASS with one MEDIUM/DEFERRABLE, explicitly AC067 incomplete and no authorized deferral. Parent keeps R21 CHANGES_REQUIRED and returns the second writer slot to original Sol/high author for main.ts, main.hotSeatProgression.test.ts and the R21 receipt only. The already-reviewed AI/network/transport source remains frozen. R06 retains the other writer. Parent ledger/sprint-log and the complete R04 source/receipt are now frozen. Another fresh Astra/high review is required after the default-setting correction. R04 remains ready for independent source/local-evidence review with both browser suites green and unchanged bytes; hosted candidate evidence remains pending.

### Verified dispatch and freeze, 2026-09-10 01:17 local

Latest parent turn_context again verifies Astra/high. The preceding startup-only turn was no progress; this continuation has revalidated HEAD dad0c506 and resumed execution. R21 completion update4 is fully frozen and its author released all seven paths. The real default-tier production regression first failed58pass/1fail, then passed59/59 using actual computeAiPlan, HotSeatClient and GameEngine through main: Nuke purchase, ammo1, fire and turn advance. Author final full client200files1817, check/typecheck/build/coverage/diff0; coverage93.17lines81.82branches. Parent independently reran both production-driver files87/87, exit0. Fresh read-only /root/r21_default_review session01a089be-a734-7dc3-be37-2f02939d9542 is verified Astra/high; AC065..068 remain unaccepted pending review/integration.

Fresh read-only /root/r04_candidate_review session01a089be-2e38-7b81-a9c7-45de39b95229 is verified Astra/high, reviewing the complete frozen diff and receipt. R04 local general329/16 and product81/19 results remain exact-artifact evidence, not hosted proof. Its configured secret scanner reports two unchanged synthetic account-fixture token literals because it scans entire changed files; parent confirmed identical HEAD values and mock response sinks. Auth/security review must classify these openly; no scanner modification, obfuscation, override or pass marker is authorized merely to silence matches.

Active children: R06 Sol/xhigh writer, R04 Astra/high read-only reviewer, R21 Astra/high read-only reviewer. Parent holds the second writer slot for canonical records and later nonoverlapping integration. R03 stays frozen, R22 waits for accepted R21. R06 has reported final Edge377, client1789, real database and check/build/typecheck green in its draft receipt; exact fixture-scan disposition and full freeze are pending. Parent requested that synthetic fixture matches remain visible for review rather than being rewritten to evade detection. No new commit, push, PR, production or remote-setting action.

### Integration and review outcomes, 2026-09-10 01:25 local

R21 final reviewer01a089be-a734 completed fresh raw review, separate triage and aggregate PASS, zero findings, all AC065..068 covered. The parent verified that all six source baseline blobs match integration dad0c506, copied the seven reviewed files byte-for-byte, and reran full integrated check (exec25173), client (exec19401:200files1817tests), build/typecheck, configured secrets scan (empty result), and diff check: all exit0. Logs are C:/Users/brenn/AppData/Local/Temp/recovery-v2-r21-integrated-{check,test-client,build}.log. R21 is locally ACCEPTED and prepared for the authorized governed commit; ordinary mixed-client compatibility remains R06/R07/R19's release blocker. No production claim.

R04 reviewer01a089be-2e38 completed four bounded units, separate triage and aggregate BLOCKING_FINDINGS: HIGH AC013, publish does not revalidate an initially successful CI run after a pending/failed rerun; MEDIUM AC014, GitHub suppresses a secret-valued origin job output and missing expected origin silently bypasses comparison. Both are required corrections. Auth review classified the two unchanged synthetic session fixtures as noncredential false positives; no marker or override. Original Sol/high author session01a08964-e082 has been reactivated and actual effort reverified. Its exclusive remediation lease is deploy-pages.yml, releaseCandidate.mjs and its test, releaseWorkflow.test.mjs, pages_freshness.mjs only if required, and R04 receipt. Other R04 paths and exact local artifact remain frozen. Require regression-first CI-attempt revalidation and complete metadata binding through a digest that survives masking, preserving rollback configuration and build-once bytes; then a NEW reviewer.

R06 author froze all21 paths and restored plain synthetic test fixtures after the parent rejected scanner-avoidance restructuring. Seven raw scanner matches remain for honest auth review. Parent independent real check:database exec67073 exited0 and check:edge exited0 with377passed; Edge log C:/Users/brenn/AppData/Local/Temp/recovery-v2-r06-parent-edge.log. Test connection labels are historical barrier labels, not live handles. Fresh read-only /root/r06_transaction_review session01a089c3-0d08-7a63-9e13-a171d752d00b is verified Astra/high and owns migration/security/auth/coverage/architecture review. R06 remains unaccepted. Current writers are parent integration/records and R04 remediation; R06 review is read-only. R03 is frozen; R22 may start after the R21 commit and explicit writer handoff.

R21 governed commit ef137055058af4a73bf5f0933d989cf3da48d3f2 succeeded with hooks enabled; immediate git status was clean. It contains the reviewed CPU correction, source tests and recovery records. Parent created isolated recovery-v2-r22 on codex/recovery-v2-r22 at that exact commit. Current nearestEnemy still excludes only self/dead tanks, confirming R22 is not already fixed. R22 is READY for exact Sol/high implementation on shared/src/engine/AI.ts, scripts/checks/ai.mjs, scripts/checks/teams.mjs and its receipt only. Preserve R21 changes, valid-team-only alliance semantics, FFA/tie behavior, damage policy and pinned verified CPU policies. After dispatch the parent releases its writer slot; R04 and R22 will be the only writers, and the canonical ledger freezes until a handoff. Fresh Astra/high review is required after implementation. R06 remains read-only under independent review.

### R22 freeze and R06 preservation correction

R22 worker /root/r22_team_targeting session01a089c7-3100-7a53-a23c-76e8e1413901 was verified Sol/high. It froze and released all four leased paths at unchanged base ef137055. The new teams harness first exited1 for targeting a nearer12hp ally instead of a farther100hp enemy and for planning against surviving allies only. Existing team assertions remained green. The minimal fix reuses normalizeTeamId and excludes matching valid teams only. Targeted teams and AI now exit0, including null/undefined/invalid FFA metadata, tie order and dead-target handling. Author full check/typecheck/client200files1817/build/diff all exit0, preserving verified corpora and R21. Its exact receipt is recovery-v2-r22/.codearbiter/reports/recovery-v2-r22-evidence.md. Fresh Astra/high review is the next step; no R22 acceptance yet.

R06 independent reviewer01a089c3-0d08 completed all five units. Separate parent finding-triage and verdict aggregation, performed read-only after a runtime refusal to reactivate the reviewer, yielded generic PASS with one MEDIUM/DEFERRABLE R06-REV-01: v2's early RPC response removes the structured turn-gate warning retained by ADR-0008. No direct AC020..024 gap was found; migration/security/auth/coverage had explicit no-finding results. The seven synthetic scanner matches were classified noncredentials. Parent requires the small observability-preservation correction before integration. Next exact Sol/xhigh author lease: submit_action/index.ts, index.test.ts and live.test.ts as needed, plus R06 receipt only. Use public room/actor context and the locked refusal code; test that no token, raw request or raw RPC data reaches logs. No extra room pre-read or migration change. R04 keeps its workflow/helper remediation lease. Parent finishes these records, then transfers the second writer slot to R06; R22 remains read-only for review.

Read-only R15 preparation dispatch to the exact Terra/high worker was refused by runtime capacity; no agent or substitution resulted. Parent inspection identified the existing scripted splash removals in e2e/support.ts, the real accessible splash dismissal control in Splash.ts, Chromium-only current CI installation, and missing failure artifact uploads. Local Firefox/WebKit directories exist but are not execution evidence. No R15 implementation or acceptance occurred.
