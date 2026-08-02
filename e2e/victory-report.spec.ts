import { expect, test } from '@playwright/test';

async function gotoVictory(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('?e2e=victory');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('.st-hud__overlay--victory')).toBeVisible();
}

test.describe('Victory After-Action Report', () => {
  test('is an authored, fitted, keyboard-causal production modal', async ({ page }) => {
    await gotoVictory(page);

    const report = page.locator('.st-hud__overlay--victory');
    const panel = report.locator('.st-hud__overlay-panel--victory');
    const art = report.locator('.st-hud__victory-backdrop');
    const tank = report.locator('.st-hud__victory-tank');
    const playAgain = report.getByRole('button', { name: 'Play again' });
    const mainMenu = report.getByRole('button', { name: 'Main Menu' });

    await expect(report).toHaveAttribute('role', 'dialog');
    await expect(report).toHaveAttribute('aria-modal', 'true');
    await expect(report.getByText('After action report')).toBeVisible();
    await expect(report.getByRole('heading', { name: 'P1 wins' })).toBeVisible();
    await expect(report.getByText('Match winner')).toBeVisible();
    await expect(art).toBeVisible();
    await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(500);
    await expect(tank).toHaveAttribute(
      'data-tank-preview-signature',
      'spotlight|#e84d4d|ranger|bulwark|jackal|foundry',
    );
    await expect(report.locator('.st-hud__score-cell--winner')).toHaveCount(3);
    await expect(page.locator('#stage')).toHaveAttribute('inert', '');
    await expect(page.locator('#hud')).toHaveAttribute('inert', '');
    await expect(page.locator('#lobby')).toHaveAttribute('inert', '');
    await expect(playAgain).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(mainMenu).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(playAgain).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(mainMenu).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(playAgain).toBeFocused();

    const geometry = await report.evaluate((element) => {
      const overlay = element.getBoundingClientRect();
      const panelBox = element.querySelector('.st-hud__overlay-panel')!.getBoundingClientRect();
      return {
        overlay: overlay.toJSON(),
        panel: panelBox.toJSON(),
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.overlay.left - 1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.overlay.top - 1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.overlay.right + 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.overlay.bottom + 1);
    expect(geometry.document.width).toBe(geometry.viewport.width);
    expect(geometry.document.height).toBe(geometry.viewport.height);

    await playAgain.press('Enter');
    await expect(report).toBeHidden();
    await expect(page.locator('#stage')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#hud')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#lobby')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.st-hud__instruments')).toBeVisible();
  });

  test('keeps the complete report still under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 851, height: 393 },
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await gotoVictory(page);
      await expect(page.locator('.st-hud__overlay-panel--victory'))
        .toHaveCSS('animation-name', 'none');
      await expect(page.locator('.st-hud__victory-tank-frame'))
        .toHaveCSS('animation-name', 'none');
      await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
