import { expect, test, type Page } from '@playwright/test';
import { assertLobbyControlReachable, assertLobbyFrame, gotoLobby } from './support';

async function gotoCampaignCommandCenter(page: Page): Promise<void> {
  await gotoLobby(page);
  await expect(page.locator('#lobby .command-center')).toHaveCount(1);
  await expect(page.locator('#lobby .command-center__navigation')).toHaveCount(1);
  if (!(await page.locator('#lobby [data-campaign-command-view]').isVisible())) {
    const railCampaigns = page.locator('.command-center__category-rail')
      .getByRole('button', { name: 'Campaigns', exact: true });
    if (await railCampaigns.isVisible()) {
      await railCampaigns.click();
    } else {
      await page.getByRole('button', { name: 'Modes', exact: true }).click();
      await page.getByRole('navigation', { name: 'Modes', exact: true })
        .getByRole('button', { name: 'Campaigns', exact: true })
        .click();
      await page.getByRole('button', { name: 'Close Modes', exact: true }).click();
    }
  }
  await expect(page.locator('#lobby [data-campaign-command-view]')).toBeVisible();
  await expect(page.locator('#lobby [data-command-primary]')).toHaveCount(1);
}

async function assertRenderedTargetsArePhysicalSize(page: Page): Promise<void> {
  const targets = await page.locator(
    '#lobby .command-center button, '
      + '#lobby .command-center select, '
      + '#lobby .command-center summary, '
      + '#lobby .lobby-deployment__masthead .account-panel button',
  ).evaluateAll((elements) => elements.flatMap((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || box.width === 0 || box.height === 0) {
      return [];
    }
    return [{
      label: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 60) ?? element.tagName,
      width: box.width,
      height: box.height,
    }];
  }));

  expect(targets.length, 'the rendered command surface should expose controls').toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.width, `${target.label} target width`).toBeGreaterThanOrEqual(43.5);
    expect(target.height, `${target.label} target height`).toBeGreaterThanOrEqual(43.5);
  }
}

