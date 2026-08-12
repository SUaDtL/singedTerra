# Commander Career Loop — Milestone 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Each behavioral task runs strict RED → GREEN → refactor and receives spec-compliance plus quality review before acceptance.

**Status:** approved by the maintainer on 2026-08-11 under the standing continuous-improvement goal and explicit approval of the Verified Deployment route
**Spec:** `.codearbiter/specs/commander-career-loop-milestone-2.md`
**Initiative:** `career.initiative.0001`

**Goal:** Let a signed-in player earn the first honest Commander rank by completing a bounded server-owned duel whose canonical action transcript is independently replayed and awarded exactly once.

**Architecture:** Three Auth-owned Edge Functions bracket a constrained shared-engine Verified Duel. Start idempotently creates or resumes immutable server-owned config; explicit abandon is the only pre-expiry replacement; the browser persists only accepted human fire commitments; browser and verifier use one shared 60-probe CPU policy and fixed-salvo adjudicator; strict Auth-account limiting precedes bounded-JSON completion, which atomically stores one immutable private transcript/result. A persisted operational control plus checked-in drain command selects the deployed replay contract. `account_summary` keeps casual and verified progression separate, while the existing career model and After Action Report consume only verified evidence.

**Tech stack:** TypeScript 7, Deno/Supabase Edge Functions, Postgres 15 migration/RLS/RPC, Vitest/jsdom, deterministic Node harnesses, Playwright, GitHub Actions/Pages.

## Global constraints

- One shared physics implementation; no duplicate verifier and no live server-authoritative turn path.
- Casual XP remains non-ranked. Only `verifiedProgression.evidence === 'verified_replay_v1'` may produce rank or promotion.
- No dependency, application crypto, secret, destructive migration, direct default-branch write, or generic diagnostics request runner.
- Server derives user id, seed, config, terminal result, XP, level, rank eligibility, and totals.
- V1 accepts six human Baby Missile salvos only; server regenerates at most six CPU salvos through a fixed 35-coarse + 25-refinement search and shared external cap adjudication guarantees a result without synthesizing a generic engine win.
- The harness exhausts all 73,124 legal single-salvo tuples and proves the 4,692 live-tick, 86,400 CPU-simulation-tick, and 2,073,600 swept-sample ceilings; maximum-probe and adversarial 12-salvo workloads must remain below a conservative 100 ms local target and the hosted 200 ms active-CPU limit.
- Replay-semantic changes require persisted start-disable metadata, a runnable drain refusal until `last_started_at + 30 minutes` and zero unexpired sessions, backend-before-client rollout, strict client version refusal, and post-verify re-enable; CI enforces the governed path/version record.
- Coarse pre-Auth IP limits remain defense-in-depth; fail-closed Auth-derived account limits are authoritative and run before request-body consumption or replay.
- Expiry ends verified eligibility. The HUD warns at five/one minutes, freezes verified input at zero, and requires explicit casual continuation or battery return; retry is promised only while unexpired.
- Exact-head review/CI precedes merge; additive backend deployment and authenticated production proof follow merge.

## Acceptance ledger

- **AC-01:** Authenticated start retries resume one identical owner session/config; only explicit abandon replaces it.
- **AC-02:** Additive schema/RLS/RPC grants, private immutable evidence, and start/abandon/complete concurrency are enforced without prior-migration edits.
- **AC-03:** Explicit engine acceptance yields human fire commitments only; shared CPU regeneration and cap adjudication replay identically.
- **AC-04:** Signed-in Local Battery can launch Verified Deployment; all other account states preserve casual-only launch.
- **AC-05:** Bounded streaming JSON plus completion Auth/ownership/version/expiry/policy validation fails closed before mutation.
- **AC-06:** Shared duel replay always terminates inside measured bounds and atomically records one immutable transcript/result; retries/concurrency cannot double-award or partially consume.
- **AC-07:** Account summary separates unchanged casual totals from verified-only progression and fails closed on bad reads.
- **AC-08:** Versioned local recovery plus After Action Report communicates pending/retry, award, promotion, next rank, and safe refusal without casual rank claims.
- **AC-09:** Desktop/compact/touch launch, fixed-rule/salvo, pending/retry, and result surfaces remain layered and contained.
- **AC-10:** Full governed review, exact-head CI, additive deployment, and authenticated production evidence pass.

