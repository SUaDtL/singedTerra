import { expect, test, type Page } from '@playwright/test';
import {
  assertCommandHeaderAssembly,
  assertDangerAction,
  assertGoldSafeAction,
  assertLobbyFrame,
  assertPreparationFrameGeometry,
  enterBattleIfBriefed,
  openLocalPreparation,
  openOnlinePreparation,
  openVerifiedOperations,
  selectCommandWorkspace,
} from './support';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const NEXT_SESSION_ID = '223e4567-e89b-42d3-a456-426614174000';

function verifiedDescriptor(
  expiresAt = '2099-12-31T23:59:59.000Z',
  sessionId = SESSION_ID,
  seed = 17,
) {
  return {
    sessionId,
    expiresAt,
    contractVersion: 2,
    engineVersion: 2,
    rulesetVersion: 4,
    limits: {
      humanSalvos: 6,
      cpuSalvos: 6,
      angle: { min: 0, max: 180 },
      power: { min: 0, max: 100 },
    },
    config: {
      seed,
      options: {
        maxPlayers: 2,
        maxWind: 6,
        gravity: 0.15,
        walls: 'open',
        hazards: 'none',
        rounds: 1,
        interestRate: 0,
        suddenDeathTurn: 0,
        armsLevel: 0,
        starterWeaponFalloff: 'decisive',
        teamMode: false,
        players: [
          { name: 'Ranger', color: '#e8554d' },
          { name: 'CPU 1', color: '#3f78b8', ai: 'hard' },
        ],
      },
    },
  };
}

function verifiedStart(resumed = false, expiresAt?: string) {
  return { ...verifiedDescriptor(expiresAt), resumed };
}

async function installAuthenticatedFixture(page: Page): Promise<void> {
  await page.addInitScript((authStorageKey: string | null) => {
    // These journeys exercise verified sessions after onboarding. Persist the
    // public Skip preference before launch; a slow first frame must not race
    // the optional briefing against the Match ledger interaction.
    window.localStorage.setItem('singedterra:first-salvo:v1', 'v1:skipped');
    window.localStorage.setItem(authStorageKey ?? `sb-${window.location.hostname.split('.')[0]}-auth-token`, JSON.stringify({
      access_token: ['e2e', 'public', 'session', 'token'].join('-'),
      refresh_token: ['e2e', 'public', 'refresh', 'token'].join('-'),
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
  }, process.env['E2E_AUTH_STORAGE_KEY'] ?? null);
  await page.route('**/rest/v1/profiles**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'e2e-commander', display_name: 'Ranger' }),
  }));
  await page.route('**/functions/v1/account_summary', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      matchesPlayed: 0,
      wins: 0,
      progressionVersion: 1,
      totalXp: 0,
      level: 1,
      levelXp: 0,
      nextLevelXp: 500,
      verifiedProgression: {
        evidence: 'verified_replay_v2',
        matchesPlayed: 0,
        wins: 0,
        progressionVersion: 1,
        totalXp: 0,
        level: 1,
        levelXp: 0,
        nextLevelXp: 500,
      },
    }),
  }));
}

async function openCommandCenter(page: Page, search = './'): Promise<void> {
  await page.goto(search);
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player account', exact: true }))
    .toContainText('Ranger');
}

async function openLocalWorkspace(page: Page, search = './'): Promise<void> {
  await openCommandCenter(page, search);
  await openLocalPreparation(page);
}

async function openCrosswindWorkspace(page: Page, search = './'): Promise<void> {
  await openCommandCenter(page, search);
  await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
}

async function openVerifiedWorkspace(page: Page, search = './'): Promise<void> {
  await openCommandCenter(page, search);
  await openVerifiedOperations(page);
}

/** Verified mission state lives in the adaptive Match ledger on non-ultrawide layouts. */
async function openVerifiedLedger(page: Page) {
  await enterBattleIfBriefed(page);
  const toggle = page.getByRole('button', { name: 'Open match ledger' });
  if (await toggle.isVisible()) await toggle.click();
  return page.locator('#hud .st-hud__verified-deployment');
}

function verifiedWorkspace(page: Page) {
  return page.locator('[data-multiplayer-command-view="verified-operations"]');
}

async function installOnlineCpuFixture(page: Page): Promise<void> {
  const players = [
    { id: 'verified-absence-human', name: 'Ranger', color: '#e84d4d', ready: false },
    { id: 'verified-absence-cpu', name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'easy' },
  ];
  const options = {
    maxPlayers: 2,
    maxWind: 6,
    gravity: 0.15,
    rulesetVersion: 4,
    commandProtocolVersion: 2,
    walls: 'open',
    rounds: 1,
    armsLevel: 0,
  };
  await page.route('**/functions/v1/create_room', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roomId: 'room-verified-absence',
      code: 'NONE',
      playerId: players[0]!.id,
      token: ['e2e', 'seat', 'verified-absence'].join('-'),
      options,
      players,
    }),
  }));
  await page.route('**/functions/v1/ready_up', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      started: true,
      players: players.map((player) => ({ ...player, ready: true })),
    }),
  }));
  await page.route('**/rest/v1/room_actions**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Content-Range': '0-0/0' },
    body: '[]',
  }));
}

