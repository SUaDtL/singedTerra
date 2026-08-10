import { expect, test } from '@playwright/test';

async function gotoVictory(
  page: import('@playwright/test').Page,
  anonymousProgression = false,
): Promise<void> {
  await page.goto(anonymousProgression ? '?e2e=victory-anonymous' : '?e2e=victory');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('.st-hud__overlay--victory')).toBeVisible();
}

test.describe('Victory After-Action Report', () => {
  test('keeps the anonymous future-match handoff contained and directs it to sign-in', async ({ page }) => {
    await gotoVictory(page, true);

    const report = page.locator('.st-hud__overlay--victory');
    const panel = report.locator('.st-hud__overlay-panel--victory');
    const prompt = report.getByText('Sign in to record future matches.');
    const signIn = report.getByRole('button', { name: 'Sign in' });
    const playAgain = report.getByRole('button', { name: 'Play again' });
    const mainMenu = report.getByRole('button', { name: 'Main Menu' });

    await expect(prompt).toBeVisible();
    await expect(report.locator('.st-hud__victory-progression-handoff'))
      .toHaveAttribute('role', 'status');
    await expect(report.locator('.st-hud__victory-progression-handoff'))
      .toHaveAttribute('aria-live', 'polite');
    await expect(signIn).toBeVisible();
    await expect(playAgain).toBeVisible();
    await expect(mainMenu).toBeVisible();
    await playAgain.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(signIn).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(mainMenu).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(signIn).toBeFocused();

    const contained = await panel.evaluate((element) => {
      const panelBox = element.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLElement>(
        '.st-hud__victory-progression-handoff, .st-hud__victory-progression-sign-in, .st-hud__victory-primary, .st-hud__restart--ghost',
      )].every((child) => {
        const box = child.getBoundingClientRect();
        return box.left >= panelBox.left - 1 && box.right <= panelBox.right + 1
          && box.top >= panelBox.top - 1 && box.bottom <= panelBox.bottom + 1;
      });
    });
    expect(contained).toBe(true);

    const orderedLayout = await panel.evaluate((element) => {
      const bounds = (selector: string) => {
        const target = element.querySelector<HTMLElement>(selector);
        if (!target) throw new Error(`Missing ${selector}`);
        return target.getBoundingClientRect();
      };
      const promptBox = bounds('.st-hud__victory-progression-handoff p');
      const signInBox = bounds('.st-hud__victory-progression-sign-in');
      const titleBox = bounds('.st-hud__victory-title');
      const scoreLabelBox = bounds('.st-hud__victory-score-label');
      const scoreBox = bounds('.st-hud__score');
      const actionBox = bounds('.st-hud__overlay-btns');
      const ordered = [promptBox, signInBox, titleBox, scoreLabelBox, scoreBox, actionBox];
      const overlaps = (left: DOMRect, right: DOMRect) =>
        left.left < right.right && left.right > right.left
        && left.top < right.bottom && left.bottom > right.top;
      return {
        verticalOrder: ordered.slice(1).every((box, index) => ordered[index]!.bottom <= box.top),
        handoffDoesNotOverlapVictoryContent: [titleBox, scoreLabelBox, scoreBox, actionBox]
          .every((box) => !overlaps(promptBox, box) && !overlaps(signInBox, box)),
      };
    });
    expect(orderedLayout.verticalOrder).toBe(true);
    expect(orderedLayout.handoffDoesNotOverlapVictoryContent).toBe(true);

    const geometry = await panel.evaluate((element) => {
      const panelBox = element.getBoundingClientRect();
      const overlay = element.closest<HTMLElement>('.st-hud__overlay--victory');
      if (!overlay) throw new Error('Missing victory overlay');
      const overlayBox = overlay.getBoundingClientRect();
      return {
        panel: panelBox.toJSON(),
        overlay: overlayBox.toJSON(),
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
    expect(geometry.panel.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.document.width).toBe(geometry.viewport.width);
    expect(geometry.document.height).toBe(geometry.viewport.height);

    await signIn.click();
    const account = page.getByRole('dialog', { name: 'Player account' });
    await expect(account).toBeVisible();
    await expect(account.locator('input[type="email"]')).toBeFocused();
  });

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
      await page.locator('.st-hud__victory-progression-receipt').evaluate((receipt) => {
        receipt.textContent = 'Victory · +200 XP · 300 XP to Level 4';
        (receipt as HTMLElement).hidden = false;
      });
      await expect(page.locator('.st-hud__overlay-panel--victory'))
        .toHaveCSS('animation-name', 'none');
      await expect(page.locator('.st-hud__victory-tank-frame'))
        .toHaveCSS('animation-name', 'none');
      await expect(page.getByText('Victory · +200 XP · 300 XP to Level 4')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
      const containment = await page.locator('.st-hud__overlay-panel--victory').evaluate((panel) => {
        const panelBox = panel.getBoundingClientRect();
        const receiptBox = panel.querySelector('.st-hud__victory-progression-receipt')!
          .getBoundingClientRect();
        return {
          receiptLeft: receiptBox.left,
          receiptRight: receiptBox.right,
          panelLeft: panelBox.left,
          panelRight: panelBox.right,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
        };
      });
      expect(containment.receiptLeft).toBeGreaterThanOrEqual(containment.panelLeft - 1);
      expect(containment.receiptRight).toBeLessThanOrEqual(containment.panelRight + 1);
      expect(containment.documentWidth).toBe(containment.viewportWidth);
    } finally {
      await context.close();
    }
  });
});
