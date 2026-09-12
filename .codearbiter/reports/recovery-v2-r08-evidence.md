# R08 — atomic casual completion evidence

**Task:** R08 — Make room completion and participant-reported score persistence atomic

**Base SHA:** `c7ab4912973cafaed529914890ff0781e41b1946`

**Result SHA:** uncommitted frozen working tree based on the base SHA; parent integration will identify the resulting commit

**Branch:** author `codex/recovery-v2-r08`; intended integration `codex/evidence-recovery-v2`

**Worker:** session `01a09583-e3df-75d2-9674-a5347577a2bd`, `gpt-5.6-sol` / `high` (runtime selection independently verified by the parent)
**Date:** 2026-09-12

## Result and transaction contract

Migration `022_atomic_casual_completion.sql` adds an additive casual-completion receipt to `match_scores` and the service-role-only `finish_casual_match_v1` RPC. The RPC locks the room row with `FOR UPDATE`, authenticates the caller against `room_seats`, validates the stored roster and complete score report, derives the winner, records the current action-log revision, writes the score receipt, and marks the room finished in one transaction. A score insert failure therefore rolls back the room transition.

The receipt carries `completion_version=1`, `completion_status`, `terminal_revision`, and the fixed evidence label `casual_participant_reported`. A database trigger makes every version-one receipt immutable. An identical retry after a lost response returns the stored receipt, including its original timestamp. A changed report returns `completion_conflict`. If legacy room and score winners disagree, the RPC and claim handler return `completion_dispute`; they never publish a mixed winner.

Strict reports contain exactly two to four unique `p1` through `pN` rows. Round wins and kills are bounded integers, damage is finite and bounded, and the scoreboard is canonicalized into roster order with stored player names. Free-for-all winners are unique round-win leaders. Four-seat team winners use the engine's alternating-seat teams and require teammates to share the same round-win total. Draw receipts preserve an explicit null winner.

`finish_game` now performs one RPC call instead of updating the room and best-effort-upserting a score in separate statements. It rejects malformed supplied reports before storage and exposes bounded typed errors. Persistence remains outside local terminal animation and deterministic gameplay; no engine, renderer, or verified-completion path changed.

Migration 022 also forward-replaces the supported migration-004 `submit_room_action` function without changing its six-argument integer API, security-invoker mode, sequence allocation, cursor behavior, or service-role-only grant. It now reads room status from the row held `FOR UPDATE` and rejects a non-active room before sequence allocation or insertion. This closes the legacy Edge handler's active-room preread race without altering the immutable migration-004 file.

## Legacy, claim, and trust policy

Historical rows acquire `completion_version=NULL`, `completion_status=legacy_unvalidated`, and the casual evidence label. A structurally coherent legacy row can be linked only as participant-reported evidence. A malformed legacy row returns typed, retryable `legacy_score_malformed`; a valid same-winner completion retry can repair it into an immutable version-one receipt. A finished legacy room with no score can similarly receive a coherent receipt.

An old finish client that supplies no scoreboard still completes atomically, but the stored receipt is explicitly `score_absent` with an empty board. It is never labeled `complete`. Claiming such a match can link the authenticated seat at the same casual trust ceiling; it does not create or modify verified evidence.

`claim_match` now requires a finished room and a casual score receipt, checks room/score and score-derived winner coherence, then derives the account and tank identity from Supabase Auth plus the stored roster. Its responses expose the casual evidence label and typed readiness, malformed-receipt, dispute, and uniqueness errors. The client preserves compatibility with successful old responses that omitted evidence, rejects any explicit non-casual evidence, and surfaces typed retryability. Account linkage can never promote casual evidence to replay-verified evidence.

## Compatibility and rollout boundary

This work performed no production mutation. The safe rollout order is:

1. apply migration 022 after migration 021 is present;
2. deploy `finish_game` and `claim_match` against that schema;
3. only then publish the client-bearing recovery integration.

The third step matters because merging the recovery branch to the Pages source automatically publishes the client, and the integrated R07 client enables command protocol v2. R14 and the owner must provide and approve the exact backend-first refs before any merge or deployment proposal. This receipt does not broaden release-workflow scope.

Before any version-one casual receipt exists, rollback may restore the old handlers and remove unused migration-022 objects in a separately reviewed schema operation. After any receipt exists, preserve it and fix forward with a new additive migration. Never edit migration 022 after application. Old handler inserts remain distinguishable as `legacy_unvalidated` during a staged backend rollout.

