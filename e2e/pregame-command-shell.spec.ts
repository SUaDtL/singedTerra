import { expect, test } from '@playwright/test';
import {
  assertLobbyControlReachable,
  assertLobbyFrame,
  gotoLobby,
  isCompact,
  openLocalPreparation,
  openOnlinePreparation,
  openQuickOperationsWorkspace,
} from './support';

async function openLocal(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  await openLocalPreparation(page);
}

async function openOnline(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  await openOnlinePreparation(page);
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

  test('opens on the focused First Salvo skirmish workspace', async ({ page }) => {
    await openQuickOperationsWorkspace(page);
    const chooser = page.locator('.command-center__workspace-host .lobby-deployment-chooser');
    const firstSalvo = chooser.getByRole('button', { name: 'Start First Salvo', exact: true });
    const alternatives = chooser.locator('[data-ui="other-quick-duels"]');
    const operations = chooser.locator('[data-operation-id]');

    await expect(page.locator('.command-center__category-rail [data-command-category="skirmishes"]'))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(
      '.command-center__library-items button[data-command-item="quick-operations"]',
    ))
      .toHaveAttribute('aria-current', 'true');
    await expect(firstSalvo).toHaveClass(/primary/);
    await expect(chooser.locator('button.primary')).toHaveCount(1);
    await expect(alternatives).not.toHaveAttribute('open', '');
    await expect(alternatives.locator('summary')).toBeVisible();
    await expect(operations).toHaveCount(5);
    await expect(operations.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#lobby .lobby-start')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-online-primary')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-preview')).toHaveCount(0);
    await assertLobbyFrame(page);
  });

  test('makes First Salvo the one dominant, touch-sized skirmish action', async ({ page }) => {
    await openQuickOperationsWorkspace(page);
    const chooser = page.locator('.command-center__workspace-host .lobby-deployment-chooser');
    const firstSalvo = chooser.getByRole('button', { name: 'Start First Salvo', exact: true });
    const alternatives = chooser.locator('[data-ui="other-quick-duels"]');
    const quick = chooser.getByRole('button', { name: 'Quick Duel vs CPU', exact: true });
    const operations = chooser.locator('[data-operation-id]');

    await expect(alternatives).not.toHaveAttribute('open', '');
    await alternatives.locator('summary').click();
    await expect(alternatives).toHaveAttribute('open', '');

    const metrics = await chooser.evaluate((element) => {
      const firstSalvo = element.querySelector<HTMLElement>('.primary');
      const secondary = element.querySelector<HTMLElement>('button[aria-label="Quick Duel vs CPU"]');
      if (!firstSalvo || !secondary) throw new Error('Expected Quick Operations actions');
      return {
        firstSalvoHeight: firstSalvo.getBoundingClientRect().height,
        firstSalvoFont: Number.parseFloat(getComputedStyle(firstSalvo).fontSize),
        firstSalvoBackground: getComputedStyle(firstSalvo).background,
        secondaryHeight: secondary.getBoundingClientRect().height,
        secondaryBackground: getComputedStyle(secondary).backgroundColor,
        primaryCount: element.querySelectorAll('.primary').length,
      };
    });

    expect(metrics.primaryCount).toBe(1);
    expect(metrics.secondaryHeight).toBeGreaterThanOrEqual(44);
    expect(metrics.firstSalvoHeight).toBeGreaterThanOrEqual(52);
    expect(metrics.firstSalvoFont).toBeGreaterThanOrEqual(14);
    expect(metrics.firstSalvoHeight).toBeGreaterThan(metrics.secondaryHeight);
    expect(metrics.firstSalvoBackground).not.toBe(metrics.secondaryBackground);
    for (const choice of [firstSalvo, quick]) {
      const box = await choice.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    for (const operation of await operations.all()) {
      const box = await operation.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await assertLobbyFrame(page);
  });

  test('makes a valid rejoin the sole dominant deployment action', async ({ page }) => {
    await installLiveRejoinFixture(page);

    const deployment = page.locator('#lobby .lobby-deployment');
    const rejoin = page.getByRole('button', { name: 'Rejoin your game', exact: true });
    const online = page.locator(
      '.command-center__library-items button[data-command-item="online"]',
    );
    await expect(rejoin).toBeVisible();
    await expect(online).toHaveAttribute('aria-current', 'true');

    const hierarchy = await deployment.evaluate((element) => {
      const rejoin = element.querySelector<HTMLElement>('.lobby-rejoin-banner .lobby-btn');
      const alternate = element.querySelector<HTMLElement>('.command-center__primary-action');
      if (!rejoin || !alternate) throw new Error('Expected rejoin and selected Online action');
      const rejoinStyle = getComputedStyle(rejoin);
      const alternateStyle = getComputedStyle(alternate);
      return {
        primaryCount: element.querySelectorAll('.lobby-btn.primary').length,
        rejoinPrimary: rejoin.classList.contains('primary'),
        alternateDanger: alternate.classList.contains('primary'),
        rejoinHeight: rejoin.getBoundingClientRect().height,
        alternateHeight: alternate.getBoundingClientRect().height,
        rejoinFont: Number.parseFloat(rejoinStyle.fontSize),
        alternateFont: Number.parseFloat(alternateStyle.fontSize),
      };
    });

    expect.soft(hierarchy.primaryCount, 'rejoin state must expose exactly one primary action').toBe(1);
    expect.soft(hierarchy.rejoinPrimary, 'Rejoin must own the primary treatment').toBe(true);
    expect.soft(hierarchy.alternateDanger, 'Online setup must not impersonate the rejoin treatment')
      .toBe(false);
    expect.soft(hierarchy.rejoinHeight, 'Rejoin must retain a 44px physical target')
      .toBeGreaterThanOrEqual(44);
    expect.soft(hierarchy.rejoinFont, 'Rejoin copy remains legible')
      .toBeGreaterThanOrEqual(14);
    await assertLobbyControlReachable(page, '#lobby .lobby-rejoin-banner .lobby-btn');
    await assertLobbyFrame(page);
  });

  test('opens Local preparation only after selection and returns focus to its choice', async ({ page }) => {
    await openLocal(page);

    await expect(page.getByRole('heading', { name: 'Hot Seat', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Local Battle', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#lobby .lobby-name')).toHaveCount(2);
    await expect(page.locator('#lobby .lobby-start')).toBeVisible();
    await expect(page.locator('#lobby .lobby-preview')).toBeVisible();
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
    await expect(page.locator(
      '.command-center__library-items button[data-command-item="local-battle"]',
    )).toBeFocused();
    await expect(page.locator('#lobby .lobby-start')).toHaveCount(0);
    await assertLobbyFrame(page);
  });

  test('keeps valid Local defaults and validation inside preparation', async ({ page }) => {
    await openLocal(page);
    const start = page.locator('#lobby .lobby-start');

    await expect(start).toBeEnabled();
    const playerName = page.getByRole('textbox', { name: 'Player 1' });
    await expect(playerName).toBeVisible();
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
    await expect(page.locator(
      '.command-center__library-items button[data-command-item="online"]',
    )).toBeFocused();
    await openOnline(page);
    await expect(page.getByRole('heading', { name: 'Rally to a signal' })).toBeVisible();
    await assertLobbyFrame(page);
  });

  test('keeps the selected preparation hierarchy legible and contained at compact sizes', async ({
    page,
  }, testInfo) => {
    test.skip(!(await isCompact(page)), 'The compact guard applies below the fixed-stage threshold.');

    for (const route of ['Local Battle', 'Play Online'] as const) {
      if (route === 'Local Battle') await openLocal(page);
      else await openOnline(page);
      const metrics = await page.locator('#lobby .lobby-deployment').evaluate((deployment) => {
        const context = deployment.querySelector<HTMLElement>('.lobby-mode-context h2');
        const back = deployment.querySelector<HTMLElement>('.lobby-deployment__back');
        const preview = deployment.querySelector<HTMLElement>('.lobby-preview');
        if (!context || !back || !preview) throw new Error('Expected preparation hierarchy');
        return {
          headingFont: Number.parseFloat(getComputedStyle(context).fontSize),
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
