# Evidence-backed recovery v2 execution ledger

Updated 2026-09-12. Goal: ACTIVE; R20 remains incomplete. Parent and integration owner: gpt-6-astra/high. This is the single current execution ledger. Dated task receipts preserve their original observations; their older pending statements do not supersede the current decisions below.

The [approved spec](../specs/evidence-recovery-v2.md) maps AC-001 through AC-086 to the immutable ZIP plan. All prior execution details, actual dispatch/session identifiers, command outputs, corrections and decisions are preserved byte-for-byte in the [execution history](../reports/recovery-v2-execution-history-2026-09-12.md). History is evidence, not an instruction to repeat an operation.

## Current ownership and revisions

| Surface | Revision and ownership |
| --- | --- |
| Original user checkout | `C:/Users/brenn/projects/singedTerra`, branch `codex/bottom-instrumentation-rail`, HEAD `214cf4e7037873c3993d88bfcb3cf3950cb2da2f`. Fresh 23e13f confirms 17 modified / 2 untracked; preserve all. |
| Audit input | ZIP `C:/Users/brenn/Downloads/singedterra-deep-review-v2.zip`; audit source `3902cad662aea03cec913d984d17aa9573b89bd0`. R00 verified all 31 package digests, schema/graph/references and actual model dispatches. |
| Integration source | `../evidence-recovery-v2`, branch `codex/evidence-recovery-v2`, HEAD/origin `46daba140dc2f4ac8465d14bed5cca6ed0ddd897`. Parent owns this ledger and preserved history; runtime source is unchanged. |
| Production main/backend | `10d6fe78409f8110cb25c2a484ae906656837f7d`, merged PR475; same tree as reviewed backend source `ce457e439a2751ee34a0923f56af72b8da5b2aa9`. |
| Client delivery candidate | `../evidence-recovery-v2-activation`, branch `codex/evidence-recovery-v2-activation`, HEAD main 10d6fe7. The 128 staged paths initially reproduce integration 46daba1's entire tree `bb06ac7f0bd099257c885b0caea002e0d5a42eaf` (7b749a exit 0). Additional reviewed release-test and documentation corrections are not committed. No activation PR exists. |
| Separate cleanup fix | `../room-abandonment-lifecycle`, branch `codex/room-abandonment-lifecycle`, base main 10d6fe7. Parent owns only the new active-room handler regressions so far; no fix implementation or production cleanup. |

The runtime currently admits one child at a time; second simultaneous dispatches were refused. No model substitutions occurred. Writer leases do not overlap. Existing dependency junctions were reused only after exact lockfile equality; no package was installed in this continuation.

## Required tasks

Model key: A=`gpt-6-astra`, S=`gpt-5.6-sol`, T=`gpt-5.6-terra`. Efforts are exact; R06 uses xhigh. The historical dispatch records verify actual selections rather than agent self-descriptions. Task receipts record changed paths, causal regressions, commands/exits, source revisions, risks and rollback.