## File structure

- `supabase/migrations/016_verified_deployments.sql` — additive private session/result tables and service-role-only transactional start/abandon/complete RPCs.
- `scripts/checks/verified_deployment_migration.mjs` — migration immutability, grants, RLS, constraints, classification, and RPC contract oracle.
- `scripts/checks/verified_deployment_drain.mjs` — static drain-contract and deployment-order oracle.
- `scripts/verified-deployment-drain.mjs` — service-credentialed disable/status/enable command that never logs credentials and refuses unsafe rollout.
- `shared/src/net/verifiedDuel.ts` — fixed V1 policy, deterministic CPU commitments, action acceptance, salvo cap, and terminal adjudication shared by browser and verifier.
- `supabase/functions/_shared/verifiedDeployment.ts` — exact V1 config, response projections, progression arithmetic, and reusable pure validation.
- `supabase/functions/start_verified_deployment/index.ts` — strict no-body Auth start handler.
- `supabase/functions/abandon_verified_deployment/index.ts` — exact Auth-owned abandonment handler.
- `supabase/functions/complete_verified_deployment/index.ts` — exact body, session ownership, replay, and atomic completion handler.
- `supabase/functions/_shared/mod.ts` — bounded streaming JSON mode used by completion.
- `supabase/functions/account_summary/index.ts` — verified-result aggregation beside unchanged casual aggregation.
- `client/src/client/verifiedDeployment.ts` — exact client contracts, Supabase adapter, recorder/reporter state machine, and trusted receipt types.
- `client/src/client/HotSeatClient.ts` — optional shared Verified Duel controller; ordinary behavior unchanged.
- `client/src/client/verifiedDeploymentStorage.ts` — versioned owner-bound config/transcript recovery descriptor.
- `client/src/client/AccountSession.ts` — Auth-owned start/complete methods and summary refresh validation.
- `client/src/ui/LobbyHotSeatView.ts`, `client/src/ui/Lobby.ts` — signed-in launch action, busy/refusal copy, and envelope disclosure.
- `client/src/ui/HUD.ts`, `client/src/main.ts` — budget status, completion lifecycle, verified receipt, and promotion composition.
- `e2e/account-progression-summary.spec.ts`, `e2e/verified-deployment.spec.ts` — real composition, layout, focus, and production-like contract oracles.

---

### T-01: Pin the additive persistence boundary

**Files:**
- Create: `scripts/checks/verified_deployment_migration.mjs`
- Create: `scripts/checks/verified_deployment_drain.mjs`
- Create: `scripts/verified-deployment-drain.mjs`
- Create: `supabase/migrations/016_verified_deployments.sql`
- Modify: `package.json`

**Interfaces:**
- Produces service-role-only transactional start/resume, abandon, and complete RPC contracts, private `verified_deployments` / `verified_match_results` rows, and the INTERNAL `verified_deployment_contracts` start-control row required for deployment drain.
- Consumed by T-02, T-04, and T-05.

- [ ] Write a failing executable migration oracle that rejects missing RLS, any public/authenticated table access, absent classifications, mutable result/transcript rows, non-unique active/result identities, non-transactional start/abandon/complete transitions, broad RPC execution, or edits to migrations 001–015.
- [ ] Run `node scripts/checks/verified_deployment_migration.mjs`; verify RED because migration 016 does not exist.
- [ ] The oracle must also reject absent service-only contract control, missing `disabled_at`/`last_started_at`, creation while V1 starts are disabled, refusal to resume an existing active/unexpired session while disabled, or drain status that does not report authoritative safe-after and unexpired-session count.
- [ ] Add migration 016 with a 30-minute expiry contract, idempotent start/resume, explicit abandon, one active session per account, immutable private canonical transcript/result per session, a singleton V1 control checked only after active-session resume, authoritative final-start metadata and service-only drain RPCs, consistent lock order, exact ACL assertions, data classifications, and service-role-only SECURITY DEFINER RPCs with fixed `search_path`.
- [ ] Run the oracle and `npm run check`; verify GREEN.
- [ ] Add a credential-safe Node drain command with `disable`, `status`, and guarded `enable`; add a static oracle limited to authoritative safe-after/zero-active refusal, the checked-in backend-before-client rollout manifest, and no credential logging. Later tasks own handler/client integration.
- [ ] Mutation check: independently widen an RPC grant, remove the result uniqueness constraint, and split status/result mutation; confirm the oracle rejects each mutation.