test.describe('T11 command-center production visual seam', () => {
  test('renders one campaign-first hierarchy with a dominant reachable action', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoCampaignCommandCenter(page);

    await expect(page.locator('.command-center__category-rail')).toBeVisible();
    await expect(page.locator('.command-center__modes-trigger')).toBeHidden();
    await expect(page.locator('.command-center__library')).toBeVisible();
    await expect(page.locator('.command-center__workspace-host')).toBeVisible();
    await assertLobbyFrame(page);
    await assertRenderedTargetsArePhysicalSize(page);

    const primary = page.locator('[data-command-primary]');
    const primaryBox = await primary.boundingBox();
    expect(primaryBox, 'primary campaign action should render').not.toBeNull();
    expect(primaryBox!.height, 'primary action is materially taller than ordinary targets')
      .toBeGreaterThanOrEqual(58);
    await primary.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(primary).toBeFocused();
    const focus = await primary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(focus.style).not.toBe('none');
    expect(focus.width).toBeGreaterThanOrEqual(2);

    const resilientText = await page.locator('.command-center__item-label').evaluate((element) => ({
      overflowWrap: getComputedStyle(element).overflowWrap,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }));
    expect(resilientText.overflowWrap).toBe('anywhere');
    expect(resilientText.whiteSpace).toBe('normal');

    const longLabel = await page.locator('.command-center__item-label').evaluate((element) => {
      element.textContent = 'Ash Road Expedition with an Improbably Long Campaign Designation and Extended Theater Command';
      const item = element.closest<HTMLElement>('.command-center__item')!;
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      return {
        horizontalOverflow: item.scrollWidth - item.clientWidth,
        wrappedLines: element.scrollHeight / lineHeight,
      };
    });
    expect(longLabel.horizontalOverflow, 'long campaign labels remain inside their item')
      .toBeLessThanOrEqual(1);
    expect(longLabel.wrappedLines, 'long campaign labels wrap instead of truncating')
      .toBeGreaterThan(1.5);

    const scrollOwners = await page.locator('.command-center').evaluate((element) => {
      const library = element.querySelector<HTMLElement>('.command-center__library-items')!;
      const workspace = element.querySelector<HTMLElement>('.command-center__workspace-host')!;
      const preparationBody = element.querySelector<HTMLElement>('.preparation-frame__body')!;
      return {
        library: getComputedStyle(library).overflowY,
        workspace: getComputedStyle(workspace).overflowY,
        preparationBody: getComputedStyle(preparationBody).overflowY,
      };
    });
    expect(scrollOwners).toEqual({
      library: 'hidden',
      workspace: 'hidden',
      preparationBody: 'auto',
    });
  });

  test('keeps compact, portrait, and 200%-zoom-equivalent layouts contained', async ({ page }) => {
    for (const viewport of [
      { width: 844, height: 390, label: 'compact touch geometry' },
      { width: 720, height: 450, label: '1440x900 at 200% reflow geometry' },
    ]) {
      await page.setViewportSize(viewport);
      await gotoCampaignCommandCenter(page);
      await expect(page.locator('.command-center__modes-trigger'), viewport.label).toBeVisible();
      await expect(page.locator('.command-center__category-rail'), viewport.label).toBeHidden();
      await assertLobbyFrame(page);
      await assertRenderedTargetsArePhysicalSize(page);
      await assertLobbyControlReachable(page, '[data-command-primary]');
    }

    for (const viewport of [
      { width: 360, height: 640, label: 'narrow portrait' },
      { width: 320, height: 568, label: 'minimum portrait' },
    ]) {
      await page.setViewportSize(viewport);
      await gotoCampaignCommandCenter(page);
      await assertLobbyFrame(page);
      await assertRenderedTargetsArePhysicalSize(page);
      await assertLobbyControlReachable(page, '[data-command-primary]');

      const portrait = await page.locator('#lobby .lobby-card').evaluate((card) => {
        const title = card.querySelector<HTMLElement>('.lobby-deployment__masthead > h1')!;
        const account = card.querySelector<HTMLElement>('.lobby-deployment__masthead > .account-panel')!;
        const workspace = card.querySelector<HTMLElement>('.command-center__workspace-host')!;
        const preparationBody = card.querySelector<HTMLElement>('.preparation-frame__body')!;
        const titleBox = title.getBoundingClientRect();
        const accountBox = account.getBoundingClientRect();
        return {
          cardOverflowY: card.scrollHeight - card.clientHeight,
          workspaceOverflowY: workspace.scrollHeight - workspace.clientHeight,
          workspaceOverflowStyle: getComputedStyle(workspace).overflowY,
          preparationOverflowY: preparationBody.scrollHeight - preparationBody.clientHeight,
          preparationOverflowStyle: getComputedStyle(preparationBody).overflowY,
          headerSeparated: titleBox.right <= accountBox.left + 1,
          rankDisplay: (() => {
            const rank = card.querySelector<HTMLElement>('.account-panel__commander-rank-row');
            return rank ? getComputedStyle(rank).display : null;
          })(),
        };
      });
      expect(portrait.cardOverflowY, `${viewport.label} card must not become a second scroll owner`)
        .toBeLessThanOrEqual(1);
      expect(portrait.workspaceOverflowY, `${viewport.label} outer workspace stays inert`)
        .toBeLessThanOrEqual(1);
      expect(portrait.workspaceOverflowStyle, `${viewport.label} outer workspace clips its mounted frame`)
        .toBe('hidden');
      expect(portrait.preparationOverflowY, `${viewport.label} preparation body owns portrait overflow`)
        .toBeGreaterThan(0);
      expect(portrait.preparationOverflowStyle, `${viewport.label} preparation body is the scroll lane`)
        .toBe('auto');
      expect(portrait.headerSeparated, `${viewport.label} brand and commander chrome do not overlap`)
        .toBe(true);
      if (portrait.rankDisplay !== null) expect(portrait.rankDisplay).toBe('none');
    }
  });

  test('keeps semantics when decoration is unavailable', async ({ page }) => {
    await page.route(
      /\/(?:panel-frame|iron-tile|gold-tile|map-tile|button-(?:frame|selected-frame|hover-frame|pressed-frame|gold-frame|disabled-frame))(?:-[A-Za-z0-9_-]+)?\.png(?:\?.*)?$/,
      (route) => (route.request().resourceType() === 'image' ? route.abort() : route.continue()),
    );
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoCampaignCommandCenter(page);

    await expect(page.getByRole('button', { name: /^Ash Road/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fuel Stop' })).toBeVisible();
    await expect(page.getByText('Immediate objective', { exact: true })).toBeVisible();
    await expect(page.locator('[data-command-primary]')).toBeVisible();
    await assertLobbyFrame(page);
    await assertRenderedTargetsArePhysicalSize(page);
  });

  test('honours reduced motion and forced-colour preferences', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoCampaignCommandCenter(page);

    const preferences = await page.locator('.command-center__item').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
        forcedColorAdjust: style.forcedColorAdjust,
        backgroundImage: style.backgroundImage,
      };
    });
    expect(Number.parseFloat(preferences.animationDuration)).toBeLessThanOrEqual(0.001);
    expect(Number.parseFloat(preferences.transitionDuration)).toBeLessThanOrEqual(0.001);
    expect(preferences.forcedColorAdjust).toBe('auto');
    expect(preferences.backgroundImage).toBe('none');
    await assertLobbyFrame(page);
  });
});
