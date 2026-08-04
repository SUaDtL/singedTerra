# Authenticated Account XP and Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show authenticated players server-derived XP and level progress based on their persisted matches and recorded wins.

**Architecture:** Extend the existing `account_summary` read boundary with a pure version-1 progression calculation after all Auth-scoped match consistency checks pass. The client strictly validates both the exact response shape and the version-1 arithmetic, then the existing account panel renders semantic level and XP values while preserving nullable-summary degradation.

**Tech Stack:** TypeScript, Deno Edge Functions, Supabase Auth/PostgREST, Vitest/jsdom, Playwright, Vite.

## Global Constraints

- Version 1 grants 100 XP per linked completed match and another 100 XP per recorded win.
- Level 1 starts at 0 cumulative XP; every 500 XP advances one level.
- The response must identify `progressionVersion: 1` and expose cumulative plus current-level progress.
- No database migration, progression write, ledger, reward, unlock, rank, leaderboard, dependency, secret, crypto, or spending.
- No client-supplied identity, outcome, XP, level, or cumulative total.
- Preserve anonymous play, seat-token authorization, match claiming, generic errors, safe logs, and profile/sign-out availability when the optional summary fails.
- Work test-first and do not stage or delete `.codearbiter/open-tasks.md.lock`.

---

### Task 1: Server-owned version-1 progression calculation

**Files:**
- Modify: `supabase/functions/account_summary/account_summary.test.ts`
- Modify: `supabase/functions/account_summary/index.ts`
- Modify: `scripts/checks/profile_identity.mjs`
- Modify: `.codearbiter/security-controls.md`

**Interfaces:**
- Consumes: validated `matchesPlayed: number` and `wins: number` from the existing Auth-derived participant and score read.
- Produces: `deriveProgression(matchesPlayed: number, wins: number): AccountProgression`, where `AccountProgression` contains `progressionVersion`, `totalXp`, `level`, `levelXp`, and `nextLevelXp`.

- [x] **Step 1: Write focused failing Edge tests**

Add response assertions for these exact cases:

```ts
{ matchesPlayed: 0, wins: 0,
  progressionVersion: 1, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500 }
{ matchesPlayed: 4, wins: 1,
  progressionVersion: 1, totalXp: 500, level: 2, levelXp: 0, nextLevelXp: 500 }
{ matchesPlayed: 8, wins: 2,
  progressionVersion: 1, totalXp: 1000, level: 3, levelXp: 0, nextLevelXp: 500 }
```

Keep the zero-link assertion that no score query runs. Add a pure-helper boundary test for total XP 499 by calling the helper with an explicitly validated test input that reaches the boundary, or export a cumulative-XP-to-level helper if integer match rewards cannot naturally produce 499.

- [x] **Step 2: Run Edge tests and record RED**

Run: `npx deno test supabase/functions/account_summary/account_summary.test.ts`

Expected: FAIL because the response lacks the five progression fields and helper.

- [x] **Step 3: Implement named constants and pure calculation**

Use this contract:

```ts
const PROGRESSION_VERSION = 1
const MATCH_XP = 100
const WIN_XP = 100
const XP_PER_LEVEL = 500

export interface AccountProgression {
  progressionVersion: 1
  totalXp: number
  level: number
  levelXp: number
  nextLevelXp: number
}

export function progressionFromTotalXp(totalXp: number): AccountProgression {
  return {
    progressionVersion: PROGRESSION_VERSION,
    totalXp,
    level: Math.floor(totalXp / XP_PER_LEVEL) + 1,
    levelXp: totalXp % XP_PER_LEVEL,
    nextLevelXp: XP_PER_LEVEL,
  }
}

export function deriveProgression(matchesPlayed: number, wins: number): AccountProgression {
  return progressionFromTotalXp(matchesPlayed * MATCH_XP + wins * WIN_XP)
}
```

Spread the result into both zero-link and populated successful responses. Do not alter queries, authentication, logging, or failure responses.

- [x] **Step 4: Run GREEN and mutation proofs**

Run: `npx deno test supabase/functions/account_summary/account_summary.test.ts`

Expected: PASS.

Temporarily change the win bonus and the level divisor one at a time. Each mutation must fail a named formula or boundary test. Restore the implementation and rerun GREEN.

- [x] **Step 5: Pin the source and security contract**

Extend `profile_identity.mjs` and `security-controls.md` to require the versioned server-derived formula, forbid a body-owned XP/level path, and retain the current casual-result trust ceiling. Run `node scripts/checks/profile_identity.mjs` and expect PASS.

### Task 2: Strict client progression read model

**Files:**
- Modify: `client/src/client/AccountSession.test.ts`
- Modify: `client/src/client/AccountSession.ts`

**Interfaces:**
- Consumes: the exact seven-key `account_summary` response.
- Produces: `AccountSummary` with `matchesPlayed`, `wins`, `progressionVersion`, `totalXp`, `level`, `levelXp`, and `nextLevelXp`.

- [x] **Step 1: Write failing validation tests**

Change valid fixtures to the complete version-1 response. Add table-driven rejection for an unknown version; missing or extra key; fractional, negative, `NaN`, or infinite value; `wins > matchesPlayed`; `totalXp !== matchesPlayed * 100 + wins * 100`; incorrect level; incorrect current-level XP; and `nextLevelXp !== 500`.

