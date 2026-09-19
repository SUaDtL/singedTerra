import { expect, test, type Page } from '@playwright/test';
import {
  assertGoldSafeAction,
  assertLobbyControlReachable,
  assertLobbyFrame,
  assertPreparationFieldReachable,
  assertPreparationFrameGeometry,
  gotoLobby,
  openHotSeatCustomization,
  openLocalPreparation,
  openOnlinePreparation,
} from './support';

async function chooseLocalBattle(page: Page): Promise<void> {
  await openLocalPreparation(page);
}

async function choosePlayOnline(page: Page): Promise<void> {
  await openOnlinePreparation(page);
}

async function assertOperationsBoardFlow(page: Page, selector: string): Promise<void> {
  const geometry = await page.locator(selector).evaluate((board) => {
    const root = board.getBoundingClientRect();
    const frame = board.closest<HTMLElement>('[data-preparation-frame]');
    const header = board.querySelector<HTMLElement>('.lobby-operations-board__header');
    const sections = Array.from(board.querySelectorAll<HTMLElement>(
      '.lobby-operations-board__crew, .lobby-operations-board__section, '
      + '.lobby-operations-board__mission, .lobby-operations-board__roster',
    ));
    const dock = frame?.querySelector<HTMLElement>('.preparation-frame__dock');
    const primary = dock?.querySelector<HTMLElement>('.lobby-btn.primary');
    if (!frame || !header || sections.length === 0 || !dock || !primary) {
      throw new Error('Expected a board header, operational sections, and shared dock action');
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
      sections: sections.map((section) => ({
        ...serialize(section.getBoundingClientRect()),
        name: section.className,
      })),
      dock: serialize(dock.getBoundingClientRect()),
      primary: serialize(primary.getBoundingClientRect()),
    };
  });

  expect(geometry.header.height, 'operations-board heading must render').toBeGreaterThan(4);
  expect(geometry.header.bottom, 'heading must clear the first operational section')
    .toBeLessThanOrEqual(geometry.sections[0]!.top + 1);
  for (let index = 0; index < geometry.sections.length - 1; index += 1) {
    expect(
      geometry.sections[index]!.bottom,
      `${geometry.sections[index]!.name} must clear ${geometry.sections[index + 1]!.name}`,
    ).toBeLessThanOrEqual(geometry.sections[index + 1]!.top + 1);
  }
  for (const rect of geometry.sections) {
    expect(rect.left, 'board content must stay within the board left edge').toBeGreaterThanOrEqual(geometry.root.left - 1);
    expect(rect.right, 'board content must stay within the board right edge').toBeLessThanOrEqual(geometry.root.right + 1);
  }
  expect(geometry.primary.left, 'primary action must stay within the shared dock')
    .toBeGreaterThanOrEqual(geometry.dock.left - 1);
  expect(geometry.primary.right, 'primary action must stay within the shared dock')
    .toBeLessThanOrEqual(geometry.dock.right + 1);
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
      const bodyRange = document.createRange();
      if (body) bodyRange.selectNodeContents(body);
      const bodyRect = body && getComputedStyle(body).display === 'contents'
        ? bodyRange.getBoundingClientRect() : body?.getBoundingClientRect();
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

async function assertOwnedOnlineWorkspaceGeometry(page: Page): Promise<void> {
  const primary = page.locator(
    '[data-multiplayer-command-view="online"] .lobby-btn.primary:visible',
  );
  await expect(primary).toHaveCount(1);
  // Fractional full-screen transforms can trim a few device pixels from the
  // button's outer frame. The shared-dock geometry assertion below owns exact
  // containment; this check only guards practical viewport reachability.
  await expect(primary).toBeInViewport({ ratio: 0.94 });
  await assertGoldSafeAction(
    page,
    '[data-multiplayer-command-view="online"] .lobby-btn.primary:visible',
  );
  const geometry = await page.locator('[data-multiplayer-command-view="online"]').evaluate((owned) => {
    const workspace = owned.querySelector<HTMLElement>('.multiplayer-command__online-workspace');
    if (!workspace) throw new Error('Expected the owned Online workspace');
    const ownedRect = owned.getBoundingClientRect();
    const controls = Array.from(owned.querySelectorAll<HTMLElement>(
      'button, input, select, summary, a[href]',
    )).flatMap((control) => {
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden'
        || rect.width <= 0 || rect.height <= 0) return [];
      return [{
        name: control.getAttribute('aria-label') ?? control.textContent?.trim()
          ?? control.getAttribute('name') ?? control.tagName,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      }];
    });
    const primary = Array.from(owned.querySelectorAll<HTMLElement>('.lobby-btn.primary'))
      .filter((control) => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && rect.width > 0 && rect.height > 0;
      })
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return { width: rect.width, height: rect.height, name: control.textContent?.trim() ?? '' };
      });
    return {
      viewportHeight: innerHeight,
      owned: {
        left: ownedRect.left,
        right: ownedRect.right,
        clientWidth: owned.clientWidth,
        scrollWidth: owned.scrollWidth,
      },
      workspace: {
        clientWidth: workspace.clientWidth,
        scrollWidth: workspace.scrollWidth,
      },
      overflowing: Array.from(owned.querySelectorAll<HTMLElement>('*')).flatMap((element) => {
        if (element.scrollWidth <= element.clientWidth + 1) return [];
        return [{
          className: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }];
      }).slice(0, 12),
      controls,
      primary,
    };
  });

  expect(
    geometry.owned.scrollWidth,
    `Online owner must not overflow horizontally: ${JSON.stringify(geometry.overflowing)}`,
  )
    .toBeLessThanOrEqual(geometry.owned.clientWidth + 1);
  expect(geometry.workspace.scrollWidth, 'Online workspace must not overflow horizontally')
    .toBeLessThanOrEqual(geometry.workspace.clientWidth + 1);
  expect(geometry.controls.length, 'Online workspace must expose controls').toBeGreaterThan(0);
  for (const control of geometry.controls) {
    expect(control.width, `${control.name} must retain a 44px-wide target`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.name} must retain a 44px-high target`).toBeGreaterThanOrEqual(44);
    expect(control.left, `${control.name} must stay inside the Online owner`).toBeGreaterThanOrEqual(
      geometry.owned.left - 1,
    );
    expect(control.right, `${control.name} must stay inside the Online owner`).toBeLessThanOrEqual(
      geometry.owned.right + 1,
    );
  }
  expect(geometry.primary, 'the current Online route must own exactly one primary action')
    .toHaveLength(1);
  expect(geometry.primary[0]!.width, `${geometry.primary[0]!.name} must remain actionable`)
    .toBeGreaterThanOrEqual(44);
  const primaryMinimum = geometry.viewportHeight <= 320 ? 46 : 56;
  expect(
    geometry.primary[0]!.height,
    `${geometry.primary[0]!.name} must retain the adaptive enlarged primary target`,
  ).toBeGreaterThanOrEqual(primaryMinimum);
}

async function assertVehicleBayFactsReadable(page: Page): Promise<void> {
  const facts = await page.locator(
    '#lobby .multiplayer-command__online-workspace .lobby-preview__part',
  ).evaluateAll((parts) => parts.flatMap((part) => Array.from(
    part.querySelectorAll<HTMLElement>('span, strong'),
    (label) => ({
      text: label.textContent?.trim() ?? '',
      clientWidth: label.clientWidth,
      scrollWidth: label.scrollWidth,
    }),
  )));
  expect(facts.length, 'the Online vehicle bay should expose its four readable facts')
    .toBeGreaterThanOrEqual(8);
  for (const fact of facts) {
    expect(
      fact.scrollWidth,
      `Online vehicle fact "${fact.text}" must not be visually truncated`,
    ).toBeLessThanOrEqual(fact.clientWidth + 1);
  }
}

async function assertLocalBattlefieldFactsReadable(page: Page): Promise<void> {
  const geometry = await page.locator(
    '#lobby [data-multiplayer-command-view="local-battle"] .lobby-hotseat-battlefield',
  ).evaluate((battlefield) => {
    const labels = Array.from(battlefield.querySelectorAll<HTMLElement>('label')).map((label) => ({
      text: label.textContent?.trim() ?? '',
      clientWidth: label.clientWidth,
      scrollWidth: label.scrollWidth,
    }));
    const walls = battlefield.querySelector<HTMLSelectElement>('#lobby-hotseat-direct-walls');
    if (!walls) throw new Error('Expected the Local Walls field');
    const style = getComputedStyle(walls);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Expected a text measurement context');
    context.font = style.font;
    const selectedText = walls.selectedOptions[0]?.textContent?.trim() ?? '';
    const horizontalPadding = Number.parseFloat(style.paddingLeft)
      + Number.parseFloat(style.paddingRight);
    return {
      labels,
      selectedText,
      selectedTextWidth: context.measureText(selectedText).width,
      selectedContentWidth: walls.clientWidth - horizontalPadding - 28,
      clientWidth: battlefield.clientWidth,
      scrollWidth: battlefield.scrollWidth,
    };
  });

  expect(geometry.labels.map(({ text }) => text)).toEqual(['Rounds', 'Wind', 'Walls']);
  for (const label of geometry.labels) {
    expect(label.scrollWidth, `Local Battlefield label "${label.text}" must be complete`)
      .toBeLessThanOrEqual(label.clientWidth + 1);
  }
  expect(geometry.selectedText).toBe('Open — shots exit');
  expect(
    geometry.selectedTextWidth,
    `Local Walls value "${geometry.selectedText}" must fit its selected field`,
  ).toBeLessThanOrEqual(geometry.selectedContentWidth + 1);
  expect(geometry.scrollWidth, 'Local Battlefield fields must not overflow horizontally')
    .toBeLessThanOrEqual(geometry.clientWidth + 1);
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

async function assertExpectedFunctionCall(
  page: Page,
  calls: { count: () => number; urls: () => string[] },
  name: string,
): Promise<void> {
  expect(calls.count()).toBe(1);
  const requestUrl = new URL(calls.urls()[0]!);
  const configuredOrigin = process.env['E2E_EXPECTED_BACKEND_ORIGIN'];
  const expectedOrigin = configuredOrigin
    ? new URL(configuredOrigin).origin
    : new URL(page.url()).origin;
  expect(requestUrl.origin).toBe(expectedOrigin);
  expect(requestUrl.pathname).toBe(`/functions/v1/${name}`);
}

test('candidate verification denies unmocked external traffic', async ({ page }, testInfo) => {
  test.skip(process.env['E2E_DENY_EXTERNAL_NETWORK'] !== '1');
  test.skip(testInfo.project.name !== 'desktop-fine');
  const backendOrigin = process.env['E2E_EXPECTED_BACKEND_ORIGIN'];
  expect(backendOrigin, 'candidate mode must declare the compiled backend origin').toBeTruthy();
  await page.route(`${backendOrigin}/functions/v1/fulfilled_candidate_probe`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'fixture' });
  });
  const fulfilled = await page.goto(`${backendOrigin}/functions/v1/fulfilled_candidate_probe`);
  expect(fulfilled?.status(), 'route fixtures must run before the deny proxy').toBe(200);

  let blockedError = '';
  try {
    await page.goto('https://untrusted-candidate.invalid/unmocked_candidate_probe', {
      timeout: 5_000,
      waitUntil: 'commit',
    });
  } catch (error) {
    blockedError = error instanceof Error ? error.message : String(error);
  }
  expect(
    blockedError,
    'an unmocked external request must fail because the candidate proxy is unreachable',
  ).toContain('ERR_PROXY_CONNECTION_FAILED');
});

test.describe('Lobby layout guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLobby(page);
  });

  test('Local setup stays framed and its primary action is reachable', async ({ page }) => {
    await chooseLocalBattle(page);
    await expect(page.locator('.lobby-row')).toHaveCount(2);
    await expect(page.locator('[data-multiplayer-command-view="local-battle"]')).toBeVisible();

    await assertLobbyFrame(page);
    await assertLocalBattlefieldFactsReadable(page);
    await assertLobbyControlReachable(page, '#lobby .lobby-start');
    await assertGoldSafeAction(page, '#lobby .lobby-start');
  });

  test('Local Battlefield labels and selected Walls value reflow at review geometries', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'exact responsive geometry owner');
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 900, height: 520 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoLobby(page);
      await chooseLocalBattle(page);
      await assertLocalBattlefieldFactsReadable(page);
      await assertGoldSafeAction(page, '#lobby .lobby-start');
    }
  });

  test('mission preparation keeps Local Battery and Open Operation contained', async ({ page }) => {
    await chooseLocalBattle(page);
    await assertMissionPreparation(
      page,
      '#lobby .lobby-hotseat',
      ['Crew', 'Effective rules'],
      '#lobby .lobby-start',
    );
    await assertLobbyControlReachable(page, '#lobby .lobby-start');

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

  test('command items identify their setup and restore predictable keyboard focus', async ({ page }) => {
    const localBattle = page.locator(
      '.command-center__library-items button[data-command-item="local-battle"]',
    );
    const playOnline = page.locator(
      '.command-center__library-items button[data-command-item="online"]',
    );
    const localWorkspace = page.locator('[data-multiplayer-command-view="local-battle"]');

    await openLocalPreparation(page);
    await expect(localBattle).toHaveAttribute('aria-current', 'true');
    await expect(localWorkspace).toBeVisible();
    await expect(page.locator('.lobby-row')).toHaveCount(2);

    await openOnlinePreparation(page);
    await expect(page.locator('[data-multiplayer-command-view="online"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Open operation', exact: true })).toBeVisible();

    await openLocalPreparation(page);
    await expect(localBattle).toBeFocused();
    await expect(playOnline).toHaveAttribute('aria-current', 'false');
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
    await assertPreparationFrameGeometry(
      page,
      '[data-multiplayer-command-view="online"]',
    );
    await assertPreparationFieldReachable(
      page,
      '[data-multiplayer-command-view="online"]',
      '#lobby-create-visibility',
    );
    await assertLobbyControlReachable(page, '#lobby .lobby-online-primary');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="join-code"]');
    await assertLobbyControlReachable(page, '#lobby [data-online-route="browse"]');
  });

  test('T39 Online Create uses the shared frame without stretching its vehicle bay', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'large-display composition owner');
    for (const viewport of [
      { width: 2272, height: 1170 },
      { width: 3440, height: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoLobby(page);
      await choosePlayOnline(page);
      await assertPreparationFrameGeometry(
        page,
        '[data-multiplayer-command-view="online"]',
      );
      await assertPreparationFieldReachable(
        page,
        '[data-multiplayer-command-view="online"]',
        '#lobby-create-visibility',
      );
      const preview = await page.locator(
        '[data-multiplayer-command-view="online"] .preparation-frame__body-layout--online > .lobby-preview',
      ).evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      });
      expect(preview.height, `${viewport.width} vehicle bay must remain usefully bounded`)
        .toBeLessThanOrEqual(562);
      expect(preview.width / preview.height, `${viewport.width} vehicle bay aspect ratio`)
        .toBeGreaterThanOrEqual(1.35);
      await assertOwnedOnlineWorkspaceGeometry(page);
    }
  });

  test('T43 live resizing preserves Online edits, focus, and the mounted frame', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'resize continuity owner');
    await page.setViewportSize({ width: 3440, height: 1440 });
    await gotoLobby(page);
    await choosePlayOnline(page);

    const ownerSelector = '[data-multiplayer-command-view="online"]';
    const name = page.locator(`${ownerSelector} .lobby-name`);
    const visibility = page.locator(`${ownerSelector} #lobby-create-visibility`);
    await name.fill('Resize Sentinel');
    await visibility.selectOption('private');
    await visibility.focus();
    await page.locator(`${ownerSelector} [data-preparation-frame]`).evaluate((frame) => {
      (frame as HTMLElement).dataset.resizeProbe = 'mounted-before-resize';
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 844, height: 390 },
      { width: 3440, height: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(name).toHaveValue('Resize Sentinel');
      await expect(visibility).toHaveValue('private');
      await expect(visibility).toBeFocused();
      await expect(page.locator(`${ownerSelector} [data-preparation-frame]`))
        .toHaveAttribute('data-resize-probe', 'mounted-before-resize');
      await assertPreparationFrameGeometry(page, ownerSelector);
      await assertPreparationFieldReachable(
        page,
        ownerSelector,
        '#lobby-create-visibility',
      );
    }
  });

  test('Online Create and Join dock their sole action above the fold at review geometries', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine', 'exact responsive geometry owner');
    for (const viewport of [
      { width: 900, height: 520 },
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoLobby(page);
      await choosePlayOnline(page);
      await assertVehicleBayFactsReadable(page);
      await assertOwnedOnlineWorkspaceGeometry(page);

      await page.getByRole('button', { name: 'Join with a code', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Join Room', exact: true }))
        .toBeInViewport({ ratio: 0.95 });
      await assertOwnedOnlineWorkspaceGeometry(page);
    }
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
    await assertOwnedOnlineWorkspaceGeometry(page);
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
    await expect(joinRoom).toHaveClass(/secondary/);
    await expect(board.getByRole('button', { name: 'Refresh rooms', exact: true }))
      .toHaveClass(/primary/);
    const alternatives = page.getByRole('navigation', { name: 'Other ways to play online', exact: true });
    await expect(alternatives.getByRole('button', { name: 'Create a room', exact: true })).toBeVisible();
    await expect(alternatives.getByRole('button', { name: 'Join with a code', exact: true })).toBeVisible();
    await assertExpectedFunctionCall(page, listRoomsCalls, 'list_rooms');

    await assertOperationsBoardFlow(page, '#lobby .lobby-operations-board--browse');
    await assertOperationRowsClear(page, '#lobby .lobby-operations-board--browse');
    await assertLobbyFrame(page);
    await assertOwnedOnlineWorkspaceGeometry(page);
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
        commandProtocolVersion: 2,
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
    const readiness = board.locator('.lobby-operations-board__readiness');
    await expect(readiness).toContainText('1 CPU');
    await expect(readiness).toContainText('waiting for players to join');
    const copyInvite = page.getByRole('button', { name: 'Copy invite link', exact: true });
    const readyUp = page.getByRole('button', { name: 'Ready Up', exact: true });
    await expect(copyInvite).toBeVisible();
    await expect(copyInvite).toHaveClass(/secondary/);
    await expect(readyUp).toBeEnabled();
    await expect(readyUp).toHaveClass(/primary/);
    await expect(page.getByRole('button', { name: 'Leave', exact: true })).toBeVisible();
    await assertExpectedFunctionCall(page, createRoomCalls, 'create_room');

    await assertOperationsBoardFlow(page, '#lobby .lobby-operations-board--waiting');
    await assertLobbyFrame(page);
    await assertOwnedOnlineWorkspaceGeometry(page);
    await assertLobbyControlReachable(
      page,
      '#lobby .lobby-operations-board--waiting .preparation-frame__primary-action',
    );
    await assertLobbyControlReachable(
      page,
      '#lobby .lobby-operations-board--waiting .preparation-frame__dock-actions .lobby-btn.secondary',
    );

    // Preserve the projects' native viewports above; this is the published
    // 1440×900 clipping envelope that must use the shared body scroll.
    await page.setViewportSize({ width: 1440, height: 900 });
    const boardBody = board.locator('.preparation-frame__body');
    await boardBody.evaluate((element) => { element.scrollTop = 0; });
    await expect.poll(() => boardBody.evaluate((element) => element.scrollTop)).toBe(0);
    const boardOverflows = await boardBody.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 1,
    );
    if (boardOverflows) {
      await boardBody.hover();
      await page.mouse.wheel(0, 900);
      await expect.poll(() => boardBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    }
    const postWheel = await Promise.all([
      readyUp.boundingBox(),
      page.getByRole('button', { name: 'Leave', exact: true }).boundingBox(),
      board.boundingBox(),
    ]);
    for (const control of postWheel.slice(0, 2)) {
      expect(control).not.toBeNull();
      expect(control!.y).toBeGreaterThanOrEqual(postWheel[2]!.y - 1);
      expect(control!.y + control!.height).toBeLessThanOrEqual(postWheel[2]!.y + postWheel[2]!.height + 1);
    }
    const readyCalls = await fulfillFunction(page, 'ready_up', {
      started: false,
      players: [
        { id: 'player-host', name: 'Oracle Host', color: '#e84d4d', ready: true },
        { id: 'cpu-1', name: 'CPU 1', color: '#4d8ce8', ready: true, ai: 'medium' },
      ],
    });
    await readyUp.click();
    await assertExpectedFunctionCall(page, readyCalls, 'ready_up');
  });

  test('Online Join, populated Browse, and Waiting retain touch geometry in portrait', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-fine');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLobby(page);
    await fulfillFunction(page, 'list_rooms', {
      rooms: [{
        roomId: 'room-portrait-browse', code: 'PORT', hostName: 'Portrait Atlas',
        playerCount: 1, maxPlayers: 4, rounds: 3, armsLevel: 2,
        botCount: 1, interestRate: 0.2, suddenDeathTurn: 15,
      }],
    });
    await fulfillFunction(page, 'create_room', {
      roomId: 'room-portrait-wait', code: 'WAIT', playerId: 'portrait-host',
      token: ['portrait', 'seat', 'value'].join('-'),
      options: {
        maxPlayers: 4, maxWind: 10, gravity: 0.15, commandProtocolVersion: 2,
        walls: 'open', rounds: 3, armsLevel: 2,
      },
      players: [{
        id: 'portrait-host', name: 'Portrait Host', color: '#e84d4d', ready: false,
      }],
    });

    await choosePlayOnline(page);
    await assertVehicleBayFactsReadable(page);
    await page.getByRole('button', { name: 'Join with a code', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rally to a signal', exact: true })).toBeVisible();
    await assertOwnedOnlineWorkspaceGeometry(page);

    await page.getByRole('button', { name: 'Browse public rooms', exact: true }).click();
    await expect(page.getByText('Portrait Atlas', { exact: true })).toBeVisible();
    await assertOwnedOnlineWorkspaceGeometry(page);

    await page.getByRole('button', { name: 'Create a room', exact: true }).click();
    await page.locator('#lobby .lobby-name').fill('Portrait Host');
    await page.getByRole('button', { name: 'Create operation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Staging operation', exact: true })).toBeVisible();
    await assertOwnedOnlineWorkspaceGeometry(page);
  });
});