## Regression-first and database evidence

Production behavior was first exercised under failing regressions:

- the focused Deno suite exited 1 with 25 passed and 6 failed because the legacy sanitizer coerced invalid numbers, admitted incomplete or duplicate rosters, and claim responses lacked the required casual evidence/readiness contract;
- the focused client suite exited 1 with 6 passed and 2 failed because the client accepted a forged `verified_replay_v2` evidence label and reduced typed readiness to a generic HTTP error;
- the real database harness exited 1 only after applying all prior migrations and running the existing R06 cases because `finish_casual_match_v1` did not exist.

The green database oracle starts the reviewed pinned PostgreSQL 15 image `postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b` with `--network none` and no published ports. Docker client and server were both freshly observed at 29.7.2. It applies migrations 001–004, 010, and 016–022 to a disposable database and invokes the production RPCs through independent persistent `psql` connections.

The database suite proves:

- completion-first holds the room lock; a command that preread active waits, returns `room_not_active`, appends no action, and leaves terminal revision 0;
- action-first holds the same room lock; completion waits, then stores the committed action at terminal revision 1;
- contradictory synchronized reporters yield one receipt and one explicit conflict with coherent room/score winners;
- a forced score-write failure rolls back both score and room transition;
- an identical response-loss retry returns byte-identical JSON and one stored row;
- direct mutation of a version-one receipt raises `casual_completion_receipt_immutable`;
- a hosted-style `service_role` executes the complete nested RPC path while `anon` is denied;
- duplicate rosters, incomplete/duplicate scoreboards, out-of-range values, and winner mismatches leave an active room unchanged;
- draw, alternating-team winner, absent-score, lost legacy score, and malformed legacy repair cases follow the declared policy;
- the verified result table remains unchanged.

## Commands and results

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | exit 0; 178 locked packages installed, 0 vulnerabilities, no manifest or lockfile change |
| focused pre-fix Deno finish/claim suite | exit 1; 25 passed, 6 failed for the intended legacy behavior |
| focused pre-fix client claim suite | exit 1; 6 passed, 2 failed for forged evidence and untyped readiness |
| pre-fix `npm run check:database` | exit 1 after prior real PostgreSQL cases; atomic completion RPC absent |
| final focused finish/claim/type Deno suite | exit 0; 42 passed |
| final focused client claim suite | exit 0; 9 passed |
| pre-review `npm run check:database` | exit 0; final states passed, but the race harness had not observed the waiter blocked before releasing the holder |
| `npm run test:client` | exit 0; 200 files / 1,819 tests passed |
| `npm run check` | exit 0; typecheck and complete deterministic/static harness chain passed |
| first post-review legacy-shape regression | exit 1; `null` was non-retryable before legacy classification, with object/string cases behind it |
| corrected focused claim suite | exit 0; 26 passed, including three legacy and three versioned malformed JSON shapes |
| corrected `npm run check:database` | exit 0; observed completion-first PID 695 blocked by 688 and action-first PID 730 blocked by 723 before release |
| corrected `npm run check:edge` | exit 0; 392 passed |
| corrected `npm run check` | exit 0; typecheck and complete deterministic/static harness chain passed |
| corrected `npm run typecheck` | exit 0 |
| second-review legacy v1 database regression | exit 1; late call appended one row and completion-first ended `finished:0:1`; action-first control was `finished:1:1` |
| corrected v1/v2 `npm run check:database` | exit 0; four action/finish wait relationships observed before release; legacy completion-first rejected and action-first terminal revision matched one action |
| corrected v1 full `npm run check:edge` | exit 0; 392 passed |
| corrected v1 `npm run typecheck` | exit 0 |
| first corrected v1 `npm run check` attempt | intentionally interrupted before the wall-clock benchmark when concurrent browser workers were reported; exit 1 from Ctrl-C, no test failure, not evidence |
| quiet-window corrected v1 `npm run check` | exit 0; session 70113 after browser-worker closure; benchmark maximum 71.4791 ms / 100 ms |
| final coverage focused finish handler | exit 0; 7 passed, including typed 403 mapping for both completion authorization errors |
| final coverage `npm run check:database` | exit 0; three service-role authorization refusals preserved `active:NULL:0:0`; all synchronized v1/v2 cases retained |
| final coverage `npm run check:edge` | exit 0; 393 passed |
| final coverage `npm run typecheck` | exit 0 |
| `git diff --check` | exit 0 |

