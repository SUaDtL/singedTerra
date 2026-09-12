# R21 evidence receipt — completion update 4

- Date: 2026-09-10
- Task: R21 - Keep CPU restock plans legal under the current room arms level
- Worker: gpt-5.6-sol / high
- Worktree: `C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r21-completion`
- Branch: `codex/recovery-v2-r21-completion`
- Base/result HEAD: `65fc62547630b789ebe430ad24405ee8e50f8706` plus the uncommitted task diff
- Changed paths: `shared/src/engine/AI.ts`, `scripts/checks/ai.mjs`, `client/src/client/NetworkClient.ts`, `client/src/client/NetworkClient.botRetry.test.ts`, `client/src/main.ts`, `client/src/main.hotSeatProgression.test.ts`, `.codearbiter/reports/recovery-v2-r21-evidence.md`

## Correction to the initial receipt

The initial four-file receipt from `C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r21` overstated AC-068. Its successful network ordered-echo test showed that HTTP acceptance alone did not trigger the attack, but it did not cover the production local driver or an ordered buy echo that failed to create usable ammo. The completion work below closes those gaps. The initial red/green history is retained later in this receipt rather than erased.

A subsequent fresh gpt-6-astra / high review (`01a0897a-c5b8-7db1-96b0-160e2e05eab1`) found one HIGH: the first completion tied ineffective-preparation recovery to this client's own pending submit, so a live observer or late-history client could replay the same ineffective canonical buy and propose another buy. That review correctly left AC-068 incomplete. Completion update 2 derives the outcome in the common canonical action-application path. Both earlier fix histories remain below.

A second fresh gpt-6-astra / high review (`01a08996-6d66-7141-9d00-cbb651c9ff09`) found one HIGH in completion update 2: any different canonical row for the same actor/round/turn cleared an unresolved HTTP attempt. The following state emission could then submit a duplicate attack, and the late original response no longer matched the replaced attempt object. That review also correctly left AC-068 incomplete. Completion update 3 retains unresolved request ownership across different canonical progress and resolves both progress-before-response and response-before-progress orderings. All prior review and fix histories remain below.

A third fresh gpt-6-astra / high review (`01a089ae-0d8f-7fc3-8f8d-d651a229efaa`) returned a generic pass with one MEDIUM deferrable finding, but its direct evidence left AC-067 incomplete: `main.ts` passed omitted `armsLevel` to the AI as tier 0 while `GameEngine` defaults omitted or non-finite values to tier 4. The mocked local-plan tests hid this production composition mismatch. Completion update 4 aligns the local planner with the engine's finite floor/clamp and tier-4 default, and adds a real `computeAiPlan` + `HotSeatClient` + `GameEngine` execution. The finding was corrected in R21 despite its generic deferrable label.

## Obligation map

| Obligation | Source | Completion coverage | Status |
|---|---|---|---|
| AC-065 | Approved R21 spec | The exact D01 arms-level-0 fixture fires the legal unlimited Baby Missile and advances. Production local and real `NetworkClient` ineffective-preparation fixtures also fall back to Baby Missile and advance through the actual engine. | COVERED |
| AC-066 | Approved R21 spec | Levels 0-4 across easy/medium/hard reject every above-tier purchase, cover insufficient credits, and preserve use of owned above-tier inventory. | COVERED |
| AC-067 | Approved R21 spec | Every explicit tier/difficulty case repeats byte-identically. Existing AI competence, difficulty, full-tier personality, and deterministic harnesses pass. The production local driver now normalizes the planner tier exactly like `GameEngine`: finite values are floored and clamped to 0-4; omitted or non-finite values default to full tier 4. A real omitted-setting execution buys usable Nuke ammo through `HotSeatClient`, fires it, and advances the real engine turn. Both pinned verified CPU corpus selectors and the policy selector are unchanged and pass. | COVERED |
| AC-068 | Approved R21 spec | Production local-driver tests cover successful preparation, ineffective preparation with an actual legal fallback, no usable fallback, ammo loss before fire, and in-place mutation to a later same-seat turn. Real `NetworkClient` tests derive the exact round/turn/actor/weapon outcome from canonical before/after replay state for originators, observers, resync, and late history. They cover usable preparation, visible fallback, visible no-ammo stop, no repeat buy, duplicate canonical buys during a pending successful or fallback attack, and the full pending/accepted/failed/conflict ordering matrix. Exact rows latch the intended action; different rows retain unresolved ownership or release one replan after conflict; late old responses cannot overwrite a newer attempt. Assertions observe submitted actions, real engine inventory, and turn outcomes rather than transport latches alone. | COVERED |

## Change

`chooseBuy` receives the normalized room arms level and excludes store entries above it. Owned inventory selection remains unchanged, including legal use of opening ammo above the room's purchase tier. Both production drivers pass engine-equivalent normalization to `computeAiPlan`: finite values are floored and clamped to 0-4, while omitted and non-finite values default to tier 4. This preserves the engine's historical full-tier default while explicit restricted rooms remain restricted.

