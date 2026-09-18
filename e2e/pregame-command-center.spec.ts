import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  openLocalPreparation,
  selectCommandWorkspace,
} from './support';

const EVIDENCE_DIR = process.env['COMMAND_CENTER_EVIDENCE_DIR'];
const REQUIRE_EVIDENCE = process.env['COMMAND_CENTER_REQUIRE_EVIDENCE'] === '1';
const WORKSPACE_EVIDENCE_DIR = process.env['COMMAND_CENTER_WORKSPACE_EVIDENCE_DIR'];
const WORKSPACE_EVIDENCE_COMMAND = process.env['COMMAND_CENTER_WORKSPACE_EVIDENCE_COMMAND']
  ?? 'npx playwright test e2e/pregame-command-center.spec.ts --grep "T31"';
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

const LOCAL_GEOMETRIES = Object.freeze({
  desktop: { label: 'local desktop', viewport: { width: 1440, height: 900 }, narrow: false },
  standard: { label: 'local standard', viewport: { width: 1280, height: 720 }, narrow: false },
  short: { label: 'local short landscape', viewport: { width: 1024, height: 543 }, narrow: false },
  compact: { label: 'local compact landscape', viewport: { width: 844, height: 390 }, narrow: true },
  portrait: { label: 'local portrait', viewport: { width: 390, height: 844 }, narrow: true },
  minimum: { label: 'local narrow phone', viewport: { width: 320, height: 568 }, narrow: true },
} as const satisfies Record<string, CommandGeometry>);

type LocalGeometryOptions = Readonly<{
  fourSeats?: boolean;
  longName?: boolean;
  validationFailure?: boolean;
}>;