No build, server, production database connection, migration push, Edge deployment, live-room action, marker, commit, or remote action occurred.

## Fresh-review corrections

Fresh independent Astra/high review session `01a095a7-545c-7af1-9a1c-81305e6dda86` completed five matched units, separate triage, and aggregate verdict with a generic PASS plus two MEDIUM findings that the parent required for AC029/AC032.

The first finding identified that receipt parsing required an array before reading `completion_status`. Consequently legacy JSON `null`, `{}`, and `"invalid"` could be reported as non-retryable `match_receipt_malformed`, even though the SQL repair path accepts a corrected same-winner report. The real handler regression failed first on `null`. Receipt parsing now validates the trusted legacy envelope before scoreboard shape, so all three legacy shapes return retryable `legacy_score_malformed`. The same shapes on version-one receipts remain non-retryable `match_receipt_malformed`, and forged evidence still fails before linkage.

The second finding correctly limited the pre-review race evidence. Those cases queued the competing RPC and immediately committed the holder; their final-state assertions were valid, but they did not prove the competing backend had reached the row-lock wait before release. The corrected harness obtains each persistent session's actual `pg_backend_pid()`, then polls `pg_blocking_pids(waiter_pid)` for the intended holder with a bounded 30-second timeout. It releases the holder only after observing that exact relationship. The corrected disposable run emitted `completion-first` holder/waiter PIDs 688/695 and `action-first` holder/waiter PIDs 723/730, then passed the existing stale-read and final-state assertions. These PIDs are ephemeral evidence from that run; the enforced relationship is the durable oracle.

## Second fresh-review correction: supported legacy admission

Fresh independent Astra/high review session `01a095b5-fdc1-7912-b547-dd7cc7ff5fb6` found that the v2 concurrency proof did not cover the still-supported v1 action RPC. Migration 004 already took the room lock, but it trusted the legacy Edge handler's earlier active-room read and did not recheck status after acquiring that lock.

The new disposable database regression ran before the correction and observed all intended wait relationships. A direct v1 call after completion returned sequence 0 and appended one action. In the synchronized completion-first schedule, holder PID 781 blocked waiter PID 788, then the waiter appended and left `finished:0:1`. The action-first control, holder PID 816 blocking waiter PID 823, correctly left `finished:1:1`. The aggregate assertion therefore exited 1 for the exact late-call and completion-first defects.

After the forward replacement in migration 022, the same production migration chain and RPCs passed. The final corrected run observed v2 holder/waiter pairs 688/695 and 723/730, legacy completion-first 793/800, and legacy action-first 828/835 before release. The legacy calls ran under a hosted-style `service_role`. Catalog assertions independently preserved integer return type, security-invoker mode, default search path, and service-only execution. A late v1 RPC and completion-first v1 waiter now raise before insertion, leaving `finished:0:0`; action-first still commits one canonical action and completion stores terminal revision 1 as `finished:1:1`.

## Final coverage-only correction

Fresh independent Astra/high review session `01a095d4-6b93-7ab2-850f-22f9b5e24472` completed five matched units, separate triage, and aggregate PASS with one MEDIUM/DEFERRABLE coverage finding, R08-COV-001. It identified no demonstrated runtime defect: the completion RPC's membership and seat-token authorization branches lacked a negative real-database oracle.

No production or migration source changed for this correction, and no artificial RED is claimed. The disposable PostgreSQL harness now invokes the production RPC as `service_role` with three hostile credentials: a wrong token for a target-room member, a token valid only for a different room and seat, and that foreign seat as a nonmember. The first two return `invalid_seat_token`; the third returns `not_room_member`. Immediately after every refusal, the target room remains active with a null winner, zero actions, and zero score rows. The final database run also retained all four `pg_blocking_pids` barriers, observing v2 holder/waiter pairs 729/736 and 765/772 plus legacy pairs 835/842 and 870/877.

The handler test now proves the existing response mapper preserves both typed RPC bodies at HTTP 403. Full Edge and type checks pass. The authoritative engine/static check from session 70113 remains the relevant production check because this correction changed tests and evidence only; the parent explicitly did not require repeating the unchanged wall-clock suite.