The local production driver inspects inventory after its synchronous buy. The network driver's common `applyNetworkAction` path identifies a bot's planned preparation from the canonical pre-action round, turn, actor, weapon, and deterministic plan, then inspects actual post-replay inventory. This path is used by live ordered rows, resync, and initialization/history, so every same-build client derives the same result without local transport ownership. One ineffective preparation falls back to an actually usable Baby Missile and emits `CPU restock failed — using Baby Missile.` If neither weapon is usable, it submits no attack and emits `CPU has no usable ammunition — reload to continue.`

Initialization precedes the production HUD subscription, so a still-relevant history recovery notice is retained and delivered through the existing `onFireFailed` seam when main subscribes. A bot seq conflict no longer assumes the winning intent was identical: the exact attempted action stays blocked while the existing resync runs, and the canonical row either proves a match or releases the intent for one fresh deterministic submission. A different row arriving while HTTP remains unresolved records canonical progress without releasing request ownership, preventing state emissions from creating duplicate attacks. If conflict follows that retained progress, or the row follows conflict, the attempt is released once for deterministic replanning. Exact-row and attempt-object identity guards keep late accepted, failed, or conflicting responses from undoing a committed phase or a newer actor's attempt. Transient submission failure still clears the attempt for the existing bounded retry path.

The local delayed attack captures primitive round, turn, and actor identity before scheduling. Both timers re-read phase/identity, and the fire timer rechecks ammo. This prevents an in-place-mutated `GameState` reference from making a later turn look like the originally prepared turn.

No R22 target-selection change, R23 whole-plan caching, R07 protocol field, dependency change, or broader coordination framework is included.

## TDD evidence

Initial tier-legality red, before the first four-file implementation:

- `npx tsx scripts/checks/ai.mjs` - exit 1. The regression reported `armsLevel 0 proposed forbidden purchase nuke`; the exact D01 action was rejected and remained at turn 0 / p1.
- `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` - exit 1. The restricted room submitted `{ type: 'buy', weapon: 'nuke' }`; seven pre-existing tests remained green.

Initial tier-legality green:

- `npx tsx scripts/checks/ai.mjs` - exit 0, including D01, levels 0-4, all three difficulties, affordability, fallback, owned above-tier ammo, and deterministic repeat checks.
- `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` - exit 0, 8/8 tests.

Completion red, before failed-preparation recovery:

- `npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts src/client/NetworkClient.botRetry.test.ts` - exit 1, 62 passed and 3 failed for the intended reasons: the local ineffective preparation did not advance, the local no-ammo case still selected/aimed/fired, and the network ineffective ordered echo emitted no visible recovery notice.

Primitive turn-identity red, after reviewer inspection exposed the moving-reference guard:

- `npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts` - exit 1, 57 passed and 1 failed. After in-place mutation to a later turn for the same CPU seat, the production fire callback still forwarded `fire` because it compared against the same mutated `GameState` object.

Completion green:

- `npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts src/client/NetworkClient.botRetry.test.ts` - exit 0, 2 files and 68 tests passed.

Canonical replay red, after the fresh Astra review:

- `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` - exit 1, 10 passed and 4 failed for the intended reasons: the observer submitted a second Nuke buy, both late-history cases lost their visible notice and followed the ordinary buy plan, and a seq-conflicted fallback remained falsely latched after a different winning buy row.

Canonical replay green:

- `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` - exit 0, 15/15 tests. Coverage includes two live clients, initialization/history with the production subscribe-after-initialize order, no-fallback history, explicit resync, and different-intent conflict settlement.

Transport ownership red, after the second fresh Astra review:

- `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` - exit 1, 18 passed and 10 failed for the intended reason. Both a successfully stocked Nuke attack and an ineffective-preparation Baby Missile fallback produced a third POST after a duplicate canonical buy; pending/accepted/failed/conflict progress-before-response cases and exact-row-before-late-response cases exposed the same premature ownership release.

Transport ownership green:

- `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts` - exit 0, 28/28 tests. Coverage drives real `NetworkClient` instances and engine state through different-row-before-pending/accepted/failed/conflict, conflict-before-different-row, exact-row-before-late-accepted/failed/conflict, conflict-before-exact-row, and actor/turn advancement before an old response.
- `npm -w @singedterra/client run test -- src/client/NetworkClient.botRetry.test.ts src/main.hotSeatProgression.test.ts` - exit 0, 2 files and 86/86 production-driver tests.

Default-tier production composition red, after the third fresh Astra review:

- `npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts` - exit 1, 58 passed and 1 failed for the intended reason. With omitted `armsLevel`, the actual engine accepted full-tier purchases but the production main driver passed tier 0 to the actual planner; the real CPU therefore left Nuke ammo at 0 instead of restocking it.

Default-tier production composition green:

