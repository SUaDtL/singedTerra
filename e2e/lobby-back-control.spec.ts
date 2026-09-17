import { expect, test } from '@playwright/test';
import { gotoLobby, openLocalPreparation, openOnlinePreparation } from './support';

test('preparation back action is framed, spaced and reachable', async ({ page }, testInfo) => {
  await gotoLobby(page);
  for (const route of ['Local Battle', 'Play Online']) {
    if (route === 'Local Battle') await openLocalPreparation(page);
    else await openOnlinePreparation(page);
    const back = page.getByRole('button', { name: 'Back to deployment choices', exact: true });
    await expect(back).toBeVisible();
    const geometry = await back.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const icon = button.querySelector('svg')!.getBoundingClientRect();
      const textRange = document.createRange();
      textRange.selectNode(button.lastChild!);
      const text = textRange.getBoundingClientRect();
      return {
        height: rect.height,
        left: rect.left,
        right: rect.right,
        viewport: innerWidth,
        iconInset: icon.left - rect.left,
        iconGap: text.left - icon.right,
        textInset: rect.right - text.right,
        border: parseFloat(getComputedStyle(button).borderTopWidth),
        legacyArrow: getComputedStyle(button, '::before').content,
      };
    });
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.iconInset).toBeGreaterThanOrEqual(6);
    expect(geometry.iconGap).toBeGreaterThanOrEqual(6);
    expect(geometry.textInset).toBeGreaterThanOrEqual(6);
    expect(geometry.border).toBeGreaterThanOrEqual(1);
    expect(['none', 'normal']).toContain(geometry.legacyArrow);
    await page.screenshot({ path: testInfo.outputPath(`back-${route.replaceAll(' ', '-')}.png`) });
    await back.click();
    const itemId = route === 'Local Battle' ? 'local-battle' : 'online';
    await expect(page.locator(
      `.command-center__library-items button[data-command-item="${itemId}"]`,
    )).toBeFocused();
  }
});
