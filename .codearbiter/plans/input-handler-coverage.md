# InputHandler Behavioral Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:test-driven-development` and
> `superpowers:subagent-driven-development`; codeArbiter owns the final commit.
> **Status:** APPROVED — user approved 2026-07-22.

**Goal:** Replace InputHandler's 0% Vitest coverage with deterministic, mutation-sensitive public-contract tests.

**Architecture:** One jsdom Vitest file drives the real `InputHandler` through its public methods and
DOM listeners. Characterization tests are validated with temporary production mutations, then the
production source is restored byte-for-byte.

**Tech stack:** TypeScript, Vitest, jsdom, existing npm workspace; no new dependency.

## Global constraints

- Modify only the new test, this spec/plan, and append-only sprint/governance receipts.
- Do not add a test-only export, private-state assertion, timer wait, network call, or production seam.
- Use cancelable synthetic events and assert emitted `PlayerAction` values plus `defaultPrevented`.
- Use the real implemented weapon order from `WEAPONS`; do not duplicate the full roster in fixtures.
- Mock only element layout because jsdom does not perform layout.
- Each mutation proof changes one production invariant, observes the focused suite fail for the
  intended assertion, and restores the exact original source before the next mutation.
- `client/src/input/InputHandler.ts`, package manifests, and `package-lock.json` finish byte-identical
  to `origin/main`.
- codeArbiter owns commits; workers leave changes uncommitted.

## File map

- Create `client/src/input/InputHandler.test.ts`.
- Modify approval/status receipts in this spec and plan only if required by the gate.
- Append decisions and verification receipts to `.codearbiter/sprint-log.md`.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | InputHandler public-contract tests and mutation evidence | — | focused RED mutations and GREEN suite | ACCEPTED |
| T2 | Review closure, governed commit, PR, and green CI | T1 | full matrix, review fleet, commit/PR gates | IN PROGRESS |

---

### Task 1: InputHandler public-contract tests

**Files:**

- Create: `client/src/input/InputHandler.test.ts`

- [ ] **Step 1: Establish fixtures and keyboard lifecycle coverage**

Create a real `HTMLElement`, an action spy, cancelable keyboard dispatch helper, and cleanup that
detaches the handler and removes the element. Prove duplicate attach suppression; ArrowLeft/Right
and ArrowUp/Down absolute actions; configurable steps; cancellation for every handled key; unknown
key pass-through; and idempotent detach.

- [ ] **Step 2: Cover public touch/state and weapon behavior**

Use out-of-range seeds and `setAim()` to prove clamps and no redundant bound emissions. Prove inward
steps, `nextWeapon()` stable progression, `setWeapon()` reseeding, shield wrapping, and `triggerFire()`
dispatch for shield and a projectile weapon. Exercise Space, legacy Spacebar, Enter, Tab, `q`, and `Q`.

- [ ] **Step 3: Cover mouse geometry and listener cleanup**

Mock the target rectangle as `{ left: 10, top: 20, width: 400, height: 300 }` and set tank logical
position `(600, 300)`. Dispatch a rightward point at `(303.3333333333, 170)` to expect angle 0 and
power 100, then an upward point at `(210, 30)` to expect angle 90. Prove invalid starts are ignored,
mouseup stops later moves, detach during a drag removes window listeners, and zero-sized bounds emit
nothing.

- [ ] **Step 4: Prove characterization tests RED against independent mutations**

Apply and restore these mutations one at a time, running only the focused file after each:

1. remove `attach()`'s `this.attached = true` assignment, proving detach cannot leak the listener;
2. make ArrowLeft use the negative angle step;
3. remove the redundant angle-emission guard;
4. remove detach's in-flight drag cleanup;
5. remove `CANVAS_WIDTH` scaling from the mouse x coordinate.

Record the failing assertion for each. Restore `InputHandler.ts` exactly and rerun focused GREEN.
Also record that removing only the duplicate-attach guard is behaviorally equivalent under the DOM's
same-callback listener deduplication; do not weaken the public-contract test with a registration spy.

- [ ] **Step 5: Run task verification and request fresh task review**

```powershell
npm -w @singedterra/client exec vitest run src/input/InputHandler.test.ts
npm -w @singedterra/client run typecheck
git diff --check
```

Review must return both spec compliance and code quality approval. Resolve every Critical/Important
finding and re-review.

---

### Task 2: Whole-branch verification and landing

- [ ] **Step 1: Run final whole-diff review and coverage audit**

Provide the base-to-worktree diff to fresh reviewers. Zero Critical/Important and zero
Critical/High/Medium coverage findings may remain before landing.

- [ ] **Step 2: Run the fresh full matrix**

```powershell
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
git diff --exit-code origin/main -- client/src/input/InputHandler.ts package.json client/package.json package-lock.json
```

- [ ] **Step 3: Append receipts and run `$ca-commit`**

Record SMARTS, mutation REDs, GREEN counts, reviews, and scope hashes. Stage exact intended paths,
run the governed commit gate, and use `Refs #134` rather than an auto-closing footer.

- [ ] **Step 4: Run `$ca-pr`, PR coverage audit, and `$ca-watch`**

Open a ready PR referencing #134, resolve any PR-level coverage findings, push only reviewed fixes,
and watch all available checks to green. Do not merge or deploy.
