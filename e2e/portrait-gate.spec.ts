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

  test('presents one fitted authored launch bay and requests the supported browser path', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 393, height: 851 },
      hasTouch: true,
    });
    await context.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: async function requestFullscreen(): Promise<void> {
          document.documentElement.dataset['fullscreenRequested'] = 'true';
        },
      });
      Object.defineProperty(screen, 'orientation', {
        configurable: true,
        value: {
          angle: 0,
          type: 'portrait-primary',
          lock: async (mode: string): Promise<void> => {
            document.documentElement.dataset['orientationRequested'] = mode;
          },
        },
      });
    });

    try {
      const page = await context.newPage();
      await page.goto('/');
      await page.getByRole('button', {
        name: 'singedTerra - press any key or click to start',
      }).click();

      const gate = page.locator('#portrait-warn');
      const app = page.locator('#app');
      const art = gate.locator('.portrait-warn__art');
      const action = gate.getByRole('button', { name: 'Enter fullscreen landscape' });
      const status = gate.getByRole('status');

      await expect(gate).toBeVisible();
      await expect(gate).toHaveAttribute('aria-modal', 'true');
      await expect(gate.getByRole('heading', { name: 'Turn the battlefield sideways' })).toBeVisible();
      await expect(art).toBeVisible();
      await expect(art).toHaveAttribute('src', /splash-hero\.png$/);
      await expect(status).toHaveText('Or rotate your device manually.');

      const geometry = await gate.evaluate((element) => {
        const actionBox = element.querySelector('button')!.getBoundingClientRect();
        const artBox = element.querySelector('img')!.getBoundingClientRect();
        return {
          action: actionBox.toJSON(),
          art: artBox.toJSON(),
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          viewport: { width: innerWidth, height: innerHeight },
        };
      });
      expect(geometry.action.height).toBeGreaterThanOrEqual(44);
      expect(geometry.action.left).toBeGreaterThanOrEqual(0);
      expect(geometry.action.right).toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.art.width).toBeGreaterThan(250);
      expect(geometry.scrollWidth).toBe(geometry.viewport.width);
      expect(geometry.scrollHeight).toBe(geometry.viewport.height);

      await expect(app).toHaveAttribute('inert', '');
      await expect(app).toHaveAttribute('aria-hidden', 'true');
      await expect(action).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(action).toBeFocused();

      await action.press('Enter');
      await expect(status).toContainText('Landscape requested');
      await expect(page.locator('html')).toHaveAttribute('data-fullscreen-requested', 'true');
      await expect(page.locator('html')).toHaveAttribute('data-orientation-requested', 'landscape');

      await page.setViewportSize({ width: 851, height: 393 });
      await expect(gate).toBeHidden();
      await expect(app).not.toHaveAttribute('inert', '');
      await expect(app).not.toHaveAttribute('aria-hidden', 'true');
      await expect.poll(() => page.evaluate(() => document.querySelector('#app')?.contains(document.activeElement)))
        .toBe(true);
    } finally {
      await context.close();
    }
  });

  test('keeps the device motif visible but still under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 393, height: 851 },
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await page.goto('/');
      const motif = page.locator('.portrait-warn__device');
      await expect(motif).toBeVisible();
      await expect(motif).toHaveCSS('animation-name', 'none');
    } finally {
      await context.close();
    }
  });
});
