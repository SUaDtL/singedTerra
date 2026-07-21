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