| Task / AC range | Dependencies | Worker | Reviewer | Current state | Evidence |
| --- | --- | --- | --- | --- | --- |
| R00 / 001-003 | none | A/high | A/high | ACCEPTED | [baseline history](../reports/recovery-v2-execution-history-2026-09-12.md) |
| R01 / 004-006 | R00 | A/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r01-evidence.md) |
| R02 / 007-009 | R00 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r02-evidence.md) |
| R03 / 010-012 | R00 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r03-evidence.md) |
| R04 / 013-016 | R00 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r04-evidence.md) |
| R05 / 017-019 | R04 | T/high | S/high | ACCEPTED | [receipt](../reports/recovery-v2-r05-applied-evidence.md) |
| R06 / 020-024 | R00, R01, R13 | S/xhigh | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r06-evidence.md) |
| R07 / 025-028 | R06 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r07-evidence.md) |
| R08 / 029-032 | R06 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r08-evidence.md) |
| R09 / 033-036 | R00, R03 | T/high | S/high | ACCEPTED | [receipt](../reports/recovery-v2-r09-evidence.md) |
| R10 / 037-040 | R00, R03 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r10-evidence.md) |
| R12 / 041-044 | R00, R02 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r12-evidence.md) |
| R13 / 045-048 | R00 | T/high | S/high | ACCEPTED | [receipt](../reports/recovery-v2-r13-evidence.md) |
| R14 / 049-052 | R01, R13 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r14-evidence.md) |
| R15 / 053-056 | R00 | T/high | S/high | ACCEPTED | [receipt](../reports/recovery-v2-r15-evidence.md) |
| R16 / 057-060 | R00, R02 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r16-evidence.md) |
| R19 / 061-064 | R07, R08, R14 | T/high | S/high | ACCEPTED | [receipt](../reports/recovery-v2-r19-evidence.md); final refresh review below |
| R21 / 065-068 | R00 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r21-evidence.md) |
| R22 / 069-071 | R00, R21 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r22-evidence.md) |
| R23 / 072-075 | R21, R22, R07 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r23-evidence.md) |
| R24 / 076-078 | R00 | T/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r24-evidence.md) |
| R25 / 079-082 | R00 | S/high | A/high | ACCEPTED | [receipt](../reports/recovery-v2-r25-evidence.md) |
| R20 / 083-086 | R00, R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R12, R13, R14, R15, R16, R19, R21, R22, R23, R24, R25 | A/high | S/high | PRE-PR PASS; DELIVERY PENDING | [review receipt](../reports/recovery-v2-r20-evidence.md); final identity, CI and approved promotion remain incomplete |

## Current delivery evidence

