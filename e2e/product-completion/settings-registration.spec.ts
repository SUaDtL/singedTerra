import { expect, test } from '@playwright/test';

test('AC06 Settings text and controls register inside their hardware wells', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  await page.locator('#st-splash').click();
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
  await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Battle Settings', exact: true });
  const box = (await dialog.boundingBox())!;
  const heading = (await dialog.getByRole('heading').boundingBox())!;
  const close = (await dialog.getByRole('button', { name: 'Close settings', exact: true }).boundingBox())!;
  expect(Math.abs(heading.x + heading.width / 2 - box.x - box.width / 2)).toBeLessThanOrEqual(2);
  const usesCompactSettings = await dialog.locator('[data-battle-console-portal-header]').evaluate(element => getComputedStyle(element).position === 'static');
  if (!usesCompactSettings) {
    expect(heading.x).toBeGreaterThan(box.x + box.width * .18);
    expect(heading.y).toBeGreaterThan(box.y + box.height * .08);
    expect(heading.y + heading.height).toBeLessThan(box.y + box.height * .18);
    expect(close.x).toBeGreaterThan(box.x + box.width * .25);
    expect(close.x + close.width).toBeLessThan(box.x + box.width * .75);
    expect(close.y).toBeGreaterThan(box.y + box.height * .80);
    expect(close.y + close.height).toBeLessThan(box.y + box.height * .91);
    const switches = await dialog.getByRole('switch').all();
    for (const [index, control] of switches.entries()) {
      const rect = (await control.boundingBox())!;
      expect(rect.x).toBeGreaterThan(box.x + box.width * .14);
      expect(rect.x + rect.width).toBeLessThan(box.x + box.width * .86);
      expect(rect.y).toBeGreaterThan(box.y + box.height * (index === 0 ? .24 : .53));
      expect(rect.y + rect.height).toBeLessThan(box.y + box.height * (index === 0 ? .47 : .75));
    }
  }
  for (const control of [...await dialog.getByRole('switch').all(), dialog.getByRole('button', { name: 'Close settings', exact: true })]) {
    const rect = (await control.boundingBox())!;
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.x).toBeGreaterThan(box.x + 4);
    expect(rect.x + rect.width).toBeLessThan(box.x + box.width - 4);
    expect(rect.y + rect.height).toBeLessThan(box.y + box.height - 4);
  }
  await page.screenshot({ path: `test-results/product-completion/${testInfo.project.name}-settings-registration.png` });
});
