# Anonymous progression handoff sprint evidence

## Scope and authority

- Task: `mvp2.progression.0009`
- Spec: `.codearbiter/specs/anonymous-progression-handoff.md`
- Plan: `.codearbiter/plans/anonymous-progression-handoff.md`
- Bounded spec and plan approved under the user's standing continuous-improvement authority.
- Recorded intent: conform to ADR-0004, ADR-0011, and ADR-0012; no unresolved `CONFIRM-NN` applies.

## SMARTS decisions

### Direct After Action handoff

- Options: direct account-overlay handoff; passive Main Menu reminder; retroactive claim.
- Verdict: direct handoff.
- Strength/confidence: strong/high.
- Intent: adversarial player-retention audit plus standing future-only progression direction.
- Reason: highest immediate retention value with the existing auth/UI boundary and no trust expansion.

## Baseline

- Base: `c844a690a0d0819ca4354917fab365caf5a33d30`
- `npm install`: 145 packages installed, 0 vulnerabilities; no dependency or lockfile change.
- `npm run check`: PASS in 107.7 seconds before production edits.

## TDD ledger

### RED

- `npm -w @singedterra/client exec vitest run src/client/hotSeatProgression.test.ts` — FAIL: `onUnrecorded` had zero calls after a `null` result (13 tests, 1 expected failure).
- `npm -w @singedterra/client exec vitest run src/ui/HUD.victoryReport.test.ts src/ui/Lobby.account.test.ts` — FAIL: anonymous-handoff DOM/callback and public Lobby methods were absent (19 tests, 4 expected failures).
- `npm -w @singedterra/client exec vitest run src/main.hotSeatProgression.test.ts` — FAIL: anonymous local handoff remained at zero and HUD sign-in wiring was missing (7 tests, 2 expected failures).
- `$env:E2E_LIVE_URL = 'http://127.0.0.1:4174/'; npx playwright test e2e/victory-report.spec.ts --grep 'anonymous future-match handoff'` — FAIL across desktop-fine, pixel-touch, and small-window before `victory-anonymous` fixture support: no victory report was present.

### GREEN

- `npm -w @singedterra/client exec vitest run src/client/hotSeatProgression.test.ts` — PASS: 13/13.
- `npm -w @singedterra/client exec vitest run src/ui/HUD.victoryReport.test.ts src/ui/Lobby.account.test.ts` — PASS: 19/19.
- `npm -w @singedterra/client exec vitest run src/main.hotSeatProgression.test.ts` — PASS: 8/8.
- `npm -w @singedterra/client exec vitest run src/client/hotSeatProgression.test.ts src/ui/HUD.victoryReport.test.ts src/ui/Lobby.account.test.ts src/main.hotSeatProgression.test.ts` — PASS: 40/40 after mutation restoration.
- `$env:VITE_SUPABASE_URL = 'http://127.0.0.1:4174'; $env:VITE_SUPABASE_ANON_KEY = 'e2e-public-anon-key'; npm run build` — PASS.
- `$env:E2E_LIVE_URL = 'http://127.0.0.1:4174/'; npx playwright test e2e/victory-report.spec.ts` — PASS: 9/9, including the anonymous handoff on desktop-fine, pixel-touch, and small-window.

### Browser isolation

- The unrelated `127.0.0.1:4173` listener (PID 106692) was not stopped or reused.
- This worktree preview used `node ..\\node_modules\\vite\\bin\\vite.js preview --host 127.0.0.1 --port 4174 --strictPort` from `client/`, with `E2E_LIVE_URL=http://127.0.0.1:4174/` so Playwright omitted its 4173 webServer. Every preview PID started for the proof was explicitly checked before stopping; port 4174 has no remaining listener.

### Mutation checks

- Removed `|| !lobby.isAccountAnonymous()` from the unrecorded callback guard, then ran `npm -w @singedterra/client exec vitest run src/main.hotSeatProgression.test.ts --grep 'signed-in local-human result'`. The runner executed the file (npm did not forward `--grep`); the signed-in exclusion failed as intended: expected 0 handoffs, received 1. The account-state guard was restored.
- Removed the paired generation/client stale-game protections from the unrecorded callback, then ran `npm -w @singedterra/client exec -- vitest run src/main.hotSeatProgression.test.ts -t 'replacement or quit'`. FAIL as intended: expected 0 stale handoffs, received 1. Both protections were restored.

### Scope checks

