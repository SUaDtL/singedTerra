import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('?e2e=hotseat');
  const splash = page.locator('#st-splash');
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(splash).toBeHidden();
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
});

test('AC-01/07 compact Match copy stays physically readable', async ({ page }, testInfo) => {
  test.skip(!['compact', 'narrow'].includes(testInfo.project.name), 'Reduced stage Match');
  const card = page.locator('#hud .st-hud__match-card');
  if (!await card.isVisible()) await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await expect(card).toBeVisible();
  const sizes = await page.locator('#hud .st-hud__match-title, #hud .st-hud__player, #hud .st-hud__hp, #hud .st-hud__ammo, #hud [data-ui="match-mode"]').evaluateAll(nodes => nodes.map(node => {
    const scale = Number(getComputedStyle(document.querySelector('#app')!).getPropertyValue('--battle-ui-scale'));
    return { name: node.className, size: parseFloat(getComputedStyle(node).fontSize) * scale };
  }));
  for (const entry of sizes) expect(entry.size, entry.name).toBeGreaterThanOrEqual(13.99);
});

test('AC-01 narrow and compact console labels stay physically readable', async ({ page }, testInfo) => {
  test.skip(!['compact', 'narrow'].includes(testInfo.project.name), 'Reduced stage profiles');
  const chassis = page.locator('[data-battle-console-compact-chassis]');
  await expect(chassis).toBeVisible();
  const sizes = await chassis.evaluate(element => {
    const scale = element.getBoundingClientRect().width / 1388;
    return [...element.querySelectorAll('span, strong, output, small')].map(node => ({
      text: node.textContent,
      size: parseFloat(getComputedStyle(node).fontSize) * scale,
    }));
  });
  expect(sizes.length).toBeGreaterThan(10);
  for (const entry of sizes) expect(entry.size, entry.text ?? 'Console copy').toBeGreaterThanOrEqual(13.99);
});
