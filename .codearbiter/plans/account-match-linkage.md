# Authenticated Match Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link a signed-in network player's verified seat to one persisted completed match without trusting browser-owned account ids, seat ids, outcomes, or progression totals.

**Architecture:** Add an owner-private `match_participants` relation and a separate `claim_match` Edge Function. The function validates the Supabase JWT and existing seat token, derives account and tank identities server-side, and writes an immutable idempotent link. The client attempts this claim only after `finish_game` settles and skips it when anonymous.

**Tech Stack:** TypeScript, Vitest, Deno tests, Supabase Auth/Edge Functions/Postgres RLS, existing deterministic harnesses.

## Global Constraints

- Preserve anonymous hot-seat and network play and the existing seat-token referee boundary.
- Accept no client-supplied user id, tank id, outcome, XP, level, or cumulative total.
- Store or log no JWT, password, refresh token, service key, or seat token.
- Add no dependency, custom crypto, paid provider, email delivery, or destructive migration.
- Work test-first. Migration 014 is immutable after exact review.
- Do not stage or delete `.codearbiter/open-tasks.md.lock`.

---

### Task 1: Migration contract and owner-private linkage table

**Files:**
- Modify: `scripts/checks/profile_identity.mjs`
- Create: `supabase/migrations/014_match_participants.sql`
- Modify: `supabase/functions/_shared/database.types.ts`
- Modify: `supabase/functions/_shared/database.types.test.ts`
- Modify: `.codearbiter/security-controls.md`

**Interfaces:**
- Consumes: `match_scores.room_id`, `auth.users.id`, ADR-0011 identity split.
- Produces: typed `match_participants` rows keyed by `(room_id, user_id)` with unique `(room_id, player_id)`.

- [x] **Step 1: Write the failing migration contract**

Extend `profile_identity.mjs` to require migration 014, exact table/foreign-key/uniqueness shapes, RLS, owner-only authenticated SELECT, no anonymous grant/policy, authenticated write revocation, service-role-only insertion, classification comments, and a deliberately impossible normalized-LF digest sentinel that cannot pass.

- [x] **Step 2: Verify RED**

Run: `node scripts/checks/profile_identity.mjs`
Expected: FAIL because migration 014 is absent.

- [x] **Step 3: Add the minimal additive migration and database types**

Create the table and policies exactly as specified. Add `match_participants` Row/Insert/Update/Relationships types and compile-time tests. Update security controls from ten public gameplay functions to ten public functions plus one explicitly authenticated account-aware claim function.

- [x] **Step 4: Bind the immutable digest and verify GREEN**

Run: `node scripts/checks/profile_identity.mjs`
Expected: PASS only after the reviewed migration's normalized-LF SHA-256 is pinned.

- [x] **Step 5: Run database type tests**

Run: `deno test supabase/functions/_shared/database.types.test.ts`
Expected: PASS.

### Task 2: Authenticated `claim_match` referee

