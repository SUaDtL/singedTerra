# Software recovery implementation plan

Requested by Brenn on 2026-09-08. Status: execution started by user goal on 2026-09-08.

## Objective and authority

Complete the four work packages below: improve verified CPU shot selection safely, separate room/session ownership from Lobby, extract terminal match presentation from HUD, and simplify mode configuration and application composition. Preserve the accepted game interface and existing online, hot-seat, replay, and award behavior except for the explicitly versioned CPU improvement.

This request creates a plan only. Execution begins when the user invokes the accompanying goal. During execution, deliver each package through reviewed PRs, exact-head CI, merge, and deployment verification. Do not stop at an audit, wrappers around unchanged ownership, or an unmerged implementation. Do not claim the entire codebase is free of debt after these bounded packages.

## Starting point and recovery

- Repository: `C:\Users\brenn\projects\singedTerra`; remote: `https://github.com/SUaDtL/singedTerra.git`.
- Delivered baseline: main `84754c32deb5fe60bee335064dd95b9e6651a829`, through PR454. Revalidate remote main and open PRs before implementation; this SHA is a checkpoint, not an instruction to revert newer work.
- Existing recovery record: `docs/SOFTWARE_RECOVERY.md` on current main. Some entries describe status before their PR merged; GitHub and current source are authoritative.
- Already delivered: `VerifiedDeploymentSession`, `MatchSessionLifecycle`, `OrderedActionSession`, `LobbyGarageView`, `RoundOverView`, authored HUD/Lobby CSS, and shared/referee weapon-roster checks. Extend these owners instead of recreating them.
- The primary checkout has unrelated dirty work. Preserve it. Create isolated `codex/` worktrees from current main for implementation, and copy this plan into the first implementation branch. Do not reset, clean, overwrite, or repurpose historical worktrees.
- At this checkpoint the single localhost preview is on port 5198 from `singedTerra-worktrees/round-over-view`. Verify listener PID, process tree, served checkout, and built revision before use. A build can replace served files without changing the PID. Coordinate any replacement and maintain exactly one SingedTerra server.

## Team and scheduling

Parent GPT-6 Astra owns the dependency graph, architectural choices, cross-package review, integration, and final completion audit. Keep routine implementation and monitoring delegated. Prefer Luna for bounded work; use Sol for deterministic protocol changes and asynchronous ownership. Terra is the intermediate choice when a task exceeds Luna's demonstrated capability without needing Sol's broader reasoning.

| Package | Implementation owner | Bounded supporting work | Review owner |
| --- | --- | --- | --- |
| A: CPU policy and compatible rollout | Sol | Luna pins fixtures and runs bounded deterministic comparisons | Astra reviews replay/version/rollout design |
| B: Lobby room/session ownership | Sol | Luna tests explicit race scenarios and view callback contracts | Astra reviews ownership and cancellation |
| C: GAME_OVER presentation | Luna | Terra only if evidence shows coupled state exceeds the view task | Astra reviews state/presentation boundary |
| D: Mode configuration and composition | Sol for policy, Luna for mechanical caller migration | Luna updates extension guide and focused contract tests | Astra reviews final dependency direction |

Run at most three workers plus the parent, subject to available slots. Start A and independent C in parallel. Start B after the Sol slot is available; start D after B and the A version-dispatch contract land. C may proceed while A waits for rollout evidence. Never assign two writers to the same file/worktree. If supporting tests overlap implementation files, agree on ownership first or serialize the work.

Symbol ownership is explicit: A owns verified policy/version dispatch in shared and Edge code; B owns Lobby room state, waiting subscriptions, saved-room recovery, and match handoff; C owns terminal HUD DOM/listeners and their wiring; D owns mode defaults/normalization and the application composition that remains after B. D must consume A's landed version contract without changing it. Serialize any C wiring changes in `main.ts` before D edits that file. B and D never concurrently edit Lobby or NetworkClient. Supporting test writers receive named files, not permission to edit a whole test directory.

