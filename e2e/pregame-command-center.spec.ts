import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import {
  ASH_ROAD_COMBAT_PROFILE_REFERENCE,
  resolveCampaignCombatProfile,
} from '../shared/src/campaign/combatProfiles';
import { parseCampaignRun } from '../shared/src/campaign/definitions';
import { createCampaignCheckpoint } from '../client/src/campaign/checkpoint';
import { ASH_ROAD_EPISODE } from '../client/src/campaign/content/episode';
import { createCampaignLoadout } from '../client/src/campaign/loadout';
import {
  campaignStorageBindingFromRunState,
  createCampaignReplayPayload,
  type CampaignReplayPayload,
} from '../client/src/campaign/replay';
import { createCampaignRunState, parseCampaignRunState } from '../client/src/campaign/runReducer';
import {
  CAMPAIGN_STORAGE_SCHEMA_VERSION,
  type CampaignStorageRecord,
} from '../client/src/campaign/storage';
import {
  assertLobbyControlReachable,
  assertLobbyFrame,
  enterBattleIfBriefed,
  gotoLobby,
  selectCommandWorkspace,
} from './support';

const EVIDENCE_DIR = process.env['COMMAND_CENTER_EVIDENCE_DIR'];
const REQUIRE_EVIDENCE = process.env['COMMAND_CENTER_REQUIRE_EVIDENCE'] === '1';
const SELECTION_KEY = 'singedterra.command-center.selection.v1';
const COMMAND_CATEGORIES = ['Campaigns', 'Skirmishes', 'Multiplayer'];

function campaignRecord(revision = 4, encounterIndex = 0): CampaignStorageRecord {
  const route = ASH_ROAD_EPISODE.routes[0]!;
  const profile = resolveCampaignCombatProfile(ASH_ROAD_COMBAT_PROFILE_REFERENCE);
  const run = parseCampaignRun({
    kind: 'campaign-run',
    runVersion: 1,
    runId: 'ash-road-e2e-run',
    episodeId: ASH_ROAD_EPISODE.episodeId,
    episodeVersion: ASH_ROAD_EPISODE.episodeVersion,
    episodeContentDigest: ASH_ROAD_EPISODE.contentDigest,
    combatProfileId: profile.profileId,
    combatProfileVersion: profile.profileVersion,
    combatProfileContentDigest: profile.contentDigest,
    routeId: route.id,
    encounterIds: route.encounterIds,
    currentEncounterIndex: encounterIndex,
  });
  if (!run) throw new Error('Invalid campaign browser fixture run');
  const encounter = ASH_ROAD_EPISODE.encounters.find(
    ({ encounterId }) => encounterId === route.encounterIds[encounterIndex],
  );
  if (!encounter) throw new Error('Invalid campaign browser fixture encounter');
  const checkpoint = createCampaignCheckpoint({
    run,
    encounter,
    combatProfile: profile,
    attempt: 1,
    supplies: 2,
  });
  const runState = createCampaignRunState(checkpoint, createCampaignLoadout());
  return Object.freeze({
    kind: 'campaign-storage-record',
    schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
    slotId: 'ash-road-local',
    revision,
    binding: campaignStorageBindingFromRunState(runState),
    payload: createCampaignReplayPayload({ runState, acceptedCommands: [] }),
  });
}

function completedCampaignRecord(revision = 4): CampaignStorageRecord {
  const current = campaignRecord(
    revision,
    ASH_ROAD_EPISODE.routes[0]!.encounterIds.length - 1,
  );
  const payload = current.payload as CampaignReplayPayload;
  const { runState } = payload;
  const completed = parseCampaignRunState({
    ...runState,
    missionLoadout: runState.loadout,
    pendingCheckpointDecision: { resultAttempt: runState.attempt },
    appliedResults: [{
      kind: 'campaign-result-receipt',
      receiptVersion: 1,
      result: {
        kind: 'campaign-result',
        resultVersion: 1,
        runId: runState.checkpoint.run.runId,
        encounterId: runState.checkpoint.encounter.encounterId,
        encounterVersion: runState.checkpoint.encounter.encounterVersion,
        encounterContentDigest: runState.checkpoint.encounter.contentDigest,
        attempt: runState.attempt,
        outcome: 'success',
        commitments: 1,
      },
      intactSupplyDrumIds: ['siege-drum'],
      suppliesAwarded: 0,
    }],
  });
  if (!completed) throw new Error('Invalid completed campaign browser fixture');
  return Object.freeze({
    ...current,
    payload: createCampaignReplayPayload({ runState: completed, acceptedCommands: [] }),
  });
}