**Verification:** `node scripts/checks/verified_deployment_migration.mjs && npm run check`
**Maps to:** O-01 schema integrity and atomicity
**Covers:** AC-02, AC-06
**Depends on:** none
**Status:** ACCEPTED — completion-context correction passed adversarial review

### T-02: Pin bounded transport and authenticated resumable start/abandon

**Files:**
- Create: `supabase/functions/_shared/verifiedDeployment.ts`
- Create: `supabase/functions/_shared/verifiedDeployment.test.ts`
- Create: `supabase/functions/start_verified_deployment/index.ts`
- Create: `supabase/functions/start_verified_deployment/index.test.ts`
- Create: `supabase/functions/abandon_verified_deployment/index.ts`
- Create: `supabase/functions/abandon_verified_deployment/index.test.ts`
- Modify: `supabase/functions/_shared/mod.ts`
- Modify: `supabase/functions/_shared/mod.test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces exact `VerifiedDeploymentStartResponse` with `resumed`, `sessionId`, `expiresAt`, contract/engine/ruleset versions, immutable duel limits, and server-owned options; explicit abandon is exact `{ sessionId }`.
- Consumes T-01 start RPC.

- [ ] Write failing bounded-JSON wrapper tests for coarse-IP-before-Auth and fail-closed Auth-account-before-body ordering, same-account/multiple-IP sharing, limiter storage failure, exact 1,024-byte completion / 128-byte abandon limits, early/lying Content-Length, chunked overflow, Unicode byte counts, 2-second read and 250 ms cancel deadlines, parse errors, and successful exact JSON.
- [ ] Write failing pure tests for fixed V1 options/seed allowlist, profile-name normalization, frozen response projection, and no request-owned config.
- [ ] Write failing handler tests for strict Bearer Auth, no-body start, idempotent resumed response, exact abandon, profile read, exact RPC arguments, generic failures, safe logging, and no service/user/token exposure.
- [ ] Run focused Deno files; verify RED because the module/functions and bounded mode do not exist.
- [ ] Implement the minimal bounded wrapper, pure contract, start/abandon handlers, defense-in-depth IP buckets, exact Auth-derived 10/min account buckets with fail-closed storage, and explicit `verify_jwt = false` config.
- [ ] Run focused tests and `npm run check:edge`; verify GREEN.
- [ ] Mutation check: allow a body, reuse client seed, omit expiry, or leak user id; confirm focused tests fail.

**Verification:** `deno test --allow-env supabase/functions/_shared/verifiedDeployment.test.ts supabase/functions/start_verified_deployment/index.test.ts`
**Maps to:** O-02 authenticated immutable start
**Covers:** AC-01, AC-02
**Depends on:** T-01
**Status:** ACCEPTED

### T-03: Pin the shared bounded Verified Duel and canonical human capture

**Files:**
- Create: `client/src/client/verifiedDeployment.ts`
- Create: `client/src/client/verifiedDeployment.test.ts`
- Create: `shared/src/net/verifiedDuel.ts`
- Create: `scripts/checks/verified_duel.mjs`
- Modify: `supabase/functions/_shared/verifiedReplayProbeFixture.ts`
- Modify: `supabase/functions/_shared/verifiedMatchReplay.workload.test.ts`
- Modify: `supabase/functions/verified_replay_probe/index.ts`
- Modify: `supabase/functions/verified_replay_probe/index.test.ts`
- Modify: `client/src/client/ProductionDiagnosticsRegistry.ts`
- Modify: `client/src/client/ProductionDiagnostics.test.ts`
- Modify: `shared/src/engine/GameEngine.ts`
- Modify: `client/src/client/HotSeatClient.ts`
- Modify: `client/src/client/HotSeatClient.test.ts`

**Interfaces:**
- Produces an explicit engine action-acceptance result, `VerifiedDuelController`, immutable human-fire transcript, deterministic CPU policy, six-salvo cap adjudication, and replay result shared by browser and Deno.
- Ordinary `HotSeatClient` behavior stays unchanged when no verified contract is present.

- [ ] Write failing table tests proving only accepted human Baby Missile fire emits, while rejected fire, aim/select, CPU, move, buy, shield, and next-round inputs emit nothing.
- [ ] Write failing deterministic tests for the exact 35-coarse + 25-refinement CPU policy with Baby Missile forced and byte-identical browser/verifier outcomes, including no-result fallback, maximum-probe states, ordinary terminal results, and all cap-adjudication tie-breaks without mutating generic `GameState` into a synthetic win.
- [ ] Write a failing exhaustive harness over all 73,124 allowed single-salvo tuples (`[17,42,73,109] × angle 0..180 × power 0..100`), assert the shared 391/4,692 live-tick, 60-probe, 86,400 simulation-tick, displacement-under-24, and 2,073,600 swept-sample bounds, and run maximum-probe/six-CPU-turn plus adversarial full-duel corpora under the 100 ms local target.
- [ ] Add a failing hosted-probe fixture/test for the exact maximum-probe/full-duel workload, preserve no-body/no-award behavior, and update the compile-time diagnostics response validator for the exact widened receipt.
- [ ] Run focused Vitest; verify RED because recorder/observer do not exist.
- [ ] Implement the smallest explicit acceptance return plus shared duel controller/policy/adjudication and immutable human-only recorder.
- [ ] Run focused tests and client typecheck; verify GREEN.
- [ ] Mutation check: accept a forbidden action, record CPU, alter CPU policy, exceed the salvo cap, or reverse an adjudication tie-break; confirm tests fail.

**Verification:** `node scripts/checks/verified_duel.mjs && npm run test:client -- client/src/client/verifiedDeployment.test.ts client/src/client/HotSeatClient.test.ts`
**Maps to:** O-03 canonical transcript fidelity
**Covers:** AC-03, AC-05
**Depends on:** none
**Status:** ACCEPTED

### T-04: Pin independently replayed idempotent completion

**Files:**
- Create: `supabase/functions/complete_verified_deployment/index.ts`
- Create: `supabase/functions/complete_verified_deployment/index.test.ts`
- Modify: `supabase/functions/_shared/verifiedDeployment.ts`
- Modify: `supabase/functions/_shared/verifiedDeployment.test.ts`
- Modify: `supabase/functions/_shared/database.types.ts`
- Modify: `supabase/functions/_shared/database.types.test.ts`
- Modify: `supabase/functions/_shared/mod.ts`
- Modify: `supabase/functions/_shared/mod.test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes bounded exact `{ sessionId, transcript }`, T-01 session/RPC, and the shared Verified Duel verifier, which regenerates CPU turns.
- Produces exact immutable result plus prior/current `verified_replay_v1` progression receipt.

