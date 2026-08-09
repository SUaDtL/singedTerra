# Signed-in Hot-seat Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one bounded version-one progression result when signed-in hot-seat Player 1 completes a match.

**Architecture:** An additive owner-private table and explicitly authenticated Edge Function store idempotent client-attested local outcomes. The account summary adds exact local counts to existing network counts. A pure one-shot client reporter observes `GAME_OVER` and delegates through the existing account-session owner.

**Tech Stack:** TypeScript, Vitest/jsdom, Deno Edge tests, Supabase Auth/Edge Functions/Postgres RLS, Playwright, Vite.

## Global Constraints

- Player 1 is the signed-in account seat; other hot-seat players are guests.
- Keep progression version 1 unchanged: 100 XP per match, plus 100 XP per win, 500 XP per level.
- Accept no client-supplied user id, XP, level, cumulative total, reward, or entitlement.
- Preserve anonymous/local-only boot, deterministic engine state, network seat-token authorization, and all existing account degradation behavior.
- No dependency, email provider, OAuth, custom crypto, secret, spending, or destructive migration.
- Client-attested local outcomes remain casual history and cannot authorize gameplay benefits.
- Work test-first and never stage or delete `.codearbiter/open-tasks.md.lock`.

---

### Task 1: Owner-private local result persistence

**Files:**
- Modify: `scripts/checks/profile_identity.mjs`
- Create: `supabase/migrations/015_hotseat_match_results.sql`
- Modify: `supabase/functions/_shared/database.types.ts`
- Modify: `supabase/functions/_shared/database.types.test.ts`
- Modify: `.codearbiter/security-controls.md`

**Interfaces:**
- Produces: `hotseat_match_results(user_id uuid, match_id uuid, won boolean, created_at timestamptz)` with primary key `(user_id, match_id)`.

- [x] Write a failing migration/harness contract requiring the exact table, foreign key, primary key, RLS, owner-only SELECT, authenticated write revocation, service-role SELECT/INSERT only, classifications, and an impossible normalized-LF digest.
- [x] Run `node scripts/checks/profile_identity.mjs` and require RED because migration 015 is absent.
- [x] Add the minimal additive SQL and generated-style database types; forbid UPDATE/DELETE grants and progression-total or credential columns.
- [x] Pin the reviewed migration digest and run `node scripts/checks/profile_identity.mjs` plus `npx deno test supabase/functions/_shared/database.types.test.ts` GREEN.
- [x] Mutation proof: append an authenticated INSERT grant to the in-memory migration oracle and require the harness to fail; restore GREEN.

### Task 2: Authenticated idempotent result endpoint

**Files:**
- Create: `supabase/functions/record_hotseat_match/index.ts`
- Create: `supabase/functions/record_hotseat_match/record_hotseat_match.test.ts`
- Modify: `supabase/functions/_shared/mod.ts`
- Modify: `supabase/functions/_shared/mod.test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: exact body `{ matchId: string; won: boolean }`, raw request, service client.
- Produces: `handleRecordHotSeatMatch(body, request, deps?)` returning `200 { ok: true, recorded: true|false }`, `400`, `401`, `409`, or generic `500`.

- [x] Write failing handler tests for exact body validation, missing/malformed/rejected bearer, Auth-derived user insertion, exact replay, different-outcome conflict, database failures, credential-free logs, and no XP/account identity input.
- [x] Run the focused Deno test and require RED because the handler is absent.
- [x] Implement explicit `auth.getUser(token)`, scoped existing-row lookup, insert, unique-race re-read, idempotency/conflict classification, CORS wrapper, and an explicit `record_hotseat_match` rate bucket.
- [x] Register `[functions.record_hotseat_match] verify_jwt = false`; the handler's `getUser` check remains mandatory.
- [x] Run focused Edge/shared tests GREEN; mutate user derivation to body-owned identity and require a named test/harness failure, then restore GREEN.

### Task 3: Exact account-summary aggregation

**Files:**
- Modify: `supabase/functions/account_summary/account_summary.test.ts`
- Modify: `supabase/functions/account_summary/index.ts`
- Modify: `scripts/checks/profile_identity.mjs`

**Interfaces:**
- Consumes: Auth-derived user id and exact count-only queries for local matches and local wins.
- Produces: combined safe-integer `matchesPlayed` and `wins` before `deriveProgression`.

- [x] Add failing tests for zero/network/local/mixed totals, local query failure, malformed/null counts, overflow, and no row-payload dependence.
- [x] Run `npx deno test supabase/functions/account_summary/account_summary.test.ts` and require RED because local counts are absent.
- [x] Add two exact `head: true, count: 'exact'` service queries scoped to `user_id`, with the win query additionally scoped to `won = true`; validate safe nonnegative counts and safe combined arithmetic.
- [x] Run focused tests and profile harness GREEN; mutate away either local count and require a named mixed-total failure, then restore GREEN.

### Task 4: One-shot hot-seat completion reporting

**Files:**
- Create: `client/src/client/hotSeatProgression.ts`
- Create: `client/src/client/hotSeatProgression.test.ts`
- Modify: `client/src/client/AccountSession.ts`
- Modify: `client/src/client/AccountSession.test.ts`
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/ui/Lobby.account.test.ts`
- Modify: `client/src/main.ts`

**Interfaces:**
- Produces: `createHotSeatProgressionReporter(accountTankId, report, matchId?)` with `observe(state)`; `AccountSession.recordHotSeatMatch({ matchId, won })`; `Lobby.recordHotSeatMatch(...)`.

- [x] Write failing pure reporter tests proving no pre-terminal call, one call on first `GAME_OVER`, Player-1 winner true, loss/draw false, duplicate observations ignored, injected match id retained, and reporter omission for E2E modes.
- [x] Write failing AccountSession/Lobby tests proving authenticated-only invocation, exact body, profile-preserving failure, and refresh after success.
- [x] Run focused Vitest and require RED on missing interfaces.
- [x] Implement the reporter and account-session delegation; create one reporter per ordinary hot-seat start from the first engine tank and observe it from the existing state subscription. Do not change `HotSeatClient`, `GameEngine`, or `GameState`.
- [x] Run focused tests GREEN; mutate the latch and winner comparison separately and require causal failures, then restore GREEN.

### Task 5: Full review and delivery

**Files:**
- Append only: `.codearbiter/sprint-log.md`
- Modify through `$ca-task`: `.codearbiter/open-tasks.md`
- Update checkboxes: `.codearbiter/plans/persistent-hotseat-progression.md`

**Interfaces:**
- Produces: reviewed exact PR head, deployed migration/function/client, production progression health, and next SMARTS slice.

- [x] Run focused tests, `npm run test:client`, `npm run check:edge`, `npm run check`, `npm run build`, `npm run audit:deps`, full Playwright, `git diff --check`, and state-free secret scan; require all green and zero raw-secret findings.
- [x] Give one adversarial subagent the spec, plan, sprint log, RED/GREEN/mutation/full evidence, security-controls delta, migration, tests, and complete final diff. Resolve every Critical, High, and other merge blocker and obtain exact-final-diff CLEAR.
- [x] Pass `$ca-commit` and `$ca-pr`, excluding the task lock. Require all hosted checks green on the exact reviewed head.
- [x] Log standing merge authority, re-review the exact audit head, re-clear hosted checks, squash merge with expected-head guard, push migration 015 and deploy `record_hotseat_match`, verify remote migration/function state plus missing-auth 401 and unchanged anonymous room health.
- [x] Require exact-main CI, CodeQL, Pages provenance, live asset health, and production account-summary compatibility before marking `mvp2.progression.0006` done and selecting the next improvement.
