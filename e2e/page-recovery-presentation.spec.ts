import { expect, test, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installConnectedRealtimeFixture } from './realtime-fixture';

test.use({
  channel: 'chromium',
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

async function installRecoveryRoomFixture(page: Page) {
  const players = [
    { id: 't08-human', name: 'Ranger', color: '#e84d4d', ready: false },
    { id: 't08-cpu', name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'easy' },
  ];
  const options = { maxPlayers: 2, maxWind: 6, gravity: 0.15, rulesetVersion: 4,
    commandProtocolVersion: 2, walls: 'open', rounds: 1, armsLevel: 0 };
  let holdRestore = false;
  let heldHeartbeat: Route | null = null;
  let heldHeartbeatCount = 0;
  let historyReadCount = 0;
  const json = (route: Route, body: unknown, status = 200, headers = {}) => route.fulfill({
    status, contentType: 'application/json', headers, body: JSON.stringify(body),
  });
  await page.route('**/functions/v1/create_room', (route) => json(route, {
    roomId: 'room-t08-presentation', code: 'T08P', playerId: players[0]!.id,
    token: randomUUID(), options, players,
  }));
  await page.route('**/functions/v1/ready_up', (route) => json(route, {
    started: true, players: players.map((player) => ({ ...player, ready: true })),
  }));
  await page.route('**/functions/v1/heartbeat', (route) => {
    if (holdRestore) {
      heldHeartbeatCount += 1;
      heldHeartbeat = route;
      return;
    }
    return json(route, { ok: true });
  });
  await page.route('**/functions/v1/leave_room', (route) => json(route, { ok: true }));
  await page.route('**/rest/v1/room_actions**', (route) => {
    historyReadCount += 1;
    return json(route, [], 200, { 'Content-Range': '0-0/0' });
  });
  return {
    hold: () => {
      holdRestore = true;
      heldHeartbeat = null;
      heldHeartbeatCount = 0;
    },
    succeed: async () => {
      await expect.poll(() => heldHeartbeat).not.toBeNull();
      holdRestore = false;
      await json(heldHeartbeat!, { ok: true });
      heldHeartbeat = null;
    },
    fail: async () => {
      await expect.poll(() => heldHeartbeat).not.toBeNull();
      await json(heldHeartbeat!, { error: 'restore_unavailable' }, 503);
    },
    heldHeartbeatCount: () => heldHeartbeatCount,
    historyReadCount: () => historyReadCount,
  };
}

test('successful main recovery restores the exact retained Armory command focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'one native successful focus handoff');
  const recovery = await enterRecoveryMatch(page);
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const host = page.locator('[data-battle-console-portal-host="armory"]');
  const dialog = host.locator('[role="dialog"][aria-label="Armory"]');
  const buy = dialog.locator('button').filter({ hasText: /^Buy / }).first();
  await expect(buy).toBeEnabled();
  await buy.focus();
  await expect(buy).toBeFocused();

  await page.evaluate(() => {
    const events: Array<{ type: string; persisted: boolean }> = [];
    Object.assign(window, { __T08_FOCUS_RESTORE_EVENTS__: events });
    addEventListener('pagehide', (event) => events.push({ type: 'pagehide', persisted: event.persisted }));
    addEventListener('pageshow', (event) => events.push({ type: 'pageshow', persisted: event.persisted }));
  });
  recovery.hold();
  const initialActionJoins = recovery.realtime.joinedTopics
    .filter((topic) => topic.includes('room_actions:room-t08-presentation')).length;
  const initialHistoryReads = recovery.historyReadCount();
  const matchUrl = page.url();
  const awayUrl = new URL(matchUrl);
  awayUrl.search = '?t08-focus-away=1';
  await page.route(awayUrl.href, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>Recovery transit</title>',
  }));
  await page.goto(awayUrl.href);
  await Promise.all([
    page.waitForURL(matchUrl, { waitUntil: 'commit' }),
    page.evaluate(() => history.back()),
  ]);
  await page.waitForFunction(() => (
    (window as Window & { __T08_FOCUS_RESTORE_EVENTS__?: Array<{ type: string; persisted: boolean }> })
      .__T08_FOCUS_RESTORE_EVENTS__?.some(
        (event) => event.type === 'pageshow' && event.persisted,
      ) === true
  ));
  const lifecycleEvents = await page.evaluate(() => (
    (window as Window & { __T08_FOCUS_RESTORE_EVENTS__?: Array<{ type: string; persisted: boolean }> })
      .__T08_FOCUS_RESTORE_EVENTS__ ?? []
  ));
  expect(lifecycleEvents).toEqual(expect.arrayContaining([
    { type: 'pagehide', persisted: true },
    { type: 'pageshow', persisted: true },
  ]));
  await expect.poll(() => recovery.realtime.joinedTopics
    .filter((topic) => topic.includes('room_actions:room-t08-presentation')).length)
    .toBeGreaterThan(initialActionJoins);
  const notice = page.locator('.st-hud__turnwatch--page-recovery');
  await expect(notice).toContainText('Restoring game controls…');
  await expect(buy).toBeDisabled();
  await expect(host).toHaveAttribute('inert', '');

  await recovery.succeed();
  await expect(notice).toBeHidden();
  expect(recovery.heldHeartbeatCount()).toBe(1);
  expect(recovery.historyReadCount()).toBeGreaterThan(initialHistoryReads);
  await expect(host).not.toHaveAttribute('inert', '');
  await expect(host).not.toHaveAttribute('aria-hidden', 'true');
  await expect(buy).toBeEnabled();
  await expect(buy).toBeFocused();
});