type CommandGeometry = Readonly<{
  label: string;
  viewport: Readonly<{ width: number; height: number }>;
  narrow: boolean;
  evidenceName?: string;
}>;

const GEOMETRIES = Object.freeze({
  wide: { label: 'wide', viewport: { width: 1920, height: 1080 }, narrow: false, evidenceName: 'command-center-empty-1920x1080.png' },
  standard: { label: 'standard', viewport: { width: 1440, height: 900 }, narrow: false, evidenceName: 'command-center-empty-1440x900.png' },
  ultrawide: { label: 'ultrawide', viewport: { width: 3440, height: 1440 }, narrow: false, evidenceName: 'command-center-empty-3440x1440.png' },
  compact: { label: 'compact touch', viewport: { width: 844, height: 390 }, narrow: true, evidenceName: 'command-center-empty-844x390.png' },
  portrait: { label: 'portrait', viewport: { width: 390, height: 844 }, narrow: true, evidenceName: 'command-center-empty-390x844.png' },
  minimum: { label: 'minimum portrait', viewport: { width: 320, height: 568 }, narrow: true, evidenceName: 'command-center-empty-320x568.png' },
  short: { label: 'short landscape', viewport: { width: 1024, height: 500 }, narrow: true },
} as const satisfies Record<string, CommandGeometry>);

async function openAshRoad(page: Page): Promise<void> {
  await gotoLobby(page);
  const campaignRail = page.locator('.command-center__category-rail')
    .getByRole('button', { name: 'Campaigns', exact: true });
  if (await campaignRail.isVisible()) {
    await campaignRail.click();
  } else {
    await page.getByRole('button', { name: 'Modes', exact: true }).click();
    const sheet = page.getByRole('navigation', { name: 'Modes', exact: true });
    await sheet.getByRole('button', { name: 'Campaigns', exact: true }).click();
    await page.getByRole('button', { name: 'Close Modes', exact: true }).click();
  }
  await expect(page.locator('.command-center__item[data-command-item="ash-road"]'))
    .toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-campaign-command-view]')).toBeVisible();
  await expect(page.locator('[data-campaign-save-status]')).not.toContainText('Checking');
}

async function assertTargets(page: Page): Promise<void> {
  const targets = await page.locator(
    '#lobby .command-center button, #lobby .command-center select, '
      + '#lobby .command-center summary, #lobby .account-panel button',
  ).evaluateAll((elements) => elements.flatMap((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width === 0 || box.height === 0 || style.display === 'none' || style.visibility === 'hidden') {
      return [];
    }
    return [{
      label: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 80) ?? element.tagName,
      width: box.width,
      height: box.height,
    }];
  }));

  expect(targets.length, 'command center should expose rendered controls').toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.width, `${target.label} target width`).toBeGreaterThanOrEqual(43.5);
    expect(target.height, `${target.label} target height`).toBeGreaterThanOrEqual(43.5);
  }
  const primary = await page.locator('[data-command-primary]').boundingBox();
  expect(primary, 'campaign primary action should render').not.toBeNull();
  expect(primary!.height, 'campaign primary action should be at least 60 CSS pixels tall')
    .toBeGreaterThanOrEqual(59.5);
}

