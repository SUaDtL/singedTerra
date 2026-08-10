import { expect, test } from '@playwright/test';
import { assertLobbyControlReachable, assertLobbyFrame, gotoLobby, isCompact } from './support';

async function expectBriefHeaderAboveSetup(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  const overlap = await page.locator('#lobby .lobby-route-brief').evaluate((brief) => {
    const heading = brief.querySelector<HTMLElement>('.lobby-route-brief__title');
    const firstSetupChild = brief.querySelector<HTMLElement>('.lobby-route-brief__setup > *');
    if (!heading || !firstSetupChild) throw new Error('Expected a route heading and setup control');
    const headingRect = heading.getBoundingClientRect();
    const setupRect = firstSetupChild.getBoundingClientRect();
    return {
      headingBottom: headingRect.bottom,
      setupTop: setupRect.top,
    };
  });

  expect(
    overlap.headingBottom,
    'compact route heading must clear its first setup control',
  ).toBeLessThanOrEqual(overlap.setupTop + 1);
}

async function commandStyle(page: Parameters<typeof gotoLobby>[0]): Promise<{
  shellRule: string;
  hotSeatRadius: string;
}> {
  return page.locator('#lobby .lobby-command-header').evaluate((header) => {
    const shell = getComputedStyle(header);
    const lobby = document.querySelector<HTMLElement>('#lobby');
    const hotSeat = lobby?.querySelector<HTMLElement>('.lobby-start');
    if (!hotSeat) throw new Error('Expected Hot Seat control is missing');
    return {
      shellRule: shell.borderBottomStyle,
      hotSeatRadius: getComputedStyle(hotSeat).borderRadius,
    };
  });
}

