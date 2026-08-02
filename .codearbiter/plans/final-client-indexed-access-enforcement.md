# Final Client Indexed-Access Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Close every remaining client indexed-access finding and replace the temporary migration compiler projects with one canonical strict client project.

**Architecture:** First use the existing additive test project to prove the exact 40-finding RED. Migrate only fixture access, then promote the compiler flag into the canonical client config and delete the now-redundant migration configs.

**Tech Stack:** TypeScript 7, Vitest 4, npm workspaces, codeArbiter TDD and commit gates.

## Global Constraints

- Production source is out of scope.
- Missing fixture evidence must throw or fail an assertion; it must never receive a default value.
- Preserve 7 test files, all test names, and the 100-test baseline.
- Final full-client strict inventory is zero findings.

---

### Task 1: Enforce and migrate the final fixture set

**Files:**
- Modify: `client/tsconfig.tests-strict.json`
- Modify: `client/src/client/LobbySession.test.ts`
- Modify: `client/src/client/NetworkClient.sessionClear.test.ts`
- Modify: `client/src/ui/Lobby.garage.test.ts`
- Modify: `client/src/ui/Lobby.gonePendingAction.test.ts`
- Modify: `client/src/ui/Lobby.network.test.ts`
- Modify: `client/src/ui/Lobby.rejoin.test.ts`
- Modify: `client/src/ui/Lobby.sessionLifecycle.test.ts`

**Interfaces:**
- Consumes: the existing enumerated strict-test compiler project plus captured channels, callbacks, engine tanks, roster entries, and mock call tuples.
- Produces: one green compiler gate containing every client test fixture, with assertion-fatal typed access and unchanged runtime expectations.

- [x] Add all seven baseline files to `include` without removing any migrated suite, then run `npm -w @singedterra/client run typecheck:tests-strict`; record exactly 40 findings across the expected 7 files.
- [x] Add local `required<T>(value: T | undefined, label: string): T` guards where repeated indexed fixtures need narrowing.
- [x] Replace all 40 unchecked accesses with guarded channels, callbacks, tanks, roster entries, emitted configs, or call tuples; preserve every assertion and test name.
- [x] Run all seven focused Vitest files; expect 100/100 tests.
- [x] Run `npm -w @singedterra/client run typecheck:tests-strict`; expect zero findings and a commit-safe green tree.

### Task 2: Promote the canonical compiler boundary

**Files:**
- Modify: `client/tsconfig.json`
- Delete: `client/tsconfig.production.json`
- Delete: `client/tsconfig.tests-strict.json`
- Modify: `client/package.json`

**Interfaces:**
- Consumes: a complete client tree already clean under the strict probe.
- Produces: one canonical `tsc --noEmit` command that covers production, tests, Vite config, and future files.

- [x] Set `compilerOptions.noUncheckedIndexedAccess` to `true` in `client/tsconfig.json`.
- [x] Remove the two migration-only configs and the `typecheck:production` / `typecheck:tests-strict` scripts.
- [x] Set client `typecheck` to `tsc --noEmit` and run it; expect zero findings.
- [x] Run all 7 focused suites; expect 100/100 tests.

### Task 3: Verify and ship

**Files:**
- Append: `.codearbiter/sprint-log.md`
- Append when authorized: `.codearbiter/overrides.log`

**Interfaces:**
- Consumes: the complete implementation diff.
- Produces: reviewed, resumable, exact-head PR and deployment evidence.

- [x] Run `npm run check`, `npm run test:client`, `npm run check:edge`, `npm run build`, and `npm run audit:deps`.
- [x] Run the state-free secrets scan and protected-log prefix proofs.
- [x] Obtain one designated adversarial review; fix every Critical, High, Medium, and merge-blocking finding.
- [x] Commit through `$ca-commit`, open/update the PR, and require hosted CI green on the exact final head.
- [ ] Under standing authority, log the PR-specific merge receipt, re-pass exact-head CI, squash merge, verify Pages provenance/live smoke, and close issue #70.