async function assertLocalPreparationGeometry(
  page: Page,
  geometry: CommandGeometry,
  options: LocalGeometryOptions = {},
): Promise<void> {
  await page.setViewportSize(geometry.viewport);
  await gotoLobby(page);
  await openLocalPreparation(page);

  const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
  const preparation = workspace.locator('[data-local-preparation]');
  const setupScroll = workspace.locator('.lobby-hotseat-scroll');
  const deploy = workspace.getByRole('button', { name: 'Deploy local battle', exact: true });
  const playerCount = workspace.getByRole('combobox', { name: 'Players', exact: true });

  await expect(deploy).toHaveCount(1);
  await expect(deploy).toBeInViewport({ ratio: 1 });
  if (geometry.viewport.width >= 390) {
    await expect(workspace.locator('[data-crew-seat="player-1"]')).toBeInViewport({ ratio: 0.36 });
  } else {
    await expect(workspace.locator('.lobby-local-preparation__header')).toBeInViewport({ ratio: 0.75 });
    const firstSeatFold = await workspace.evaluate((root) => {
      const scroll = root.querySelector<HTMLElement>('.lobby-hotseat-scroll')!;
      const seat = root.querySelector<HTMLElement>('[data-crew-seat="player-1"]')!;
      const scrollBox = scroll.getBoundingClientRect();
      const seatBox = seat.getBoundingClientRect();
      return Math.max(0, Math.min(scrollBox.bottom, seatBox.bottom) - Math.max(scrollBox.top, seatBox.top));
    });
    expect(firstSeatFold, `${geometry.label} meaningful first crew-seat fold`)
      .toBeGreaterThanOrEqual(44);
  }

  if (options.fourSeats) {
    await playerCount.selectOption('4');
    await expect(workspace.locator('[data-crew-seat]')).toHaveCount(4);
  }

  if (options.longName) {
    const finalSeat = options.fourSeats ? 4 : 2;
    await workspace.getByRole('textbox', { name: `Player ${finalSeat} name`, exact: true })
      .fill('Expedition Commander');
  }

  const playerTwoSelector = workspace.getByRole('button', { name: /Inspect Player 2 vehicle/u });
  await playerTwoSelector.click();
  await expect(workspace.locator('[data-crew-seat="player-2"]')).toHaveAttribute('aria-current', 'true');
  await expect(workspace.locator('.lobby-preview__spotlight[data-preview-owner="player-2"]'))
    .toBeAttached();

  if (options.validationFailure) {
    await workspace.getByRole('textbox', { name: 'Player 2 name', exact: true }).fill('');
    await expect(workspace.locator('.lobby-error')).not.toHaveText('');
    await expect(deploy).toBeDisabled();
  }

  await expect(preparation).toBeVisible();
  await expect(workspace.locator('.lobby-local-preparation__inspection')).toBeAttached();
  await expect(workspace.locator('.lobby-local-preparation__rules')).toBeAttached();
  await expect(deploy).toHaveCount(1);
  await expect(deploy).toBeInViewport({ ratio: 1 });

  const geometryState = await workspace.evaluate((root) => {
    const rect = (selector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing Local geometry element ${selector}`);
      return element.getBoundingClientRect().toJSON();
    };
    const scrollState = (selector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing Local scroll element ${selector}`);
      return {
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    };
    const commandWorkspace = root.closest('.command-center__workspace-host') as HTMLElement | null;
    const card = root.closest('.lobby-card') as HTMLElement | null;
    if (!commandWorkspace || !card) throw new Error('Missing Local command shell owners');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflowX: document.documentElement.scrollWidth - innerWidth,
      documentOverflowY: document.documentElement.scrollHeight - innerHeight,
      cardOverflowY: card.scrollHeight - card.clientHeight,
      commandWorkspace: {
        overflowY: getComputedStyle(commandWorkspace).overflowY,
        clientHeight: commandWorkspace.clientHeight,
        scrollHeight: commandWorkspace.scrollHeight,
      },
      localWorkspace: scrollState('.multiplayer-command__local-workspace'),
      hotseat: scrollState('.lobby-hotseat'),
      body: scrollState('.lobby-hotseat-body'),
      setupScroll: scrollState('.lobby-hotseat-scroll'),
      root: root.getBoundingClientRect().toJSON(),
      preparation: rect('[data-local-preparation]'),
      selectedSeat: rect('[data-crew-seat="player-2"]'),
      name: rect('[aria-label="Player 2 name"]'),
      inspection: rect('.lobby-local-preparation__inspection'),
      rules: rect('.lobby-local-preparation__rules'),
      footer: rect('.lobby-hotseat-footer'),
      deploy: rect('.lobby-start'),
    };
  });

  expect(geometryState.documentOverflowX, `${geometry.label} document horizontal overflow`)
    .toBeLessThanOrEqual(1);
  expect(geometryState.documentOverflowY, `${geometry.label} document vertical overflow`)
    .toBeLessThanOrEqual(1);
  expect(geometryState.cardOverflowY, `${geometry.label} outer card must not become the Local scroller`)
    .toBeLessThanOrEqual(1);
  expect(geometryState.commandWorkspace.overflowY, `${geometry.label} command workspace scroll ownership`)
    .toBe('hidden');
  expect(geometryState.localWorkspace.overflowY, `${geometry.label} Local workspace scroll ownership`)
    .toBe('hidden');
  expect(geometryState.hotseat.overflowY, `${geometry.label} Hot Seat scroll ownership`)
    .toBe('hidden');
  expect(geometryState.body.overflowY, `${geometry.label} Local body scroll ownership`)
    .toBe('hidden');
  expect(geometryState.setupScroll.overflowY, `${geometry.label} setup must be the one scroll owner`)
    .toBe('auto');

  for (const [name, box] of Object.entries({
    preparation: geometryState.preparation,
    selectedSeat: geometryState.selectedSeat,
    name: geometryState.name,
    inspection: geometryState.inspection,
    rules: geometryState.rules,
    footer: geometryState.footer,
    deploy: geometryState.deploy,
  })) {
    expect(box.left, `${geometry.label} ${name} left clipping`)
      .toBeGreaterThanOrEqual(geometryState.root.left - 1);
    expect(box.right, `${geometry.label} ${name} right clipping`)
      .toBeLessThanOrEqual(geometryState.root.right + 1);
  }
  expect(geometryState.footer.bottom, `${geometry.label} decision footer bottom clipping`)
    .toBeLessThanOrEqual(geometryState.viewport.height + 1);
  expect(geometryState.deploy.top, `${geometry.label} Deploy begins inside decision footer`)
    .toBeGreaterThanOrEqual(geometryState.footer.top - 1);
  expect(geometryState.deploy.bottom, `${geometry.label} Deploy ends inside decision footer`)
    .toBeLessThanOrEqual(geometryState.footer.bottom + 1);

  const colorTargets = await workspace.locator('.lobby-swatch:visible').evaluateAll((swatches) => (
    swatches.map((swatch) => {
      const box = swatch.getBoundingClientRect();
      return { width: box.width, height: box.height };
    })
  ));
  expect(colorTargets.length, `${geometry.label} visible paint choices`).toBeGreaterThan(0);
  for (const [index, target] of colorTargets.entries()) {
    expect(target.width, `${geometry.label} paint target ${index + 1} width`).toBeGreaterThanOrEqual(43.5);
    expect(target.height, `${geometry.label} paint target ${index + 1} height`).toBeGreaterThanOrEqual(43.5);
  }

  for (const selector of [
    '[data-crew-seat="player-1"]',
    '[data-crew-seat="player-2"]',
    '.lobby-local-preparation__inspection',
    '.lobby-local-preparation__rules',
  ]) {
    const target = workspace.locator(selector);
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeInViewport({ ratio: 0.35 });
    await expect(deploy).toBeInViewport({ ratio: 1 });
  }

  if (options.fourSeats) {
    const fourthSeat = workspace.locator('[data-crew-seat="player-4"]');
    await fourthSeat.scrollIntoViewIfNeeded();
    await expect(fourthSeat).toBeInViewport({ ratio: 0.35 });
    await expect(deploy).toBeInViewport({ ratio: 1 });
    expect(geometryState.setupScroll.scrollHeight, `${geometry.label} four-seat controlled scroll`)
      .toBeGreaterThan(geometryState.setupScroll.clientHeight);
  }
}

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

