import { expect, test } from '@playwright/test';

test('AC-04 inventory scrolls by wheel and touch through its final action', async ({ page, context }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  await expect(page.locator('#st-splash')).toBeHidden();
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const inventory = page.locator('[data-battle-console-armory-scroll]');
  const box = (await inventory.boundingBox())!;
  if (testInfo.project.name === 'compact') {
    const session = await context.newCDPSession(page);
    const x = box.x + box.width * .5;
    for (let gesture = 0; gesture < 18; gesture++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: box.y + box.height * .9 }] });
      for (let step = 1; step <= 6; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: box.y + box.height * (.9 - .8 * step / 6) }] });
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await session.detach();
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 20_000);
  }
  const last = page.locator('[data-battle-console-armory-item]').last();
  await expect.poll(async () => {
    const rect = (await last.boundingBox())!;
    return rect.y >= box.y && rect.y + rect.height <= box.y + box.height + 1;
  }).toBe(true);
  await expect(last.getByRole('button', { name: /^Buy/ })).toBeInViewport();
});

test('AC-01 portrait phone presents the fitted landscape launch gate', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'compact', 'One portrait phone proof');
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Turn the battlefield sideways' })).toBeVisible();
    const launch = page.getByRole('button', { name: 'Enter fullscreen landscape' });
    await expect(launch).toBeInViewport();
    const rect = (await launch.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: 'test-results/product-completion/portrait-launch.png' });
  } finally { await context.close(); }
});