- `npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts` - exit 0, 59/59 tests. The new source regression executes actual `computeAiPlan`, actual `HotSeatClient`, and actual `GameEngine` through the production main driver; it observes the legal Nuke purchase, usable ammo, Nuke fire, and eventual real turn advance.
- `npm -w @singedterra/client run test -- src/main.hotSeatProgression.test.ts src/client/NetworkClient.botRetry.test.ts` - exit 0, 2 files and 87/87 production-driver tests.
- `npx tsx scripts/checks/ai.mjs` - exit 0 after the default-tier correction, retaining the explicit levels 0-4, three-difficulty, affordability, fallback, owned-above-tier, D01, and deterministic-repeat checks.

## Fresh verification

| Command | Exit | Result |
|---|---:|---|
| `npm ci --ignore-scripts --no-fund` | 0 | 178 packages installed; 0 vulnerabilities. This restored the locked toolchain after the first focused invocation found no local Vitest binary. No dependency or lockfile changed. |
| `npm run typecheck` | 0 | Shared and client strict TypeScript checks passed after the final default-tier correction. |
| `npm run test:client` | 0 | 200 files and 1,817 tests passed after the final fix. Expected jsdom canvas diagnostics were emitted. |
| `npm run coverage:client` | 0 | Windows / Node 24.18.0: lines 93.17%, branches 81.82%, statements 90.43%, functions 87.20%. The Stage 1 line and branch threshold is 60%. |
| `npm run check` | 0 | The final deterministic harness chain passed, including the AI matrix, AI determinism/search, arms level, lockstep, verified duel (73,124 exhaustive cases), verified CPU corpus default, `--policy=3`, and verified CPU policy. |
| `npm run build` | 0 | Strict typecheck and Vite production build passed after the final default-tier correction. Vite retained its non-blocking large-chunk warning. |
| `git diff --check` | 0 | The complete seven-path R21 diff has no whitespace errors. Git emitted only the configured LF-to-CRLF working-copy notices. |

The repository config declares no lint command; strict typecheck is the configured static gate.

## Compatibility and remaining limits

- Ordinary mixed-client AI-policy compatibility remains a release blocker owned by R06/R07/R19. R21 does not change the protocol or ruleset version and must not be promoted across incompatible ordinary clients without that integration decision.
- Verified V2/V3 selectors, pinned corpora, and policy code are unchanged by the seven-path R21 diff. Their complete final checks pass as recorded above.
- A new independent gpt-6-astra / high review of completion update 4, parent integration, commit gate, commit, PR, release, deployment, and live proof remain parent-owned and are not claimed here. All three earlier Astra reviews and their findings are retained above, not treated as acceptance.
- No localhost, remote write, database mutation, staging, commit, push, ADR, or dependency change occurred.

## Superseded initial receipt history

The initial receipt used worktree `C:/Users/brenn/projects/singedTerra-worktrees/recovery-v2-r21`, branch `codex/recovery-v2-r21`, and base/result HEAD `3902cad662aea03cec913d984d17aa9573b89bd0` plus an uncommitted four-file diff. It recorded the two tier-legality red/green commands above, a 200-file / 1,778-test client run, 93.14% line and 81.55% branch coverage, a green deterministic check, a green build, and `git diff --check` exit 0. Its AC-068 conclusion is superseded by this completion update for the reason stated at the top.

## Parent integration and independent acceptance, 2026-09-10

Fresh Astra/high reviewer /root/r21_default_review, session01a089be-a734-7dc3-be37-2f02939d9542, completed raw review, separate finding triage and final aggregation: PASS, zero findings, AC065..068 covered. Actual model and effort were verified from session turn_context. The reviewer independently ran87 driver tests, AI,36 determinism combinations, arms-level and lockstep harnesses, and diff check. The three earlier findings remain in the history above; this final review assesses their corrected source.

Parent integration source was dad0c506f3b780b4ed6eb362df89a39c1161f509. All six source baseline blobs matched the task base, and all seven task files copied byte-for-byte without conflict. Parent independently reran the focused87 tests before integration, then full integrated npm run check, npm run test:client (200files1817tests), npm run build/typecheck, configured secret scan (empty findings), and git diff --check: all exit0. Logs: C:/Users/brenn/AppData/Local/Temp/recovery-v2-r21-integrated-check.log, recovery-v2-r21-integrated-test-client.log, and recovery-v2-r21-integrated-build.log in the same directory. Coverage percentages above remain author-measured; the full integrated client run is separate parent evidence. Governed commit is the next operation; no push, PR, release or deployment is claimed.

Ordinary multiplayer policy compatibility remains the R06/R07/R19 release gate. Local R21 acceptance does not waive that gate or claim live Supabase proof.

## Rollback boundary

Discard only this isolated seven-path task diff before promotion. If already integrated, revert the R21 change as one unit while preserving unrelated work. The completion baseline is `65fc62547630b789ebe430ad24405ee8e50f8706`; no data migration or external rollback is required.