- [x] **Step 2: Run client tests and record RED**

Run: `npm run test:client -- src/client/AccountSession.test.ts`

Expected: FAIL because `AccountSummary` and `accountSummary()` accept only the old two-key shape.

- [x] **Step 3: Implement exact arithmetic validation**

Extend `AccountSummary`, require exactly seven response keys, require safe nonnegative integers, require version 1, and recompute:

```ts
const expectedTotalXp = matchesPlayed * 100 + wins * 100
const expectedLevel = Math.floor(expectedTotalXp / 500) + 1
const expectedLevelXp = expectedTotalXp % 500
```

Return null unless every received value equals its expected value and `nextLevelXp === 500`. Preserve the five-second timeout and profile-preserving catch path unchanged.

- [x] **Step 4: Run GREEN and mutation proof**

Run: `npm run test:client -- src/client/AccountSession.test.ts`

Expected: PASS.

Temporarily remove the total-XP consistency comparison. The malformed-total test must fail. Restore it and rerun GREEN.

### Task 3: Accessible level and XP presentation

**Files:**
- Modify: `client/src/ui/AccountPanelView.test.ts`
- Modify: `client/src/ui/AccountPanelView.ts`
- Modify: `client/src/ui/Lobby.account.test.ts` only where typed fixtures require it
- Modify: `client/src/ui/Lobby.ts` only if compact geometry needs adjustment
- Modify: `e2e/account-progression-summary.spec.ts`

**Interfaces:**
- Consumes: a validated non-null `AccountSummary`.
- Produces: semantic account-panel labels for `Matches`, `Recorded wins`, `Level`, and `XP`, where XP text is `<levelXp> / <nextLevelXp>`.

- [x] **Step 1: Write failing DOM and geometry tests**

Require one semantic `dt`/`dd` pair per label, exact Level text, exact `200 / 500` XP text for a representative fixture, no ids in either rendered account subtree, and unchanged non-alert fallback when the summary is null. Extend both compact Playwright profiles to assert readable font size, containment, and no pair overlap with four values.

- [x] **Step 2: Run UI tests and record RED**

Run: `npm run test:client -- src/ui/AccountPanelView.test.ts src/ui/Lobby.account.test.ts`

Run: `npx playwright test e2e/account-progression-summary.spec.ts --project=small-window --project=pixel-touch`

Expected: unit and browser assertions FAIL because Level and XP are absent.

- [x] **Step 3: Render the two new values**

Append these entries to the existing semantic value list:

```ts
['Level', summary.level],
['XP', `${summary.levelXp} / ${summary.nextLevelXp}`],
```

Adjust only the existing account-progress layout if four values do not fit the compact profiles. Do not add a custom progress bar, ids, animation, gameplay overlay, or a new panel.

- [x] **Step 4: Run GREEN and text mutation proof**

Rerun the focused unit and Playwright commands and expect PASS. Temporarily change the `XP` label or separator; the DOM test must fail. Restore and rerun GREEN.

### Task 4: Governed review, delivery, and continuation

**Files:**
- Modify: `.codearbiter/sprint-log.md` by append only
- Modify: `.codearbiter/open-tasks.md` only through `$ca-task`
- Read/package: `.codearbiter/specs/account-xp-levels.md`
- Read/package: `.codearbiter/plans/account-xp-levels.md`

**Interfaces:**
- Consumes: the completed server, client, UI, governance, RED/GREEN, and mutation evidence.
- Produces: one exact-diff adversarial verdict, a green PR, deployed production, and the next SMARTS-selected progression task.

- [x] **Step 1: Run full local verification**

Run `npm run test:client`, `npm run check:edge`, `npm run check`, `npm run build`, `npm run audit:deps`, full Playwright, `git diff --check`, and the state-free secret scan. Every command must pass; raw credential findings must be zero.

- [x] **Step 2: Assemble one adversarial review package**

Include the approved spec, this plan, append-only sprint log, every RED/GREEN and mutation receipt, focused/full test outputs, security-control delta, and complete final diff. Require reviewers for auth/security, coverage, and architecture. Resolve every Critical, High, and other merge-blocking finding, then obtain exact-final-diff re-clear.

- [x] **Step 3: Commit and open a ready PR**

Run `$ca-commit` and `$ca-pr`; never stage `.codearbiter/open-tasks.md.lock`. Require all hosted checks green on the exact reviewed PR head.

- [x] **Step 4: Merge, deploy, and verify**

Log the standing-authority merge override, commit its audit-only line, obtain exact-head adversarial re-clear, and require hosted checks green again. Squash merge with an expected-head guard. Deploy `account_summary` through the linked local Supabase CLI, require ACTIVE plus missing-auth `401` and anonymous `list_rooms` `200`, then require exact-main Pages provenance, CI, CodeQL, and live-render smoke green.

- [x] **Step 5: Close and honor run-stop steering**

Mark `mvp2.progression.0003` done through `$ca-task` and keep `mvp2.identity.0001` in progress. The user explicitly superseded automatic continuation for this run: reconcile the three pre-existing PRs, then stop without selecting another improvement slice.