- [ ] Write failing exact-body tests for extra/missing keys, UUID, ownership, active/completed/expired/abandoned states, contract/engine/ruleset mismatch, human-fire policy, malformed/conflicting transcripts, and generic replay failures before RPC.
- [ ] Write failing success/race tests requiring regenerated bounded CPU turns, deterministic cap result, exact private transcript/result RPC arguments, identical same-evidence retry projection from an already-completed row without replay, conflicting-evidence refusal, one award, and no partial response if storage fails.
- [ ] Add an integration test proving disabled starts refuse new sessions while existing-session resume, abandon, and completion remain operational throughout drain.
- [ ] Run focused Deno tests; verify RED because completion does not exist.
- [ ] Implement the minimal handler, safe error mapping, 10/min bucket, and exact config entry.
- [ ] Run focused tests and `npm run check:edge`; verify GREEN.
- [ ] Mutation check: trust client CPU/outcome, call RPC before replay, accept another owner, discard evidence, or map duplicate completion to a second award; confirm tests fail.
- [ ] Correction gate: pin exact shared database types for `complete_verified_deployment` and `verified_progression_summary`, assert their exact function keys/arguments/returns, and type the completion handler through that shared contract rather than a local RPC substitute.

**Verification:** `deno test --allow-env supabase/functions/complete_verified_deployment/index.test.ts supabase/functions/_shared/verifiedDeployment.test.ts`
**Maps to:** O-04 fail-closed replay and atomic award
**Covers:** AC-05, AC-06
**Depends on:** T-01, T-02, T-03
**Status:** ACCEPTED — exact shared RPC contract correction passed scoped adversarial re-review

