# Compact Pre-game Command Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the compact pre-game command shell legible and remove the duplicate Vehicle Bay plane without changing global stage scaling or behavior.

**Architecture:** Keep the existing fixed stage and `#app.is-compact` breakpoint. Add browser-level visual contracts that measure physical rendered type size using the live app zoom and inspect the card pseudo-element, then make the smallest scoped CSS correction in `Lobby.injectStyle()`.

**Tech Stack:** TypeScript, DOM/CSS, Vitest, Playwright, Vite

## Global Constraints

- Preserve every existing lobby node, callback, accessible name, focus contract, and transport payload.
- Do not change `main.ts` stage scaling or any HUD/gameplay CSS.
- Do not add dependencies, assets, Auth, Supabase, persistence, or migrations.
- Do not read or edit `.codearbiter/sprint-log.md`.

---

### Task 1: Define the physical compact-shell contract

**Files:**
- Modify: `e2e/pregame-command-shell.spec.ts`

**Interfaces:**
- Consumes: existing `gotoLobby`, `isCompact`, Hot Seat and Play Online role locators.
- Produces: real-browser regression assertions for one visual preview plane and minimum rendered typography on both routes.

- [x] **Step 1: Add browser helpers that measure rendered type**

Use `parseFloat(getComputedStyle(element).fontSize) * parseFloat(getComputedStyle(app).zoom || app.style.zoom || '1')` and inspect `getComputedStyle(card, '::before').content`.

- [x] **Step 2: Require Hot Seat and Play Online compact hierarchy to clear the minimums**

Protect route heading, selected mode tab, primary action, setup summary, account
trigger, Vehicle Bay label, and technical part labels. Require `::before` content to
be `none` and the real preview to remain visible.

- [x] **Step 3: Run RED and retain the causal failures**

Run: `npx playwright test e2e/pregame-command-shell.spec.ts --project=small-window --grep "compact command shell"`

Expected: FAIL because the card pseudo-element still exists and protected text renders below 12px/10px.

### Task 2: Implement the scoped compact correction

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Modify: `client/src/main.ts`
- Test: `e2e/pregame-command-shell.spec.ts`

**Interfaces:**
- Consumes: existing `.lobby-card`, `.lobby-preview`, `.lobby-deployment`, `.lobby-tabs`, route-brief, account, and compact selectors.
- Produces: one visual preview plane, compact-only logical font/control sizes,
  and an inverse-zoom command-choice token that satisfy physical minimums.

- [x] **Step 1: Remove the obsolete decorative preview plane**

In the command-preparation rule block, set `#lobby .lobby-card::before { content: none; }` while leaving `.lobby-preview` and its pseudo-terrain layers unchanged.

- [x] **Step 2: Raise compact operational type and action sizes**

Add narrowly grouped `#app.is-compact #lobby` rules for the protected route, tab,
summary, account, action, preview identity, and technical-label selectors. Use logical
sizes derived from the existing compact threshold so rendered results satisfy the
12px operational / 10px technical minimums at supported projects.

- [x] **Step 3: Keep the compact grid contained**

Adjust only compact spacing or hidden subordinate copy when necessary; do not remove
actions, preview context, progressive disclosure, or the two-column composition.

- [x] **Step 4: Run focused GREEN**

Run: `npx playwright test e2e/pregame-command-shell.spec.ts --project=small-window --project=pixel-touch --grep "compact command shell"`

Expected: PASS on both supported compact projects.

### Task 3: Refactor, mutation-proof, and deliver

**Files:**
- Modify: `.codearbiter/reports/2026-08-10-pregame-compact-command-legibility-sprint-evidence.md`
- Modify through helper: `.codearbiter/open-tasks.md`

**Interfaces:**
- Consumes: final implementation and all test evidence.
- Produces: exact review package and completed task-board state.

- [x] **Step 1: Run the complete pre-game browser matrix and focused unit suite**

Run the full `e2e/pregame-command-shell.spec.ts` matrix and relevant Lobby unit tests.

- [x] **Step 2: Prove causal mutations**

Temporarily restore `content: ''` for the duplicate plane and lower one protected
compact size; each mutation must fail the focused browser oracle. Revert mutations
and rerun GREEN.

- [x] **Step 3: Run repository gates**

Run client tests and coverage, `npm run check`, `npm run check:edge`, `npm run build`,
`npm run audit:deps`, and the staged secret scan.

- [x] **Step 4: Dispatch one adversarial final-diff review**

Package this spec, this plan, sprint evidence, tests, and exact final diff. Resolve
every Critical, High, and other merge-blocking finding, then rerun exact-final review.

- [ ] **Step 5: Complete and deliver**

Mark `ux.pregame.0004` done through `$ca-task`, commit through `$ca-commit`, open the
PR through `$ca-pr`, require exact-head hosted CI green, merge under standing authority,
verify Pages provenance and the production causal journey, and persist a receipt.

## Self-review

- Every acceptance criterion maps to Task 1 browser assertions and Task 2 CSS.
- No placeholders, new interfaces, backend work, or global-stage changes are present.
- The plan preserves the prior progressive-disclosure and overlay-containment slices.
