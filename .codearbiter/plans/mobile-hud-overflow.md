# Compact-Touch HUD Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Status:** APPROVED — user approved spec and plan on 2026-07-20.

**Goal:** Make the landscape-phone HUD fit on first visit while preserving explicit arsenal preferences and desktop behavior.

**Architecture:** Put the initial-state rule in a pure helper, keep browser media-query and persistence ownership in `HUD`, and prove the visible result with both Vitest and the existing Chromium viewport matrix.

**Tech Stack:** TypeScript 5.5, Vitest/jsdom, Playwright/Chromium, existing HUD DOM/CSS; no new dependency.

## Global Constraints

- The compact-touch query is exactly `(pointer: coarse) and (max-height: 700px)`.
- Saved `0` means expanded and saved `1` means collapsed; both override responsive defaults.
- A manual toggle becomes explicit and later media-query changes cannot override it.
- Desktop-fine and fine-pointer compact windows retain the expanded first-visit default.
- No engine, network, Supabase, physics, input mapping, package version, or lockfile change.
- Tests must inspect computed Chromium geometry for the Pixel project.
- codeArbiter owns commits; task workers do not commit independently.

## File map

- Create `client/src/ui/arsenalPreference.ts`: pure stored-value and responsive-default resolution.
- Create `client/src/ui/arsenalPreference.test.ts`: exhaustive policy matrix.
- Modify `client/src/ui/HUD.ts`: media-query lifecycle, explicit-preference ownership, hint DOM, and state reflection.
- Modify `client/src/ui/HUD.arsenal.test.ts`: browser-boundary and accessibility behavior.
- Modify `client/src/style.css`: compact-touch scroll affordance.
- Modify `e2e/hud-layout.spec.ts`: first-visit fit, saved override, toggle, and rotation geometry.
- Modify sprint spec/plan status and append decisions/receipts to `.codearbiter/sprint-log.md`.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | Pure preference policy and HUD responsive lifecycle | — | focused Vitest | ACCEPTED |
| T2 | Compact-touch affordance and real-browser geometry | T1 | Pixel plus full Playwright matrix | ACCEPTED |
| T3 | Full verification, review closure, commit, and PR | T2 | complete gate matrix | ACCEPTED |

---

### Task 1: Preference policy and responsive HUD lifecycle

**Files:**

- Create: `client/src/ui/arsenalPreference.ts`
- Create: `client/src/ui/arsenalPreference.test.ts`
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.arsenal.test.ts`

**Interfaces:**

- Produces `COMPACT_TOUCH_QUERY` and `resolveInitialArsenalCollapsed(storedValue, compactTouch)`.
- `HUD` consumes the helper and owns browser APIs, storage, and DOM state.
- T2 relies on `.st-hud__strip--collapsed` and `aria-expanded` reflecting the resolved state.

- [x] **Step 1: Write the failing pure policy tests**

Create `client/src/ui/arsenalPreference.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COMPACT_TOUCH_QUERY, resolveInitialArsenalCollapsed } from './arsenalPreference';

describe('resolveInitialArsenalCollapsed', () => {
  it('uses the compact-touch default only when no valid preference exists', () => {
    expect(resolveInitialArsenalCollapsed(null, true)).toBe(true);
    expect(resolveInitialArsenalCollapsed(null, false)).toBe(false);
    expect(resolveInitialArsenalCollapsed('unexpected', true)).toBe(true);
    expect(resolveInitialArsenalCollapsed('unexpected', false)).toBe(false);
  });

  it('lets either saved preference override the viewport', () => {
    expect(resolveInitialArsenalCollapsed('1', false)).toBe(true);
    expect(resolveInitialArsenalCollapsed('1', true)).toBe(true);
    expect(resolveInitialArsenalCollapsed('0', false)).toBe(false);
    expect(resolveInitialArsenalCollapsed('0', true)).toBe(false);
  });

  it('pins the compact-touch media query contract', () => {
    expect(COMPACT_TOUCH_QUERY).toBe('(pointer: coarse) and (max-height: 700px)');
  });
});
```

- [x] **Step 2: Run the pure tests and prove RED**

Run:

```powershell
npm -w @singedterra/client exec vitest run src/ui/arsenalPreference.test.ts
```

Expected: exit non-zero because `arsenalPreference.ts` does not exist.

- [x] **Step 3: Implement the minimal pure policy**

Create `client/src/ui/arsenalPreference.ts`:

```ts
export const COMPACT_TOUCH_QUERY = '(pointer: coarse) and (max-height: 700px)';

export function resolveInitialArsenalCollapsed(
  storedValue: string | null,
  compactTouch: boolean,
): boolean {
  if (storedValue === '1') return true;
  if (storedValue === '0') return false;
  return compactTouch;
}
```

- [x] **Step 4: Run the pure tests to GREEN**

Run the Step 2 command.

Expected: 3 tests pass.

- [x] **Step 5: Add failing HUD integration tests**

Extend the Vitest import with `afterEach` and `vi`, then add this controllable media-query seam:

```ts
interface MediaController {
  dispatch(matches: boolean): void;
}