### T-05: Pin verified-only account summary

**Files:**
- Modify: `supabase/functions/account_summary/account_summary.test.ts`
- Modify: `supabase/functions/account_summary/index.ts`
- Modify: `client/src/client/AccountSession.test.ts`
- Modify: `client/src/client/AccountSession.ts`

**Interfaces:**
- Extends `AccountSummary` with required exact `verifiedProgression` once the migration is deployed; evidence remains `verified_replay_v1`.
- Preserves casual `matchesPlayed`, `wins`, and XP unchanged.

- [ ] Add failing Edge tests for separate Auth-scoped verified reads, zero baseline, wins ≤ matches, bounded pagination/count, malformed/truncated/duplicate/error refusal, and unchanged casual totals.
- [ ] Add failing client parser tests for exact verified shape, arithmetic, evidence, unknown keys/version, and no fallback from casual progression.
- [ ] Run focused Edge/Vitest tests; verify RED against the current optional/unproduced branch.
- [ ] Implement the verified aggregation and make the client contract exact while preserving profile usability only where explicitly allowed.
- [ ] Run focused tests; verify GREEN.
- [ ] Mutation check: source verified totals from casual rows, accept missing evidence, or merge the two XP totals; confirm tests fail.

**Verification:** `deno test --allow-env supabase/functions/account_summary/account_summary.test.ts && npm run test:client -- client/src/client/AccountSession.test.ts`
**Maps to:** O-05 separate progression authorities
**Covers:** AC-07
**Depends on:** T-01, T-04
**Status:** ACCEPTED — required verified authority correction passed scoped adversarial re-review

### T-06: Pin the Auth-owned recoverable client lifecycle

