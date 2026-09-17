import { expect, test } from '@playwright/test';
import { gotoLobby, openLocalPreparation } from './support';

test('practice native controls retain the dark console theme and keyboard selection', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoLobby(page);
  await openLocalPreparation(page);
  await page.getByRole('tab', { name: 'Practice vs CPU', exact: true }).click();
  const selector = page.locator('[data-ui="practice-operation-selector"]');
  await expect(selector).toBeVisible();
  const theme = await selector.evaluate((control) => {
    const option = control.querySelector('option')!;
    const scroll = document.querySelector('.lobby-hotseat-scroll')!;
    return {
      scheme: getComputedStyle(control).colorScheme,
      optionBackground: getComputedStyle(option).backgroundColor,
      optionText: getComputedStyle(option).color,
      scrollbar: getComputedStyle(scroll).scrollbarColor,
      scrollbarWidth: getComputedStyle(scroll).scrollbarWidth,
    };
  });
  expect(theme.scheme).toBe('dark');
  expect(theme.optionBackground).toBe('rgb(16, 20, 20)');
  expect(theme.optionText).toBe('rgb(244, 223, 180)');
  expect(theme.scrollbar).toBe('rgb(213, 152, 67) rgb(16, 20, 20)');
  expect(theme.scrollbarWidth).toBe('auto');
  await selector.focus();
  await page.keyboard.press('ArrowDown');
  await expect(selector).toHaveValue('first-salvo');
  await expect(page.locator('[data-ui="selected-practice-operation"]')).toContainText('First Salvo');

  await page.emulateMedia({ forcedColors: 'active' });
  await expect(selector).toHaveCSS('forced-color-adjust', 'auto');
  await expect(page.locator('.lobby-hotseat-scroll')).toHaveCSS('scrollbar-color', 'auto');
});