Every dispatch states: branch/base, owned files and responsibility, inputs, public contract, exclusions, regression scenarios, test commands, and a concrete return artifact. Use one worktree per writer. A worker returns changed paths, exact head, observed red/green results, limitations, and review-ready diff. After two substantive review failures of the same kind, narrow the task or move it to Terra/Sol rather than extending an ineffective loop.

Parent reviews a concrete contract and one small vertical slice before a worker expands it. Use existing agents where possible. Do not create sidebar tasks unless explicitly requested. Do not repeatedly rescan the repo or have several agents poll the same CI run. The delivery owner monitors CI and reports stage changes, failures, or completion.

## A. Improve verified CPU selection without changing historical replay

Starting sources: `shared/src/net/verifiedDuel.ts`, `supabase/functions/_shared/verifiedMatchReplay.ts`, their callers/tests, and existing verified-deployment admission, migration, and drain checks under `scripts/checks/` and `supabase/`.

1. Reproduce the reported seed-17 case from an exact engine fixture: after human angle 45/power 50, the existing policy chooses 90/20, causes self-damage, and deals zero opponent damage while a safer miss exists. Verify the report rather than treating the numbers as a test oracle. Pin current V2 choices and complete replay/receipt behavior before editing.
2. Trace both browser and Edge implementations and every version selector, persisted descriptor, resume path, transcript verifier, and admission control. Write a compatibility matrix for existing eligible sessions, expired sessions, completed evidence, new sessions, and stale clients. Choose the new policy/version identifier from the actual contract; do not assume changing a single constant versions the entire system.
3. Implement a deterministic score using meaningful flight/impact proximity captured before the projectile disappears and an explicit self-damage penalty. Preserve the bounded candidate/tick budget and deterministic tie-breaking. Add good-hit, safe-miss, self-damage, terrain/wind, and repeat-run fixtures. Prove the targeted harmful choice improves without rewarding deliberate misses over effective hits. Measure work/ticks and browser/Edge replay parity on a fixed representative corpus.
4. Retain V2 replay and receipt acceptance unchanged. Introduce the new policy behind versioned dispatch and admission controls. Test mixed-version rejection, old-session resume/completion, retry idempotence, and no duplicate awards. Do not rewrite completed evidence or silently substitute the new policy during V2 verification.
5. Deploy compatible backend support before enabling new-client admission. Verify applied migration/function versions and live old/new behavior. Follow actual drain requirements; never invalidate eligible sessions merely to finish. If a migration cannot safely reverse, roll back admission rather than history. Keep a tested path to disable new starts while eligible sessions finish under their bound policy.

Deliver A in stages: A1 fixture and compatibility contract; A2 dual-version policy/verification implementation; A3 backward-compatible backend deployment; A4 client deployment and new admission enablement; A5 verified drain/retention outcome. Before A2, document the actual persisted session/config field or proposed migration field binding the policy, its atomic admission writer, supported client/Edge versions, and missing/unknown-version behavior. Existing code has distinct engine and ruleset versions; neither is implicitly a CPU-policy field. Unknown versions must fail closed, never fall back to a different replay policy. At A3, old clients and V2 completion/retry must still work. Before A4, disabling new admission must be tested. A5 may retain old verifiers indefinitely when historical evidence requires them; removing V2 support is not a completion requirement.

Use a pinned corpus of seeds 0 through 31 with the standard verified configuration and human opening angle 45/power 50, plus explicit fixtures for a reachable damaging hit, a safe miss, wind extremes allowed by that configuration, and terrain obstruction. Commit the fixture generator and inputs. Before editing, record current candidate-count and total-tick maxima on this corpus and the configured hard caps. The new selector must not raise either hard cap, exceed the baseline worst-case total tick count on the same corpus, or choose a self-damaging zero-opponent-damage shot when an evaluated non-self-damaging alternative exists. The reachable-hit fixture must still select a damaging shot. Compare selected angle/power and canonical replay state/receipt fields exactly across browser/shared and Edge execution and across repeated runs. Record wall-clock measurements as diagnostic evidence, not flaky timing assertions. Any necessary budget increase requires an explicit measured design review before implementation, not a post-hoc threshold change.

