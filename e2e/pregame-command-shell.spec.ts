import { expect, test } from '@playwright/test';
import {
  assertGoldSafeAction,
  assertLobbyControlReachable,
  assertCommandHeaderAssembly,
  assertLobbyFrame,
  gotoLobby,
  isCompact,
  openFirstSalvoWorkspace,
  openLocalPreparation,
  openOnlinePreparation,
} from './support';

async function openLocal(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  await openLocalPreparation(page);
}

async function openOnline(page: Parameters<typeof gotoLobby>[0]): Promise<void> {
  await openOnlinePreparation(page);
}

async function assertOnlineWorkspaceGeometry(
  page: Parameters<typeof gotoLobby>[0],
): Promise<void> {
  const workspace = page.locator('[data-multiplayer-command-view="online"]');
  await expect(workspace).toBeVisible();
  const controls = [
    ['name', workspace.locator('.lobby-name')],
    ['color', workspace.locator('.lobby-swatch').first()],
    ['garage', workspace.locator('.lobby-garage button').first()],
    ['primary', workspace.locator('.lobby-online-primary')],
    ['join route', workspace.locator('[data-online-route="join-code"]')],
    ['browse route', workspace.locator('[data-online-route="browse"]')],
  ] as const;
  for (const [label, control] of controls) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box, `${label} should render`).not.toBeNull();
    expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  }
  const overflow = await workspace.evaluate((element) => {
    const owned = element.querySelector<HTMLElement>('.multiplayer-command__online-workspace');
    if (!owned) throw new Error('Expected owned Online workspace');
    return {
      workspace: element.scrollWidth - element.clientWidth,
      owned: owned.scrollWidth - owned.clientWidth,
    };
  });
  expect(overflow.workspace).toBeLessThanOrEqual(1);
  expect(overflow.owned).toBeLessThanOrEqual(1);
  await assertLobbyFrame(page);
}