**Files:**
- Modify: `client/src/client/verifiedDeployment.ts`
- Modify: `client/src/client/verifiedDeployment.test.ts`
- Modify: `client/src/client/AccountSession.ts`
- Modify: `client/src/client/AccountSession.test.ts`
- Create: `client/src/client/verifiedDeploymentStorage.ts`
- Create: `client/src/client/verifiedDeploymentStorage.test.ts`
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/ui/Lobby.account.test.ts`
- Modify: `client/src/ui/Lobby.quickDuel.test.ts`

**Interfaces:**
- Produces `AccountSession.startVerifiedDeployment()`, `abandonVerifiedDeployment(sessionId)`, and `completeVerifiedDeployment(sessionId, transcript)` guarded by the current authenticated generation, plus an owner-bound versioned recovery descriptor.
- Returns a `VerifiedDeploymentReceipt` only when exact server response and refreshed verified summary agree.

- [ ] Write failing tests for start/resume/abandon/complete exact Supabase invocation, loading/anonymous/error refusal, stale auth generation, sign-out/account-switch freeze, duplicate completion, expiry countdown and five/one-minute warnings, terminal retry only before expiry, expiry input freeze, explicit casual continuation/battery return, safe failure copy, and no credential extraction.
- [ ] Add strict client contract-version refusal tests so a newer client never resumes or completes an unsupported persisted/server contract.
- [ ] Write failing storage tests for persisting immutable config plus transcript after every accepted fire, reconstructing the exact state on refresh, corrupt/expired/version-mismatch clearing, and never completing under a different account.
- [ ] Run focused Vitest; verify RED because lifecycle methods do not exist.
- [ ] Implement minimal backend/session methods and storage adapter with bounded timeout, exact validators, stale-operation isolation, profile refresh, and explicit retry/abandon state.
- [ ] Run focused tests; verify GREEN.
- [ ] Mutation check: accept a stale account response, transfer a descriptor across accounts, lose a pending terminal transcript, expose raw errors, or invoke while anonymous; confirm tests fail.

**Verification:** `npm run test:client -- client/src/client/verifiedDeployment.test.ts client/src/client/AccountSession.test.ts client/src/ui/Lobby.account.test.ts`
**Maps to:** O-06 browser-managed Auth lifecycle
**Covers:** AC-01, AC-04, AC-05, AC-06
**Depends on:** T-02, T-04, T-05
**Status:** ACCEPTED — lifecycle correction passed scoped adversarial re-review

### T-07: Pin launch, budget, award, and promotion composition

**Files:**
- Modify: `client/src/ui/LobbyHotSeatView.ts`
- Modify: `client/src/ui/LobbyHotSeatView.test.ts`
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/ui/Lobby.account.test.ts`
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.victoryReport.test.ts`
- Modify: `client/src/main.ts`
- Modify: `client/src/main.hotSeatProgression.test.ts`

**Interfaces:**
- Local Battery exposes casual deploy always and verified start/resume/abandon only for authenticated profiles.
- Main wires the server config and recovery transcript to the shared duel controller, persists after accepted human fire, and sends one pre-expiry retryable terminal completion to the verified HUD receipt.
- Terminal presentation preserves a short event-tied impact/explosion beat before victory/AAR appears; reduced-motion remains readable and duplicate input stays suppressed.
- Casual Quick Duel emits one fresh browser-generated unsigned 32-bit seed per launch; verified deployment retains its immutable server seed.

- [ ] Add failing semantic tests for signed-in-only start/resume/abandon, no identity re-entry, busy/refusal, fixed Baby Missile/six-salvo disclosure, fresh injected Quick Duel seeds across redeployments, ordinary casual customization unchanged, and server options overriding local customization.
- [ ] Add failing HUD tests for the terminal impact beat before result presentation, salvo counter, cap adjudication, expiry countdown/warnings/freeze, explicit casual continuation/battery return focus containment, pending/pre-expiry retry verification, verified win/loss XP, rank promotion via `commanderPromotionBetweenVerified`, next-rank copy, every safe failure, reduced motion, duplicate-input suppression, reset, and announcement.
- [ ] Add failing main-composition tests for recovered replay, accepted-fire persistence, shared bounded CPU generation, one pre-expiry retryable terminal submission, expiry freeze/casual conversion, generation/account guards, and no casual reporter on verified games.
- [ ] Run focused Vitest; verify RED.
- [ ] Implement minimal composition and responsive CSS within the existing lobby/HUD layers; do not add a new modal action.
- [ ] Run focused tests; verify GREEN.
- [ ] Mutation check: show verified launch when anonymous, pass local settings, reuse the engine's fixed Quick Duel seed, permit a forbidden action, lose recovery state, double-award terminal state, or render promotion from casual receipt; confirm tests fail.

**Verification:** `npm run test:client -- client/src/ui/LobbyHotSeatView.test.ts client/src/ui/Lobby.account.test.ts client/src/ui/HUD.victoryReport.test.ts client/src/main.hotSeatProgression.test.ts`
**Maps to:** O-07 coherent player journey
**Covers:** AC-04, AC-08, AC-09
**Depends on:** T-03, T-06
**Status:** ACCEPTED — supplemented adversarial review passed both load-bearing player steers

### T-08: Pin real-browser containment and lifecycle evidence

**Files:**
- Create: `e2e/verified-deployment.spec.ts`
- Modify: `e2e/account-progression-summary.spec.ts`
- Modify: `.github/workflows/ci.yml` only if the existing E2E discovery does not already include the new file

**Interfaces:**
- Exercises the real Lobby → start/resume → fixed duel/recovery → pre-expiry terminal retry or expiry freeze/casual conversion → account refresh → rank/AAR composition with controlled function responses.

- [ ] Add browser tests at desktop-fine, compact mouse, and touch viewports for start/resume/abandon visibility, fixed-rule/expiry disclosure, loading, battlefield/HUD layering, salvo counter, refresh recovery, countdown/warnings/expiry freeze, pending/pre-expiry retry, explicit casual continuation/battery return, award/promotion, failure copy, and focus loop.
- [ ] Run the focused Playwright file; verify RED against missing composition.
- [ ] Make only integration corrections required by real layout/lifecycle behavior.
- [ ] Rerun focused Playwright and the full E2E matrix; verify GREEN.
- [ ] Mutation check: remove verified receipt containment or force the launch row to stack over the route frame; confirm geometry assertions fail.

**Verification:** `npx playwright test e2e/verified-deployment.spec.ts e2e/account-progression-summary.spec.ts`
**Maps to:** O-08 real-browser usability and layering
**Covers:** AC-04, AC-08, AC-09
**Depends on:** T-07
**Status:** ACCEPTED — real-impact and complete-lifecycle correction review passed

### T-09: Govern, review, land, deploy, and prove production

**Files:**
- Modify: `.codearbiter/security-controls.md`
- Modify: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-sprint-evidence.md`
- Create: `.codearbiter/reports/2026-08-11-commander-career-milestone-2-final-review-package.md`
- Modify: `.codearbiter/open-tasks.md` through `$ca-task` only when closing/advancing the initiative

