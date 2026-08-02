# Mobile Command Deck Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new grouped mobile controls visible at first glance and keep the maintained player/UI documentation synchronized with the shipped interface.

**Architecture:** Treat the screenshot as a versioned documentation asset generated from the real production bundle, not as authored product art. Keep the change isolated to one image and three maintained Markdown files; use an ignored verification script for the RED/GREEN documentation contract.

**Tech Stack:** Markdown, Playwright 1.62, production Vite bundle, existing Pixel 5 landscape device descriptor, codeArbiter sprint and commit gates.

## Global Constraints

- Use the real production bundle and deterministic `?e2e=hotseat` path.
- The screenshot must be at least 1600 physical pixels wide and no larger than 350 KiB.
- The visible group vocabulary is exactly `Aim`, `Power`, `Drive`, and utilities.
- Add no dependency and change no application behavior or backend boundary.
- Run no more than one localhost server and stop it immediately after capture.

---

### Task 1: Capture and document the mobile Command Deck

**Files:**
- Create: `docs/assets/mobile-command-deck.jpg`
- Modify: `README.md`
- Modify: `docs/PLAYING.md`
- Modify: `docs/UI_SYSTEM.md`
- Temporary ignored verification: `.superpowers/sdd/mobile-command-deck-showcase/verify.mjs`
- Temporary ignored capture driver: `.superpowers/sdd/mobile-command-deck-showcase/capture.mjs`

**Interfaces:**
- Consumes: the production Vite bundle, `?e2e=hotseat`, `devices['Pixel 5 landscape']`, and the shipped grouped touch-control DOM.
- Produces: one bounded authentic screenshot and matching player-facing terminology in the maintained docs.

- [x] **Step 1: Write the focused documentation contract**

```js
import { existsSync, readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

const asset = 'docs/assets/mobile-command-deck.jpg';
assert.ok(existsSync(asset), `${asset} must exist`);
assert.ok(statSync(asset).size <= 350 * 1024, 'mobile showcase must stay at or below 350 KiB');

const readme = readFileSync('README.md', 'utf8');
const playing = readFileSync('docs/PLAYING.md', 'utf8');
const ui = readFileSync('docs/UI_SYSTEM.md', 'utf8');
assert.match(readme, /!\[Mobile Command Deck showing the grouped Aim, Power, and Drive controls beside the tactical rail\]\(docs\/assets\/mobile-command-deck\.jpg\)/);
assert.match(readme, /Aim, Power, and Drive groups/);
assert.match(playing, /Aim, Power, and Drive groups/);
assert.match(ui, /Move \/ Drive \(movement\)/);
```

- [x] **Step 2: Run the contract and preserve the expected RED**

Run: `node .superpowers/sdd/mobile-command-deck-showcase/verify.mjs`

Expected: FAIL with `docs/assets/mobile-command-deck.jpg must exist`.

- [x] **Step 3: Build and capture the authentic production surface**

Build with `npm run build`, start exactly one hidden Vite preview on port 4173,
and run this driver before stopping that preview:

```js
import { chromium, devices } from '@playwright/test';

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 5 landscape'] });
await context.addInitScript(() => {
  localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  localStorage.setItem('st_arsenal_collapsed', '1');
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:4173/?e2e=hotseat', { waitUntil: 'networkidle' });
await page.locator('[aria-label="singedTerra - press any key or click to start"]').click();
await page.locator('#st-splash').waitFor({ state: 'detached' });
await page.locator('[aria-label="Touch commands"]').waitFor();
await page.screenshot({
  path: 'docs/assets/mobile-command-deck.jpg',
  type: 'jpeg',
  quality: 88,
});
await browser.close();
```

Expected: a physical high-DPI screenshot at least 1600 pixels wide, with no
First Salvo overlay and both permanent command surfaces visible.

- [x] **Step 4: Add the focused README showcase and align terminology**

In `README.md`, replace the generic eight-control-dock sentence with the visible
`Aim`, `Power`, and `Drive` grouping, identify Weapon and Menu as utilities, and
place the screenshot immediately after that touch explanation with specific alt
text. Mirror that vocabulary in the Touch section of `docs/PLAYING.md`; document
the keyboard/touch distinction in `docs/UI_SYSTEM.md` as `Move / Drive
(movement)` without changing its target-size rule.

- [x] **Step 5: Run the focused GREEN contract and inspect the asset**

Run: `node .superpowers/sdd/mobile-command-deck-showcase/verify.mjs`

Expected: PASS, including the exact descriptive README Markdown image and the
`Move / Drive (movement)` command-surface vocabulary. Inspect
`docs/assets/mobile-command-deck.jpg` at original detail and verify the Command
Deck, tactical rail, tank silhouettes, trajectory guide, and text are sharp and
unobscured. Confirm physical dimensions and file bytes.

### Task 2: Verify and ship

**Files:**
- Append: `.codearbiter/sprint-log.md`
- Append when authorized: `.codearbiter/overrides.log`

**Interfaces:**
- Consumes: the completed documentation diff and focused proof from Task 1.
- Produces: governance receipts, adversarial clearance, exact-head hosted proof, and a reviewable PR.

- [x] **Step 1: Run repository verification**

Run `npm run check`, `npm run build`, the state-free secrets scan, `git diff --check`, and the focused documentation contract. Confirm ports 4173, 5173, 5174, and 3000 have no listeners.

- [x] **Step 2: Obtain designated adversarial review**

Require one adversary to inspect the exact diff and original-detail screenshot. Correct every Critical, High, Medium, and merge-blocking finding and rerun affected verification.

- [x] **Step 3: Commit and open the PR through the governed gates**

Stage every file explicitly, prove protected append-only prefixes, run `$ca-commit`, push `codex/readme-first-impression`, open a ready PR, and require hosted checks green on the exact current head.

- [ ] **Step 4: Apply standing merge and deployment authority only after exact-head proof**

Log the PR-specific merge receipt, require its governance head to pass the same hosted checks, squash merge to `main`, and verify Pages provenance plus live smoke before closing the slice.
