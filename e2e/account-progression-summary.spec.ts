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
      for (const [label, value] of [['Matches', '7'], ['Recorded wins', '3']]) {
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
    await expect(labels).toHaveCount(2);

    for (const label of await labels.all()) {
      const box = await label.boundingBox();
      expect(box, 'summary label should render').not.toBeNull();
      expect(box!.height, 'summary label should retain at least 8 physical pixels').toBeGreaterThanOrEqual(8);
    }
    await expectInside(summary, panel);

    const items = await summary.locator('.account-panel__progress-item').all();
    const first = await items[0]!.boundingBox();
    const second = await items[1]!.boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.x + first!.width, 'summary items must not overlap').toBeLessThanOrEqual(second!.x);
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
