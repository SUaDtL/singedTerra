# Software recovery delivery record

Requested by Brenn on 2026-09-08. This record describes the bounded software-recovery program. It is not a claim that all repository debt is closed.

## Current delivery state

Runtime delivery checkpoint: published `87283aca03954569e3e6e5a1d1b9c1cc345d95d7` through PR473 on 2026-09-09. Pages run `34327066205`, public deployment metadata, and hosted smoke matched that revision; the smoke passed 1 check in 3.0 seconds.

| Package | Status | Delivery evidence |
| --- | --- | --- |
| A. Versioned verified CPU policy | Delivered | PR457, PR460, and PR462; V2/V3 compatibility, admission controls, replay checks, immutable retry, fallback, drain, and re-enable proof. |
| B. Room and session ownership | Delivered | PR458, PR461, and PR472; controller cancellation and subscription tests; public guest archives T1VG and LTZB. |
| C. Terminal match presentation | Delivered | PR456, PR464, and PR471; semantic view, browser geometry and focus tests, cap and natural terminal recovery proof. |
| D. Mode configuration and composition | Delivered | PR467 and PR473 are published. PR473 Pages run `34327066205`, its public metadata, hosted smoke, final preview, and normal-casual smoke match `87283aca03954569e3e6e5a1d1b9c1cc345d95d7`. |

The reusable goal and binding requirements remain in [SOFTWARE_RECOVERY_IMPLEMENTATION_PLAN.md](SOFTWARE_RECOVERY_IMPLEMENTATION_PLAN.md). That plan is the source for future resumption and operational limits.

## Delivered scope

### A. Versioned verified CPU policy

PR457 added V3 CPU-policy dispatch and the bounded replay corpus. PR460 deployed compatible V3 admission and its database contract. PR462 added client recovery for V3 sessions. The rollout record demonstrates retained V2 behavior, V3 admission, disabled-admission fallback, controlled drain, re-enable, and immutable retries. V3 remains enabled. Both V2 and V3 verifiers remain necessary for eligible historical sessions.

V2 session `6d5689ad-9479-401f-8f82-3be00dc572e7` completed with a win and 200 XP, changing matches 7 to 8 and XP 1300 to 1500. Its retry retained one award. V3 session `59a825cd-397f-4fa7-8dc7-67c870f6b1a5` started at `04:29:56.848286Z`, completed a 100 XP loss at `04:37:22.562585Z`, and changed matches 8 to 9 and XP 1500 to 1600 while new V3 admission had been disabled at `04:30:15.831929Z`. Its retry also retained one award. V2 fallback session `52aae01f-b9c3-4782-b2ec-df444afd6320` remains abandoned as `(2, 2, 4)`. The controlled drain reached zero active V3 sessions at `05:00:08Z`, after the `04:59:56.848286Z` safe-after time, and re-enabled V3 at `05:00:22.620174Z`.

The 32-seed corpus observed and pinned maximum ticks of 5,074. V2's maximum candidate count was 59 and V3's was 49. The V3 corpus recorded 12 damaging choices with zero self-damage. These are corpus observations under bound tests, not a configured hard tick cap. The same policy module is exercised by the Node and Deno canonical fixtures and Edge completion checks.

| Case | Behavior |
| --- | --- |
| Eligible V2 tuple `(2, 2, 4)` | Resume, completion, and retry use V2 replay semantics. |
| Eligible V3 tuple `(3, 3, 4)` | Resume, completion, and retry use V3 replay semantics even when new V3 admission is disabled. |
| Expired uncompleted deployment | Gameplay and completion freeze until explicit casual continuation or return to Battery. Completed results retain their immutable receipt retry path. |
| Completed retry | The result-specific receipt remains immutable and cannot add another award. |
| Legacy zero-body request with no capabilities | Start treats the request as V2-only. |
| Explicit empty capabilities or malformed request | Reject before storage. |
| New dual-capabilities request | Admission selects an enabled supported tuple and persists it. |
| Mixed-field tuple or unknown tuple | The request fails closed. It never substitutes another replay policy. |

Source boundaries are `shared/src/net/verifiedDuel.ts`, `supabase/migrations/020_verified_deployment_v3.sql`, `supabase/functions/start_verified_deployment`, and `client/src/client/verifiedDeployment.ts`. The committed replay, referee, client recovery, and database tests cover these cases.

### B. Room and session ownership

PR458 moved room admission, saved-room recovery, leave, cancellation, and workflow control into `client/src/client/LobbyRoomController.ts`. The controller delegates actual waiting subscriptions to the existing `LobbySession` resource owner. PR461 added stale admission and leave cleanup. PR472 writes the successor public descriptor only for the active client generation before a rematch start, so reload can offer Rejoin without exposing the seat token.

`LobbyRoomController.cancellation.test.ts` and `Lobby.roomCancellation.test.ts` cover stale create and join responses, leave during join, account changes during a fetch, retryable leave, and subscription ownership. The real `LobbySession` fixture proves one waiting channel after entry and zero after leave or repeated entry and exit.

Two public, isolated-guest runs provide the network boundary:

- `recovery-terminal-resume/.artifacts/guest-live-2026-09-09T07-47-36-037Z/evidence.json` records private create/join/start, a transport interruption and catch-up, normal report/rematch, and same-context reload/Rejoin of the successor. The successor retained the FFA, Single Round, roster, and reset health presentation. All 11 recorded action submissions returned 200.
- `recovery-terminal-resume/.artifacts/guest-leave-rejoin-2026-09-09T07-53-19-414Z/evidence.json` records normal guest Leave, visible host roster removal, same-context Join-with-code re-entry, ready/start, and one accepted action per guest. Ready and action responses were all 200.

