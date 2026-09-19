import { createHash } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPreparationFieldReachable,
  assertPreparationFrameGeometry,
  enterBattleIfBriefed,
  openLocalPreparation,
  openOnlinePreparation,
  openVerifiedOperations,
  selectCommandWorkspace,
} from './support';

const EVIDENCE_DIR = process.env['PREPARATION_FRAME_EVIDENCE_DIR'];
const BASE_URL = process.env['E2E_LIVE_URL'] ?? 'http://localhost:4173/';
const GEOMETRIES = Object.freeze([
  { label: 'wide', width: 3440, height: 1440 },
  { label: 'intermediate', width: 1440, height: 900 },
  { label: 'compact', width: 844, height: 390 },
] as const);

interface EvidenceRecord {
  readonly file: string;
  readonly state: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly png: { readonly width: number; readonly height: number };
  readonly devicePixelRatio: number;
  readonly visualViewport: { readonly width: number; readonly height: number; readonly scale: number } | null;
  readonly sha256: string;
}

async function installIsolatedFixtures(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      access_token: ['e2e', 'public', 'session', 'token'].join('-'),
      refresh_token: ['e2e', 'public', 'refresh', 'token'].join('-'),
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: 'bearer',
      user: {
        id: 'evidence-commander', aud: 'authenticated', role: 'authenticated',
        email: 'evidence@example.test', app_metadata: {}, user_metadata: {},
        created_at: '2026-09-18T00:00:00.000Z',
      },
    }));
  });
}

async function installNetworkFixtures(page: Page): Promise<void> {
  await page.route('**/rest/v1/profiles**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'evidence-commander', display_name: 'Ranger' }),
  }));
  await page.route('**/functions/v1/account_summary', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      matchesPlayed: 0, wins: 0, progressionVersion: 1, totalXp: 0,
      level: 1, levelXp: 0, nextLevelXp: 500,
      verifiedProgression: {
        evidence: 'verified_replay_v2', matchesPlayed: 0, wins: 0,
        progressionVersion: 1, totalXp: 0, level: 1, levelXp: 0, nextLevelXp: 500,
      },
    }),
  }));
  await page.route('**/functions/v1/list_rooms', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ rooms: [{
      roomId: 'room-evidence', code: 'VIEW', hostName: 'Dust Viper',
      playerCount: 1, maxPlayers: 4, rounds: 3, armsLevel: 2,
      botCount: 1, interestRate: 0.2, suddenDeathTurn: 15,
    }] }),
  }));
  await page.route('**/functions/v1/create_room', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roomId: 'room-wait-evidence', code: 'WAIT', playerId: 'evidence-host',
      token: ['evidence', 'seat', 'token'].join('-'),
      options: {
        maxPlayers: 4, maxWind: 10, gravity: 0.15, walls: 'open', rounds: 3,
        armsLevel: 2, botCount: 1, interestRate: 0, suddenDeathTurn: null,
        commandProtocolVersion: 2,
      },
      players: [
        { id: 'evidence-host', name: 'Ranger', color: '#e84d4d', ready: false },
        { id: 'evidence-cpu', name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'medium' },
      ],
    }),
  }));
}

async function openLobby(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player account', exact: true }))
    .toContainText('Ranger');
}

async function returnFromBattle(page: Page): Promise<void> {
  await enterBattleIfBriefed(page);
  const menu = page.locator('#hud .st-hud__menu');
  if (!(await menu.isVisible())) {
    await page.getByRole('button', { name: /Open (?:match|mission) ledger/u }).click();
  }
  await menu.click();
  await page.getByRole('dialog', { name: 'Command Menu', exact: true })
    .getByRole('button', { name: 'Return to Lobby', exact: true }).click();
  await expect(page.locator('#lobby')).toBeVisible();
}

