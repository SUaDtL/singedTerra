import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  enterBattleIfBriefed,
  gotoLobby,
  openQuickOperationsWorkspace,
} from './support';

async function openReturningChooser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
  });
  await gotoLobby(page);
  await openQuickOperationsWorkspace(page);
}

async function assertReachableTarget(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width, 'real control must retain its physical hitbox').toBeGreaterThanOrEqual(44);
  expect(box!.height, 'real control must retain its physical hitbox').toBeGreaterThanOrEqual(44);
}

async function assertCardTextFits(card: Locator): Promise<void> {
  const box = (await card.boundingBox())!;
  for (const selector of ['.lobby-quick-operation__card-title', '.lobby-quick-operation__card-briefing']) {
    const label = card.locator(selector);
    const text = (await label.boundingBox())!;
    const overflow = await label.evaluate((node) => node.scrollHeight - node.clientHeight);
    expect(overflow, 'operation label must not clip its own text vertically').toBeLessThanOrEqual(1);
    expect(text.y, 'operation text must start inside its button').toBeGreaterThanOrEqual(box.y - 1);
    expect(text.y + text.height, 'operation text must end inside its button').toBeLessThanOrEqual(box.y + box.height + 1);
  }
}

test('deployment console preview follows the selected operation and keeps launch controls reachable', async ({ page }, testInfo) => {
  await openReturningChooser(page);
  const preview = page.locator('[data-ui="battlefield-preview"]');
  const title = preview.locator('[data-ui="battlefield-preview-title"]');
  await expect(preview).toBeVisible();
  await expect(title).toHaveText('Standard Duel');
  await expect(preview.locator('[data-ui="battlefield-preview-facts"]')).toContainText('3');
  await page.screenshot({ path: testInfo.outputPath('deployment-console-standard.png') });
  const operationBox = await page.locator('[data-ui="quick-operation"]').boundingBox();
  const previewBox = await preview.boundingBox();
  const railBox = await page.locator('.lobby-deployment-rail').boundingBox();
  expect(operationBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(previewBox!.x, 'battlefield preview belongs beside the operation list').toBeGreaterThanOrEqual(operationBox!.x + operationBox!.width - 1);
  expect(previewBox!.height, 'preview must retain a readable panel, not a clipped header').toBeGreaterThan(150);
  expect(previewBox!.y + previewBox!.height, 'preview must not overlap the launch rail').toBeLessThanOrEqual(railBox!.y + 1);
  await expect(preview.locator('img')).toBeVisible();
  expect(await preview.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), 'shipped battlefield artwork must load').toBe(true);

  for (const [id, name, world] of [
    ['crosswind-range', 'Crosswind Range', 'glassstorm-expanse'],
    ['caldera-run', 'Caldera Run', 'obsidian-caldera'],
    ['last-light-siege', 'Last Light Siege', 'ember-dusk'],
  ] as const) {
    const option = page.locator(`[data-operation-id="${id}"]`);
    await assertReachableTarget(option);
    await assertCardTextFits(option);
    const textSizes = await option.evaluate((button) => {
      const title = button.querySelector<HTMLElement>('.lobby-quick-operation__card-title')!;
      const briefing = button.querySelector<HTMLElement>('.lobby-quick-operation__card-briefing')!;
      return { title: Number.parseFloat(getComputedStyle(title).fontSize),
        briefing: Number.parseFloat(getComputedStyle(briefing).fontSize) };
    });
    expect(textSizes.title, 'selected-operation title must remain physically readable').toBeGreaterThanOrEqual(12);
    expect(textSizes.briefing, 'operation briefing must not shrink to fit decorative chrome').toBeGreaterThanOrEqual(10.5);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(preview).toHaveAttribute('aria-label', `Battlefield preview: ${name}`);
    await expect(preview).toHaveAttribute('data-battlefield-world', world);
    await expect(title).toHaveText(name);
    const imageBox = (await preview.locator('img').boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    const panelBox = (await preview.boundingBox())!;
    expect(titleBox.y, 'preview illustration must not cover the selected title').toBeGreaterThanOrEqual(imageBox.y + imageBox.height - 1);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  }

  const launch = page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true });
  await assertReachableTarget(launch);
  const modes = page.getByRole('button', { name: 'Modes', exact: true });
  if (await modes.isVisible()) {
    await assertReachableTarget(modes);
  } else {
    for (const category of ['Campaigns', 'Skirmishes', 'Multiplayer']) {
      await assertReachableTarget(page.locator('.command-center__category-rail')
        .getByRole('button', { name: category, exact: true }));
    }
  }

  const overflow = await page.locator('.lobby-deployment').evaluate((element) => ({
    scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
  }));
  expect(overflow.scrollWidth, 'console must not require horizontal scrolling').toBeLessThanOrEqual(overflow.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath('deployment-console-selected.png') });
});

test('imported challenge keeps operation text contained beside its preview', async ({ page }, testInfo) => {
  await page.goto('./#challenge=ST1-CW-16');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.getByRole('button', { name: 'Start challenge vs CPU', exact: true })).toBeVisible();
  for (const card of await page.locator('[data-operation-id]').all()) {
    await card.scrollIntoViewIfNeeded();
    await assertCardTextFits(card);
  }
  const preview = page.locator('[data-ui="battlefield-preview"]');
  const readout = preview.locator('.lobby-operation-preview__readout');
  const lastFact = preview.locator('dd').last();
  const panelBox = (await preview.boundingBox())!;
  const initialFactBox = (await lastFact.boundingBox())!;
  if (initialFactBox.y + initialFactBox.height > panelBox.y + panelBox.height + 1) {
    const scroll = await readout.evaluate((node) => ({ client: node.clientHeight, content: node.scrollHeight,
      overflow: getComputedStyle(node).overflowY }));
    expect(scroll.overflow, 'long imported briefing must provide a user-scrollable readout').toBe('auto');
    expect(scroll.content, 'the readout itself must own overflowing text').toBeGreaterThan(scroll.client);
    await readout.press('End');
    await expect.poll(() => readout.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  }
  expect(await preview.evaluate((node) => node.scrollTop), 'reading facts must not scroll the hidden panel or its header').toBe(0);
  const factBox = (await lastFact.boundingBox())!;
  expect(factBox.y).toBeGreaterThanOrEqual(panelBox.y - 1);
  expect(factBox.y + factBox.height, 'imported operation facts must be reachable inside the preview').toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  await page.screenshot({ path: testInfo.outputPath('deployment-console-imported.png') });
});

test('keyboard selection in the new console launches the selected operation into the existing HUD', async ({ page }, testInfo) => {
  await openReturningChooser(page);
  const caldera = page.locator('[data-operation-id="caldera-run"]');
  await caldera.press('Enter');
  await expect(caldera).toBeFocused();
  await expect(caldera).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-ui="battlefield-preview-title"]')).toHaveText('Caldera Run');
  await page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true }).press('Enter');
  await enterBattleIfBriefed(page);
  await expect(page.locator('[data-console-owner="preact"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Fire / })).toBeEnabled();
  await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
  await expect(page.locator('#hud [data-ui="quick-operation"]'))
    .toHaveText('Caldera Run · Lava terrain turns every crater into a positional risk.');
  await page.screenshot({ path: testInfo.outputPath('deployment-console-to-hud.png') });
});