## Acceptance mapping

- **AC029:** synchronized contradictory reporters serialize to one coherent result plus one explicit conflict; room and score winners cannot diverge. Both supported v1 and v2 action admission now exclude completion under the same room lock.
- **AC030:** the single locked completion RPC removes the prior no-op room update followed by conflicting best-effort score upsert. Score failure rolls the room transition back, completion-first rejects both action protocols, and action-first is reflected in terminal revision.
- **AC031:** migration constraints, handlers, claim responses, and client validation fix the evidence label at `casual_participant_reported`; account linkage never changes the trust tier or touches verified results.
- **AC032:** response loss returns the immutable original receipt. Missing old score is `score_absent`, malformed legacy score is typed and repairable, and malformed versioned receipts fail closed.

## Changed paths

- `.codearbiter/reports/recovery-v2-r08-evidence.md`
- `client/src/client/matchClaim.test.ts`
- `client/src/client/matchClaim.ts`
- `scripts/checks/database-postgres.mjs`
- `supabase/functions/_shared/database.types.test.ts`
- `supabase/functions/_shared/database.types.ts`
- `supabase/functions/claim_match/claim_match.test.ts`
- `supabase/functions/claim_match/index.ts`
- `supabase/functions/finish_game/finish_game.test.ts`
- `supabase/functions/finish_game/handler.test.ts`
- `supabase/functions/finish_game/index.ts`
- `supabase/migrations/022_atomic_casual_completion.sql`

## Bounded implementation decisions

| Decision | SMARTS verdict | Confidence and intent |
| --- | --- | --- |
| Store room terminal state and score receipt through one room-locked RPC | S5 M5 A5 R5 T5 Satisfaction5 | high; directly proves atomicity and both action/finish schedules |
| Make version-one receipts immutable and compare retries to canonical stored content | S5 M5 A5 R5 T5 Satisfaction5 | high; preserves response-loss recovery without mutable terminal history |
| Label absent old score `score_absent` and malformed legacy score repairable, never complete | S5 M5 A5 R5 T5 Satisfaction5 | high; explicit compatibility policy required by the accepted preparation |
| Fix all casual evidence to `casual_participant_reported` across SQL, handlers, and client | S5 M5 A5 R5 T5 Satisfaction5 | high; prevents trust promotion through account claiming |
| Roll out schema and handlers before any automatically published client integration | S5 M5 A5 R5 T5 Satisfaction5 | high; required by the backend capability boundary and Pages trigger |

## Review and remaining boundary

The three coverage-correction paths are frozen for a fresh independent Astra/high re-review. No author-known functional defect remains. The genuinely unresolved owner action is the production rollout decision: R14 must supply compatible exact refs and the owner must approve the backend-first sequence before migration, deployment, or client-bearing merge. This local evidence does not authorize any production step.

## Parent integration and final independent review

Fresh Astra/high reviewer01a095e4-cbb6-77d2-95ef-3c504bad438f actual dispatch verified2b4e34. Five raw units completed, then separate finding-triage and verdict-aggregation yielded PASS0; R08-COV-001 resolved. Reviewer recovered previous full12path review and verified only the three declared test/evidence paths changed; production/migration hashes stayed fixed. Fresh focused Deno46 and realPostgres3155 exited0, allcontainers/handlesclosed.

Parent verified10 baseline blobs and two absent paths then copied all12files byte-identically (02e8ff). Fresh integrated realDB9368 exited0, observing exact blocker pairs731/738,766/773,836/843,871/878; Edge393 passed0. Combined R07/R08 clientcoverage42849 exited0:203files1875tests,93.97%lines8323/8857,84.07%branches4994/5940. Configured build/typecheck0. Logs: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r08-integrated-{edge,database}.log` and `recovery-v2-r07-r08-final-{coverage,build}.log`.

Configured secret scan found43 synthetic fixture matches across combined recovery work, including9 in the disposable SQL harness. Initial parent classification helper incorrectly assumed test files all use `.test.` filenames and failed; direct harness inspection corrected the classification (1a4744), without changing scanner or source. All matches are explicit mock/disposable credentials, no production secret. Parent production/test/migration diffs read completely and whitespace checks passed. Full integrated check38327 exited0 (2ed9f7), including unchanged verified benchmark maximum67.2788ms below100ms and both versioned CPU corpora. No hosted schema or production claim.
