import { expect, test, type Page } from '@playwright/test';

const roomId = 'a0000000-0000-4000-8000-000000000001';
const credential = 'synthetic-browser-seat-credential';
const room = {
  id: roomId, code: 'ROOM', seed: 42, status: 'active', abandoned_at: null,
  options: { maxPlayers: 2, maxWind: 6, gravity: 0.15, rounds: 1, rulesetVersion: 4,
    commandProtocolVersion: 2, roomLifecycleVersion: 1 },
  players: [
    { id: 'browser-human', name: 'Ranger', color: '#e84d4d', ready: true },
    { id: 'browser-peer', name: 'Peer', color: '#4d8ce8', ready: true },
  ],
};

async function resumeFixture(page: Page) {
  await page.addInitScript(({ id, token }) => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    localStorage.setItem('singedterra:session', JSON.stringify({ roomId: id, roomCode: 'ROOM', playerId: 'browser-human' }));
    localStorage.setItem('singedterra:seat:browser-human', token);
  }, { id: roomId, token: credential });
  await page.route('**/rest/v1/rooms**', route => route.fulfill({ json: [room] }));
  await page.route('**/rest/v1/room_actions**', route => route.fulfill({ json: [], headers: { 'Content-Range': '0-0/0' } }));
  await page.goto('./');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await page.getByRole('button', { name: /Rejoin your game/ }).click();
}

test('resumed online game sends authenticated presence and explicit Quit from the rendered menu', async ({ page }, testInfo) => {
  const heartbeats: unknown[] = [];
  const quits: unknown[] = [];
  await page.route('**/functions/v1/heartbeat', route => {
    heartbeats.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/functions/v1/leave_room', route => {
    quits.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, roomDeleted: false } });
  });
  await resumeFixture(page);
  await expect.poll(() => heartbeats.length).toBe(1);
  expect(heartbeats[0]).toEqual({ roomId, playerId: 'browser-human', token: credential });
  const quickChat = page.getByRole('button', { name: 'Open quick chat', exact: true });
  await quickChat.click();
  await expect(quickChat).toHaveAttribute('aria-expanded', 'true');
  await quickChat.click();
  await expect(quickChat).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: testInfo.outputPath('room-controls.png') });
  const menuButton = page.locator('#hud .st-hud__menu');
  if (!await menuButton.isVisible()) await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await menuButton.click();
  await page.getByRole('dialog', { name: 'Command Menu' }).getByRole('button', { name: 'Return to Lobby' }).click();
  await expect.poll(() => quits.length).toBe(1);
  expect(quits[0]).toEqual({ roomId, playerId: 'browser-human', token: credential });
  await expect(page.locator('#lobby')).toBeVisible();
});

test('missed abandonment broadcast is recovered from heartbeat with a visible contained explanation', async ({ page }, testInfo) => {
  let respond: (() => Promise<void>) | undefined;
  await page.route('**/functions/v1/heartbeat', route => {
    respond = () => route.fulfill({ status: 409, json: { error: 'room_abandoned' } });
  });
  await resumeFixture(page);
  await expect.poll(() => typeof respond).toBe('function');
  await respond!();
  const notice = page.getByText('This game ended after everyone left. Return to the lobby to start a new game.', { exact: true });
  await expect(notice).toBeVisible();
  const box = await notice.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => localStorage.getItem('singedterra:session'))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('room-abandoned.png') });
});