async function recoveryGeometry(page: Page) {
  return page.locator('.st-hud__turnwatch--page-recovery').evaluate((notice) => {
    const box = notice.getBoundingClientRect();
    const scale = Number.parseFloat(
      getComputedStyle(document.querySelector('#app')!).getPropertyValue('--battle-ui-scale'),
    );
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      box: box.toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
      effectiveFontPx: Number.parseFloat(getComputedStyle(notice).fontSize) * scale,
      ownsHit: !!hit && (hit === notice || notice.contains(hit)),
    };
  });
}

async function enterRecoveryMatch(page: Page) {
  const realtime = await installConnectedRealtimeFixture(page);
  const recovery = await installRecoveryRoomFixture(page);
  await page.addInitScript(() => localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped'));
  await page.goto('./');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await page.getByRole('button', { name: 'Play Online', exact: true }).click();
  await page.locator('#lobby .lobby-name').fill('Ranger');
  await page.locator('.lobby-field').filter({ hasText: 'CPU opponents' })
    .locator('select').first().selectOption('1');
  await page.getByRole('button', { name: 'Create operation', exact: true }).click();
  await page.getByRole('button', { name: 'Ready Up', exact: true }).click();
  await realtime.expectJoinedTopics([
    'room_actions:room-t08-presentation', 'rooms:game:room-t08-presentation',
  ]);
  await expect(page.locator('[data-connection-state="connected"]')).toHaveCount(1);
  return { ...recovery, realtime };
}

// Synthetic lifecycle events isolate presentation and authority gating here.
// page-restoration.spec.ts separately requires real persisted browser navigation.
test('compact recovery stays readable and actionable above an open Armory', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-touch', 'compact rendered recovery contract');
  const recovery = await enterRecoveryMatch(page);

  const armoryTrigger = page.getByRole('button', { name: 'Open Armory', exact: true });
  await armoryTrigger.waitFor({ state: 'visible' });
  await armoryTrigger.click();
  const armory = page.getByRole('dialog', { name: 'Armory', exact: true });
  await expect(armory).toBeVisible();

  recovery.hold();
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  const notice = page.locator('.st-hud__turnwatch--page-recovery');
  await expect(notice).toContainText('Restoring game controls…');
  const pending = await recoveryGeometry(page);
  expect(pending.box.left).toBeGreaterThanOrEqual(0);
  expect(pending.box.top).toBeGreaterThanOrEqual(0);
  expect(pending.box.right).toBeLessThanOrEqual(pending.viewport.width);
  expect(pending.box.bottom).toBeLessThanOrEqual(pending.viewport.height);
  expect(pending.effectiveFontPx).toBeGreaterThanOrEqual(13.9);
  expect(pending.ownsHit).toBe(true);
  expect(await page.locator(
    '[data-battle-console-action], [data-battle-console-armory-item] button',
  ).evaluateAll(
    (buttons) => buttons.length > 0
      && buttons.every((button) => (button as HTMLButtonElement).disabled),
  )).toBe(true);

  await recovery.fail();
  await expect(notice).toContainText('Game recovery failed. Return to the lobby or reload.');
  const failed = await recoveryGeometry(page);
  expect(failed.box.left).toBeGreaterThanOrEqual(0);
  expect(failed.box.top).toBeGreaterThanOrEqual(0);
  expect(failed.box.right).toBeLessThanOrEqual(failed.viewport.width);
  expect(failed.box.bottom).toBeLessThanOrEqual(failed.viewport.height);
  expect(failed.effectiveFontPx).toBeGreaterThanOrEqual(13.9);
  expect(failed.ownsHit).toBe(true);
  const leave = notice.getByRole('button', { name: 'Return to lobby', exact: true });
  const button = await leave.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const scale = Number.parseFloat(
      getComputedStyle(document.querySelector('#app')!).getPropertyValue('--battle-ui-scale'),
    );
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { box: box.toJSON(), effectiveFontPx: Number.parseFloat(getComputedStyle(element).fontSize) * scale,
      ownsHit: !!hit && (hit === element || element.contains(hit)) };
  });
  expect(button.box.width).toBeGreaterThanOrEqual(44);
  expect(button.box.height).toBeGreaterThanOrEqual(44);
  expect(button.effectiveFontPx).toBeGreaterThanOrEqual(13.9);
  expect(button.ownsHit).toBe(true);

  await leave.click();
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(notice).toBeHidden();
  await expect(armory).toBeHidden();
});

