# R23 evidence — cache and execute the complete ordinary network CPU plan

Date: 2026-09-12

Task: R23 — Cache and execute the complete ordinary network CPU preparation plan

Route: `$ca-fix` within the approved Recovery V2 sprint

Worker: `gpt-5.6-sol`, reasoning effort `high`, session `01a095f4-9c5c-7782-81c2-82052c18a00d`

## Binding and scope

- Worktree: `C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r23`
- Branch: `codex/recovery-v2-r23`
- Required and observed base/HEAD before and after the uncommitted task diff: `4a69cef27218685bd08e0b1dfa9df8c027167c82`
- Result commit: unavailable because this worker was not authorized to stage or commit; the parent owns integration and commit.
- Frozen source SHA-256: `NetworkClient.ts` `6AE8386DA1C87A1A3B12B42F9A676100716DB2CC22A27209AB87F6A1CB66CF66`; `NetworkClient.botRetry.test.ts` `8CC4611C550AC2E02B6D762479626EBEAF5DA36B8E03C73BEDC8A48E807F8DF6`.
- Immutable task input: `C:/Users/brenn/projects/singedTerra-worktrees/evidence-recovery-v2-input/singedterra-deep-review/singedterra-plan-v2.json`, R23
- Canonical acceptance source: `.codearbiter/specs/evidence-recovery-v2.md`, AC-072 through AC-075
- Exclusive changed paths:
  - `client/src/client/NetworkClient.ts`
  - `client/src/client/NetworkClient.botRetry.test.ts`
  - `.codearbiter/reports/recovery-v2-r23-evidence.md`
- `shared/src/engine/AI.ts`, `client/src/main.ts`, the verified CPU policy/corpora, protocol schemas, Supabase functions, migrations, dependencies, lockfiles, workflows, ledgers, and other governance files are unchanged.
- No server, browser, database, or remote environment was used. Nothing was staged, committed, pushed, deployed, or changed remotely.

The clean worktree did not contain installed dependencies. The authorized locked install, `npm ci --ignore-scripts --no-fund`, completed with exit 0: 178 packages added, 181 audited, 0 vulnerabilities. It changed no package or lockfile.

## Obligation map

| Obligation | Completion evidence | Status |
|---|---|---|
| AC-072 | `maybeDriveBot` checks actor identity and the existing R07 pending/attempt ownership before calling the real planner. A plan is cached by command generation, expected canonical revision, round, turn, and tank. The in-flight and accepted-with-missing-echo regressions pump repeated frames and observe one real planner call and one submit. The retry regression observes one planner call and byte-identical request bodies. | COVERED |
| AC-073 | The network driver executes the original real plan in the local driver's existing order: weapon purchase, accessory purchase, then attack. The full-tier 36,000-credit fixture observes Death's Head buy, parachute buy, and Death's Head fire exactly once, with 8,000 credits, one parachute, and consumed shot ammo. A public `initialize()` regression proves a client reconstructing human-fire plus Death's Head-buy history submits the same remaining parachute action as a live client. Weapon and accessory canonical no-op regressions preserve progress without repeats. | COVERED |
| AC-074 | A matching canonical preparation advances the original cache to the row's next revision and marks that stage complete. Initialization passes validated historical `row.seq` values through reconstruction, suppresses submissions during replay, and retains the cache only when it matches the finalized replay cursor and generation/round/turn/actor. Unexpected progress leaves it stale. Same-turn failure identity, stale-generation blocking, and duplicate-delivery behavior remain covered. | COVERED |
| AC-075 | `shared/src/engine/AI.ts` is unchanged. The network tests wrap and invoke the real exported planner, and the unchanged production local driver suite passes with the network suite. Historical verified CPU selectors, corpora, and policy code are unchanged and passed the complete deterministic check. | COVERED |

## Root cause and correction