test.describe('T25 Local Battle responsive geometry', () => {
  test('desktop and standard keep the crew, inspection, rules, and decision in one bounded workspace', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'desktop Local geometry owner');
    await assertLocalPreparationGeometry(page, LOCAL_GEOMETRIES.desktop);
    await assertLocalPreparationGeometry(page, LOCAL_GEOMETRIES.standard, {
      fourSeats: true,
      longName: true,
      validationFailure: true,
    });
  });

  test('short landscape preserves the initial crew fold and docked Deploy decision', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'small-window', 'short Local geometry owner');
    await assertLocalPreparationGeometry(page, LOCAL_GEOMETRIES.short, {
      fourSeats: true,
      longName: true,
      validationFailure: true,
    });
  });

  test('compact landscape, portrait, and narrow phone retain one controlled setup scroller', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'touch Local geometry owner');
    await assertLocalPreparationGeometry(page, LOCAL_GEOMETRIES.compact, { fourSeats: true });
    await assertLocalPreparationGeometry(page, LOCAL_GEOMETRIES.portrait, {
      fourSeats: true,
      longName: true,
    });
    await assertLocalPreparationGeometry(page, LOCAL_GEOMETRIES.minimum, {
      validationFailure: true,
    });
  });
});

const WORKSPACE_EVIDENCE_GEOMETRIES = Object.freeze([
  { label: 'wide', width: 1920, height: 1080 },
  { label: 'standard', width: 1440, height: 900 },
  { label: 'ultrawide', width: 3440, height: 1440 },
  { label: 'compact-landscape', width: 844, height: 390 },
  { label: 'portrait', width: 390, height: 844 },
  { label: 'narrow-phone', width: 320, height: 568 },
] as const);

type WorkspaceEvidenceState = 'default-two-seat' | 'modified-player-2' | 'four-seat' | 'open-garage';

interface WorkspaceEvidenceRecord {
  readonly file: string;
  readonly captureKind: 'viewport' | 'detail' | 'special';
  readonly state: string;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly devicePixelRatio: number;
  readonly cssZoom: string;
  readonly reflowEquivalent: string;
  readonly project: string;
  readonly browser: string;
  readonly userAgent: string;
  readonly sha256: string;
}

