import { expect, test, type Page } from '@playwright/test';
import {
  assertLobbyControlReachable,
  assertLobbyFrame,
  gotoLobby,
  openHotSeatCustomization,
} from './support';

async function chooseLocalBattle(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Local Battle', exact: true }).click();
}

async function choosePlayOnline(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play Online', exact: true }).click();
}

async function assertOperationsBoardFlow(page: Page, selector: string): Promise<void> {
  const geometry = await page.locator(selector).evaluate((board) => {
    const root = board.getBoundingClientRect();
    const header = board.querySelector<HTMLElement>(':scope > .lobby-operations-board__header');
    const sections = Array.from(board.querySelectorAll<HTMLElement>(
      ':scope > .lobby-operations-board__crew, :scope > .lobby-operations-board__section, :scope > .lobby-operations-board__mission, :scope > .lobby-operations-board__roster, :scope > .lobby-operations-board__actions',
    ));
    const primary = board.querySelector<HTMLElement>('.lobby-btn.primary');
    if (!header || sections.length === 0 || !primary) {
      throw new Error('Expected a board header, operational sections, and primary action');
    }
    const serialize = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    return {
      root: serialize(root),
      header: serialize(header.getBoundingClientRect()),
      sections: sections.map((section) => serialize(section.getBoundingClientRect())),
      primary: serialize(primary.getBoundingClientRect()),
    };
  });

  expect(geometry.header.height, 'operations-board heading must render').toBeGreaterThan(4);
  expect(geometry.header.bottom, 'heading must clear the first operational section')
    .toBeLessThanOrEqual(geometry.sections[0]!.top + 1);
  for (let index = 0; index < geometry.sections.length - 1; index += 1) {
    expect(
      geometry.sections[index]!.bottom,
      'each operational section must clear the section that follows it',
    ).toBeLessThanOrEqual(geometry.sections[index + 1]!.top + 1);
  }
  for (const rect of [...geometry.sections, geometry.primary]) {
    expect(rect.left, 'board content must stay within the board left edge').toBeGreaterThanOrEqual(geometry.root.left - 1);
    expect(rect.right, 'board content must stay within the board right edge').toBeLessThanOrEqual(geometry.root.right + 1);
  }
  expect(geometry.primary.width, 'primary action must retain a visible target').toBeGreaterThan(4);
  expect(geometry.primary.height, 'primary action must retain a visible target').toBeGreaterThan(4);
}

async function assertOperationRowsClear(page: Page, selector: string): Promise<void> {
  const rows = await page.locator(selector).evaluate((board) => Array.from(
    board.querySelectorAll<HTMLElement>('.online-player-row'),
    (row) => {
      const rect = row.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
    },
  ));
  expect(rows.length, 'browse fixture must render multiple operation rows').toBeGreaterThanOrEqual(2);
  for (let index = 0; index < rows.length - 1; index += 1) {
    expect(rows[index]!.height, 'operation row must retain visible height').toBeGreaterThan(4);
    expect(
      rows[index]!.bottom,
      'each operation row must clear the next row',
    ).toBeLessThanOrEqual(rows[index + 1]!.top + 1);
  }
}

