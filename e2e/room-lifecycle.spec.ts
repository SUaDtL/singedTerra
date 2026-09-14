import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installConnectedRealtimeFixture } from './realtime-fixture';

const roomId = 'a0000000-0000-4000-8000-000000000001';
const credential = randomUUID();
const room = {
  id: roomId, code: 'ROOM', seed: 42, status: 'active', abandoned_at: null,
  options: { maxPlayers: 2, maxWind: 6, gravity: 0.15, rounds: 1, rulesetVersion: 4,
    commandProtocolVersion: 2, roomLifecycleVersion: 1 },
  players: [
    { id: 'browser-human', name: 'Ranger', color: '#e84d4d', ready: true },
    { id: 'browser-peer', name: 'Peer', color: '#4d8ce8', ready: true },
  ],
};

const rematchSourceId = 'rematch-source';
const rematchSuccessorId = 'rematch-successor';
const rematchCredential = randomUUID();
const rematchPlayers = [
  { id: 'rematch-human-a', name: 'Ranger', color: '#e84d4d' },
  { id: 'rematch-human-b', name: 'Gunner', color: '#4d8ce8' },
];
const rematchOptions = {
  maxPlayers: 2,
  maxWind: 0,
  gravity: 0.15,
  rounds: 1,
  armsLevel: 4,
  rulesetVersion: 4,
  commandProtocolVersion: 2,
  roomLifecycleVersion: 1,
};
const terminalRematchRow = {
  id: 'rematch-history-0',
  room_id: rematchSourceId,
  seq: 0,
  player_id: 'rematch-human-a',
  action: {
    type: 'fire',
    weapon: 'heavy_missile',
    angle: 32.37783184321597,
    power: 99.39452867098153,
    commandActor: { role: 'engine-seat', tankId: 'p1' },
  },
  created_at: '2026-09-14T00:00:00.000Z',
  command_version: 2,
  intent_id: 'rematch-history-0',
  expected_revision: 0,
  submitted_by: 'rematch-human-a',
  command_ends_turn: true,
  command_next_index: 0,
  command_round_over: false,
};

type RematchFixtureScenario = 'http-only' | 'overlap' | 'timeout';

interface RematchFixtureControls {
  joinedTopics: string[];
  restartRequests: Array<Record<string, unknown>>;
  successorLookups: string[];
  successorHeartbeats: Array<Record<string, unknown>>;
  journeyEvents: string[];
  emitSuccessorUpdate: () => void;
  releaseRestart: () => void;
  releaseSuccessorLookup: () => void;
  expectSourceRealtimeReady: () => Promise<void>;
  expectSuccessorRealtimeReady: () => Promise<void>;
}

