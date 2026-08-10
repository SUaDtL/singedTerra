# Anonymous Progression Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route anonymous local-match players from the After Action Report into the existing sign-in overlay for future progression, without retroactive credit.

**Architecture:** The existing one-shot progression reporter reports a null outcome through a new callback. Main verifies that the exact game is still terminal and the persistent account owner is anonymous, then asks HUD to show an optional handoff. HUD emits one semantic action; main tears down the game and asks Lobby to show its existing account overlay in sign-in mode.

**Tech Stack:** TypeScript, Vitest/jsdom, Playwright, existing HUD/Lobby DOM composition.

## Global constraints

- Copy is exactly `Sign in to record future matches.` with an action named `Sign in`.
- Never record or imply credit for the completed anonymous match.
- Preserve the existing signed-in XP receipt, Play again, Main Menu, focus isolation, and deterministic game behavior.
- Exclude auth, Supabase, migrations, Edge Functions, progression arithmetic, dependencies, assets, network progression, and gameplay tuning.
- Work test-first: every production behavior must be observed failing for the intended reason before implementation.
- Final adversarial review receives the spec, this plan, sprint evidence, tests, and exact final diff.

---

### Task 1: Test-first anonymous After Action handoff

**Files:**
- Modify: `client/src/client/hotSeatProgression.ts`
- Modify: `client/src/client/hotSeatProgression.test.ts`
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.victoryReport.test.ts`
- Modify: `client/src/ui/Lobby.ts`
- Create: `client/src/ui/Lobby.anonymousAccount.test.ts`
- Modify: `client/src/main.ts`
- Modify: `client/src/main.hotSeatProgression.test.ts`
- Modify: `e2e/victory-report.spec.ts`
- Modify: `.codearbiter/reports/2026-08-10-anonymous-progression-handoff-sprint-evidence.md`
- Preserve (controller-owned task state; do not modify): `.codearbiter/open-tasks.md`

**Interfaces:**
- `HotSeatProgressionReporterOptions.onUnrecorded?(result: HotSeatMatchResult): void`
- `HUD.onProgressionSignIn(cb: () => void): void`
- `HUD.setAnonymousProgressionHandoff(): void`
- `Lobby.isAccountAnonymous(): boolean`
- `Lobby.showAccountSignIn(): void`

- [ ] **Step 1: Write reporter RED tests**

  Add direct tests proving a null report invokes `onUnrecorded` once, a trusted summary invokes only `onRecorded`, and duplicate `GAME_OVER` observations cannot invoke either path twice.

- [ ] **Step 2: Run reporter tests and verify RED**

  Run: `npm -w @singedterra/client exec vitest run src/client/hotSeatProgression.test.ts`

  Expected: FAIL because `onUnrecorded` is not called.

- [ ] **Step 3: Implement the minimal reporter callback and verify GREEN**

  Invoke `onUnrecorded` only when the existing report promise resolves to `null`; preserve the existing swallowed-error behavior. Re-run the focused reporter test to green.

- [ ] **Step 4: Write HUD and Lobby RED tests**

  Prove that HUD renders hidden-by-default future-only copy, reveals one Sign in action, includes it in both tab directions only while visible, emits its callback once per activation, and clears it when a trusted receipt wins or the report closes. Prove that Lobby reports only the literal anonymous state and that `showAccountSignIn()` opens the existing account overlay with the email input focused.

- [ ] **Step 5: Run HUD/Lobby tests and verify RED**

  Run: `npm -w @singedterra/client exec vitest run src/ui/HUD.victoryReport.test.ts src/ui/Lobby.anonymousAccount.test.ts`

  Expected: FAIL because the optional prompt/action and Lobby public handoff do not exist.

- [ ] **Step 6: Implement the minimal HUD and Lobby seams and verify GREEN**

  Reuse the existing victory receipt area and Account overlay; do not duplicate either surface. Re-run the focused HUD/Lobby tests to green.

- [ ] **Step 7: Write main-composition RED tests**

  Prove anonymous local human completion shows the handoff exactly once; signed-in/trusted receipt does not; network, AI-owned Player 1, deterministic fixtures, stale replacement, and quit do not. Prove the Sign in action tears down the exact game and opens Lobby account sign-in.

- [ ] **Step 8: Run main-composition tests and verify RED**

  Run: `npm -w @singedterra/client exec vitest run src/main.hotSeatProgression.test.ts`

  Expected: FAIL because main does not distinguish anonymous null results or wire the handoff action.

- [ ] **Step 9: Implement minimal composition and verify GREEN**

  Keep current generation/client/terminal guards around both recorded and unrecorded callbacks. Register the HUD action once with the persistent Lobby owner. Re-run all focused Vitest files.

- [ ] **Step 10: Add browser acceptance and verify causal failure/green**

  Extend the victory fixture with an anonymous-progression mode that exercises the production bundle. Prove exact copy, action containment, keyboard focus, and transition into the existing account overlay on desktop, landscape-touch, and compact profiles. First run must fail on the missing production behavior; after the minimal fixture/composition support, all profiles must pass.

- [ ] **Step 11: Mutation-check the guards**

  Temporarily make the handoff visible for signed-in receipts and remove the stale-game generation guard. Confirm focused tests fail for the intended assertions, then restore production code and re-run green.

- [ ] **Step 12: Record evidence and complete local verification**

  Update the sprint evidence with every RED/GREEN command and mutation result. Run focused Vitest, production build, full `npm run check`, affected Playwright profiles, full client tests, Edge tests, dependency audit, secret scan, migration/security classification, and diff hygiene.

- [ ] **Step 13: Adversarial exact-package review and landing**

  Give one adversarial reviewer the spec, plan, sprint evidence, tests, and exact final diff. Resolve every Critical, High, Important, and merge-blocking finding; rerun affected proof after each correction. Then use `$ca-commit` and `$ca-pr`, wait for exact-head hosted CI, merge under standing authority, deploy Pages, verify production provenance/health, and emit the delivery receipt.

### Coverage-auditor correction round 2/5

- [x] Prime the existing account overlay into create-account mode and prove `showAccountSignIn()` restores visible sign-in state and email focus.
- [x] Prove rejected progression reports invoke neither terminal callback.
- [x] Prove the Sign in one-shot latch resets for a fresh anonymous game while remaining duplicate-safe within each game.
- [x] Give the asynchronously revealed anonymous prompt polite status semantics without moving focus.
- [x] Prove anonymous report panel containment within overlay and viewport, document overflow absence, and all three browser profiles through a causal layout mutation.
- [x] Record exact round-2 RED/GREEN evidence and preserve the unrelated 4173 listener.