Rollback by stage: before admission, revert the new client/admission path while retaining compatible backend support; after new sessions exist, disable only new starts and preserve both verifiers through eligible completion and retry. Never roll back by reinterpreting or deleting a session. Record the exact operational commands after discovering the current controls and prove them in the test environment before production use.

Done: the harmful-choice regression is fixed for new-version sessions, V2 fixtures and historical verification remain unchanged, bounded replay cost and browser/Edge equivalence pass, and the deployed transition is demonstrated. Local tests alone do not complete this package.

## B. Give room sessions one owner

Starting sources: `client/src/ui/Lobby.ts`, Lobby account/room tests, `NetworkClient.ts`, existing Lobby views, and existing lifecycle owners.

Extract the room workflow into a controller with narrow room/account IO ports and an explicit state projection. It owns create/join/leave, waiting-room subscriptions, reconnect/rejoin, cancellation, and teardown. Lobby owns DOM, focus, and mapping user intent to the controller. NetworkClient continues owning match transport and uses OrderedActionSession; do not introduce a second canonical action queue.

Pin out-of-order create/join responses, leave during join, account change during fetch, reconnect after teardown, repeated room entry/exit, failed leave/retry, and subscription disposal. Invalidate before awaiting cleanup, capture resources from the retiring session, and reject stale results before they mutate shared state. Each subscription/timer/client has one teardown owner. Preserve error presentation, saved-room recovery, and focus ordering.

Use B1 for a parity extraction with unchanged existing assertions and B2 for any confirmed race fixes, each with its own observed failing regression and PR. Split B1 further into room admission/exit and subscription/recovery ownership if the first diff spans both state machines. At completion, Lobby may retain a controller reference and view projections, but must not retain a second mutable room lifecycle state, room subscription handle, or cancellation generation for the migrated responsibility. Test fixtures must count active subscriptions and prove zero after teardown and one after successful rejoin.

Done: actual room state/subscription ownership leaves Lobby; obsolete fields/listeners are removed; existing room/account assertions still pass; controlled asynchronous regressions pass; a real two-client join, reconnect, leave/rejoin, and match-start smoke succeeds. Mocks alone cannot establish network behavior.

## C. Extract terminal match presentation

Starting sources: `client/src/ui/HUD.ts`, terminal payoff/verified progression tests, `VerifiedDeploymentSession.ts`, `RoundOverView.ts`, and relevant browser fixtures.

Create a semantic GAME_OVER/report view receiving typed display data and emitting explicit intents. Keep award eligibility, receipt persistence, verified completion/retry, and account identity decisions in their existing domain owners. If terminal orchestration needs a controller, propose that boundary separately before moving any protocol logic. Reuse existing modal/focus contracts without coupling the terminal view to the between-round shop.

Preserve victory/draw, ranking, rewards, pending verification, accepted completion, retry, expiry, casual continuation, return to lobby, and rematch states that exist in current code. Test both Tab directions, focus restoration, modal isolation, disabled actions, late updates after hide/destroy, long text, and repeated state updates retaining stable DOM. Preserve columns and other inline styles when replacing markup construction with projections. Test child identity, not just unchanged container identity.

Done: HUD no longer owns terminal DOM construction/listeners; existing verified business behavior is unchanged; direct seam tests and wide/standard/compact browser checks pass; real completion/retry and rematch behavior remain valid. An extraction must not quietly restyle the accepted console.

## D. Centralize mode configuration and simplify composition

Starting sources: `shared/src/types/GameOptions.ts`, engine mode/round/team tests, Lobby configuration, `client/src/main.ts`, both GameClient implementations, and relevant referee contracts.