async function installTerminalRematchFixture(
  page: Page,
  scenario: RematchFixtureScenario,
): Promise<RematchFixtureControls> {
  const realtime = await installConnectedRealtimeFixture(page);
  let releaseRestart = () => {};
  const restartGate = new Promise<void>((resolve) => { releaseRestart = resolve; });
  let releaseSuccessorLookup = () => {};
  const successorGate = new Promise<void>((resolve) => { releaseSuccessorLookup = resolve; });
  const restartRequests: Array<Record<string, unknown>> = [];
  const successorLookups: string[] = [];
  const successorHeartbeats: Array<Record<string, unknown>> = [];
  const journeyEvents: string[] = [];
  const sourceRoom = {
    id: rematchSourceId,
    code: 'SOURCE',
    seed: 42,
    status: 'active',
    abandoned_at: null,
    options: rematchOptions,
    players: rematchPlayers,
  };
  const successorRoom = {
    ...sourceRoom,
    id: rematchSuccessorId,
    code: 'NEXT',
    seed: 43,
  };

  await page.addInitScript(({ id, token }) => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    localStorage.setItem('singedterra:session', JSON.stringify({
      roomId: id,
      roomCode: 'SOURCE',
      playerId: 'rematch-human-a',
    }));
    localStorage.setItem('singedterra:seat:rematch-human-a', token);
  }, { id: rematchSourceId, token: rematchCredential });
  await page.route('**/rest/v1/rooms**', async (route) => {
    const requestedId = new URL(route.request().url()).searchParams.get('id')?.replace('eq.', '');
    if (requestedId === rematchSuccessorId) {
      successorLookups.push(route.request().url());
      journeyEvents.push('successor-lookup');
      if (scenario === 'overlap') await successorGate;
      await route.fulfill({ json: [successorRoom] }).catch(() => undefined);
      return;
    }
    await route.fulfill({ json: [sourceRoom] });
  });
  await page.route('**/rest/v1/room_actions**', async (route) => {
    const url = new URL(route.request().url());
    const requestedRoom = url.searchParams.get('room_id')?.replace('eq.', '');
    const minimumSeq = Number(url.searchParams.get('seq')?.replace('gte.', '') ?? 0);
    const rows = requestedRoom === rematchSourceId && minimumSeq === 0
      ? [terminalRematchRow]
      : [];
    await route.fulfill({
      json: rows,
      headers: { 'Content-Range': rows.length === 0 ? '0-0/0' : '0-0/1' },
    });
  });
  await page.route('**/functions/v1/heartbeat', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body['roomId'] === rematchSuccessorId) successorHeartbeats.push(body);
    await route.fulfill({ json: { ok: true } });
  });
  for (const endpoint of ['finish_game', 'claim_match']) {
    await page.route(`**/functions/v1/${endpoint}`, route => route.fulfill({ json: { ok: true } }));
  }
  await page.route('**/functions/v1/restart_game', async (route) => {
    restartRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    journeyEvents.push('restart-request');
    if (scenario !== 'http-only') await restartGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, roomId: rematchSuccessorId }),
    }).catch(() => undefined);
    journeyEvents.push('restart-response');
  });

  await page.goto('./');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await page.getByRole('button', { name: /Rejoin your game/ }).click();
  await expect(page.locator('.st-hud__overlay--victory')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ranger wins', exact: true })).toBeVisible();

  return {
    joinedTopics: realtime.joinedTopics,
    restartRequests,
    successorLookups,
    successorHeartbeats,
    journeyEvents,
    emitSuccessorUpdate: () => {
      realtime.emitPostgresChange(`rooms:game:${rematchSourceId}`, 'UPDATE', {
        ...sourceRoom,
        rematch_room_id: rematchSuccessorId,
      });
      journeyEvents.push('successor-update');
    },
    releaseRestart,
    releaseSuccessorLookup,
    expectSourceRealtimeReady: () => realtime.expectJoinedTopics([
      `room_actions:${rematchSourceId}`,
      `rooms:game:${rematchSourceId}`,
      `quick_chat:${rematchSourceId}`,
    ]),
    expectSuccessorRealtimeReady: () => realtime.expectJoinedTopics([
      `room_actions:${rematchSuccessorId}`,
      `rooms:game:${rematchSuccessorId}`,
      `quick_chat:${rematchSuccessorId}`,
    ]),
  };
}

interface HistoryFixtureControls {
  historyRequests: string[];
  releaseEarlierPage: () => void;
  releaseLateHistory: () => void;
  expectRealtimeReady: () => Promise<void>;
}

