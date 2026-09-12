# Recovery v2 R07 evidence

- Requirement: R07 — Carry stable command identity and revision through client retries
- Acceptance criteria: AC025–AC028
- Input plan: `C:/Users/brenn/projects/singedTerra-worktrees/evidence-recovery-v2-input/singedterra-deep-review/singedterra-plan-v2.json`
- Worktree: `C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r07`
- Branch: `codex/recovery-v2-r07`
- Exact base and current HEAD: `430a715c17ffda15f5885ff2df9391d3d93c95a4`
- Implementation session: `01a089e5-8b1b-7ca1-a32c-d745ad6deee8`
- Actual model / effort: `gpt-5.6-sol` / `high`
- CPU correction session: `01a0958d-7a85-7630-9cdb-8e227356077b`
- CPU correction model / effort: `gpt-5.6-sol` / `high`
- Fresh full-review session: `01a0959d-06db-77b2-a1b5-d02043e34399`
- Fresh reviewer model / effort: `gpt-6-astra` / `high`
- Route: `ca-fix` with regression-first TDD

## Result

The network client now sends command-protocol v2 envelopes with an immutable intent, expected room revision, actor identity, action, and transition metadata. A transport-uncertain retry reuses the exact serialized request body. A receipt is accepted only when its protocol, intent, sequence, resulting revision, player, and tank all match the pending command. The receipt triggers log recovery but never applies the command directly; only a validated ordered row mutates the engine.

Ordered rows retain their command metadata through buffering and replay. Initial history is validated as one contiguous sequence before any engine mutation. Live rows are validated before sequence commit, and `OrderedActionSession` advances its cursor only after application succeeds. Duplicate or stale rows remain idempotent. A malformed actor binding or incompatible row remains unconsumed and faults the canonical stream rather than advancing the cursor.

A stale revision, turn, or intent conflict retires the pending envelope, resynchronizes the ordered log, and requires new human input before a new intent can be minted. A success receipt bound to the wrong protocol, intent, revision, or actor remains fail-closed: it cannot unlock input, apply an action, trigger receipt-based recovery, or replace the original intent. A later correctly bound ordered echo remains authoritative and can settle that original command.

Room creation, join, rejoin, rematch, mode projection, and client construction carry or require command protocol v2 explicitly. Missing and v1 protocol rooms are rejected before persistence/adoption. The command protocol stays outside engine `GameOptions`. Create/join response `options` are required because the authoritative command version is carried there; unrelated player and seed fallbacks remain intact.

Leave/stop, rematch replacement, account identity change, and client generation changes invalidate uncertain command continuations. Account invalidation clears only pending command work and its input lock; it does not leave the room, reset gameplay, change seat authority, or discard canonical ordered rows. Stale receipt recovery and retry callbacks are generation-gated, while later canonical realtime rows still apply.

The post-review correction unifies command admission, transport settlement, watchdog recovery, and input-lock ownership under the pending command. The complete fetch plus `response.json()` operation is raced against a 9-second deadline, and canonical recovery is independently raced against an 8-second deadline; `AbortController` remains best-effort cleanup rather than the settlement guarantee. Empty recovery is treated as uncertainty, so the same pending envelope and serialized body become explicitly retryable. Fire/shield locks are owned by the exact pending command and delivery epoch. Move and buy commands share the same bounded lifetime without acquiring a fire lock.

While a human command is uncertain, local angle, power, and weapon changes are refused with feedback so the displayed firing solution cannot silently diverge from the stored shot. A matching explicit gesture reuses the stored body and intent. Competing commands are refused without arming or releasing a lock. All effects after an await verify the pending object, command generation, and delivery epoch, including conflict recovery within one generation. A sanitized ADR-0008 `Not your turn` warning records only the public room id and local active tank id.

CPU envelopes use the shared `cpuRoomIntentId(room/revision/actor/kind)` identity and preserve the accepted R21 transport settlement and preparation behavior. R22 team metadata behavior remains covered. Full CPU-plan execution remains outside R07 for R23.

## Fresh CPU reviewer correction

A separate Astra/high review reported three blocking CPU lifecycle findings. The shared defect was split ownership: `pendingRoomCommand` owned the immutable command and delivery epoch, while `botActionAttempt`, `botSubmitPendingKey`, and `lastBotKey` separately treated transport acceptance as phase completion. In addition, the human mismatch path emitted state from inside the ordered apply callback, before `OrderedActionSession` committed its cursor.