function gitOutput(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitOutputRaw(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' });
}

interface WorkspaceSourceCandidate {
  readonly path: string;
  readonly gitStatus: string;
  readonly previousPath?: string;
}

function parseTrackedSourceCandidates(raw: string): WorkspaceSourceCandidate[] {
  const fields = raw.split('\0');
  const candidates: WorkspaceSourceCandidate[] = [];
  for (let index = 0; index < fields.length;) {
    const gitStatus = fields[index++];
    if (!gitStatus) break;
    if (gitStatus.startsWith('R') || gitStatus.startsWith('C')) {
      const previousPath = fields[index++];
      const path = fields[index++];
      if (!previousPath || !path) throw new Error('Incomplete renamed source record');
      candidates.push({ path, gitStatus, previousPath });
      continue;
    }
    const path = fields[index++];
    if (!path) throw new Error('Incomplete changed source record');
    candidates.push({ path, gitStatus });
  }
  return candidates;
}

function parsePorcelainStatusPaths(raw: string): string[] {
  const fields = raw.split('\0');
  const paths: string[] = [];
  for (let index = 0; index < fields.length;) {
    const record = fields[index++];
    if (!record) break;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    if (!path) throw new Error('Incomplete porcelain status record');
    paths.push(path);
    if (status.includes('R') || status.includes('C')) index += 1;
  }
  return paths.sort();
}

async function workspaceSourceManifest(): Promise<ReadonlyArray<{
  path: string;
  state: 'present' | 'deleted';
  sha256: string | null;
  gitStatus: string;
  previousPath?: string;
}>> {
  const pathspec = [
    '.',
    ':(exclude).codearbiter/evidence/command-center-workspace-finish/**',
    ':(exclude)client/coverage/**',
    ':(exclude)playwright-report/**',
    ':(exclude)test-results/**',
  ];
  const tracked = parseTrackedSourceCandidates(gitOutputRaw(
    'diff', '--name-status', '--find-renames', '-z', 'HEAD', '--', ...pathspec,
  ));
  const untracked = gitOutputRaw(
    'ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec,
  ).split('\0').filter(Boolean).map((path) => ({ path, gitStatus: '??' }));
  const candidates = [...tracked, ...untracked]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const statusPaths = parsePorcelainStatusPaths(gitOutputRaw(
    'status', '--porcelain=v1', '-z', '--', ...pathspec,
  ));
  const candidatePaths = candidates.map(({ path }) => path);
  if (JSON.stringify(candidatePaths) !== JSON.stringify(statusPaths)) {
    throw new Error(`Source manifest/status mismatch: ${JSON.stringify({ candidatePaths, statusPaths })}`);
  }
  return Promise.all(candidates.map(async ({ path, gitStatus, previousPath }) => {
    try {
      const bytes = await readFile(path);
      return {
        path,
        state: 'present' as const,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        gitStatus,
        ...(previousPath ? { previousPath } : {}),
      };
    } catch {
      return {
        path,
        state: 'deleted' as const,
        sha256: null,
        gitStatus,
        ...(previousPath ? { previousPath } : {}),
      };
    }
  }));
}

async function servedRuntimeManifest(page: Page): Promise<ReadonlyArray<{
  url: string;
  sha256: string;
}>> {
  const urls = await page.evaluate(() => [...new Set(performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((value) => new URL(value).origin === location.origin))].sort());
  return Promise.all(urls.map(async (url) => {
    const response = await page.request.get(url, { failOnStatusCode: false });
    if (!response.ok()) throw new Error(`Unable to bind served resource ${url}: ${response.status()}`);
    const parsed = new URL(url);
    return {
      url: `${parsed.pathname}${parsed.search}`,
      sha256: createHash('sha256').update(await response.body()).digest('hex'),
    };
  }));
}

async function configureWorkspaceEvidenceState(
  page: Page,
  state: WorkspaceEvidenceState,
): Promise<void> {
  await gotoLobby(page);
  await openLocalPreparation(page);
  const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
  const setupScroll = workspace.locator('.lobby-hotseat-scroll');
  const playerTwo = workspace.locator('[data-crew-seat="player-2"]');

  if (state === 'default-two-seat') {
    await setupScroll.evaluate((element) => { element.scrollTop = 0; });
    return;
  }

  if (state === 'four-seat') {
    await workspace.getByRole('combobox', { name: 'Players', exact: true }).selectOption('4');
    await workspace.getByRole('textbox', { name: 'Player 4 name', exact: true })
      .fill('Expedition Commander');
    await workspace.getByRole('combobox', { name: 'Player 3 controller', exact: true })
      .selectOption('medium');
    await workspace.getByRole('button', { name: /Inspect Player 4 vehicle/u }).click();
    const playerFour = workspace.locator('[data-crew-seat="player-4"]');
    await playerFour.scrollIntoViewIfNeeded();
    await expect(playerFour).toHaveAttribute('aria-current', 'true');
    return;
  }

  await workspace.getByRole('textbox', { name: 'Player 2 name', exact: true })
    .fill('Dust Viper');
  await workspace.getByRole('combobox', { name: 'Player 2 controller', exact: true })
    .selectOption('easy');
  await playerTwo.locator('.lobby-swatch[title="Green"]').click();
  await expect(playerTwo).toHaveAttribute('aria-current', 'true');

  const customize = workspace.getByRole('button', { name: 'Customize Player 2 tank', exact: true });
  await customize.click();
  let garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
  await garage.locator('[data-preset="jackal"]').click();
  garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
  await garage.locator('[data-slot="turret"][data-variant="bulwark"]').click();
  garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });

  if (state === 'open-garage') {
    await garage.locator('.lobby-garage__editor-scroll').evaluate((element) => {
      element.scrollTop = 0;
    });
    return;
  }

  await garage.getByRole('button', { name: 'Done customizing tank', exact: true }).click();
  await expect(customize).toBeFocused();
  await playerTwo.scrollIntoViewIfNeeded();
}