for (const panel of [
  {
    name: 'Armory',
    host: 'armory',
    open: 'Open Armory',
    initialFocus: 'Close Armory',
  },
  {
    name: 'Battle Settings',
    host: 'settings',
    open: 'Battle settings',
    initialFocus: 'Trajectory guide',
  },
] as const) {
  test(`recovery takes keyboard and AT ownership from an open ${panel.name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'one native keyboard oracle per panel');
    const recovery = await enterRecoveryMatch(page);
    await page.getByRole('button', { name: panel.open, exact: true }).click();
    const portalHost = page.locator(`[data-battle-console-portal-host="${panel.host}"]`);
    const dialog = portalHost.locator(`[role="dialog"][aria-label="${panel.name}"]`);
    await expect(dialog).toBeVisible();
    const initialFocus = dialog.getByRole(
      panel.name === 'Battle Settings' ? 'switch' : 'button',
      { name: panel.initialFocus, exact: true },
    );
    await initialFocus.focus();
    await expect(initialFocus).toBeFocused();

    recovery.hold();
    await page.evaluate(() => {
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    const notice = page.locator('.st-hud__turnwatch--page-recovery');
    await expect(notice).toContainText('Restoring game controls…');
    await expect(notice).toHaveAttribute('role', 'status');
    await expect(notice).toHaveAttribute('aria-live', 'assertive');
    await expect(notice).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(notice).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(notice).toBeFocused();
    await expect(page.locator('#hud')).toHaveAttribute('inert', '');
    await expect(portalHost).toHaveAttribute('inert', '');
    await expect(portalHost).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('dialog', { name: panel.name, exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(notice).toBeFocused();

    await recovery.fail();
    await expect(notice).toHaveAttribute('role', 'alertdialog');
    await expect(notice).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('alertdialog')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const leave = notice.getByRole('button', { name: 'Return to lobby', exact: true });
    await expect(leave).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(leave).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(leave).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(leave).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#lobby')).toBeVisible();
    await expect(dialog).toBeHidden();
  });
}

test('pending recovery prevents a late Battle Settings accessibility owner', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'one native background-pointer oracle');
  const recovery = await enterRecoveryMatch(page);
  const settings = page.getByRole('button', { name: 'Battle settings', exact: true });
  const settingsBox = await settings.boundingBox();
  expect(settingsBox).not.toBeNull();
  const quickChat = page.getByRole('button', { name: 'Open quick chat', exact: true });
  const quickChatBox = await quickChat.boundingBox();
  expect(quickChatBox).not.toBeNull();

  recovery.hold();
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  const notice = page.locator('.st-hud__turnwatch--page-recovery');
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toBeFocused();
  await expect(page.locator('#hud')).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab');
  await expect(notice).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(notice).toBeFocused();

  await page.mouse.click(
    quickChatBox!.x + quickChatBox!.width / 2,
    quickChatBox!.y + quickChatBox!.height / 2,
  );
  await expect(page.locator('.st-hud__quick-chat-panel')).toHaveClass(/st-hud__quick-chat-panel--hidden/);
  await expect(page.locator('.st-hud__quick-chat-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(notice).toBeFocused();
  await page.mouse.click(
    settingsBox!.x + settingsBox!.width / 2,
    settingsBox!.y + settingsBox!.height / 2,
  );
  await expect(page.locator('[data-battle-console-portal-host="settings"]')).toBeEmpty();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await recovery.fail();
  await expect(page.getByRole('alertdialog')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