The correction keeps a CPU attempt owned after an authenticated success receipt and does not set `lastBotKey` until the matching canonical row applies. If accepted receipt recovery and the later watchdog recovery both find no echo, the watchdog releases that exact attempt and the next driver frame retries the same pending body and intent. A rejected command admission now rolls back the newly allocated bot attempt instead of latching a phase guard that owns no delivery.

The row-before-settlement and settlement-before-row cases remain distinct. A different canonical row that arrives while the CPU transport is unresolved records canonical progress but does not immediately reopen planning. Existing R21/AC-068 cases prove that pending or accepted transport remains at two POSTs, while a later failed or conflict settlement releases exactly one replan. If the transport instead reaches its hard deadline, bounded recovery compares the committed cursor with the pending expected revision. A cursor beyond that revision proves the immutable envelope was displaced, so recovery retires its exact delivery epoch and bot attempt before one current-state plan is admitted at the new revision. Conversely, an exact canonical row settles the old phase immediately; any later success, conflict, or rejection from that old delivery epoch cannot affect the successor command. This preserves preparation success as a canonical inventory outcome rather than an HTTP outcome.

Canonical mismatch effects for a human command are now deferred until the ordered row has applied and its cursor has committed. The post-commit effect only releases the exact pending envelope and records delayed feedback; the drain's normal emission then observes the advanced revision and drives a successor CPU command once. Feedback is delivered after the drain, so it cannot make an already committed row appear rejected.

## Fresh full review and AC027 evidence correction

The fresh Astra/high full review completed raw review, separate triage, and aggregate review with zero blocking findings and one medium evidence gap. It found the three CPU lifecycle failures corrected. Its remaining finding was test evidence only: the saved-session rejoin guard correctly rejects a live ruleset-v4 room whose command protocol is missing or v1, but the direct Lobby rejoin handoff path did not execute those two negative cases.

The correction adds those cases to the existing Lobby rejoin suite without changing production code. Both cases begin with a valid saved descriptor, matching live membership, and ruleset 4, then exercise `Lobby.handleRejoin()` against the actual fetched room. They assert the exact incompatibility feedback, removal of the stale candidate and descriptor, preservation of the existing seat credential, no new storage write, and zero `onReady` calls. Because Lobby wires `LobbyRoomController.onHandoff` directly to `onReady`, that last assertion also proves no handoff reaches downstream client construction. The existing successful v2 rejoin and replay cases remain unchanged.

## Regression evidence

The first focused RED command was:

```text
npm -w @singedterra/client run test -- src/client/OrderedActionSession.test.ts src/client/NetworkClient.lockstep.test.ts src/client/NetworkClient.commandRetry.test.ts src/client/LobbyTransport.ruleset.test.ts src/client/modeConfigHandoffCharacterization.test.ts src/client/NetworkClient.requestRematch.test.ts src/main.hotSeatProgression.test.ts
```

It failed for the intended production gaps: 7 files failed, 18 tests failed, and 95 tests passed. The failures covered cursor commit before apply, noncontiguous initial history, lack of immutable response-loss retry, thrown row mismatch, missing revision-conflict recovery, missing command-v2 admission/create/join/rematch propagation, and missing account invalidation.

After the initial correction, a dedicated receipt-binding RED ran:

```text
npm -w @singedterra/client run test -- src/client/NetworkClient.commandRetry.test.ts
```

It failed 4 of 9 tests because wrong protocol, intent, revision, and actor success receipts released the human input lock. The fail-closed receipt correction made all four cases green without applying or rebinding the command, and the same tests prove a later authenticated ordered echo can settle it.

Fresh Astra/high review then reported five required corrections. Its independent probe log recorded 4 failures with 9 existing cases passing: pending move/fire ownership, stale watchdog recovery, hanging transport retry, and null receipt handling. The promoted in-repository correction RED ran the focused command/human/CPU/retry suite and failed 6 tests with 52 passing, plus one null-receipt unhandled rejection. This proved the missing hard deadline, unsafe receipt parsing, move-to-fire lock bug, hanging transport lock, re-aim drift, and stale recovery effect before production correction.