async function assertLocalWorkspaceGeometry(
  page: Parameters<typeof gotoLobby>[0],
): Promise<void> {
  const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
  const preview = workspace.locator('.lobby-preview');
  const setup = workspace.locator('.lobby-hotseat');
  await expect(workspace).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(setup).toBeVisible();

  const readStructure = () => workspace.evaluate((element) => {
      const preview = element.querySelector<HTMLElement>('.lobby-preview');
      const setup = element.querySelector<HTMLElement>('.lobby-hotseat');
      if (!preview || !setup) throw new Error('Expected Local preview and setup panels');
      const bounds = (node: HTMLElement) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      };
      const localWorkspace = element.querySelector<HTMLElement>(
        '.multiplayer-command__local-workspace',
      );
      if (!localWorkspace) throw new Error('Expected the owned Local workspace');
      return {
        preview: bounds(preview),
        setup: bounds(setup),
        workspaceClientWidth: element.clientWidth,
        workspaceScrollWidth: element.scrollWidth,
        localClientWidth: localWorkspace.clientWidth,
        localScrollWidth: localWorkspace.scrollWidth,
      };
    });
  await expect.poll(async () => {
    const current = await readStructure();
    return current.preview.width >= 180
      && current.preview.height >= 160
      && current.setup.width >= 280
      && current.setup.height >= 160;
  }).toBe(true);
  const structure = await readStructure();
  expect(structure.preview.width).toBeGreaterThanOrEqual(180);
  expect(structure.preview.height).toBeGreaterThanOrEqual(160);
  expect(structure.setup.width).toBeGreaterThanOrEqual(280);
  expect(structure.setup.height).toBeGreaterThanOrEqual(160);
  expect(structure.workspaceScrollWidth).toBeLessThanOrEqual(structure.workspaceClientWidth + 1);
  expect(structure.localScrollWidth).toBeLessThanOrEqual(structure.localClientWidth + 1);
  await assertCommandHeaderAssembly(page);
  const start = workspace.locator('.lobby-start');
  await expect(start).toBeInViewport({ ratio: 1 });

  const controls = [
    ['player count', workspace.locator('#lobby-hotseat-player-count')],
    ['player name', workspace.locator('.lobby-name').first()],
    ['color swatch', workspace.locator('.lobby-swatch').first()],
    ['controller', workspace.locator('.lobby-control').first()],
    ['garage', workspace.locator('.lobby-garage__open').first()],
    ['rounds', workspace.locator('input[aria-label="Rounds"]')],
    ['wind', workspace.locator('input[aria-label="Wind"]')],
    ['walls', workspace.locator('#lobby-hotseat-direct-walls')],
    ['advanced settings', workspace.locator('.lobby-advanced-trigger')],
  ] as const;
  for (const [label, control] of controls) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  }

  const interactives = workspace.locator(
    'button, input, select, textarea, summary, a[href]',
  );
  const interactiveCount = await interactives.count();
  for (let index = 0; index < interactiveCount; index += 1) {
    const control = interactives.nth(index);
    if (!(await control.isVisible())) continue;
    await control.scrollIntoViewIfNeeded();
    const containment = await control.evaluate((element) => {
      const workspace = element.closest<HTMLElement>('.multiplayer-command__local-workspace');
      if (!workspace) throw new Error('Interactive control lost its Local workspace owner');
      const controlBox = element.getBoundingClientRect();
      const workspaceBox = workspace.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName,
        control: {
          left: controlBox.left,
          right: controlBox.right,
          top: controlBox.top,
          bottom: controlBox.bottom,
        },
        workspace: {
          left: workspaceBox.left,
          right: workspaceBox.right,
          top: workspaceBox.top,
          bottom: workspaceBox.bottom,
        },
      };
    });
    expect(containment.control.left, `${containment.label} left containment`)
      .toBeGreaterThanOrEqual(containment.workspace.left - 1);
    expect(containment.control.right, `${containment.label} right containment`)
      .toBeLessThanOrEqual(containment.workspace.right + 1);
    expect(containment.control.top, `${containment.label} top containment`)
      .toBeGreaterThanOrEqual(containment.workspace.top - 1);
    expect(containment.control.bottom, `${containment.label} bottom containment`)
      .toBeLessThanOrEqual(containment.workspace.bottom + 1);
  }

  await expect(start).toBeVisible();
  const startBox = await start.boundingBox();
  expect(startBox).not.toBeNull();
  expect(startBox!.width).toBeGreaterThanOrEqual(220);
  expect(startBox!.height).toBeGreaterThanOrEqual(56);

  const previewComposition = await workspace.locator('.lobby-preview').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const partLabels = [...element.querySelectorAll<HTMLElement>(
      '.lobby-preview__part span, .lobby-preview__part strong',
    )].map((label) => ({
      text: label.textContent,
      clientWidth: label.clientWidth,
      scrollWidth: label.scrollWidth,
      bounds: label.getBoundingClientRect().toJSON(),
    }));
    const convoy = element.querySelector<HTMLElement>('.lobby-preview__convoy');
    const parts = element.querySelector<HTMLElement>('.lobby-preview__parts');
    return {
      bounds: bounds.toJSON(),
      partLabels,
      convoyDisplay: convoy ? getComputedStyle(convoy).display : 'none',
      convoy: convoy?.getBoundingClientRect().toJSON() ?? null,
      parts: parts?.getBoundingClientRect().toJSON() ?? null,
    };
  });
  expect(previewComposition.bounds.height).toBeLessThanOrEqual(421);
  for (const label of previewComposition.partLabels) {
    expect(label.scrollWidth, `${label.text} must fit its selected-kit cell`)
      .toBeLessThanOrEqual(label.clientWidth + 1);
    expect(label.bounds.left).toBeGreaterThanOrEqual(previewComposition.bounds.left - 1);
    expect(label.bounds.right).toBeLessThanOrEqual(previewComposition.bounds.right + 1);
  }
  if (previewComposition.convoyDisplay !== 'none'
    && previewComposition.convoy && previewComposition.parts) {
    expect(previewComposition.parts.bottom, 'Selected-kit facts must not collide with crew thumbnails')
      .toBeLessThanOrEqual(previewComposition.convoy.top + 1);
  }
  await assertLobbyFrame(page);
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
    await openFirstSalvoWorkspace(page);
    const workspace = page.locator('[data-skirmish-command-view]');
    const firstSalvo = workspace.getByRole('button', { name: 'Start First Salvo', exact: true });
    const operations = page.locator('.command-center__library-items button[data-command-item]');

    await expect(page.locator('.command-center__category-rail [data-command-category="skirmishes"]'))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(
      '.command-center__library-items button[data-command-item="first-salvo"]',
    ))
      .toHaveAttribute('aria-current', 'true');
    await expect(firstSalvo).toHaveAttribute('data-command-primary', '');
    await expect(workspace.locator('[data-command-primary]')).toHaveCount(1);
    await expect(operations).toHaveCount(6);
    await expect(page.locator('#lobby .lobby-start')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-online-primary')).toHaveCount(0);
    await expect(page.locator('#lobby .lobby-preview')).toHaveCount(0);
    await assertLobbyFrame(page);
  });

  test('makes First Salvo the one dominant, touch-sized skirmish action', async ({ page }) => {
    await openFirstSalvoWorkspace(page);
    const workspace = page.locator('[data-skirmish-command-view]');
    const firstSalvo = workspace.getByRole('button', { name: 'Start First Salvo', exact: true });
    const operations = page.locator('.command-center__library-items button[data-command-item]');
    const standard = page.locator(
      '.command-center__library-items button[data-command-item="standard"]',
    );

    const metrics = await page.locator('#lobby .command-center').evaluate((element) => {
      const firstSalvo = element.querySelector<HTMLElement>('[data-command-primary]');
      const secondary = element.querySelector<HTMLElement>(
        '.command-center__library-items button[data-command-item="standard"]',
      );
      if (!firstSalvo || !secondary) throw new Error('Expected Skirmish command actions');
      return {
        firstSalvoHeight: firstSalvo.getBoundingClientRect().height,
        firstSalvoFont: Number.parseFloat(getComputedStyle(firstSalvo).fontSize),
        firstSalvoBackground: getComputedStyle(firstSalvo).background,
        secondaryHeight: secondary.getBoundingClientRect().height,
        secondaryBackground: getComputedStyle(secondary).backgroundColor,
        primaryCount: element.querySelectorAll('[data-command-primary]').length,
      };
    });

    expect(metrics.primaryCount).toBe(1);
    expect(metrics.secondaryHeight).toBeGreaterThanOrEqual(44);
    expect(metrics.firstSalvoHeight).toBeGreaterThanOrEqual(56);
    expect(metrics.firstSalvoFont).toBeGreaterThanOrEqual(14);
    expect(metrics.firstSalvoBackground).not.toBe(metrics.secondaryBackground);
    for (const choice of [firstSalvo, standard]) {
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
    await page.setViewportSize({ width: 390, height: 844 });
    await installLiveRejoinFixture(page);

    const deployment = page.locator('#lobby .lobby-deployment');
    const rejoin = page.getByRole('button', { name: 'Rejoin your game', exact: true });
    const online = page.locator(
      '.command-center__library-items button[data-command-item="online"]',
    );
    await expect(rejoin).toBeVisible();
    await expect(rejoin).toBeInViewport({ ratio: 1 });
    const rejoinBox = await rejoin.boundingBox();
    expect(rejoinBox, 'Rejoin action must render').not.toBeNull();
    expect(rejoinBox!.height, 'Rejoin action must remain a deliberate control, not a stretched panel')
      .toBeLessThanOrEqual(96);
    expect(rejoinBox!.height, 'Rejoin action must retain a reasonable button proportion')
      .toBeLessThanOrEqual(rejoinBox!.width * 0.6);
    await rejoin.focus();
    await page.evaluate(() => Promise.resolve());
    await expect(rejoin).toBeFocused();
    await expect(online).toHaveAttribute('aria-current', 'true');
    await assertGoldSafeAction(
      page,
      '[data-multiplayer-command-view="online"] .lobby-btn.primary',
    );
    const containment = await online.evaluate((item) => {
      const library = item.closest<HTMLElement>('.command-center__library-items');
      if (!library) throw new Error('Online item lost its library');
      const itemBox = item.getBoundingClientRect();
      const libraryBox = library.getBoundingClientRect();
      return { item: itemBox.toJSON(), library: libraryBox.toJSON() };
    });
    expect(containment.item.left).toBeGreaterThanOrEqual(containment.library.left - 1);
    expect(containment.item.right).toBeLessThanOrEqual(containment.library.right + 1);

    const hierarchy = await deployment.evaluate((element) => {
      const rejoin = element.querySelector<HTMLElement>(
        '[data-multiplayer-command-view="online"] .lobby-btn.primary',
      );
      if (!rejoin) throw new Error('Expected selected Online rejoin action');
      const rejoinStyle = getComputedStyle(rejoin);
      return {
        primaryCount: element.querySelectorAll('.lobby-btn.primary').length,
        rejoinPrimary: rejoin.classList.contains('primary'),
        rejoinHeight: rejoin.getBoundingClientRect().height,
        rejoinFont: Number.parseFloat(rejoinStyle.fontSize),
      };
    });

    expect.soft(hierarchy.primaryCount, 'rejoin state must expose exactly one primary action').toBe(1);
    expect.soft(hierarchy.rejoinPrimary, 'Rejoin must own the primary treatment').toBe(true);
    expect.soft(hierarchy.rejoinHeight, 'Rejoin must retain a 44px physical target')
      .toBeGreaterThanOrEqual(44);
    expect.soft(hierarchy.rejoinFont, 'Rejoin copy remains legible')
      .toBeGreaterThanOrEqual(14);
    await assertLobbyControlReachable(
      page,
      '#lobby [data-multiplayer-command-view="online"] .lobby-btn.primary',
    );
    await assertLobbyFrame(page);
  });

  test('mounts Local preparation directly as the selected Multiplayer workspace', async ({ page }) => {
    await openLocal(page);

    const workspace = page.locator('[data-multiplayer-command-view="local-battle"]');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('tablist', { name: 'Hot Seat modes', exact: true }))
      .toHaveCount(0);
    await expect(workspace.locator('[data-operation-lane="practice"]')).toHaveCount(0);
    await expect(workspace.locator('.lobby-verified-deployment, .lobby-verified-challenge'))
      .toHaveCount(0);
    await expect(page.locator('#lobby .lobby-name')).toHaveCount(2);
    await expect(page.locator('#lobby .lobby-start')).toBeVisible();
    await expect(page.locator('#lobby .lobby-preview')).toBeVisible();
    await expect(page.locator(
      '.command-center__library-items button[data-command-item="local-battle"]',
    )).toHaveAttribute('aria-current', 'true');
    await assertLobbyControlReachable(page, '#lobby .lobby-start');
    await assertLobbyFrame(page);
  });

  test('keeps the Local workspace and its controls intact at the project viewport', async ({ page }) => {
    await openLocal(page);
    await assertLocalWorkspaceGeometry(page);
  });

  test('keeps the Local workspace and its controls intact at 1440 by 900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLobby(page);
    await openLocal(page);
    await assertLocalWorkspaceGeometry(page);
  });

  test('keeps the Local workspace and its controls intact in portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLobby(page);
    await openLocal(page);
    await assertLocalWorkspaceGeometry(page);
  });

  test('keeps Online preparation reachable and contained in portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLobby(page);
    await openOnline(page);
    await assertOnlineWorkspaceGeometry(page);
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

    await expect(page.getByRole('heading', { name: 'Open operation', exact: true })).toBeVisible();
    await expect(page.locator('#lobby .lobby-online-primary')).toBeVisible();
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="join-code"]');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="browse"]');

    await page.locator('[data-online-route="join-code"]').click();
    await expect(page.getByRole('heading', { name: 'Rally to a signal' })).toBeVisible();
    await openLocal(page);
    await openOnline(page);
    await expect(page.getByRole('heading', { name: 'Rally to a signal' })).toBeVisible();
    await assertLobbyFrame(page);
  });

  test('keeps the selected preparation hierarchy legible and contained at compact sizes', async ({
    page,
  }, testInfo) => {
    test.skip(!(await isCompact(page)), 'The compact guard applies below the fixed-stage threshold.');

    for (const route of ['Local Battle', 'Online'] as const) {
      if (route === 'Local Battle') {
        await openLocal(page);
        await assertLocalWorkspaceGeometry(page);
        continue;
      }
      await openOnline(page);
      const metrics = await page.locator('#lobby .command-center').evaluate((commandCenter) => {
        const context = commandCenter.querySelector<HTMLElement>('.lobby-route-brief__title');
        const selected = commandCenter.querySelector<HTMLElement>(
          '.command-center__item[data-command-item="online"][aria-current="true"]',
        );
        const preview = commandCenter.querySelector<HTMLElement>('.lobby-preview');
        if (!context || !selected || !preview) throw new Error('Expected Online command hierarchy');
        return {
          headingFont: Number.parseFloat(getComputedStyle(context).fontSize),
          selectedHeight: selected.getBoundingClientRect().height,
          previewVisible: getComputedStyle(preview).visibility !== 'hidden',
        };
      });
      expect(metrics.headingFont).toBeGreaterThanOrEqual(12);
      expect(metrics.selectedHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.previewVisible).toBe(true);
      await assertLobbyFrame(page);
    }
  });
});
