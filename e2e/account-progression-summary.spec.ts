import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoLobby, isCompact } from './support';

async function openLocalPreparation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
  await expect(page.locator('.lobby-preview')).toBeVisible();
}

async function installSummaryFixture(page: Page, available: boolean, open = true): Promise<void> {
  await page.evaluate(({ hasSummary, isOpen }) => {
    document.querySelector('#lobby .account-panel')?.remove();
    const panel = document.createElement('section');
    panel.className = 'account-panel account-panel--authenticated';
    panel.classList.toggle('account-panel--open', isOpen);
    panel.dataset['summaryFixture'] = hasSummary ? 'available' : 'unavailable';

    const trigger = document.createElement('button');
    trigger.className = 'account-panel__account-trigger';
    if (hasSummary) {
      const commander = document.createElement('span');
      commander.className = 'account-panel__commander-name';
      commander.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWX';
      const level = document.createElement('span');
      level.className = 'account-panel__commander-level';
      level.textContent = 'Level 3';
      const milestone = document.createElement('span');
      milestone.className = 'account-panel__record-milestone';
      milestone.textContent = '300 XP to Level 4';
      trigger.append(commander, level, milestone);
      trigger.setAttribute(
        'aria-label',
        'Commander ABCDEFGHIJKLMNOPQRSTUVWX, Level 3, 300 XP to Level 4. Player account',
      );
    } else {
      trigger.textContent = 'Commander ABCDEFGHIJKLMNOPQRSTUVWX';
    }
    trigger.setAttribute('aria-expanded', String(isOpen));
    if (hasSummary && !isOpen) {
      const record = document.createElement('section');
      record.className = 'account-panel__record';
      record.setAttribute('aria-label', 'Commander dossier');
      const heading = document.createElement('h2');
      heading.textContent = 'COMMANDER DOSSIER';
      const meter = document.createElement('progress');
      meter.className = 'account-panel__record-xp';
      meter.value = 200;
      meter.max = 500;
      meter.setAttribute('aria-label', 'Commander ABCDEFGHIJKLMNOPQRSTUVWX Level 3 XP progress');
      record.append(heading, trigger, meter);
      panel.append(record);
    } else {
      panel.append(trigger);
    }

    const identity = document.createElement('span');
    identity.className = 'account-panel__identity';
    identity.textContent = 'Commander ABCDEFGHIJKLMNOPQRSTUVWX';
    panel.append(identity);

    if (hasSummary) {
      const summary = document.createElement('dl');
      summary.className = 'account-panel__progress';
      for (const [label, value] of [
        ['Matches', '8'],
        ['Recorded wins', '4'],
        ['Level', '3'],
      ]) {
        const item = document.createElement('div');
        item.className = 'account-panel__progress-item';
        const term = document.createElement('dt');
        term.textContent = label;
        const count = document.createElement('dd');
        count.textContent = value;
        item.append(term, count);
        summary.append(item);
      }
      panel.append(summary);

      const xp = document.createElement('div');
      xp.className = 'account-panel__xp';
      const header = document.createElement('div');
      header.className = 'account-panel__xp-header';
      const label = document.createElement('span');
      label.className = 'account-panel__xp-label';
      label.textContent = 'XP progress';
      const value = document.createElement('span');
      value.className = 'account-panel__xp-value';
      value.textContent = '200 / 500 XP';
      header.append(label, value);
      const meter = document.createElement('progress');
      meter.className = 'account-panel__xp-meter';
      meter.value = 200;
      meter.max = 500;
      meter.setAttribute('aria-label', 'Level 3 XP progress');
      const remaining = document.createElement('span');
      remaining.className = 'account-panel__xp-remaining';
      remaining.textContent = '300 XP to Level 4';
      xp.append(header, meter, remaining);
      panel.append(xp);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'account-panel__summary-unavailable';
      unavailable.textContent = 'Progress summary unavailable';
      panel.append(unavailable);
    }

    const signOut = document.createElement('button');
    signOut.className = 'account-panel__secondary';
    signOut.textContent = 'Sign out';
    panel.append(signOut);

    const close = document.createElement('button');
    close.className = 'account-panel__secondary account-panel__close';
    close.textContent = 'Close';
    panel.append(close);
    document.querySelector('.lobby-deployment__masthead')?.append(panel);
  }, { hasSummary: available, isOpen: open });
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
    await gotoLobby(page);
    const compact = await isCompact(page);
    test.skip(!compact, 'Account summary typography oracle requires a compact project');
    expect(compact, 'test project must exercise #app.is-compact').toBe(true);
  });

  test('available summary remains legible, contained, and non-overlapping', async ({ page }) => {
    await installSummaryFixture(page, true);
    const panel = page.locator('[data-summary-fixture="available"]');
    const trigger = panel.locator('.account-panel__account-trigger');
    await panel.evaluate((node) => {
      node.style.width = '330px';
    });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
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
    const xpBox = await xp.boundingBox();
    expect(summaryBox, 'summary should render').not.toBeNull();
    expect(xpBox, 'XP section should render').not.toBeNull();
    expect(boxesOverlap(summaryBox!, xpBox!), 'summary and XP section must not overlap').toBe(false);
  });

  test('collapsed authenticated account stays clear of the vehicle spotlight', async ({ page }) => {
    await openLocalPreparation(page);
    const preview = page.locator('.lobby-preview');
    const masthead = page.locator('.lobby-deployment__masthead');
    const baselinePreviewBox = await preview.boundingBox();
    const baselineMastheadBox = await masthead.boundingBox();
    expect(baselinePreviewBox, 'no-record preview should render').not.toBeNull();
    expect(baselineMastheadBox, 'no-record masthead should render').not.toBeNull();
    await installSummaryFixture(page, true, false);
    const panel = page.locator('[data-summary-fixture="available"]');
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
    const level = trigger.locator('.account-panel__commander-level');
    const milestone = trigger.locator('.account-panel__record-milestone');
    await expect(commander).toHaveText('ABCDEFGHIJKLMNOPQRSTUVWX');
    await expect(level).toHaveText('Level 3');
    await expect(milestone).toHaveText('300 XP to Level 4');
    expect(await trigger.evaluate((node) => getComputedStyle(node).whiteSpace)).not.toBe('nowrap');
    expect(await trigger.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis');
    for (const text of [commander, level, milestone]) {
      const textBox = await renderedTextBox(text);
      const ownerBox = await trigger.boundingBox();
      expect(ownerBox, 'dossier disclosure should render').not.toBeNull();
      expect(textBox.x).toBeGreaterThanOrEqual(ownerBox!.x - 1);
      expect(textBox.y).toBeGreaterThanOrEqual(ownerBox!.y - 1);
      expect(textBox.x + textBox.width).toBeLessThanOrEqual(ownerBox!.x + ownerBox!.width + 1);
      expect(textBox.y + textBox.height).toBeLessThanOrEqual(ownerBox!.y + ownerBox!.height + 1);
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
    expect(reservedPreviewBox!.y).toBeGreaterThan(baselinePreviewBox!.y);
    expect(reservedMastheadBox!.height).toBeGreaterThan(baselineMastheadBox!.height);
    expect(
      boxesOverlap(panelBox!, spotlightBox!),
      `collapsed account trigger must not cover the vehicle spotlight: ${JSON.stringify({ panelBox, spotlightBox })}`,
    ).toBe(false);
    expect(
      boxesOverlap(panelBox!, missionBriefBox!),
      `collapsed account trigger must not cover the mission brief: ${JSON.stringify({ panelBox, missionBriefBox })}`,
    ).toBe(false);
  });

  test('unavailable summary remains legible and contained', async ({ page }) => {
    await installSummaryFixture(page, false);
    const panel = page.locator('[data-summary-fixture="unavailable"]');
    const unavailable = panel.locator('.account-panel__summary-unavailable');
    const box = await unavailable.boundingBox();
    expect(box, 'unavailable summary should render').not.toBeNull();
    expect(box!.height, 'unavailable summary should retain at least 8 physical pixels')
      .toBeGreaterThanOrEqual(8);
    await expectInside(unavailable, panel);
  });
});