async function capture(
  page: Page,
  records: EvidenceRecord[],
  geometry: (typeof GEOMETRIES)[number],
  state: string,
  owner: string,
): Promise<void> {
  await assertPreparationFrameGeometry(page, owner);
  const frame = page.locator(`${owner}[data-preparation-frame], ${owner} [data-preparation-frame]`);
  await expect(frame).toBeVisible();
  await frame.locator(':scope > .preparation-frame__body').evaluate((body) => {
    body.scrollTop = 0;
  });
  const file = `${geometry.label}--${state}--${geometry.width}x${geometry.height}.png`;
  const bytes = await page.screenshot({
    path: join(EVIDENCE_DIR!, file),
    fullPage: false,
    animations: 'disabled',
  });
  const environment = await page.evaluate(() => ({
    dpr: devicePixelRatio,
    visualViewport: visualViewport
      ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale }
      : null,
  }));
  const png = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  expect(png).toEqual({ width: geometry.width, height: geometry.height });
  records.push({
    file,
    state,
    viewport: { width: geometry.width, height: geometry.height },
    png,
    devicePixelRatio: environment.dpr,
    visualViewport: environment.visualViewport,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

async function createEvidencePage(
  browser: Browser,
  viewport: { readonly width: number; readonly height: number },
): Promise<{ readonly context: BrowserContext; readonly page: Page }> {
  const context = await browser.newContext({ viewport });
  await installIsolatedFixtures(context);
  const page = await context.newPage();
  await installNetworkFixtures(page);
  return { context, page };
}

test.describe('T44 unified preparation evidence', () => {
  test('retains matched native screenshots for every preparation state', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'single native-resolution evidence writer');
    test.skip(!EVIDENCE_DIR, 'set PREPARATION_FRAME_EVIDENCE_DIR to retain evidence');
    test.setTimeout(180_000);
    await mkdir(EVIDENCE_DIR!, { recursive: true });
    const records: EvidenceRecord[] = [];

    for (const geometry of GEOMETRIES) {
      const { context, page } = await createEvidencePage(browser, geometry);
      await openLobby(page);

      await selectCommandWorkspace(page, 'Campaigns', 'ash-road');
      await expect(page.locator('[data-campaign-save-status]')).not.toContainText('Checking');
      await capture(page, records, geometry, 'campaign-empty', '[data-campaign-command-view]');
      await page.getByRole('button', { name: 'Start Ash Road', exact: true }).click();
      await expect(page.locator('#app')).toBeVisible();
      await returnFromBattle(page);
      await selectCommandWorkspace(page, 'Campaigns', 'ash-road');
      await expect(page.getByRole('button', { name: 'Resume Ash Road', exact: true })).toBeVisible();
      await capture(page, records, geometry, 'campaign-resume', '[data-campaign-command-view]');

      await selectCommandWorkspace(page, 'Skirmishes', 'standard');
      await capture(page, records, geometry, 'skirmish-standard', '[data-skirmish-command-view]');
      await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
      await capture(page, records, geometry, 'skirmish-crosswind', '[data-skirmish-command-view]');

      await openLocalPreparation(page);
      await capture(page, records, geometry, 'local-battle', '[data-multiplayer-command-view="local-battle"]');
      await page.getByLabel('Players', { exact: true }).selectOption('4');
      await expect(page.locator('[data-multiplayer-command-view="local-battle"] .lobby-row')).toHaveCount(4);
      await capture(page, records, geometry, 'local-four-player', '[data-multiplayer-command-view="local-battle"]');

      await openVerifiedOperations(page);
      await capture(page, records, geometry, 'verified-operations', '[data-multiplayer-command-view="verified-operations"]');
      await page.getByRole('tab', { name: 'Crosswind Qualification', exact: true }).click();
      await expect(page.locator('[data-verified-challenge="crosswind-qualification"]')).toBeVisible();
      await capture(page, records, geometry, 'verified-qualification', '[data-multiplayer-command-view="verified-operations"]');

      await openOnlinePreparation(page);
      await assertPreparationFieldReachable(
        page,
        '[data-multiplayer-command-view="online"]',
        '#lobby-create-visibility',
      );
      await capture(page, records, geometry, 'online-create', '[data-multiplayer-command-view="online"]');
      await page.getByRole('button', { name: 'Join with a code', exact: true }).click();
      await capture(page, records, geometry, 'online-join', '[data-multiplayer-command-view="online"]');
      await page.getByRole('button', { name: 'Browse public rooms', exact: true }).click();
      await expect(page.getByText('Dust Viper', { exact: true })).toBeVisible();
      await capture(page, records, geometry, 'online-browse', '[data-multiplayer-command-view="online"]');
      await page.getByRole('button', { name: 'Create a room', exact: true }).click();
      await page.locator('[data-multiplayer-command-view="online"] .lobby-name').fill('Ranger');
      await page.getByRole('button', { name: 'Create operation', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Staging operation', exact: true })).toBeVisible();
      await capture(page, records, geometry, 'online-waiting', '[data-multiplayer-command-view="online"]');

      await context.close();
    }

    await writeFile(join(EVIDENCE_DIR!, 'manifest.json'), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      records,
    }, null, 2)}\n`);
  });

  test('records resize continuity with live edits and focus', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'single resize recording writer');
    test.skip(!EVIDENCE_DIR, 'set PREPARATION_FRAME_EVIDENCE_DIR to retain evidence');
    test.setTimeout(90_000);
    const videoDirectory = join(EVIDENCE_DIR!, 'video-tmp');
    await mkdir(videoDirectory, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 3440, height: 1440 },
      recordVideo: { dir: videoDirectory, size: { width: 1440, height: 900 } },
    });
    await installIsolatedFixtures(context);
    const page = await context.newPage();
    await installNetworkFixtures(page);
    const video = page.video();
    await openLobby(page);
    await openOnlinePreparation(page);
    const owner = '[data-multiplayer-command-view="online"]';
    const name = page.locator(`${owner} .lobby-name`);
    const visibility = page.locator(`${owner} #lobby-create-visibility`);
    await name.fill('Resize Sentinel');
    await visibility.selectOption('private');
    await visibility.focus();
    await page.locator(`${owner} [data-preparation-frame]`).evaluate((frame) => {
      frame.setAttribute('data-resize-recording', 'mounted');
    });

    for (const geometry of [GEOMETRIES[1], GEOMETRIES[2], GEOMETRIES[0]]) {
      await page.setViewportSize({ width: geometry.width, height: geometry.height });
      await expect(name).toHaveValue('Resize Sentinel');
      await expect(visibility).toHaveValue('private');
      await expect(visibility).toBeFocused();
      await expect(page.locator(`${owner} [data-preparation-frame]`))
        .toHaveAttribute('data-resize-recording', 'mounted');
      await assertPreparationFrameGeometry(page, owner);
      await page.waitForTimeout(650);
    }

    await openLocalPreparation(page);
    const local = '[data-multiplayer-command-view="local-battle"]';
    const crewName = page.locator(`${local} .lobby-name`).first();
    await crewName.fill('Resize Scout');
    await crewName.focus();
    for (const geometry of [GEOMETRIES[1], GEOMETRIES[2], GEOMETRIES[0]]) {
      await page.setViewportSize({ width: geometry.width, height: geometry.height });
      await expect(crewName).toHaveValue('Resize Scout');
      await expect(crewName).toBeFocused();
      await assertPreparationFrameGeometry(page, local);
      await page.waitForTimeout(650);
    }

    await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
    await page.waitForTimeout(800);
    await selectCommandWorkspace(page, 'Campaigns', 'ash-road');
    await page.waitForTimeout(800);
    await context.close();
    if (!video) throw new Error('Playwright did not create the resize recording');
    await copyFile(await video.path(), join(EVIDENCE_DIR!, 'live-resize-interaction.webm'));
  });
});