test.describe('verified deployment production-browser journey', () => {
  test.beforeEach(async ({ page }) => installAuthenticatedFixture(page));

  test('keeps Local, Skirmish, and Verified command workspaces distinct while retaining crew state', async ({ page }, testInfo) => {
    await openLocalWorkspace(page);
    await page.screenshot({ path: testInfo.outputPath('hot-seat-mockup-entry.png') });
    await expect(page.getByRole('tablist', { name: 'Hot Seat modes', exact: true })).toHaveCount(0);
    const crew = page.locator('[data-multiplayer-command-view="local-battle"]');
    await expect(crew.locator('.lobby-name').first()).toBeVisible();
    const controlMetrics = await page.locator('.lobby-hotseat-body').evaluate((body) => {
      return [...body.querySelectorAll<HTMLElement>('.lobby-preparation-section__title, .lobby-name, .lobby-control, .lobby-field > label, .lobby-field > input, .lobby-field > select')].map((node) => ({
        label: node.getAttribute('aria-label') ?? node.id ?? node.className,
        kind: node.tagName, font: Number.parseFloat(getComputedStyle(node).fontSize),
        width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      }));
    });
    for (const control of controlMetrics) {
      expect.soft(control.font, `${control.label} text must remain readable`).toBeGreaterThanOrEqual(10.5);
      if (testInfo.project.name === 'pixel-touch' && ['INPUT', 'SELECT'].includes(control.kind)) {
        expect.soft(control.height, `${control.label} needs a full touch target`).toBeGreaterThanOrEqual(44);
        expect.soft(control.width, `${control.label} needs a full touch target`).toBeGreaterThanOrEqual(44);
      }
    }

    if (testInfo.project.name === 'desktop-fine') {
      await expect(page.getByRole('button', { name: 'Advanced settings', exact: true })).toBeInViewport({ ratio: 1 });
      await expect(crew.locator('.lobby-name').last()).toBeInViewport({ ratio: 1 });
    }
    await expect(page.locator('.lobby-verified-deployment')).toHaveCount(0);
    await expect(page.locator('[data-skirmish-command-view]')).toHaveCount(0);
    const deploy = page.getByRole('button', { name: 'Deploy local battle', exact: true });
    await expect(deploy).toBeInViewport({ ratio: 1 });
    const geometry = await page.locator('.lobby-hotseat-footer').evaluate((footer) => {
      const body = footer.closest<HTMLElement>('[data-preparation-frame]')!
        .querySelector<HTMLElement>(':scope > .preparation-frame__body')!;
      const card = footer.closest('.lobby-card')!;
      return { footer: footer.getBoundingClientRect().toJSON(), body: body.getBoundingClientRect().toJSON(),
        card: card.getBoundingClientRect().toJSON(), overflow: getComputedStyle(body).overflowY };
    });
    expect(geometry.body.bottom).toBeLessThanOrEqual(geometry.footer.top + 1);
    expect(geometry.body.height, 'Preparation must reserve usable space for its controls').toBeGreaterThanOrEqual(testInfo.project.name === 'pixel-touch' ? 88 : 160);
    expect(geometry.footer.bottom).toBeLessThanOrEqual(geometry.card.bottom + 1);
    expect(geometry.overflow).toMatch(/auto|scroll/);
    await page.screenshot({ path: testInfo.outputPath('hot-seat-mockup-local.png') });
    await crew.locator('.lobby-name').first().fill('Local Scout');
    await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
    await expect(page.locator('[data-skirmish-command-view]')).toContainText('Crosswind Range');
    await page.screenshot({ path: testInfo.outputPath('hot-seat-mockup-practice.png') });
    await openVerifiedOperations(page);
    await expect(page.getByRole('region', { name: 'Verified deployment', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('hot-seat-mockup-verified.png') });
    await openLocalPreparation(page);
    await expect(crew.locator('.lobby-name').first()).toHaveValue('Local Scout');
    await expect(deploy).toBeInViewport({ ratio: 1 });
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await deploy.tap();
    else { await deploy.focus(); await page.keyboard.press('Enter'); }
    await enterBattleIfBriefed(page);
    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('[data-console-owner="preact"]')).toContainText('Local Scout');
    await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
  });

  test('keeps authenticated Hot Seat preparation readable and scroll-reachable', async ({ page }, testInfo) => {
    await openVerifiedWorkspace(page);
    await expect(page.locator(
      '[data-multiplayer-command-view="verified-operations"] [data-battlefield-projection]',
    )).toBeVisible();
    await assertGoldSafeAction(
      page,
      '[data-multiplayer-command-view="verified-operations"] .lobby-btn.primary',
    );
    await page.screenshot({ path: testInfo.outputPath('authenticated-hot-seat.png') });
    const layout = await page.locator('.lobby-deployment').evaluate((deployment) => {
      const panel = deployment.querySelector<HTMLElement>('.preparation-frame__body')!;
      const workspaceViewport = deployment.querySelector<HTMLElement>(
        '.command-center__workspace-host',
      )!;
      const card = deployment.closest('.lobby-card')!;
      const matchup = panel.querySelector<HTMLElement>('.lobby-verified-deployment__matchup')!;
      const rules = panel.querySelector<HTMLElement>('.lobby-verified-deployment__rules')!;
      const actions = deployment.querySelector<HTMLElement>('.preparation-frame__dock')!;
      const box = (node: Element) => node.getBoundingClientRect().toJSON();
      return { panel: box(panel), viewport: box(workspaceViewport), card: box(card),
        matchup: box(matchup), actions: box(actions), rules: box(rules),
        matchupFont: Number.parseFloat(getComputedStyle(matchup).fontSize),
        overflowY: getComputedStyle(panel).overflowY,
        viewportOverflowY: getComputedStyle(workspaceViewport).overflowY,
        ruleItems: [...rules.children].map((item) => ({ text: item.textContent,
          font: Number.parseFloat(getComputedStyle(item).fontSize),
          width: item.clientWidth, scroll: item.scrollWidth, lines: item.getBoundingClientRect().height
            / Number.parseFloat(getComputedStyle(item).lineHeight) })) };
    });
    expect.soft(layout.viewport.bottom, 'Command workspace viewport must end inside the lobby frame')
      .toBeLessThanOrEqual(layout.card.bottom + 1);
    expect.soft(`${layout.viewportOverflowY} ${layout.overflowY}`,
      'Long verified content must have a usable shell or owned scroll lane').toMatch(/auto|scroll/);
    expect.soft(layout.panel.left).toBeGreaterThanOrEqual(layout.viewport.left - 1);
    expect.soft(layout.panel.right).toBeLessThanOrEqual(layout.viewport.right + 1);
    expect.soft(layout.matchupFont, 'Matchup must remain readable').toBeGreaterThanOrEqual(10.5);
    expect.soft(layout.matchup.left).toBeGreaterThanOrEqual(layout.panel.left - 1);
    expect.soft(layout.matchup.right).toBeLessThanOrEqual(layout.panel.right + 1);
    for (const item of layout.ruleItems) {
      expect.soft(item.font, `${item.text} must remain readable`).toBeGreaterThanOrEqual(10.5);
      expect.soft(item.scroll, `${item.text} must not overflow its column`).toBeLessThanOrEqual(item.width + 1);
      expect.soft(item.lines, `${item.text} must not collapse into a narrow text column`).toBeLessThanOrEqual(3.1);
    }
    const launch = page.getByRole('button', { name: 'Start verified deployment', exact: true });
    await launch.scrollIntoViewIfNeeded();
    const launchBox = await launch.boundingBox();
    expect(launchBox).not.toBeNull();
    expect(launchBox!.height).toBeGreaterThanOrEqual(
      page.viewportSize()!.height <= 320 ? 46 : 56,
    );
    for (const state of ['resting', 'hovered', 'focused'] as const) {
      if (state === 'hovered') await launch.hover();
      if (state === 'focused') await launch.focus();
      const contrast = await launch.evaluate((node) => {
        const style = getComputedStyle(node);
        const color = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const luminance = (rgb: number[]) => rgb.map(channel => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
        const text = luminance(color(style.color));
        const backgrounds = style.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [style.backgroundColor];
        return Math.min(...backgrounds.map(value => {
          const background = luminance(color(value));
          return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
        }));
      });
      expect(contrast, `${state} launch text must contrast with every gradient stop`).toBeGreaterThanOrEqual(4.5);
    }
    await launch.focus();
    await expect(launch).toBeInViewport({ ratio: 1 });
    await page.getByRole('tab', { name: 'Deployment orders', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    await expect(page.locator('[data-skirmish-command-view] :focus')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('authenticated-hot-seat-focused.png') });
  });

  test('T39 Verified uses the shared frame with bounded peer battlefield context', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'large-display composition owner');
    for (const viewport of [
      { width: 2272, height: 1170 },
      { width: 3440, height: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await openVerifiedWorkspace(page);
      await assertPreparationFrameGeometry(
        page,
        '[data-multiplayer-command-view="verified-operations"]',
      );
      const geometry = await verifiedWorkspace(page).evaluate((root) => {
        const art = root.querySelector<HTMLElement>('[data-battlefield-projection]')!;
        const orders = root.querySelector<HTMLElement>('.preparation-frame__mode-content')!;
        const artBox = art.getBoundingClientRect();
        const ordersBox = orders.getBoundingClientRect();
        const overlapWidth = Math.max(0, Math.min(artBox.right, ordersBox.right) - Math.max(artBox.left, ordersBox.left));
        const overlapHeight = Math.max(0, Math.min(artBox.bottom, ordersBox.bottom) - Math.max(artBox.top, ordersBox.top));
        return {
          artWidth: artBox.width,
          artHeight: artBox.height,
          ordersWidth: ordersBox.width,
          overlapRatio: (overlapWidth * overlapHeight) / (ordersBox.width * ordersBox.height),
        };
      });
      expect(geometry.artHeight, `${viewport.width} battlefield context must stay bounded`)
        .toBeLessThanOrEqual(462);
      expect(geometry.artWidth / geometry.artHeight, `${viewport.width} battlefield context aspect`)
        .toBeGreaterThanOrEqual(1.2);
      expect(geometry.ordersWidth, `${viewport.width} orders need useful peer width`)
        .toBeGreaterThanOrEqual(420);
      expect(geometry.overlapRatio, `${viewport.width} orders must not float over wallpaper`)
        .toBeLessThanOrEqual(0.05);
    }
  });

  test('scrolls authenticated Hot Seat customization and starts the edited local crew', async ({ page }, testInfo) => {
    await openLocalWorkspace(page);
    await page.getByLabel('Players', { exact: true }).selectOption('4');
    await page.locator('.lobby-name').first().fill('Local Scout');
    const panel = page.locator('[data-multiplayer-command-view="local-battle"] .preparation-frame__body');
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    const touch = coarse ? await page.context().newCDPSession(page) : null;
    let gestures = 0;
    const beforeScroll = await panel.evaluate((element) => element.scrollTop);
    const footerBefore = await page.locator('.lobby-hotseat-footer').boundingBox();
    async function waitForScrollRest(): Promise<void> {
      let previous = Number.NaN;
      let stable = 0;
      // The native gesture must finish before the next independent action.
      await expect.poll(async () => {
        const current = await panel.evaluate(element => element.scrollTop);
        stable = Math.abs(current - previous) < 0.1 ? stable + 1 : 0;
        previous = current;
        return stable;
      }, { timeout: 5_000, intervals: [50, 50, 100] }).toBeGreaterThanOrEqual(3);
    }
    async function reach(selector: string): Promise<void> {
      const control = page.locator(selector).first();
      for (let step = 0; step < 20; step += 1) {
        const box = await control.boundingBox();
        const lane = await panel.boundingBox();
        const viewport = page.viewportSize()!;
        if (box && lane && box.y >= Math.max(0, lane.y) - 1 && box.y + box.height <= Math.min(viewport.height, lane.y + lane.height) + 1) {
          await waitForScrollRest();
          const settled = await control.boundingBox();
          if (settled && settled.y >= Math.max(0, lane.y) - 1 && settled.y + settled.height <= Math.min(viewport.height, lane.y + lane.height) + 1) return;
          continue;
        }
        if (!lane) throw new Error('Hot Seat has no scroll lane');
        // Start the native drag in the shared body's own left inset. Beginning
        // over a compact form control correctly gives that control gesture
        // ownership and does not prove that the surrounding scroll lane pans.
        const x = lane.x + 4;
        const visibleHeight = Math.min(viewport.height, lane.y + lane.height) - Math.max(0, lane.y);
        const direction = box && box.y < lane.y ? -1 : 1;
        const distance = Math.min(120, visibleHeight * 0.5);
        const y = Math.max(0, lane.y) + visibleHeight * (direction > 0 ? 0.8 : 0.2);
        if (touch) {
          gestures += 1;
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
          for (let frame = 1; frame <= 5; frame += 1) {
            await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - direction * distance * frame / 5, id: 1 }] });
            await page.waitForTimeout(16);
          }
          // End a deliberate drag with the finger held still, rather than fling.
          await page.waitForTimeout(80);
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else { await page.mouse.move(x, y); await page.mouse.wheel(0, direction * distance); }
        await page.waitForTimeout(50);
        await expect(page.locator('.lobby-garage.editing'), 'Scrolling crew must not open tank customization').toHaveCount(0);
        await expect(page.locator('.lobby-start')).not.toHaveAttribute('inert', '');
      }
      await page.screenshot({ path: testInfo.outputPath('authenticated-local-scroll-failure.png') });
      const diagnostic = await panel.evaluate((element) => ({ box: element.getBoundingClientRect().toJSON(),
        scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
        ancestors: [element, element.parentElement!, element.closest('.lobby-card')!, document.querySelector('#app')!, document.body]
          .map((node) => ({ className: node.className, touchAction: getComputedStyle(node).touchAction })) }));
      throw new Error(`Cannot scroll to ${selector}: ${JSON.stringify({ diagnostic, target: await control.boundingBox() })}`);
    }
    await reach('.lobby-row:last-child .lobby-name');
    await reach('.lobby-advanced-trigger');
    if (gestures > 0) expect(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeScroll);
    const footerAfter = await page.locator('.lobby-hotseat-footer').boundingBox();
    expect(footerAfter!.y).toBeCloseTo(footerBefore!.y, 0);
    expect(footerAfter!.height).toBeCloseTo(footerBefore!.height, 0);
    await reach('.lobby-row:last-child .lobby-name');
    const fourthName = page.locator('.lobby-name').nth(3);
    if (coarse) {
      await expect(fourthName).not.toBeFocused();
      await fourthName.tap();
      await expect(fourthName).toBeFocused();
    }
    await fourthName.fill('Fourth Crew');
    await waitForScrollRest();
    await expect(page.locator('.lobby-start')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.lobby-name').nth(3)).toHaveValue('Fourth Crew');
    await page.screenshot({ path: testInfo.outputPath('authenticated-local-deploy.png') });
    if (coarse) await page.locator('.lobby-start').tap(); else {
      await page.locator('.lobby-start').focus();
      await page.keyboard.press('Enter');
    }
    await enterBattleIfBriefed(page);
    await page.screenshot({ path: testInfo.outputPath('authenticated-local-after-deploy.png') });
    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('[data-console-owner="preact"]')).toContainText('Local Scout');
    await expect(page.getByRole('button', { name: 'Fire Baby Missile', exact: true })).toBeEnabled();
    const ledger = page.getByRole('button', { name: 'Open match ledger', exact: true });
    if (await ledger.isVisible()) await ledger.click();
    await expect(page.locator('#hud .st-hud__player-row')).toHaveCount(4);
    await expect(page.locator('#hud [data-roster-field="name"]').filter({ hasText: 'Fourth Crew' })).toBeVisible();
    await touch?.detach();
  });

  test('separates Skirmish and Verified preparation into contained command items', async ({ page }) => {
    await openVerifiedWorkspace(page);
    const verifiedPanel = verifiedWorkspace(page);
    await expect(verifiedPanel).toBeVisible();
    await expect(verifiedPanel).toContainText('First Strike');
    await selectCommandWorkspace(page, 'Skirmishes', 'crosswind-range');
    const board = page.locator('[data-skirmish-command-view]');
    await expect(board).toBeVisible();
    await expect(verifiedPanel).toHaveCount(0);
    const practiceLaunch = board.getByRole('button', { name: 'Start Crosswind Range' });
    const practiceTarget = await practiceLaunch.boundingBox();
    expect(practiceTarget, 'Practice launch needs a rendered touch target').not.toBeNull();
    expect(practiceTarget!.width).toBeGreaterThanOrEqual(44);
    expect(practiceTarget!.height).toBeGreaterThanOrEqual(
      page.viewportSize()!.height <= 320 ? 46 : 56,
    );
    await practiceLaunch.focus();
    await expect(practiceLaunch).toBeFocused();

    const metrics = await board.evaluate((node) => ({ client: node.clientWidth, scroll: node.scrollWidth }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
    await assertLobbyFrame(page);
  });

  test('launches the selected local practice operation from Commander Operations', async ({ page }) => {
    await openCrosswindWorkspace(page);
    const board = page.locator('[data-skirmish-command-view]');
    await expect(board).toContainText('Crosswind Range');
    await expect(board).toContainText('Wraparound walls turn shifting wind into a ranging test.');
    await board.getByRole('button', { name: 'Start Crosswind Range' }).click();

    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('[data-ui="quick-operation"]'))
      .toHaveText(/Crosswind Range.*Wraparound walls turn shifting wind into a ranging test\./);
  });

  test('contains fixed rules, loading, and the verified HUD at every input profile', async ({ page }) => {
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => { releaseStart = resolve; });
    await page.route('**/functions/v1/start_verified_deployment', async (route) => {
      await startGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(verifiedStart()),
      });
    });

    await openVerifiedWorkspace(page);
    const verified = verifiedWorkspace(page);
    await expect(verified.getByText('Baby Missile only')).toBeVisible();
    await expect(verified.getByText('6 human / 6 CPU salvos maximum')).toBeVisible();
    await expect(verified.getByText('Fixed battlefield rules')).toBeVisible();
    await expect(verified.getByText('30-minute deadline')).toBeVisible();
    const commanderOperations = verifiedWorkspace(page);
    await expect(commanderOperations.getByRole('heading', { name: 'Commander dossier', exact: true })).toBeVisible();
    await expect(commanderOperations.getByText('First Strike · Damage the CPU within your first three salvos.')).toBeVisible();
    const launchComposition = await verified.evaluate((node) => {
      const rules = node.querySelector<HTMLElement>('.lobby-verified-deployment__rules');
      const actions = node.querySelector<HTMLElement>('.preparation-frame__dock');
      if (!rules || !actions) throw new Error('Missing verified launch composition');
      return {
        rules: rules.getBoundingClientRect().toJSON(),
        scroll: node.querySelector('.preparation-frame__body')!.getBoundingClientRect().toJSON(),
        actions: actions.getBoundingClientRect().toJSON(),
      };
    });
    const launchIsBesideRules = launchComposition.actions.left >= launchComposition.rules.right - 1;
    const launchIsBelowRules = launchComposition.actions.top >= launchComposition.scroll.bottom - 1;
    expect(launchIsBesideRules || launchIsBelowRules).toBe(true);
    await assertCommandHeaderAssembly(page);
    await assertLobbyFrame(page);

    const launch = verified.getByRole('button', { name: 'Start verified deployment' });
    await launch.click();
    await expect(verified.getByRole('button', { name: 'Verified deployment busy' })).toBeDisabled();
    await assertLobbyFrame(page);
    releaseStart();
    await expect(page.locator('#lobby')).toBeHidden();
    const hud = await openVerifiedLedger(page);
    await expect(hud).toBeVisible();
    await expect(hud.getByText('Salvos · You 0 / 6 · CPU 0 / 6')).toBeVisible();
    await expect(hud.getByText('Deployment active')).toBeVisible();
    await expect(hud.getByText(
      /First Strike.*Damage the CPU within your first three salvos\..*3 salvos remaining/,
    )).toBeVisible();
    await expect(page.locator('#lobby')).toBeHidden();
    await expect(page.locator('[data-battle-console-semantic-tree]')).toBeVisible();

    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    expect(geometry.documentHeight).toBe(geometry.viewportHeight);
  });

  test('returns a live deployment to the Battery and abandons it only after confirmation', async ({ page }) => {
    let abandonBody: unknown = null;
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart()),
    }));
    await page.route('**/functions/v1/abandon_verified_deployment', async (route) => {
      abandonBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, sessionId: SESSION_ID, status: 'abandoned' }),
      });
    });

    await openVerifiedWorkspace(page);
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    await expect(page.locator('[data-battle-console-semantic-tree]')).toBeVisible();
    await enterBattleIfBriefed(page);
    await page.getByRole('button', { name: 'Open match ledger', exact: true }).click();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Command Menu' });
    await menu.getByRole('button', { name: 'Return to Lobby' }).click();
    await expect(page.locator('#lobby')).toBeVisible();

    const verified = verifiedWorkspace(page);
    await expect(verified.getByRole('button', { name: 'Resume verified deployment' })).toBeVisible();
    await expect(verified.getByText('Recovered 0 of 6 human salvos.')).toBeVisible();
    await verified.getByRole('button', { name: 'Abandon verified deployment' }).click();
    const confirmation = verified.locator('.lobby-verified-deployment__confirm');
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText('Abandon this recoverable deployment')).toBeVisible();
    expect(abandonBody).toBeNull();
    await confirmation.getByRole('button', { name: 'Keep deployment' }).click();
    await expect(confirmation).toBeHidden();
    expect(abandonBody).toBeNull();

    await verified.getByRole('button', { name: 'Abandon verified deployment' }).click();
    await expect(confirmation).toBeVisible();
    const confirmAbandon = confirmation.getByRole('button', { name: 'Confirm abandon' });
    await assertDangerAction(
      page,
      '#lobby .lobby-verified-deployment__confirm:not([hidden]) '
        + '.lobby-verified-deployment__confirm-abandon',
    );
    await confirmAbandon.click();
    await expect.poll(() => abandonBody).toEqual({ sessionId: SESSION_ID });
    await expect(verifiedWorkspace(page)
      .getByRole('button', { name: 'Start verified deployment' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('singedterra:verified-deployment'))).toBeNull();
    await assertLobbyFrame(page);
  });

  test('recovers the exact persisted transcript after a browser refresh', async ({ page }) => {
    const descriptor = verifiedDescriptor();
    await page.addInitScript(({ stored }) => {
      localStorage.setItem('singedterra:verified-deployment', JSON.stringify(stored));
    }, {
      stored: {
        storageVersion: 2,
        deployments: [{
          descriptor,
          transcript: [{ angle: 0, power: 5 }],
          terminal: false,
        }],
      },
    });
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart(true)),
    }));

    await openVerifiedWorkspace(page, '?e2e=verified-lifecycle');
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    const hud = await openVerifiedLedger(page);
    await expect(hud.getByText('Salvos · You 1 / 6 · CPU 1 / 6')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(
      localStorage.getItem('singedterra:verified-deployment') ?? 'null',
    )?.deployments?.[0]?.transcript)).toEqual([{ angle: 0, power: 5 }]);
  });

  test('warns at both thresholds, freezes expired input, and exposes both expiry choices', async ({ page }, testInfo) => {
    const initialNow = Date.parse('2026-08-12T12:00:00.000Z');
    const expiresAt = new Date(initialNow + 30 * 60_000).toISOString();
    await page.addInitScript((start) => {
      let now = start;
      Date.now = () => now;
      (window as typeof window & { __setVerifiedNow?: (value: number) => void })
        .__setVerifiedNow = (value) => { now = value; };
    }, initialNow);
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart(false, expiresAt)),
    }));

    await openVerifiedWorkspace(page, '?e2e=verified-lifecycle');
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    const hud = await openVerifiedLedger(page);
    const setNow = (value: number) => page.evaluate((next) => {
      const setter = (window as typeof window & { __setVerifiedNow?: (time: number) => void })
        .__setVerifiedNow;
      if (!setter) throw new Error('Missing verified clock control');
      setter(next);
    }, value);

    await setNow(initialNow + 25 * 60_000);
    await expect(hud.getByText('Five minutes remain')).toBeVisible();
    await expect(hud.getByText('05:00 remaining')).toBeVisible();
    await setNow(initialNow + 29 * 60_000);
    await expect(hud.getByText('One minute remains')).toBeVisible();
    await expect(hud.getByText('01:00 remaining')).toBeVisible();

    const beforeFire = await page.evaluate(() => (
      window as typeof window & {
        __SINGED_TERRA_E2E__?: { forwardedActions: { fire: number } };
      }
    ).__SINGED_TERRA_E2E__?.forwardedActions.fire ?? 0);
    await setNow(initialNow + 31 * 60_000);
    const expiry = page.getByRole('dialog', { name: 'Verification expired' });
    const expiryPanel = expiry.locator('.st-hud__verified-expiry-panel');
    const casual = expiry.getByRole('button', { name: 'Continue casually' });
    const battery = expiry.getByRole('button', { name: 'Return to Battery' });
    await expect(expiry).toBeVisible();
    // The successor chassis retires the old briefing bitmap; retain the actual
    // expiry decision's readable, contained presentation across input profiles.
    const expiryFit = await expiryPanel.evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return bounds.left >= 0 && bounds.top >= 0
        && bounds.right <= innerWidth && bounds.bottom <= innerHeight
        && panel.scrollWidth <= panel.clientWidth + 1
        && [...panel.querySelectorAll('button')].every((button) => {
          const target = button.getBoundingClientRect();
          return target.left >= bounds.left && target.right <= bounds.right
            && target.top >= bounds.top && target.bottom <= bounds.bottom;
        });
    });
    expect(expiryFit, 'Expiry copy and both recovery choices must fit their panel').toBe(true);
    await expect(casual).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`verified-expiry-reference-lock-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.keyboard.press('Tab');
    await expect(battery).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(casual).toBeFocused();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(expiry).toBeVisible();
    const afterFire = await page.evaluate(() => (
      window as typeof window & {
        __SINGED_TERRA_E2E__?: { forwardedActions: { fire: number } };
      }
    ).__SINGED_TERRA_E2E__?.forwardedActions.fire ?? 0);
    expect(afterFire).toBe(beforeFire);

    await casual.click();
    await expect(expiry).toBeHidden();
    await expect(hud).toBeHidden();
    await expect(page.locator('#stage')).not.toHaveAttribute('inert', '');
  });

  test('contains a failed launch without raw backend disclosure', async ({ page }) => {
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'database exploded with private detail' }),
    }));
    await openVerifiedWorkspace(page);
    const verified = verifiedWorkspace(page);
    await verified.getByRole('button', { name: 'Start verified deployment' }).click();
    await expect(verified.getByRole('status')).toHaveText(
      'Verified deployment is unavailable. Try again.',
    );
    await expect(verified).not.toContainText('database exploded');
    await expect(verified.getByRole('button', { name: 'Start verified deployment' })).toBeEnabled();
    await assertLobbyFrame(page);
  });

  test('retries terminal evidence and renders only the server-confirmed verified promotion', async ({ page }) => {
    const transcript = Array.from({ length: 6 }, () => ({ angle: 0, power: 5 }));
    const prior = {
      evidence: 'verified_replay_v2',
      matchesPlayed: 10,
      wins: 8,
      progressionVersion: 1,
      totalXp: 1_800,
      level: 4,
      levelXp: 300,
      nextLevelXp: 500,
    } as const;
    const current = {
      evidence: 'verified_replay_v2',
      matchesPlayed: 11,
      wins: 9,
      progressionVersion: 1,
      totalXp: 2_000,
      level: 5,
      levelXp: 0,
      nextLevelXp: 500,
    } as const;
    let completionCalls = 0;
    let completionBody: unknown = null;
    let completionAccepted = false;

    await page.addInitScript(({ descriptor, storedTranscript }) => {
      localStorage.setItem('singedterra:verified-deployment', JSON.stringify({
        storageVersion: 2,
        deployments: [{
          descriptor,
          transcript: storedTranscript,
          terminal: true,
        }],
      }));
    }, { descriptor: verifiedDescriptor(), storedTranscript: transcript });
    await page.unroute('**/functions/v1/account_summary');
    await page.route('**/functions/v1/account_summary', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        matchesPlayed: completionAccepted ? current.matchesPlayed : prior.matchesPlayed,
        wins: completionAccepted ? current.wins : prior.wins,
        progressionVersion: 1,
        totalXp: completionAccepted ? current.totalXp : prior.totalXp,
        level: completionAccepted ? current.level : prior.level,
        levelXp: completionAccepted ? current.levelXp : prior.levelXp,
        nextLevelXp: 500,
        verifiedProgression: completionAccepted ? current : prior,
      }),
    }));
    await page.route('**/functions/v1/start_verified_deployment', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifiedStart(true)),
    }));
    await page.route('**/functions/v1/complete_verified_deployment', async (route) => {
      completionCalls += 1;
      completionBody = route.request().postDataJSON();
      if (completionCalls === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'temporary verification outage' }),
        });
        return;
      }
      completionAccepted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: { sessionId: SESSION_ID, won: true, outcome: 'win', verifiedXp: 200 },
          progression: {
            evidence: 'verified_replay_v2',
            prior: { matchesPlayed: 10, wins: 8, totalXp: 1_800 },
            current: { matchesPlayed: 11, wins: 9, totalXp: 2_000 },
          },
        }),
      });
    });

    await openVerifiedWorkspace(page, '?e2e=verified-lifecycle');
    await page.getByRole('button', { name: 'Start verified deployment' }).click();
    const firstReport = page.locator('.st-hud__overlay--victory');
    await expect(firstReport).toBeVisible({ timeout: 10_000 });
    await expect(firstReport.getByRole('heading', { name: 'Commander wins' })).toBeVisible();
    await expect(firstReport.locator('.st-hud__victory-field-order'))
      .toHaveText('Fire for Effect not achieved — CPU was damaged on 0 of 2 required human salvos.');
    await expect(firstReport.locator('.st-hud__victory-progression-receipt')).toBeHidden();
    await expect.poll(() => completionCalls).toBe(1);
    const terminalProjection = await page.evaluate(() => (
      window as typeof window & {
        __SINGED_TERRA_E2E_VERIFIED_TERMINAL__?: unknown;
      }
    ).__SINGED_TERRA_E2E_VERIFIED_TERMINAL__);
    expect(terminalProjection).toEqual({
      canonical: { phase: 'PLAYER_TURN', winner: null },
      presented: { phase: 'GAME_OVER', winner: 'p1' },
      result: {
        outcome: 'human_win', winnerId: 'p1', reason: 'health',
        humanSalvos: 6, cpuSalvos: 6, liveTicks: 632, cpuSimulationTicks: 24_155,
        transcript,
      },
    });
    const fire = page.locator('[data-battle-console-action="fire"]');
    await expect(fire).toBeDisabled();
    await expect(page.locator('[data-battle-console-action="fire"]:enabled')).toHaveCount(0);
    const retryVerification = page.getByRole('button', {
      name: 'Retry verification',
      exact: true,
    });
    await expect(retryVerification).toHaveCount(1);
    await expect(firstReport.getByRole('button', {
      name: 'Retry verification',
      exact: true,
    })).toHaveCount(1);
    await expect(firstReport.getByRole('button', { name: /fire/i })).toHaveCount(0);
    await firstReport.getByRole('button', { name: 'Main Menu' }).click();

    const verified = verifiedWorkspace(page);
    await expect(verified.getByText('Recovered terminal evidence. Resume to retry verification.'))
      .toBeVisible();
    await verified.getByRole('button', { name: 'Resume verified deployment' }).click();

    const acceptedReport = page.locator('.st-hud__overlay--victory');
    await expect(acceptedReport).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-battle-console-action="fire"]:enabled')).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: 'Retry verification',
      exact: true,
    })).toHaveCount(0);
    const receipt = acceptedReport.locator('.st-hud__victory-progression-receipt');
    await expect(receipt.locator('.st-hud__victory-progression-summary'))
      .toHaveText('Verified victory · +200 XP · Level 5 · 0 / 500 XP');
    await expect(receipt.locator('.st-hud__victory-promotion-kicker'))
      .toHaveText('Commander promoted');
    await expect(receipt.locator('.st-hud__victory-promotion-code')).toHaveText('R-04');
    await expect(receipt.locator('.st-hud__victory-promotion-title')).toHaveText('Artillerist');
    await expect(receipt.locator('.st-hud__victory-career-next'))
      .toHaveText('1,000 XP to R-05 Battery Captain at Level 7');
    expect(completionCalls).toBe(2);
    expect(completionBody).toEqual({ sessionId: SESSION_ID, transcript });
    expect(await page.evaluate(() => localStorage.getItem('singedterra:verified-deployment')))
      .toBeNull();
  });

  test('briefs, resolves, and rotates one verified Field Order through a fresh 0 / 6 deployment', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const transcript = Array.from({ length: 6 }, () => ({ angle: 0, power: 5 }));
    let matchesPlayed = 0;
    let startCalls = 0;

    await page.addInitScript(({ descriptor, storedTranscript }) => {
      localStorage.setItem('singedterra:verified-deployment', JSON.stringify({
        storageVersion: 2,
        deployments: [{ descriptor, transcript: storedTranscript, terminal: true }],
      }));
    }, { descriptor: verifiedDescriptor(), storedTranscript: transcript });
    await page.unroute('**/functions/v1/account_summary');
    await page.route('**/functions/v1/account_summary', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        matchesPlayed,
        wins: matchesPlayed,
        progressionVersion: 1,
        totalXp: matchesPlayed * 200,
        level: 1,
        levelXp: matchesPlayed * 200,
        nextLevelXp: 500,
        verifiedProgression: {
          evidence: 'verified_replay_v2',
          matchesPlayed,
          wins: matchesPlayed,
          progressionVersion: 1,
          totalXp: matchesPlayed * 200,
          level: 1,
          levelXp: matchesPlayed * 200,
          nextLevelXp: 500,
        },
      }),
    }));
    await page.route('**/functions/v1/start_verified_deployment', async (route) => {
      startCalls += 1;
      const descriptor = startCalls === 1
        ? { ...verifiedDescriptor(), resumed: true }
        : { ...verifiedDescriptor(undefined, NEXT_SESSION_ID, 42), resumed: false };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(descriptor),
      });
    });
    await page.route('**/functions/v1/complete_verified_deployment', async (route) => {
      matchesPlayed = 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: { sessionId: SESSION_ID, won: true, outcome: 'win', verifiedXp: 200 },
          progression: {
            evidence: 'verified_replay_v2',
            prior: { matchesPlayed: 0, wins: 0, totalXp: 0 },
            current: { matchesPlayed: 1, wins: 1, totalXp: 200 },
          },
        }),
      });
    });

    await openVerifiedWorkspace(page, '?e2e=verified-lifecycle');
    const verified = verifiedWorkspace(page);
    await expect(verifiedWorkspace(page).getByText(
      /First Strike.*Damage the CPU within your first three salvos\./,
    )).toBeVisible();

    await verified.getByRole('button', { name: 'Start verified deployment' }).click();
    const fieldOrderStatus = page.locator('[data-ui="field-order"]');
    await expect(fieldOrderStatus).toContainText('First Strike');
    const report = page.locator('.st-hud__overlay--victory');
    await expect(report).toBeVisible({ timeout: 10_000 });
    await expect(report.locator('.st-hud__victory-field-order'))
      .toHaveText(/First Strike not achieved.*CPU was not damaged in the first 3 salvos\./);
    const nextOrder = report.getByRole('button', { name: 'Brief next order', exact: true });
    await expect(nextOrder).toHaveCount(1);
    await expect(nextOrder).toBeFocused();

    await nextOrder.click();
    await expect(page.locator('#lobby')).toBeVisible();
    await expect(verified.getByRole('button', { name: 'Start verified deployment' })).toBeFocused();
    await expect(verifiedWorkspace(page).getByText(
      /Fire for Effect.*Damage the CPU on two separate human salvos\./,
    )).toBeVisible();
    // Reusable semantic nodes now remain in hidden, inert parking between games.
    // A completed Field Order must be absent from the active Match presentation.
    await expect(fieldOrderStatus).toBeHidden();
    await expect(page.locator('#hud [data-ui="field-order"]')).toHaveCount(0);

    await verified.getByRole('button', { name: 'Start verified deployment' }).click();
    const freshHud = await openVerifiedLedger(page);
    await expect(freshHud.getByText(/Salvos.*You 0 \/ 6.*CPU 0 \/ 6/)).toBeVisible();
    await expect(freshHud.getByText(
      /Fire for Effect.*Damage the CPU on two separate human salvos.*0 of 2 damaging salvos/,
    )).toBeVisible();
    expect(startCalls).toBe(2);
    expect(await page.evaluate(() => localStorage.getItem('singedterra:verified-deployment')))
      .toContain(NEXT_SESSION_ID);
  });

  test('keeps Field Orders absent from ordinary, Quick Duel, and network routes', async ({ page }) => {
    await page.goto('?e2e=hotseat');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await expect(page.locator('[data-battle-console-semantic-tree]')).toBeVisible();
    await expect(page.locator('[data-ui="field-order"]')).toHaveCount(0);

    await page.goto('?e2e=quick-duel-seed');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await selectCommandWorkspace(page, 'Skirmishes', 'standard');
    await page.getByRole('button', { name: 'Start Standard Duel', exact: true }).click();
    await expect(page.locator('[data-battle-console-semantic-tree]')).toBeVisible();
    await expect(page.locator('[data-ui="field-order"]')).toHaveCount(0);

    await installOnlineCpuFixture(page);
    await page.goto('./');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await openOnlinePreparation(page);
    await expect(page.getByRole('heading', { name: 'Open operation' })).toBeVisible();
    await page.locator('.lobby-field').filter({ hasText: 'CPU opponents' })
      .locator('select').first().selectOption('1');
    await page.getByRole('button', { name: 'Create operation', exact: true }).click();
    await page.getByRole('button', { name: 'Ready Up', exact: true }).click();
    await expect(page.locator('[data-battle-console-semantic-tree]')).toBeVisible();
    await expect(page.locator('[data-ui="field-order"]')).toHaveCount(0);
  });
});

test('keeps Field Orders absent from the anonymous local route', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());
  await openLocalPreparation(page);
  await expect(page.getByRole('region', { name: 'Verified deployment' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Deploy local battle', exact: true }).click();
  await expect(page.locator('[data-battle-console-semantic-tree]')).toBeVisible();
  await expect(page.locator('[data-ui="field-order"]')).toHaveCount(0);
});

test('Quick Duel publishes a bounded query-gated seed receipt on every redeployment', async ({ page }) => {
  const readSeed = async (): Promise<number> => {
    await page.goto('?e2e=quick-duel-seed');
    await page.evaluate(() => document.getElementById('st-splash')?.remove());
    await selectCommandWorkspace(page, 'Skirmishes', 'standard');
    await page.getByRole('button', { name: 'Start Standard Duel', exact: true }).click();
    await expect(page.locator('[data-battle-console-semantic-tree]')).toBeVisible();
    return page.evaluate(() => {
      const probe = (window as typeof window & { __singedTerraE2E?: { quickDuelSeed?: number } })
        .__singedTerraE2E;
      if (!probe || !Number.isInteger(probe.quickDuelSeed)) throw new Error('Missing Quick Duel seed receipt');
      return probe.quickDuelSeed!;
    });
  };

  const first = await readSeed();
  const second = await readSeed();
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThanOrEqual(0xffff_ffff);
  expect(second).toBeGreaterThanOrEqual(0);
  expect(second).toBeLessThanOrEqual(0xffff_ffff);
});

test('terminal impact owns a nonzero inert payoff beat before the report', async ({ page }) => {
  await page.goto('?e2e=victory-payoff');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  const report = page.locator('.st-hud__overlay--victory');
  const payoff = page.locator('.st-hud__terminal-payoff-status');
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & {
      __SINGED_TERRA_T8__?: { terminalExplosionCount?: number };
    }
  ).__SINGED_TERRA_T8__?.terminalExplosionCount ?? 0)).toBe(1);
  await expect(payoff).toHaveText('Terminal impact resolving. After action report incoming.');
  expect(await page.evaluate(() => ({
    reportHidden: document.querySelector('.st-hud__overlay--victory')
      ?.classList.contains('st-hud__overlay--hidden'),
    hudInert: document.getElementById('hud')?.inert,
    stageInert: document.getElementById('stage')?.inert,
  }))).toEqual({ reportHidden: true, hudInert: true, stageInert: true });
  await expect(report).toBeVisible();
  await expect(payoff).toHaveText('After action report ready.');
  const elapsed = await payoff.evaluate((node: HTMLElement) =>
    Number(node.dataset['payoffReadyAt']) - Number(node.dataset['impactCompletedAt']));
  expect(elapsed).toBeGreaterThanOrEqual(400);
  const sequence = await page.evaluate(() => {
    const receipt = (window as typeof window & {
      __SINGED_TERRA_T8__?: {
        terminalExplosionObservedAt?: number;
        impactCompletedAt?: number;
      };
    }).__SINGED_TERRA_T8__;
    const status = document.querySelector<HTMLElement>('.st-hud__terminal-payoff-status');
    return {
      explosion: receipt?.terminalExplosionObservedAt ?? Number.NaN,
      impactComplete: receipt?.impactCompletedAt ?? Number.NaN,
      reportReady: Number(status?.dataset['payoffReadyAt']),
    };
  });
  expect(sequence.explosion).toBeLessThan(sequence.impactComplete);
  expect(sequence.impactComplete).toBeLessThan(sequence.reportReady);
});

test('reduced motion preserves a readable nonzero post-impact beat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('?e2e=victory-payoff');
  await page.evaluate(() => document.getElementById('st-splash')?.remove());

  const payoff = page.locator('.st-hud__terminal-payoff-status');
  const report = page.locator('.st-hud__overlay--victory');
  await expect(report).toBeVisible();
  const elapsed = await payoff.evaluate((node: HTMLElement) =>
    Number(node.dataset['payoffReadyAt']) - Number(node.dataset['impactCompletedAt']));
  expect(elapsed).toBeGreaterThanOrEqual(100);
});
