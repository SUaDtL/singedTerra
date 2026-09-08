# Software recovery

Owner: requested by Brenn, 2026-09-08. Working branch: `codex/software-recovery`.

## Outcome

Make adding a weapon, a game mode, or a screen a local change with an explicit contract and a runnable regression suite. Preserve the accepted console, deterministic replay, existing saves/awards, and static hosting throughout incremental delivery.

## Evidence and priorities

The starting tree is PR 445 head `41a0acd`. Physical source sizes are indicators, not targets: Lobby contains about 5,600 lines, HUD about 4,600, main about 1,400, NetworkClient about 1,300. Inspection shows ownership mixing, not merely long files:

1. Lobby owns account presentation, verified mission state/persistence/deadlines and asynchronous account races, room sessions, diagnostics, vehicle customization, and styles.
2. main owns application composition alongside live match teardown, AI scheduling, verified transcript replay, and input policy.
3. HUD owns multiple independent dialog and post-match workflows despite the battle console having its own semantic component tree.
4. NetworkClient combines action ordering, transport recovery, room lifecycle/rematch, bot driving, and progression submission.
5. Renderer/GameEngine require further change-coupling and profile evidence before decomposition; their size alone is insufficient justification.

In the last 100 commits touching client/shared sources at the baseline, Lobby appears 48 times, HUD 31, main 25, and Renderer 14. This supports the ownership order above. `main.ts` is excluded from unit coverage as bootstrap glue, but currently contains verified restoration and session policy; those responsibilities need direct tests as they leave the entry point.

## Delivery sequence

- [x] Finish PR 445, exact-head CI, Pages and backend deployment proof.
- [x] Extract verified-deployment lifecycle from Lobby and prove existing caller behavior unchanged.
- [ ] Extract match-session ownership from main: start/stop, subscriptions, timers, renderer disposal. One owner must dispose each resource exactly once.
- [ ] Split remaining Lobby/HUD workflows into controllers and semantic views; move authored styles out of TypeScript independently so behavioral diffs stay reviewable.
  - Garage presentation is extracted in PR 449. Lobby retains loadout and focus ownership; the view receives explicit intents and a live editing predicate. Remaining workflows and authored styles still need assessment.
- [ ] Isolate network action sequencing/recovery from room transport without changing canonical action order or referee contracts.
- [ ] Audit renderer and engine extension points using a representative new-weapon/change walkthrough; extract only responsibilities with a stable contract.
- [ ] Evaluate replacement dependencies against actual maintenance burden and measured capability gaps. Record adoption/rejection, migration cost, bundle/runtime cost, accessibility, determinism, and hosting compatibility.

## First refactor contract

Move verified mission state ownership to `client/src/client/VerifiedDeploymentSession.ts`. Keep `Lobby` public signatures and state type exports compatible. Scope: state types, start, accepted-fire recording, deadline refresh, complete/retry, abandon, casual/return choices, account ownership freeze/revalidation. Account-change diagnostics, render/focus order, and public Lobby forwarding remain in place.

Consumers: main, Lobby's local-battle presentation, and `Lobby.account.test.ts`. New controller receives the account port and storage; it must not import Lobby, DOM presentation, or Supabase. The account port remains the IO boundary. Preserve clocks, generation checks, immutable state snapshots, descriptor binding, persistence order, and accepted-receipt criteria exactly.

Verification: baseline and post-change client coverage; direct controller seam tests before extraction; unmodified existing account, storage, controller and browser workflows; full client suite, deterministic harnesses, typecheck/build. No behavior change may be disguised by editing an existing assertion.