- [ ] Update security controls for session/result ownership, private immutable transcript evidence, exact functions, dual IP/account limits, bounded streaming JSON, deterministic 60-probe server-generated CPU, honest expiry freeze, executable deployment drain/version posture, limits, RLS/RPC grants, and verified-vs-casual authority.
- [ ] Run `npm run audit:deps`, `npm run check`, `npm run check:edge`, `npm run test:client`, `npm run coverage:client`, `npm run build`, migration verification, full Playwright, diff check, and secret scan from fresh state; record exact counts/timings.
- [ ] Package spec, plan, sprint evidence, test evidence, and exact final diff for one adversarial subagent. Resolve every Critical, High, Medium/Low merge blocker and rerun review against the corrected exact package.
- [ ] Route commit/PR through CodeArbiter gates. Require every hosted check green on the exact reviewed PR head.
- [ ] For initial rollout keep starts disabled, deploy migration/config/functions while old completion/abandon remain available, prove the hosted non-awarding maximum-probe/full-duel workload, deploy the strict-version client, verify drain status/rollout order, enable starts with the checked-in command, then use the browser-managed authenticated session to prove start/resume, account limiting, real human-only transcript plus regenerated CPU, refresh recovery, completion retry/idempotency without replay, expiry presentation, summary, rank/AAR, and casual fallback in production.
- [ ] Persist the production receipt, keep `career.initiative.0001` active, and immediately select the next tactical-objective slice from production evidence.

**Verification:** exact reviewed SHA equals exact green PR head; exact merged main deploy provenance and authenticated production receipt are recorded
**Maps to:** O-09 reviewed delivery and production truth
**Covers:** AC-10
**Depends on:** T-01 through T-08
**Status:** IN_PROGRESS

## Dependency order and MVP slice

Order: T-01 → T-02; T-03 may proceed after plan approval; T-04 depends on T-01/T-02/T-03; T-05 depends on T-01/T-04; T-06 depends on T-02/T-04/T-05; T-07 depends on T-03/T-06; T-08 depends on T-07; T-09 depends on all implementation tasks.

**MVP slice:** T-01 through T-08. It is the smallest player-complete path: launch a real verified duel, replay it, award once, and see honest rank feedback. T-09 is the mandatory governed delivery boundary, not optional polish.

## Bijection and self-review

- Every AC-01 through AC-10 maps to at least one task; every T-01 through T-09 advances at least one acceptance criterion.
- No placeholder, dependency, generic diagnostics, casual-rank, client-owned award, transcript-storage, or destructive-schema task is present.
- Type names are stable across tasks: `VerifiedDeploymentStartResponse`, `VerifiedDeploymentRecorder`, `VerifiedDeploymentReceipt`, and `verifiedProgression`.
- Negative check: if all tasks pass, no in-scope player or trust-boundary behavior remains missing. Tactical objectives and envelope expansion are explicit later milestones.
