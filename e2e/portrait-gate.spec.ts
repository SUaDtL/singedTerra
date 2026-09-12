import { test, expect, type Browser } from '@playwright/test';

const TEST_ENTRY = process.env['E2E_LIVE_URL'] ?? '/';

async function initialLayerState(
  browser: Browser,
  viewport: { width: number; height: number },
  hasTouch: boolean,
): Promise<{ warningDisplay: string; splashCount: number }> {
  const context = await browser.newContext({ viewport, hasTouch });
  try {
    const page = await context.newPage();
    await page.goto(TEST_ENTRY);
    return {
      warningDisplay: await page.locator('#portrait-warn').evaluate((element) =>
        getComputedStyle(element).display,
      ),
      splashCount: await page.locator('#st-splash').count(),
    };
  } finally {
    await context.close();
  }
}

test.describe('portrait phone gate', () => {
  test('warns at phone width independently of pointer type', async ({ browser }) => {
    await expect(initialLayerState(browser, { width: 393, height: 851 }, true))
      .resolves.toEqual({ warningDisplay: 'flex', splashCount: 0 });
    await expect(initialLayerState(browser, { width: 393, height: 851 }, false))
      .resolves.toEqual({ warningDisplay: 'flex', splashCount: 0 });
  });

  test('does not block a coarse-pointer laptop-sized portrait viewport', async ({ browser }) => {
    await expect(initialLayerState(browser, { width: 700, height: 900 }, true))
      .resolves.toEqual({ warningDisplay: 'none', splashCount: 1 });
  });

  test('uses an inclusive 480px boundary', async ({ browser }) => {
    await expect(initialLayerState(browser, { width: 480, height: 900 }, true))
      .resolves.toEqual({ warningDisplay: 'flex', splashCount: 0 });
    await expect(initialLayerState(browser, { width: 481, height: 900 }, true))
      .resolves.toEqual({ warningDisplay: 'none', splashCount: 1 });
  });

  test('never warns in landscape', async ({ browser }) => {
    await expect(initialLayerState(browser, { width: 851, height: 393 }, true))
      .resolves.toEqual({ warningDisplay: 'none', splashCount: 1 });
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
      await page.goto(TEST_ENTRY);
      await expect(page.locator('#st-splash')).toHaveCount(0);

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
      await expect(page.locator('#st-splash')).toHaveCount(0);
      await expect(page.locator('#lobby')).toBeVisible();
      await expect(app).not.toHaveAttribute('inert', '');
      await expect(app).not.toHaveAttribute('aria-hidden', 'true');
      await expect.poll(() => page.evaluate(() => document.querySelector('#app')?.contains(document.activeElement)))
        .toBe(true);
    } finally {
      await context.close();
    }
  });

  test('manual rotation reaches the lobby without pressing the launch action', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 393, height: 851 },
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      await page.goto(TEST_ENTRY);

      const gate = page.locator('#portrait-warn');
      const app = page.locator('#app');
      const action = gate.getByRole('button', { name: 'Enter fullscreen landscape' });
      await expect(page.locator('#st-splash')).toHaveCount(0);
      await expect(gate).toBeVisible();
      await expect(action).toBeFocused();
      await expect(app).toHaveAttribute('inert', '');
      await expect(app).toHaveAttribute('aria-hidden', 'true');

      await page.setViewportSize({ width: 851, height: 393 });

      await expect(gate).toBeHidden();
      await expect(page.locator('#st-splash')).toHaveCount(0);
      await expect(page.locator('#lobby')).toBeVisible();
      await expect(app).not.toHaveAttribute('inert', '');
      await expect(app).not.toHaveAttribute('aria-hidden', 'true');
      await expect.poll(() => page.evaluate(() => document.querySelector('#app')?.contains(document.activeElement)))
        .toBe(true);
    } finally {
      await context.close();
    }
  });

  test('a landscape splash keeps ownership when the viewport later becomes phone portrait', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 851, height: 393 },
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      await page.goto(TEST_ENTRY);

      const splash = page.getByRole('button', {
        name: 'singedTerra - press any key or click to start',
      });
      const gate = page.locator('#portrait-warn');
      const app = page.locator('#app');
      const action = gate.getByRole('button', { name: 'Enter fullscreen landscape' });
      await expect(splash).toBeVisible();
      await expect(splash).toBeFocused();
      await expect(gate).toBeHidden();
      await expect(page.locator('#lobby')).toBeVisible();
      await expect(app).not.toHaveAttribute('inert', '');

      await page.setViewportSize({ width: 393, height: 851 });

      await expect(splash).toBeVisible();
      await expect(splash).toBeFocused();
      await expect(gate).toBeVisible();
      await expect(gate).toHaveAttribute('inert', '');
      await expect(gate).toHaveAttribute('aria-hidden', 'true');
      await expect(app).toHaveAttribute('inert', '');
      await expect(app).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('#lobby')).toBeVisible();

      await splash.click();
      await expect(splash).toBeHidden();
      await expect(gate).not.toHaveAttribute('inert', '');
      await expect(gate).toHaveAttribute('aria-hidden', 'false');
      await expect(action).toBeFocused();
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
      await page.goto(TEST_ENTRY);
      const motif = page.locator('.portrait-warn__device');
      await expect(motif).toBeVisible();
      await expect(motif).toHaveCSS('animation-name', 'none');
    } finally {
      await context.close();
    }
  });
});
