import { expect, test, type Page } from '@playwright/test';
import {
  assertLobbyControlReachable,
  assertLobbyFrame,
  gotoLobby,
} from './support';

async function fulfillFunction(
  page: Page,
  name: string,
  body: unknown,
): Promise<{ count: () => number; urls: () => string[] }> {
  const capturedUrls: string[] = [];
  await page.route(`**/functions/v1/${name}`, async (route) => {
    capturedUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return {
    count: () => capturedUrls.length,
    urls: () => [...capturedUrls],
  };
}

async function assertSameOriginFunctionCall(
  page: Page,
  calls: { count: () => number; urls: () => string[] },
  name: string,
): Promise<void> {
  expect(calls.count()).toBe(1);
  const requestUrl = new URL(calls.urls()[0]!);
  expect(requestUrl.origin).toBe(new URL(page.url()).origin);
  expect(requestUrl.pathname).toBe(`/functions/v1/${name}`);
}

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

  test('Browse public rooms renders a reachable network fixture without leaving the frame', async ({ page }) => {
    const listRoomsCalls = await fulfillFunction(page, 'list_rooms', {
      rooms: [{
        roomId: 'room-browser-oracle',
        code: 'BROW',
        hostName: 'Atlas',
        playerCount: 1,
        maxPlayers: 4,
        rounds: 3,
        armsLevel: 2,
        botCount: 1,
      }],
    });

    await page.getByRole('button', { name: 'Play Online', exact: true }).click();
    await page.getByRole('button', { name: 'Browse public rooms', exact: true }).click();

    const room = page.locator('.online-player-row').filter({ hasText: 'Atlas' });
    await expect(room).toContainText('Best of 3');
    await expect(room).toContainText('Arms Lv 2');
    await expect(room).toContainText('1 CPU');
    await expect(room.getByRole('button', { name: 'Join (1/4)', exact: true })).toBeEnabled();
    await assertSameOriginFunctionCall(page, listRoomsCalls, 'list_rooms');

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .online-player-row .lobby-btn');
  });

  test('Create Room renders a reachable waiting-room fixture without leaving the frame', async ({ page }) => {
    const createRoomCalls = await fulfillFunction(page, 'create_room', {
      roomId: 'room-wait-oracle',
      code: 'WAIT',
      playerId: 'player-host',
      token: ['fixture', 'seat', 'value'].join('-'),
      options: {
        maxPlayers: 4,
        maxWind: 10,
        gravity: 0.15,
        walls: 'open',
        rounds: 3,
        armsLevel: 2,
      },
      players: [
        { id: 'player-host', name: 'Oracle Host', color: '#e84d4d', ready: false },
        { id: 'cpu-1', name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'medium' },
      ],
    });

    await page.getByRole('button', { name: 'Play Online', exact: true }).click();
    await page.locator('#lobby .lobby-name').fill('Oracle Host');
    await page.getByRole('button', { name: 'Create Room', exact: true }).click();

    await expect(page.getByText('Share this code:', { exact: true })).toBeVisible();
    await expect(page.locator('.online-code-char')).toHaveText(['W', 'A', 'I', 'T']);
    const roster = page.locator('.online-player-list');
    await expect(roster.getByText('Oracle Host', { exact: true })).toBeVisible();
    await expect(roster.getByText('CPU 1', { exact: true })).toBeVisible();
    await expect(page.getByText('0/1 human ready', { exact: false })).toContainText('1 CPU');
    await expect(page.getByText('0/1 human ready', { exact: false })).toContainText('waiting for players to join');
    await expect(page.getByRole('button', { name: 'Copy invite link', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ready Up', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Leave', exact: true })).toBeVisible();
    await assertSameOriginFunctionCall(page, createRoomCalls, 'create_room');

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(
      page,
      '#lobby .lobby-btn-row:last-child .lobby-btn:not(.secondary)',
    );
  });
});
