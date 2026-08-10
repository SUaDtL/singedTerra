# Pre-game Commander Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep full persistent commander identity and the next XP milestone legible in the pre-game masthead at every supported layout.

**Architecture:** Extend the existing `AccountPanelView` collapsed authenticated composition with semantic name, level, and milestone elements. Keep `Lobby` as the CSS/layout owner and keep the stage-owned account dialog unchanged. Unit tests own semantic behavior; Playwright owns scaled geometry and clipping behavior.

**Tech Stack:** TypeScript, DOM APIs, Vitest with jsdom, CSS embedded by `Lobby`, Playwright.

## Global Constraints

- Work test-first. No production code before a causal failing test.
- Change client account presentation only.
- Preserve the existing account dialog, Auth/session behavior, progression arithmetic, and account action callbacks.
- Add no dependencies and make no Supabase, migration, gameplay, or action-protocol changes.
- Do not read or rewrite malformed `.codearbiter/sprint-log.md`; persist sprint evidence in the spec and report.

---

### Task 1: Dossier semantics

**Files:**
- Modify: `client/src/ui/AccountPanelView.test.ts`
- Modify: `client/src/ui/AccountPanelView.ts`

**Interfaces:**
- Consumes: authenticated `AccountState.profile.displayName` and server-derived `AccountSummary`.
- Produces: `.account-panel__commander-name`, `.account-panel__commander-level`, and `.account-panel__record-milestone` inside the existing disclosure/record contract.

- [ ] **Step 1: Write the failing component test**

  Extend the collapsed authenticated test to require literal `Ranger`, `Level 3`, and `300 XP to Level 4` elements, while retaining meter value `200`, max `500`, the existing progress accessible name, click behavior, and `aria-expanded=false`.

- [ ] **Step 2: Verify RED**

  Run `npm run test:client -- --run client/src/ui/AccountPanelView.test.ts` and confirm failure because the three dossier selectors do not exist.

- [ ] **Step 3: Implement the semantic dossier**

  Build separate spans for the commander name and level, add the exact remaining-XP milestone from the same server-derived summary, and append them inside the existing single disclosure and record.

- [ ] **Step 4: Verify GREEN and mutations**

  Re-run the focused test. Temporarily remove the milestone and level append operations one at a time and confirm the test fails, then restore GREEN.

### Task 2: Responsive containment

**Files:**
- Modify: `e2e/account-progression-summary.spec.ts`
- Modify: `client/src/ui/Lobby.ts`

**Interfaces:**
- Consumes: the Task 1 dossier classes and the existing `#app.is-compact` stage-scale contract.
- Produces: a wrap-capable masthead dossier with no clipped text and no overlap with adjacent pre-game regions.

- [ ] **Step 1: Write the failing browser oracle**

  Update the authenticated fixture to mirror the Task 1 production structure. Require every text range for a 24-character commander, `Level 3`, and `300 XP to Level 4` to stay inside its owning element; require `text-overflow` not to be `ellipsis`, `white-space` not to be `nowrap`, and preserve non-overlap with the Vehicle Bay and deployment content.

- [ ] **Step 2: Verify RED**

  Run `npx playwright test e2e/account-progression-summary.spec.ts` and confirm the compact projects fail because the current trigger enforces nowrap plus ellipsis.

- [ ] **Step 3: Implement responsive dossier CSS**

  Replace the collapsed record's single-line clipping with a two-column identity/level row and a meter/milestone row. Permit the commander name to wrap anywhere, keep level and milestone readable, and use existing tactical color/type/border tokens.

- [ ] **Step 4: Verify GREEN and mutations**

  Re-run the focused browser file. Temporarily restore `white-space: nowrap` and `text-overflow: ellipsis` independently and confirm the oracle fails, then restore GREEN.

### Task 3: Sprint landing evidence

**Files:**
- Create: `.codearbiter/reports/2026-08-10-pregame-commander-dossier-sprint-evidence.md`
- Modify: `.codearbiter/open-tasks.md` through `taskwrite.py` only

**Interfaces:**
- Consumes: final code/tests, RED/GREEN transcripts, mutation outcomes, full verification, and reviewer findings.
- Produces: durable sprint evidence and completed task `ux.pregame.0006`.

- [ ] **Step 1: Run complete verification**

  Run focused tests, `npm run check`, `npm run test:client`, `npm run check:edge`, `npm run coverage:client`, `npm run build`, `npm run test:e2e`, `git diff --check`, dependency audit, and state-free secret scan.

- [ ] **Step 2: Dispatch the adversarial final-package review**

  Provide the reviewer with the spec, this plan, report/sprint evidence, tests, and exact final diff. Resolve every Critical, High, and merge-blocking finding test-first, then rerun the reviewer against the corrected exact package.

- [ ] **Step 3: Persist the report and complete the task**

  Record SMARTS, RED/GREEN, mutation, reviewer, and matrix evidence. Use `taskwrite.py done -- ux.pregame.0006` only after all obligations pass.

- [ ] **Step 4: Governed landing**

  Run commit-gate, coverage audit, `$ca-pr`, exact-head hosted CI, authorized merge, Pages deployment, production health/provenance, and the focused live browser matrix.

## Self-review

- Spec coverage: every acceptance criterion maps to Task 1 semantics, Task 2 geometry, or Task 3 verification.
- Placeholder scan: no TBD, TODO, or deferred implementation instruction remains.
- Type consistency: all class names produced in Task 1 are the selectors consumed in Task 2.
- Scope check: one client-only presentation slice with no independent subsystem bundled in.