The ordinary network CPU driver called `computeAiPlan` before checking its in-flight submit state, so every render-state emission repeated expensive planning. Its phase key collapsed all purchases into one `buy` phase, and it translated only `plan.buy`; `plan.buyAccessory` was never submitted. The canonical preparation reconciliation also recomputed a plan and tracked only weapon outcomes.

`NetworkClient` now performs the cheap bot, actor, pending-command, and attempt guards before planning. It caches the real plan only while command generation, expected revision, round, turn, and active tank remain unchanged. After planning returns, it re-reads the engine and compares captured primitive identity fields before caching or submitting, so a generation or turn retired during synchronous planning cannot leak a stale command.

The action translator now follows the established local order: planned weapon purchase, planned accessory purchase, then shield or fire. Purchase phase keys include revision, purchase kind, and item. A matching ordered preparation measures the actual local engine effect, marks only that stage complete, and advances the same plan cache to the cursor's next revision. This retains the original remaining intent instead of replanning against reduced credits. Unrelated canonical progress cannot pass the generation/revision/round/turn/actor/item checks and leaves the old cache stale. An ineffective weapon preparation retains its original weapon identity for the existing Baby Missile recovery path; an ineffective accessory preparation skips that item and proceeds to the attack. Those failure keys omit revision intentionally and remain valid within the same round, turn, actor, kind, and item.

Historical replay supplies each validated canonical `row.seq` as the reconstruction revision while the ordinary replay guard suppresses CPU submissions. Matching historical preparation stages advance the same plan cache. After `finishReplay(rows.length)` establishes the real cursor, a final validator retains that cache only when revision, generation, round, turn, actor, and phase still match; unrelated progress or lifetime changes clear it.

The HTTP response remains transport evidence only. A successful receipt does not imply a local preparation effect and does not release canonical ownership. The existing R07 immutable pending command remains the only room-command coordinator. When that exact envelope becomes retryable, the CPU driver resubmits its stored action at the stored generation/revision/actor; the existing R07 path preserves the serialized body and logical intent. Ordered apply, cursor commit, and owned unlock remain unchanged.

Local visible aim/fire timing remains owned by the unchanged `client/src/main.ts`; R23 introduces no second coordinator and no network-side presentation delay.

## Regression-first TDD evidence

The first focused invocation before the locked install exited 1 because the clean worktree had no local `vitest` binary.

After dependency restoration, the new regressions ran before product code changed:

```text
npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts
```

Result: exit 1, 32 tests run and 3 intended failures:

1. Sixty unchanged in-flight frames invoked the real planner 60 times instead of once.
2. The complete real plan submitted the Nuke attack immediately instead of buying the planned parachute after the weapon preparation.
3. A command generation retired directly through the private lifecycle seam after real planning still submitted one stale POST.

The first minimal correction made those 32 tests pass. The weapon no-op regression then brought the focused suite to 33/33, and the accessory no-op plus accepted/retry cache assertions brought the final focused suite to 34/34. The tests instrument the real planner and drive real `NetworkClient`/`GameEngine` behavior; they do not replace planner output with a mock.

Fresh independent gpt-6-astra/high review session `01a0960b-f862-7f13-a21a-9981cf704dd1` rejected the first candidate because successful weapon preparation discarded the original remaining accessory intent. The reviewer probe exited 1: at arms level 4 with 36,000 credits, the real plan was Death's Head plus parachute, but after the 24,000-credit weapon buy the driver fired immediately with zero parachutes. The corrected regression was authored before the correction and exited 1 for that exact missing second buy. After stage-preserving correction, the regression and the reviewer's unchanged probe both exit 0; the complete focused suite remains 34/34, and all no-op action/effect assertions remain unchanged while their planner counts strengthen to one.

Fresh corrected-source gpt-6-astra/high review session `01a0961d-b29b-71e3-a470-d19efb60c059` rejected that candidate because public initialization cleared the original plan during replay. Its historical client fired Death's Head with 12,000 credits and zero parachutes while the equivalent live client submitted the parachute. The public initialize-versus-live regression was authored first and exited 1 for the same mismatch. The first implementation attempt remained red because a pre-cache guard still compared historical revision 1 with the intentionally deferred replay cursor 0. Restricting that cursor check to live application and validating the reconstructed cache against the finalized cursor made the regression and unchanged reviewer probe pass.

