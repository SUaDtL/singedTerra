import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoLobby, isCompact } from './support';

async function openLocalPreparation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
  await expect(page.locator('.lobby-preview')).toBeVisible();
}

async function gotoProductionAccountFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      access_token: 'e2e-public-session-token',
      refresh_token: 'e2e-public-refresh-token',
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: 'bearer',
      user: {
        id: 'e2e-commander',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'commander@example.test',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-08-10T00:00:00.000Z',
      },
    }));
  });
  await page.route('**/rest/v1/profiles**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-commander',
        display_name: 'ABCDEFGHIJKLMNOPQRSTUVWX',
      }),
    });
  });
  await page.route('**/functions/v1/account_summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        matchesPlayed: 55,
        wins: 40,
        progressionVersion: 1,
        totalXp: 9_500,
        level: 20,
        levelXp: 0,
        nextLevelXp: 500,
        verifiedProgression: {
          evidence: 'verified_replay_v1',
          matchesPlayed: 8,
          wins: 4,
          progressionVersion: 1,
          totalXp: 1_200,
          level: 3,
          levelXp: 200,
          nextLevelXp: 500,
        },
      }),
    });
  });
  await page.goto('./');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#lobby .account-panel--authenticated')).toBeVisible();
}

async function expectInside(inner: Locator, outer: Locator): Promise<void> {
  const innerBox = await inner.boundingBox();
  const outerBox = await outer.boundingBox();
  expect(innerBox, 'summary content should render').not.toBeNull();
  expect(outerBox, 'account panel should render').not.toBeNull();
  expect(innerBox!.x).toBeGreaterThanOrEqual(outerBox!.x - 1);
  expect(innerBox!.y).toBeGreaterThanOrEqual(outerBox!.y - 1);
  expect(innerBox!.x + innerBox!.width).toBeLessThanOrEqual(outerBox!.x + outerBox!.width + 1);
  expect(innerBox!.y + innerBox!.height).toBeLessThanOrEqual(outerBox!.y + outerBox!.height + 1);
}

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    first.x + first.width <= second.x
    || second.x + second.width <= first.x
    || first.y + first.height <= second.y
    || second.y + second.height <= first.y
  );
}