async function assertCommandHeaderGeometry(page: Page, geometry: CommandGeometry): Promise<void> {
  const header = await page.locator('.lobby-command-rail').evaluate((rail) => {
    const bounds = (selector: string, root: Element = rail) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing command-header segment ${selector}`);
      const box = element.getBoundingClientRect();
      return { ...box.toJSON(), display: getComputedStyle(element).display };
    };
    const dossier = rail.querySelector<HTMLElement>('.lobby-command-rail__dossier');
    if (!dossier) throw new Error('Missing command-header dossier segment');
    const box = rail.getBoundingClientRect();
    return {
      rail: box.toJSON(),
      brand: bounds('.lobby-command-rail__brand'),
      context: bounds('.lobby-command-rail__context'),
      dossier: bounds('.lobby-command-rail__dossier'),
      commanderState: bounds('.account-panel__record, button', dossier),
    };
  });

  for (const [name, segment] of Object.entries({
    brand: header.brand,
    context: header.context,
    dossier: header.dossier,
  })) {
    expect(segment.display, `${geometry.label} ${name} remains represented`).not.toBe('none');
    expect(segment.left, `${geometry.label} ${name} begins inside the rail`)
      .toBeGreaterThanOrEqual(header.rail.left - 1);
    expect(segment.right, `${geometry.label} ${name} ends inside the rail`)
      .toBeLessThanOrEqual(header.rail.right + 1);
    expect(segment.top, `${geometry.label} ${name} begins inside the rail`)
      .toBeGreaterThanOrEqual(header.rail.top - 1);
    expect(segment.bottom, `${geometry.label} ${name} ends inside the rail`)
      .toBeLessThanOrEqual(header.rail.bottom + 1);
  }
  expect(header.commanderState.top).toBeGreaterThanOrEqual(header.dossier.top - 1);
  expect(header.commanderState.bottom).toBeLessThanOrEqual(header.dossier.bottom + 1);

  if (geometry.viewport.width <= 720) {
    expect(header.brand.top).toBeCloseTo(header.dossier.top, 0);
    expect(header.brand.bottom).toBeCloseTo(header.dossier.bottom, 0);
    expect(header.context.top).toBeGreaterThanOrEqual(header.brand.bottom - 1);
    expect(header.context.left).toBeCloseTo(header.brand.left, 0);
    expect(header.context.right).toBeCloseTo(header.dossier.right, 0);
  } else {
    expect(header.brand.top).toBeCloseTo(header.context.top, 0);
    expect(header.context.top).toBeCloseTo(header.dossier.top, 0);
    expect(header.brand.bottom).toBeCloseTo(header.context.bottom, 0);
    expect(header.context.bottom).toBeCloseTo(header.dossier.bottom, 0);
  }
}

async function assertCommandGeometry(page: Page, geometry: CommandGeometry): Promise<void> {
  await page.setViewportSize(geometry.viewport);
  await openAshRoad(page);

  await expect(page.locator('#lobby .command-center')).toHaveCount(1);
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('.command-center__library')).toBeVisible();
  await expect(page.locator('.command-center__workspace-host')).toBeVisible();
  await expect(page.locator('.command-center__body')).toHaveAttribute('data-command-collection', 'singleton');
  await expect(page.getByRole('heading', { name: 'Fuel Stop', exact: true })).toBeVisible();
  await expect(page.getByText('Immediate objective', { exact: true })).toBeVisible();
  await expect(page.locator('[data-campaign-route-map]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Starting loadout', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'New run kit', exact: true })).toBeVisible();
  await expect(page.getByText('Saved loadout', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-command-primary]:visible')).toHaveCount(1);
  await expect(page.locator('[data-command-primary]:visible')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  await expect(page.locator('.lobby-deployment__masthead > h1')).toContainText('singedTerra');
  await assertCommandHeaderGeometry(page, geometry);

  const rail = page.locator('.command-center__category-rail');
  const sheetCategories = page.locator('.command-center__sheet-categories');
  await expect(rail.locator('[data-command-category]')).toHaveText(COMMAND_CATEGORIES);
  await expect(sheetCategories.locator('[data-command-category]')).toHaveText(COMMAND_CATEGORIES);
  if (geometry.narrow) {
    await expect(rail).toBeHidden();
    const modes = page.getByRole('button', { name: 'Modes', exact: true });
    await expect(modes).toBeVisible();
    await modes.click();
    const sheet = page.getByRole('navigation', { name: 'Modes', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-command-category]')).toHaveText(COMMAND_CATEGORIES);
    await page.getByRole('button', { name: 'Close Modes', exact: true }).click();
    const [modesBox, selectedItemBox] = await Promise.all([
      modes.boundingBox(),
      page.locator('.command-center__item[aria-current="true"]').boundingBox(),
    ]);
    expect(modesBox, `${geometry.label} Modes trigger should render`).not.toBeNull();
    expect(selectedItemBox, `${geometry.label} selected item should render`).not.toBeNull();
    const overlapsSelectedItem = modesBox!.x < selectedItemBox!.x + selectedItemBox!.width - 1
      && modesBox!.x + modesBox!.width > selectedItemBox!.x + 1
      && modesBox!.y < selectedItemBox!.y + selectedItemBox!.height - 1
      && modesBox!.y + modesBox!.height > selectedItemBox!.y + 1;
    expect(
      overlapsSelectedItem,
      `${geometry.label} Modes trigger must not obscure the selected command item`,
    ).toBe(false);
  } else {
    await expect(rail).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modes', exact: true })).toBeHidden();
  }

  const surface = await page.evaluate(() => {
    const pregame = document.getElementById('lobby')!;
    const battle = document.getElementById('app')!;
    const library = document.querySelector<HTMLElement>('.command-center__library-items')!;
    const workspace = document.querySelector<HTMLElement>('.command-center__workspace-host')!;
    return {
      pregameOutsideBattle: !battle.contains(pregame) && !pregame.contains(battle),
      pregameTransform: getComputedStyle(pregame).transform,
      pregameZoom: getComputedStyle(pregame).zoom,
      battleHidden: battle.hidden,
      battleInert: battle.inert,
      battleAriaHidden: battle.getAttribute('aria-hidden'),
      libraryOverflowY: getComputedStyle(library).overflowY,
      workspaceOverflowY: getComputedStyle(workspace).overflowY,
      documentOverflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(surface).toMatchObject({
    pregameOutsideBattle: true,
    pregameTransform: 'none',
    pregameZoom: '1',
    battleHidden: true,
    battleInert: true,
    battleAriaHidden: 'true',
    libraryOverflowY: 'visible',
    workspaceOverflowY: 'auto',
  });
  expect(surface.documentOverflowX, `${geometry.label} document horizontal overflow`)
    .toBeLessThanOrEqual(1);

  const disclosures = page.locator('.campaign-command__disclosure');
  await expect(disclosures).toHaveCount(1);
  await expect(disclosures.nth(0)).not.toHaveAttribute('open', '');
  await assertLobbyFrame(page);
  await assertTargets(page);

  const longLabel = await page.locator('.command-center__item-label').evaluate((element) => {
    element.textContent = 'Ash Road Expedition with an Improbably Long Campaign Designation';
    const item = element.closest<HTMLElement>('.command-center__item')!;
    const textBox = element.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    return {
      itemOverflow: item.scrollWidth - item.clientWidth,
      contained: textBox.left >= itemBox.left - 1 && textBox.right <= itemBox.right + 1,
    };
  });
  expect(longLabel.itemOverflow, `${geometry.label} long-label overflow`).toBeLessThanOrEqual(1);
  expect(longLabel.contained, `${geometry.label} long-label containment`).toBe(true);
  await page.locator('.command-center__item-label').evaluate((element) => {
    element.textContent = 'Ash Road';
  });

  if (EVIDENCE_DIR && geometry.evidenceName) {
    await page.locator('.command-center__workspace-host').evaluate((workspace) => {
      workspace.scrollTop = 0;
    });
    await page.screenshot({ path: join(EVIDENCE_DIR, geometry.evidenceName) });
    if (geometry === GEOMETRIES.standard) {
      await page.locator('.command-center__item[aria-current="true"]').screenshot({
        path: join(EVIDENCE_DIR, 'command-center-material-selected-item.png'),
      });
      await page.locator('[data-command-primary]').screenshot({
        path: join(EVIDENCE_DIR, 'command-center-material-primary-empty.png'),
      });
      const decision = await page.locator('.campaign-command__decision').boundingBox();
      if (!decision) throw new Error('Campaign decision frame is missing from material evidence');
      await page.screenshot({
        path: join(EVIDENCE_DIR, 'command-center-material-decision-corner.png'),
        clip: {
          x: decision.x,
          y: decision.y,
          width: Math.min(360, decision.width),
          height: Math.min(220, decision.height),
        },
      });
    }
  }
  await assertLobbyControlReachable(page, '[data-command-primary]');
}

async function captureResumeGeometry(page: Page, geometry: CommandGeometry): Promise<void> {
  await page.setViewportSize(geometry.viewport);
  await openAshRoad(page);
  await expect(page.locator('[data-command-primary]')).toHaveText('Resume Ash Road');
  await expect(page.locator('[data-command-primary]')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('heading', { name: 'Saved loadout', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'New run kit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New Run', exact: true })).toBeVisible();
  await assertCommandHeaderGeometry(page, geometry);
  await assertLobbyFrame(page);
  await assertTargets(page);
  if (EVIDENCE_DIR) {
    await page.locator('.command-center__workspace-host').evaluate((workspace) => {
      workspace.scrollTop = 0;
    });
    const { width, height } = geometry.viewport;
    await page.screenshot({ path: join(EVIDENCE_DIR, `command-center-resume-${width}x${height}.png`) });
    if (geometry === GEOMETRIES.standard) {
      await page.locator('[data-command-primary]').screenshot({
        path: join(EVIDENCE_DIR, 'command-center-material-primary-resume.png'),
      });
    }
  }
  await assertLobbyControlReachable(page, '[data-command-primary]');
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

async function advanceCampaignRevision(page: Page): Promise<number> {
  return page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('singedterra-campaign', 1);
    request.onerror = () => reject(request.error ?? new Error('campaign database open failed'));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('campaign-runs', 'readwrite');
      const store = transaction.objectStore('campaign-runs');
      const read = store.get('ash-road-local');
      let revision = 0;
      read.onerror = () => reject(read.error ?? new Error('campaign save read failed'));
      read.onsuccess = () => {
        const current = read.result as { revision?: number } | undefined;
        if (!current || typeof current.revision !== 'number') {
          reject(new Error('campaign save was not persisted'));
          transaction.abort();
          return;
        }
        revision = current.revision + 1;
        store.put({ ...current, revision }, 'ash-road-local');
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(revision);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('campaign revision advance failed'));
      };
    };
  }));
}

async function putCampaignRecord(page: Page, record: unknown): Promise<void> {
  await page.evaluate(async (value) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('singedterra-campaign', 1);
    request.onerror = () => reject(request.error ?? new Error('campaign database open failed'));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('campaign-runs')) {
        request.result.createObjectStore('campaign-runs');
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('campaign-runs', 'readwrite');
      transaction.objectStore('campaign-runs').put(value, 'ash-road-local');
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('campaign record write failed'));
      };
    };
  }), record);
}

async function readCampaignRevision(page: Page): Promise<number> {
  return page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('singedterra-campaign', 1);
    request.onerror = () => reject(request.error ?? new Error('campaign database open failed'));
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('campaign-runs').objectStore('campaign-runs')
        .get('ash-road-local');
      read.onerror = () => reject(read.error ?? new Error('campaign record read failed'));
      read.onsuccess = () => {
        database.close();
        const revision = (read.result as { revision?: unknown } | undefined)?.revision;
        if (typeof revision !== 'number') reject(new Error('campaign revision missing'));
        else resolve(revision);
      };
    };
  }));
}

async function openSeededCampaign(page: Page, record: unknown): Promise<void> {
  await gotoLobby(page);
  await putCampaignRecord(page, record);
  await openAshRoad(page);
}

test.describe('T12 production command center', () => {
  test.beforeAll(() => {
    if (REQUIRE_EVIDENCE && !EVIDENCE_DIR) {
      throw new Error('COMMAND_CENTER_REQUIRE_EVIDENCE=1 requires COMMAND_CENTER_EVIDENCE_DIR');
    }
  });

  test('wide, standard, and ultrawide layouts preserve the command hierarchy', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'desktop geometry owner');
    await assertCommandGeometry(page, GEOMETRIES.wide);
    await assertCommandGeometry(page, GEOMETRIES.standard);
    await assertCommandGeometry(page, GEOMETRIES.ultrawide);
  });

  test('short landscape keeps the primary action reachable without page overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'small-window', 'short landscape geometry owner');
    await assertCommandGeometry(page, GEOMETRIES.short);
  });

  test('compact touch uses the accessible Modes sheet and touch activation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'coarse touch geometry owner');
    await page.addInitScript(() => {
      localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    });
    await assertCommandGeometry(page, GEOMETRIES.compact);

    const modes = page.getByRole('button', { name: 'Modes', exact: true });
    await modes.tap();
    await expect(modes).toHaveAttribute('aria-expanded', 'true');
    const sheet = page.getByRole('navigation', { name: 'Modes', exact: true });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Skirmishes', exact: true }).tap();
    await expect(page.locator('.command-center__item[data-command-item="standard"]'))
      .toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Close Modes', exact: true }).tap();
    await expect(modes).toBeFocused();
  });

  test('portrait preparation stays usable without the battle orientation gate', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'portrait touch geometry owner');
    await assertCommandGeometry(page, GEOMETRIES.portrait);
    await assertCommandGeometry(page, GEOMETRIES.minimum);
    await expect(page.locator('#portrait-warn')).toBeHidden();
    await expect(page.locator('#lobby')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#lobby')).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('compatible resume keeps saved equipment primary across the acceptance geometries', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'small-window', 'acceptance matrix split across desktop and touch');
    await page.setViewportSize(GEOMETRIES.standard.viewport);
    await openAshRoad(page);
    await page.locator('[data-command-primary]').click();
    await expect(page.locator('#app')).toBeVisible();
    await returnFromBattle(page);
    await expect(page.locator('[data-command-primary]')).toHaveText('Resume Ash Road');

    const geometries = testInfo.project.name === 'desktop-fine'
      ? [GEOMETRIES.wide, GEOMETRIES.standard, GEOMETRIES.ultrawide]
      : [GEOMETRIES.compact, GEOMETRIES.portrait, GEOMETRIES.minimum];
    for (const geometry of geometries) await captureResumeGeometry(page, geometry);
  });

  test('checking remains a distinct compact, focused, blocked save presentation', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'campaign save-state browser owner');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: { open: () => ({}) },
      });
    });
    await gotoLobby(page);
    await selectCommandWorkspace(page, 'Campaigns', 'ash-road');

    const view = page.locator('[data-campaign-command-view]');
    const primary = view.locator('[data-command-primary]');
    const status = view.locator('[data-campaign-save-status]');
    await expect(view).toHaveAttribute('data-campaign-save-state', 'checking');
    await expect(view).toHaveAttribute('aria-busy', 'true');
    await expect(primary).toHaveText('Checking save');
    await expect(primary).toBeDisabled();
    await expect(primary).toBeInViewport({ ratio: 1 });
    await status.focus();
    await expect(status).toBeFocused();
    await primary.evaluate((button) => button.click());
    await expect(page.locator('#app')).toBeHidden();
  });

  test('incompatible and unavailable saves stay truthful, reachable, and blocked', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'campaign save-state browser owner');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededCampaign(page, { kind: 'campaign-storage-record', schemaVersion: 99 });
    const incompatible = page.locator('[data-campaign-command-view]');
    const incompatiblePrimary = incompatible.locator('[data-command-primary]');
    await expect(incompatible).toHaveAttribute('data-campaign-save-state', 'incompatible');
    await expect(incompatible.locator('[data-campaign-save-status]'))
      .toContainText('different Ash Road build');
    await expect(incompatiblePrimary).toHaveText('Campaign unavailable');
    await expect(incompatiblePrimary).toBeDisabled();
    await expect(incompatiblePrimary).toBeInViewport({ ratio: 1 });
    await incompatiblePrimary.evaluate((button) => button.click());
    await expect(page.locator('#app')).toBeHidden();

    const unavailablePage = await page.context().newPage();
    try {
      await unavailablePage.setViewportSize({ width: 390, height: 844 });
      await unavailablePage.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          value: { open: () => { throw new Error('IndexedDB unavailable fixture'); } },
        });
      });
      await gotoLobby(unavailablePage);
      await selectCommandWorkspace(unavailablePage, 'Campaigns', 'ash-road');
      const unavailable = unavailablePage.locator('[data-campaign-command-view]');
      const unavailablePrimary = unavailable.locator('[data-command-primary]');
      const retry = unavailable.getByRole('button', { name: 'Retry save check', exact: true });
      await expect(unavailable).toHaveAttribute('data-campaign-save-state', 'unavailable');
      await expect(unavailable.locator('[data-campaign-save-status]'))
        .toContainText('could not be read');
      await expect(unavailablePrimary).toHaveText('Save unavailable');
      await expect(unavailablePrimary).toBeDisabled();
      await expect(unavailablePrimary).toBeInViewport({ ratio: 1 });
      await retry.focus();
      await expect(retry).toBeFocused();
      await unavailablePrimary.evaluate((button) => button.click());
      await expect(unavailablePage.locator('#app')).toBeHidden();
    } finally {
      await unavailablePage.close();
    }
  });

  test('compatible resume exposes the restoring handoff before battle acquisition', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'campaign save-state browser owner');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededCampaign(page, campaignRecord(14));
    const primary = page.locator('[data-command-primary]');
    await expect(primary).toHaveText('Resume Ash Road');
    await expect(primary).toBeInViewport({ ratio: 1 });
    await primary.focus();
    await expect(primary).toBeFocused();

    const handoff = await primary.evaluate((button) => {
      button.click();
      const view = document.querySelector<HTMLElement>('[data-campaign-command-view]');
      const action = view?.querySelector<HTMLButtonElement>('[data-command-primary]');
      return {
        status: view?.dataset.campaignSaveState,
        busy: view?.getAttribute('aria-busy'),
        action: action?.textContent,
        disabled: action?.disabled,
      };
    });
    expect(handoff).toEqual({
      status: 'restoring',
      busy: 'true',
      action: 'Restoring Ash Road',
      disabled: true,
    });
  });

  test('complete save presents a compact Start New Run decision without resuming', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'campaign save-state browser owner');
    await page.setViewportSize({ width: 844, height: 390 });
    await openSeededCampaign(page, completedCampaignRecord(21));
    const view = page.locator('[data-campaign-command-view]');
    const primary = view.locator('[data-command-primary]');
    await expect(view).toHaveAttribute('data-campaign-save-state', 'complete');
    await expect(view.locator('[data-campaign-save-status]')).toContainText('Campaign complete');
    await expect(primary).toHaveText('Start New Run');
    await expect(primary).toBeEnabled();
    await expect(primary).toBeInViewport({ ratio: 1 });
    await primary.focus();
    await expect(primary).toBeFocused();
    await expect(view.getByRole('button', { name: 'Resume Ash Road', exact: true })).toHaveCount(0);
  });

  test('New Run cancellation and a CAS conflict preserve the displayed/newer revision', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'campaign replacement browser owner');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededCampaign(page, campaignRecord(14));
    const newRun = page.getByRole('button', { name: 'New Run', exact: true });
    await newRun.click();
    await expect(page.getByRole('button', { name: 'Replace Saved Run', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel New Run', exact: true }).click();
    await expect(page.locator('[data-command-primary]')).toHaveText('Resume Ash Road');
    await expect(page.locator('[data-command-primary]')).toBeFocused();
    expect(await readCampaignRevision(page)).toBe(14);

    await page.getByRole('button', { name: 'New Run', exact: true }).click();
    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Replace Saved Run', exact: true }).click();
    await expect(page.locator('#lobby')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    expect(await readCampaignRevision(page)).toBe(14);

    const newerRevision = await advanceCampaignRevision(page);
    page.once('dialog', async (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Replace Saved Run', exact: true }).click();
    await expect(page.locator('[data-launch-failure]')).toContainText(
      'Campaign progress changed in another session.',
    );
    await expect(page.locator('#lobby')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('[data-campaign-command-view]'))
      .toHaveAttribute('data-campaign-save-state', 'compatible');
    await expect(page.locator('[data-command-primary]')).toHaveText('Resume Ash Road');
    await expect(page.locator('[data-command-primary]')).toBeFocused();
    expect(await readCampaignRevision(page)).toBe(newerRevision);
  });

  test('non-default keyboard selection survives account rerender and match return in session only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'fine-pointer keyboard owner');
    await page.addInitScript(() => {
      localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    });
    await page.setViewportSize(GEOMETRIES.standard.viewport);
    await openAshRoad(page);
    const rail = page.locator('.command-center__category-rail');
    const campaigns = rail.getByRole('button', { name: 'Campaigns', exact: true });
    await campaigns.focus();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByRole('button', { name: 'Skirmishes', exact: true })).toBeFocused();
    await expect(page.locator('.command-center__item[data-command-item="standard"]'))
      .toHaveAttribute('aria-current', 'true');
    const crosswindItem = page.locator(
      '.command-center__library-items button[data-command-item="crosswind-range"]',
    );
    await crosswindItem.focus();
    await crosswindItem.press('Enter');
    await expect(page.locator('.command-center__item[data-command-item="crosswind-range"]'))
      .toHaveAttribute('aria-current', 'true');
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), SELECTION_KEY))
      .toBe(JSON.stringify({ categoryId: 'skirmishes', itemId: 'crosswind-range' }));
    expect(await page.evaluate((key) => localStorage.getItem(key), SELECTION_KEY)).toBeNull();

    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('dialog', { name: 'Player account', exact: true })
      .getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.command-center__item[data-command-item="crosswind-range"]'))
      .toHaveAttribute('aria-current', 'true');

    await page.getByRole('button', { name: 'Start Crosswind Range', exact: true }).click();
    await expect(page.locator('#app')).toBeVisible();
    await returnFromBattle(page);
    await expect(page.locator('.command-center__item[data-command-item="crosswind-range"]'))
      .toHaveAttribute('aria-current', 'true');
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), SELECTION_KEY))
      .toBe(JSON.stringify({ categoryId: 'skirmishes', itemId: 'crosswind-range' }));
    expect(await page.evaluate((key) => localStorage.getItem(key), SELECTION_KEY)).toBeNull();
  });

  test('launching keeps preparation busy until success, return restores intent, and a stale resume fails in place', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'application lifecycle owner');
    await page.setViewportSize(GEOMETRIES.standard.viewport);
    await openAshRoad(page);
    const primary = page.locator('[data-command-primary]');
    await expect(primary).toHaveText('Start Ash Road');
    await primary.focus();

    const launching = await primary.evaluate((button) => {
      button.click();
      const pregame = document.getElementById('lobby')!;
      const battle = document.getElementById('app')!;
      return {
        pregameHidden: pregame.hidden,
        pregameInert: pregame.inert,
        pregameBusy: pregame.getAttribute('aria-busy'),
        battleHidden: battle.hidden,
        battleInert: battle.inert,
        battleAriaHidden: battle.getAttribute('aria-hidden'),
      };
    });
    expect(launching).toEqual({
      pregameHidden: false,
      pregameInert: true,
      pregameBusy: 'true',
      battleHidden: true,
      battleInert: true,
      battleAriaHidden: 'true',
    });

    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await returnFromBattle(page);
    await expect(page.locator('.command-center__item[data-command-item="ash-road"]'))
      .toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-command-primary]')).toHaveText('Resume Ash Road');
    await expect.poll(() => page.evaluate(() => (
      document.getElementById('lobby')?.contains(document.activeElement) ?? false
    ))).toBe(true);

    const competingRevision = await advanceCampaignRevision(page);
    const resume = page.locator('[data-command-primary]');
    await resume.click();
    await expect(page.locator('#lobby')).toBeVisible();
    await expect(page.locator('#lobby')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('[data-launch-failure]')).toContainText(
      'Campaign progress changed in another session.',
    );
    await expect(page.locator('.command-center__item[data-command-item="ash-road"]'))
      .toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-command-primary]')).toHaveText('Resume Ash Road');
    await expect(page.locator('[data-command-primary]')).toBeFocused();
    await expect.poll(() => page.evaluate(async () => new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('singedterra-campaign', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const read = database.transaction('campaign-runs').objectStore('campaign-runs').get('ash-road-local');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          database.close();
          resolve((read.result as { revision: number }).revision);
        };
      };
    }))).toBe(competingRevision);
  });
});

// Decoration failure, reduced motion, forced colours, and 200%-equivalent reflow remain
// causal production checks in command-center-visual-seam.spec.ts rather than screenshot claims here.