- `git diff --check` passed.
- Scoped diff secret scan found no private-key, service-role, OpenAI, or GitHub-token patterns.
- No auth, Supabase, schema, migration, Edge Function, progression arithmetic, dependency, asset, network progression, or gameplay-tuning production surface changed.

## Adversarial review

- The adversarial reviewer returned BLOCK on the first package because the browser fixture bypassed the real reporter/account guards, the task-board file was omitted from the plan inventory, duplicate Sign in activation was unproven, and compact-layout non-overlap lacked coverage.
- Correction round 1 resolved every merge-blocking item. The scoped re-review returned CLEAR with no Critical, High, Important, or other merge-blocking finding.

## Reviewer correction round 1/5

### Finding resolution

- **Fixture causality / deterministic exclusion:** Removed the direct anonymous-fixture HUD presentation. Only `victory-anonymous` supplies `e2eMode: null` to the existing reporter; it therefore reports through `Lobby.recordHotSeatMatch`, receives the actual `null` result, and reaches the pre-existing generation, exact-client, terminal-game, and literal-anonymous-account guards. `hotseat` and ordinary `victory` fixtures remain excluded.
- **Duplicate activation:** Added a per-game one-shot latch to the persistent Sign in callback. It is reset for a fresh game and prevents duplicate teardown, Lobby show, and account sign-in transitions after the completed game is retired.
- **Browser overlap:** Added ordered non-overlap checks for the prompt/action against title, score label/value, and victory actions across desktop-fine, pixel-touch, and small-window profiles.
- **Controller state disclosure:** Added `.codearbiter/open-tasks.md` to the plan's Task 1 Files list so the task-state transition is explicitly included in the reviewed scope.

### RED

- `npm -w @singedterra/client exec vitest run src/main.hotSeatProgression.test.ts` — FAIL, 2 expected failures / 10 tests: duplicate Sign in produced a second account transition (`expected 1, received 2`), and `victory-anonymous` did not report (`expected recorded length 1, received 0`).

### GREEN

- `npm -w @singedterra/client exec vitest run src/main.hotSeatProgression.test.ts` — PASS, 10/10.
- `$env:VITE_SUPABASE_URL = 'http://127.0.0.1:4174'; $env:VITE_SUPABASE_ANON_KEY = 'e2e-public-anon-key'; npm run build` — PASS (shared/client typecheck plus production bundle).
- Worktree-owned preview: `node ..\\node_modules\\vite\\bin\\vite.js preview --host 127.0.0.1 --port 4174 --strictPort` from `client/`, PID 125956. `$env:E2E_LIVE_URL = 'http://127.0.0.1:4174/'; npx playwright test e2e/victory-report.spec.ts` — PASS, 9/9 across desktop-fine, pixel-touch, and small-window.
- The 4174 listener ownership was verified as PID 125956 before stopping only that process; subsequent check found no 4174 listener. The unrelated 4173 listener was neither stopped nor reused.

## Post-correction verification

- Focused Vitest: PASS, 42/42.
- Full client coverage: PASS, 1,157 tests; 93.38% statements, 83.83% branches, 87.5% functions, and 95.41% lines.
- `npm run check`: PASS.
- `npm run check:edge`: PASS, 267/267.
- `npm run build`: PASS.
- Production-bundle Playwright proof: PASS, 9/9 across desktop-fine, pixel-touch, and small-window.

## Commit-gate security correction

- The state-free scanner flagged the pre-existing fake password literal in `Lobby.account.test.ts` only because this slice had added unrelated anonymous-account tests to that file.
- No credential was present in the staged hunks. The new tests were moved intact to `Lobby.anonymousAccount.test.ts`, restoring `Lobby.account.test.ts` to the base tree and removing the unrelated fixture from the staged file set.
- This correction narrows the staged scope and requires no security override.
- Replacement focused command: `npm -w @singedterra/client exec -- vitest run src/ui/HUD.victoryReport.test.ts src/ui/Lobby.anonymousAccount.test.ts src/main.hotSeatProgression.test.ts src/client/hotSeatProgression.test.ts` — PASS, 33/33.
- Exact post-move full client coverage: PASS, 1,157/1,157 tests across 149 files; 93.38% statements, 83.83% branches, 87.5% functions, and 95.41% lines.
- Exact post-move state-free secret scan: PASS, `[]`.

## Landing

Pending commit, PR, exact-head hosted CI, merge, Pages deployment, and production verification.

## Coverage-auditor correction round 2/5

### Finding resolution