Map a representative existing mode from selection through normalized options, client creation, engine setup, and network admission. Extract a pure normalization/configuration boundary and a client-side composition owner with explicit ports. Remove duplicated defaults and scattered interpretation after callers migrate. Keep mode rules in the deterministic engine and external request validation at the referee boundary; shared code must not import browser code and Edge must not import the engine to validate requests.

Retain existing mode options and defaults. Characterize malformed/omitted options, hot-seat/network parity, team/round variants, and rematch reconstruction. Move only the main.ts orchestration directly involved in mode setup; do not turn this into a complete bootstrap rewrite. Use MatchSessionLifecycle for resources rather than creating parallel ownership.

Deliver D1 normalization/defaults and D2 composition/caller migration as separate PRs. Pin a table of every currently supported mode's omitted/default and explicit options before migration, comparing normalized output and engine initialization exactly for hot-seat and networked setup. At completion, callers must not duplicate defaults or normalization for the migrated fields; referee input validation remains intentionally separate. The test-only extension fixture adds a configuration variant through the new registry/normalizer and produces expected normalized options and initial engine state in both modes without edits to HUD or Lobby presentation. Record the exact files changed in that fixture as extension evidence.

Done: mode normalization has one documented owner, main/Lobby no longer duplicate the migrated policy, existing modes behave identically, and a disposable test fixture representing a new mode variation can traverse setup without unrelated UI edits. Do not ship an unsolicited new game mode. Update `docs/DEVELOPMENT.md` with exact extension points, remaining deliberate engine/referee edits, and runnable tests.

## Verification and delivery contract

Before each extraction, run the existing focused baseline and add meaningful seam/regression tests. For fixes, observe the failure before changing behavior. For refactors, preserve pre-existing assertions; an import/source-fixture relocation is allowed when the assertion itself is retained and the reason is reviewed. Never call a retrospective missing-module result proof of a pre-implementation red test.

Use current package scripts, revalidated at execution: `npm run test:client`, `npm run check`, `npm run typecheck`, `npm run build`, `npm run coverage:client`, `npm run check:edge`, `npm run check:database`, and `npm run test:e2e`. Select focused tests first, then the full relevant suites before delivery. CPU/database changes require deterministic, Edge, real Postgres, and replay checks; client-only view work does not require unrelated database churn. Bound workers and avoid concurrent full suites/builds that create resource flakes. Coverage comparisons include the original owner plus extracted owner, not just the new module.

Use rendered browser interaction, not DOM presence alone, for presentation changes. Use the verified single server through `E2E_LIVE_URL` where supported. Preserve real preview environment configuration; never leave an unconfigured bundle served. Inspect screenshots before citing them. Exact integrated-head CI must cover merged dependencies, not only each isolated branch. Do not weaken assertions, thresholds, CI jobs, or timeouts to obtain green results.

Follow applicable repository skills and gates. Raise an actual ADR conflict with the better alternative and migration plan; an ADR is not an automatic veto. No new dependency/engine is planned. A measured capability gap may justify a bounded evaluation with official documentation, compatibility, bundle/runtime cost, accessibility, hosting, license, and migration evidence before adoption.

Use small reviewable PRs with separate behavioral fixes and structural changes where practical. Stage explicit files. Preserve dirty work. Never force-push, bypass hooks, use admin merges, or enable auto-merge as a substitute for checking all jobs. The delivery owner verifies every relevant check, including rendering and CodeQL, on the exact current head and then performs the authorized manual merge. Treat a skipped automated review as skipped, not substantive review.

For each merged head, verify Pages publication, public `deploy-meta.json`, and post-deployment smoke. For backend changes, verify actual migration/function versions and the served implementation. If credentials or a real environment are unavailable, keep that acceptance item open and state the precise missing evidence. Do not fabricate live proof from mocks or mark a temporary wait as blocked.