| Public surface | Contract retained |
| --- | --- |
| `verifiedDeployment` | Immutable state snapshot |
| `startVerifiedDeployment(now?)` | Descriptor-bound start/resume or null |
| `recordVerifiedDeploymentFire(value, now?)` | Append only an accepted owner shot |
| `refreshVerifiedDeploymentDeadline(now?)` | Countdown and irreversible expiry choice |
| `completeVerifiedDeployment(now?)`, `retryVerifiedDeploymentCompletion(now?)` | Exact persisted evidence, deadline and owner-generation checks |
| `abandonVerifiedDeployment()` | Clear recovery only after accepted server abandonment |
| `continueVerifiedDeploymentCasually()`, `returnVerifiedDeploymentToBattery()` | Explicit terminal/expiry choices |
| New controller account-change seam | Identity generation, freeze, and descriptor revalidation retain their original order around Lobby render/focus/diagnostics |

The exported `LobbyVerifiedDeploymentState` remains an alias for callers; the controller owns `VerifiedDeploymentState`. `AccountSessionPort` extends the controller's narrow account IO port. No caller gains direct access to credentials or Supabase.

## Dependency/engine decision boundary

A rendering engine cannot fix account/session ownership. Retain Canvas gameplay and inert Pixi presentation during initial recovery. Consider a state-machine library only after an explicit state boundary exists and its transition complexity warrants the dependency. Any proposed physics engine must prove deterministic replay compatibility or include an explicitly reviewed protocol migration. Raise an ADR conflict with the proposed alternative and migration plan, rather than treating the ADR as a veto.

Initial dependency assessment, checked 2026-09-08:

| Candidate | Fit and next evidence |
| --- | --- |
| Phaser scenes | Provides lifecycle sections with init/preload/create/update. It could replace client scene orchestration, but adopting it alongside current Canvas/Pixi presentation first introduces another lifecycle owner. Reassess after the match-session boundary exists using one isolated scene prototype. [Official scene documentation](https://docs.phaser.io/phaser/concepts/scenes) |
| Phaser Arcade/Matter physics | The bundled physics systems are not evidence of parity with this game's per-pixel terrain and canonical replay. No replacement is selected. Require pinned transcript equivalence and a migration-cost estimate before proposing adoption. [Official physics documentation](https://docs.phaser.io/phaser/concepts/physics) |
| XState | Pure transition functions and invoked actors are relevant to account/mission/session races. After extraction, compare one transition model against the existing tests and evaluate whether it removes more custom lifecycle machinery than it adds. No dependency is installed in this slice. [Transitions](https://stately.ai/docs/transitions), [actors](https://stately.ai/docs/invoke) |

These fit assessments are engineering inferences from the current code and documented capabilities, not completed migration benchmarks.

## Gameplay finding to address separately

The production verification mission repeatedly selected CPU angle 90 / power 20. A local engine reproduction on seed 17, after a human angle 45 / power 50 shot, confirmed `selectVerifiedCpuFire` chooses 90 / 20: zero opponent damage and 32.6317 self-damage. The same state with 135 / 100 causes zero damage to either tank.

`simulateProbe` in `shared/src/net/verifiedDuel.ts` reads proximity from the projectile after the shot has settled. Both reproduced misses have a null projectile, so both receive zero proximity penalty. The score omits self-damage, and equal scores retain the first coarse candidate. This is a gameplay-quality defect candidate independent of module size, and demonstrates why parity tests alone are insufficient for recovery.

Next work: pin the harmful-versus-safe-miss case as a gameplay regression, evaluate impact-distance and self-preservation scoring within the existing probe/tick budget, and add representative seed/outcome tests. Changing verified CPU decisions changes canonical replay: retain V2 semantics for eligible sessions and completed evidence; deliver the improved policy under a reviewed version transition and guarded drain. Do not silently change V2 while current sessions remain eligible. This requires no engine replacement to investigate.

## Working rules

Ship bounded slices; do not combine dependency upgrades with behavioral refactors. Keep existing public boundaries until consumers migrate. Prefer responsibility ownership over generic utility buckets or pass-through wrappers. Add dependency-boundary checks where they prevent a demonstrated regression. Keep a concise evidence record here rather than accumulating duplicate campaign artifacts.

## Current execution assignments

Parent Astra owns architecture, integration, and delivery review. Sol owns the next match-session lifecycle extraction from `main.ts`. Luna owns a separate Garage view extraction from Lobby, preserving loadout state and focus behavior. Both work in isolated worktrees and retain existing tests unchanged. Prefer Luna for bounded, explicit contracts; use Sol where asynchronous ownership needs broader reasoning.

The next reviewed slices are PR 450 (runtime weapon catalog agreement) and PR 451 (match resource ownership plus explicit stale-start fixes). Sol is extracting ordered action admission/draining from NetworkClient; overlapping live fetches must merge, while disposed sessions reject late results. Luna is moving authored Lobby/HUD CSS into CSS files while preserving the cooked runtime strings, injection order, and IDs.

The weapon extension audit found that ordinary blast weapons already fit the data-driven `WEAPONS` definitions. The remaining edits include inventory, catalog, and exhaustive presentation maps. Exhaustive TypeScript maps are useful coverage; the separately maintained `submit_action/validate.ts` weapon allowlist is a synchronization hazard. A future slice should enforce agreement across the Deno referee and shared catalog without making the referee import browser or engine code. New flight behaviors still require deliberate engine state, clone, and replay changes; do not obscure those contracts behind a generic plugin interface.

## Evidence log

- Dependency PRs 447 and 448 merged with exact-head green CI. Dependabot monitoring is enabled with zero open alerts; npm audit reported zero vulnerabilities. Supabase CLI remains at 2.105.0 pending a separate review of the newer CLI runtime graph and deployment compatibility.
- PR 445 final review passed; its PostgreSQL container bootstrap readiness race was fixed before merge using a bounded TCP readiness probe.
- First slice baseline: 1,638 client tests; Windows Lobby coverage 89.45% lines / 77.42% branches. New seam suite failed on the missing controller before extraction.
- After extraction: 1,644 client tests, no pre-existing test edits; combined Lobby/controller coverage 89.64% lines / 77.88% branches. The controller alone has 92.62% lines / 86.39% branches. Compare the combined surface because moving covered code changes each individual file's denominator.
- Typecheck, build and deterministic harnesses pass. Independent review compared all 12 moved lifecycle/helper bodies against the baseline AST and found parity, with no blocking findings. Full browser verification passed: 324 checks across desktop, touch, and smaller-window profiles; 12 existing profile-specific skips, no retries.
- PR 445 merged as `cfbbead9c624cb43f27862bd62d37783664cfd69`; Pages run `34229994141` passed publication, provenance and live smoke. Supabase automatically applied 018/019 and deployed the rematch handler. Hosted replay passed; V2 start succeeded after guarded admission enablement. A rolled-back production rematch RPC check passed without changing the earlier test room.
- Production V2 completion retry passed: deliberately discarded one accepted response, then the normal Retry returned the identical immutable receipt. Diagnostics reported one match, one win, 200 XP; database counts confirmed one completed V2 session and one award.
- Integration with dependency merge `9d0aaa0`: 1,644 client tests, 359 Edge tests, deterministic harnesses, typecheck, build, and secret scan passed. Dependency release Pages run `34234727895` completed successfully. PR 446 requires fresh CI after this base update before merge.
- PR 446 merged as `81dddd1` after exact-head CI passed, including responsive interaction checks. Garage PR 449 retains all existing tests unchanged and adds direct callback, focus-trap, live editing, and listener cancellation tests. Initial Garage coverage: 98.18% lines / 87.5% branches. Its integrated client suite passes 1,648 tests after the verified lifecycle extraction.
- PR 449 merged as `9f24e29`. Its rendering job was still running when GitHub accepted the merge; all jobs subsequently passed. Pages run `34282966487` and published metadata confirm deployment. Browser evidence: 320 initial passes, one touch-drag retry pass, 12 configured skips; product-completion suite: 81 passes and 19 configured skips. Follow up the intermittent `first-salvo.spec.ts:117` touch drag: forwarded aim remained zero on its first run. Do not relax the assertion or treat the retry as proof of a diagnosed cause.