async function assertMissionPreparation(
  page: Page,
  routeSelector: string,
  expectedLabels: readonly string[],
  primarySelector: string,
): Promise<void> {
  const geometry = await page.locator(routeSelector).evaluate((route, primarySelector) => {
    const root = route.getBoundingClientRect();
    const sections = Array.from(route.querySelectorAll<HTMLElement>(
      ':scope .lobby-preparation-section',
    ));
    const primary = document.querySelector<HTMLElement>(primarySelector);
    if (!primary || sections.length === 0) {
      throw new Error('Expected preparation sections and a deployment action');
    }
    const serialize = (element: HTMLElement, requireBody = false) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const body = element.querySelector<HTMLElement>('.lobby-preparation-section__body');
      if (requireBody && !body) throw new Error('Expected a preparation-section body');
      const bodyRect = body?.getBoundingClientRect();
      return {
        label: element.querySelector('.lobby-preparation-section__title')?.textContent,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        bodyHeight: bodyRect?.height ?? 0,
        borderLeft: style.borderLeftStyle,
        radius: style.borderRadius,
      };
    };
    return {
      root: { left: root.left, right: root.right },
      sections: sections.map((section) => serialize(section, true)),
      primary: serialize(primary),
    };
  }, primarySelector);

  expect(geometry.sections.map((section) => section.label)).toEqual(expectedLabels);
  for (const section of geometry.sections) {
    expect(section.height, `${section.label} must remain visible`).toBeGreaterThan(4);
    expect(section.bodyHeight, `${section.label} controls must remain visible`).toBeGreaterThan(4);
    expect(section.borderLeft, `${section.label} must use the command rule`).toBe('solid');
    expect(section.radius, `${section.label} must stay squared`).toBe('0px');
    expect(section.left, `${section.label} must stay inside the route`).toBeGreaterThanOrEqual(geometry.root.left - 1);
    expect(section.right, `${section.label} must stay inside the route`).toBeLessThanOrEqual(geometry.root.right + 1);
  }
  for (let index = 0; index < geometry.sections.length - 1; index += 1) {
    const current = geometry.sections[index]!;
    const next = geometry.sections[index + 1]!;
    const overlapHorizontally = current.left < next.right && current.right > next.left;
    if (!overlapHorizontally) continue;
    expect(
      current.bottom,
      `${current.label} must clear the next preparation section in its column`,
    ).toBeLessThanOrEqual(next.top + 1);
  }
  expect(geometry.primary.height, 'deployment action must remain visible').toBeGreaterThan(4);
}

async function assertOnlineSetupControlsStayWithinTheirSections(page: Page): Promise<void> {
  const geometry = await page.locator('#lobby .lobby-route-brief--online .lobby-route-brief__setup').evaluate((setup) => {
    const serialize = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    return Array.from(setup.querySelectorAll<HTMLElement>('.lobby-preparation-section')).map((section) => ({
      title: section.querySelector('.lobby-preparation-section__title')?.textContent ?? 'unnamed section',
      rect: serialize(section.getBoundingClientRect()),
      controls: Array.from(section.querySelectorAll<HTMLElement>('input, select, button')).map((control) => ({
        name: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName,
        mayHideWithGarage: control.closest('.lobby-garage') !== null,
        rect: serialize(control.getBoundingClientRect()),
      })),
    }));
  });

  for (const section of geometry) {
    for (const control of section.controls) {
      if (control.rect.width <= 4 || control.rect.height <= 4) {
        expect(
          control.mayHideWithGarage,
          `${section.title}: ${control.name} must not disappear`,
        ).toBe(true);
        continue;
      }
      expect(control.rect.width, `${section.title}: ${control.name} must remain visible`).toBeGreaterThan(4);
      expect(control.rect.height, `${section.title}: ${control.name} must remain visible`).toBeGreaterThan(4);
      expect(control.rect.left, `${section.title}: ${control.name} must not escape left`).toBeGreaterThanOrEqual(section.rect.left - 1);
      expect(control.rect.right, `${section.title}: ${control.name} must not escape right`).toBeLessThanOrEqual(section.rect.right + 1);
      expect(control.rect.top, `${section.title}: ${control.name} must not escape above`).toBeGreaterThanOrEqual(section.rect.top - 1);
      expect(control.rect.bottom, `${section.title}: ${control.name} must not escape below`).toBeLessThanOrEqual(section.rect.bottom + 1);
    }
  }
  for (let index = 0; index < geometry.length - 1; index += 1) {
    for (let nextIndex = index + 1; nextIndex < geometry.length; nextIndex += 1) {
      const current = geometry[index]!;
      const next = geometry[nextIndex]!;
      const overlap = current.rect.left < next.rect.right - 1
        && current.rect.right > next.rect.left + 1
        && current.rect.top < next.rect.bottom - 1
        && current.rect.bottom > next.rect.top + 1;
      expect(overlap, `${current.title} must not overlap ${next.title}`).toBe(false);
    }
  }
}