Named live evidence: extend `e2e/verified-deployment.spec.ts` and the existing start/complete/verified replay Edge tests for A/C; use `scripts/checks/rematch_postgres.sql` through the database harness for rematch persistence and a real two-browser scenario for visible rematch behavior. For B, add a focused room recovery browser spec if the current suite lacks one. Run local integration against the real local Supabase/Postgres stack or an isolated staging project with two dedicated test accounts and isolated rooms, then smoke the published client against the deployed backend. Required transitions are join/wait/start, disconnect/rejoin, leave/rejoin, complete/retry with one immutable award, and rematch with preserved configuration. Record environment, account aliases (no tokens), room/session identifiers, before/after state, and cleanup of only test-created resources. Production smoke must not alter other users' rooms or awards. A rollback-only SQL check does not replace the visible two-browser scenario. If staging, credentials, or safe test identities are missing, request that specific prerequisite and continue independent packages while it remains pending.

## Durable progress and completion

Update this file in implementation branches after each meaningful checkpoint. Keep one concise record per package: owner/model, worktree, base/head, tests and limitations, PR/merge, deployment evidence, remaining work. Record live process/run IDs for resumption; revalidate them before polling. Long waits need no repeated repo scans or unchanged status narration.

| Item | Status | Evidence required |
| --- | --- | --- |
| A: versioned CPU improvement | A1 in progress, Sol | Regression, V2 preservation, new policy parity/budget, deployed transition |
| B: room/session ownership | Planned | Ownership removal, race tests, real two-client recovery |
| C: terminal presentation | Contract/baseline in progress, Luna | Stable semantic view, unchanged awards, responsive and retry/rematch proof |
| D: mode/configuration boundary | Planned | Central policy, caller migration, extension fixture and guide |
| Integrated delivery | Planned | Reviewed exact heads, green CI, merged PRs, deployed provenance/smoke |

Completion requires every row to be proven against current code and deployment. A plan, audit, isolated green test, draft PR, or recorded future debt does not complete one of these four packages. Additional unrelated debt may remain, but do not relabel an unfinished package as future work to close the goal. Stop adding new packages once these are complete; provide a concise handoff with the remaining debt and evidence links.

Plan review: a Sol review on 2026-09-08 requested explicit version binding, staged rollback, fixed CPU acceptance inputs/budgets, separate parity/race PRs, serialized symbol ownership, and named live evidence. Those requirements are incorporated above. No implementation or deployment was performed to create this plan.

Execution checkpoint, 2026-09-08: remote main revalidated as `84754c32deb5fe60bee335064dd95b9e6651a829`; primary dirty work preserved. Sol assigned A1 in `recovery-cpu-policy`, Luna assigned C contract/baseline in `recovery-terminal-view`, each on its own `codex/` branch from main. Parent reviews initial contracts before expansion. Existing preview listener is PID 24756 on 5198; Docker daemon was unavailable at initial environment check and database proof remains unverified until a real runtime is available. B and D have not started.

First review checkpoint: C's unchanged baseline passed 6 files / 84 tests; parent approved TerminalMatchView owning terminal DOM/listeners/focus while HUD retains payoff timing, interpretation, and protocol callbacks. A1 found unchanged `scripts/checks/verified_duel.mjs` failing with `incomplete_verified_duel` at an early-terminal fixture; root cause investigation is underway, not treated as a green baseline or repaired by changing V2 semantics. Proposed A tuple `(3,3,4)` and capability-negotiated disabled-first rollout received directional review; expansion still requires fixture/version evidence. Docker Desktop executable startup exited without a daemon; supported `docker desktop start` is running under execution session 41786 and must be polled before any restart.

