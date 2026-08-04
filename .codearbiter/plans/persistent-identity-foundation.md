# Persistent Identity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional password-based Supabase accounts and owner-only durable profiles without changing anonymous play or seat-token authorization.

**Architecture:** A DOM-free `AccountSession` lazily owns Supabase Auth/session/profile state. A pure `AccountPanelView` renders that state inside the lobby shell. One additive migration creates trigger-owned, RLS-protected profiles; a second preserves the existing public gameplay reads for authenticated sessions without granting writes. A deterministic harness pins both SQL migrations and auth configuration.

**Tech Stack:** TypeScript 7, Vitest/jsdom, Supabase JS 2.111.0, Supabase Auth, Postgres 15 RLS, Vite 8, PowerShell-hosted npm/Deno verification.

## Global Constraints

- No magic link, OTP, resend, SMTP, password-reset email, paid provider, or Google OAuth in this slice.
- Account use is optional; hot-seat and anonymous online play must boot and work without Supabase configuration.
- No password, email, JWT, refresh token, service-role key, or seat token may enter logs, URLs, public profile rows, Realtime payloads, or error copy.
- `profiles` is owner-readable only; insert is trigger-only; no progression writes exist in this slice.
- Existing room seat tokens remain unchanged and continue authorizing gameplay mutations.
- No production code or SQL before its focused test/harness has failed for the expected missing behavior.

---

### Task 1: Auth configuration and owner-only profile migration

**Files:**
- Create: `scripts/checks/profile_identity.mjs`
- Create: `supabase/migrations/012_profiles.sql`
- Create: `supabase/migrations/013_authenticated_gameplay_reads.sql`
- Modify: `supabase/config.toml`
- Modify: `package.json`

**Interfaces:**
- Consumes: ADR-0011 and the existing migration/classification conventions.
- Produces: enabled local/remote auth configuration and `public.profiles(id, display_name, created_at, updated_at)`.

- [x] **Step 1: Write the failing migration/config contract harness**

Create a Node harness that reads `supabase/config.toml`, `012_profiles.sql`, and `013_authenticated_gameplay_reads.sql`; requires auth/signup enabled with email confirmation disabled; preserves the linked API schema, TOTP MFA, and email abuse-control settings; explicitly disables paid vector buckets; and requires the additive profile table, `auth.users` foreign key, normalized trigger, RLS, owner-only authenticated profile SELECT, revoked anonymous profile access, and classification comments. Require authenticated SELECT parity for `rooms`, `room_actions`, and `match_scores`, with authenticated INSERT/UPDATE/DELETE explicitly revoked. Assert that neither migration contains credential storage, destructive statements, permissive profile access, or authenticated gameplay writes.

- [x] **Step 2: Verify RED**

Run: `node scripts/checks/profile_identity.mjs`

Expected: FAIL because the required migrations are missing and auth is disabled.

- [x] **Step 3: Add the minimal additive migration and auth configuration**

Create `012_profiles.sql` with a constrained profile table; `SECURITY DEFINER SET search_path = ''` trigger function; qualified insert; trigger on `auth.users`; RLS; revoked public/anon access; authenticated owner SELECT; and classification comments. Create `013_authenticated_gameplay_reads.sql` with SELECT-only authenticated grants and policies for the public gameplay tables plus explicit write revokes. Set `[auth].enabled = true`, `[auth].enable_signup = true`, `[auth.email].enable_signup = true`, and `[auth.email].enable_confirmations = false`; explicitly preserve the linked project's `graphql_public`, TOTP MFA, email frequency/OTP-length, and disabled vector settings so a full config push changes only the accepted auth posture. Add the harness to `npm run check` and run the lockfile-pinned `supabase db push --yes` before interactive `supabase config push` in `deploy:backend`, so both migrations precede signup and the config diff is reviewed before confirmation.

- [x] **Step 4: Verify GREEN**

Run: `node scripts/checks/profile_identity.mjs`

Expected: PASS with every profile/auth contract assertion.

Run: `npm run typecheck`

Expected: PASS.

---

### Task 2: Lazy account/session owner

**Files:**
- Create: `client/src/lib/supabaseConfig.ts`
- Create: `client/src/lib/supabaseConfig.test.ts`
- Create: `client/src/client/AccountSession.ts`
- Create: `client/src/client/AccountSession.test.ts`

**Interfaces:**
- Consumes: `supabase.auth.getSession`, `onAuthStateChange`, `signUp`, `signInWithPassword`, `signOut`, and owner-only `profiles` SELECT.
- Produces: `AccountState`, `AccountMode`, `AccountCredentials`, `AccountSession.initialize()`, `submit()`, `signOut()`, and `dispose()`.

- [x] **Step 1: Write failing pure config tests**

Assert config is unavailable when either Vite variable is blank and available only when both are non-empty. Assert the checker returns no secret values.

- [x] **Step 2: Verify config RED**