async function renderedTextBox(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  return locator.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

test.describe('Account progression summary compact readability', () => {
  test.beforeEach(async ({ page }) => {
    await gotoProductionAccountFixture(page);
    const compact = await isCompact(page);
    test.skip(!compact, 'Account summary typography oracle requires a compact project');
    expect(compact, 'test project must exercise #app.is-compact').toBe(true);
  });

  test('available summary remains legible, contained, and non-overlapping', async ({ page }) => {
    const trigger = page.locator('#lobby .account-panel__account-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Player account' }).locator('.account-panel');
    await expect(panel).toBeVisible();
    const summary = panel.locator('.account-panel__progress');
    const labels = summary.locator('dt');
    const values = summary.locator('dd');
    await expect(labels).toHaveCount(3);
    await expect(values).toHaveCount(3);

    for (const label of await labels.all()) {
      const box = await label.boundingBox();
      expect(box, 'summary label should render').not.toBeNull();
      expect(box!.height, 'summary label should retain at least 8 physical pixels').toBeGreaterThanOrEqual(8);
      expect(await label.evaluate((node) => getComputedStyle(node).fontSize))
        .toMatch(/^(1[0-9]|[2-9][0-9])px$/);
    }
    for (const value of await values.all()) {
      const box = await value.boundingBox();
      expect(box, 'summary value should render').not.toBeNull();
      expect(box!.height, 'summary value should retain at least 8 physical pixels').toBeGreaterThanOrEqual(8);
      expect(await value.evaluate((node) => getComputedStyle(node).fontSize))
        .toMatch(/^(1[2-9]|[2-9][0-9])px$/);
    }
    await expectInside(summary, panel);

    const career = panel.locator('.account-panel__career');
    await expect(career).toHaveAttribute('aria-label', 'Commander career rank');
    await expect(career.locator('.account-panel__career-current'))
      .toHaveText('R-03 / Bombardier');
    await expect(career.locator('.account-panel__career-insignia'))
      .toHaveAttribute('aria-label', 'Bombardier rank insignia: double diamond');
    await expect(career.locator('.account-panel__career-next'))
      .toHaveText('Next rank: Artillerist at Level 5');
    await expectInside(career, panel);
    for (const careerText of await career.locator(
      '.account-panel__career-insignia, .account-panel__career-current, .account-panel__career-next',
    ).all()) {
      const box = await renderedTextBox(careerText);
      expect(box.height, 'career identity should retain at least 8 physical pixels')
        .toBeGreaterThanOrEqual(8);
    }

    const items = await summary.locator('.account-panel__progress-item').all();
    expect(items).toHaveLength(3);
    const boxes = await Promise.all(items.map((item) => item.boundingBox()));
    for (const box of boxes) {
      expect(box, 'summary item should render').not.toBeNull();
    }
    const textBoxes = [];
    for (const item of items) {
      const itemBox = await item.boundingBox();
      expect(itemBox, 'summary item should render for text containment').not.toBeNull();
      for (const text of await item.locator('dt, dd').all()) {
        const textBox = await renderedTextBox(text);
        expect(textBox.x).toBeGreaterThanOrEqual(itemBox!.x - 1);
        expect(textBox.x + textBox.width).toBeLessThanOrEqual(itemBox!.x + itemBox!.width + 1);
        textBoxes.push(textBox);
      }
    }
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        expect(
          boxesOverlap(boxes[left]!, boxes[right]!),
          `summary items ${left + 1} and ${right + 1} must not overlap`,
        ).toBe(false);
      }
    }
    for (let left = 0; left < textBoxes.length; left += 1) {
      for (let right = left + 1; right < textBoxes.length; right += 1) {
        expect(
          boxesOverlap(textBoxes[left]!, textBoxes[right]!),
          `summary text ${left + 1} and ${right + 1} must not overlap`,
        ).toBe(false);
      }
    }

    const xp = panel.locator('.account-panel__xp');
    const xpLabel = xp.locator('.account-panel__xp-label');
    const xpValue = xp.locator('.account-panel__xp-value');
    const remaining = xp.locator('.account-panel__xp-remaining');
    const meter = xp.locator('progress');
    await expect(xpLabel).toHaveText('XP progress');
    await expect(xpValue).toHaveText('200 / 500 XP');
    await expect(remaining).toHaveText('300 XP to Level 4');
    await expect(meter).toHaveAttribute('value', '200');
    await expect(meter).toHaveAttribute('max', '500');
    await expect(meter).toHaveAttribute('aria-label', 'Level 3 XP progress');
    await expectInside(xp, panel);

    for (const text of [xpLabel, xpValue, remaining]) {
      const box = await text.boundingBox();
      expect(box, 'XP copy should render').not.toBeNull();
      expect(box!.height, 'XP copy should retain at least 8 physical pixels')
        .toBeGreaterThanOrEqual(8);
      expect(await text.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)))
        .toBeGreaterThanOrEqual(12);
    }

    const summaryBox = await summary.boundingBox();
    const careerBox = await career.boundingBox();
    const xpBox = await xp.boundingBox();
    expect(summaryBox, 'summary should render').not.toBeNull();
    expect(careerBox, 'career rank should render').not.toBeNull();
    expect(xpBox, 'XP section should render').not.toBeNull();
    expect(boxesOverlap(summaryBox!, careerBox!), 'summary and career rank must not overlap').toBe(false);
    expect(boxesOverlap(careerBox!, xpBox!), 'career rank and XP section must not overlap').toBe(false);
    expect(boxesOverlap(summaryBox!, xpBox!), 'summary and XP section must not overlap').toBe(false);
  });

  test('collapsed authenticated account stays clear of the vehicle spotlight', async ({ page }) => {
    await openLocalPreparation(page);
    const preview = page.locator('.lobby-preview');
    const masthead = page.locator('.lobby-deployment__masthead');
    const panel = page.locator('#lobby .account-panel--authenticated');
    const trigger = panel.locator('.account-panel__account-trigger');
    const spotlight = page.locator('.lobby-preview__spotlight');
    const missionBrief = page.locator('.lobby-deployment__mission-brief');
    const summary = panel.locator('.account-panel__progress');
    const xp = panel.locator('.account-panel__xp');

    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const record = panel.locator('.account-panel__record');
    await expect(record).toBeVisible();
    await expect(record).toHaveAttribute('aria-label', 'Commander dossier');
    await expect(record.getByRole('heading', { name: 'COMMANDER DOSSIER', exact: true })).toBeVisible();
    await expect(record.locator('progress')).toHaveAttribute('aria-label', 'Commander ABCDEFGHIJKLMNOPQRSTUVWX Level 3 XP progress');
    const commander = trigger.locator('.account-panel__commander-name');
    const insignia = trigger.locator('.account-panel__commander-insignia');
    const rank = trigger.locator('.account-panel__commander-rank');
    const level = trigger.locator('.account-panel__commander-level');
    const milestone = trigger.locator('.account-panel__record-milestone');
    const nextRank = trigger.locator('.account-panel__career-next');
    await expect(commander).toHaveText('ABCDEFGHIJKLMNOPQRSTUVWX');
    await expect(insignia).toHaveText('◆◆');
    await expect(insignia).toHaveAttribute('aria-label', 'Bombardier rank insignia: double diamond');
    await expect(rank).toHaveText('R-03 / Bombardier');
    await expect(level).toHaveText('Level 3');
    await expect(milestone).toHaveText('300 XP to Level 4');
    await expect(nextRank).toHaveText('NEXT RANK / ARTILLERIST / LEVEL 5');
    expect(await trigger.evaluate((node) => getComputedStyle(node).whiteSpace)).not.toBe('nowrap');
    expect(await trigger.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis');
    for (const text of [commander, insignia, rank, level, milestone, nextRank]) {
      const textBox = await renderedTextBox(text);
      const ownerBox = await trigger.boundingBox();
      expect(ownerBox, 'dossier disclosure should render').not.toBeNull();
      expect(textBox.x).toBeGreaterThanOrEqual(ownerBox!.x - 1);
      expect(textBox.y).toBeGreaterThanOrEqual(ownerBox!.y - 1);
      expect(textBox.x + textBox.width).toBeLessThanOrEqual(ownerBox!.x + ownerBox!.width + 1);
      expect(textBox.y + textBox.height).toBeLessThanOrEqual(ownerBox!.y + ownerBox!.height + 1);
      expect(textBox.height, 'career copy must remain physically legible').toBeGreaterThanOrEqual(8);
    }
    const headingBox = await record.getByRole('heading', { name: 'COMMANDER DOSSIER', exact: true }).boundingBox();
    const triggerBox = await trigger.boundingBox();
    const meterBox = await record.locator('progress').boundingBox();
    expect(headingBox, 'Player Record heading should render').not.toBeNull();
    expect(triggerBox, 'Player Record disclosure should render').not.toBeNull();
    expect(meterBox, 'Player Record meter should render').not.toBeNull();
    expect(headingBox!.height, 'Player Record heading should remain legible after stage zoom').toBeGreaterThanOrEqual(8);
    expect(triggerBox!.height, 'Player Record disclosure should meet the rendered touch floor').toBeGreaterThanOrEqual(24);
    expect(meterBox!.height, 'Player Record meter should remain visible after stage zoom').toBeGreaterThanOrEqual(4);
    await expect(summary).toBeHidden();
    await expect(xp).toBeHidden();
    const panelBox = await panel.boundingBox();
    const spotlightBox = await spotlight.boundingBox();
    const missionBriefBox = await missionBrief.boundingBox();
    const reservedPreviewBox = await preview.boundingBox();
    const reservedMastheadBox = await masthead.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(spotlightBox).not.toBeNull();
    expect(missionBriefBox).not.toBeNull();
    expect(reservedPreviewBox, 'dossier-reserved preview should render').not.toBeNull();
    expect(reservedMastheadBox, 'dossier-reserved masthead should render').not.toBeNull();
    expect(
      boxesOverlap(panelBox!, spotlightBox!),
      `collapsed account trigger must not cover the vehicle spotlight: ${JSON.stringify({ panelBox, spotlightBox })}`,
    ).toBe(false);
    expect(
      boxesOverlap(panelBox!, missionBriefBox!),
      `collapsed account trigger must not cover the mission brief: ${JSON.stringify({ panelBox, missionBriefBox })}`,
    ).toBe(false);
  });

});