The fresh CPU correction RED was:

```text
npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts src/client/NetworkClient.commandRetry.test.ts --testNamePattern "retires a timed-out CPU envelope|retries the same accepted CPU envelope|drives a successor CPU command"
```

It exited 1 with all three intended failures: the displaced timed-out CPU envelope expected three POSTs and observed two; the accepted command with no ordered echo expected two POSTs and observed one; and the successor CPU command expected revision 1 and observed revision 0. After the production correction, the same command exited 0 with all three tests passing.

The AC027 follow-up is an evidence correction over an already-correct production guard, so no product RED was fabricated and no production source was changed. The first focused characterization command was:

```text
npm -w @singedterra/client run test -- src/ui/Lobby.rejoin.test.ts
```

It exited 0 with 1 file and 14 tests passing, including the new missing-protocol and v1 direct-rejoin cases and the preserved successful v2 cases.

Production-path regressions cover:

- immutable response-loss retry and exact body reuse;
- receipt authentication across protocol, intent, revision, player, and tank;
- ordered-echo-only application and duplicate-echo idempotency;
- apply-before-sequence-commit and retained mismatches;
- complete contiguous initial history before first replay mutation;
- conflict resync without automatic new-turn re-enveloping;
- stale retry and stale recovery cancellation after invalidation;
- bounded non-cooperating fetch, response parsing, and recovery settlement;
- exact-body explicit retry after an empty uncertainty resync for fire, move, and buy;
- pending-command admission before fire-lock acquisition and blocked local re-aim;
- pending-object, generation, and delivery-epoch checks after asynchronous boundaries;
- accepted CPU receipts retain exact-attempt ownership until canonical echo or bounded no-echo recovery;
- a displaced CPU envelope remains owned while transport is unresolved, then retires after bounded recovery proves its revision consumed;
- canonical human mismatch feedback and successor CPU drive occur only after ordered cursor commit;
- refused CPU command admission releases the newly allocated attempt guard;
- null, primitive, missing-field, wrong-sequence, wrong-player, wrong-tank, wrong-protocol, wrong-intent, and wrong-revision receipts;
- sanitized client-side `Not your turn` desync diagnostics without credential, intent, or action data;
- create, join, rejoin, rematch, mode handoff, and constructor v2 admission;
- account-change invalidation without seat/gameplay/canonical-row abandonment;
- R21 CPU retry/preparation settlement and R22 team configuration compatibility.

## Final validation

- `npm ci --ignore-scripts --no-fund` — passed; 178 packages, 0 vulnerabilities, lockfile unchanged.
- Focused post-review command/human/CPU/retry gate — 4 files and 62 tests passed before the fresh CPU review.
- Fresh CPU correction focused gate — 3 new regressions passed; the complete bot/command/human retry files passed 56 tests.
- Independent fresh-review probe command — 2 files and 58 tests passed, including the three formerly failing CPU/cursor cases.
- Independent late-response epoch selection — 6 tests passed for success, conflict, and rejection across new-command and same-command/new-epoch orderings.
- `npm run test:client` — 201 files and 1,849 tests passed.
- `npm run check` — passed, including shared/client typecheck, deterministic engine harnesses, lockstep, cancellation-aware `netretry`, verified duel/corpus/policy, and all remaining repository checks.
- AC027 direct-rejoin characterization — 1 file and 14 tests passed; missing and v1 command protocols fail closed before handoff or new persistence, while the existing v2 path remains green.
- Applicable `LobbyRoomController` suites — 2 files and 19 tests passed.
- `npm -w @singedterra/client run typecheck` — passed.
- `git diff --check` — passed; Git reported only the repository's expected LF-to-CRLF working-copy notices.

The first post-correction `npm run check` exited 1 because the new command-retry fixture let TypeScript infer possibly undefined indexed players. The fixture now checks both players before constructing the CPU options; the complete rerun exited 0. This was a test-fixture typing defect, not a production failure.

The earlier five-finding review's independent probe file lived outside the client Vitest `src/**/*.test.{ts,tsx}` include. Its direct selection attempt therefore exited 1 with `No test files found`; those four earlier scenarios were promoted into the granted in-repository command retry test. The fresh CPU review supplied an explicit external Vitest config, so its two probe files ran directly and their three new cases were also promoted across the bot- and command-retry production suites.

