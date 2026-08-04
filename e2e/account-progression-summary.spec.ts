import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoLobby, isCompact } from './support';

async function installSummaryFixture(page: Page, available: boolean): Promise<void> {
  await page.evaluate((hasSummary) => {
    document.querySelector('#lobby .account-panel')?.remove();
    const panel = document.createElement('section');
    panel.className = 'account-panel';
    panel.dataset['summaryFixture'] = hasSummary ? 'available' : 'unavailable';

    const identity = document.createElement('span');
    identity.className = 'account-panel__identity';
    identity.textContent = 'Commander Ranger';
    panel.append(identity);

    if (hasSummary) {
      const summary = document.createElement('dl');
      summary.className = 'account-panel__progress';
      for (const [label, value] of [
        ['Matches', '8'],
        ['Recorded wins', '4'],
        ['Level', '3'],
        ['XP', '200 / 500'],
      ]) {
        const item = document.createElement('div');
        item.className = 'account-panel__progress-item';
        const term = document.createElement('dt');
        term.textContent = label;
        const count = document.createElement('dd');
        count.textContent = value;
        item.append(term, count);
        summary.append(item);
      }
      panel.append(summary);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'account-panel__summary-unavailable';
      unavailable.textContent = 'Progress summary unavailable';
      panel.append(unavailable);
    }

    const signOut = document.createElement('button');
    signOut.className = 'account-panel__secondary';
    signOut.textContent = 'Sign out';
    panel.append(signOut);
    document.getElementById('lobby')?.append(panel);
  }, available);
}

async function expectInside(inner: Locator, outer: Locator): Promise<void> {
  const innerBox = await inner.boundingBox();
  const outerBox = await outer.boundingBox();
  expect(innerBox, 'summary content should render').not.toBeNull();
  expect(outerBox, 'account panel should render').not.toBeNull();
  expect(innerBox!.x).toBeGreaterThanOrEqual(outerBox!.x - 1);
  expect(innerBox!.y).toBeGreaterThanOrEqual(outerBox!.y - 1);
  expect(innerBox!.x + innerBox!.width).toBeLessThanOrEqual(outerBox!.x + outerBox!.width + 1);
  expect(innerBox!.y + innerBox!.height).toBeLessThanOrEqual(outerBox!.y + outerBox!.height + 1);
}

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    first.x + first.width <= second.x
    || second.x + second.width <= first.x
    || first.y + first.height <= second.y
    || second.y + second.height <= first.y
  );
}

test.describe('Account progression summary compact readability', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLobby(page);
    const compact = await isCompact(page);
    test.skip(!compact, 'Account summary typography oracle requires a compact project');
    expect(compact, 'test project must exercise #app.is-compact').toBe(true);
  });

  test('available summary remains legible, contained, and non-overlapping', async ({ page }) => {
    await installSummaryFixture(page, true);
    const panel = page.locator('[data-summary-fixture="available"]');
    const summary = panel.locator('.account-panel__progress');
    const labels = summary.locator('dt');
    const values = summary.locator('dd');
    await expect(labels).toHaveCount(4);
    await expect(values).toHaveCount(4);

    for (const label of await labels.all()) {
      const box = await label.boundingBox();
      expect(box, 'summary label should render').not.toBeNull();
      expect(box!.height, 'summary label should retain at least 8 physical pixels').toBeGreaterThanOrEqual(8);
      expect(await label.evaluate((node) => getComputedStyle(node).fontSize))
        .toMatch(/^(1[0-9]|[2-9][0-9])px$/);
    }
    for (const value of await values.all()) {
      const box = await value.boundingBox();
      expect(box, 'summary value should render').not.toBeNull();
      expect(box!.height, 'summary value should retain at least 8 physical pixels').toBeGreaterThanOrEqual(8);
      expect(await value.evaluate((node) => getComputedStyle(node).fontSize))
        .toMatch(/^(1[2-9]|[2-9][0-9])px$/);
    }
    await expectInside(summary, panel);

    const items = await summary.locator('.account-panel__progress-item').all();
    expect(items).toHaveLength(4);
    const boxes = await Promise.all(items.map((item) => item.boundingBox()));
    for (const box of boxes) {
      expect(box, 'summary item should render').not.toBeNull();
    }
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        expect(
          boxesOverlap(boxes[left]!, boxes[right]!),
          `summary items ${left + 1} and ${right + 1} must not overlap`,
        ).toBe(false);
      }
    }
  });

  test('unavailable summary remains legible and contained', async ({ page }) => {
    await installSummaryFixture(page, false);
    const panel = page.locator('[data-summary-fixture="unavailable"]');
    const unavailable = panel.locator('.account-panel__summary-unavailable');
    const box = await unavailable.boundingBox();
    expect(box, 'unavailable summary should render').not.toBeNull();
    expect(box!.height, 'unavailable summary should retain at least 8 physical pixels')
      .toBeGreaterThanOrEqual(8);
    await expectInside(unavailable, panel);
  });
});