async function resumeFixture(page: Page, options: {
  blackHoleHistory?: boolean;
  cappedHistory?: Array<Record<string, unknown>>;
  historyPageSize?: number;
} = {}): Promise<HistoryFixtureControls> {
  const realtime = await installConnectedRealtimeFixture(page);
  let releaseEarlierPage = () => {};
  const earlierPage = new Promise<void>((resolve) => { releaseEarlierPage = resolve; });
  let releaseLateHistory = () => {};
  const lateHistory = new Promise<void>((resolve) => { releaseLateHistory = resolve; });
  const historyRequests: string[] = [];
  let historyRequestCount = 0;
  await page.addInitScript(({ id, token }) => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    localStorage.setItem('singedterra:session', JSON.stringify({ roomId: id, roomCode: 'ROOM', playerId: 'browser-human' }));
    localStorage.setItem('singedterra:seat:browser-human', token);
  }, { id: roomId, token: credential });
  await page.route('**/rest/v1/rooms**', route => route.fulfill({ json: [room] }));
  await page.route('**/rest/v1/room_actions**', async (route) => {
    const url = new URL(route.request().url());
    historyRequests.push(url.search);
    historyRequestCount += 1;
    if (options.blackHoleHistory && historyRequestCount === 1) await lateHistory;
    if (options.cappedHistory) {
      const ascending = url.searchParams.get('order')?.includes('.asc') === true;
      if (ascending) await earlierPage;
      const pageSize = options.historyPageSize ?? options.cappedHistory.length;
      const minimumSeq = Number(url.searchParams.get('seq')?.replace('gte.', '') ?? 0);
      const eligible = options.cappedHistory.filter((row) => Number(row['seq']) >= minimumSeq);
      const body = ascending
        ? eligible.slice(0, pageSize)
        : eligible.slice(-pageSize).reverse();
      await route.fulfill({ json: body, headers: { 'Content-Range': `0-${body.length - 1}/${options.cappedHistory.length}` } });
      return;
    }
    await route.fulfill({ json: [], headers: { 'Content-Range': '0-0/0' } }).catch(() => undefined);
  });
  await page.goto('./');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await page.getByRole('button', { name: /Rejoin your game/ }).click();
  return {
    historyRequests,
    releaseEarlierPage,
    releaseLateHistory,
    expectRealtimeReady: () => realtime.expectJoinedTopics([
      `room_actions:${roomId}`,
      `rooms:game:${roomId}`,
    ]),
  };
}

test('black-holed history recovery returns to a visible retry and ignores its late completion', async ({ page }, testInfo) => {
  const fixture = await resumeFixture(page, { blackHoleHistory: true });

  const alert = page.getByRole('alert').filter({
    hasText: 'Game recovery timed out. Return to Online and try joining again.',
  });
  await expect(alert).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole('button', { name: 'Retry game recovery', exact: true })).toBeVisible();
  const box = await alert.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => localStorage.getItem('singedterra:session'))).toContain(roomId);
  await page.screenshot({ path: testInfo.outputPath('history-timeout-recovery.png') });
  await page.getByRole('button', { name: 'Retry game recovery', exact: true }).click();
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
  await fixture.expectRealtimeReady();
  fixture.releaseLateHistory();
  await page.waitForTimeout(100);
  await expect(page.locator('[data-battle-console-surface]')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('singedterra:session'))).toContain(roomId);
});

test('capped action history withholds the battle until its earlier page is complete', async ({ page }) => {
  test.setTimeout(30_000);
  const row = (seq: number, action: Record<string, unknown>) => ({
    id: `history-${seq}`,
    room_id: roomId,
    seq,
    player_id: 'browser-human',
    action: { ...action, commandActor: { role: 'engine-seat', tankId: 'p1' } },
    created_at: '2026-09-14T00:00:00.000Z',
    command_version: 2,
    intent_id: `history-${seq}`,
    expected_revision: seq,
    submitted_by: 'browser-human',
    command_ends_turn: false,
    command_next_index: null,
    command_round_over: false,
  });
  const history = [
    row(0, { type: 'buy', weapon: 'missile' }),
    row(1, { type: 'move', delta: 8 }),
  ];
  const fixture = await resumeFixture(page, { cappedHistory: history, historyPageSize: 1 });

  await expect.poll(() => fixture.historyRequests.length).toBe(2);
  expect(fixture.historyRequests[0]).toContain('seq=gte.0');
  expect(fixture.historyRequests[0]).toContain('order=seq.desc');
  expect(fixture.historyRequests[1]).toContain('seq=gte.0');
  expect(fixture.historyRequests[1]).toContain('order=seq.asc');
  await expect(page.locator('[data-battle-console-surface]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toHaveCount(0);
  fixture.releaseEarlierPage();
  await expect(page.locator('[data-battle-console-surface]')).toHaveAttribute('data-battle-console-ready', 'true');
  await fixture.expectRealtimeReady();
  await expect(page.locator('[data-semantic-key="node:span:100 fuel remaining:19"]')).toHaveText('92');
  await page.getByRole('button', { name: 'Open Armory', exact: true }).click();
  const missile = page.getByRole('dialog', { name: 'Armory', exact: true })
    .locator('[data-battle-console-armory-item]')
    .filter({ has: page.getByRole('heading', { name: 'Missile', exact: true }) });
  await expect(missile.locator('[data-battle-console-owned]')).toHaveText('9 ammo');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
});

async function expectSingleSuccessorBattle(
  page: Page,
  fixture: RematchFixtureControls,
): Promise<void> {
  await expect(page.locator('.st-hud__overlay--victory')).toBeHidden();
  await expect(page.locator('[data-battle-console-surface]'))
    .toHaveAttribute('data-battle-console-ready', 'true');
  await fixture.expectSuccessorRealtimeReady();
  await expect.poll(() => fixture.successorHeartbeats.length).toBe(1);
  expect(fixture.successorHeartbeats[0]).toEqual({
    roomId: rematchSuccessorId,
    playerId: 'rematch-human-a',
    token: rematchCredential,
  });
  expect(fixture.joinedTopics.filter((topic) => (
    topic.includes(`room_actions:${rematchSuccessorId}`)
  ))).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('singedterra:session')))
    .toContain(rematchSuccessorId);
}