- **Lobby create-to-sign-in state:** `Lobby.anonymousAccount.test.ts` now opens Account, selects Create account, proves that state is rendered, invokes `showAccountSignIn()`, and then proves the Sign in heading/pressed mode, absent display-name field, and focused email field. Temporarily deleting `this.accountMode = 'sign-in'` made the test fail with `expected 'Create account' to be 'Sign in'`; the line was restored.
- **Anonymous dialog geometry:** the anonymous Playwright test now proves the report panel remains within both overlay and viewport and that document scroll width/height equal the viewport in all three configured projects. A temporary `left: 600px` panel mutation failed all 3 projects at the new right-edge assertion and was restored. Earlier width-only and 220px-offset calibration mutations remained contained and therefore were not accepted as RED evidence.
- **Fresh-game latch reset:** main composition now drives two anonymous games through null reports and Sign in activation, proves duplicate activation is ignored in game one, and proves game two can transition once. Temporarily deleting `progressionSignInHandled = false` failed because the second client was never stopped; the reset was restored.
- **Reporter rejection:** the reporter test explicitly proves a rejected report invokes neither `onRecorded` nor `onUnrecorded`. Temporarily routing `.catch` to `onUnrecorded` failed with one unexpected callback; swallowed rejection behavior was restored.
- **Live-region semantics:** the asynchronously revealed handoff now has `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`; focused unit and browser assertions cover the contract without moving focus.

### RED evidence

- `npm -w @singedterra/client exec -- vitest run src/ui/HUD.victoryReport.test.ts src/ui/Lobby.anonymousAccount.test.ts src/main.hotSeatProgression.test.ts src/client/hotSeatProgression.test.ts` - FAIL, 1 intended failure / 35 tests: the revealed handoff returned `null` for `role` instead of `status`.
- With `this.accountMode = 'sign-in'` temporarily removed: `npm -w @singedterra/client exec -- vitest run src/ui/Lobby.anonymousAccount.test.ts` - FAIL, 1/2: Create account remained visible after the handoff.
- With reporter rejection temporarily routed to `onUnrecorded`: `npm -w @singedterra/client exec -- vitest run src/client/hotSeatProgression.test.ts -t "does not classify a rejected report"` - FAIL, 1 targeted test: expected zero unrecorded callbacks, received one.
- With the per-game latch reset temporarily removed: `npm -w @singedterra/client exec -- vitest run src/main.hotSeatProgression.test.ts -t "allows one sign-in transition again"` - FAIL, 1 targeted test: expected the second client stop once, received zero.
- With `.st-hud__overlay-panel--victory { left: 600px; }` temporarily applied, `$env:VITE_SUPABASE_URL = 'http://127.0.0.1:4174'; $env:VITE_SUPABASE_ANON_KEY = 'e2e-public-anon-key'; npm run build` passed, then `$env:E2E_LIVE_URL = 'http://127.0.0.1:4174/'; npx playwright test e2e/victory-report.spec.ts --grep "anonymous future-match handoff"` - FAIL, 3/3 projects at `panel.right <= overlay.right + 1`. The mutation was restored.

### GREEN evidence

- `npm -w @singedterra/client exec -- vitest run src/ui/HUD.victoryReport.test.ts src/ui/Lobby.anonymousAccount.test.ts src/main.hotSeatProgression.test.ts src/client/hotSeatProgression.test.ts` - PASS, 35/35 across 4 files.
- `$env:VITE_SUPABASE_URL = 'http://127.0.0.1:4174'; $env:VITE_SUPABASE_ANON_KEY = 'e2e-public-anon-key'; npm run build` - PASS, shared/client typecheck and production Vite build.
- Worktree-owned preview command from `client/`: `node ..\\node_modules\\vite\\bin\\vite.js preview --host 127.0.0.1 --port 4174 --strictPort`, PID 128156. `$env:E2E_LIVE_URL = 'http://127.0.0.1:4174/'; npx playwright test e2e/victory-report.spec.ts` - PASS, 9/9 across desktop-fine, pixel-touch, and small-window.
- Final live recheck: port 4174 has no listener; port 4173 remains owned by PID 106692 and was not stopped or reused.

### Exact-final full verification

- `npm run check` — PASS in 132.1 seconds, including strict typecheck and every deterministic harness.
- `npm run coverage:client` — PASS, 1,159/1,159 tests across 149 files; 93.39% statements, 83.83% branches, 87.5% functions, and 95.41% lines.
- `npm run check:edge` — PASS, 267/267.
- `npm run audit:deps` — PASS, 0 vulnerabilities.
- State-free staged secret scan — PASS, `[]`.