test.describe('Collapsed commander dossier front-door geometry', () => {
  test.beforeEach(async ({ page }) => {
    await gotoProductionAccountFixture(page);
  });

  test('keeps the full dossier inside the masthead and clear of deployment choices', async ({ page }) => {
    const panel = page.locator('#lobby .account-panel--authenticated');
    const masthead = page.locator('.lobby-deployment__masthead');
    const chooser = page.locator('.lobby-deployment-chooser');
    const trigger = panel.locator('.account-panel__account-trigger');
    const commander = trigger.locator('.account-panel__commander-name');
    const insignia = trigger.locator('.account-panel__commander-insignia');
    const rank = trigger.locator('.account-panel__commander-rank');
    const level = trigger.locator('.account-panel__commander-level');
    const milestone = trigger.locator('.account-panel__record-milestone');
    const nextRank = trigger.locator('.account-panel__career-next');

    await expect(trigger).toHaveAttribute(
      'aria-label',
      'Commander ABCDEFGHIJKLMNOPQRSTUVWX, R-03 Bombardier, Level 3, 300 XP to Level 4, next rank Artillerist at Level 5. Player account',
    );
    expect(await trigger.evaluate((node) => getComputedStyle(node).whiteSpace)).not.toBe('nowrap');
    expect(await trigger.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis');
    await expectInside(panel, masthead);

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox, 'dossier disclosure should render').not.toBeNull();
    for (const text of [commander, insignia, rank, level, milestone, nextRank]) {
      const textBox = await renderedTextBox(text);
      expect(textBox.x).toBeGreaterThanOrEqual(triggerBox!.x - 1);
      expect(textBox.y).toBeGreaterThanOrEqual(triggerBox!.y - 1);
      expect(textBox.x + textBox.width).toBeLessThanOrEqual(triggerBox!.x + triggerBox!.width + 1);
      expect(textBox.y + textBox.height).toBeLessThanOrEqual(triggerBox!.y + triggerBox!.height + 1);
      expect(textBox.height, 'career copy must remain physically legible').toBeGreaterThanOrEqual(8);
    }

    const panelBox = await panel.boundingBox();
    const chooserBox = await chooser.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(chooserBox).not.toBeNull();
    expect(
      boxesOverlap(panelBox!, chooserBox!),
      `commander dossier must not cover deployment choices: ${JSON.stringify({ panelBox, chooserBox })}`,
    ).toBe(false);
  });
});