async function compactCommandMetrics(page: Parameters<typeof gotoLobby>[0]): Promise<{
  duplicatePreviewContent: string;
  operational: Record<string, number>;
  technical: Record<string, number>;
  technicalOverflow: Array<{ text: string; clientWidth: number; scrollWidth: number }>;
}> {
  return page.locator('#lobby .lobby-card').evaluate((card) => {
    const app = document.getElementById('app');
    if (!app) throw new Error('Expected fixed-stage app');
    const zoom = Number.parseFloat(getComputedStyle(app).zoom || app.style.zoom) || 1;
    const renderedFont = (selector: string): number => {
      const element = card.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Expected compact command element: ${selector}`);
      return Number.parseFloat(getComputedStyle(element).fontSize) * zoom;
    };
    return {
      duplicatePreviewContent: getComputedStyle(card, '::before').content,
      operational: {
        route: renderedFont('.lobby-mode-context h2'),
        selectedMode: renderedFont('.lobby-tab.active'),
        primaryAction: renderedFont('.lobby-mode-panel:not([hidden]) .lobby-btn.primary'),
        setupSummary: renderedFont(
          '.lobby-mode-panel:not([hidden]) .lobby-hotseat-ready h3, '
          + '.lobby-mode-panel:not([hidden]) .lobby-route-brief--online .lobby-preparation-section__title',
        ),
        account: renderedFont(
          '.account-panel > button, .account-panel__record .account-panel__account-trigger',
        ),
        vehicleIdentity: renderedFont('.lobby-preview__spotlight-identity'),
      },
      technical: {
        commandKicker: renderedFont('.lobby-command-header__kicker'),
        vehicleBay: renderedFont('.lobby-preview__label'),
        partRole: renderedFont('.lobby-preview__part span'),
        partName: renderedFont('.lobby-preview__part strong'),
      },
      technicalOverflow: [...card.querySelectorAll<HTMLElement>(
        '.lobby-preview__part span, .lobby-preview__part strong',
      )]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          text: element.textContent ?? '',
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
    };
  });
}

test.describe('Pre-game command shell', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLobby(page);
  });

  test('gives Hot Seat a tactical shell and squared command controls', async ({ page }) => {
    const shell = page.locator('#lobby .lobby-command-header');
    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute('aria-label', 'Pre-game command preparation');
    await expect(shell).toHaveText('COMMAND PREPARATION');
    await expect(page.getByRole('heading', { name: 'COMMAND PREPARATION', exact: true })).toBeVisible();

    const style = await commandStyle(page);
    expect(style.shellRule).toBe('solid');
    expect(style.hotSeatRadius).toBe('0px');
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-start');
  });

  test('launches valid Hot Seat defaults before asking for customization', async ({ page }) => {
    const ready = page.locator('#lobby .lobby-hotseat-ready');
    const customization = page.locator('#lobby .lobby-hotseat-customization');
    const manifest = page.locator(
      '#lobby [data-preparation-section="crew-manifest"]',
    );
    const start = page.locator('#lobby .lobby-start');

    await expect(ready).toContainText('2-player local battle');
    await expect(ready).toContainText('Current crew and battlefield setup is ready');
    await expect(customization).not.toHaveAttribute('open', '');
    await expect(manifest).toBeHidden();
    await expect(start).toBeVisible();
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    await customization.getByText('Customize crew and battlefield', { exact: true }).click();
    await expect(customization).toHaveAttribute('open', '');
    await expect(manifest).toBeVisible();
    await expect(start).toBeVisible();
    const expandedGeometry = await page.locator('#lobby .lobby-card').evaluate((card) => {
      const launch = card.querySelector<HTMLElement>('.lobby-start');
      if (!launch) throw new Error('Expected local launch action');
      const cardRect = card.getBoundingClientRect();
      const launchRect = launch.getBoundingClientRect();
      return {
        cardScrollTop: card.scrollTop,
        launchTop: launchRect.top,
        launchBottom: launchRect.bottom,
        cardTop: cardRect.top,
        cardBottom: cardRect.bottom,
      };
    });
    expect(expandedGeometry.cardScrollTop).toBe(0);
    expect(expandedGeometry.launchTop).toBeGreaterThanOrEqual(expandedGeometry.cardTop - 1);
    expect(expandedGeometry.launchBottom).toBeLessThanOrEqual(expandedGeometry.cardBottom + 1);
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    await customization.locator('.lobby-field select').first().selectOption('3');
    await expect(customization).toHaveAttribute('open', '');
    await expect(page.locator('#lobby .lobby-row')).toHaveCount(3);
  });

  test('keeps live validation visible until the player corrects it', async ({ page }) => {
    const customization = page.locator('#lobby .lobby-hotseat-customization');
    const summary = customization.locator('summary');
    const start = page.locator('#lobby .lobby-start');
    const playerName = page.getByRole('textbox', { name: 'Player 1' });

    await summary.click();
    await playerName.fill('');
    await expect(start).toBeDisabled();
    await expect(page.locator('#lobby .lobby-error')).toBeVisible();
    await summary.click();
    await expect(customization).toHaveAttribute('open', '');
    await expect(page.locator('#lobby .lobby-error')).toBeVisible();

    await playerName.fill('Player 1');
    await expect(start).toBeEnabled();
    await summary.click();
    await expect(customization).not.toHaveAttribute('open', '');
    await expect(page.locator('#lobby .lobby-hotseat-ready')).toBeVisible();
  });

  test('keeps compact route choices usable while customization is open', async ({ page }) => {
    test.skip(!(await isCompact(page)), 'The compact guard applies only below the fixed-stage threshold.');

    await page.locator('#lobby .lobby-hotseat-customization > summary').click();

    const quickDuel = page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true });
    const hotSeat = page.getByRole('tab', { name: 'Hot Seat', exact: true });
    const online = page.getByRole('tab', { name: 'Play Online', exact: true });
    await expect(quickDuel).toBeVisible();
    await expect(hotSeat).toBeVisible();
    await expect(online).toBeVisible();
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    const targetToken = await page.locator('#app').evaluate((app) => {
      const zoom = Number.parseFloat(getComputedStyle(app).zoom) || 1;
      return {
        actual: Number.parseFloat(getComputedStyle(app).getPropertyValue('--st-command-choice-target')),
        expected: Math.ceil(24 / zoom),
      };
    });
    expect(targetToken.actual, 'the stage scaler must publish the inverse-zoom target')
      .toBe(targetToken.expected);

    for (const control of [quickDuel, hotSeat, online]) {
      const box = await control.boundingBox();
      expect(box, 'compact command choices must have measurable hit targets').not.toBeNull();
      expect.soft(box!.height, 'compact command choices must retain a 24px physical target floor')
        .toBeGreaterThanOrEqual(24);
    }

    await hotSeat.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(online).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#lobby .lobby-online-primary')).toBeVisible();
  });

  test('carries the same command hierarchy into Online room entry', async ({ page }) => {
    await page.getByRole('tab', { name: 'Play Online', exact: true }).click();

    const style = await page.locator('#lobby .lobby-online-primary').evaluate((primary) => ({
      radius: getComputedStyle(primary).borderRadius,
      surface: getComputedStyle(primary).backgroundColor,
    }));
    expect(style.radius).toBe('0px');
    expect(style.surface).not.toBe('rgb(255, 210, 63)');
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="join-code"]');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="browse"]');
  });

  test('frames each immediate commitment as a contained deployment brief', async ({ page }) => {
    const brief = page.locator('#lobby .lobby-route-brief');
    await expect(brief).toBeVisible();
    await expect(brief.getByRole('heading', { name: 'Local battery' })).toBeVisible();
    await expect(brief.locator('.lobby-route-brief__setup')).toHaveAttribute(
      'aria-label',
      'Local battery setup',
    );
    expect(await brief.evaluate((element) => getComputedStyle(element).borderLeftStyle)).toBe('solid');
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    await page.getByRole('tab', { name: 'Play Online', exact: true }).click();
    await expect(brief.getByRole('heading', { name: 'Open operation' })).toBeVisible();
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');

    await page.locator('[data-online-route="join-code"]').click();
    await expect(brief.getByRole('heading', { name: 'Rally to a signal' })).toBeVisible();
    await expect(brief.locator('.lobby-route-brief__setup')).toHaveAttribute('aria-label', 'Rally setup');
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
  });

  test('keeps each compact route heading above its first setup control', async ({ page }) => {
    test.skip(!(await isCompact(page)), 'The compact guard applies only below the fixed-stage threshold.');

    await expectBriefHeaderAboveSetup(page);

    await page.getByRole('tab', { name: 'Play Online', exact: true }).click();
    await expectBriefHeaderAboveSetup(page);

    await page.locator('[data-online-route="join-code"]').click();
    await expectBriefHeaderAboveSetup(page);
  });

  test('keeps the compact command shell legible on one intentional preview plane', async ({
    page,
  }) => {
    test.skip(!(await isCompact(page)), 'The compact guard applies only below the fixed-stage threshold.');

    for (const route of ['Hot Seat', 'Play Online'] as const) {
      await page.getByRole('tab', { name: route, exact: true }).click();
      const metrics = await compactCommandMetrics(page);

      expect.soft(metrics.duplicatePreviewContent, 'the real Vehicle Bay must own the only preview plane')
        .toBe('none');
      for (const [label, pixels] of Object.entries(metrics.operational)) {
        expect.soft(pixels, `${route} ${label} must render at 12 physical pixels or larger`)
          .toBeGreaterThanOrEqual(12);
      }
      for (const [label, pixels] of Object.entries(metrics.technical)) {
        expect.soft(pixels, `${route} ${label} must render at 10 physical pixels or larger`)
          .toBeGreaterThanOrEqual(10);
      }
      expect.soft(metrics.technicalOverflow, `${route} Vehicle Bay labels must not be ellipsized`)
        .toEqual([]);

      await expect(page.locator('#lobby .lobby-preview')).toBeVisible();
      await assertLobbyFrame(page);
      await assertLobbyControlReachable(
        page,
        route === 'Hot Seat' ? '#lobby .lobby-start' : '#lobby .lobby-online-primary',
      );
    }
  });

  test('uses one deployment grid with a dominant route action at every supported size', async ({
    page,
  }, testInfo) => {
    const shell = page.locator('#lobby .lobby-deployment');
    const hotSeatPrimary = page.locator('#lobby .lobby-start');
    const initialLayout = await shell.evaluate((element) => {
      const style = getComputedStyle(element);
      const lobby = document.querySelector<HTMLElement>('#lobby')!;
      return {
        display: style.display,
        columns: style.gridTemplateColumns.split(' ').filter(Boolean),
        width: element.getBoundingClientRect().width,
        lobbyWidth: lobby.getBoundingClientRect().width,
      };
    });
    expect(initialLayout.display).toBe('grid');
    expect(initialLayout.columns).toHaveLength(
      testInfo.project.name === 'desktop-fine' ? 2 : 1,
    );
    expect(initialLayout.width / initialLayout.lobbyWidth).toBeGreaterThan(0.82);
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    await page.getByRole('tab', { name: 'Play Online', exact: true }).click();
    await expect(page.locator('#lobby .lobby-deployment__mission-brief'))
      .toHaveText(/Play Online/);
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
    await expect(hotSeatPrimary).toBeHidden();
  });

  test('shares one contained command row between Quick Duel and the mode tabs', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Play Online', exact: true }).click();
    await expect(page.locator('#lobby .lobby-deployment__mission-brief'))
      .toHaveText(/Play Online/);
    const brief = page.locator('#lobby .lobby-quick-duel');
    const action = brief.locator('.lobby-quick-duel__action');
    await expect(brief.getByRole('heading', { name: 'Quick Duel', exact: true })).toBeVisible();
    await expect(brief.locator('.lobby-quick-duel__description'))
      .toHaveText('Deploy one player against a medium CPU.');
    await expect(action).toHaveCount(1);
    await expect(action).toHaveText('Quick Duel vs CPU');
    await expect(action).toBeVisible();

    const geometry = await page.locator('#lobby .lobby-deployment').evaluate((deployment) => {
      const masthead = deployment.querySelector<HTMLElement>('.lobby-deployment__masthead');
      const brief = deployment.querySelector<HTMLElement>('.lobby-quick-duel');
      const action = deployment.querySelector<HTMLElement>('.lobby-quick-duel__action');
      const rail = deployment.querySelector<HTMLElement>('.lobby-deployment__mode-rail');
      const tabs = deployment.querySelector<HTMLElement>('.lobby-tabs');
      const card = deployment.closest<HTMLElement>('.lobby-card');
      const app = document.getElementById('app');
      if (!masthead || !brief || !action || !rail || !tabs || !card || !app) {
        throw new Error('Expected Quick Duel deployment grid');
      }
      const zoom = Number.parseFloat(getComputedStyle(app).zoom) || 1;
      const actionRect = action.getBoundingClientRect();
      const briefRect = brief.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const tabsRect = tabs.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        railArea: getComputedStyle(rail).gridArea,
        briefCssHeight: briefRect.height / zoom,
        actionRadius: getComputedStyle(action).borderRadius,
        actionCssHeight: actionRect.height / zoom,
        actionMinHeight: Number.parseFloat(getComputedStyle(action).minHeight),
        mastheadBottom: masthead.getBoundingClientRect().bottom,
        railRect: {
          top: railRect.top,
          bottom: railRect.bottom,
        },
        briefRect: {
          top: briefRect.top,
          right: briefRect.right,
          bottom: briefRect.bottom,
        },
        tabsRect: {
          left: tabsRect.left,
          top: tabsRect.top,
          bottom: tabsRect.bottom,
        },
        cardScrollTop: card.scrollTop,
        actionRect: {
          left: actionRect.left,
          top: actionRect.top,
          right: actionRect.right,
          bottom: actionRect.bottom,
        },
        cardRect: {
          left: cardRect.left,
          top: cardRect.top,
          right: cardRect.right,
          bottom: cardRect.bottom,
        },
      };
    });

    expect(geometry.railArea).toBe('rail');
    expect(Math.round(geometry.briefCssHeight)).toBe(46);
    expect(geometry.actionRadius).toBe('0px');
    expect(geometry.actionMinHeight).toBeGreaterThanOrEqual(46);
    expect(Math.round(geometry.actionCssHeight)).toBeGreaterThanOrEqual(46);
    expect(geometry.mastheadBottom).toBeLessThanOrEqual(geometry.railRect.top + 1);
    expect(geometry.briefRect.top).toBeGreaterThanOrEqual(geometry.railRect.top - 1);
    expect(geometry.briefRect.bottom).toBeLessThanOrEqual(geometry.railRect.bottom + 1);
    expect(geometry.briefRect.right).toBeLessThanOrEqual(geometry.tabsRect.left + 1);
    expect(geometry.briefRect.top).toBeLessThan(geometry.tabsRect.bottom);
    expect(geometry.briefRect.bottom).toBeGreaterThan(geometry.tabsRect.top);
    expect(geometry.cardScrollTop).toBe(0);
    expect(geometry.actionRect.left).toBeGreaterThanOrEqual(geometry.cardRect.left - 1);
    expect(geometry.actionRect.top).toBeGreaterThanOrEqual(geometry.cardRect.top - 1);
    expect(geometry.actionRect.right).toBeLessThanOrEqual(geometry.cardRect.right + 1);
    expect(geometry.actionRect.bottom).toBeLessThanOrEqual(geometry.cardRect.bottom + 1);
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-quick-duel__action');
  });

  test('launches the ordinary CPU duel journey into a running HUD', async ({ page }) => {
    await page.getByRole('tab', { name: 'Play Online', exact: true }).click();
    await expect(page.locator('#lobby .lobby-deployment__mission-brief'))
      .toHaveText(/Play Online/);
    const brief = page.locator('#lobby .lobby-quick-duel');
    const action = brief.getByRole('button', { name: 'Quick Duel vs CPU', exact: true });
    await expect(brief).toBeVisible();
    await expect(action).toBeVisible();
    await action.click();

    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('#hud.st-hud')).toBeVisible();
    await expect(page.locator('#hud .st-hud__name').filter({ hasText: 'CPU 1' }))
      .toHaveText('🤖 CPU 1');
  });

});