No build, coverage, browser, server, remote, migration, workflow, dependency-lock, marker, or commit action was run. A manual security pass found no new credential persistence or logging: the stable serialized body remains private to the pending command, seat tokens stay in the authenticated request only, receipt contents do not authorize engine mutation, and account identity does not replace gameplay actor authority.

## Changed paths

Production:

- `shared/src/net/roomCommand.ts`
- `client/src/client/retry.ts`
- `client/src/client/OrderedActionSession.ts`
- `client/src/client/NetworkClient.ts`
- `client/src/client/LobbyTransport.ts`
- `client/src/client/modeConfig.ts`
- `client/src/client/createModeClient.ts`
- `client/src/client/GameClient.ts`
- `client/src/client/LobbyRoomController.ts`
- `client/src/main.ts`

Tests and deterministic harness:

- `client/src/client/OrderedActionSession.test.ts`
- `client/src/client/retry.test.ts`
- `scripts/checks/netretry.mjs`
- `client/src/client/NetworkClient.commandRetry.test.ts`
- `client/src/client/NetworkClient.humanRetry.test.ts`
- `client/src/client/NetworkClient.lockstep.test.ts`
- `client/src/client/NetworkClient.initializeGap.test.ts`
- `client/src/client/NetworkClient.botRetry.test.ts`
- `client/src/client/NetworkClient.requestRematch.test.ts`
- `client/src/client/LobbyTransport.ruleset.test.ts`
- `client/src/client/modeConfigHandoffCharacterization.test.ts`
- `client/src/client/LobbyRoomController.test.ts`
- `client/src/client/LobbyRoomController.cancellation.test.ts`
- `client/src/main.hotSeatProgression.test.ts`
- `client/src/client/modeConfig.extension.test.ts`
- `client/src/client/modeConfigCharacterization.test.ts`
- `client/src/client/NetworkClient.matchClaim.test.ts`
- `client/src/client/NetworkClient.quickChat.test.ts`
- `client/src/client/NetworkClient.sessionClear.test.ts`
- `client/src/ui/Lobby.rejoin.test.ts`
- `client/src/ui/Lobby.network.test.ts`
- `client/src/client/GameSessionComposition.extension.test.ts`
- `client/src/client/modeConfigTeamRegression.test.ts`

This handoff is intentionally uncommitted and ready for a fresh Astra/high review.

## Browser fixture correction — 2026-09-12

This follow-up supersedes the earlier statement that no browser test was run. The production and unit-test correction had already passed its gates; this follow-up updates only stale public-browser fixtures to exercise that accepted command-v2 behavior.

The configured pre-correction browser RED is retained at `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r07-configured-targeted.log` (session `59388`, exit 1): three actual failures, one pass, and one intentional desktop skip. The online CPU journey, lobby Create operation, and verified Field Order absence route all failed because their mocked `create_room` responses omitted `commandProtocolVersion: 2`. The command journey also read retired top-level `action` / `actingPlayerId` request fields and returned a legacy receipt and row.

The fixture correction covers these obligations:

- `R07-BF-01` — all three browser room fixtures admit only the current command protocol (`COVERED`: the formerly failing lobby and Field Order network routes pass).
- `R07-BF-02` — the command journey asserts the actual v2 envelope, stable intent, expected revision, submitting seat, actor player/tank binding, receipt, and complete persisted-row metadata (`COVERED`: the targeted online CPU journey passes).
- `R07-BF-03` — a canonical move must apply before Fire admission, then exactly one human Fire and one CPU Fire must apply through REST resynchronization while the held Fire key does not duplicate the human command (`COVERED`: semantic fuel decreases before Fire; ordered rows are `move, fire, fire` with `p1, p1, p2` bindings; the public Active commander region returns to Ranger and Fire is enabled before keyup; the human Fire count remains one after keyup).
- `R07-BF-04` — existing lobby geometry and Field Order absence behavior remains intact (`COVERED`: all affected-file tests pass across all configured profiles).