test('opened Player Account owns the lobby stage without ghosting the deployment beneath it', async ({ page }) => {
  await gotoLobby(page);
  await openLocalPreparation(page);
  const lobby = page.locator('#lobby');
  const card = page.locator('#lobby .lobby-card');
  const masthead = page.locator('.lobby-deployment__masthead');
  const brief = page.locator('.lobby-deployment__mission-brief');
  const preview = page.locator('.lobby-preview');
  const before = await Promise.all([masthead.boundingBox(), brief.boundingBox(), preview.boundingBox()]);
  for (const box of before) expect(box).not.toBeNull();

  await page.getByRole('button', { name: 'Account' }).click();
  const panel = page.locator('#lobby .lobby-overlay .account-panel');
  const overlay = page.locator('#lobby .lobby-overlay');
  const backdrop = page.locator('#lobby .lobby-overlay__backdrop');
  const surface = page.locator('#lobby .lobby-overlay__surface');
  await expect(panel).toBeVisible();
  await expect(page.locator('#lobby .lobby-overlay__close')).toBeFocused();
  await expect(overlay).toHaveAttribute('data-overlay-presentation', 'stage-modal');
  await expect(overlay).toHaveClass(/lobby-overlay--account/);
  expect(await overlay.evaluate((node) => getComputedStyle(node).position)).toBe('absolute');
  expect(await surface.evaluate((node) => getComputedStyle(node).position)).toBe('absolute');
  expect(await card.evaluate((node) => Number(getComputedStyle(node).opacity))).toBe(0);
  const [lobbyBox, overlayBox, backdropBox, surfaceBox] = await Promise.all([
    lobby.boundingBox(), overlay.boundingBox(), backdrop.boundingBox(), surface.boundingBox(),
  ]);
  for (const box of [lobbyBox, overlayBox, backdropBox, surfaceBox]) expect(box).not.toBeNull();
  for (const candidate of [overlayBox!, backdropBox!]) {
    expect(candidate.x).toBeCloseTo(lobbyBox!.x, 1);
    expect(candidate.y).toBeCloseTo(lobbyBox!.y, 1);
    expect(candidate.width).toBeCloseTo(lobbyBox!.width, 1);
    expect(candidate.height).toBeCloseTo(lobbyBox!.height, 1);
  }
  expect(surfaceBox!.x).toBeGreaterThanOrEqual(lobbyBox!.x);
  expect(surfaceBox!.y).toBeGreaterThanOrEqual(lobbyBox!.y);
  expect(surfaceBox!.x + surfaceBox!.width).toBeLessThanOrEqual(lobbyBox!.x + lobbyBox!.width);
  expect(surfaceBox!.y + surfaceBox!.height).toBeLessThanOrEqual(lobbyBox!.y + lobbyBox!.height);
  expect(await backdrop.evaluate((node) => {
    const color = getComputedStyle(node).backgroundColor;
    const alpha = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)?.[1];
    return alpha === undefined ? 1 : Number(alpha);
  })).toBeGreaterThanOrEqual(0.96);
  expect(await surface.evaluate((node) => getComputedStyle(node).overflowY)).toBe('auto');
  const accountWidth = await surface.evaluate((node) => ({
    compact: document.querySelector('#app')?.classList.contains('is-compact') ?? false,
    cssWidth: Number.parseFloat(getComputedStyle(node).width),
  }));
  if (!accountWidth.compact) {
    expect(accountWidth.cssWidth).toBeGreaterThanOrEqual(650);
    expect(accountWidth.cssWidth).toBeLessThanOrEqual(720);
  }
  const after = await Promise.all([masthead.boundingBox(), brief.boundingBox(), preview.boundingBox()]);
  for (let index = 0; index < before.length; index += 1) {
    expect(after[index]!.x).toBeCloseTo(before[index]!.x, 1);
    expect(after[index]!.y).toBeCloseTo(before[index]!.y, 1);
    expect(after[index]!.height).toBeCloseTo(before[index]!.height, 1);
  }
});