- Source and artifact: `562eb4` exit 0 verified every file of the 60-file local artifact from runtime source `4d4b336fa1fa75b2541976b4f36b9c5d5c38bf4f`. Its index SHA-256 is `6d161016726b42a23e17f5504a0576f7d7108418f1bc13186a3ca35cdf2005bf`; graph `7ad20c5476ba659420ee85d927bae472bbc1771ebae91f77aca4a33b8292b6d2`. Later integration changes are documentation only. The artifact uses synthetic local configuration and is not hosted client proof.
- Fresh activation client suite: `91638` terminal `106780`, exit 0,207 files / 1,906 tests. `Temp/recovery-v2-activation-commit-client.log`.
- Fresh activation build: `293a3b` exit 0; `5f5695` proves all 60 emitted files are byte-identical to the tested integration artifact. The file-inventory digest is `7ad20c5476ba659420ee85d927bae472bbc1771ebae91f77aca4a33b8292b6d2`; the raw bundle-graph JSON digest is `f2c8e775427dfec6198e46d95acc157a0e31cbbbbe257b382d1644b2a1f355e9`. These are different digest scopes. Proof `Temp/recovery-v2-activation-build-proof.json`, SHA `a33e33913c3012798dab64be534ff70ace73b91b753132532dabec2a1eeffc88`. No new server or production configuration was used.
- Fresh activation full check: original `04c955` exit 1 exposed two R14 test-infrastructure bugs. Corrected run `58977` terminal `6b46a7`, exit 0, includes44 release tests, strict typecheck, complete deterministic/benchmark harnesses and final Edge-CI harness. `Temp/recovery-v2-activation-commit-check-corrected.log`.
- Applicable unchanged-runtime evidence: general browser 330 passed / 18 profile skips; separate five-profile product 83 passed / 27 profile skips; Edge 393 passed; Windows client coverage 93.98% lines and 83.91% branches. Actual logs were reread 23dbe0 / 38c24d. The skipped profiles retain their explicit applicability rationale; no required scenario is waived.
- Real disposable Postgres evidence: synchronized action/completion lock orderings, atomic retries, rollback, ACL, rematch, and verified starts/resumes passed. Full 001-020 -> interrupted 021 -> fix-forward 022 rehearsal preserved legacy/V2/V3 contracts and immutable receipts. `Temp/recovery-v2-backend-delivery-release-postgres.log`. This is distinct from handler mocks.
- Backend run [34719526794/attempt1](https://github.com/SUaDtL/singedTerra/actions/runs/34719526794) completed SUCCESS at main 10d6fe7 under the explicit one-run approval. Fresh 794cf9 reconfirmed it. Before/after migrations already contained 001-022; no migration was newly applied. All 17 functions redeployed. Receipt `Temp/recovery-v2-backend-34719526794-artifact/backend-release-receipt.json`, SHA-256 `02608c161b701bf30d2fda620074ed30dd14159323eaba24066340eb437c56b0`; manifest `43bb1cdd4f60ba5c56920631ade075a2d0c0c482bdaae23fda97466677c4f059`. Independent actual-deployment Astra/high review PASS, zero findings is preserved in history.
- Approved remote settings remain applied: strict core/Edge/browser checks and admin enforcement (fresh 12d41c); environment 21804832739 with sole SUaDtL reviewer, self-approval allowed, admin bypass disabled, protected branches only, no timer (fresh 362de4). Repository duplicate production secrets/project variable were removed under approval; environment values and VITE entries were preserved. No values were printed.
- R04 source-main Pages run 34713382261 and all 64 hosted file comparisons are accepted. This proves the backend PR's unchanged client publication, not the later client activation. `Temp/recovery-v2-public-pages-34713382261-proof.json`.

## Latest corrections and review ownership

1. R14 release-test correction is ACCEPTED. Sol/high session `01a0979f-557d-7ba0-9b46-3e84b284da5a` fixed the mixed index/HEAD snapshot and CRLF no-op mutation. Actual causal REDs, 4/4 focused GREEN and44/44 release checks are recorded. Fresh Astra/high reviewer `01a097b5-ec5c-75f2-96b0-e8bd8dcdd1d0` (actual 281fcf) completed matched units, separate triage and aggregate PASS, zero findings. Source SHA `a0d2faa2b1173e438567f9912561096c75c3bc1a364a253f8c6653d598a8b116`; report SHA `9ad8782cf82f6310c303a80f8f14cf0f7362500df0271ba8b2224e1e990e7591`. Both remain unstaged in activation.
2. R19's temporal deployment paragraph is ACCEPTED after fresh Sol/high review, zero findings. Actual Terra/high session `01a097b9-46d7-7222-a416-cbb615ac12ee` was verified f94d44; its generic GPT6 self-description was not used. DEVELOPMENT SHA `8c488c23cdabfb4fec2f5f4bcded58e01cf1adf66009decd7f063bca468ae659`; Temp receipt `recovery-v2-r19-deployment-refresh-receipt.md` SHA `b5672e7ab02385b3d0fa1511f3ea561e4d5f94a04406cebad48c6f83d9e9bc40`. Existing commands/general policy and staging were preserved.
3. Parent R20 documentation records actual backend delivery, local proof boundaries and compatibility in activation `docs/SOFTWARE_RECOVERY.md`, preserving prior history. The pre-PR review passed; final delivery acceptance remains pending.
4. Stateless scan `c80ee9` exited 0 with 31 masked candidates in eight test files. Independent security/auth review inspected every source and sink and classified all as synthetic fixtures or redaction assertions, with zero production-secret sinks. No finding remains; this is a classified PASS, not an empty scan. The diff-bound marker has not yet been recorded.
5. Fresh R19/R20 candidate reviewer `/root/r19_r20_candidate_review` completed both scopes with PASS and zero findings, then released the candidate. Actual session `01a097c2-5779-7381-b7b9-97400b2d9df5` proves `gpt-5.6-sol/high` (`34ae14`). Its independent before/after check matched all 131 inventory paths. Security, auth/crypto, coverage and architecture units passed; dependency/migration were non-matches, followed by separate triage and aggregation. All 86 ACs and the 22 required task IDs/text matched the immutable ZIP and spec. Remote main remains 10d6fe7 and no activation PR exists (`8ce8d0`). Provenance auto-heal worklist is empty; no ADR lifecycle ledger exists (`b31008`).

## Remaining finite recovery work

- R19 document review and R20 pre-PR candidate review are complete. Verify the final documentation receipt delta before committing; no runtime source changed after review.
- Complete governed staging/commit and draft PR for the main-based client delivery candidate. Preserve the reviewed runtime and use exact final source/artifact identity. Run applicable final-source CI/artifact checks; no old CI result may be relabeled as the new candidate's result.
- Present the concrete merge/promotion proposal when ready. A merge automatically publishes Pages and requires explicit approval. Pending required approval/evidence remains incomplete; a draft PR alone does not finish R20.
- Record final acceptance and the delivery SHA/artifact/PR only when proved. No release/tag, merge, client publication, extra backend deployment, production data mutation or rollback is authorized by this ledger.

R20 preparation: `Temp/recovery-v2-r20-current-evidence-index.json` SHA `b78de2fb8c787dfd7a744665da50a9aea8a4aae4b26308b3eb63681b2f8cfb43` indexes 22 required task entries and 10 proof files; `Temp/recovery-v2-r20-acceptance-preparation.md` is explicitly incomplete. Neither is a second task board or an acceptance marker.

## Compatibility, separate work and rollback

The deployed backend shared digest is `beb49855738592ede7500cc9e2b71f330a951da14b09819f4484dec17081068b`; the client candidate manifest describes `9f30b4392779c3941a1f0ea1be948eb061174c6ce353c5253ab5b26c742ad507`. Eight real V2/V3 cross-candidate controller/replay cases and the existing versioned corpora support the bounded compatibility claim. Do not claim the latter shared bytes were deployed or all possible transcripts were exhaustively tested. Loaded v1 clients retain their backend contract; the new v2 client explicitly refuses v1 rejoin after refresh.

Optional production capability smoke: six review findings were corrected by exact Sol/high. Parent 10/10 offline regressions and 8 real-controller self-check cases pass with networkCalls 0. Executor SHA `e793d992f7d2ce6c7c61c75d485247918b23fb651f56d065e18c372d89dc9fdf`; proposal SHA `185cae05520e2fbaf2a4a2563dc1d289b9fdd8d569bc46b7ce90ae66adbfc860`; source closure `7268f753cce17e0d6574b9e6bd66f5ada2e5877f77e0467570252f683e3b41a1`. Fresh executor review is NOT RUN. No --execute, credential retrieval or production test-data write occurred. This prepared synthetic smoke is not natural gameplay proof or an invented R20 engineering criterion.

Separately authorized room lifecycle fix: user chose 10 minutes after all humans stop responding; explicit last-human quits should retire the active room immediately while preserving history. Fresh production metadata found 65 legacy active statuses, all older than 24 hours, 49 without actions; these are not 65 connected players. Source reaps only waiting rooms, and active heartbeat/leave return 404. Parent causal RED 6a440d established both admission failures. Expanded RED d632c1 confirms four real-handler failures with two existing validation controls passing: active heartbeat/quit admission, stale waiting heartbeat overwriting the started roster, and stale last-seat quit deleting a started room. PostgREST is substituted; this is not SQL concurrency proof. The initial 61cadf command used nonexistent control filenames and is not causal evidence. SQL expiry/concurrency, active client presence, true zero-player scheduling, legacy rollout protection and preserved history remain OPEN in `Temp/recovery-v2-room-lifecycle-obligations.md`. Only the separate untracked regression file changed; no production room was changed. Keep migration009's waiting-at-write guard; do not delete canonical logs to clear active status.

Rollback: retain existing user work and the last compatible published client. Revert local candidate edits only within their owned scope. Applied schema and immutable results are preserved; production repair is a separately approved compatible rollback or fix-forward. No destructive cleanup, protection bypass or override is inferred. R11/R17/R18 and all P-series work remain outside the finite goal.

Preserved execution-history SHA-256: `a3b3e87516902cf1add30f4a9858702ec44167fe3ebbc50c560892c6c3be3780`.