## Final verification

| Command | Exit | Exact result summary |
|---|---:|---|
| `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` | 0 | Final source: 1 file, 35/35 tests passed. |
| `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts src/main.hotSeatProgression.test.ts` | 0 | Final source: 2 files, 95/95 network and unchanged local production-driver tests passed. |
| `node node_modules/tsx/dist/cli.mjs --tsconfig client/tsconfig.json C:/Users/brenn/AppData/Local/Temp/r23-review-complete-plan-probe.mts` | 0 | The unchanged reviewer probe observes Death's Head buy followed by parachute buy; before correction it exited 1 after observing an immediate Death's Head fire. |
| `node node_modules/tsx/dist/cli.mjs --tsconfig client/tsconfig.json C:/Users/brenn/AppData/Local/Temp/r23-corrected-review-initialize-plan-probe.mts` | 0 | The unchanged corrected-review probe observes the historical client submit the remaining parachute buy at finalized revision 2; before correction it exited 1 after observing Death's Head fire. |
| `npm run typecheck` | 0 | Final source: shared and client strict TypeScript checks passed. |
| `npm run coverage:client` | 0 | Final source: 203 files and 1,880 tests passed; statements 91.17% (9,044/9,919), branches 84.16% (5,097/6,056), functions 88.08% (1,338/1,519), lines 93.97% (8,383/8,920). Expected jsdom canvas diagnostics were emitted. |
| `npm run check` | 0 | Pre-F1/F2 candidate: complete deterministic chain passed, including exhaustive verified duel, benchmark 7/7, both verified CPU corpora, and verified CPU policy. |
| `npm run check` on final source | interrupted | Passed through replay determinism. At the parent's request it was terminated before the benchmark-heavy tail to avoid contention with an active browser suite; Ctrl-C produced exit 1. The current integrated full check remains required and parent-owned. |
| `npm run build` | 0 | Final source: shared and client strict TypeScript checks passed; Vite 8.2.2 transformed 2,731 modules and completed the production build. The existing non-blocking large-chunk advisory was emitted. |
| `git diff --check` | 0 | No whitespace errors; Git emitted only the configured LF-to-CRLF working-copy notices. |

The final coverage command is the complete client suite; it is not duplicated by a separate final `test:client` run. No shared engine or verified-policy source changed. The final real planner/engine regressions, local-driver compatibility run, typecheck, coverage, and build bind the correction; parent integration must complete the deferred full check.

The repository declares no lint command; strict `tsc --noEmit` is the configured static gate and passed as part of the final build.

## Evidence boundaries and remaining work

- The network regressions use the real planner, `NetworkClient`, and `GameEngine`, but stub Supabase, fetch, Realtime delivery, animation frames, and timers. They prove local orchestration and committed action/effect counts, not live Supabase or browser behavior.
- The stale-generation regression intentionally invokes the private `retirePendingCommands` lifecycle primitive during the real synchronous planner call. It is an exact reentrant generation-retirement seam, not a claim about a public `stop()` flow; the existing disposed guard covers public stop behavior.
- Ordinary mixed-client AI-policy compatibility remains the R06/R07/R19 release gate. R23 changes no protocol or ruleset version and does not authorize promotion among incompatible ordinary clients.
- Fresh independent gpt-6-astra/high review of this corrected source, parent integration, governed commit, PR, release, deployment, and live proof remain parent-owned and are not claimed here. The prior review identified the corrected defect and is not acceptance of this revision.

## Rollback boundary

Discard only this isolated three-path R23 diff before integration. If integrated, revert the R23 change as one unit while preserving R07, R21, R22, and unrelated work. No data migration or external rollback is required.