`lobby-layout.spec.ts` began on branch blob `00b84cd21279343b2a6e8fd945aa68cc6fafa62c`; before the R07 edit it was first advanced to accepted integration blob `02b105198db3c72e9e74a7373eb9c3206baa4756` from integration baseline `0f708d5`. That accepted R04 delta supplies `E2E_EXPECTED_BACKEND_ORIGIN` handling and the deny-proxy test and is not claimed as new R07 work. The other fixture baselines already matched integration: `command-console-journey.spec.ts` `0830a1d81f415aca69797d59fa27020c84d783b0` and `verified-deployment.spec.ts` `f05e54d4967b7d45d8db1b792aa6ddb922efad06`.

Changed browser paths and final Git blob hashes:

- `e2e/command-console-journey.spec.ts` — `a7de5d6778700e2ebc14d840bee85fe58bdc1f69`
- `e2e/lobby-layout.spec.ts` — `5c6ae9492dc719b62c5c8d20b4640802cfbbedf0` (R07-only delta against `0f708d5`: one added protocol field)
- `e2e/verified-deployment.spec.ts` — `8e8a87ccd117a502c24c67a7a07c5029f46c3832`

Browser commands used `E2E_LIVE_URL=http://127.0.0.1:5198`, `E2E_DENY_EXTERNAL_NETWORK=1`, `E2E_EXPECTED_BACKEND_ORIGIN=http://127.0.0.1:5198`, at most two workers, and unique Temp output directories. They reused the sole configured preview (PID `72444`); no build or second server ran.

- Focused corrected three-test command — final exit 0, 3 passed. Earlier correction iterations exited 1 only on the stale final disabled-state oracle and then on two attempts to select the public commander text; the final oracle uses the rendered `Active commander` region and preserves the held-key requirement.
- First affected-files/all-profiles command under this branch's pre-R04 Playwright config — exit 1, 74 passed, 6 intentional skips, 1 harness failure. The R04 deny test saw `ERR_NAME_NOT_RESOLVED` because that old config did not install the required unreachable proxy; no R07 scenario failed.
- First temporary-config attempt importing the parent worktree config — exit 1 before discovery because separate worktree installations loaded `@playwright/test` twice; no tests ran.
- Focused deny-proxy proof under a Temp-only config carrying the exact accepted proxy stanza — exit 0, 1 passed.
- Authoritative affected-files/all-profiles command under that Temp-only config — exit 0, 75 passed, 6 intentional profile skips.
- `git diff --check` — exit 0; only expected LF-to-CRLF working-copy warnings were emitted.

All 33 pre-existing R07 production, unit-test, and deterministic-harness paths were compared with the parent integration worktree after browser testing: 33 matched and 0 differed. No production, unit, harness, dependency, lockfile, remote, migration, marker, ledger, server, or commit change was made in this follow-up. The preview listener remained PID `72444`, and no R07 Playwright/browser process remained after the final run.

Actual correction worker routing was `gpt-5.6-sol` / `high`. Fresh independent Astra/high review remains pending. Rollback is the three R07 browser-fixture deltas above; retain the accepted R04 `lobby-layout.spec.ts` baseline delta when reverting this follow-up.

## Actual command-v2 response correction — 2026-09-12

This follow-up corrects two client assumptions exposed by the deployed command-v2 response mapper. `commandRpcResultToResponse` returns the RPC's exact `not_your_turn` code with HTTP 403, while the client recognized only the legacy text `Not your turn`. It also maps an RPC error or missing outcome to the opaque HTTP 500 body `{ ok: false, error: "Failed to submit command" }`; that response cannot prove whether the transaction appended a row before the response failed. The old client discarded HTTP status and treated every nonempty error string as a definitive refusal, so it skipped the conflict resync in the first case and abandoned the immutable human envelope in the second.

The client now retains the HTTP status with the parsed body. Exact mapper status/code pairs distinguish resync conflicts from definitive refusals. An actual 403 `not_your_turn` follows the existing sanitized diagnostic and canonical resync path. Parsed 5xx responses follow the established uncertainty recovery: fetch the ordered log, settle without repost when the expected revision is present, or retain the same serialized body and intent for an explicit retry when it is absent. An unknown statusful response remains fail-closed until an authenticated ordered row decides authority. Statusless legacy test responses retain their existing behavior.