Run: `npm run test:client -- src/lib/supabaseConfig.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the pure config check and verify GREEN**

Implement `hasSupabaseConfig(env)` without importing `client/src/lib/supabase.ts`, then rerun the focused test.

- [x] **Step 4: Write failing AccountSession tests**

Cover unavailable boot without calling the loader; configured anonymous boot; restored-session profile load; signup forwarding only `{email,password,options.data.display_name}`; sign-in; sign-out; auth-event refresh; duplicate in-flight rejection; profile-load failure; disposal; and validation for trimmed display name, basic email shape, and 8-character password. Assert errors and emitted state never contain the supplied password.

- [x] **Step 5: Verify session RED**

Run: `npm run test:client -- src/client/AccountSession.test.ts`

Expected: FAIL because `AccountSession` does not exist.

- [x] **Step 6: Implement minimal AccountSession**

Keep the Supabase loader injected and default it to `await import('../lib/supabase')`. Normalize state to `unavailable | loading | anonymous | authenticated`; hold only profile id/display name, busy flag, and generic error; never retain credentials. Own and unsubscribe the auth listener. Use an operation generation so stale profile/auth completions cannot overwrite newer sign-out/dispose state.

- [x] **Step 7: Verify session GREEN**

Run: `npm run test:client -- src/lib/supabaseConfig.test.ts src/client/AccountSession.test.ts`

Expected: PASS.

---

### Task 3: Accessible lobby account panel

**Files:**
- Create: `client/src/ui/AccountPanelView.ts`
- Create: `client/src/ui/AccountPanelView.test.ts`
- Modify: `client/src/ui/LobbyShellView.ts`
- Modify: `client/src/ui/LobbyShellView.test.ts`
- Modify: `client/src/ui/Lobby.ts`
- Create: `client/src/ui/Lobby.account.test.ts`

**Interfaces:**
- Consumes: `AccountState` and callbacks for open, mode change, submit, and sign-out.
- Produces: a compact account summary plus labelled sign-in/create-account form composed by `Lobby`.

- [x] **Step 1: Write failing account-panel view tests**

Assert unavailable omits the panel; anonymous renders `Account` and the selected sign-in/create form; password inputs use `type=password` and `autocomplete=current-password|new-password`; busy disables submission; authenticated state renders only profile display name and sign-out; callbacks receive credentials only at submit time.

- [x] **Step 2: Verify panel RED**

Run: `npm run test:client -- src/ui/AccountPanelView.test.ts`

Expected: FAIL because the view does not exist.

- [x] **Step 3: Implement the pure account panel and verify GREEN**

Build DOM nodes through `document.createElement`, use a labelled region/dialog-style panel, avoid `innerHTML` for auth error/profile text, and clear password inputs immediately after reading them.

- [x] **Step 4: Write failing shell and Lobby wiring tests**

Extend shell-order assertions for the account slot. In `Lobby.account.test.ts`, inject a fake account session; assert `show()` initializes it, signed-out submit delegates once, state changes re-render, sign-out delegates, unavailable state leaves existing controls untouched, and `hide()` does not destroy the restorable session owner.

- [x] **Step 5: Verify wiring RED**

Run: `npm run test:client -- src/ui/LobbyShellView.test.ts src/ui/Lobby.account.test.ts`

Expected: FAIL because the shell and Lobby have no account composition.

- [x] **Step 6: Implement minimal Lobby composition and responsive styles**

Add the account slot after the title, inject `AccountSession` through an optional constructor dependency for tests, initialize during `show()`, route callbacks without logging credentials, and keep play tabs/forms usable while the account panel is closed or unavailable. Add responsive styles within the existing lobby visual language.

- [x] **Step 7: Verify UI GREEN**

Run: `npm run test:client -- src/ui/AccountPanelView.test.ts src/ui/LobbyShellView.test.ts src/ui/Lobby.account.test.ts`

Expected: PASS.

---

### Task 4: Governance alignment and full verification

**Files:**
- Modify: `.codearbiter/security-controls.md`
- Modify: `.codearbiter/CONTEXT.md`
- Modify: `.codearbiter/sprint-log.md` by append only
- Modify: `.codearbiter/open-tasks.md` only through `$ca-task`

**Interfaces:**
- Consumes: implemented auth/profile boundary and exact test evidence.
- Produces: current security/domain documentation and the review package evidence ledger.

- [x] **Step 1: Update governing docs to distinguish deployed reality from the accepted transition**

Replace the obsolete absolute no-auth posture with ADR-0011's optional account boundary, while preserving seat-token controls and explicitly documenting that gameplay remains anonymous-compatible. Update primary users/scope/identity strategic direction in CONTEXT without changing project stage.

- [x] **Step 2: Run focused and full local verification**

Run: `npm run test:client`

Run: `npm run check`

Run: `npm run check:edge`

Run: `npm run build`

Run: `npm run audit:deps`

Expected: all PASS with no warnings that indicate auth/profile leakage or migration drift.

- [x] **Step 3: Run browser smoke locally**

Verify unconfigured hot-seat boot, configured signed-out panel, form keyboard operation, mobile layout, and anonymous play entry. Record screenshots/evidence without entering or storing real credentials.

- [x] **Step 4: Assemble the adversarial review package**

Provide one adversarial subagent the approved spec, this plan, sprint-log additions, RED/GREEN/full test evidence, threat constraints, and final diff. Resolve every Critical, High, and any other merge-blocking finding, rerun affected tests, and obtain exact final-diff re-review.

- [x] **Step 5: Commit and publish through codeArbiter gates**

Run the auth/secret scan and migration reviewer, record content-bound pass markers only on genuine PASS, run the commit gate, push the active governed branch, and open a ready PR. Do not stage `.codearbiter/open-tasks.md.lock`.

- [x] **Step 6: Hosted checks, merge, deploy, and production verification**

Wait for every required hosted check on the exact reviewed PR head. When green, merge under standing authority; run `npm run deploy:backend` through the existing linked local Supabase CLI while preserving unrelated remote config and keeping vector buckets disabled; wait for Pages deployment; verify the production client, auth signup/sign-in surface without creating a paid dependency, profile RLS behavior using a disposable test account only if safe, and anonymous gameplay health.

- [x] **Step 7: Close and continue**

After production verification, append the sprint receipt and leave the broad `mvp2.identity.0001` umbrella in progress while authenticated match/account linkage and progression remain undelivered. Add and start the next bounded progression task—expected to be authenticated match/account linkage before XP/levels.