test.describe('Collapsed commander dossier front-door geometry', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLobby(page);
    await installSummaryFixture(page, true, false);
  });

  test('keeps the full dossier inside the masthead and clear of deployment choices', async ({ page }) => {
    const panel = page.locator('[data-summary-fixture="available"]');
    const masthead = page.locator('.lobby-deployment__masthead');
    const chooser = page.locator('.lobby-deployment-chooser');
    const trigger = panel.locator('.account-panel__account-trigger');
    const commander = trigger.locator('.account-panel__commander-name');
    const level = trigger.locator('.account-panel__commander-level');
    const milestone = trigger.locator('.account-panel__record-milestone');

    await expect(trigger).toHaveAttribute(
      'aria-label',
      'Commander ABCDEFGHIJKLMNOPQRSTUVWX, Level 3, 300 XP to Level 4. Player account',
    );
    expect(await trigger.evaluate((node) => getComputedStyle(node).whiteSpace)).not.toBe('nowrap');
    expect(await trigger.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis');
    await expectInside(panel, masthead);

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox, 'dossier disclosure should render').not.toBeNull();
    for (const text of [commander, level, milestone]) {
      const textBox = await renderedTextBox(text);
      expect(textBox.x).toBeGreaterThanOrEqual(triggerBox!.x - 1);
      expect(textBox.y).toBeGreaterThanOrEqual(triggerBox!.y - 1);
      expect(textBox.x + textBox.width).toBeLessThanOrEqual(triggerBox!.x + triggerBox!.width + 1);
      expect(textBox.y + textBox.height).toBeLessThanOrEqual(triggerBox!.y + triggerBox!.height + 1);
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