The known definitive mapper pairs covered by the table regression are `invalid_command`/400; `not_room_member`, `invalid_seat_token`, `actor_not_in_room`, `cannot_proxy_human`, and `shop_actor_mismatch`/403; `room_not_found`/404; and `room_not_active`, `command_protocol_mismatch`, `command_protocol_unavailable`, `ruleset_mismatch`, and `ruleset_unavailable`/409. `revision_conflict` and `intent_conflict`/409 remain resync conflicts. The backend mapper and schema were read as the contract and were not changed.

### Test-first evidence

The first actual-wire focused RED exited 1 with 3 failures, 12 passes, and 23 skips: lowercase `not_your_turn` did not resync, a command found after opaque 500 did not apply, and an unknown statusful error incorrectly released authority. A separate immutable-intent RED exited 1 because opaque 500 emitted the definitive `Action failed` message instead of retaining the pending body for explicit retry.

The minimal production correction was complete before the final test-oracle adjustments. Early post-correction focused runs remained red only because the new tests assumed a canonical Fire immediately completed its physics and decremented unlimited Baby Missile inventory, and because one test explicitly invoked a second user action while claiming to measure automatic reposting. The final tests instead prove the ordered Fire entered the engine (`FIRING` plus a projectile), a duplicate row is ignored, and no automatic POST occurs through the bounded watchdog interval. One accidentally inserted wait in the pre-existing malformed-receipt table caused six test-only failures and was removed before the complete file reran green; its fail-closed assertions were not weakened.

Final verification:

- selected actual-wire cases — exit 0, 16 passed and 22 skipped;
- complete `NetworkClient.commandRetry.test.ts` — exit 0, 38 passed;
- command retry, bot retry, human retry, generic retry, and lockstep files — exit 0, 5 files and 99 tests passed;
- `npm run test:client` — exit 0, 201 files and 1,867 tests passed;
- `npm run check` — exit 0, including shared/client typecheck, deterministic engine and network retry harnesses, all 12 strict duel benchmark samples below 100 ms (maximum 69.2521 ms), and CPU corpus/policy checks;
- `npm run typecheck` — exit 0 for shared and client;
- `git diff --check` — exit 0 with only expected LF-to-CRLF working-copy notices;
- the 33 non-leased changed paths match the parent integration worktree byte for byte;
- no browser run was made against the now-stale preview artifact, and no build, server, backend, migration, dependency, lockfile, remote, marker, ledger, or commit action was performed.

The browser-fixture acceptance above remains valid evidence for the previously frozen source artifact only. This source correction requires a fresh build and public browser acceptance after integration and independent review; it is not claimed from the old preview.

Changed-path SHA-256 values before this evidence append:

- `client/src/client/NetworkClient.ts` — `67287268382326777dc3eabc871d7aab67e6a7ecc04fbcf3d10a482d25de076f`
- `client/src/client/NetworkClient.commandRetry.test.ts` — `7997f6240bd00e2dfc02f7777a9a3018afa9002287ececb1b0c29072cea6c4cf`
- `e2e/command-console-journey.spec.ts` — `0864efd32d7f61862710b850ec786b648aaa75b52bd0a8ac3694a4a557d42c06` (comment-only delta from the frozen browser fixture)

The exact lease for this follow-up is the three paths above plus this evidence file. Fresh independent Astra/high review remains pending.

## Default-shield canonical-row correction — 2026-09-12

Fresh Astra/high review of all 37 R07 paths found one medium mismatch. The `submit_action` canonicalizer intentionally omits `weapon` for the standard shield while retaining `weapon: "heavy_shield"` for Heavy Shield. The pending browser command contains `{ type: "use_shield", weapon: "shield" }`, so literal optional-field comparison treated its authenticated server row `{ type: "use_shield" }` as a different command. The row still applied and unlocked input, but the client emitted a false turn-change error.

The in-repository server-shaped regression reproduced the finding before production correction: the focused command exited 1 with the default-shield case failing at the unexpected `Turn changed` message; the paired Heavy Shield mismatch guard already passed. The minimal correction compares the effective shield weapon, defaulting an omitted value to `shield` on either side. Omitted/default Shield is therefore equivalent, while omitted/default Shield remains distinct from Heavy Shield. No engine or protocol behavior changed.

Final verification:

- focused default/Heavy Shield cases — exit 0, 2 passed and 38 skipped;
- complete `NetworkClient.commandRetry.test.ts` — exit 0, 40 passed;
- `npm run test:client` — exit 0, 201 files and 1,869 tests passed;
- `npm run typecheck` — exit 0 for shared and client;
- the unchanged engine benchmark was not repeated; parent integration retains the authoritative full check and will run final integrated coverage/browser gates;
- no build, server, browser, backend, migration, dependency, lockfile, remote, marker, ledger, or commit action was performed.

Final source/test SHA-256 values before this evidence append:

- `client/src/client/NetworkClient.ts` — `a8d5477be6b1fda8369889ef8195cf54801b57e412202f5ab705da0153cab431`
- `client/src/client/NetworkClient.commandRetry.test.ts` — `1e429476fb66b03c450db836d17b86311e285f72112158a4fca9076d7d98eb9a`

The exact correction lease is those two paths plus this evidence file. All other 34 R07 paths remain frozen. Fresh scoped review remains pending.

## Final parent integration and acceptance evidence

The final shield correction was copied byte-identically with old/new hash checks (02e8ff). Fresh independent reviewer Astra/high01a095ea-3da4-7591-960d-bfcd8d11d8d0 was verified from actual session metadata230f86. It recovered the previous complete37path review, verified the three correction hashes plus34unchanged paths, ran46focused tests, and separately completed raw4units, finding-triage and verdict-aggregation: sourcePASS0. The earlier default-Shield false conflict is resolved; Heavy Shield remains distinct. No earlier RED or failed browser attempt is discarded.

Fresh parent final gates on integrated R07 plus accepted R08:

| Gate | Result | Evidence |
| --- | --- | --- |
| Client coverage | exit0;203files1875tests,93.97%lines8323/8857,84.07%branches4994/5940 | exec42849/ec2279; reviewer independently read actual log and exact hashes |
| Engine/static check | exit0; benchmark maximum67.2788ms below100ms, both versioned CPU corpora pass | exec38327/2ed9f7 |
| Build/typecheck | exit0; configured loopback backend and public synthetic anon key | b11967 |
| Edge | exit0;393tests | 683a7c |
| Real disposable Postgres | exit0; actual productionv1/v2 action/completion RPCs and exact lock waits | exec9368/ba879f |
| Full general browser | exit0;333passed,18deliberate profile skips,3.2min | exec14256/43f229 |
| Secrets and diff | configuredscan43synthetic test/harness matches classified, no real credential; diffcheck0 | 1a4744; genuine reviewed security marker04704f |

Logs live at `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r07-r08-final-{coverage,check,build,browser}.log`, `recovery-v2-r08-integrated-{edge,database}.log`; browser artifacts at `recovery-v2-r07-r08-final-browser-artifacts`. No standalone lint is configured. The configured scanner was unchanged; all43matches are mock credentials or tokens in the no-network disposable SQL harness. The first parent classification helper wrongly assumed every test filename contained`.test.`; direct harness inspection corrected that helper assumption, not scanner/source.

The sole preview was rebuilt after old browser jobs ended: integration VitePID71808/exec45211 on127.0.0.1:5198. Disk/HTTPindexSHA14869f2fb381b84584f12513d9f1c64a955a5c5967ee9221636708cee402e4ff and60-file graphSHA8613c6dc07f01ffb5db4404d3a7426ea113cd8a33a7f7fa6da66a9abfb284383 (sortedpath:SHA256,newline,UTF8) were captured before browser execution; index bytes stayed identical aftersuite6525ba. The build includes R07 frozen working bytes and R08 reviewed bytes, subsequently committed as c044364; it is not a hosted release artifact.

AC025 is covered by actual client immutable-envelope response-loss/deadline/resync tests plus the R06 disposable transaction once-only receipt oracle. AC026 is covered by duplicate/delayed/out-of-order source tests, apply-before-cursor ordering and live current-protocol journey. AC027 explicitly refuses missing/v1 protocol at create/join/saved-rejoin/rematch and guards construction. AC028 proves disposal/account/generation invalidation, stale callback isolation and same-body retry boundaries. The full browser pass also includes R15 untouched ordinary entry and terminal/retry. Existing test expectations and specialist CI invocation remain intact.

This is local acceptance only. R14 must establish backend capability before any R07 client-bearing merge automatically publishes via Pages; all production/schema/settings/merge approvals remain separate. Rollback must select a client compatible with its backend protocol, preserving server revision controls and historical verified receipts.