The final match view did not expose Leave in either run. Those rooms were not represented as explicitly cleaned and were left for normal server expiry.

### C. Terminal match presentation

PR456 extracted terminal report DOM, listeners, focus trap, and explicit intents into `client/src/ui/TerminalMatchView.ts`. HUD supplies typed presentation data and retains the domain callbacks. `TerminalMatchView.test.ts`, `HUD.victoryReport.test.ts`, and `main.hotSeatProgression.test.ts` cover stable child identity, modal isolation, both Tab directions, focus restoration, disabled and retired actions, retry, expiry, casual continuation, and return to Battery.

`e2e/victory-report.spec.ts` covers long content and wide, standard, and compact reports. Its four-seat fixture verifies top receipt reachability, scroll access to actions, contained controls, reverse and forward focus wrapping, and the Main Menu action.

PR464 recovers completed terminal presentation without replaying old effects. PR471 primes capped terminal history independently of whether the recovered state is `PLAYER_TURN` or `GAME_OVER`; its automated regression covers both phases.

The authenticated live proof has two distinct branches:

- `aa829618-df99-48a7-bfdd-240174793914` reached the six-shot cap, produced a draw and 100 XP, and recovered the same receipt through Menu and Resume. The parent database comparison recorded one immutable result, unchanged transcript and progression, matches 11 to 12, and XP 1800 to 1900.
- `bd4650cd-af8b-4bf2-b6a0-e6cd1f558563` reached natural `GAME_OVER` after four normal 45/50 shots, produced a loss and 100 XP, and recovered through Menu and Resume. The earliest post-Resume resolving frame retained the old lobby paint. The clean recovered battlefield and report appear at `07:54:05.404Z`, followed by receipt and settled view. The parent database comparison recorded one immutable result, unchanged timestamp and transcript, matches 12 to 13, and XP 1900 to 2000.

The natural route establishes visual recovery. Immediate post-Resume cap frames were missed, so there is no live cap-silence claim. The phase-independent cap behavior remains established by PR471's direct regression. Durable summaries are `Temp/singedterra-c-terminal-final-visual-proof.md` and `Temp/singedterra-pr471-cap-live-checkpoint.md`; the frame captures are retained in the Luna CUA record.

### D. Mode configuration and application composition

PR467 published the normalized mode-configuration boundary. PR473 merged and published as `87283aca03954569e3e6e5a1d1b9c1cc345d95d7` after exact-head CI `34325857032` and CodeQL `34325857018` passed. Core job `102382834267` passed the integrated full client suite: 200 files and 1,776 tests at 07:53:29Z, including both 32-seed corpora at observed maxima 59/5,074 and 49/5,074. Pages run `34327066205` succeeded; public deployment metadata matched the exact SHA and run, and hosted smoke passed 1 check in 3.0 seconds. It moves `startGame` construction sequencing into `GameSessionComposition`, while `MatchSessionLifecycle` remains the single resource ledger. The extension fixture calls the actual `createModeClient` path with only external IO mocked, then compares full initial state and terrain. The guide records the ports and commands without introducing a new mode, engine, or dependency.

The PR473 focused tests, typecheck, full client coverage, deterministic check, build, diff review, and secret scan passed before merge. Luna's final preview verified both local Quick Duel and public published play: Fire advanced turn and readouts from 45/50 to 46/51; CPU 1 became active with Napalm and changed wind. The local health readout was 149/100 and the public readout was 142/100. Public metadata matched PR473 and served `index-C-MPwFhY.js`; the local preview was clean at the same head. This smoke did not exercise an authenticated receipt or verified session. The durable record is `Temp/singedterra-final-preview-smoke.md`.

## Requirement evidence map

| Requirement | Source and test evidence | Live or deployment evidence | Limit |
| --- | --- | --- | --- |
| A preserves historical replay while changing new policy behavior | `verifiedDuel.ts`, PR457 corpus, PR460 referee and database tests, PR462 recovery tests | Retained staged rollout record | Both V2 and V3 verifiers remain required. |
| B gives the room workflow one owner | `LobbyRoomController.ts`, cancellation tests, and `Lobby.roomCancellation.test.ts`; `LobbySession` retains subscription handles | T1VG recovery/rematch/reload and LTZB Leave/re-entry archives | Final match screens had no Leave control, so those rooms were left for expiry. |
| C isolates report presentation and preserves terminal behavior | `TerminalMatchView.ts`, HUD and main tests, `e2e/victory-report.spec.ts`, PR471 terminal history tests | aa829618 cap and bd4650cd natural recovery/database records | Natural visual proof and cap-phase regression are distinct evidence. |
| D centralizes configuration and application construction | `modeConfig`, `createModeClient`, and `GameSessionComposition` tests | PR467 publication, PR473 exact-head CI, Pages metadata, hosted smoke, final preview, and normal-casual smoke | Smoke is normal-casual only; it does not exercise an authenticated receipt or verified session. |

## Historical baseline and remaining work

Earlier text in this file described the baseline through PR445 and listed then-future work such as terminal extraction, versioned CPU rollout, room-controller ownership, and composition migration. Those items are delivered or pending only as stated above. They are not instructions to recreate old owners or rerun historical migrations.

Existing unrelated debt remains outside this four-package record. The console-entry ADR decision on essential control loading is still open. The preparation-card text issue is separate UI debt. Retain existing worktrees, dependency junctions, and the rematch stash `163ea7acd19cddabee797ea594a5bb6ef02a245b`. Historical artifacts remain evidence, not a request to repeat prior live sessions.

No new dependency or engine was selected by this recovery program. No measured migration advantage supports replacing the authored engine, Canvas gameplay, or the existing inert Pixi presentation boundary.
