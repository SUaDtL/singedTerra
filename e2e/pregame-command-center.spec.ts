import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { assertLobbyControlReachable, assertLobbyFrame, enterBattleIfBriefed, gotoLobby } from './support';

const EVIDENCE_DIR = process.env['COMMAND_CENTER_EVIDENCE_DIR'];
const REQUIRE_EVIDENCE = process.env['COMMAND_CENTER_REQUIRE_EVIDENCE'] === '1';
const SELECTION_KEY = 'singedterra.command-center.selection.v1';
const COMMAND_CATEGORIES = ['Campaigns', 'Skirmishes', 'Multiplayer'];

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
    await assertCommandGeometry(page, GEOMETRIES.compact);

    const modes = page.getByRole('button', { name: 'Modes', exact: true });
    await modes.tap();
    await expect(modes).toHaveAttribute('aria-expanded', 'true');
    const sheet = page.getByRole('navigation', { name: 'Modes', exact: true });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Skirmishes', exact: true }).tap();
    await expect(page.locator('.command-center__item[data-command-item="quick-operations"]'))
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

  test('non-default keyboard selection survives account rerender and match return in session only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'fine-pointer keyboard owner');
    await page.setViewportSize(GEOMETRIES.standard.viewport);
    await openAshRoad(page);
    const rail = page.locator('.command-center__category-rail');
    const campaigns = rail.getByRole('button', { name: 'Campaigns', exact: true });
    await campaigns.focus();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByRole('button', { name: 'Skirmishes', exact: true })).toBeFocused();
    await expect(page.locator('.command-center__item[data-command-item="quick-operations"]'))
      .toHaveAttribute('aria-current', 'true');
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), SELECTION_KEY))
      .toBe(JSON.stringify({ categoryId: 'skirmishes', itemId: 'quick-operations' }));
    expect(await page.evaluate((key) => localStorage.getItem(key), SELECTION_KEY)).toBeNull();

    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('dialog', { name: 'Player account', exact: true })
      .getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.command-center__item[data-command-item="quick-operations"]'))
      .toHaveAttribute('aria-current', 'true');

    await page.getByRole('button', { name: 'Start First Salvo', exact: true }).click();
    await expect(page.locator('#app')).toBeVisible();
    await returnFromBattle(page);
    await expect(page.locator('.command-center__item[data-command-item="quick-operations"]'))
      .toHaveAttribute('aria-current', 'true');
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), SELECTION_KEY))
      .toBe(JSON.stringify({ categoryId: 'skirmishes', itemId: 'quick-operations' }));
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
