import { expect, test } from '@playwright/test';
import {
  assertLobbyControlReachable,
  assertLobbyFrame,
  gotoLobby,
} from './support';

test.describe('Lobby layout guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLobby(page);
  });

  test('Hot Seat setup stays framed and its primary action is reachable', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Hot Seat', exact: true })).toHaveClass(/active/);
    await expect(page.getByText('Hot-seat setup', { exact: false })).toBeVisible();
    await expect(page.locator('.lobby-row')).toHaveCount(2);
    await expect(page.locator('.lobby-controls')).toContainText('Aim');

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-start');
  });

  test('Online Create stays framed and its primary action is reachable', async ({ page }) => {
    await page.getByRole('button', { name: 'Play Online', exact: true }).click();

    await expect(page.getByText('Create a new online room', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Room', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join Room instead', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse public rooms', exact: true })).toBeVisible();

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-btn-row .lobby-btn:not(.secondary)');
  });

  test('Join by Code stays framed and its primary action is reachable', async ({ page }) => {
    await page.getByRole('button', { name: 'Play Online', exact: true }).click();
    await page.getByRole('button', { name: 'Join Room instead', exact: true }).click();

    await expect(page.getByText('Enter the 4-character room code', { exact: false })).toBeVisible();
    await expect(page.locator('.lobby-code-input')).toHaveAttribute('maxlength', '4');
    await expect(page.getByRole('button', { name: 'Join Room', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create instead', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse public rooms', exact: true })).toBeVisible();

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-btn-row .lobby-btn:not(.secondary)');
  });
});
