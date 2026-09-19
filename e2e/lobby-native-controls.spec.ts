import { expect, test } from '@playwright/test';
import { gotoLobby, openLocalPreparation } from './support';

test('Local native controls retain the dark console theme and keyboard selection', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoLobby(page);
  await openLocalPreparation(page);
  const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
  await expect(page.locator('button[data-command-item="local-battle"]'))
    .toHaveAttribute('aria-current', 'true');
  await expect(workspace).toBeVisible();
  const selector = workspace.locator('#lobby-hotseat-direct-walls');
  await expect(selector).toBeVisible();
  const theme = await selector.evaluate((control) => {
    const option = control.querySelector('option')!;
    const scroll = control.closest('.lobby-hotseat')!.querySelector('.lobby-hotseat-scroll')!;
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
  await expect(selector).toHaveValue('reflective');

  await page.emulateMedia({ forcedColors: 'active' });
  await expect(selector).toHaveCSS('forced-color-adjust', 'auto');
  await expect(workspace.locator('.lobby-hotseat-scroll')).toHaveCSS('scrollbar-color', 'auto');
});
