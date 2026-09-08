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

## Delivery sequence

- [ ] Finish PR 445, exact-head CI, Pages and backend deployment proof.
- [x] Extract verified-deployment lifecycle from Lobby and prove existing caller behavior unchanged.
- [ ] Extract match-session ownership from main: start/stop, subscriptions, timers, renderer disposal. One owner must dispose each resource exactly once.
- [ ] Split remaining Lobby/HUD workflows into controllers and semantic views; move authored styles out of TypeScript independently so behavioral diffs stay reviewable.
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

## Working rules

Ship bounded slices; do not combine dependency upgrades with behavioral refactors. Keep existing public boundaries until consumers migrate. Prefer responsibility ownership over generic utility buckets or pass-through wrappers. Add dependency-boundary checks where they prevent a demonstrated regression. Keep a concise evidence record here rather than accumulating duplicate campaign artifacts.

## Evidence log

- Initial dependency audit: zero npm advisories; GitHub Dependabot alert API disabled. Terra agent owns package/action upgrade review separately.
- PR 445 final review passed; CI exposed a PostgreSQL container bootstrap readiness race, under repair before merge.
- First slice baseline: 1,638 client tests; Windows Lobby coverage 89.45% lines / 77.42% branches. New seam suite failed on the missing controller before extraction.
- After extraction: 1,644 client tests, no pre-existing test edits; combined Lobby/controller coverage 89.64% lines / 77.88% branches. The controller alone has 92.62% lines / 86.39% branches. Compare the combined surface because moving covered code changes each individual file's denominator.
- Typecheck, build and deterministic harnesses pass. Independent review compared all 12 moved lifecycle/helper bodies against the baseline AST and found parity, with no blocking findings. Full browser verification passed: 324 checks across desktop, touch, and smaller-window profiles; 12 existing profile-specific skips, no retries.