async function assertWorkspaceEvidenceGeometry(
  page: Page,
  state: WorkspaceEvidenceState,
): Promise<void> {
  await assertLobbyFrame(page);
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
  }));
  expect(overflow.x, `${state} document horizontal overflow`).toBeLessThanOrEqual(1);
  expect(overflow.y, `${state} document vertical overflow`).toBeLessThanOrEqual(1);

  if (state !== 'open-garage') {
    const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
    const deploy = workspace.getByRole('button', { name: 'Deploy local battle', exact: true });
    await expect(deploy).toBeInViewport({ ratio: 1 });
    const swatches = await workspace.locator('.lobby-swatch:visible').evaluateAll((elements) => (
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      })
    ));
    for (const target of swatches) {
      expect(target.width, `${state} paint target width`).toBeGreaterThanOrEqual(43.5);
      expect(target.height, `${state} paint target height`).toBeGreaterThanOrEqual(43.5);
    }
    return;
  }

  const garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
  await expect(garage).toBeVisible();
  await expect(garage.getByRole('button', { name: 'Done customizing tank', exact: true }))
    .toBeInViewport({ ratio: 1 });
  const geometry = await garage.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const scroll = element.querySelector<HTMLElement>('.lobby-garage__editor-scroll')!;
    const spotlight = element.querySelector<HTMLCanvasElement>('.lobby-garage__tank-preview')!;
    const presets = Array.from(
      element.querySelectorAll<HTMLCanvasElement>('.lobby-garage__preset-thumbnail'),
      (canvas) => ({
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.getBoundingClientRect().width,
        cssHeight: canvas.getBoundingClientRect().height,
      }),
    );
    return {
      bounds: bounds.toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
      overflowY: getComputedStyle(scroll).overflowY,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      spotlight: { width: spotlight.width, height: spotlight.height },
      presets,
    };
  });
  expect(geometry.bounds.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.bounds.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bounds.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.bounds.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
  expect(geometry.overflowY).toBe('auto');
  expect(geometry.spotlight).toEqual({ width: 320, height: 180 });
  expect(geometry.presets).toHaveLength(4);
  for (const preset of geometry.presets) {
    expect({ width: preset.width, height: preset.height }).toEqual({ width: 336, height: 192 });
    expect(preset.width / preset.cssWidth, 'preset horizontal backing density')
      .toBeGreaterThanOrEqual(2);
    expect(preset.height / preset.cssHeight, 'preset vertical backing density')
      .toBeGreaterThanOrEqual(2);
  }
  const targets = await garage.locator('button:visible').evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  for (const target of targets) {
    expect(target.width, 'Garage target width').toBeGreaterThanOrEqual(43.5);
    expect(target.height, 'Garage target height').toBeGreaterThanOrEqual(43.5);
  }
}

