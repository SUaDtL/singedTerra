# Portrait Phone Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Status:** APPROVED — user approved 2026-07-21.

**Goal:** Replace the pointer-based portrait overlay heuristic with an exact phone-width boundary and prove it in production Chromium.

**Architecture:** CSS remains the behavior owner. A focused Playwright spec creates explicit browser contexts for phone, touchscreen-laptop, boundary, and landscape cases, then asserts the computed visibility of the existing overlay.

**Tech Stack:** CSS media queries, Playwright/Chromium, existing Vite production preview; no new dependency.

## Global Constraints

- The activation query is exactly `(orientation: portrait) and (max-width: 480px)`.
- `480px` warns; `481px` does not.
- Pointer type does not participate in the activation rule.
- Existing overlay markup, copy, animation, and stacking remain unchanged.
- No TypeScript application, shared engine, Supabase, dependency, lockfile, or workflow change.
- Task workers leave changes uncommitted; codeArbiter owns one landing commit.

## File map

- Create `e2e/portrait-gate.spec.ts`: real-browser computed-visibility contract.
- Modify `client/src/style.css`: exact portrait and width media query plus accurate comments.
- Modify `client/index.html`: document the inclusive width boundary beside the existing overlay.
- Modify sprint spec/plan status and append decisions/receipts to `.codearbiter/sprint-log.md`.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | Browser regression contract and minimal CSS correction | — | focused Playwright RED/GREEN | ACCEPTED |
| T2 | Review closure, full matrix, commit, PR, and green CI | T1 | review, commit, PR, hosted checks | IN PROGRESS |

---

### Task 1: Browser regression contract and CSS correction

**Files:**

- Create: `e2e/portrait-gate.spec.ts`
- Modify: `client/src/style.css`
- Modify: `client/index.html`

**Interfaces:**

- Consumes the existing `#portrait-warn` element.
- Produces one CSS-only viewport policy with no application runtime API.
- Produces a focused Playwright contract that later reviews and CI can invoke directly.

- [x] **Step 1: Write the failing real-browser regression tests**

Create `e2e/portrait-gate.spec.ts`:

```ts
import { test, expect, type Browser } from '@playwright/test';

async function portraitWarningDisplay(
  browser: Browser,
  viewport: { width: number; height: number },
  hasTouch: boolean,
): Promise<string> {
  const context = await browser.newContext({ viewport, hasTouch });
  try {
    const page = await context.newPage();
    await page.goto('/');
    return await page.locator('#portrait-warn').evaluate((element) =>
      getComputedStyle(element).display,
    );
  } finally {
    await context.close();
  }
}

test.describe('portrait phone gate', () => {
  test('warns at phone width independently of pointer type', async ({ browser }) => {
    await expect(portraitWarningDisplay(browser, { width: 393, height: 851 }, true))
      .resolves.toBe('flex');
    await expect(portraitWarningDisplay(browser, { width: 393, height: 851 }, false))
      .resolves.toBe('flex');
  });

  test('does not block a coarse-pointer laptop-sized portrait viewport', async ({ browser }) => {
    await expect(portraitWarningDisplay(browser, { width: 700, height: 900 }, true))
      .resolves.toBe('none');
  });

  test('uses an inclusive 480px boundary', async ({ browser }) => {
    await expect(portraitWarningDisplay(browser, { width: 480, height: 900 }, true))
      .resolves.toBe('flex');
    await expect(portraitWarningDisplay(browser, { width: 481, height: 900 }, true))
      .resolves.toBe('none');
  });

  test('never warns in landscape', async ({ browser }) => {
    await expect(portraitWarningDisplay(browser, { width: 851, height: 393 }, true))
      .resolves.toBe('none');
  });
});
```

- [x] **Step 2: Run the focused test and prove RED**

```powershell
npx playwright test e2e/portrait-gate.spec.ts --project=desktop-fine
```

Expected: nonzero. The current coarse-pointer rule incorrectly shows the overlay at `700x900` and
`481x900`, while the fine-pointer `393x851` case incorrectly hides it.

- [x] **Step 3: Implement the minimal CSS policy**

In `client/src/style.css`, retain all overlay presentation declarations and replace only the
activation comment/query:

```css
/* Activate only when a portrait viewport is phone-narrow. Pointer type is irrelevant. */
@media (orientation: portrait) and (max-width: 480px) {
  #portrait-warn { display: flex; }
}
```

Update the preceding block comment and the `client/index.html` overlay comment to state that `480px`
is inclusive and `481px` remains playable. Do not alter visible copy or markup.

- [x] **Step 4: Run the focused test to GREEN**

```powershell
npx playwright test e2e/portrait-gate.spec.ts --project=desktop-fine
```

Expected: 4 passed, 0 failed.

- [x] **Step 5: Run task verification**

```powershell
npm run typecheck
npm run test:e2e
git diff --check -- client/src/style.css client/index.html e2e/portrait-gate.spec.ts
```

Expected: all commands exit 0; the complete existing browser matrix remains green.

- [x] **Step 6: Request two-pass task review**

The spec reviewer checks all five viewport/pointer obligations and the exact inclusive threshold.
The quality reviewer must reject device heuristics, global Playwright-project expansion, visible-copy
changes, or tests that inspect source text instead of computed browser behavior.

---

### Task 2: Review closure and green pull request

**Files:**

- Modify: `.codearbiter/specs/portrait-phone-gate.md`
- Modify: `.codearbiter/plans/portrait-phone-gate.md`
- Append only: `.codearbiter/sprint-log.md`

**Interfaces:**

- Consumes T1's reviewed diff and browser proof.
- Produces one governed commit and one open, unmerged PR referencing #108.

- [x] **Step 1: Run whole-diff review and coverage audit**

Zero Critical/Important or CRITICAL/HIGH findings may remain. Review must confirm the test would fail
if pointer gating returned or if the boundary moved to `479px` or `481px`.

- [x] **Step 2: Run the complete final matrix**

```powershell
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

- [x] **Step 3: Append SMARTS and verification receipts**

Record issue selection, approach choice, RED/GREEN evidence, review outcomes, exact test counts, and
the absence of dependency/lockfile changes without rewriting prior sprint-log lines.

- [ ] **Step 4: Run `$ca-commit`**

Stage exact paths only. Classification is `fix(client)`. The commit gate must clear tests, strict
typecheck, secret scan, behavioral proof, and complete staged-diff review.

- [ ] **Step 5: Run `$ca-pr` and `$ca-watch`**

Open a PR that references #108, never merge it, and watch every available check to green. Preserve
the worktree for PR feedback.
