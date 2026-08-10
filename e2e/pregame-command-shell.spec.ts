import { expect, test } from '@playwright/test';
import { assertLobbyControlReachable, assertLobbyFrame, gotoLobby, isCompact } from './support';

async function openLocal(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
}

async function openOnline(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  await page.getByRole('button', { name: 'Play Online', exact: true }).click();
}

async function installLiveRejoinFixture(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  await page.route('**/rest/v1/rooms*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'room-rejoin-fixture',
        code: 'BACK',
        seed: 17,
        options: { maxPlayers: 2, maxWind: 10, gravity: 0.15 },
        players: [{ id: 'player-rejoin-fixture', name: 'Ranger', color: '#e84d4d', ready: true }],
        status: 'active',
      }),
    });
  });
  await page.evaluate(() => {
    localStorage.setItem('singedterra:session', JSON.stringify({
      roomId: 'room-rejoin-fixture',
      roomCode: 'BACK',
      playerId: 'player-rejoin-fixture',
    }));
  });
  await gotoLobby(page);
}

test.describe('Pre-game command shell', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLobby(page);
  });

  test('opens on one focused three-choice deployment front door', async ({ page }) => {
    const chooser = page.getByRole('navigation', { name: 'Choose deployment' });
    const choices = chooser.getByRole('button');

    await expect(choices).toHaveCount(3);
    await expect(choices).toHaveText([
      'Quick Duel vs CPU',
      'Local Battle',
      'Play Online',
    ]);
    await expect(page.locator('#lobby .lobby-start')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-online-primary')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-preview')).toHaveCount(0);
    await assertLobbyFrame(page);
  });

  test('makes Quick Duel the one dominant, touch-sized deployment choice', async ({ page }) => {
    const chooser = page.getByRole('navigation', { name: 'Choose deployment' });
    const quick = chooser.getByRole('button', { name: 'Quick Duel vs CPU', exact: true });
    const local = chooser.getByRole('button', { name: 'Local Battle', exact: true });
    const online = chooser.getByRole('button', { name: 'Play Online', exact: true });

    const metrics = await chooser.evaluate((element) => {
      const app = document.getElementById('app');
      const quick = element.querySelector<HTMLElement>('.primary');
      const secondary = [...element.querySelectorAll<HTMLElement>('button:not(.primary)')];
      if (!app || !quick || secondary.length !== 2) throw new Error('Expected deployment choices');
      const zoom = Number.parseFloat(getComputedStyle(app).zoom || app.style.zoom) || 1;
      return {
        publishedTarget: Number.parseFloat(
          getComputedStyle(app).getPropertyValue('--st-deployment-choice-target'),
        ),
        expectedTarget: Math.ceil(44 / zoom),
        quickHeight: quick.getBoundingClientRect().height,
        quickFont: Number.parseFloat(getComputedStyle(quick).fontSize) * zoom,
        quickBackground: getComputedStyle(quick).background,
        secondaryHeights: secondary.map((choice) => choice.getBoundingClientRect().height),
        secondaryBackgrounds: secondary.map((choice) => getComputedStyle(choice).backgroundColor),
        primaryCount: element.querySelectorAll('.primary').length,
      };
    });

    expect(metrics.primaryCount).toBe(1);
    expect(metrics.publishedTarget).toBe(metrics.expectedTarget);
    expect(metrics.quickHeight).toBeGreaterThanOrEqual(52);
    expect(metrics.quickFont).toBeGreaterThanOrEqual(14);
    expect(metrics.quickHeight).toBeGreaterThan(Math.max(...metrics.secondaryHeights));
    expect(metrics.secondaryBackgrounds).not.toContain('rgb(255, 210, 63)');
    expect(new Set(metrics.secondaryBackgrounds).size).toBe(1);
    expect(metrics.quickBackground).not.toContain(metrics.secondaryBackgrounds[0]!);
    for (const choice of [quick, local, online]) {
      const box = await choice.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await assertLobbyFrame(page);
  });

  test('makes a valid rejoin the sole dominant deployment action', async ({ page }) => {
    await installLiveRejoinFixture(page);

    const deployment = page.locator('#lobby .lobby-deployment');
    const rejoin = page.getByRole('button', { name: 'Rejoin your game', exact: true });
    const quick = page.getByRole('button', { name: 'Quick Duel vs CPU', exact: true });
    await expect(rejoin).toBeVisible();
    await expect(quick).toBeVisible();

    const hierarchy = await deployment.evaluate((element) => {
      const rejoin = element.querySelector<HTMLElement>('.lobby-rejoin-banner .lobby-btn');
      const quick = element.querySelector<HTMLElement>('.lobby-deployment-chooser .lobby-btn');
      if (!rejoin || !quick) throw new Error('Expected rejoin and Quick Duel actions');
      const rejoinStyle = getComputedStyle(rejoin);
      const quickStyle = getComputedStyle(quick);
      return {
        primaryCount: element.querySelectorAll('.lobby-btn.primary').length,
        rejoinPrimary: rejoin.classList.contains('primary'),
        quickPrimary: quick.classList.contains('primary'),
        rejoinHeight: rejoin.getBoundingClientRect().height,
        quickHeight: quick.getBoundingClientRect().height,
        rejoinFont: Number.parseFloat(rejoinStyle.fontSize),
        quickFont: Number.parseFloat(quickStyle.fontSize),
      };
    });

    expect.soft(hierarchy.primaryCount, 'rejoin state must expose exactly one primary action').toBe(1);
    expect.soft(hierarchy.rejoinPrimary, 'Rejoin must own the primary treatment').toBe(true);
    expect.soft(hierarchy.quickPrimary, 'Quick Duel must yield primary treatment to Rejoin').toBe(false);
    expect.soft(hierarchy.rejoinHeight, 'Rejoin must retain a 44px physical target')
      .toBeGreaterThanOrEqual(44);
    expect.soft(hierarchy.rejoinHeight, 'Rejoin must be at least as tall as Quick Duel')
      .toBeGreaterThanOrEqual(hierarchy.quickHeight);
    expect.soft(hierarchy.rejoinFont, 'Rejoin must be at least as legible as Quick Duel')
      .toBeGreaterThanOrEqual(hierarchy.quickFont);
    await assertLobbyControlReachable(page, '#lobby .lobby-rejoin-banner .lobby-btn');
    await assertLobbyFrame(page);
  });

  test('opens Local preparation only after selection and returns focus to its choice', async ({ page }) => {
    await openLocal(page);

    await expect(page.getByRole('heading', { name: 'Hot Seat', exact: true })).toBeVisible();
    await expect(page.locator('#lobby .lobby-hotseat-ready')).toContainText('2-player local battle');
    await expect(page.locator('#lobby .lobby-start')).toBeVisible();
    await expect(page.locator('#lobby .lobby-preview')).toBeVisible();
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Local Battle', exact: true })).toBeFocused();
    await expect(page.locator('#lobby .lobby-start')).toHaveCount(0);
    await assertLobbyFrame(page);
  });

  test('keeps valid Local defaults and validation inside preparation', async ({ page }) => {
    await openLocal(page);
    const customization = page.locator('#lobby .lobby-hotseat-customization');
    const start = page.locator('#lobby .lobby-start');

    await expect(customization).not.toHaveAttribute('open', '');
    await expect(start).toBeEnabled();
    await customization.getByText('Customize crew and battlefield', { exact: true }).click();
    const playerName = page.getByRole('textbox', { name: 'Player 1' });
    await playerName.fill('');
    await expect(start).toBeDisabled();
    await expect(page.locator('#lobby .lobby-error')).toBeVisible();
    await playerName.fill('Player 1');
    await expect(start).toBeEnabled();
    await assertLobbyFrame(page);
  });

  test('opens Online preparation and keeps all three room-entry routes reachable', async ({ page }) => {
    await openOnline(page);

    await expect(page.getByRole('heading', { name: 'Play Online', exact: true })).toBeVisible();
    await expect(page.locator('#lobby .lobby-online-primary')).toBeVisible();
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="join-code"]');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="browse"]');

    await page.locator('[data-online-route="join-code"]').click();
    await expect(page.getByRole('heading', { name: 'Rally to a signal' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play Online', exact: true })).toBeFocused();
    await openOnline(page);
    await expect(page.getByRole('heading', { name: 'Rally to a signal' })).toBeVisible();
    await assertLobbyFrame(page);
  });

  test('keeps the selected preparation hierarchy legible and contained at compact sizes', async ({
    page,
  }, testInfo) => {
    test.skip(!(await isCompact(page)), 'The compact guard applies below the fixed-stage threshold.');

    for (const route of ['Local Battle', 'Play Online'] as const) {
      await page.getByRole('button', { name: route, exact: true }).click();
      const metrics = await page.locator('#lobby .lobby-deployment').evaluate((deployment) => {
        const app = document.getElementById('app');
        const context = deployment.querySelector<HTMLElement>('.lobby-mode-context h2');
        const back = deployment.querySelector<HTMLElement>('.lobby-deployment__back');
        const preview = deployment.querySelector<HTMLElement>('.lobby-preview');
        if (!app || !context || !back || !preview) throw new Error('Expected preparation hierarchy');
        const zoom = Number.parseFloat(getComputedStyle(app).zoom || app.style.zoom) || 1;
        return {
          headingFont: Number.parseFloat(getComputedStyle(context).fontSize) * zoom,
          backHeight: back.getBoundingClientRect().height,
          previewVisible: getComputedStyle(preview).visibility !== 'hidden',
        };
      });
      expect(metrics.headingFont).toBeGreaterThanOrEqual(12);
      expect(metrics.backHeight).toBeGreaterThanOrEqual(
        testInfo.project.name === 'pixel-touch' ? 44 : 32,
      );
      expect(metrics.previewVisible).toBe(true);
      await assertLobbyFrame(page);
      await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
    }
  });
});