Environment follow-up: session 41786 was interrupted after logs proved the backend had crashed on inaccessible `Docker/run/dockerInference`. Preserving that socket by a single-file rename also failed; no Docker data was removed or changed. A user question is pending for a restored Docker runtime or isolated Supabase staging with two test identities. Independent A/C implementation continues; real database/two-client acceptance remains open. Sol traced the replay harness failure to stale early-terminal expectations after commit `209b7c6`, and confirmed the harness was never wired into CI. Parent approved a separate, evidence-backed harness repair preserving those original inputs as incomplete cases and adding the harness to normal checks before the CPU policy change.

C initial-slice review: new view and three focused tests exist, but HUD integration is not approved yet. Parent found the modal ancestor incorrectly included in inert isolation, omitted field-order/promotion structure, missing action glyphs, and callback/focus parity gaps. Luna is repairing the concrete baseline mapping and tests before integration. The initial missing-module run executed zero tests and is structural evidence only, not an observed behavioral regression.

C reassignment: second review still found incomplete receipt/focus parity and HUD edits starting before repaired-slice approval. Luna production editing was stopped; the dirty draft is preserved. Runtime rejected a fresh Terra agent (thread limit) and a child-model override, so no Terra task was actually started. Luna is producing a read-only handoff; Sol will take the repair after its next A checkpoint, with A/C implementation serialized. The harness repair diff in A is reviewed and approved pending observed checks; CPU behavior is unchanged so far.

B preparation: read-only current-main inventory identifies existing `LobbySession` as owner of waiting subscriptions, heartbeat, stale generations, ready/gone events, and cleanup, backed by `LobbySession.test.ts`. `LobbyTransport` already owns Edge IO and room reads. B must reuse these and extract remaining create/join/rejoin admission, persistence, and configuration/handoff state from Lobby, rather than create a competing subscription owner. Baselines to run include Lobby.network, Lobby.rejoin, Lobby.sessionLifecycle, Lobby.gonePendingAction, Lobby.sessionEventOrdering, Lobby.sessionStaleActions, LobbySession, and LobbyTransport.ruleset tests. This inventory is preparation, not B implementation or live proof.

A1 baseline checkpoint: commit `057d21d` repairs the previously unwired
verified-duel harness without changing V2 production behavior. The two inputs
whose outcomes changed with ruleset 4 remain pinned as incomplete; current
terminal replacements and the exact seed-17 V2 replay summary are pinned, and
`npm run check` now executes the harness. The focused run covered 73,124 flight
cases with a measured maximum of 185 ticks, maximum displacement
16.34969385993998, and observed maximum policy probe count 59 under the
exported 60-probe cap. The full configured `npm run check` and secrets scan
passed. A2 policy and database admission remain unimplemented at this
checkpoint.

Package C implementation checkpoint: `TerminalMatchView` now owns the terminal
report DOM, stable receipt and scoreboard updates, winner preview lifecycle,
actions, focus containment/restoration, isolation, and disposal. HUD retains
the terminal-impact payoff gate, game-state interpretation, scoreboard
escaping, and progression/Field Order derivation. The combined client suite
passed 190 files and 1,676 tests; the configured three-profile terminal browser
set passed 51 of 51 checks. Coverage measured before the final additive
Sign-in identity test reported 85.98% branch and 99.60% line coverage for the
new view, with repository-wide statement, branch, function, and line coverage
all above the pre-extraction baseline. This is structural and rendered-browser
evidence; package-level real-backend acceptance remains pending.

A harness checkpoint: standalone commit `057d21d` repairs the two stale outcome fixtures, retains their original inputs as explicit incomplete cases, pins V2 replay outputs, and adds `verified_duel.mjs` to `npm run check`. Sol reports the focused harness and fresh full `npm run check` passed, plus the secrets gate. Initial worktree dependency failures were repaired using exact lockfile dependencies; no policy code changed. A narrow version-dispatch/corpus checkpoint is next, then Sol takes the preserved C draft. An accidental dependency junction alias was moved outside the worktree to `recovery-cpu-policy-node_modules-junction-old`; it points to the primary dependency tree and must not be recursively removed or followed for cleanup.