async function fulfillFunction(
  page: Page,
  name: string,
  body: unknown,
): Promise<{ count: () => number; urls: () => string[] }> {
  const capturedUrls: string[] = [];
  await page.route(`**/functions/v1/${name}`, async (route) => {
    capturedUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return {
    count: () => capturedUrls.length,
    urls: () => [...capturedUrls],
  };
}

async function assertSameOriginFunctionCall(
  page: Page,
  calls: { count: () => number; urls: () => string[] },
  name: string,
): Promise<void> {
  expect(calls.count()).toBe(1);
  const requestUrl = new URL(calls.urls()[0]!);
  expect(requestUrl.origin).toBe(new URL(page.url()).origin);
  expect(requestUrl.pathname).toBe(`/functions/v1/${name}`);
}

test.describe('Lobby layout guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLobby(page);
  });

  test('Hot Seat setup stays framed and its primary action is reachable', async ({ page }) => {
    await chooseLocalBattle(page);
    await expect(page.locator('.lobby-row')).toHaveCount(2);
    await expect(page.locator('.lobby-controls')).toContainText('Aim');

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-start');
  });

  test('mission preparation keeps Local Battery and Open Operation contained', async ({ page }) => {
    await chooseLocalBattle(page);
    await assertMissionPreparation(
      page,
      '#lobby .lobby-hotseat',
      ['Crew manifest', 'Battlefield protocol'],
      '#lobby .lobby-start',
    );
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

    await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
    await choosePlayOnline(page);
    await assertMissionPreparation(
      page,
      '#lobby .lobby-route-brief--online',
      ['Command vehicle', 'Operation profile', 'Battlefield protocol'],
      '#lobby .lobby-online-primary',
    );
    await assertOnlineSetupControlsStayWithinTheirSections(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
  });

  test('Operations Settings owns the lobby stage without exposing the base composition', async ({ page }) => {
    const lobby = page.locator('#lobby');
    const card = page.locator('#lobby .lobby-card');
    const masthead = page.locator('#lobby .lobby-deployment__masthead');
    const route = page.locator('#lobby .lobby-hotseat');
    const preview = page.locator('#lobby .lobby-preview');

    await openHotSeatCustomization(page);
    const before = await Promise.all([masthead.boundingBox(), route.boundingBox(), preview.boundingBox()]);
    for (const box of before) expect(box).not.toBeNull();
    await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
    const overlay = page.locator('#lobby .lobby-overlay');
    const surface = overlay.locator('.lobby-overlay__surface');
    const backdrop = overlay.locator('.lobby-overlay__backdrop');
    await expect(surface).toHaveAttribute('role', 'dialog');
    await expect(surface).toHaveAttribute('aria-label', 'Operations Settings');
    await expect(overlay).toHaveAttribute('data-overlay-presentation', 'stage-modal');
    await expect(overlay).toHaveClass(/lobby-overlay--operations/);
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
    const operationsWidth = await surface.evaluate((node) => ({
      compact: document.querySelector('#app')?.classList.contains('is-compact') ?? false,
      cssWidth: Number.parseFloat(getComputedStyle(node).width),
    }));
    if (!operationsWidth.compact) {
      expect(operationsWidth.cssWidth).toBeGreaterThanOrEqual(900);
      expect(operationsWidth.cssWidth).toBeLessThanOrEqual(1040);
    }
    const controlPalette = await surface.evaluate((dialog) => {
      const control = dialog.querySelector<HTMLInputElement>('input[type="number"]');
      if (!control) throw new Error('Expected an operations number input');
      const parse = (value: string) => value.match(/[\d.]+/g)?.map(Number) ?? [];
      const style = getComputedStyle(control);
      return { background: parse(style.backgroundColor), foreground: parse(style.color) };
    });
    expect(Math.max(...controlPalette.background.slice(0, 3))).toBeLessThanOrEqual(20);
    expect(Math.min(...controlPalette.foreground.slice(0, 3))).toBeGreaterThanOrEqual(180);

    const after = await Promise.all([masthead.boundingBox(), route.boundingBox(), preview.boundingBox()]);
    for (let index = 0; index < before.length; index += 1) {
      expect(after[index]!.x).toBeCloseTo(before[index]!.x, 1);
      expect(after[index]!.y).toBeCloseTo(before[index]!.y, 1);
      expect(after[index]!.height).toBeCloseTo(before[index]!.height, 1);
    }

    const layout = await surface.locator('.lobby-advanced-fields').evaluate((fields) => {
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x, y: box.y, width: box.width, height: box.height,
          right: box.right, bottom: box.bottom,
        };
      };
      return {
        compact: document.querySelector('#app')?.classList.contains('is-compact') ?? false,
        rows: Array.from(fields.querySelectorAll('.lobby-field')).map((field) => ({
          field: rect(field),
          label: rect(field.querySelector('label')!),
          control: {
            ...rect(field.querySelector('input, select')!),
            cssWidth: Number.parseFloat(getComputedStyle(field.querySelector('input, select')!).width),
          },
          hint: rect(field.querySelector('.lobby-hint')!),
        })),
      };
    });
    expect(layout.rows.length).toBeGreaterThan(1);
    for (const row of layout.rows) {
      for (const element of [row.label, row.control, row.hint]) {
        expect(element.x).toBeGreaterThanOrEqual(surfaceBox!.x - 1);
        expect(element.right).toBeLessThanOrEqual(surfaceBox!.x + surfaceBox!.width + 1);
      }
    }
    for (let index = 1; index < layout.rows.length; index += 1) {
      expect(layout.rows[index]!.field.y).toBeGreaterThanOrEqual(
        layout.rows[index - 1]!.field.bottom - 1,
      );
    }
    if (layout.compact) {
      for (const row of layout.rows) {
        expect(row.control.y).toBeGreaterThanOrEqual(row.label.bottom - 1);
        expect(row.hint.y).toBeGreaterThanOrEqual(row.control.bottom - 1);
        expect(row.control.x).toBeCloseTo(row.label.x, 1);
        expect(row.hint.x).toBeCloseTo(row.label.x, 1);
      }
    } else {
      const [first, ...rest] = layout.rows;
      for (const row of layout.rows) {
        expect(row.control.cssWidth).toBeLessThanOrEqual(340);
      }
      for (const row of rest) {
        expect(row.label.x).toBeCloseTo(first!.label.x, 1);
        expect(row.control.x).toBeCloseTo(first!.control.x, 1);
        expect(row.control.width).toBeCloseTo(first!.control.width, 1);
        expect(row.hint.x).toBeCloseTo(first!.hint.x, 1);
      }
    }

    await surface.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    const [scrolledSurfaceBox, lastRowBox] = await Promise.all([
      surface.boundingBox(),
      surface.locator('.lobby-advanced-fields .lobby-field').last().boundingBox(),
    ]);
    expect(scrolledSurfaceBox).not.toBeNull();
    expect(lastRowBox).not.toBeNull();
    expect(lastRowBox!.y).toBeGreaterThanOrEqual(scrolledSurfaceBox!.y - 1);
    expect(lastRowBox!.y + lastRowBox!.height).toBeLessThanOrEqual(
      scrolledSurfaceBox!.y + scrolledSurfaceBox!.height + 1,
    );

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Advanced settings', exact: true })).toBeFocused();
  });

  test('deployment choices identify their setup and restore predictable keyboard focus', async ({ page }) => {
    const chooser = page.getByRole('navigation', { name: 'Choose deployment', exact: true });
    const localBattle = chooser.getByRole('button', { name: 'Local Battle', exact: true });
    const playOnline = chooser.getByRole('button', { name: 'Play Online', exact: true });
    const panel = page.locator('#lobby [role="tabpanel"]');

    await expect(chooser).toBeVisible();
    await expect(localBattle).toBeVisible();
    await expect(playOnline).toBeVisible();

    await localBattle.click();
    await expect(page.locator('.lobby-mode-context')).toContainText(
      'Set your crew, then start a shared-screen match.',
    );
    await expect(panel).toHaveAttribute('aria-label', 'Hot Seat preparation');
    await expect(page.locator('.lobby-row')).toHaveCount(2);

    await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
    await expect(localBattle).toBeFocused();
    await playOnline.click();
    await expect(page.locator('.lobby-mode-context')).toContainText(
      'Create a room, join by code, or browse public games.',
    );
    await expect(panel).toHaveAttribute('aria-label', 'Play Online preparation');
    await expect(page.getByRole('heading', { name: 'Open operation', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Back to deployment choices', exact: true }).click();
    await expect(playOnline).toBeFocused();
  });

  test('Online Create stays framed and its primary action is reachable', async ({ page }) => {
    await choosePlayOnline(page);

    await expect(page.getByRole('heading', { name: 'Open operation', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create operation', exact: true })).toBeVisible();
    const alternatives = page.getByRole('navigation', { name: 'Other ways to play online', exact: true });
    await expect(alternatives).toBeVisible();
    await expect(alternatives.getByRole('button', { name: 'Join with a code', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse public rooms', exact: true })).toBeVisible();

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="join-code"]');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="browse"]');
  });

  test('Join by Code stays framed and its primary action is reachable', async ({ page }) => {
    await choosePlayOnline(page);
    await page.getByRole('button', { name: 'Join with a code', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Rally to a signal', exact: true })).toBeVisible();
    await expect(page.locator('.lobby-code-input')).toHaveAttribute('maxlength', '4');
    await expect(page.getByRole('button', { name: 'Join Room', exact: true })).toBeVisible();
    const alternatives = page.getByRole('navigation', { name: 'Other ways to play online', exact: true });
    await expect(alternatives.getByRole('button', { name: 'Create a room', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse public rooms', exact: true })).toBeVisible();

    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="create"]');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="browse"]');
  });

  test('Browse public rooms renders a reachable network fixture without leaving the frame', async ({ page }) => {
    const listRoomsCalls = await fulfillFunction(page, 'list_rooms', {
      rooms: [{
        roomId: 'room-browser-oracle',
        code: 'BROW',
        hostName: 'Atlas',
        playerCount: 1,
        maxPlayers: 4,
        rounds: 3,
        armsLevel: 2,
        botCount: 1,
        interestRate: 0.2,
        suddenDeathTurn: 15,
      }, {
        roomId: 'room-browser-vanguard',
        code: 'VANG',
        hostName: 'Vanguard',
        playerCount: 3,
        maxPlayers: 4,
        rounds: 1,
        armsLevel: 4,
        botCount: 0,
        interestRate: 0,
        suddenDeathTurn: null,
      }],
    });

    await choosePlayOnline(page);
    await page.getByRole('button', { name: 'Browse public rooms', exact: true }).click();

    const board = page.locator('#lobby .lobby-operations-board--browse');
    await expect(board.getByRole('heading', { name: 'Open operations', exact: true })).toBeVisible();
    await expect(board.locator('.lobby-operations-board__section')).toHaveAttribute(
      'aria-label',
      'Open operations',
    );
    const room = page.locator('.online-player-row').filter({ hasText: 'Atlas' });
    await expect(room).toContainText('Best of 3');
    await expect(room).toContainText('Arms Lv 2');
    await expect(room).toContainText('1 CPU');
    await expect(room).toContainText('Interest +20%');
    await expect(room).toContainText('Sudden death T15');
    expect(await board.evaluate((element) => getComputedStyle(element).borderLeftStyle)).toBe('solid');
    const joinRoom = room.getByRole('button', { name: 'Join (1/4)', exact: true });
    await expect(joinRoom).toBeEnabled();
    await expect(joinRoom).toHaveClass(/primary/);
    const alternatives = page.getByRole('navigation', { name: 'Other ways to play online', exact: true });
    await expect(alternatives.getByRole('button', { name: 'Create a room', exact: true })).toBeVisible();
    await expect(alternatives.getByRole('button', { name: 'Join with a code', exact: true })).toBeVisible();
    await assertSameOriginFunctionCall(page, listRoomsCalls, 'list_rooms');

    await assertOperationsBoardFlow(page, '#lobby .lobby-operations-board--browse');
    await assertOperationRowsClear(page, '#lobby .lobby-operations-board--browse');
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(page, '#lobby .online-player-row:first-child .lobby-btn');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="create"]');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="join-code"]');
  });

  test('Create operation renders a reachable waiting-room fixture without leaving the frame', async ({ page }) => {
    const createRoomCalls = await fulfillFunction(page, 'create_room', {
      roomId: 'room-wait-oracle',
      code: 'WAIT',
      playerId: 'player-host',
      token: ['fixture', 'seat', 'value'].join('-'),
      options: {
        maxPlayers: 4,
        maxWind: 10,
        gravity: 0.15,
        walls: 'open',
        rounds: 3,
        armsLevel: 2,
      },
      players: [
        { id: 'player-host', name: 'Oracle Host', color: '#e84d4d', ready: false },
        { id: 'cpu-1', name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'medium' },
      ],
    });

    await choosePlayOnline(page);
    await page.locator('#lobby .lobby-name').fill('Oracle Host');
    await page.getByRole('button', { name: 'Create operation', exact: true }).click();

    const board = page.locator('#lobby .lobby-operations-board--waiting');
    await expect(board.getByRole('heading', { name: 'Staging operation', exact: true })).toBeVisible();
    await expect(board.locator('.lobby-operations-board__mission')).toHaveAttribute(
      'aria-label',
      'Room access',
    );
    await expect(board.locator('.lobby-operations-board__roster')).toHaveAttribute(
      'aria-label',
      'Operation roster',
    );
    expect(await board.evaluate((element) => getComputedStyle(element).borderLeftStyle)).toBe('solid');
    await expect(page.getByText('Share this code:', { exact: true })).toBeVisible();
    await expect(page.locator('.online-code-char')).toHaveText(['W', 'A', 'I', 'T']);
    const roster = page.locator('.online-player-list');
    await expect(roster.getByText('Oracle Host', { exact: true })).toBeVisible();
    await expect(roster.getByText('CPU 1', { exact: true })).toBeVisible();
    await expect(page.getByText('0/1 human ready', { exact: false })).toContainText('1 CPU');
    await expect(page.getByText('0/1 human ready', { exact: false })).toContainText('waiting for players to join');
    const copyInvite = page.getByRole('button', { name: 'Copy invite link', exact: true });
    const readyUp = page.getByRole('button', { name: 'Ready Up', exact: true });
    await expect(copyInvite).toBeVisible();
    await expect(copyInvite).toHaveClass(/secondary/);
    await expect(readyUp).toBeEnabled();
    await expect(readyUp).toHaveClass(/primary/);
    await expect(page.getByRole('button', { name: 'Leave', exact: true })).toBeVisible();
    await assertSameOriginFunctionCall(page, createRoomCalls, 'create_room');

    await assertOperationsBoardFlow(page, '#lobby .lobby-operations-board--waiting');
    await assertLobbyFrame(page);
    await assertLobbyControlReachable(
      page,
      '#lobby .lobby-btn-row:last-child .lobby-btn:not(.secondary)',
    );
  });
});