async function retainWorkspaceCapture(
  page: Page,
  records: WorkspaceEvidenceRecord[],
  file: string,
  state: string,
  captureKind: WorkspaceEvidenceRecord['captureKind'],
  locator?: ReturnType<Page['locator']>,
  reflowEquivalent = '100%',
): Promise<void> {
  if (!WORKSPACE_EVIDENCE_DIR) return;
  const path = join(WORKSPACE_EVIDENCE_DIR, file);
  const bytes = locator
    ? await locator.screenshot({ path, animations: 'disabled' })
    : await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  const environment = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    dpr: devicePixelRatio,
    zoom: getComputedStyle(document.getElementById('lobby')!).zoom,
    userAgent: navigator.userAgent,
  }));
  records.push({
    file,
    captureKind,
    state,
    viewport: environment.viewport,
    devicePixelRatio: environment.dpr,
    cssZoom: environment.zoom,
    reflowEquivalent,
    project: 'desktop-fine',
    browser: 'chromium',
    userAgent: environment.userAgent,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

test.describe('T31 Local and Garage retained interaction matrix', () => {
  test('keyboard and pointer preserve owner selection, controlled scrolling, and exact focus return', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'fine-pointer and keyboard owner');
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLobby(page);
    await openLocalPreparation(page);
    const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
    const selector = workspace.getByRole('button', { name: /Inspect Player 2 vehicle/u });
    await selector.focus();
    await selector.press('Enter');
    await expect(workspace.locator('[data-crew-seat="player-2"]')).toHaveAttribute('aria-current', 'true');

    const customize = workspace.getByRole('button', { name: 'Customize Player 2 tank', exact: true });
    await customize.focus();
    await customize.press('Enter');
    let garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
    const preset = garage.locator('[data-preset="bulwark"]');
    await preset.focus();
    await preset.press('Enter');
    garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
    await expect(garage.locator('[data-preset="bulwark"]')).toHaveAttribute('aria-pressed', 'true');
    const directVariant = garage.locator('[data-slot="barrel"][data-variant="jackal"]');
    await directVariant.scrollIntoViewIfNeeded();
    await directVariant.focus();
    await directVariant.press('Space');
    garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
    await expect(garage.locator('[data-slot="barrel"][data-variant="jackal"]'))
      .toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({ width: 1024, height: 543 });
    const scroll = garage.locator('.lobby-garage__editor-scroll');
    await expect.poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(0);
    await scroll.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(garage.getByRole('button', { name: 'Done customizing tank', exact: true }))
      .toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await expect(customize).toBeFocused();

    const green = workspace.locator('[data-crew-seat="player-2"] .lobby-swatch[title="Green"]');
    await green.click();
    await expect(workspace.locator('[data-crew-seat="player-2"]')).toHaveAttribute('aria-current', 'true');

    await workspace.getByRole('combobox', { name: 'Players', exact: true }).selectOption('4');
    const setupScroll = workspace.locator('.lobby-hotseat-scroll');
    await setupScroll.hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => setupScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await workspace.locator('[data-crew-seat="player-4"]').scrollIntoViewIfNeeded();
    await expect(workspace.locator('[data-crew-seat="player-4"]')).toBeInViewport({ ratio: 0.35 });
    await expect(workspace.getByRole('button', { name: 'Deploy local battle', exact: true }))
      .toBeInViewport({ ratio: 1 });
  });

  test('touch selects an owner, preset, direct variant, and returns focus from Done', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel-touch', 'coarse touch owner');
    await page.setViewportSize({ width: 844, height: 390 });
    await gotoLobby(page);
    await openLocalPreparation(page);
    const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
    await workspace.getByRole('button', { name: /Inspect Player 2 vehicle/u }).tap();
    const customize = workspace.getByRole('button', { name: 'Customize Player 2 tank', exact: true });
    await customize.scrollIntoViewIfNeeded();
    await customize.tap();
    let garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
    await garage.locator('[data-preset="jackal"]').tap();
    garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
    const variant = garage.locator('[data-slot="hull"][data-variant="ranger"]');
    await variant.scrollIntoViewIfNeeded();
    await variant.tap();
    garage = page.getByRole('dialog', { name: 'Vehicle Bay: Player 2', exact: true });
    await expect(garage.locator('[data-slot="hull"][data-variant="ranger"]'))
      .toHaveAttribute('aria-pressed', 'true');
    await garage.getByRole('button', { name: 'Done customizing tank', exact: true }).tap();
    await expect(customize).toBeFocused();
  });

  test('retains native Local and Garage captures, detail crops, and machine-readable provenance', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'single evidence writer');
    test.skip(!WORKSPACE_EVIDENCE_DIR, 'set COMMAND_CENTER_WORKSPACE_EVIDENCE_DIR to retain evidence');
    test.setTimeout(180_000);
    await mkdir(WORKSPACE_EVIDENCE_DIR!, { recursive: true });
    await configureWorkspaceEvidenceState(page, 'default-two-seat');
    const sourceStatus = gitOutput(
      'status', '--porcelain=v1', '--', '.',
      ':(exclude).codearbiter/evidence/command-center-workspace-finish',
      ':(exclude)client/coverage',
      ':(exclude)playwright-report',
      ':(exclude)test-results',
    );
    const sourceFiles = await workspaceSourceManifest();
    const servedResources = await servedRuntimeManifest(page);
    const provenance = {
      headCommit: gitOutput('rev-parse', 'HEAD'),
      mergeBase: gitOutput('merge-base', 'HEAD', 'origin/main'),
      branch: gitOutput('branch', '--show-current'),
      sourceDirty: sourceStatus.length > 0,
      sourceStatus: sourceStatus.split(/\r?\n/u).filter(Boolean),
      sourceStatusSha256: createHash('sha256').update(sourceStatus).digest('hex'),
      sourceFiles,
      sourceContentSha256: createHash('sha256')
        .update(JSON.stringify(sourceFiles))
        .digest('hex'),
      servedResourceCount: servedResources.length,
      servedRuntimeSha256: createHash('sha256')
        .update(JSON.stringify(servedResources))
        .digest('hex'),
      baseUrl: process.env['E2E_LIVE_URL'] ?? 'Playwright managed production preview',
      testCommand: WORKSPACE_EVIDENCE_COMMAND,
    };
    const records: WorkspaceEvidenceRecord[] = [];

    for (const geometry of WORKSPACE_EVIDENCE_GEOMETRIES) {
      for (const state of [
        'default-two-seat',
        'modified-player-2',
        'four-seat',
        'open-garage',
      ] as const satisfies readonly WorkspaceEvidenceState[]) {
        await page.setViewportSize({ width: geometry.width, height: geometry.height });
        await configureWorkspaceEvidenceState(page, state);
        await assertWorkspaceEvidenceGeometry(page, state);
        const file = `${state}-${geometry.width}x${geometry.height}.png`;
        await retainWorkspaceCapture(page, records, file, state, 'viewport');

        if (geometry.label === 'standard' && state === 'default-two-seat') {
          await retainWorkspaceCapture(
            page,
            records,
            'detail-default-crew-and-inspection.png',
            state,
            'detail',
            page.locator('.lobby-hotseat-body'),
          );
        }
        if (geometry.label === 'standard' && state === 'modified-player-2') {
          await retainWorkspaceCapture(
            page,
            records,
            'detail-modified-player-2.png',
            state,
            'detail',
            page.locator('[data-crew-seat="player-2"]'),
          );
        }
        if (geometry.label === 'standard' && state === 'open-garage') {
          for (const [name, selector] of [
            ['detail-garage-owner-tank.png', '.lobby-garage__inspection'],
            ['detail-garage-presets.png', '.lobby-garage__preset-group'],
            ['detail-garage-components.png', '.lobby-garage__component-group'],
          ] as const) {
            await retainWorkspaceCapture(
              page,
              records,
              name,
              state,
              'detail',
              page.locator(selector),
            );
          }
        }
      }
    }

    await page.setViewportSize({ width: 720, height: 450 });
    await configureWorkspaceEvidenceState(page, 'open-garage');
    await assertWorkspaceEvidenceGeometry(page, 'open-garage');
    await retainWorkspaceCapture(
      page,
      records,
      'special-200pct-equivalent-720x450.png',
      'open-garage',
      'special',
      undefined,
      '200% equivalent of 1440x900',
    );

    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.setViewportSize({ width: 1024, height: 768 });
    await configureWorkspaceEvidenceState(page, 'open-garage');
    const media = await page.locator('.lobby-garage.editing').evaluate((element) => {
      const style = getComputedStyle(element);
      const buttonStyle = getComputedStyle(element.querySelector<HTMLButtonElement>('[data-preset]')!);
      const canvasProbe = document.createElement('span');
      canvasProbe.style.backgroundColor = 'Canvas';
      element.append(canvasProbe);
      const canvasBackground = getComputedStyle(canvasProbe).backgroundColor;
      canvasProbe.remove();
      return {
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        canvasBackground,
        borderImageSource: style.borderImageSource,
        forcedColorAdjust: style.forcedColorAdjust,
        transitionDuration: buttonStyle.transitionDuration,
        animationDuration: buttonStyle.animationDuration,
      };
    });
    expect(media.backgroundImage).toBe('none');
    expect(media.backgroundColor).toBe(media.canvasBackground);
    expect(media.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(media.borderImageSource).toBe('none');
    expect(media.forcedColorAdjust).toBe('auto');
    expect(Number.parseFloat(media.transitionDuration)).toBeLessThanOrEqual(0.001);
    expect(Number.parseFloat(media.animationDuration)).toBeLessThanOrEqual(0.001);
    await retainWorkspaceCapture(
      page,
      records,
      'special-reduced-motion-forced-colours-1024x768.png',
      'open-garage',
      'special',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });

    await page.route(/\/(?:art\/tank-parts\.webp|assets\/chrome\/[^/?]+\.png)(?:\?.*)?$/u, (route) => {
      if (route.request().resourceType() === 'image') return route.abort();
      return route.continue();
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await configureWorkspaceEvidenceState(page, 'open-garage');
    const fallbacks = await page.locator(
      '.lobby-garage__tank-preview, .lobby-garage__preset-thumbnail',
    ).evaluateAll((canvases) => canvases.map((node) => {
      const canvas = node as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) return 0;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] !== 0) painted += 1;
      }
      return painted;
    }));
    expect(fallbacks).toHaveLength(5);
    expect(fallbacks.every((painted) => painted > 0)).toBe(true);
    await retainWorkspaceCapture(
      page,
      records,
      'special-missing-art-fallback-1024x768.png',
      'open-garage',
      'special',
    );

    const index = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      purpose: 'PR #515 Local Battle and shared Garage owner visual acceptance',
      provenance,
      coverage: {
        states: ['default-two-seat', 'modified-player-2', 'four-seat', 'open-garage'],
        viewports: WORKSPACE_EVIDENCE_GEOMETRIES,
        specialConditions: [
          '200% equivalent reflow',
          'reduced motion',
          'forced colours',
          'missing command chrome and tank atlas',
        ],
      },
      records,
    };
    await writeFile(
      join(WORKSPACE_EVIDENCE_DIR!, 'index.json'),
      `${JSON.stringify(index, null, 2)}\n`,
      'utf8',
    );
    const reviewRows = records.map((record) => (
      `| ${record.state} | ${record.viewport.width}×${record.viewport.height} | ${record.devicePixelRatio} | ${record.reflowEquivalent} | [${record.file}](./${record.file}) |`
    ));
    await writeFile(
      join(WORKSPACE_EVIDENCE_DIR!, 'REVIEW.md'),
      [
        '# Command Center workspace finish evidence',
        '',
        `- HEAD: \`${provenance.headCommit}\``,
        `- Merge base with \`origin/main\`: \`${provenance.mergeBase}\``,
        `- Branch: \`${provenance.branch}\``,
        `- Source dirty at capture: \`${String(provenance.sourceDirty)}\``,
        `- Source-status SHA-256: \`${provenance.sourceStatusSha256}\``,
        `- Source-content SHA-256: \`${provenance.sourceContentSha256}\``,
        `- Served runtime SHA-256 (${provenance.servedResourceCount} same-origin resources): \`${provenance.servedRuntimeSha256}\``,
        `- Browser command: \`${provenance.testCommand}\``,
        '',
        '| State | Viewport | DPR | Zoom/reflow | Capture |',
        '|---|---:|---:|---|---|',
        ...reviewRows,
        '',
      ].join('\n'),
      'utf8',
    );
  });
});

// Decoration failure, reduced motion, forced colours, and 200%-equivalent reflow remain
// causal production checks in command-center-visual-seam.spec.ts rather than screenshot claims here.