test('terminal Play again follows its HTTP successor when the room UPDATE is missed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'one causal rematch journey; viewport contracts run separately');
  test.setTimeout(30_000);
  const fixture = await installTerminalRematchFixture(page, 'http-only');
  await fixture.expectSourceRealtimeReady();
  await page.getByRole('button', { name: 'Play again', exact: true }).click();

  await expect.poll(() => fixture.restartRequests.length).toBe(1);
  expect(fixture.restartRequests[0]).toEqual({
    roomId: rematchSourceId,
    playerId: 'rematch-human-a',
    token: rematchCredential,
  });
  await expect.poll(() => fixture.successorLookups.length).toBe(1);
  expect(fixture.journeyEvents).not.toContain('successor-update');
  await expectSingleSuccessorBattle(page, fixture);
});

test('duplicate room UPDATEs and the overlapping HTTP response construct one successor', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'one causal rematch journey; viewport contracts run separately');
  test.setTimeout(30_000);
  const fixture = await installTerminalRematchFixture(page, 'overlap');
  await fixture.expectSourceRealtimeReady();
  await page.getByRole('button', { name: 'Play again', exact: true }).click();

  await expect.poll(() => fixture.restartRequests.length).toBe(1);
  fixture.emitSuccessorUpdate();
  fixture.emitSuccessorUpdate();
  await expect.poll(() => fixture.successorLookups.length).toBe(1);
  fixture.releaseRestart();
  await expect.poll(() => fixture.journeyEvents).toContain('restart-response');
  await page.waitForTimeout(100);
  expect(fixture.successorLookups).toHaveLength(1);
  fixture.releaseSuccessorLookup();
  await expectSingleSuccessorBattle(page, fixture);
});

test('terminal Play again remains on its report when a late HTTP completion misses the deadline', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-fine', 'one causal rematch journey; viewport contracts run separately');
  test.setTimeout(20_000);
  const fixture = await installTerminalRematchFixture(page, 'timeout');
  await fixture.expectSourceRealtimeReady();
  await page.getByRole('button', { name: 'Play again', exact: true }).click();

  await expect.poll(() => fixture.restartRequests.length).toBe(1);
  await expect(page.locator('.st-hud__toast')).toContainText(
    'Rematch recovery timed out. Try Restart again or return to the lobby.',
    { timeout: 7_000 },
  );
  fixture.releaseRestart();
  await expect.poll(() => fixture.journeyEvents).toContain('restart-response');
  await page.waitForTimeout(100);
  expect(fixture.successorLookups).toHaveLength(0);
  expect(fixture.joinedTopics.some((topic) => topic.includes(rematchSuccessorId))).toBe(false);
  await expect(page.locator('.st-hud__overlay--victory')).toBeVisible();
});

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