function installCompactTouchMedia(initial = false): MediaController {
  let current = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    media: '(pointer: coarse) and (max-height: 700px)',
    get matches() { return current; },
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  return {
    dispatch(matches) {
      current = matches;
      const event = { matches, media: media.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});
```

Add these tests to the collapsible describe block:

```ts
it('defaults compact touch to collapsed when storage has no preference', () => {
  localStorage.removeItem('st_arsenal_collapsed');
  installCompactTouchMedia(true);
  const { root, hud, state } = mount();
  hud.update(state);
  expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
    .toBe(true);
  expect(root.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-expanded')).toBe('false');
});

it('keeps a saved expanded preference on compact touch', () => {
  localStorage.setItem('st_arsenal_collapsed', '0');
  installCompactTouchMedia(true);
  const { root, hud, state } = mount();
  hud.update(state);
  expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
    .toBe(false);
});

it('follows media changes until the player toggles explicitly', () => {
  localStorage.removeItem('st_arsenal_collapsed');
  const media = installCompactTouchMedia(false);
  const { root, hud, state } = mount();
  hud.update(state);
  const strip = root.querySelector('.st-hud__strip')!;
  const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
  media.dispatch(true);
  expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
  media.dispatch(false);
  expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
  media.dispatch(true);
  expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
  toggle.click();
  media.dispatch(false);
  media.dispatch(true);
  expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
});
```

Expected pre-implementation result: the compact-touch and media-change assertions fail.

- [x] **Step 6: Implement the HUD browser boundary**

In `HUD.ts`:

```ts
import {
  COMPACT_TOUCH_QUERY,
  resolveInitialArsenalCollapsed,
} from './arsenalPreference';

function readStoredArsenalPreference(): string | null {
  try {
    return localStorage.getItem(ARSENAL_COLLAPSED_KEY);
  } catch {
    return null;
  }
}
```

Add fields that distinguish implicit responsive state from explicit user choice:

```ts
private arsenalPreferenceExplicit = false;
private compactTouchMedia: MediaQueryList | null = null;
```

During `buildArsenal()`, resolve and subscribe once:

```ts
const stored = readStoredArsenalPreference();
this.arsenalPreferenceExplicit = stored === '0' || stored === '1';
this.compactTouchMedia = typeof matchMedia === 'function'
  ? matchMedia(COMPACT_TOUCH_QUERY)
  : null;
this.stripCollapsed = resolveInitialArsenalCollapsed(
  stored,
  this.compactTouchMedia?.matches ?? false,
);
this.compactTouchMedia?.addEventListener('change', (event) => {
  if (this.arsenalPreferenceExplicit) return;
  this.stripCollapsed = event.matches;
  this.applyStripCollapsed();
});
```

At the start of `toggleStripCollapsed()`, set `this.arsenalPreferenceExplicit = true` before
persisting the new value.

- [x] **Step 7: Run focused client tests and typecheck**

```powershell
npm -w @singedterra/client exec vitest run src/ui/arsenalPreference.test.ts src/ui/HUD.arsenal.test.ts
npm -w @singedterra/client run typecheck
```

Expected: all focused tests and typecheck pass.

- [x] **Step 8: Two-pass review and fresh verification**

Spec review checks AC-2, AC-3, media-query fallback, and persistence precedence. Quality review checks
listener cardinality, no per-frame browser query, storage exception handling, and test isolation.
Run the Step 7 commands fresh before marking T1 `ACCEPTED`.

---

### Task 2: Compact-touch affordance and real-browser geometry

**Files:**

- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/style.css`
- Modify: `e2e/hud-layout.spec.ts`

**Interfaces:**

- Consumes T1's strip state and compact-touch media query.
- Produces `.st-hud__strip-scroll-hint` and executable viewport geometry obligations.

- [x] **Step 1: Write failing Playwright acceptance tests**

Add tests to `e2e/hud-layout.spec.ts`:

```ts
test('compact touch starts fitted with arsenal collapsed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-touch');
  const strip = page.locator('.st-hud__strip');
  await expect(strip).toHaveClass(/st-hud__strip--collapsed/);
  await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'false');
  const geometry = await page.locator('#hud').evaluate((hud) => ({
    clientHeight: hud.clientHeight,
    scrollHeight: hud.scrollHeight,
  }));
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
});

test('compact touch expansion exposes arsenal and scroll hint', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-touch');
  await page.locator('.st-hud__strip-toggle').click();
  await expect(page.locator('.st-hud__strip-grid')).toBeVisible();
  await expect(page.locator('.st-hud__strip-scroll-hint')).toBeVisible();
  await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'true');
});
```

Add a second top-level `test.describe('HUD arsenal responsive defaults', ...)` outside the existing
describe block, with no shared `beforeEach`. Put the saved-preference test there so
`page.addInitScript()` runs before `gotoRunningGame()`, and put the rotation test there so it can set
an initial non-matching viewport before navigation and then enter the compact-touch query.

```ts
test.describe('HUD arsenal responsive defaults', () => {
  test('saved expanded preference wins on compact touch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch');
    await page.addInitScript(() => localStorage.setItem('st_arsenal_collapsed', '0'));
    await gotoRunningGame(page);
    await expect(page.locator('.st-hud__strip')).not.toHaveClass(/st-hud__strip--collapsed/);
    await expect(page.locator('.st-hud__strip-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('implicit default follows compact-touch changes until manually toggled', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch');
    await page.setViewportSize({ width: 915, height: 720 });
    await gotoRunningGame(page);
    const strip = page.locator('.st-hud__strip');
    const toggle = page.locator('.st-hud__strip-toggle');
    await expect(strip).not.toHaveClass(/st-hud__strip--collapsed/);

    await page.setViewportSize({ width: 915, height: 412 });
    await expect(strip).toHaveClass(/st-hud__strip--collapsed/);
    await toggle.click();
    await expect(strip).not.toHaveClass(/st-hud__strip--collapsed/);

    await page.setViewportSize({ width: 915, height: 720 });
    await page.setViewportSize({ width: 915, height: 412 });
    await expect(strip).not.toHaveClass(/st-hud__strip--collapsed/);
  });
});
```

- [x] **Step 2: Run Pixel Playwright and prove RED**

```powershell
npx playwright test e2e/hud-layout.spec.ts --project=pixel-touch
```

Expected: the new first-visit collapsed assertion fails on current `main`.

- [x] **Step 3: Add the scroll hint DOM and compact-touch styles**

In `buildArsenal()`, add:

```ts
const scrollHint = document.createElement('span');
scrollHint.className = 'st-hud__strip-scroll-hint';
scrollHint.textContent = 'Swipe panel to scroll';
stripHeader.append(stripTitle, scrollHint, stripToggle);
```

In `style.css`, add compact-touch rules:

```css
.st-hud__strip-scroll-hint { display: none; }

@media (pointer: coarse) and (max-height: 700px) {
  #hud {
    overscroll-behavior-y: contain;
    scrollbar-color: var(--ember) rgba(255, 233, 168, 0.08);
    scrollbar-width: thin;
  }
  #hud::-webkit-scrollbar { width: 6px; }
  #hud::-webkit-scrollbar-thumb {
    background: var(--ember);
    border-radius: 999px;
  }
  .st-hud__strip:not(.st-hud__strip--collapsed) .st-hud__strip-scroll-hint {
    display: inline;
  }
}
```

Place the base hint rule with the arsenal styles if those remain injected by `HUD.ts`; keep the
compact media rule in `style.css` beside viewport layout policy.

- [x] **Step 4: Run Pixel tests to GREEN**

Run the Step 2 command.

Expected: all Pixel HUD tests pass, including geometry, saved preference, rotation, and expansion.

- [x] **Step 5: Run the complete Playwright matrix**

```powershell
npx playwright test e2e/hud-layout.spec.ts
```

Expected: every desktop-fine, pixel-touch, and small-window test passes. Assertions specific to Pixel
skip cleanly in other projects; general geometry guards run everywhere.

- [x] **Step 6: Two-pass review and fresh verification**

Spec review checks AC-1, AC-4, and AC-5. Quality review inspects accessible toggle state, touch-target
preservation, saved override behavior, real computed geometry, and selector scope. Run Steps 4 and 5
fresh before marking T2 `ACCEPTED`.

---

### Task 3: Full gate matrix and PR

**Files:**

- Modify: `.codearbiter/specs/mobile-hud-overflow.md` (status)
- Modify: `.codearbiter/plans/mobile-hud-overflow.md` (ledger)
- Append: `.codearbiter/sprint-log.md`

**Interfaces:**

- Consumes accepted T1 and T2.
- Produces a clean feature commit and PR closing #107.

- [x] **Step 1: Run the complete fresh verification matrix**

```powershell
npm run check
npm run test:client
npm run build
npx playwright test e2e/hud-layout.spec.ts
git diff --check
```

Expected: all commands exit 0. Record test counts, project counts, geometry, and elapsed suite time in
the sprint receipt.

- [x] **Step 2: Confirm scope and dependency integrity**

```powershell
git diff -- package-lock.json
git diff --name-only
git diff --check
```

Expected: no lockfile diff; only spec, plan, sprint log, HUD preference/UI, CSS, and HUD tests changed.

- [x] **Step 3: Final whole-branch review**

Dispatch the required review roles. CRITICAL, HIGH, and any acceptance mismatch block landing. Resolve
all block-level findings and rerun affected tests.

- [ ] **Step 4: Route through codeArbiter landing gates**

Run `commit-gate`, then the sprint finishing path. Use a Conventional Commit message with a
`CHANGELOG:` footer and `Closes #107`. Push and open a non-draft PR against `main`; never merge or
deploy.

- [ ] **Step 5: Watch PR CI to green**

Invoke `$ca-watch` for the new PR. On red, diagnose and route the repair through `$ca-fix`; on green,
record the receipt and begin the next loop iteration without merging.
