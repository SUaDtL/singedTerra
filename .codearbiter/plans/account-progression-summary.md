# Authenticated Account Progression Summary Implementation Plan

> **Execution:** codeArbiter sprint, test-first, task-scoped subagents, one adversarial final package.

**Goal:** Show signed-in players durable server-derived linked-match and recorded-win counts without adding client-owned progression writes or reward tuning.

**Architecture:** A new authenticated `account_summary` Edge Function manually validates the Supabase bearer, reads only the Auth-derived user's immutable match links, joins their public persisted score rows inside the service boundary, and returns two bounded counts. `AccountSession` loads and validates that read model alongside the owner profile; `AccountPanelView` renders it.

**Trust note:** The summary reflects accepted persisted lockstep results. It is not a competitive anti-cheat rating.

## Global constraints

- No migration, dependency, XP formula, level, rank, unlock, or client write.
- No client-supplied user id or cumulative total.
- No raw JWT, password, seat token, service key, or private account id in logs.
- Preserve anonymous/hot-seat/network gameplay and existing claim behavior.
- Do not stage or delete `.codearbiter/open-tasks.md.lock`.

### Task 1: Authenticated server summary

**Files:**
- Create `supabase/functions/account_summary/index.ts`
- Create `supabase/functions/account_summary/account_summary.test.ts`
- Modify `supabase/functions/_shared/mod.ts`
- Modify `supabase/functions/_shared/mod.test.ts`
- Modify `supabase/config.toml`
- Modify `scripts/checks/profile_identity.mjs`
- Modify `.codearbiter/security-controls.md`

- [x] Write RED tests for bearer rejection, Auth-derived scoping, zero links, exact multi-match win derivation, query failures, duplicate/missing score fail-closed behavior, and safe logging.
- [x] Prove RED before adding the function.
- [x] Implement the smallest handler and named rate bucket; add source/security contracts.
- [x] Run focused Deno and identity harness GREEN, then mutate away auth scoping and winner comparison to prove causal failures.
- [x] Send the task spec, plan, sprint log, tests, and scoped diff to a reviewer; resolve every blocker.

### Task 2: Account-session read model

**Files:**
- Modify `client/src/client/AccountSession.ts`
- Modify `client/src/client/AccountSession.test.ts`

- [x] Write RED tests for authenticated invocation, exact response validation, malformed/error-to-null degradation, and profile preservation.
- [x] Implement a typed nullable `AccountSummary` loaded through the existing authenticated Supabase client, with a bounded five-second optional-request timeout.
- [x] Run focused Vitest/typecheck GREEN and mutate away response validation to prove causality.
- [x] Obtain scoped task review and resolve every blocker.

### Task 3: Player-facing account panel

**Files:**
- Modify `client/src/ui/AccountPanelView.ts`
- Modify `client/src/ui/AccountPanelView.test.ts`
- Modify account fixtures only where the stricter profile type requires it.
- Modify account-panel CSS in `client/src/ui/Lobby.ts` if needed.

- [x] Write RED DOM tests for labeled counts, unavailable summary, and preserved sign-out behavior.
- [x] Render a compact accessible summary with no gameplay-layout changes.
- [x] Run focused account/lobby tests and client typecheck GREEN; use a text mutation to prove the DOM oracle.
- [x] Obtain scoped task review and resolve every blocker.

### Task 4: Final governed delivery

- [x] Run `npm run test:client`, `npm run check:edge`, `npm run check`, `npm run build`, `npm run audit:deps`, diff hygiene, and the state-free secret scan.
- [x] Build one adversarial package containing this spec, plan, append-only sprint log, all test evidence, and the complete final diff. Resolve every Critical, High, and other merge blocker.
- [ ] Commit through `$ca-commit`, open a ready PR through `$ca-pr`, and watch exact-head hosted CI through terminal green.
- [ ] Log the standing-authority merge override, re-review and re-run hosted checks on its audit-only head, then squash merge.
- [ ] Deploy Supabase config/functions and the exact-main Pages client. Verify remote function status, missing-auth rejection, anonymous compatibility, Pages provenance/assets, production rendering, and authenticated summary only when a safe existing session avoids a credential gate.
- [ ] Mark `mvp2.progression.0002` done while leaving `mvp2.identity.0001` in progress, then SMARTS-select the next progression slice.