**Files:**
- Create: `supabase/functions/claim_match/index.ts`
- Create: `supabase/functions/claim_match/claim_match.test.ts`
- Modify: `supabase/functions/_shared/mod.ts`
- Modify: `supabase/functions/_shared/mod.test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: body `{ roomId: string; playerId: string; token: string }`, raw `Request`, `getServiceClient`, `verifySeatToken`, and migration 014.
- Produces: `handleClaimMatch(body, req, deps?) -> Promise<Response>` and `POST /functions/v1/claim_match`.

- [x] **Step 1: Write failing handler tests with injected dependencies**

Cover malformed input; missing/malformed/rejected bearer JWT; missing room; non-member; invalid seat token; active room; absent match score; derived `pN`; body-supplied identity fields ignored; new insert; exact replay; user/seat conflict; generic database failure; and credential-free logs/errors. Use fake dependencies, never a live project.

- [x] **Step 2: Verify RED**

Run: `deno test supabase/functions/claim_match/claim_match.test.ts --allow-env`
Expected: FAIL because `claim_match/index.ts` does not exist.

- [x] **Step 3: Implement the minimal referee**

Parse the bearer header without decoding JWT claims; validate with `service.auth.getUser(token)`; query the room and score; verify the seat token; derive `tank_id` from roster order; insert through service role; classify uniqueness replay/conflict without reflecting database or credential details. Wrap with the existing CORS/rate-limit helper.

- [x] **Step 4: Register the function explicitly**

Add `[functions.claim_match] verify_jwt = false` to `supabase/config.toml`. The explicit in-handler `getUser(token)` check is mandatory and contract-tested.

- [x] **Step 5: Verify GREEN and shared-helper parity**

Run: `deno test supabase/functions/claim_match/claim_match.test.ts supabase/functions/_shared/mod.test.ts --allow-env`
Expected: PASS.

### Task 3: Authenticated transport and claim helper

**Files:**
- Modify: `client/src/lib/edgeFunctions.ts`
- Modify: `client/src/lib/edgeFunctions.test.ts`
- Create: `client/src/client/matchClaim.ts`
- Create: `client/src/client/matchClaim.test.ts`

**Interfaces:**
- Consumes: narrow Auth session reader and body `{ roomId; playerId; token }`.
- Produces: optional `callFunction` bearer override and `claimCompletedMatch(auth, payload, post?) -> Promise<'linked' | 'anonymous'>`.

- [x] **Step 1: Write failing transport tests**

Assert the optional account bearer replaces only `Authorization`, the publishable key remains in `apikey`, default calls retain current headers, and no bearer appears in the JSON body or result error.

- [x] **Step 2: Write failing helper tests**

Assert no session returns `anonymous` without POST; session lookup error rejects generically; a session POSTs only room/player/seat token with the bearer in options; 200 returns `linked`; and non-2xx throws only a bounded status error.

- [x] **Step 3: Verify RED**

Run: `npm -w @singedterra/client exec vitest run src/lib/edgeFunctions.test.ts src/client/matchClaim.test.ts`
Expected: FAIL on absent bearer option/helper.

- [x] **Step 4: Implement minimal transport and helper behavior**

Keep session access inside the Supabase SDK. Do not cache, persist, return, or log the bearer token.

- [x] **Step 5: Verify GREEN**

Run: `npm -w @singedterra/client exec vitest run src/lib/edgeFunctions.test.ts src/client/matchClaim.test.ts`
Expected: PASS.

### Task 4: Causal NetworkClient completion wiring

**Files:**
- Modify: `client/src/client/NetworkClient.ts`
- Create: `client/src/client/NetworkClient.matchClaim.test.ts`

**Interfaces:**
- Consumes: `claimCompletedMatch(this.supabase.auth, { roomId, playerId, token })` and `postOnceWithRetry`.
- Produces: one bounded claim sequence after the existing finish retry settles, with anonymous skip and no GAME_OVER impact.

- [x] **Step 1: Write the failing causal integration test**

Drive the real completion seam or invoke its private boundary through the established NetworkClient test pattern. Prove finish attempts settle before claim starts, signed-in claim retries boundedly, anonymous completion does not call `claim_match`, and final failure logs no credential or changes no game state.

- [x] **Step 2: Verify RED**

Run: `npm -w @singedterra/client exec vitest run src/client/NetworkClient.matchClaim.test.ts`
Expected: FAIL because NetworkClient does not call the helper.

- [x] **Step 3: Implement the minimal completion hook**

Chain the claim from the existing finish retry's completion handler. Keep both operations best-effort and ensure `_gameOverReported` still prevents duplicate local scheduling.

- [x] **Step 4: Verify GREEN plus nearby retry/session tests**

Run: `npm -w @singedterra/client exec vitest run src/client/NetworkClient.matchClaim.test.ts src/client/NetworkClient.sessionClear.test.ts src/client/retry.test.ts`
Expected: PASS.

### Task 5: Full gates, adversarial review, PR, and production

**Files:**
- Modify: `.codearbiter/sprint-log.md` by append only
- Modify: `.codearbiter/plans/account-match-linkage.md` checkboxes
- Modify: `.codearbiter/open-tasks.md` only through `$ca-task` after production proof

**Interfaces:**
- Consumes: exact final implementation and deployment artifacts.
- Produces: reviewed PR, deployed migration/function/client, production evidence, and next bounded progression task.

- [x] **Step 1: Run fresh focused and full verification**

Run `npm run test:client`, `npm run check`, `npm run check:edge`, `npm run build`, and `npm run audit:deps`. Run the state-free secret scan. Expected: all PASS and zero credential findings.

- [ ] **Step 2: Assemble the mandatory adversarial package**

Give one adversarial subagent this spec, this plan, sprint log, RED/GREEN/full results, threat constraints, migration, and complete final diff. Resolve every Critical, High, and other merge blocker, then obtain exact-diff re-review.

- [ ] **Step 3: Commit and open the ready PR through `$ca-commit` and `$ca-pr`**

Stage only intended files by exact path. Never stage `.codearbiter/open-tasks.md.lock`.

- [ ] **Step 4: Meet at green and merge exact reviewed head**

Required hosted CI, Edge, rendering/E2E, and CodeQL checks must pass. Report neutral/skipped integrations distinctly. Merge through the PR under standing authority only if the reviewed head is unchanged.

- [ ] **Step 5: Deploy and verify production**

Run the lockfile-pinned migration/config/function deployment with interactive config-diff review. Wait for exact-main Pages provenance and post-deploy smoke. Verify migration 014 parity, `claim_match` availability/auth rejection, unchanged anonymous rooms, and live page assets. Do not create credentials or an account unless cleanup is safe and no user-only gate exists.

- [ ] **Step 6: Close or continue the umbrella honestly**

Mark only `mvp2.progression.0001` done after production proof. Keep `mvp2.identity.0001` in progress until user-visible progression ships. Select the next slice, expected to be server-derived match counters before XP/levels.
